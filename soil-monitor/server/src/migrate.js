// Автоматичні міграції: виконує SQL-файли з db/ по порядку один раз.
// Потрібно для хостингів (Render, Neon тощо), де немає docker-entrypoint-initdb.d.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.DB_DIR || path.resolve(here, '../../db');
export const MIGRATIONS = ['01_schema.sql', '02_methods_and_criteria.sql', '05_app_extensions.sql', '06_lviv_real_data.sql'];

export async function migrate() {
  const c = await pool.connect();
  try {
    // Один процес за раз (кілька інстансів не виконають міграції паралельно)
    await c.query('SELECT pg_advisory_lock(842001)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const applied = new Set((await c.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));
    // БД, ініціалізована через docker-compose (initdb), уже має схему — фіксуємо як виконані
    if (applied.size === 0) {
      const existing = (await c.query("SELECT to_regclass('public.users') IS NOT NULL AS ok")).rows[0].ok;
      if (existing) {
        for (const f of MIGRATIONS) await c.query('INSERT INTO schema_migrations(filename) VALUES($1) ON CONFLICT DO NOTHING', [f]);
        console.log('Міграції: наявна схема зафіксована як базова');
        return;
      }
    }
    for (const f of MIGRATIONS) {
      if (applied.has(f)) continue;
      const sql = fs.readFileSync(path.join(DB_DIR, f), 'utf8');
      console.log(`Міграція ${f}…`);
      await c.query(sql); // файли містять власні BEGIN/COMMIT
      await c.query('INSERT INTO schema_migrations(filename) VALUES($1)', [f]);
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(842001)').catch(() => {});
    c.release();
  }
}
