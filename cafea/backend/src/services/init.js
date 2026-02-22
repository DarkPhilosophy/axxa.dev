import { hashPassword, ROLES } from '../auth.js';
import { config } from '../config.js';
import { one, run } from '../db.js';

export async function ensureBootstrapAdmin() {
  const existing = one('SELECT id FROM users WHERE role = ?', ROLES.ADMIN);
  if (existing) return;
  if (!config.bootstrapAdminPassword) {
    console.warn('[cafea] ADMIN_PASSWORD missing; bootstrap admin skipped');
    return;
  }
  const passwordHash = await hashPassword(config.bootstrapAdminPassword);
  run(
    'INSERT INTO users(email, password_hash, name, role, avatar_url, active) VALUES(?, ?, ?, ?, ?, 1)',
    config.bootstrapAdminEmail,
    passwordHash,
    config.bootstrapAdminName,
    ROLES.ADMIN,
    ''
  );
  console.log('[cafea] Bootstrap admin created');
}
