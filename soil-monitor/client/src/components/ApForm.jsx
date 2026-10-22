import { useEffect, useState } from 'react';
import { AP_CRITERIA } from '../lib/constants.js';

const LEVELS = [[0, 'немає'], [1, 'помірний'], [2, 'значний']];

// Експертна анкета AP: 5 критеріїв × 0..2 → сума 0..10
export default function ApForm({ initial, onSave, onChange, disabled }) {
  const [v, setV] = useState(() => Object.fromEntries(AP_CRITERIA.map((c) => [c.key, initial?.[c.key] ?? 0])));
  useEffect(() => { onChange?.(v); }, [v]); // eslint-disable-line
  const sum = Object.values(v).reduce((a, b) => a + b, 0);
  return (
    <div className="stack">
      {AP_CRITERIA.map((c) => (
        <div key={c.key} className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small">{c.label}</span>
          <span className="seg">{LEVELS.map(([n, l]) => (
            <button type="button" key={n} aria-pressed={v[c.key] === n} disabled={disabled} onClick={() => setV({ ...v, [c.key]: n })}>{n} · {l}</button>
          ))}</span>
        </div>
      ))}
      <div className="row"><b>AP = <span className="mono">{sum}</span></b><span className="muted small">з 10</span>
        {onSave && <button className="btn small" type="button" disabled={disabled} onClick={() => onSave(v)}>Зберегти AP</button>}</div>
    </div>
  );
}
