// REST-клієнт до Node/Express. Токен зберігається в localStorage.
const TOKEN_KEY = 'soil_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Помилка ${status}`);
    this.status = status;
    this.details = body?.details;
  }
}

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch('/api' + path, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') { setToken(null); window.dispatchEvent(new Event('auth:logout')); }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),
  mapPoints: (q = {}) => request('/map/points?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v))),
  locations: () => request('/locations'),
  location: (id) => request(`/locations/${id}`),
  createLocation: (d) => request('/locations', { method: 'POST', body: d }),
  updateLocation: (id, d) => request(`/locations/${id}`, { method: 'PUT', body: d }),
  updateSite: (id, d) => request(`/locations/${id}/site`, { method: 'PUT', body: d }),
  createMeasurement: (d) => request('/measurements', { method: 'POST', body: d }),
  setAp: (id, ap_details) => request(`/measurements/${id}/ap`, { method: 'PATCH', body: { ap_details } }),
  createException: (d) => request('/measurement-exceptions', { method: 'POST', body: d }),
  importCsv: (file) => { const f = new FormData(); f.append('file', file); return request('/import/measurements', { method: 'POST', form: f }); },
  assess: (measurement_id) => request('/assessments', { method: 'POST', body: { measurement_id } }),
  assessBatch: () => request('/assessments/batch', { method: 'POST', body: {} }),
  assessment: (id) => request(`/assessments/${id}`),
  fisModel: () => request('/fis/model'),
  fisHealth: () => request('/fis/health'),
  fisEvaluate: (d) => request('/fis/evaluate', { method: 'POST', body: d }),
  methods: () => request('/remediation-methods'),
  updateMethod: (id, d) => request(`/remediation-methods/${id}`, { method: 'PUT', body: d }),
  selectStrategies: (assessment_id) => request('/strategies/select', { method: 'POST', body: { assessment_id } }),
  strategySets: (assessment_id) => request(`/strategies/sets?assessment_id=${assessment_id}`),
  validateSet: (id) => request(`/strategies/sets/${id}/validate`, { method: 'PATCH', body: {} }),
  stats: () => request('/stats'),
  users: () => request('/users'),
  createUser: (d) => request('/users', { method: 'POST', body: d }),
  updateUser: (id, d) => request(`/users/${id}`, { method: 'PATCH', body: d }),
};
