import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncH, HttpError } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';

const r = Router();

export async function loadMethods({ activeOnly = false } = {}) {
  const { rows } = await query(`
    SELECT m.*,
      COALESCE((SELECT json_agg(json_build_object('id',c.id,'condition_key',c.condition_key,'operator',c.operator,
        'expected_value',c.expected_value,'is_required',c.is_required,'explanation',c.explanation) ORDER BY c.id)
        FROM method_criteria c WHERE c.method_id=m.id), '[]') AS criteria,
      COALESCE((SELECT json_agg(json_build_object('id',s.id,'source_title',s.source_title,'source_url',s.source_url))
        FROM method_sources s WHERE s.method_id=m.id), '[]') AS sources
    FROM remediation_methods m ${activeOnly ? 'WHERE m.active' : ''} ORDER BY m.id`);
  return rows;
}

r.get('/remediation-methods', asyncH(async (_req, res) => res.json(await loadMethods())));

const methodSchema = z.object({
  name: z.string().min(2).max(300), purpose: z.string().min(3), application_conditions: z.string().min(3),
  advantages: z.string().min(3), limitations: z.string().min(3), active: z.boolean(), source_url: z.string().url(),
});

// Зміна методу підвищує версію запису бази знань
r.put('/remediation-methods/:id', requireRole('admin'), asyncH(async (req, res) => {
  const d = methodSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE remediation_methods SET name=$2,purpose=$3,application_conditions=$4,advantages=$5,limitations=$6,active=$7,source_url=$8,version=version+1
     WHERE id=$1 RETURNING *`,
    [Number(req.params.id), d.name, d.purpose, d.application_conditions, d.advantages, d.limitations, d.active, d.source_url]);
  if (!rows[0]) throw new HttpError(404, 'Метод не знайдено');
  res.json(rows[0]);
}));

r.post('/remediation-methods/:id/sources', requireRole('admin'), asyncH(async (req, res) => {
  const d = z.object({ source_title: z.string().min(3), source_url: z.string().url() }).parse(req.body);
  const { rows } = await query('INSERT INTO method_sources(method_id,source_title,source_url) VALUES($1,$2,$3) RETURNING *',
    [Number(req.params.id), d.source_title, d.source_url]);
  res.status(201).json(rows[0]);
}));

export default r;
