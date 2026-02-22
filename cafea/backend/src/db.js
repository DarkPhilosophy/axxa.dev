import fs from 'node:fs';
import path from 'node:path';
import Database from 'libsql';
import { config, resolvedDbUrl } from './config.js';

let db = new Database(resolvedDbUrl, { authToken: config.dbToken });

function reconnect() {
  db = new Database(resolvedDbUrl, { authToken: config.dbToken });
}

function withRetry(fn) {
  try {
    return fn();
  } catch (err) {
    const message = String(err?.message || '');
    const isRetryable =
      message.includes('STREAM_EXPIRED') ||
      message.includes('invalid baton') ||
      message.includes('Received an invalid baton');
    if (!isRetryable) throw err;
    reconnect();
    return fn();
  }
}

export function ensureSchema() {
  const schemaPath = path.join(process.cwd(), 'src/sql/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  withRetry(() => db.exec(sql));
}

export function one(sql, ...args) {
  return withRetry(() => db.prepare(sql).get(...args));
}

export function many(sql, ...args) {
  return withRetry(() => db.prepare(sql).all(...args));
}

export function run(sql, ...args) {
  return withRetry(() => db.prepare(sql).run(...args));
}
