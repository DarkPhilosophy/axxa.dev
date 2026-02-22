import { Router } from 'express';
import { hashPassword, signToken, verifyPassword } from '../auth.js';
import { one, run } from '../db.js';
import { requireAuth } from '../middleware.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = one('SELECT * FROM users WHERE email = ?', String(email).trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.active) return res.status(403).json({ error: 'Account pending approval' });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar_url: user.avatar_url
    }
  });
});

authRouter.post('/register', async (req, res) => {
  const { email, password, name, avatar_url } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = one('SELECT id FROM users WHERE email = ?', normalizedEmail);
  if (exists) return res.status(409).json({ error: 'Email already exists' });

  const passwordHash = await hashPassword(password);
  run(
    'INSERT INTO users(email, password_hash, name, role, avatar_url, active) VALUES(?, ?, ?, ?, ?, 0)',
    normalizedEmail,
    passwordHash,
    String(name).trim(),
    'user',
    avatar_url || ''
  );

  return res.status(201).json({ ok: true, status: 'pending_approval' });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.put('/profile', requireAuth, (req, res) => {
  const { name, avatar_url, email } = req.body || {};
  const nextName = String(name || '').trim();
  const nextAvatar = String(avatar_url || '').trim();
  const nextEmail = String(email || '').trim().toLowerCase();
  if (!nextName) return res.status(400).json({ error: 'name required' });
  if (!nextEmail) return res.status(400).json({ error: 'email required' });
  const duplicate = one('SELECT id FROM users WHERE email = ? AND id <> ?', nextEmail, req.user.id);
  if (duplicate) return res.status(409).json({ error: 'Email already exists' });

  run('UPDATE users SET name = ?, avatar_url = ?, email = ? WHERE id = ?', nextName, nextAvatar, nextEmail, req.user.id);
  const updated = one('SELECT id, email, name, role, avatar_url, active FROM users WHERE id = ?', req.user.id);
  res.json({ ok: true, user: updated });
});
