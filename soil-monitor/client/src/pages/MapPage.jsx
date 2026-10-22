import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CATEGORIES, GDK, LOCATION_TYPE, STATUS_LABEL, fmt, fmtDate } from '../lib/constants.js';
import { CategoryPill, ErrorText, Loading } from '../components/ui.jsx';

const BIN_COLORS = ['var(--lv-low)', 'var(--lv-mod)', 'var(--lv-high)', 'var(--lv-crit)'];
const MODES = [
  { key: 'category', label: 'Оцінка FIS' }, { key: 'pb', label: 'Pb' }, { key: 'cd', label: 'Cd' }, { key: 'zn', label: 'Zn' }, { key: 'ph', label: 'pH' },
];
const LEGENDS = {
  category: [...Object.values(CATEGORIES).map((c) => [c.color, c.label]), ['var(--lv-none)', 'Не оцінено / неповні дані']],
  metal: [[BIN_COLORS[0], '< 0,5 ГДК'], [BIN_COLORS[1], '0,5–1 ГДК'], [BIN_COLORS[2], '1–2 ГДК'], [BIN_COLORS[3], '> 2 ГДК'], ['var(--lv-none)', 'Немає даних']],
  ph: [[BIN_COLORS[3], '< 4,5 сильнокислий'], [BIN_COLORS[2], '4,5–5,0'], [BIN_COLORS[1], '5,1–5,5 слабокислий'], [BIN_COLORS[0], '> 5,5'], ['var(--lv-none)', 'Немає даних']],
};

function colorFor(p, mode) {
  if (mode === 'category') return p.category ? CATEGORIES[p.category].color : 'var(--lv-none)';
  const v = p[mode];
  if (v === null || v === undefined) return 'var(--lv-none)';
  if (mode === 'ph') return BIN_COLORS[v < 4.5 ? 3 : v <= 5.0 ? 2 : v <= 5.5 ? 1 : 0];
  const r = v / GDK[mode];
  return BIN_COLORS[r < 0.5 ? 0 : r <= 1 ? 1 : r <= 2 ? 2 : 3];
}

// Підганяє вид під межу області після завантаження GeoJSON
function FitBounds({ geo }) {
  const map = useMap();
  useEffect(() => {
    if (!geo) return undefined;
    const bounds = L.geoJSON(geo).getBounds();
    // Розмір контейнера може змінитися після першого рендера (картки KPI, шрифти) —
    // перераховуємо розмір карти перед підгонкою, інакше Leaflet обирає надто дрібний масштаб
    const fit = () => { map.invalidateSize(); map.fitBounds(bounds, { padding: [10, 10] }); };
    map.whenReady(fit);
    const t1 = setTimeout(fit, 250);
    const t2 = setTimeout(fit, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [geo, map]);
  return null;
}

function Legend({ mode }) {
  const items = mode === 'category' ? LEGENDS.category : mode === 'ph' ? LEGENDS.ph : LEGENDS.metal;
  return (
    <div className="legend leaflet-bottom leaflet-left" style={{ position: 'absolute', left: 10, bottom: 18, zIndex: 500 }}>
      <b className="small">{mode === 'category' ? 'Категорія забруднення' : mode === 'ph' ? 'pH (KCl)' : `${mode.toUpperCase()}, кратність ГДК ${fmt(GDK[mode], 1)} мг/кг`}</b>
      {items.map(([c, t]) => <div key={t}><i style={{ background: c }} />{t}</div>)}
      <div className="muted small" style={{ marginTop: 4 }}>◌ пунктир — середнє по району</div>
    </div>
  );
}

export default function MapPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [geo, setGeo] = useState(null);
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('category');
  const [show, setShow] = useState({ low: true, moderate: true, high: true, critical: true, none: true });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sel, setSel] = useState(null);

  useEffect(() => { fetch('/lviv-oblast.geojson').then((r) => r.json()).then(setGeo).catch(() => {}); }, []);
  useEffect(() => {
    api.mapPoints({ from: from ? `${from}-01-01` : '', to: to ? `${to}-12-31` : '' }).then(setData).catch(setError);
  }, [from, to]);
  useEffect(() => { api.stats().then(setStats).catch(() => {}); }, []);

  const features = useMemo(() => (data?.features || []).filter((f) => show[f.properties.category || 'none']), [data, show]);
  const counts = useMemo(() => {
    const c = { low: 0, moderate: 0, high: 0, critical: 0, none: 0 };
    (data?.features || []).forEach((f) => { c[f.properties.category || 'none'] += 1; });
    return c;
  }, [data]);

  return (
    <>
      {stats && (
        <div className="kpis">
          <div className="card kpi"><div className="muted small">Точок моніторингу</div><div className="v">{stats.counts.locations}</div></div>
          <div className="card kpi"><div className="muted small">Спостережень</div><div className="v">{stats.counts.measurements}</div><div className="muted small">неповних: {stats.counts.incomplete}</div></div>
          <div className="card kpi"><div className="muted small">Оцінок FIS</div><div className="v">{stats.counts.assessments}</div></div>
          <div className="card kpi"><div className="muted small">Наборів альтернатив</div><div className="v">{stats.counts.strategy_sets}</div></div>
        </div>
      )}
      <div className="mapgrid">
        <div className="card mapcard">
          <div className="maptools">
            <div className="row"><span className="muted small">Показник</span>
              <span className="seg">{MODES.map((m) => <button key={m.key} aria-pressed={mode === m.key} onClick={() => setMode(m.key)}>{m.label}</button>)}</span>
            </div>
            <div className="row">
              {[...Object.entries(CATEGORIES), ['none', { label: 'Без оцінки', color: 'var(--lv-none)' }]].map(([k, c]) => (
                <button key={k} className="chip" aria-pressed={show[k]} onClick={() => setShow({ ...show, [k]: !show[k] })}>
                  <i style={{ background: c.color }} />{c.label} <span className="mono">{counts[k]}</span>
                </button>
              ))}
            </div>
            <div className="row small"><span className="muted">Період</span>
              <input id="year-from" className="in" style={{ width: 80 }} placeholder="з року" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              <input id="year-to" className="in" style={{ width: 80 }} placeholder="до року" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <MapContainer center={[49.8, 24.0]} zoom={8} className="leaflet-map" scrollWheelZoom>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {geo && <GeoJSON data={geo} style={{ color: '#2C3A33', weight: 2, fillOpacity: 0.04 }} interactive={false} />}
              <FitBounds geo={geo} />
              {features.map((f) => {
                const p = f.properties;
                const [lon, lat] = f.geometry.coordinates;
                const col = colorFor(p, mode);
                const isDistrict = p.location_type === 'district_average';
                return (
                  <CircleMarker key={p.id} center={[lat, lon]} radius={isDistrict ? 13 : 9}
                    pathOptions={{ color: sel?.id === p.id ? '#111' : '#fff', weight: sel?.id === p.id ? 3 : 2, dashArray: isDistrict ? '4 3' : null,
                      fillColor: getComputedStyle(document.documentElement).getPropertyValue(col.slice(4, -1)).trim() || '#888', fillOpacity: 0.9 }}
                    eventHandlers={{ click: () => setSel(p) }}>
                    <Tooltip direction="top" offset={[0, -8]}>{p.name}{p.score != null ? ` · R = ${fmt(p.score, 2)}` : ''}</Tooltip>
                    <Popup>
                      <b>{p.name}</b><br />
                      {LOCATION_TYPE[p.location_type]}<br />
                      {p.sample_date ? <>Проба: {p.period_label || fmtDate(p.sample_date)}<br /></> : null}
                      {p.score != null ? <>R = <b>{fmt(p.score, 2)}</b> — {CATEGORIES[p.category].label}<br /></> : <>{STATUS_LABEL[p.status]}<br /></>}
                      <a href={`/locations/${p.id}`} onClick={(e) => { e.preventDefault(); nav(`/locations/${p.id}`); }}>Відкрити картку →</a>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
            <Legend mode={mode} />
          </div>
          <ErrorText error={error} />
        </div>

        <aside className="card stack">
          {sel ? (
            <>
              <div>
                <h3 className="cap">{LOCATION_TYPE[sel.location_type]}{sel.district ? ` · ${sel.district}` : ''}</h3>
                <h2>{sel.name}</h2>
                <div className="row" style={{ marginTop: 6 }}><CategoryPill category={sel.category} />{sel.score != null && <span className="mono">R = {fmt(sel.score, 2)}</span>}</div>
              </div>
              <table className="t">
                <tbody>
                  {[['Pb', 'pb', 2], ['Cd', 'cd', 2], ['Zn', 'zn', 2], ['pH', 'ph', 1], ['AP', 'ap', 0]].map(([l, k, d]) => (
                    <tr key={k}><td>{l}</td><td className="n">{fmt(sel[k], d)}</td>
                      <td className="n muted">{GDK[k] && sel[k] != null ? `${fmt(sel[k] / GDK[k], 2)}×ГДК` : ''}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="small muted">{sel.sample_date ? `Остання проба: ${sel.period_label || fmtDate(sel.sample_date)}. ` : ''}{STATUS_LABEL[sel.status]}.</p>
              <Link className="btn" to={`/locations/${sel.id}`}>Картка точки</Link>
            </>
          ) : (
            <>
              <h3 className="cap">Точки моніторингу</h3>
              {!data ? <Loading /> : (
                <table className="t"><tbody>
                  {data.features.map(({ properties: p }) => (
                    <tr key={p.id} className="click" onClick={() => setSel(p)}>
                      <td>{p.name}<div className="muted small">{STATUS_LABEL[p.status]}</div></td>
                      <td className="n">{p.score != null ? fmt(p.score, 2) : '—'}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
              {can('specialist') && <Link className="btn ghost" to="/locations/new">+ Нова точка</Link>}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
