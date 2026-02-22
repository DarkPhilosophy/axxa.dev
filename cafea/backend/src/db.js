import fs from 'node:fs';
import path from 'node:path';
import Database from 'libsql';
import { config, resolvedDbUrl } from './config.js';

export const db = new Database(resolvedDbUrl, { authToken: config.dbToken });

export function ensureSchema() {
  const schemaPath = path.join(process.cwd(), 'src/sql/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
}

export function one(sql, ...args) {
  return db.prepare(sql).get(...args);
}

export function many(sql, ...args) {
  return db.prepare(sql).all(...args);
}

export function run(sql, ...args) {
  return db.prepare(sql).run(...args);
}
