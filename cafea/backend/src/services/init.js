import { hashPassword, ROLES } from '../auth.js';
import { config } from '../config.js';
import { many, one, run } from '../db.js';

export async function ensureBootstrapAdmin() {
  const existing = await one('SELECT id FROM users WHERE role = ?', ROLES.ADMIN);
  if (existing) return;
  if (!config.bootstrapAdminPassword) {
    console.warn('[cafea] ADMIN_PASSWORD missing; bootstrap admin skipped');
    return;
  }
  const passwordHash = await hashPassword(config.bootstrapAdminPassword);
  await run(
    'INSERT INTO users(email, password_hash, name, role, avatar_url, active) VALUES(?, ?, ?, ?, ?, 1)',
    config.bootstrapAdminEmail,
    passwordHash,
    config.bootstrapAdminName,
    ROLES.ADMIN,
    ''
  );
  console.log('[cafea] Bootstrap admin created');
}

export async function ensureUserColumns() {
  const cols = await many(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'`
  );
  const hasMax = cols.some((c) => String(c.column_name) === 'max_coffees');
  const hasNotify = cols.some((c) => String(c.column_name) === 'notify_enabled');
  if (!hasMax) {
    await run('ALTER TABLE users ADD COLUMN max_coffees INTEGER');
    console.log('[cafea] Added users.max_coffees');
  }
  if (!hasNotify) {
    await run('ALTER TABLE users ADD COLUMN notify_enabled BOOLEAN NOT NULL DEFAULT TRUE');
    console.log('[cafea] Added users.notify_enabled');
  }
}
