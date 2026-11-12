// Тема інтерфейсу: 'auto' (системна), 'white' (біла), 'dark' (темна)
const KEY = 'theme';
export const THEMES = { auto: 'Системна', white: 'Біла', dark: 'Темна' };
export const getTheme = () => {
  try { const t = localStorage.getItem(KEY); return t in THEMES ? t : 'auto'; } catch { return 'auto'; }
};
export const applyTheme = (t) => {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
};
export const saveTheme = (t) => { try { localStorage.setItem(KEY, t); } catch { /* сховище недоступне */ } applyTheme(t); };
