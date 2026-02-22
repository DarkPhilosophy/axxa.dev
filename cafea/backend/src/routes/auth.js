import { Router } from 'express';
import { hashPassword, signActionToken, signToken, verifyActionToken, verifyPassword } from '../auth.js';
import { many, one, run } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware.js';
import { sendApprovalResultEmail, sendRegistrationEmails } from '../services/mailer.js';

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
      avatar_url: user.avatar_url,
      notify_enabled: Number(user.notify_enabled ?? 1)
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

  const created = one('SELECT id, email, name, avatar_url, created_at FROM users WHERE email = ?', normalizedEmail);
  if (created) {
    const token = signActionToken({ uid: created.id });
    const approveUrl = `${config.appUrl.replace(/\/+$/, '')}/api/auth/registration-action?action=approve&token=${encodeURIComponent(token)}`;
    const rejectUrl = `${config.appUrl.replace(/\/+$/, '')}/api/auth/registration-action?action=reject&token=${encodeURIComponent(token)}`;
    const sourceIp = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const adminRows = many('SELECT email FROM users WHERE role = ? AND active = 1', 'admin');
    const adminEmails = Array.from(new Set([
      ...adminRows.map((r) => String(r.email || '').trim().toLowerCase()),
      String(config.bootstrapAdminEmail || '').trim().toLowerCase()
    ].filter(Boolean)));
    void (async () => {
      try {
        const mailResult = await sendRegistrationEmails({
          userName: created.name,
          userEmail: created.email,
          userAvatarUrl: created.avatar_url,
          registeredAt: created.created_at,
          registeredIp: sourceIp,
          adminEmail: config.bootstrapAdminEmail,
          adminEmails,
          approveUrl,
          rejectUrl
        });
        if (Array.isArray(mailResult?.errors) && mailResult.errors.length) {
          console.error('[mail] registration notification partial failure:', mailResult.errors.join(' | '));
        }
        if (Array.isArray(mailResult?.receipts) && mailResult.receipts.length) {
          const summary = mailResult.receipts
            .map((r) => `${r.kind}:${r.to}:${r.provider}:${r.id || '-'}`)
            .join(' | ');
          console.log('[mail] registration notification receipts:', summary);
        }
      } catch (err) {
        console.error('[mail] registration notification failed:', err?.message || err);
      }
    })();
  }

  return res.status(201).json({ ok: true, status: 'pending_approval' });
});

authRouter.get('/registration-action', (req, res) => {
  try {
    const action = String(req.query.action || '').toLowerCase();
    const token = String(req.query.token || '');
    if (!['approve', 'reject'].includes(action)) return res.status(400).send('Invalid action');
    if (!token) return res.status(400).send('Missing token');

    const payload = verifyActionToken(token);
    const id = Number(payload.uid);
    if (!Number.isInteger(id)) return res.status(400).send('Invalid token payload');

    const user = one('SELECT id, active, email, name FROM users WHERE id = ?', id);
    if (!user) return res.status(404).send('User not found');

    if (action === 'approve') {
      run('UPDATE users SET active = 1 WHERE id = ?', id);
      sendApprovalResultEmail({ to: user.email, userName: user.name, approved: true }).catch((err) => {
        console.error('[mail] approval notification failed:', err?.message || err);
      });
      return res.send('<h1>Cerere aprobata</h1><p>Utilizatorul este acum activ.</p>');
    }
    sendApprovalResultEmail({ to: user.email, userName: user.name, approved: false }).catch((err) => {
      console.error('[mail] rejection notification failed:', err?.message || err);
    });
    run('DELETE FROM coffee_logs WHERE user_id = ?', id);
    run('DELETE FROM users WHERE id = ?', id);
    return res.send('<h1>Cerere respinsa</h1><p>Utilizatorul a fost sters.</p>');
  } catch (err) {
    return res.status(400).send(`Invalid or expired token: ${err?.message || err}`);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.put('/profile', requireAuth, async (req, res) => {
  const { name, avatar_url, email, password, notify_enabled } = req.body || {};
  const nextName = String(name || '').trim();
  const nextAvatar = String(avatar_url || '').trim();
  const nextEmail = String(email || '').trim().toLowerCase();
  if (!nextName) return res.status(400).json({ error: 'name required' });
  if (!nextEmail) return res.status(400).json({ error: 'email required' });
  const duplicate = one('SELECT id FROM users WHERE email = ? AND id <> ?', nextEmail, req.user.id);
  if (duplicate) return res.status(409).json({ error: 'Email already exists' });

  const nextNotify = notify_enabled == null ? Number(req.user.notify_enabled ?? 1) : Number(Boolean(notify_enabled));
  const nextPassword = String(password || '').trim();
  if (nextPassword) {
    const passwordHash = await hashPassword(nextPassword);
    run(
      'UPDATE users SET name = ?, avatar_url = ?, email = ?, password_hash = ?, notify_enabled = ? WHERE id = ?',
      nextName,
      nextAvatar,
      nextEmail,
      passwordHash,
      nextNotify,
      req.user.id
    );
  } else {
    run('UPDATE users SET name = ?, avatar_url = ?, email = ?, notify_enabled = ? WHERE id = ?', nextName, nextAvatar, nextEmail, nextNotify, req.user.id);
  }
  const updated = one('SELECT id, email, name, role, avatar_url, active, notify_enabled FROM users WHERE id = ?', req.user.id);
  res.json({ ok: true, user: updated });
});
