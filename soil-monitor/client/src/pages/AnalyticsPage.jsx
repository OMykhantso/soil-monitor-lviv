import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { baseOptions, themeColors } from '../lib/charts.js';
import { CATEGORIES, LOCATION_TYPE, fmt } from '../lib/constants.js';
import { CategoryPill, ErrorText, Loading } from '../components/ui.jsx';

export default function AnalyticsPage() {
  const { can } = useAuth();
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [batch, setBatch] = useState(null);
  const load = () => api.stats().then(setS).catch(setError);
  useEffect(() => { load(); }, []);
  if (!s) return error ? <ErrorText error={error} /> : <Loading />;
  const c = themeColors();
  const distMap = Object.fromEntries(s.distribution.map((d) => [d.category, d.n]));
  const cats = ['low', 'moderate', 'high', 'critical', 'none'];
  const dough = { labels: cats.map((k) => (k === 'none' ? 'Без оцінки' : CATEGORIES[k].label)),
    datasets: [{ data: cats.map((k) => distMap[k] || 0), backgroundColor: [c.low, c.moderate, c.high, c.critical, c.none], borderColor: 'transparent' }] };
  const rows = s.gdk_multiples;
  const bar = { labels: rows.map((r) => r.name.length > 28 ? r.name.slice(0, 27) + '…' : r.name),
    datasets: [
      { label: 'Pb, ×ГДК', data: rows.map((r) => r.pb_x), backgroundColor: c.high },
      { label: 'Cd, ×ГДК', data: rows.map((r) => r.cd_x), backgroundColor: c.critical },
      { label: 'Zn, ×ГДК', data: rows.map((r) => r.zn_x), backgroundColor: c.moderate },
    ] };
  const bo = baseOptions(c);
  bo.indexAxis = 'y';
  bo.scales.x.title = { display: true, text: 'кратність ГДК (1 = норматив)', color: c.muted };
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="pg">Аналітика</h1><p className="sub">Останні спостереження кожної точки; кратності ГДК рухомих форм (Pb 6, Cd 0,7, Zn 23 мг/кг) — довідкові, модель працює з концентраціями.</p></div>
        {can('specialist') && <button className="btn ghost" onClick={() => api.assessBatch().then((r) => { setBatch(r); load(); }).catch(setError)}>Оцінити всі повні неоцінені спостереження</button>}
      </div>
      {batch && <p className="small">Оцінено: {batch.assessed}. {batch.failed.length ? `Помилок: ${batch.failed.length}` : ''}</p>}
      <div className="kpis">
        {[['Точок', s.counts.locations], ['Спостережень', s.counts.measurements], ['Неповних', s.counts.incomplete], ['Оцінок FIS', s.counts.assessments], ['Наборів альтернатив', s.counts.strategy_sets], ['Значень поза доменом', s.counts.exceptions]].map(([l, v]) => (
          <div key={l} className="card kpi"><div className="muted small">{l}</div><div className="v">{v}</div></div>))}
      </div>
      <div className="grid2">
        <div className="card"><h3 className="cap">Розподіл точок за категорією останньої оцінки</h3><div style={{ height: 260 }}><Doughnut data={dough} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: c.ink } } } }} /></div></div>
        <div className="card tbl"><h3 className="cap">Найвищі інтегральні бали</h3>
          {s.top.length === 0 ? <p className="muted small">Оцінок ще немає. Заповніть AP і запустіть оцінювання на картці точки.</p> : (
            <table className="t"><tbody>{s.top.map((t) => <tr key={t.id}><td><Link to={`/locations/${t.id}`}>{t.name}</Link></td><td className="n">{fmt(t.score, 2)}</td><td><CategoryPill category={t.category} /></td></tr>)}</tbody></table>)}
        </div>
      </div>
      <div className="card"><h3 className="cap">Кратність ГДК за останнім спостереженням</h3><div style={{ height: Math.max(260, rows.length * 34) }}><Bar data={bar} options={bo} /></div></div>
      <div className="card tbl"><h3 className="cap">Таблиця</h3>
        <table className="t"><thead><tr><th>Точка</th><th>Тип</th><th>Період</th><th className="n">Pb ×</th><th className="n">Cd ×</th><th className="n">Zn ×</th><th className="n">pH</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td><Link to={`/locations/${r.id}`}>{r.name}</Link></td><td className="small">{LOCATION_TYPE[r.location_type]}</td><td className="small">{r.period_label || r.sample_date}</td>
            {['pb_x', 'cd_x', 'zn_x'].map((k) => <td key={k} className={'n ' + (r[k] > 1 ? 'over' : '')}>{fmt(r[k], 2)}</td>)}<td className="n">{fmt(r.ph, 1)}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
