import { ensureSchema, one, run } from '../src/db.js';
import { hashPassword, ROLES } from '../src/auth.js';
import { config } from '../src/config.js';

ensureSchema();

const email = (process.env.ADMIN_EMAIL || config.bootstrapAdminEmail).trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || config.bootstrapAdminPassword;
const name = process.env.ADMIN_NAME || config.bootstrapAdminName;

if (!password) {
  console.error('ADMIN_PASSWORD is required');
  process.exit(1);
}

const exists = one('SELECT id FROM users WHERE email = ?', email);
if (exists) {
  console.log(`Admin ${email} already exists`);
  process.exit(0);
}

const passwordHash = await hashPassword(password);
run(
  'INSERT INTO users(email, password_hash, name, role, avatar_url, active) VALUES(?, ?, ?, ?, ?, 1)',
  email,
  passwordHash,
  name,
  ROLES.ADMIN,
  ''
);
console.log(`Admin ${email} created`);
