import { Router } from 'express';
import { hashPassword, ROLES } from '../auth.js';
import { many, one, run } from '../db.js';
import { requireAdmin, requireAuth } from '../middleware.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.post('/stock/init', (req, res) => {
  const { initial_stock, current_stock, min_stock } = req.body || {};
  const initial = Number(initial_stock);
  const current = current_stock == null ? initial : Number(current_stock);
  const min = min_stock == null ? 20 : Number(min_stock);
  if (![initial, current, min].every(Number.isInteger) || initial < 0 || current < 0 || min < 0) {
    return res.status(400).json({ error: 'Invalid stock values' });
  }
  run(
    'UPDATE stock_settings SET initial_stock = ?, current_stock = ?, min_stock = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
    initial,
    current,
    min,
    req.user.id
  );
  return res.json({ ok: true });
});

adminRouter.get('/users', (_req, res) => {
  const users = many('SELECT id, email, name, role, avatar_url, active, max_coffees, created_at FROM users ORDER BY created_at DESC');
  res.json({ users });
});

adminRouter.post('/users', async (req, res) => {
  const { email, password, name, role, avatar_url } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
  const effectiveRole = role || ROLES.USER;
  if (![ROLES.ADMIN, ROLES.USER].includes(effectiveRole)) return res.status(400).json({ error: 'Invalid role' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = one('SELECT id FROM users WHERE email = ?', normalizedEmail);
  if (exists) return res.status(409).json({ error: 'Email already exists' });

  const passwordHash = await hashPassword(password);
  run(
    'INSERT INTO users(email, password_hash, name, role, avatar_url, active) VALUES(?, ?, ?, ?, ?, 1)',
    normalizedEmail,
    passwordHash,
    String(name).trim(),
    effectiveRole,
    avatar_url || ''
  );
  res.json({ ok: true });
});

adminRouter.put('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, role, avatar_url, active, email, password, max_coffees } = req.body || {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  if (role && ![ROLES.ADMIN, ROLES.USER].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const existing = one('SELECT * FROM users WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const normalizedEmail = email == null ? existing.email : String(email).trim().toLowerCase();
  if (!normalizedEmail) return res.status(400).json({ error: 'email required' });
  const duplicate = one('SELECT id FROM users WHERE email = ? AND id <> ?', normalizedEmail, id);
  if (duplicate) return res.status(409).json({ error: 'Email already exists' });

  const nextActive = active == null ? existing.active : Number(Boolean(active));
  const nextName = name == null ? existing.name : String(name).trim();
  const nextMax = max_coffees == null || max_coffees === '' ? null : Number(max_coffees);
  if (nextMax != null && (!Number.isInteger(nextMax) || nextMax < 0)) {
    return res.status(400).json({ error: 'Invalid max_coffees' });
  }
  if (!nextName) return res.status(400).json({ error: 'name required' });

  if (password != null && String(password).trim()) {
    hashPassword(String(password)).then((passwordHash) => {
      run(
        'UPDATE users SET email = ?, password_hash = ?, name = ?, role = ?, avatar_url = ?, active = ?, max_coffees = ? WHERE id = ?',
        normalizedEmail,
        passwordHash,
        nextName,
        role ?? existing.role,
        avatar_url ?? existing.avatar_url,
        nextActive,
        nextMax,
        id
      );
      const updated = one('SELECT id, email, name, role, avatar_url, active, max_coffees, created_at FROM users WHERE id = ?', id);
      res.json({ ok: true, user: updated });
    }).catch((err) => {
      res.status(500).json({ error: err.message || 'Failed to update password' });
    });
    return;
  }

  run(
    'UPDATE users SET email = ?, name = ?, role = ?, avatar_url = ?, active = ?, max_coffees = ? WHERE id = ?',
    normalizedEmail,
    nextName,
    role ?? existing.role,
    avatar_url ?? existing.avatar_url,
    nextActive,
    nextMax,
    id
  );
  const updated = one('SELECT id, email, name, role, avatar_url, active, max_coffees, created_at FROM users WHERE id = ?', id);
  res.json({ ok: true, user: updated });
});

adminRouter.post('/users/:id/approve', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const existing = one('SELECT id FROM users WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  run('UPDATE users SET active = 1 WHERE id = ?', id);
  res.json({ ok: true });
});

adminRouter.get('/export.csv', (_req, res) => {
  const rows = many(
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

adminRouter.delete('/history', (req, res) => {
  const userId = req.query.user_id == null ? null : Number(req.query.user_id);
  if (userId != null && !Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user_id' });

  if (userId == null) {
    run('DELETE FROM coffee_logs');
    return res.json({ ok: true, deleted: 'all' });
  }

  run('DELETE FROM coffee_logs WHERE user_id = ?', userId);
  return res.json({ ok: true, deleted: `user:${userId}` });
});

adminRouter.delete('/history/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  run('DELETE FROM coffee_logs WHERE id = ?', id);
  return res.json({ ok: true, deleted: `log:${id}` });
});

adminRouter.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  if (id === req.user.id) return res.status(400).json({ error: 'Nu poți șterge propriul cont admin' });

  const existing = one('SELECT id FROM users WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  run('DELETE FROM coffee_logs WHERE user_id = ?', id);
  run('DELETE FROM users WHERE id = ?', id);
  return res.json({ ok: true, deleted: `user:${id}` });
});

adminRouter.post('/consume/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const target = one('SELECT id, active, max_coffees FROM users WHERE id = ?', id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!target.active) return res.status(400).json({ error: 'User pending approval' });
  const consumedRow = one('SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?', id);
  const consumedCount = Number(consumedRow?.consumed_count || 0);
  if (target.max_coffees != null && consumedCount >= Number(target.max_coffees)) {
    return res.status(409).json({ error: 'Limita maximă de cafele a fost atinsă pentru utilizator' });
  }

  const stock = one('SELECT current_stock, min_stock FROM stock_settings WHERE id = 1');
  if (!stock || stock.current_stock <= 0) return res.status(409).json({ error: 'Stock epuizat' });

  run(
    'UPDATE stock_settings SET current_stock = current_stock - 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND current_stock > 0',
    req.user.id
  );
  const next = one('SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1');
  if (!next || next.current_stock >= stock.current_stock) return res.status(409).json({ error: 'Stock epuizat' });

  run('INSERT INTO coffee_logs(user_id, delta) VALUES(?, 1)', id);
  return res.json({ ok: true, stock: { ...next, low: next.current_stock <= next.min_stock } });
});

adminRouter.get('/users/:id/stats', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const user = one('SELECT id, email, name, role, avatar_url, active, max_coffees, created_at FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const agg = one(
    'SELECT COALESCE(SUM(delta),0) AS consumed_count, MAX(consumed_at) AS last_consumed_at FROM coffee_logs WHERE user_id = ?',
    id
  );
  const consumedCount = Number(agg?.consumed_count || 0);
  const maxCoffees = user.max_coffees == null ? null : Number(user.max_coffees);
  const remaining = maxCoffees == null ? null : Math.max(0, maxCoffees - consumedCount);
  const rows = many('SELECT id, user_id, delta, consumed_at FROM coffee_logs WHERE user_id = ? ORDER BY consumed_at DESC LIMIT 200', id);

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

adminRouter.put('/users/:id/max', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const { max_coffees } = req.body || {};
  const nextMax = max_coffees == null || max_coffees === '' ? null : Number(max_coffees);
  if (nextMax != null && (!Number.isInteger(nextMax) || nextMax < 0)) {
    return res.status(400).json({ error: 'Invalid max_coffees' });
  }
  const existing = one('SELECT id FROM users WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  run('UPDATE users SET max_coffees = ? WHERE id = ?', nextMax, id);
  return res.json({ ok: true });
});

adminRouter.post('/users/:id/history', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const { delta, consumed_at } = req.body || {};
  const nextDelta = delta == null ? 1 : Number(delta);
  if (!Number.isInteger(nextDelta) || nextDelta <= 0) return res.status(400).json({ error: 'Invalid delta' });

  const user = one('SELECT id FROM users WHERE id = ?', id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (consumed_at) {
    run('INSERT INTO coffee_logs(user_id, delta, consumed_at) VALUES(?, ?, ?)', id, nextDelta, String(consumed_at));
  } else {
    run('INSERT INTO coffee_logs(user_id, delta) VALUES(?, ?)', id, nextDelta);
  }
  return res.json({ ok: true });
});

adminRouter.put('/history/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const { consumed_at, delta } = req.body || {};
  const existing = one('SELECT id, consumed_at, delta FROM coffee_logs WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Log not found' });

  const nextDelta = delta == null ? existing.delta : Number(delta);
  if (!Number.isInteger(nextDelta) || nextDelta <= 0) return res.status(400).json({ error: 'Invalid delta' });
  const nextConsumedAt = consumed_at == null || consumed_at === '' ? existing.consumed_at : String(consumed_at);

  run('UPDATE coffee_logs SET consumed_at = ?, delta = ? WHERE id = ?', nextConsumedAt, nextDelta, id);
  return res.json({ ok: true });
});
