import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';

export function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Потрібна автентифікація'));
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, 'Сесія недійсна або завершилась'));
  }
}

// admin ⊃ specialist ⊃ viewer
const LEVEL = { viewer: 1, specialist: 2, admin: 3 };
export const requireRole = (role) => (req, _res, next) =>
  LEVEL[req.user?.role] >= LEVEL[role] ? next() : next(new HttpError(403, 'Недостатньо прав для цієї дії'));
