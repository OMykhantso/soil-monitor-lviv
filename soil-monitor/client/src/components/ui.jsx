import { CATEGORIES, fmt } from '../lib/constants.js';

export function CategoryPill({ category }) {
  if (!category) return <span className="pill" style={{ background: 'var(--lv-none)' }}>Не оцінено</span>;
  const c = CATEGORIES[category];
  return <span className="pill" style={{ background: c.color }}>{c.label}</span>;
}

// Шкала R ∈ [0; 10]
export function ScoreGauge({ score }) {
  return <div className="gauge" aria-label={`Інтегральний бал ${fmt(score, 2)} з 10`}><b style={{ left: `${(score / 10) * 100}%` }} /></div>;
}

export function Loading({ text = 'Завантаження…' }) { return <p className="muted">{text}</p>; }
export function ErrorText({ error }) {
  if (!error) return null;
  const det = Array.isArray(error.details) ? error.details.map((d) => (d.field ? `${d.field}: ${d.message}` : JSON.stringify(d))).join('; ')
    : error.details?.missing ? `Бракує: ${error.details.missing.join(', ')}${error.details.hint ? '. ' + error.details.hint : ''}`
      : typeof error.details === 'string' ? error.details : '';
  return <p className="err" role="alert">{error.message}{det ? ` — ${det}` : ''}</p>;
}
