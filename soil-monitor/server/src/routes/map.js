import { Router } from 'express';
import { query } from '../db.js';
import { asyncH } from '../lib/errors.js';

const r = Router();

// GeoJSON для Leaflet: остання проба кожної точки + її остання оцінка FIS
r.get('/map/points', asyncH(async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let dateFilter = '';
  if (from) { params.push(from); dateFilter += ` AND m.sample_date >= $${params.length}`; }
  if (to) { params.push(to); dateFilter += ` AND m.sample_date <= $${params.length}`; }
  const { rows } = await query(`
    SELECT l.*, m.id AS measurement_id, m.sample_date, m.period_label, m.pb, m.cd, m.zn, m.ph, m.ap,
           a.id AS assessment_id, a.score, a.category
    FROM monitoring_locations l
    LEFT JOIN LATERAL (SELECT * FROM soil_measurements m WHERE m.location_id=l.id ${dateFilter}
                       ORDER BY m.sample_date DESC, m.id DESC LIMIT 1) m ON TRUE
    LEFT JOIN LATERAL (SELECT * FROM fuzzy_assessments f WHERE f.measurement_id=m.id ORDER BY f.created_at DESC LIMIT 1) a ON TRUE
    ORDER BY l.id`, params);
  const features = rows.map((x) => {
    const complete = ['pb', 'cd', 'zn', 'ph', 'ap'].every((k) => x[k] !== null && x[k] !== undefined);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [x.longitude, x.latitude] },
      properties: {
        id: x.id, name: x.name, district: x.district, land_use: x.land_use, source_status: x.source_status,
        location_type: x.location_type, is_demo: x.is_demo,
        measurement_id: x.measurement_id, sample_date: x.sample_date, period_label: x.period_label,
        pb: x.pb, cd: x.cd, zn: x.zn, ph: x.ph, ap: x.ap,
        assessment_id: x.assessment_id, score: x.score, category: x.category,
        status: !x.measurement_id ? 'no_data' : x.assessment_id ? 'assessed' : complete ? 'not_assessed' : 'incomplete',
      },
    };
  });
  res.json({ type: 'FeatureCollection', features });
}));

export default r;
