import { useEffect, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { api } from '../lib/api.js';
import { baseOptions, themeColors } from '../lib/charts.js';
import { CATEGORY_CODE_FROM_UK, GDK, fmt } from '../lib/constants.js';
import { CategoryPill, ErrorText, Loading, ScoreGauge } from '../components/ui.jsx';
import OutputChart from '../components/OutputChart.jsx';

const STEP = { pb: 0.1, cd: 0.01, zn: 0.5, ph: 0.1, ap: 1 };
const mu = (x, p) => {
  let [a, b, c, d] = p; if (d === undefined) { d = c; c = b; }
  if (x < a || x > d) return 0; if (x < b) return b === a ? 1 : (x - a) / (b - a); if (x <= c) return 1; return d === c ? 1 : (d - x) / (d - c);
};

function InputChart({ input, value }) {
  const c = themeColors();
  const [lo, hi] = input.range;
  const xs = Array.from({ length: 121 }, (_, i) => lo + ((hi - lo) * i) / 120);
  const cols = [c.low, c.moderate, c.high];
  const data = { datasets: [
    ...input.terms.map((t, i) => ({ label: t.name, data: xs.map((x) => ({ x, y: mu(x, t.params) })), borderColor: cols[i], pointRadius: 0, borderWidth: 2 })),
    { label: `значення ${fmt(value, 2)}`, data: [{ x: value, y: 0 }, { x: value, y: 1.05 }], borderColor: c.ink, borderWidth: 2, pointRadius: 0 },
  ] };
  const o = baseOptions(c);
  o.scales.x = { type: 'linear', min: lo, max: hi, ticks: { color: c.muted }, grid: { color: c.line } };
  o.scales.y = { min: 0, max: 1.05, ticks: { color: c.muted }, grid: { color: c.line } };
  return <div style={{ height: 190 }}><Line data={data} options={o} /></div>;
}

export default function FisPage() {
  const [model, setModel] = useState(null);
  const [v, setV] = useState({ pb: 6, cd: 0.7, zn: 23, ph: 6.8, ap: 1 });
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const [show, setShow] = useState('pb');
  const t = useRef();
  useEffect(() => { api.fisModel().then(setModel).catch(setError); }, []);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => api.fisEvaluate(v).then((r) => { setRes(r); setError(null); }).catch(setError), 150);
  }, [v]);
  if (!model) return error ? <ErrorText error={error} /> : <Loading />;
  const input = model.inputs.find((i) => i.key === show);
  return (
    <div className="stack">
      <div>
        <h1 className="pg">Нечітка модель А</h1>
        <p className="sub">Ручний запуск моделі Мамдані без збереження: 5 входів × 3 терми, 243 правила, AND/імплікація — min, агрегація — max, дефазифікація — центроїд (1001 точка). Входи — фактичні концентрації, а не кратності ГДК.</p>
      </div>
      <div className="grid2">
        <div className="card">
          <h3 className="cap">Вхідні змінні</h3>
          {model.inputs.map((i) => (
            <div className="slider" key={i.key}>
              <label htmlFor={`fis-${i.key}`}><span>{i.name}{GDK[i.key] ? `, мг/кг (ГДК ${fmt(GDK[i.key], 1)})` : i.key === 'ap' ? ' — експертна сума 0..10' : ''}</span>
                <span className="mono">{fmt(v[i.key], i.key === 'ap' ? 0 : 2)}{GDK[i.key] ? ` · ${fmt(v[i.key] / GDK[i.key], 2)}×` : ''}</span></label>
              <input id={`fis-${i.key}`} type="range" min={i.range[0]} max={i.range[1]} step={STEP[i.key]} value={v[i.key]}
                onChange={(e) => setV({ ...v, [i.key]: Number(e.target.value) })} />
              {res && <div className="mf">{Object.entries(res.input_memberships[i.name]).map(([tn, m]) => <span key={tn} className={m > 0 ? 'on' : ''}>{tn} {fmt(m, 2)}</span>)}</div>}
            </div>
          ))}
          <h3 className="cap">Функції належності входу</h3>
          <span className="seg" style={{ marginBottom: 8 }}>{model.inputs.map((i) => <button key={i.key} aria-pressed={show === i.key} onClick={() => setShow(i.key)}>{i.name}</button>)}</span>
          <InputChart input={input} value={v[show]} />
        </div>
        <div className="card stack">
          <h3 className="cap">Результат</h3>
          <ErrorText error={error} />
          {res && (
            <>
              <div className="row"><span className="big">{fmt(res.score, 2)}</span><CategoryPill category={CATEGORY_CODE_FROM_UK[res.category]} />
                <span className="muted small">активних правил: {res.active_rule_count}</span></div>
              <ScoreGauge score={res.score} />
              <OutputChart curve={res.curve} model={model} score={res.score} height={260} />
              <h3 className="cap">Найбільш активовані правила</h3>
              <table className="t small"><tbody>
                {res.top_rules.map((r) => <tr key={r.id}><td className="n">{fmt(r.activation, 2)}</td>
                  <td>R{r.id}: {Object.entries(r.antecedent).map(([k, x]) => `${k} ${x}`).join(' ∧ ')} → <b>{r.output}</b></td></tr>)}
              </tbody></table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
