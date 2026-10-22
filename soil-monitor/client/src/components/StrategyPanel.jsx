import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { METHOD_CAT, SITE_LABEL, SUIT } from '../lib/constants.js';
import { ErrorText, Loading } from './ui.jsx';

const ENGINE = { llm_structured_v1: 'LLM (structured output)', deterministic_fallback_v1: 'Резервний детермінований відбір (без LLM)', none: '—' };
const STATUS = { generated: 'Сформовано', validated: 'Перевірено фахівцем', failed: 'Не сформовано', demo: 'Демо' };

function SetView({ set, onValidated }) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      <div className="row small">
        <span className="tag">{STATUS[set.status]}</span>
        <span className="muted">{ENGINE[set.selection_engine] || set.selection_engine}{set.llm_model ? ` · ${set.llm_model}` : ''} · {new Date(set.created_at).toLocaleString('uk-UA')}</span>
        {set.status === 'generated' && can('specialist') && (
          <button className="btn ghost small" onClick={() => api.validateSet(set.id).then(onValidated)}>Позначити як перевірений</button>
        )}
      </div>
      {set.error_message && <div className="banner">{set.error_message}</div>}
      {set.alternatives.map((a) => (
        <div className="alt" key={a.id}>
          <h4><span className="mono muted">{a.rank}.</span>{a.name}<span className="tag">{METHOD_CAT[a.method_category]}</span>
            <span className="tag" style={{ borderColor: a.suitability_status === 'needs_data' ? 'var(--lv-mod)' : 'var(--lv-low)' }}>{SUIT[a.suitability_status]}</span></h4>
          <div className="ai-text"><span className="muted small">Обґрунтування ({set.selection_engine === 'llm_structured_v1' ? 'AI' : 'системне'}):</span><br />{a.explanation}</div>
          <dl>
            <dt>Призначення</dt><dd>{a.purpose}</dd>
            <dt>Умови</dt><dd>{a.application_conditions}</dd>
            <dt>Переваги</dt><dd>{a.advantages}</dd>
            <dt>Обмеження</dt><dd>{a.limitations}</dd>
            {a.missing_data?.length > 0 && <><dt>Бракує даних</dt><dd>{a.missing_data.map((k) => SITE_LABEL[k] || k).join('; ')}</dd></>}
            <dt>Джерела</dt><dd>{(a.sources?.length ? a.sources : [{ source_title: a.source_url, source_url: a.source_url }]).map((s) => (
              <div key={s.source_url}><a href={s.source_url} target="_blank" rel="noreferrer">{s.source_title}</a></div>))}</dd>
          </dl>
        </div>
      ))}
      <button className="btn ghost small" onClick={() => setOpen(!open)}>{open ? 'Сховати' : 'Показати'} скринінг усіх методів</button>
      {open && (
        <div className="tbl"><table className="t small">
          <thead><tr><th>Метод</th><th>Статус</th><th>Порушено</th><th>Бракує</th></tr></thead>
          <tbody>{(set.screening || []).map((s) => (
            <tr key={s.code}><td>{s.name}</td><td>{SUIT[s.status]}</td>
              <td>{s.failed.map((k) => SITE_LABEL[k] || k).join('; ')}</td><td>{s.missing_data.map((k) => SITE_LABEL[k] || k).join('; ')}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function StrategyPanel({ assessmentId }) {
  const { can } = useAuth();
  const [sets, setSets] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const load = () => api.strategySets(assessmentId).then(setSets).catch(setError);
  useEffect(() => { setSets(null); load(); }, [assessmentId]); // eslint-disable-line
  const run = async () => {
    setBusy(true); setError(null);
    try { await api.selectStrategies(assessmentId); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        AI обирає 3–5 методів лише з бази знань після формальної перевірки критеріїв. Це варіанти для фахового розгляду — рішення приймає користувач.
      </p>
      {can('specialist') && <div><button className="btn" onClick={run} disabled={busy}>{busy ? 'Формування…' : 'Сформувати варіанти реагування'}</button></div>}
      <ErrorText error={error} />
      {!sets ? <Loading /> : sets.length === 0 ? <p className="muted small">Наборів альтернатив для цієї оцінки ще немає.</p>
        : <SetView set={sets[0]} onValidated={load} />}
      {sets?.length > 1 && <p className="muted small">Попередніх наборів: {sets.length - 1} (зберігаються в історії).</p>}
    </div>
  );
}
