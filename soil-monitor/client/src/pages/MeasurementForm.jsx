import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { DOMAIN, GDK, fmt } from '../lib/constants.js';
import { ErrorText } from '../components/ui.jsx';
import ApForm from '../components/ApForm.jsx';

const FIELDS = [
  ['pb', 'Pb (рухома форма), мг/кг', 'ГДК 6'], ['cd', 'Cd (рухома форма), мг/кг', 'ГДК 0,7'],
  ['zn', 'Zn (рухома форма), мг/кг', 'ГДК 23'], ['ph', 'pH', 'шкала за узгодженою методикою'],
];

export default function MeasurementForm() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [locations, setLocations] = useState([]);
  const [d, setD] = useState({ location_id: params.get('location') || '', sample_date: new Date().toISOString().slice(0, 10),
    period_label: '', sample_depth_cm: '0–20', pb: '', cd: '', zn: '', ph: '', ph_method: 'pH(KCl)',
    metal_extraction_method: 'ААБР pH 4,8; ААС (ДСТУ 4770.3:2007, ДСТУ 4770.2:2007)', provenance: '', source_url: '', notes: '' });
  const [ap, setAp] = useState(null);
  const [useAp, setUseAp] = useState(true);
  const [error, setError] = useState(null);
  const [csv, setCsv] = useState(null);
  const [csvRes, setCsvRes] = useState(null);
  useEffect(() => { api.locations().then(setLocations).catch(setError); }, []);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const num = (v) => (v === '' ? null : Number(String(v).replace(',', '.')));
  const outOfDomain = FIELDS.map(([k]) => k).filter((k) => d[k] !== '' && (num(d[k]) < DOMAIN[k][0] || num(d[k]) > DOMAIN[k][1]));

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try {
      const body = { ...d, location_id: Number(d.location_id), pb: num(d.pb), cd: num(d.cd), zn: num(d.zn), ph: num(d.ph),
        ap_details: useAp && ap ? ap : null, period_label: d.period_label || null, source_url: d.source_url || null, notes: d.notes || null };
      await api.createMeasurement(body);
      nav(`/locations/${d.location_id}`);
    } catch (err) { setError(err); }
  };
  const saveExceptions = async () => {
    setError(null);
    try {
      for (const k of outOfDomain) {
        await api.createException({ location_id: Number(d.location_id), sample_date: d.sample_date, indicator: k, value: num(d[k]),
          reason: `Поза областю моделі [${DOMAIN[k][0]}; ${DOMAIN[k][1]}]`, provenance: d.provenance || 'не вказано', source_url: d.source_url || null });
        setD((x) => ({ ...x, [k]: '' }));
      }
    } catch (err) { setError(err); }
  };

  return (
    <div className="stack">
      <form className="card stack" onSubmit={submit}>
        <h1 className="pg">Нове спостереження</h1>
        <p className="sub">Концентрації — рухомі форми у мг/кг (вхідні змінні моделі А). Порожнє поле = показник не визначався; оцінку FIS для неповного запису не буде сформовано.</p>
        <div className="form-grid">
          <label className="f"><span>Точка моніторингу</span>
            <select id="m-loc" className="in" value={d.location_id} onChange={set('location_id')} required>
              <option value="">— оберіть —</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></label>
          <label className="f"><span>Дата відбору</span><input id="m-date" className="in" type="date" value={d.sample_date} onChange={set('sample_date')} required /></label>
          <label className="f"><span>Період / позначка (необов’язково)</span><input id="m-period" className="in" value={d.period_label} onChange={set('period_label')} placeholder="напр. середнє 2021–2025" /></label>
          <label className="f"><span>Глибина відбору, см</span><input id="m-depth" className="in" value={d.sample_depth_cm} onChange={set('sample_depth_cm')} /></label>
        </div>
        <div className="form-grid">
          {FIELDS.map(([k, l, hint]) => (
            <label className="f" key={k}><span>{l} <span className="muted small">· {hint} · [{DOMAIN[k][0]}; {DOMAIN[k][1]}]</span></span>
              <input id={`m-${k}`} className={'in mono ' + (outOfDomain.includes(k) ? 'over' : '')} inputMode="decimal" value={d[k]} onChange={set(k)} />
              {GDK[k] && d[k] !== '' && <span className="small muted">{fmt(num(d[k]) / GDK[k], 2)}×ГДК</span>}
            </label>
          ))}
        </div>
        {outOfDomain.length > 0 && (
          <div className="banner">Значення {outOfDomain.map((k) => k.toUpperCase()).join(', ')} поза математичною областю моделі. Їх не можна «обрізати» до межі — збережіть окремо як виняток.
            <div style={{ marginTop: 6 }}><button type="button" className="btn small" onClick={saveExceptions} disabled={!d.location_id}>Зберегти як виняток</button></div></div>
        )}
        <div className="form-grid">
          <label className="f"><span>Метод визначення pH</span><input id="m-phm" className="in" value={d.ph_method} onChange={set('ph_method')} /></label>
          <label className="f"><span>Метод екстракції металів</span><input id="m-ext" className="in" value={d.metal_extraction_method} onChange={set('metal_extraction_method')} /></label>
        </div>
        <label className="f"><span>Джерело результату (лабораторія, протокол №, публікація) — обов’язково</span><input id="m-prov" className="in" value={d.provenance} onChange={set('provenance')} required /></label>
        <label className="f"><span>Посилання на джерело</span><input id="m-url" className="in" type="url" value={d.source_url} onChange={set('source_url')} /></label>
        <label className="f"><span>Примітка</span><textarea id="m-notes" className="in" value={d.notes} onChange={set('notes')} /></label>
        <div className="card" style={{ background: 'var(--bg)' }}>
          <label className="row small"><input id="m-useap" type="checkbox" checked={useAp} onChange={(e) => setUseAp(e.target.checked)} /> Заповнити експертну анкету AP зараз</label>
          {useAp && <div style={{ marginTop: 10 }}><ApForm onSave={null} onChange={setAp} /></div>}
        </div>
        <ErrorText error={error} />
        <div><button className="btn" disabled={outOfDomain.length > 0}>Зберегти спостереження</button></div>
      </form>

      <div className="card stack">
        <h2>Імпорт із CSV</h2>
        <p className="small muted">Колонки: <span className="mono">location_id,sample_date,pb,cd,zn,ph,ap,ph_method,metal_extraction_method,provenance,source_url,period_label,notes</span>. Роздільник «,» або «;», десяткова кома допускається.</p>
        <div className="row">
          <input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => setCsv(e.target.files[0])} />
          <button className="btn small" disabled={!csv} onClick={() => api.importCsv(csv).then(setCsvRes).catch(setError)}>Імпортувати</button>
        </div>
        {csvRes && <p className="small">Рядків: {csvRes.total}, додано: {csvRes.inserted}.{csvRes.errors.map((e) => <span key={e.row} className="err" style={{ display: 'block' }}>Рядок {e.row}: {e.error}</span>)}</p>}
      </div>
    </div>
  );
}

