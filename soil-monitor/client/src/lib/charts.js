import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);
ChartJS.defaults.font.family = '"Golos Text", system-ui, sans-serif';

// Кольори з CSS-токенів, щоб графіки працювали у світлій і темній темі
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
export const themeColors = () => ({
  ink: cssVar('--ink'), muted: cssVar('--muted'), line: cssVar('--line'), accent: cssVar('--accent'),
  low: cssVar('--lv-low'), moderate: cssVar('--lv-mod'), high: cssVar('--lv-high'), critical: cssVar('--lv-crit'), none: cssVar('--lv-none'),
});
export const baseOptions = (c) => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { labels: { color: c.ink, boxWidth: 12 } } },
  scales: {
    x: { ticks: { color: c.muted }, grid: { color: c.line } },
    y: { ticks: { color: c.muted }, grid: { color: c.line } },
  },
});
