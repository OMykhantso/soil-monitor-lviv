import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { asyncH, HttpError } from '../lib/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const r = Router();

r.post('/auth/login', asyncH(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE lower(email)=lower($1) AND is_active', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Невірний email або пароль');
  const token = jwt.sign({ id: u.id, email: u.email, role: u.role, name: u.full_name }, config.jwtSecret, { expiresIn: config.jwtTtl });
  res.json({ token, user: { id: u.id, email: u.email, role: u.role, full_name: u.full_name } });
}));

r.get('/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

// Керування користувачами — лише адміністратор
const userSchema = z.object({
  email: z.string().email(),
  full_name: z.string().max(200).optional().nullable(),
  password: z.string().min(8, 'Мінімум 8 символів'),
  role: z.enum(['admin', 'specialist', 'viewer']),
});

r.get('/users', authenticate, requireRole('admin'), asyncH(async (_req, res) => {
  const { rows } = await query('SELECT id,email,full_name,role,is_active,created_at FROM users ORDER BY id');
  res.json(rows);
}));

r.post('/users', authenticate, requireRole('admin'), asyncH(async (req, res) => {
  const d = userSchema.parse(req.body);
  const hash = await bcrypt.hash(d.password, 10);
  const { rows } = await query(
    'INSERT INTO users(email,full_name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,full_name,role,is_active,created_at',
    [d.email, d.full_name || null, hash, d.role]);
  res.status(201).json(rows[0]);
}));

r.patch('/users/:id', authenticate, requireRole('admin'), asyncH(async (req, res) => {
  const d = z.object({ role: z.enum(['admin', 'specialist', 'viewer']).optional(), is_active: z.boolean().optional(),
    password: z.string().min(8).optional() }).parse(req.body);
  const id = Number(req.params.id);
  if (id === req.user.id && (d.is_active === false || (d.role && d.role !== 'admin')))
    throw new HttpError(400, 'Не можна позбавити прав власний обліковий запис');
  const hash = d.password ? await bcrypt.hash(d.password, 10) : null;
  const { rows } = await query(
    `UPDATE users SET role=COALESCE($2,role), is_active=COALESCE($3,is_active), password_hash=COALESCE($4,password_hash)
     WHERE id=$1 RETURNING id,email,full_name,role,is_active,created_at`, [id, d.role ?? null, d.is_active ?? null, hash]);
  if (!rows[0]) throw new HttpError(404, 'Користувача не знайдено');
  res.json(rows[0]);
}));

export default r;
