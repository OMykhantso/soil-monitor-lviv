import { config } from '../config.js';
import { HttpError } from './errors.js';

// Клієнт внутрішнього Python/FastAPI сервісу (модель А + AI-відбір)
async function call(path, { method = 'GET', body, timeoutMs = 90000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(config.fisUrl + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new HttpError(503, 'Сервіс нечіткого оцінювання (Python) недоступний', String(e.message || e));
  } finally {
    clearTimeout(t);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : data.detail || data;
    throw new HttpError(res.status === 422 ? 422 : 502, res.status === 422 ? 'Вхідні дані поза областю моделі' : 'Помилка Python-сервісу', detail);
  }
  return data;
}

export const fis = {
  health: () => call('/health', { timeoutMs: 5000 }),
  model: () => call('/model'),
  evaluate: (input) => call('/evaluate', { method: 'POST', body: input }),
  strategies: (payload) => call('/strategies', { method: 'POST', body: payload, timeoutMs: 150000 }),
};

export const CATEGORY_CODE = { 'низький': 'low', 'помірний': 'moderate', 'високий': 'high', 'критичний': 'critical' };
export const CATEGORY_UK = Object.fromEntries(Object.entries(CATEGORY_CODE).map(([k, v]) => [v, k]));
