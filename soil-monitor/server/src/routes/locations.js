import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { asyncH, HttpError } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

const locationSchema = z.object({
  name: z.string().trim().min(2).max(300),
  latitude: z.number().min(48.4).max(50.9, 'Координати поза Львівською областю'),
  longitude: z.number().min(22.5).max(25.8, 'Координати поза Львівською областю'),
  land_use: z.enum(['agricultural', 'industrial', 'urban', 'transport', 'waste', 'mining', 'forest', 'other']).nullable().optional(),
  source_status: z.enum(['none', 'suspected', 'confirmed', 'unknown']).default('unknown'),
  description: z.string().max(2000).nullable().optional(),
  district: z.string().max(200).nullable().optional(),
  location_type: z.enum(['sampling_site', 'settlement', 'district_average']).default('sampling_site'),
});

r.get('/locations', asyncH(async (_req, res) => {
  const { rows } = await query(`
    SELECT l.*, COUNT(m.id)::int AS measurement_count, MAX(m.sample_date) AS last_sample_date
    FROM monitoring_locations l LEFT JOIN soil_measurements m ON m.location_id=l.id
    GROUP BY l.id ORDER BY l.name`);
  res.json(rows);
}));

r.get('/locations/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const loc = (await query('SELECT * FROM monitoring_locations WHERE id=$1', [id])).rows[0];
  if (!loc) throw new HttpError(404, 'Точку моніторингу не знайдено');
  const site = (await query('SELECT * FROM site_characteristics WHERE location_id=$1', [id])).rows[0] || null;
  const measurements = (await query(`
    SELECT m.*, a.id AS assessment_id, a.score, a.category, a.model_version, a.created_at AS assessed_at
    FROM soil_measurements m
    LEFT JOIN LATERAL (SELECT * FROM fuzzy_assessments f WHERE f.measurement_id=m.id ORDER BY f.created_at DESC LIMIT 1) a ON TRUE
    WHERE m.location_id=$1 ORDER BY m.sample_date DESC, m.id DESC`, [id])).rows;
  const exceptions = (await query('SELECT * FROM measurement_exceptions WHERE location_id=$1 ORDER BY sample_date DESC', [id])).rows;
  res.json({ ...loc, site, measurements, exceptions });
}));

r.post('/locations', requireRole('specialist'), asyncH(async (req, res) => {
  const d = locationSchema.parse(req.body);
  const row = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO monitoring_locations(name,latitude,longitude,land_use,source_status,description,district,location_type)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.name, d.latitude, d.longitude, d.land_use ?? null, d.source_status, d.description ?? null, d.district ?? null, d.location_type]);
    await c.query('INSERT INTO site_characteristics(location_id, updated_by) VALUES($1,$2)', [rows[0].id, req.user.id]);
    return rows[0];
  });
  res.status(201).json(row);
}));

r.put('/locations/:id', requireRole('specialist'), asyncH(async (req, res) => {
  const d = locationSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE monitoring_locations SET name=$2,latitude=$3,longitude=$4,land_use=$5,source_status=$6,description=$7,district=$8,location_type=$9
     WHERE id=$1 RETURNING *`,
    [Number(req.params.id), d.name, d.latitude, d.longitude, d.land_use ?? null, d.source_status, d.description ?? null, d.district ?? null, d.location_type]);
  if (!rows[0]) throw new HttpError(404, 'Точку моніторингу не знайдено');
  res.json(rows[0]);
}));

r.delete('/locations/:id', requireRole('admin'), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const n = (await query('SELECT COUNT(*)::int AS n FROM soil_measurements WHERE location_id=$1', [id])).rows[0].n;
  if (n > 0) throw new HttpError(409, 'Точка має вимірювання — видалення заборонено для збереження історії');
  await query('DELETE FROM monitoring_locations WHERE id=$1', [id]);
  res.status(204).end();
}));

const tri = z.boolean().nullable().optional();
const siteSchema = z.object({
  contamination_confirmed: tri, measurement_uncertain: tri, plant_growth_suitable: tri,
  bioavailability_assessed: tri, soil_properties_known: tri, amendment_tested: tri,
  grain_size_known: tri, washing_feasibility_tested: tri, localized_extent_confirmed: tri,
  disposal_route_known: tri, exposure_pathway_present: tri, notes: z.string().max(2000).nullable().optional(),
});

r.put('/locations/:id/site', requireRole('specialist'), asyncH(async (req, res) => {
  const d = siteSchema.parse(req.body);
  const keys = Object.keys(siteSchema.shape);
  const vals = keys.map((k) => (d[k] === undefined ? null : d[k]));
  const { rows } = await query(
    `INSERT INTO site_characteristics(location_id, ${keys.join(',')}, updated_by, updated_at)
     VALUES($1, ${keys.map((_, i) => '$' + (i + 2)).join(',')}, $${keys.length + 2}, NOW())
     ON CONFLICT(location_id) DO UPDATE SET ${keys.map((k) => `${k}=EXCLUDED.${k}`).join(',')}, updated_by=EXCLUDED.updated_by, updated_at=NOW()
     RETURNING *`, [Number(req.params.id), ...vals, req.user.id]);
  res.json(rows[0]);
}));

export default r;
