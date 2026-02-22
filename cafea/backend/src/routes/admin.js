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
  const users = many('SELECT id, email, name, role, avatar_url, active, created_at FROM users ORDER BY created_at DESC');
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
  const { name, role, avatar_url, active, email, password } = req.body || {};
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
  if (!nextName) return res.status(400).json({ error: 'name required' });

  if (password != null && String(password).trim()) {
    hashPassword(String(password)).then((passwordHash) => {
      run(
        'UPDATE users SET email = ?, password_hash = ?, name = ?, role = ?, avatar_url = ?, active = ? WHERE id = ?',
        normalizedEmail,
        passwordHash,
        nextName,
        role ?? existing.role,
        avatar_url ?? existing.avatar_url,
        nextActive,
        id
      );
      const updated = one('SELECT id, email, name, role, avatar_url, active, created_at FROM users WHERE id = ?', id);
      res.json({ ok: true, user: updated });
    }).catch((err) => {
      res.status(500).json({ error: err.message || 'Failed to update password' });
    });
    return;
  }

  run(
    'UPDATE users SET email = ?, name = ?, role = ?, avatar_url = ?, active = ? WHERE id = ?',
    normalizedEmail,
    nextName,
    role ?? existing.role,
    avatar_url ?? existing.avatar_url,
    nextActive,
    id
  );
  const updated = one('SELECT id, email, name, role, avatar_url, active, created_at FROM users WHERE id = ?', id);
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
