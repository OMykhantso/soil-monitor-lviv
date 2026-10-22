import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { baseOptions, themeColors } from '../lib/charts.js';
import { GDK, INDICATORS, LAND_USE, LOCATION_TYPE, SOURCE_STATUS, fmt, fmtDate } from '../lib/constants.js';
import { CategoryPill, ErrorText, Loading } from '../components/ui.jsx';
import ApForm from '../components/ApForm.jsx';
import SiteForm from '../components/SiteForm.jsx';
import AssessmentView from '../components/AssessmentView.jsx';
import StrategyPanel from '../components/StrategyPanel.jsx';

const INPUTS = ['pb', 'cd', 'zn', 'ph', 'ap'];

function HistoryChart({ measurements }) {
  const c = themeColors();
  const ms = [...measurements].reverse();
  if (ms.length < 2) return <p className="muted small">Для графіка динаміки потрібно щонайменше два спостереження.</p>;
  const labels = ms.map((m) => m.period_label || fmtDate(m.sample_date));
  const ds = [
    { label: 'Pb, ×ГДК', data: ms.map((m) => (m.pb != null ? m.pb / GDK.pb : null)), borderColor: c.high },
    { label: 'Cd, ×ГДК', data: ms.map((m) => (m.cd != null ? m.cd / GDK.cd : null)), borderColor: c.critical },
    { label: 'Zn, ×ГДК', data: ms.map((m) => (m.zn != null ? m.zn / GDK.zn : null)), borderColor: c.moderate },
    { label: 'pH', data: ms.map((m) => m.ph), borderColor: c.accent, borderDash: [5, 4], yAxisID: 'y1' },
    { label: 'Бал R', data: ms.map((m) => m.score), borderColor: c.ink, borderWidth: 3, yAxisID: 'y1' },
  ].map((d) => ({ borderWidth: 2, pointRadius: 3, spanGaps: true, ...d }));
  const opts = baseOptions(c);
  opts.scales.y = { ...opts.scales.y, title: { display: true, text: 'кратність ГДК', color: c.muted }, beginAtZero: true };
  opts.scales.y1 = { position: 'right', min: 0, max: 10, ticks: { color: c.muted }, grid: { drawOnChartArea: false }, title: { display: true, text: 'pH / R', color: c.muted } };
  return <div style={{ height: 260 }}><Line data={{ labels, datasets: ds }} options={opts} /></div>;
}

export default function LocationPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const [loc, setLoc] = useState(null);
  const [selId, setSelId] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.location(id).then((d) => {
    setLoc(d);
    setSelId((cur) => cur ?? d.measurements[0]?.id ?? null);
  }).catch(setError);
  useEffect(() => { setLoc(null); setSelId(null); load(); }, [id]); // eslint-disable-line

  const sel = useMemo(() => loc?.measurements.find((m) => m.id === selId), [loc, selId]);
  useEffect(() => {
    setAssessment(null);
    if (sel?.assessment_id) api.assessment(sel.assessment_id).then(setAssessment).catch(setError);
  }, [sel?.assessment_id]); // eslint-disable-line

  if (error && !loc) return <ErrorText error={error} />;
  if (!loc) return <Loading />;
  const missing = sel ? INPUTS.filter((k) => sel[k] === null || sel[k] === undefined) : [];

  const act = async (fn, okText) => {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); await load(); if (okText) setMsg(okText); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 className="cap">{LOCATION_TYPE[loc.location_type]}{loc.district ? ` · ${loc.district}` : ''}</h3>
            <h1 className="pg">{loc.name}</h1>
            <p className="sub" style={{ marginBottom: 6 }}>{loc.description}</p>
            <div className="row small muted">
              <span className="mono">{fmt(loc.latitude, 4)}° N, {fmt(loc.longitude, 4)}° E</span>
              <span>Землекористування: {LAND_USE[loc.land_use] || '—'}</span>
              <span>Джерело забруднення: {SOURCE_STATUS[loc.source_status]}</span>
              {loc.area_thousand_ha && <span>Обстежено: {fmt(loc.area_thousand_ha, 1)} тис. га</span>}
            </div>
          </div>
          <div className="row">
            <Link className="btn ghost small" to="/">← Карта</Link>
            {can('specialist') && <Link className="btn ghost small" to={`/locations/${loc.id}/edit`}>Редагувати</Link>}
            {can('specialist') && <Link className="btn small" to={`/measurements/new?location=${loc.id}`}>+ Спостереження</Link>}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3 className="cap">Історія спостережень</h3>
          <HistoryChart measurements={loc.measurements} />
        </div>
        <div className="card tbl">
          <h3 className="cap">Спостереження ({loc.measurements.length})</h3>
          <table className="t">
            <thead><tr><th>Дата / період</th>{INDICATORS.map((i) => <th key={i.key} className="n">{i.label}</th>)}<th>Оцінка</th></tr></thead>
            <tbody>
              {loc.measurements.map((m) => (
                <tr key={m.id} className={'click ' + (m.id === selId ? 'sel' : '')} onClick={() => setSelId(m.id)}>
                  <td>{m.period_label || fmtDate(m.sample_date)}</td>
                  {INDICATORS.map((i) => <td key={i.key} className={'n ' + (GDK[i.key] && m[i.key] > GDK[i.key] ? 'over' : '')}>{fmt(m[i.key], i.digits)}</td>)}
                  <td>{m.score != null ? <span className="row" style={{ gap: 6 }}><span className="mono">{fmt(m.score, 2)}</span><CategoryPill category={m.category} /></span> : <span className="muted small">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loc.exceptions.length > 0 && (
            <>
              <h3 className="cap" style={{ marginTop: 12 }}>Значення поза областю моделі</h3>
              {loc.exceptions.map((e) => <p key={e.id} className="small"><b>{e.indicator.toUpperCase()} = {fmt(e.value, 2)}</b> ({fmtDate(e.sample_date)}) — {e.reason}. <span className="muted">{e.provenance}</span></p>)}
            </>
          )}
        </div>
      </div>

      {sel && (
        <div className="card stack">
          <h2>Спостереження від {sel.period_label || fmtDate(sel.sample_date)}</h2>
          <div className="small">
            <div><span className="muted">Джерело: </span>{sel.provenance}{sel.source_url && <> · <a href={sel.source_url} target="_blank" rel="noreferrer">відкрити</a></>}</div>
            <div><span className="muted">Метод pH: </span>{sel.ph_method || '—'} · <span className="muted">Метали: </span>{sel.metal_extraction_method || '—'}</div>
            {sel.notes && <div><span className="muted">Примітка: </span>{sel.notes}</div>}
          </div>
          <div className="grid2">
            <div>
              <h3 className="cap">Антропогенне навантаження (AP) — експертна анкета</h3>
              {sel.ap === null && <div className="banner" style={{ marginBottom: 10 }}>AP у джерелі відсутнє. Оцініть п’ять критеріїв, щоб модель могла сформувати бал.</div>}
              <ApForm key={sel.id} initial={sel.ap_details} disabled={!can('specialist') || busy}
                onSave={can('specialist') ? (details) => act(() => api.setAp(sel.id, details), 'AP збережено') : null} />
            </div>
            <div className="stack">
              <h3 className="cap">Нечітке оцінювання</h3>
              {missing.length > 0
                ? <div className="banner">Неповне спостереження — бракує: <b>{missing.map((k) => k.toUpperCase()).join(', ')}</b>. Система не підставляє значення довільно, тому оцінку не сформовано.</div>
                : <p className="small muted" style={{ margin: 0 }}>Усі 5 входів моделі наявні. Кожен запуск створює новий запис оцінки — історія не перезаписується.</p>}
              {can('specialist') && (
                <div><button className="btn" disabled={busy || missing.length > 0}
                  onClick={() => act(() => api.assess(sel.id), 'Оцінювання виконано')}>Запустити нечітке оцінювання</button></div>
              )}
              {msg && <p className="ok">{msg}</p>}
              <ErrorText error={error} />
            </div>
          </div>
          {assessment && <><hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} /><AssessmentView assessment={assessment} /></>}
        </div>
      )}

      {assessment && (
        <div className="card">
          <h2>Альтернативи реагування</h2>
          <StrategyPanel assessmentId={assessment.id} />
        </div>
      )}

      <div className="card">
        <h2>Характеристики ділянки</h2>
        <p className="sub small">Використовуються для скринінгу методів бази знань. «Невідомо» не трактується як виконання умови — метод отримає статус «потребує додаткових даних».</p>
        <SiteForm key={loc.id + (loc.site?.updated_at || '')} site={loc.site} disabled={!can('specialist')}
          onSave={(d) => act(() => api.updateSite(loc.id, d), 'Характеристики збережено')} />
      </div>
    </div>
  );
}
