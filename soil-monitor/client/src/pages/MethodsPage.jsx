import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { METHOD_CAT, SITE_LABEL } from '../lib/constants.js';
import { ErrorText, Loading } from '../components/ui.jsx';

function Editor({ m, onDone }) {
  const [d, setD] = useState({ name: m.name, purpose: m.purpose, application_conditions: m.application_conditions, advantages: m.advantages, limitations: m.limitations, active: m.active, source_url: m.source_url });
  const [error, setError] = useState(null);
  const f = (k, l, area) => <label className="f"><span>{l}</span>{area ? <textarea id={`me-${k}`} className="in" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} /> : <input id={`me-${k}`} className="in" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />}</label>;
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); api.updateMethod(m.id, d).then(onDone).catch(setError); }}>
      {f('name', 'Назва')}{f('purpose', 'Призначення', 1)}{f('application_conditions', 'Умови застосування', 1)}{f('advantages', 'Переваги', 1)}{f('limitations', 'Обмеження', 1)}{f('source_url', 'Джерело (URL)')}
      <label className="row small"><input id={`me-active-${m.id}`} type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Активний (бере участь у відборі)</label>
      <ErrorText error={error} />
      <div className="row"><button className="btn small">Зберегти (версія +1)</button><button type="button" className="btn ghost small" onClick={() => onDone()}>Скасувати</button></div>
    </form>
  );
}

export default function MethodsPage() {
  const { can } = useAuth();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.methods().then(setList).catch(setError);
  useEffect(() => { load(); }, []);
  if (!list) return error ? <ErrorText error={error} /> : <Loading />;
  return (
    <div className="stack">
      <div><h1 className="pg">База знань методів реагування</h1>
        <p className="sub">{list.length} методів і {list.reduce((s, m) => s + m.criteria.length, 0)} структурованих критеріїв (remediation_methods, method_criteria). AI обирає альтернативи лише з цього каталогу після формального скринінгу. Критерії — проєктний інженерний скринінг, а не нормативна матриця призначення технологій.</p></div>
      {list.map((m) => (
        <div className="card" key={m.id}>
          {edit === m.id ? <Editor m={m} onDone={() => { setEdit(null); load(); }} /> : (
            <div className="grid2">
              <div>
                <div className="row"><span className="mono muted">{m.code}</span><span className="tag">{METHOD_CAT[m.category]}</span>{!m.active && <span className="tag">неактивний</span>}<span className="muted small">v{m.version}</span></div>
                <h2 style={{ marginTop: 4 }}>{m.name}</h2>
                <p className="small" style={{ margin: '4px 0' }}><b>Призначення.</b> {m.purpose}</p>
                <p className="small" style={{ margin: '4px 0' }}><b>Умови.</b> {m.application_conditions}</p>
                <p className="small" style={{ margin: '4px 0' }}><b>Переваги.</b> {m.advantages}</p>
                <p className="small" style={{ margin: '4px 0' }}><b>Обмеження.</b> {m.limitations}</p>
                <p className="small" style={{ margin: '4px 0' }}>{m.sources.map((s) => <a key={s.id} href={s.source_url} target="_blank" rel="noreferrer">{s.source_title}</a>)}</p>
                {can('admin') && <button className="btn ghost small" onClick={() => setEdit(m.id)}>Редагувати</button>}
              </div>
              <div className="tbl">
                <h3 className="cap">Критерії придатності</h3>
                <table className="t small"><thead><tr><th>Умова</th><th>Очікується</th><th>Обов’язкова</th></tr></thead>
                  <tbody>{m.criteria.map((c) => <tr key={c.id}><td>{SITE_LABEL[c.condition_key] || c.condition_key}<div className="mono muted">{c.condition_key}</div></td>
                    <td className="mono">{c.operator === 'in' ? `∈ {${c.expected_value}}` : c.expected_value}</td><td>{c.is_required ? 'так' : 'ні'}</td></tr>)}</tbody></table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
