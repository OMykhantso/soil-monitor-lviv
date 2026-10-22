import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { asyncH, HttpError } from '../lib/errors.js';
import { fis, CATEGORY_UK } from '../lib/fis.js';
import { requireRole } from '../middleware/auth.js';
import { loadMethods } from './methods.js';

const r = Router();

async function loadSet(setId) {
  const set = (await query('SELECT * FROM strategy_sets WHERE id=$1', [setId])).rows[0];
  if (!set) return null;
  const { rows } = await query(`
    SELECT a.*, m.code, m.name, m.category AS method_category, m.purpose, m.application_conditions, m.advantages, m.limitations, m.source_url,
      COALESCE((SELECT json_agg(json_build_object('source_title',s.source_title,'source_url',s.source_url)) FROM method_sources s WHERE s.method_id=m.id),'[]') AS sources
    FROM strategy_alternatives a JOIN remediation_methods m ON m.id=a.method_id
    WHERE a.strategy_set_id=$1 ORDER BY a.rank`, [setId]);
  return { ...set, alternatives: rows };
}

// Формування альтернатив реагування для конкретного результату FIS
r.post('/strategies/select', requireRole('specialist'), asyncH(async (req, res) => {
  const { assessment_id } = z.object({ assessment_id: z.number().int().positive() }).parse(req.body);
  const a = (await query('SELECT * FROM fuzzy_assessments WHERE id=$1', [assessment_id])).rows[0];
  if (!a) throw new HttpError(404, 'Результат оцінювання не знайдено');
  const m = (await query('SELECT * FROM soil_measurements WHERE id=$1', [a.measurement_id])).rows[0];
  const loc = (await query('SELECT * FROM monitoring_locations WHERE id=$1', [m.location_id])).rows[0];
  const site = (await query('SELECT * FROM site_characteristics WHERE location_id=$1', [loc.id])).rows[0] || {};
  const methods = await loadMethods({ activeOnly: true });

  // До LLM передаються лише дані ситуації — без облікових даних користувачів
  const result = await fis.strategies({
    measurement: { pb: m.pb, cd: m.cd, zn: m.zn, ph: m.ph, ap: m.ap, ph_method: m.ph_method, sample_date: m.sample_date },
    assessment: { score: a.score, category: a.result_details?.category_uk || CATEGORY_UK[a.category],
      multiples_gdk: a.result_details?.multiples_gdk || {}, top_rules: (a.result_details?.top_rules || []).slice(0, 5) },
    location: { land_use: loc.land_use, source_status: loc.source_status, location_type: loc.location_type },
    site: Object.fromEntries(Object.entries(site).filter(([k]) => !['location_id', 'updated_by', 'updated_at', 'notes'].includes(k))),
    methods: methods.map((x) => ({ id: x.id, code: x.code, name: x.name, category: x.category, purpose: x.purpose,
      application_conditions: x.application_conditions, advantages: x.advantages, limitations: x.limitations,
      active: x.active, criteria: x.criteria })),
  });

  const setId = await tx(async (c) => {
    const s = (await c.query(
      `INSERT INTO strategy_sets(assessment_id,status,selection_engine,llm_model,situation_profile,screening,error_message,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [a.id, result.status, result.selection_engine, result.llm_model, JSON.stringify(result.profile),
        JSON.stringify(result.screening), result.error, req.user.id])).rows[0];
    for (const alt of result.alternatives) {
      await c.query(
        `INSERT INTO strategy_alternatives(strategy_set_id,method_id,rank,suitability_status,explanation,missing_data)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [s.id, alt.method_id, alt.rank, alt.suitability_status, alt.explanation, alt.missing_data]);
    }
    return s.id;
  });
  res.status(201).json(await loadSet(setId));
}));

r.get('/strategies/sets', asyncH(async (req, res) => {
  const id = Number(req.query.assessment_id);
  if (!id) throw new HttpError(400, 'Вкажіть assessment_id');
  const { rows } = await query('SELECT id FROM strategy_sets WHERE assessment_id=$1 ORDER BY created_at DESC', [id]);
  res.json(await Promise.all(rows.map((x) => loadSet(x.id))));
}));

r.get('/strategies/sets/:id', asyncH(async (req, res) => {
  const s = await loadSet(Number(req.params.id));
  if (!s) throw new HttpError(404, 'Набір не знайдено');
  res.json(s);
}));

// Фахова перевірка набору (validated) — фіксує, що альтернативи переглянуто
r.patch('/strategies/sets/:id/validate', requireRole('specialist'), asyncH(async (req, res) => {
  const { rows } = await query(`UPDATE strategy_sets SET status='validated' WHERE id=$1 AND status='generated' RETURNING id`, [Number(req.params.id)]);
  if (!rows[0]) throw new HttpError(409, 'Підтвердити можна лише набір зі статусом generated');
  res.json(await loadSet(rows[0].id));
}));

export default r;
