import { verifyToken, ROLES } from './auth.js';
import { one } from './db.js';

export function requireAuth(req, res, next) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = verifyToken(token);
    const user = one('SELECT id, email, name, role, avatar_url, active, notify_enabled FROM users WHERE id = ?', payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid user' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

export const requireAdmin = requireRole(ROLES.ADMIN);
