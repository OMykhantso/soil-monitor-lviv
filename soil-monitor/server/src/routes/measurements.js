import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncH, HttpError } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Математична область моделі А (fuzzy_model.INPUT_RANGES)
export const DOMAIN = { pb: [0, 30], cd: [0, 3.5], zn: [0, 115], ph: [3, 10], ap: [0, 10] };
// 5 експертних критеріїв AP, кожен 0..2 (сума 0..10). Назви — див. client/src/lib/constants.js
export const AP_KEYS = ['industrial', 'transport', 'waste', 'mining', 'agricultural'];

const num = (k) => z.number().min(DOMAIN[k][0]).max(DOMAIN[k][1],
  `Поза областю моделі [${DOMAIN[k][0]}; ${DOMAIN[k][1]}] — збережіть як виняток (measurement_exceptions)`).nullable().optional();
const apDetails = z.object(Object.fromEntries(AP_KEYS.map((k) => [k, z.number().int().min(0).max(2)])));

const measurementSchema = z.object({
  location_id: z.number().int().positive(),
  sample_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Формат дати YYYY-MM-DD'),
  period_label: z.string().max(200).nullable().optional(),
  sample_depth_cm: z.string().max(50).nullable().optional(),
  pb: num('pb'), cd: num('cd'), zn: num('zn'), ph: num('ph'),
  ap: z.number().int().min(0).max(10).nullable().optional(),
  ap_details: apDetails.nullable().optional(),
  ph_method: z.string().max(300).nullable().optional(),
  metal_extraction_method: z.string().max(300).nullable().optional(),
  provenance: z.string().trim().min(3, 'Вкажіть джерело результату (лабораторія, протокол, публікація)').max(1000),
  source_url: z.string().url().max(1000).nullable().optional().or(z.literal('')),
  notes: z.string().max(2000).nullable().optional(),
});

function normalize(d) {
  let ap = d.ap ?? null;
  if (d.ap_details) ap = AP_KEYS.reduce((s, k) => s + d.ap_details[k], 0);
  return { ...d, ap, source_url: d.source_url || null };
}

const COLS = ['location_id', 'sample_date', 'period_label', 'sample_depth_cm', 'pb', 'cd', 'zn', 'ph', 'ap', 'ap_details',
  'ph_method', 'metal_extraction_method', 'provenance', 'source_url', 'notes'];

async function insertMeasurement(d, userId) {
  const vals = COLS.map((c) => (c === 'ap_details' ? (d[c] ? JSON.stringify(d[c]) : null) : d[c] ?? null));
  const { rows } = await query(
    `INSERT INTO soil_measurements(${COLS.join(',')}, created_by) VALUES(${COLS.map((_, i) => '$' + (i + 1)).join(',')}, $${COLS.length + 1}) RETURNING *`,
    [...vals, userId]);
  return rows[0];
}

r.get('/measurements', asyncH(async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.location_id) { params.push(Number(req.query.location_id)); where = 'WHERE m.location_id=$1'; }
  const { rows } = await query(`
    SELECT m.*, l.name AS location_name, a.id AS assessment_id, a.score, a.category
    FROM soil_measurements m JOIN monitoring_locations l ON l.id=m.location_id
    LEFT JOIN LATERAL (SELECT * FROM fuzzy_assessments f WHERE f.measurement_id=m.id ORDER BY f.created_at DESC LIMIT 1) a ON TRUE
    ${where} ORDER BY m.sample_date DESC, m.id DESC`, params);
  res.json(rows);
}));

r.get('/measurements/:id', asyncH(async (req, res) => {
  const m = (await query('SELECT * FROM soil_measurements WHERE id=$1', [Number(req.params.id)])).rows[0];
  if (!m) throw new HttpError(404, 'Спостереження не знайдено');
  res.json(m);
}));

r.post('/measurements', requireRole('specialist'), asyncH(async (req, res) => {
  const d = normalize(measurementSchema.parse(req.body));
  res.status(201).json(await insertMeasurement(d, req.user.id));
}));

// Експертна анкета AP (5 критеріїв × 0..2). Первинні лабораторні показники не змінюються.
r.patch('/measurements/:id/ap', requireRole('specialist'), asyncH(async (req, res) => {
  const details = apDetails.parse(req.body.ap_details);
  const ap = AP_KEYS.reduce((s, k) => s + details[k], 0);
  const { rows } = await query('UPDATE soil_measurements SET ap=$2, ap_details=$3 WHERE id=$1 RETURNING *',
    [Number(req.params.id), ap, JSON.stringify(details)]);
  if (!rows[0]) throw new HttpError(404, 'Спостереження не знайдено');
  res.json(rows[0]);
}));

// Значення поза областю FIS: окреме збереження без «обрізання» до межі
r.post('/measurement-exceptions', requireRole('specialist'), asyncH(async (req, res) => {
  const d = z.object({
    location_id: z.number().int().positive(), sample_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    indicator: z.enum(['pb', 'cd', 'zn', 'ph', 'ap']), value: z.number(),
    reason: z.string().min(3).max(1000), provenance: z.string().min(3).max(1000), source_url: z.string().url().nullable().optional(),
  }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO measurement_exceptions(location_id,sample_date,indicator,value,reason,provenance,source_url)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.location_id, d.sample_date, d.indicator, d.value, d.reason, d.provenance, d.source_url ?? null]);
  res.status(201).json(rows[0]);
}));

// Імпорт CSV: location_id,sample_date,pb,cd,zn,ph,ap,ph_method,metal_extraction_method,provenance,source_url,period_label,notes
r.post('/import/measurements', requireRole('specialist'), upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Додайте CSV-файл у поле file');
  const records = parse(req.file.buffer.toString('utf8').replace(/^﻿/, ''), {
    columns: true, skip_empty_lines: true, trim: true, delimiter: [',', ';'] });
  const numOrNull = (v) => (v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
  const inserted = [];
  const errors = [];
  for (const [i, rec] of records.entries()) {
    try {
      const d = normalize(measurementSchema.parse({
        ...rec, location_id: Number(rec.location_id), pb: numOrNull(rec.pb), cd: numOrNull(rec.cd), zn: numOrNull(rec.zn),
        ph: numOrNull(rec.ph), ap: rec.ap === '' || rec.ap === undefined ? null : Number(rec.ap),
        source_url: rec.source_url || null, period_label: rec.period_label || null, notes: rec.notes || null,
      }));
      inserted.push((await insertMeasurement(d, req.user.id)).id);
    } catch (e) {
      errors.push({ row: i + 2, error: e.issues ? e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') : e.message });
    }
  }
  res.json({ total: records.length, inserted: inserted.length, inserted_ids: inserted, errors });
}));

export default r;
