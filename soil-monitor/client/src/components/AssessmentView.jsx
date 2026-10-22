import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORIES, GDK, fmt } from '../lib/constants.js';
import { CategoryPill, ScoreGauge } from './ui.jsx';
import OutputChart from './OutputChart.jsx';

export default function AssessmentView({ assessment }) {
  const [model, setModel] = useState(null);
  useEffect(() => { api.fisModel().then(setModel).catch(() => {}); }, []);
  const d = assessment.result_details || {};
  return (
    <div className="stack">
      <div className="row" style={{ gap: 14 }}>
        <span className="big">{fmt(assessment.score, 2)}</span>
        <CategoryPill category={assessment.category} />
        <span className="muted small">з 10 · модель {assessment.model_version} · {new Date(assessment.created_at).toLocaleString('uk-UA')}</span>
      </div>
      <ScoreGauge score={assessment.score} />
      <p className="small muted" style={{ margin: 0 }}>
        Категорію визначає нечітка модель Мамдані (5 входів, 243 правила, min/max, центроїд). Колір — допоміжний; рівень: «{CATEGORIES[assessment.category].label.toLowerCase()}».
      </p>
      <div className="grid2">
        <div>
          <h3 className="cap">Кратність ГДК (довідково)</h3>
          <table className="t"><tbody>
            {Object.entries(d.multiples_gdk || {}).map(([k, v]) => (
              <tr key={k}><td>{k.toUpperCase()} <span className="muted small">ГДК {fmt(GDK[k], 1)} мг/кг</span></td>
                <td className={'n ' + (v > 1 ? 'over' : '')}>{fmt(v, 2)}×</td></tr>
            ))}
          </tbody></table>
          <h3 className="cap" style={{ marginTop: 12 }}>Ступені належності входів</h3>
          <table className="t small"><tbody>
            {Object.entries(d.input_memberships || {}).map(([inp, terms]) => (
              <tr key={inp}><td>{inp}</td><td className="mf">{Object.entries(terms).map(([t, v]) => <span key={t} className={v > 0 ? 'on' : ''}>{t} {fmt(v, 2)}</span>)}</td></tr>
            ))}
          </tbody></table>
        </div>
        <div>
          <h3 className="cap">Найбільш активовані правила ({d.active_rule_count} з 243)</h3>
          <table className="t small"><tbody>
            {(d.top_rules || []).slice(0, 8).map((r) => (
              <tr key={r.id}><td className="n">{fmt(r.activation, 2)}</td>
                <td>R{r.id}: {Object.entries(r.antecedent).map(([k, v]) => `${k} ${v}`).join(' ∧ ')} → <b>{r.output}</b></td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
      {d.curve && model && <OutputChart curve={d.curve} model={model} score={assessment.score} />}
    </div>
  );
}
