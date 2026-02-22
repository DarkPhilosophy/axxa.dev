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
  if (me?.max_coffees != null && consumedCount >= Number(me.max_coffees)) {
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

  const recipients = many('SELECT email, name, notify_enabled FROM users WHERE active = 1');
  notifyCoffeeConsumed({
    actorName: req.user.name,
    actorEmail: req.user.email,
    recipients,
    stockCurrent: next.current_stock,
    stockInitial: next.initial_stock,
    stockMin: next.min_stock,
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
       WHERE l.user_id = ? ORDER BY l.consumed_at DESC LIMIT ?`,
      req.user.id,
      limit
    );
  } else {
    rows = many(
      `SELECT l.id, l.delta, l.consumed_at, u.id as user_id, u.name, u.email, u.avatar_url
       FROM coffee_logs l JOIN users u ON u.id = l.user_id
       ORDER BY l.consumed_at DESC LIMIT ?`,
      limit
    );
  }

  res.json({ rows });
});
