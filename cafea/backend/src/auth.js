import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user'
};

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function signActionToken(payload, expiresIn = '48h') {
  return jwt.sign({ ...payload, typ: 'registration_action' }, config.jwtSecret, { expiresIn });
}

export function verifyActionToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (decoded?.typ !== 'registration_action') throw new Error('Invalid action token');
  return decoded;
}
