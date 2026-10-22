import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncH, HttpError } from '../lib/errors.js';
import { fis, CATEGORY_CODE } from '../lib/fis.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
const INPUTS = ['pb', 'cd', 'zn', 'ph', 'ap'];

export async function assessMeasurement(measurementId, userId) {
  const m = (await query('SELECT * FROM soil_measurements WHERE id=$1', [measurementId])).rows[0];
  if (!m) throw new HttpError(404, 'Спостереження не знайдено');
  const missing = INPUTS.filter((k) => m[k] === null || m[k] === undefined);
  if (missing.length) {
    throw new HttpError(422, 'Неповне спостереження: оцінку FIS не сформовано (підстановка значень заборонена)', {
      missing, hint: missing.includes('ap') ? 'Заповніть експертну анкету AP' : undefined });
  }
  const input = Object.fromEntries(INPUTS.map((k) => [k, k === 'ap' ? Math.round(m[k]) : Number(m[k])]));
  const result = await fis.evaluate(input);
  const details = {
    category_uk: result.category,
    multiples_gdk: result.multiples_gdk,
    output_membership_at_score: result.output_membership_at_score,
    active_rule_count: result.active_rule_count,
    top_rules: result.top_rules,
    input_memberships: result.input_memberships,
    curve: result.curve,
    model: result.model,
  };
  const { rows } = await query(
    `INSERT INTO fuzzy_assessments(measurement_id,score,category,model_version,input_snapshot,result_details,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [m.id, result.score, CATEGORY_CODE[result.category], result.model.version, JSON.stringify(input), JSON.stringify(details), userId]);
  return rows[0];
}

// Запуск оцінювання: завжди новий запис (історія не перезаписується)
r.post('/assessments', requireRole('specialist'), asyncH(async (req, res) => {
  const { measurement_id } = z.object({ measurement_id: z.number().int().positive() }).parse(req.body);
  res.status(201).json(await assessMeasurement(measurement_id, req.user.id));
}));

// Пакетне оцінювання останніх повних спостережень без оцінки
r.post('/assessments/batch', requireRole('specialist'), asyncH(async (req, res) => {
  const { rows } = await query(`
    SELECT m.id FROM soil_measurements m
    WHERE m.pb IS NOT NULL AND m.cd IS NOT NULL AND m.zn IS NOT NULL AND m.ph IS NOT NULL AND m.ap IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM fuzzy_assessments f WHERE f.measurement_id=m.id)`);
  const done = [];
  const failed = [];
  for (const { id } of rows) {
    try { done.push((await assessMeasurement(id, req.user.id)).id); } catch (e) { failed.push({ measurement_id: id, error: e.message }); }
  }
  res.json({ assessed: done.length, failed });
}));

r.get('/assessments/:id', asyncH(async (req, res) => {
  const a = (await query(`
    SELECT a.*, m.location_id, m.sample_date, m.period_label, m.pb, m.cd, m.zn, m.ph, m.ap, l.name AS location_name
    FROM fuzzy_assessments a JOIN soil_measurements m ON m.id=a.measurement_id JOIN monitoring_locations l ON l.id=m.location_id
    WHERE a.id=$1`, [Number(req.params.id)])).rows[0];
  if (!a) throw new HttpError(404, 'Результат оцінювання не знайдено');
  res.json(a);
}));

r.get('/measurements/:id/assessments', asyncH(async (req, res) => {
  const { rows } = await query('SELECT * FROM fuzzy_assessments WHERE measurement_id=$1 ORDER BY created_at DESC', [Number(req.params.id)]);
  res.json(rows);
}));

// Ручний запуск моделі без збереження (сторінка «Нечітка модель»)
r.get('/fis/model', asyncH(async (_req, res) => res.json(await fis.model())));
r.get('/fis/health', asyncH(async (_req, res) => res.json(await fis.health())));
r.post('/fis/evaluate', asyncH(async (req, res) => {
  const d = z.object({ pb: z.number(), cd: z.number(), zn: z.number(), ph: z.number(), ap: z.number().int() }).parse(req.body);
  res.json(await fis.evaluate(d));
}));

export default r;
