import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMapEvents } from 'react-leaflet';
import { api } from '../lib/api.js';
import { LAND_USE, LOCATION_TYPE, SOURCE_STATUS } from '../lib/constants.js';
import { ErrorText } from '../components/ui.jsx';

function ClickPicker({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}

const EMPTY = { name: '', latitude: '', longitude: '', land_use: 'agricultural', source_status: 'unknown', description: '', district: '', location_type: 'sampling_site' };

export default function LocationForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(EMPTY);
  const [geo, setGeo] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { fetch('/lviv-oblast.geojson').then((r) => r.json()).then(setGeo).catch(() => {}); }, []);
  useEffect(() => { if (id) api.location(id).then((l) => setD({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, l[k] ?? ''])) })).catch(setError); }, [id]);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    const body = { ...d, latitude: Number(d.latitude), longitude: Number(d.longitude), description: d.description || null, district: d.district || null };
    try {
      const r = id ? await api.updateLocation(id, body) : await api.createLocation(body);
      nav(`/locations/${r.id}`);
    } catch (err) { setError(err); }
  };
  const lat = Number(d.latitude); const lon = Number(d.longitude);
  return (
    <form className="card stack" onSubmit={submit}>
      <h1 className="pg">{id ? 'Редагування точки' : 'Нова точка моніторингу'}</h1>
      <div className="grid2">
        <div className="stack">
          <label className="f"><span>Назва</span><input id="loc-name" className="in" value={d.name} onChange={set('name')} required /></label>
          <div className="form-grid">
            <label className="f"><span>Широта, °N</span><input id="loc-lat" className="in mono" value={d.latitude} onChange={set('latitude')} required inputMode="decimal" /></label>
            <label className="f"><span>Довгота, °E</span><input id="loc-lon" className="in mono" value={d.longitude} onChange={set('longitude')} required inputMode="decimal" /></label>
          </div>
          <div className="form-grid">
            <label className="f"><span>Тип запису</span><select id="loc-type" className="in" value={d.location_type} onChange={set('location_type')}>{Object.entries(LOCATION_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="f"><span>Землекористування</span><select id="loc-lu" className="in" value={d.land_use} onChange={set('land_use')}>{Object.entries(LAND_USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="f"><span>Джерело забруднення</span><select id="loc-src" className="in" value={d.source_status} onChange={set('source_status')}>{Object.entries(SOURCE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="f"><span>Район</span><input id="loc-district" className="in" value={d.district} onChange={set('district')} /></label>
          </div>
          <label className="f"><span>Опис місцевості</span><textarea id="loc-desc" className="in" value={d.description} onChange={set('description')} /></label>
          <ErrorText error={error} />
          <div><button className="btn">Зберегти</button></div>
        </div>
        <div>
          <p className="small muted" style={{ marginTop: 0 }}>Клацніть на карті, щоб задати координати.</p>
          <MapContainer center={[49.8, 24.0]} zoom={7} style={{ height: 380, borderRadius: 8 }}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {geo && <GeoJSON data={geo} style={{ color: '#2C3A33', weight: 2, fillOpacity: 0.03 }} interactive={false} />}
            <ClickPicker onPick={(p) => setD((x) => ({ ...x, latitude: p.lat.toFixed(6), longitude: p.lng.toFixed(6) }))} />
            {Number.isFinite(lat) && Number.isFinite(lon) && d.latitude !== '' && <CircleMarker center={[lat, lon]} radius={8} pathOptions={{ color: '#2B4C9B' }} />}
          </MapContainer>
        </div>
      </div>
    </form>
  );
}
