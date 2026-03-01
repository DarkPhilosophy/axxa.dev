import { Router } from 'express';
import { hashPassword, ROLES } from '../auth.js';
import { many, one, run } from '../db.js';
import { requireAdmin, requireAuth } from '../middleware.js';
import { broadcastDashboardUpdate } from '../realtime.js';
import { recordRuntimeError } from '../runtime-status.js';
import { notifyCoffeeConsumed, sendApprovalResultEmail, sendCoffeeTestEmail } from '../services/mailer.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

async function adjustCurrentStock(delta, updatedBy) {
  const n = Number(delta);
  if (!Number.isFinite(n) || n === 0) return;
  if (n > 0) {
    await run(
      'UPDATE stock_settings SET current_stock = current_stock + ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      n,
      updatedBy
    );
    return;
  }
  await run(
    'UPDATE stock_settings SET current_stock = GREATEST(0, current_stock - ?), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
    Math.abs(n),
    updatedBy
  );
}

adminRouter.post('/stock/init', async (req, res) => {
  const { initial_stock, current_stock, min_stock } = req.body || {};
  const initial = Number(initial_stock);
  const current = current_stock == null ? initial : Number(current_stock);
  const min = min_stock == null ? 20 : Number(min_stock);
  if (![initial, current, min].every(Number.isInteger) || initial < 0 || current < 0 || min < 0) {
    return res.status(400).json({ error: 'Invalid stock values' });
  }
  await run(
    'UPDATE stock_settings SET initial_stock = ?, current_stock = ?, min_stock = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
    initial,
    current,
    min,
    req.user.id
  );
  broadcastDashboardUpdate('stock.init', { actor_id: req.user.id });
  return res.json({ ok: true });
});

adminRouter.get('/users', async (_req, res) => {
  const users = await many('SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users ORDER BY created_at DESC');
  res.json({ users });
});

adminRouter.post('/users', async (req, res) => {
  const { email, password, name, role, avatar_url } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
  const effectiveRole = role || ROLES.USER;
  if (![ROLES.ADMIN, ROLES.USER].includes(effectiveRole)) return res.status(400).json({ error: 'Invalid role' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = await one('SELECT id FROM users WHERE email = ?', normalizedEmail);
  if (exists) return res.status(409).json({ error: 'Email already exists' });

  const passwordHash = await hashPassword(password);
  await run(
    'INSERT INTO users(email, password_hash, name, role, avatar_url, active) VALUES(?, ?, ?, ?, ?, TRUE)',
    normalizedEmail,
    passwordHash,
    String(name).trim(),
    effectiveRole,
    avatar_url || ''
  );
  res.json({ ok: true });
});

adminRouter.put('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, role, avatar_url, active, email, password, max_coffees, notify_enabled } = req.body || {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  if (role && ![ROLES.ADMIN, ROLES.USER].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const existing = await one('SELECT * FROM users WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const normalizedEmail = email == null ? existing.email : String(email).trim().toLowerCase();
  if (!normalizedEmail) return res.status(400).json({ error: 'email required' });
  const duplicate = await one('SELECT id FROM users WHERE email = ? AND id <> ?', normalizedEmail, id);
  if (duplicate) return res.status(409).json({ error: 'Email already exists' });

  const nextActive = active == null ? existing.active : Number(Boolean(active));
  const nextNotify = notify_enabled == null ? Number(existing.notify_enabled ?? 1) : Number(Boolean(notify_enabled));
  const nextName = name == null ? existing.name : String(name).trim();
  const nextMax = max_coffees == null || max_coffees === '' ? null : Number(max_coffees);
  if (nextMax != null && (!Number.isInteger(nextMax) || nextMax < 0)) {
    return res.status(400).json({ error: 'Invalid max_coffees' });
  }
  if (!nextName) return res.status(400).json({ error: 'name required' });

  if (password != null && String(password).trim()) {
    try {
      const passwordHash = await hashPassword(String(password));
      await run(
        'UPDATE users SET email = ?, password_hash = ?, name = ?, role = ?, avatar_url = ?, active = ?, max_coffees = ?, notify_enabled = ? WHERE id = ?',
        normalizedEmail,
        passwordHash,
        nextName,
        role ?? existing.role,
        avatar_url ?? existing.avatar_url,
        nextActive,
        nextMax,
        nextNotify,
        id
      );
      const updated = await one('SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users WHERE id = ?', id);
      res.json({ ok: true, user: updated });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to update password' });
    }
    return;
  }

  await run(
    'UPDATE users SET email = ?, name = ?, role = ?, avatar_url = ?, active = ?, max_coffees = ?, notify_enabled = ? WHERE id = ?',
    normalizedEmail,
    nextName,
    role ?? existing.role,
    avatar_url ?? existing.avatar_url,
    nextActive,
    nextMax,
    nextNotify,
    id
  );
  const updated = await one('SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users WHERE id = ?', id);
  res.json({ ok: true, user: updated });
});

adminRouter.post('/users/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const existing = await one('SELECT id, email, name FROM users WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  await run('UPDATE users SET active = TRUE WHERE id = ?', id);
  sendApprovalResultEmail({ to: existing.email, userName: existing.name, approved: true }).catch((err) => {
    recordRuntimeError('mail.approval_notification', err, { user_id: id });
    console.error('[mail] approval notification failed:', err?.message || err);
  });
  res.json({ ok: true });
});

adminRouter.get('/export.csv', async (_req, res) => {
  const rows = await many(
    `SELECT l.id, u.email, u.name, l.delta, l.consumed_at
     FROM coffee_logs l JOIN users u ON u.id = l.user_id
     ORDER BY l.consumed_at DESC`
  );

  const csv = [
    'id,email,name,delta,consumed_at',
    ...rows.map((r) => [r.id, r.email, r.name, r.delta, r.consumed_at].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cafea-report.csv"');
  res.send(csv);
});

adminRouter.delete('/history', async (req, res) => {
  const userId = req.query.user_id == null ? null : Number(req.query.user_id);
  if (userId != null && !Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user_id' });

  if (userId == null) {
    const agg = await one('SELECT COALESCE(SUM(delta), 0) AS sum_delta FROM coffee_logs');
  await run('DELETE FROM coffee_logs');
  await adjustCurrentStock(Number(agg?.sum_delta || 0), req.user.id);
  broadcastDashboardUpdate('history.delete_all', { actor_id: req.user.id });
  return res.json({ ok: true, deleted: 'all' });
  }

  const agg = await one('SELECT COALESCE(SUM(delta), 0) AS sum_delta FROM coffee_logs WHERE user_id = ?', userId);
  await run('DELETE FROM coffee_logs WHERE user_id = ?', userId);
  await adjustCurrentStock(Number(agg?.sum_delta || 0), req.user.id);
  broadcastDashboardUpdate('history.delete_user', { actor_id: req.user.id, user_id: userId });
  return res.json({ ok: true, deleted: `user:${userId}` });
});

adminRouter.delete('/history/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const existing = await one('SELECT delta FROM coffee_logs WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Log not found' });
  await run('DELETE FROM coffee_logs WHERE id = ?', id);
  await adjustCurrentStock(Number(existing.delta || 0), req.user.id);
  broadcastDashboardUpdate('history.delete_log', { actor_id: req.user.id, log_id: id });
  return res.json({ ok: true, deleted: `log:${id}` });
});

adminRouter.delete('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  if (id === req.user.id) return res.status(400).json({ error: 'Nu poți șterge propriul cont admin' });

  const existing = await one('SELECT id FROM users WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  await run('DELETE FROM coffee_logs WHERE user_id = ?', id);
  await run('DELETE FROM users WHERE id = ?', id);
  return res.json({ ok: true, deleted: `user:${id}` });
});

adminRouter.post('/consume/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const target = await one('SELECT id, active, max_coffees, name, email, avatar_url FROM users WHERE id = ?', id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!target.active) return res.status(400).json({ error: 'User pending approval' });
  const consumedRow = await one('SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?', id);
  const consumedCount = Number(consumedRow?.consumed_count || 0);
  const maxAllowed = target.max_coffees == null ? null : Number(target.max_coffees);
  if (Number.isInteger(maxAllowed) && maxAllowed >= 0 && consumedCount >= maxAllowed) {
    return res.status(409).json({ error: 'Limita maximă de cafele a fost atinsă pentru utilizator' });
  }

  const stock = await one('SELECT current_stock, min_stock FROM stock_settings WHERE id = 1');
  if (!stock || stock.current_stock <= 0) return res.status(409).json({ error: 'Stock epuizat' });

  await run(
    'UPDATE stock_settings SET current_stock = current_stock - 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND current_stock > 0',
    req.user.id
  );
  const next = await one('SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1');
  if (!next || next.current_stock >= stock.current_stock) return res.status(409).json({ error: 'Stock epuizat' });

  await run('INSERT INTO coffee_logs(user_id, delta) VALUES(?, 1)', id);
  const consumedAfterRow = await one('SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?', id);
  const consumedAfter = Number(consumedAfterRow?.consumed_count || 0);
  const consumedTotalRow = await one('SELECT COALESCE(SUM(delta), 0) AS consumed_total FROM coffee_logs');
  const consumedTotal = Number(consumedTotalRow?.consumed_total || 0);
  const expectedCurrent = Number(next.initial_stock || 0) - consumedTotal;
  const manualDelta = Number(next.current_stock || 0) - expectedCurrent;
  const actorRemaining = target.max_coffees == null ? null : Math.max(0, Number(target.max_coffees) - consumedAfter);
  const recipients = await many('SELECT email, name, notify_enabled FROM users WHERE active = TRUE');

  notifyCoffeeConsumed({
    actorName: target.name,
    actorEmail: target.email,
    actorAvatarUrl: target.avatar_url,
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
    recordRuntimeError('mail.admin_consume_notification', err, { target_user_id: id, actor_id: req.user.id });
    console.error('[mail] admin consume notification failed:', err?.message || err);
  });

  broadcastDashboardUpdate('admin.consume', { actor_id: req.user.id, user_id: id });
  return res.json({ ok: true, stock: { ...next, low: next.current_stock <= next.min_stock } });
});

adminRouter.get('/users/:id/stats', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const user = await one('SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const agg = await one(
    'SELECT COALESCE(SUM(delta),0) AS consumed_count, MAX(consumed_at) AS last_consumed_at FROM coffee_logs WHERE user_id = ?',
    id
  );
  const consumedCount = Number(agg?.consumed_count || 0);
  const maxCoffees = user.max_coffees == null ? null : Number(user.max_coffees);
  const remaining = maxCoffees == null ? null : Math.max(0, maxCoffees - consumedCount);
  const rows = await many('SELECT id, user_id, delta, consumed_at FROM coffee_logs WHERE user_id = ? ORDER BY consumed_at DESC, id DESC LIMIT 200', id);

  res.json({
    user,
    stats: {
      consumed_count: consumedCount,
      max_coffees: maxCoffees,
      remaining,
      last_consumed_at: agg?.last_consumed_at || null
    },
    rows
  });
});

adminRouter.put('/users/:id/max', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const { max_coffees } = req.body || {};
  const nextMax = max_coffees == null || max_coffees === '' ? null : Number(max_coffees);
  if (nextMax != null && (!Number.isInteger(nextMax) || nextMax < 0)) {
    return res.status(400).json({ error: 'Invalid max_coffees' });
  }
  const existing = await one('SELECT id FROM users WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  await run('UPDATE users SET max_coffees = ? WHERE id = ?', nextMax, id);
  return res.json({ ok: true });
});

adminRouter.post('/users/:id/history', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const { delta, consumed_at } = req.body || {};
    const nextDelta = delta == null ? 1 : Number(delta);
    if (!Number.isInteger(nextDelta) || nextDelta <= 0) return res.status(400).json({ error: 'Invalid delta' });

    const user = await one('SELECT id, max_coffees FROM users WHERE id = ?', id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const consumedRow = await one('SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?', id);
    const consumedCount = Number(consumedRow?.consumed_count || 0);
    const maxAllowed = user.max_coffees == null ? null : Number(user.max_coffees);
    if (Number.isInteger(maxAllowed) && maxAllowed >= 0 && (consumedCount + nextDelta) > maxAllowed) {
      return res.status(409).json({ error: 'Depășești limita maximă de cafele a utilizatorului' });
    }

    if (consumed_at) {
      await run('INSERT INTO coffee_logs(user_id, delta, consumed_at) VALUES(?, ?, ?)', id, nextDelta, String(consumed_at));
    } else {
      await run('INSERT INTO coffee_logs(user_id, delta) VALUES(?, ?)', id, nextDelta);
    }
    await adjustCurrentStock(-nextDelta, req.user.id);
    broadcastDashboardUpdate('history.add_user', { actor_id: req.user.id, user_id: id, delta: nextDelta });
    return res.json({ ok: true });
  } catch (err) {
    recordRuntimeError('admin.users.history_add', err, { actor_id: req.user?.id, user_id: req.params?.id });
    console.error('[admin/users/:id/history]', err?.message || err);
    return res.status(500).json({ error: 'Failed to add history' });
  }
});

adminRouter.put('/history/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const { consumed_at, delta } = req.body || {};
    const existing = await one('SELECT id, user_id, consumed_at, delta FROM coffee_logs WHERE id = ?', id);
    if (!existing) return res.status(404).json({ error: 'Log not found' });

    const nextDelta = delta == null ? existing.delta : Number(delta);
    if (!Number.isInteger(nextDelta) || nextDelta <= 0) return res.status(400).json({ error: 'Invalid delta' });
    const target = await one('SELECT id, max_coffees FROM users WHERE id = ?', Number(existing.user_id));
    if (!target) return res.status(404).json({ error: 'User not found' });
    const consumedRow = await one('SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?', Number(existing.user_id));
    const consumedCount = Number(consumedRow?.consumed_count || 0);
    const adjustedTotal = consumedCount - Number(existing.delta || 0) + Number(nextDelta);
    const maxAllowed = target.max_coffees == null ? null : Number(target.max_coffees);
    if (Number.isInteger(maxAllowed) && maxAllowed >= 0 && adjustedTotal > maxAllowed) {
      return res.status(409).json({ error: 'Depășești limita maximă de cafele a utilizatorului' });
    }
    const nextConsumedAt = consumed_at == null || consumed_at === '' ? existing.consumed_at : String(consumed_at);
    const deltaDiff = Number(nextDelta) - Number(existing.delta || 0);

    await run('UPDATE coffee_logs SET consumed_at = ?, delta = ? WHERE id = ?', nextConsumedAt, nextDelta, id);
    await adjustCurrentStock(-deltaDiff, req.user.id);
    broadcastDashboardUpdate('history.update_log', { actor_id: req.user.id, log_id: id });
    return res.json({ ok: true });
  } catch (err) {
    recordRuntimeError('admin.history.update', err, { actor_id: req.user?.id, log_id: req.params?.id });
    console.error('[admin/history/:id]', err?.message || err);
    return res.status(500).json({ error: 'Failed to update history' });
  }
});

adminRouter.post('/mail/test', async (req, res) => {
  try {
    const me = await one('SELECT id, email, name, avatar_url, max_coffees FROM users WHERE id = ?', req.user.id);
    if (!me) return res.status(404).json({ error: 'User not found' });
    const stock = await one('SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1');
    const consumedTotalRow = await one('SELECT COALESCE(SUM(delta), 0) AS consumed_total FROM coffee_logs');
    const consumedTotal = Number(consumedTotalRow?.consumed_total || 0);
    const expectedCurrent = Number(stock.initial_stock || 0) - consumedTotal;
    const manualDelta = Number(stock.current_stock || 0) - expectedCurrent;
    const meConsumedRow = await one('SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?', req.user.id);
    const meConsumed = Number(meConsumedRow?.consumed_count || 0);
    const meRemaining = me.max_coffees == null ? null : Math.max(0, Number(me.max_coffees) - meConsumed);

    await sendCoffeeTestEmail({
      to: me.email,
      actorName: me.name,
      actorEmail: me.email,
      actorAvatarUrl: me.avatar_url,
      consumedAt: stock.updated_at,
      stockInitial: stock.initial_stock,
      stockCurrent: stock.current_stock,
      stockMin: stock.min_stock,
      stockExpectedCurrent: expectedCurrent,
      stockManualDelta: manualDelta,
      actorConsumedCount: meConsumed,
      actorRemaining: meRemaining
    });

    return res.json({ ok: true });
  } catch (err) {
    recordRuntimeError('admin.mail.test', err, { actor_id: req.user?.id });
    return res.status(502).json({ error: `Mail test failed: ${err?.message || err}` });
  }
});
