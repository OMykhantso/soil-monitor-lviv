import { Router } from 'express';
import { query } from '../db.js';
import { asyncH } from '../lib/errors.js';

const r = Router();

r.get('/stats', asyncH(async (_req, res) => {
  const counts = (await query(`SELECT
    (SELECT COUNT(*)::int FROM monitoring_locations) AS locations,
    (SELECT COUNT(*)::int FROM soil_measurements) AS measurements,
    (SELECT COUNT(*)::int FROM soil_measurements WHERE pb IS NULL OR cd IS NULL OR zn IS NULL OR ph IS NULL OR ap IS NULL) AS incomplete,
    (SELECT COUNT(*)::int FROM fuzzy_assessments) AS assessments,
    (SELECT COUNT(*)::int FROM strategy_sets WHERE status IN ('generated','validated')) AS strategy_sets,
    (SELECT COUNT(*)::int FROM measurement_exceptions) AS exceptions`)).rows[0];
  // Розподіл останніх оцінок кожної точки за категоріями
  const dist = (await query(`
    WITH last_m AS (SELECT DISTINCT ON (location_id) id, location_id FROM soil_measurements ORDER BY location_id, sample_date DESC, id DESC),
         last_a AS (SELECT DISTINCT ON (f.measurement_id) f.measurement_id, f.category FROM fuzzy_assessments f ORDER BY f.measurement_id, f.created_at DESC)
    SELECT COALESCE(a.category,'none') AS category, COUNT(*)::int AS n
    FROM last_m m LEFT JOIN last_a a ON a.measurement_id=m.id GROUP BY 1`)).rows;
  // Середні кратності ГДК (Pb 6, Cd 0.7, Zn 23 мг/кг — розділ 2.2) за останніми пробами
  const gdk = (await query(`
    WITH last_m AS (SELECT DISTINCT ON (location_id) * FROM soil_measurements ORDER BY location_id, sample_date DESC, id DESC)
    SELECT l.id, l.name, l.district, l.location_type, m.sample_date, m.period_label,
      ROUND(m.pb/6.0,3) AS pb_x, ROUND(m.cd/0.7,3) AS cd_x, ROUND(m.zn/23.0,3) AS zn_x, m.ph
    FROM last_m m JOIN monitoring_locations l ON l.id=m.location_id ORDER BY l.id`)).rows;
  const top = (await query(`
    SELECT DISTINCT ON (l.id) l.id, l.name, a.score, a.category, a.created_at
    FROM fuzzy_assessments a JOIN soil_measurements m ON m.id=a.measurement_id JOIN monitoring_locations l ON l.id=m.location_id
    ORDER BY l.id, a.created_at DESC`)).rows.sort((x, y) => y.score - x.score).slice(0, 10);
  res.json({ counts, distribution: dist, gdk_multiples: gdk, top });
}));

export default r;
