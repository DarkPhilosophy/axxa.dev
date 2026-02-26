import { Router } from 'express';
import { many, one, run } from '../db.js';
import { requireAuth } from '../middleware.js';
import { notifyCoffeeConsumed } from '../services/mailer.js';

export const coffeeRouter = Router();
coffeeRouter.use(requireAuth);

coffeeRouter.get('/status', (req, res) => {
  const stock = one('SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1');
  const consumed = one('SELECT COALESCE(SUM(delta), 0) AS consumed_total FROM coffee_logs');
  const consumedTotal = Number(consumed?.consumed_total || 0);
  const expectedCurrent = Number(stock.initial_stock || 0) - consumedTotal;
  const manualDelta = Number(stock.current_stock || 0) - expectedCurrent;
  const low = stock.current_stock <= stock.min_stock;
  res.json({
    stock: {
      ...stock,
      low,
      consumed_total: consumedTotal,
      expected_current: expectedCurrent,
      manual_delta: manualDelta
    },
    user: req.user
  });
});

coffeeRouter.post('/consume', (req, res) => {
  const me = one('SELECT id, max_coffees FROM users WHERE id = ?', req.user.id);
  const consumedRow = one('SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?', req.user.id);
  const consumedCount = Number(consumedRow?.consumed_count || 0);
  const maxAllowed = me?.max_coffees == null ? null : Number(me.max_coffees);
  if (Number.isInteger(maxAllowed) && maxAllowed >= 0 && consumedCount >= maxAllowed) {
    return res.status(409).json({ error: 'Ai atins limita maximă de cafele' });
  }

  const stock = one('SELECT current_stock FROM stock_settings WHERE id = 1');
  if (!stock || stock.current_stock <= 0) return res.status(409).json({ error: 'Stock epuizat' });

  run(
    'UPDATE stock_settings SET current_stock = current_stock - 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND current_stock > 0',
    req.user.id
  );

  const next = one('SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1');
  if (!next || next.current_stock >= stock.current_stock) return res.status(409).json({ error: 'Stock epuizat' });
  run('INSERT INTO coffee_logs(user_id, delta) VALUES(?, 1)', req.user.id);
  const consumedAfterRow = one('SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?', req.user.id);
  const consumedAfter = Number(consumedAfterRow?.consumed_count || 0);
  const consumedTotalRow = one('SELECT COALESCE(SUM(delta), 0) AS consumed_total FROM coffee_logs');
  const consumedTotal = Number(consumedTotalRow?.consumed_total || 0);
  const expectedCurrent = Number(next.initial_stock || 0) - consumedTotal;
  const manualDelta = Number(next.current_stock || 0) - expectedCurrent;
  const actorRemaining = me?.max_coffees == null ? null : Math.max(0, Number(me.max_coffees) - consumedAfter);

  const recipients = many('SELECT email, name, notify_enabled FROM users WHERE active = 1');
  notifyCoffeeConsumed({
    actorName: req.user.name,
    actorEmail: req.user.email,
    actorAvatarUrl: req.user.avatar_url,
    recipients,
    stockCurrent: next.current_stock,
    stockInitial: next.initial_stock,
    stockMin: next.min_stock,
    stockExpectedCurrent: expectedCurrent,
    stockManualDelta: manualDelta,
    actorConsumedCount: consumedAfter,
    actorRemaining,
    consumedAt: next.updated_at
  }).catch((err) => {
    console.error('[mail] consume notification failed:', err?.message || err);
  });

  res.json({ ok: true, stock: { ...next, low: next.current_stock <= next.min_stock } });
});

coffeeRouter.get('/history', (req, res) => {
  const mine = String(req.query.mine || '1') !== '0';
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));

  let rows;
  if (mine || req.user.role !== 'admin') {
    rows = many(
      `SELECT l.id, l.delta, l.consumed_at, u.id as user_id, u.name, u.email, u.avatar_url
       FROM coffee_logs l JOIN users u ON u.id = l.user_id
       WHERE l.user_id = ? ORDER BY datetime(l.consumed_at) DESC, l.id DESC LIMIT ?`,
      req.user.id,
      limit
    );
  } else {
    rows = many(
      `SELECT l.id, l.delta, l.consumed_at, u.id as user_id, u.name, u.email, u.avatar_url
       FROM coffee_logs l JOIN users u ON u.id = l.user_id
       ORDER BY datetime(l.consumed_at) DESC, l.id DESC LIMIT ?`,
      limit
    );
  }

  res.json({ rows });
});

coffeeRouter.get('/snapshot', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  const selectedRequested = req.query.selected_user_id == null ? null : Number(req.query.selected_user_id);

  const stock = one('SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1');
  const consumed = one('SELECT COALESCE(SUM(delta), 0) AS consumed_total FROM coffee_logs');
  const consumedTotal = Number(consumed?.consumed_total || 0);
  const expectedCurrent = Number(stock.initial_stock || 0) - consumedTotal;
  const manualDelta = Number(stock.current_stock || 0) - expectedCurrent;
  const low = stock.current_stock <= stock.min_stock;

  let rows;
  if (isAdmin) {
    rows = many(
      `SELECT l.id, l.delta, l.consumed_at, u.id as user_id, u.name, u.email, u.avatar_url
       FROM coffee_logs l JOIN users u ON u.id = l.user_id
       ORDER BY datetime(l.consumed_at) DESC, l.id DESC LIMIT ?`,
      limit
    );
  } else {
    rows = many(
      `SELECT l.id, l.delta, l.consumed_at, u.id as user_id, u.name, u.email, u.avatar_url
       FROM coffee_logs l JOIN users u ON u.id = l.user_id
       WHERE l.user_id = ? ORDER BY datetime(l.consumed_at) DESC, l.id DESC LIMIT ?`,
      req.user.id,
      limit
    );
  }

  let users = [];
  let selectedUserId = null;
  let selectedUserStats = null;
  let selectedUserHistory = [];
  let userConsumption = {};

  if (isAdmin) {
    users = many('SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users ORDER BY created_at DESC');
    const aggregate = many(
      `SELECT u.id AS user_id, COALESCE(SUM(l.delta),0) AS consumed_count
       FROM users u
       LEFT JOIN coffee_logs l ON l.user_id = u.id
       GROUP BY u.id`
    );
    userConsumption = Object.fromEntries(
      aggregate.map((a) => {
        const user = users.find((u) => Number(u.id) === Number(a.user_id));
        const consumedCount = Number(a?.consumed_count || 0);
        const maxCoffees = user?.max_coffees == null ? null : Number(user.max_coffees);
        const remaining = maxCoffees == null ? null : Math.max(0, maxCoffees - consumedCount);
        return [String(a.user_id), { consumed_count: consumedCount, remaining }];
      })
    );
    const selectedExists = Number.isInteger(selectedRequested) && users.some((u) => Number(u.id) === Number(selectedRequested));
    selectedUserId = selectedExists ? Number(selectedRequested) : (users[0] ? Number(users[0].id) : null);

    if (selectedUserId != null) {
      const user = one('SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users WHERE id = ?', selectedUserId);
      if (user) {
        const agg = one(
          'SELECT COALESCE(SUM(delta),0) AS consumed_count, MAX(consumed_at) AS last_consumed_at FROM coffee_logs WHERE user_id = ?',
          selectedUserId
        );
        const consumedCount = Number(agg?.consumed_count || 0);
        const maxCoffees = user.max_coffees == null ? null : Number(user.max_coffees);
        const remaining = maxCoffees == null ? null : Math.max(0, maxCoffees - consumedCount);
        selectedUserStats = {
          consumed_count: consumedCount,
          max_coffees: maxCoffees,
          remaining,
          last_consumed_at: agg?.last_consumed_at || null
        };
        selectedUserHistory = many(
          'SELECT id, user_id, delta, consumed_at FROM coffee_logs WHERE user_id = ? ORDER BY datetime(consumed_at) DESC, id DESC LIMIT 200',
          selectedUserId
        );
      }
    }
  }

  res.json({
    stock: {
      ...stock,
      low,
      consumed_total: consumedTotal,
      expected_current: expectedCurrent,
      manual_delta: manualDelta
    },
    user: req.user,
    rows,
    users,
    user_consumption: userConsumption,
    selected_user_id: selectedUserId,
    selected_user_stats: selectedUserStats,
    selected_user_history: selectedUserHistory
  });
});
