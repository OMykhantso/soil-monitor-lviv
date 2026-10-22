import { useState } from 'react';
import { SITE_KEYS } from '../lib/constants.js';

const toSel = (v) => (v === true ? 'true' : v === false ? 'false' : '');
const fromSel = (s) => (s === 'true' ? true : s === 'false' ? false : null);

// Характеристики ділянки для скринінгу методів. «Невідомо» = NULL → needs_data
export default function SiteForm({ site, onSave, disabled }) {
  const [v, setV] = useState(() => Object.fromEntries(SITE_KEYS.map(([k]) => [k, site?.[k] ?? null])));
  const [notes, setNotes] = useState(site?.notes || '');
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ ...v, notes: notes || null }); }}>
      <div className="form-grid">
        {SITE_KEYS.map(([k, label]) => (
          <label className="f" key={k}><span>{label}</span>
            <select id={`site-${k}`} className="in" value={toSel(v[k])} disabled={disabled} onChange={(e) => setV({ ...v, [k]: fromSel(e.target.value) })}>
              <option value="">Невідомо</option><option value="true">Так</option><option value="false">Ні</option>
            </select>
          </label>
        ))}
      </div>
      <label className="f"><span>Примітки</span><textarea id="site-notes" className="in" value={notes} disabled={disabled} onChange={(e) => setNotes(e.target.value)} /></label>
      {!disabled && <div><button className="btn small">Зберегти характеристики</button></div>}
    </form>
  );
}
