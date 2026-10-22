import { Line } from 'react-chartjs-2';
import { baseOptions, themeColors } from '../lib/charts.js';
import { fmt } from '../lib/constants.js';

const tri = (x, [a, b, c, d]) => {
  if (d === undefined) { d = c; c = b; }
  if (x < a || x > d) return 0;
  if (x < b) return b === a ? 1 : (x - a) / (b - a);
  if (x <= c) return 1;
  return d === c ? 1 : (d - x) / (d - c);
};

// Вихідні функції належності + агрегована множина + центроїд (бал R)
export default function OutputChart({ curve, model, score, height = 240 }) {
  const c = themeColors();
  const cols = [c.low, c.moderate, c.high, c.critical];
  const xs = curve.x;
  const datasets = (model?.output?.terms || []).map((t, i) => ({
    label: t.name, data: xs.map((x) => tri(x, t.params)), borderColor: cols[i], borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false,
  }));
  datasets.push({ label: 'Агрегована множина', data: curve.aggregate, borderColor: c.ink, backgroundColor: c.accent + '55', borderWidth: 2, pointRadius: 0, fill: true });
  const opts = baseOptions(c);
  opts.scales.x = { type: 'linear', min: 0, max: 10, ticks: { color: c.muted }, grid: { color: c.line }, title: { display: true, text: 'R', color: c.muted } };
  opts.scales.y = { min: 0, max: 1.05, ticks: { color: c.muted }, grid: { color: c.line }, title: { display: true, text: 'μ', color: c.muted } };
  const data = { datasets: [
    ...datasets.map((d) => ({ ...d, data: d.data.map((y, i) => ({ x: xs[i], y })) })),
    { label: `Центроїд R = ${fmt(score, 2)}`, data: [{ x: score, y: 0 }, { x: score, y: 1.05 }], borderColor: c.ink, borderWidth: 2.5, pointRadius: 0, fill: false },
  ] };
  return <div style={{ height }}><Line data={data} options={opts} /></div>;
}
