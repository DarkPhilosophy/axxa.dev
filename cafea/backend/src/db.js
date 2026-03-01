import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.postgresUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function ensureSchema() {
  const schemaPath = path.join(process.cwd(), 'scripts/schema.postgres.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
}

export async function one(sql, ...args) {
  const res = await pool.query(toPgPlaceholders(sql), args);
  return res.rows[0] ?? null;
}

export async function many(sql, ...args) {
  const res = await pool.query(toPgPlaceholders(sql), args);
  return res.rows;
}

export async function run(sql, ...args) {
  const res = await pool.query(toPgPlaceholders(sql), args);
  return { changes: res.rowCount ?? 0 };
}

export async function closeDb() {
  await pool.end();
}
