import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from './migrate.js';
import { config } from './config.js';
import { pool, query } from './db.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import locationRoutes from './routes/locations.js';
import measurementRoutes from './routes/measurements.js';
import assessmentRoutes from './routes/assessments.js';
import mapRoutes from './routes/map.js';
import methodRoutes from './routes/methods.js';
import strategyRoutes from './routes/strategies.js';
import statsRoutes from './routes/stats.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  // OpenStreetMap блокує тайли без заголовка Referer (політика tile usage), тому не no-referrer
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(cors({ origin: config.corsOrigin.split(',') }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/health', async (_req, res) => {
  const db = await query('SELECT 1').then(() => 'ok').catch(() => 'down');
  res.json({ status: 'ok', db });
});

app.use('/api', authRoutes);              // /auth/login — без токена
app.use('/api', authenticate);           // усе нижче — лише для автентифікованих
app.use('/api', locationRoutes);
app.use('/api', measurementRoutes);
app.use('/api', assessmentRoutes);
app.use('/api', mapRoutes);
app.use('/api', methodRoutes);
app.use('/api', strategyRoutes);
app.use('/api', statsRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не знайдено' }));
app.use('/api', errorHandler);

// Продакшн: React-збірка роздається тим самим сервером (один сервіс на хостингу)
const clientDist = process.env.CLIENT_DIST;
if (clientDist && fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}
app.use(errorHandler);

async function ensureAdmin() {
  const { rows } = await query("SELECT 1 FROM users WHERE role='admin' LIMIT 1");
  if (rows.length) return;
  const hash = await bcrypt.hash(config.adminPassword, 10);
  await query("INSERT INTO users(email,full_name,password_hash,role) VALUES($1,'Адміністратор',$2,'admin') ON CONFLICT(email) DO NOTHING",
    [config.adminEmail, hash]);
  console.log(`Створено адміністратора ${config.adminEmail} — змініть пароль після першого входу`);
}

if (process.env.NODE_ENV !== 'test') {
  for (let i = 0; ; i++) {
    try { await migrate(); await ensureAdmin(); break; } catch (e) {
      if (i >= 20) throw e;
      console.log('Очікування PostgreSQL…', e.code || e.message); await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const server = app.listen(config.port, () => console.log(`API: http://localhost:${config.port}/api`));
  const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
