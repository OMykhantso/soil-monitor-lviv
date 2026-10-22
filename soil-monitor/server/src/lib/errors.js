export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  if (err?.name === 'ZodError') {
    return res.status(422).json({
      error: 'Некоректні дані',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.code === '23514') return res.status(422).json({ error: 'Значення порушує обмеження БД', details: err.constraint });
  if (err?.code === '23503') return res.status(409).json({ error: 'Посилання на неіснуючий або пов’язаний запис', details: err.constraint });
  if (err?.code === '23505') return res.status(409).json({ error: 'Запис уже існує', details: err.constraint });
  if (['ECONNREFUSED', '57P03', '53300'].includes(err?.code)) return res.status(503).json({ error: 'База даних тимчасово недоступна' });
  console.error(err);
  res.status(500).json({ error: 'Внутрішня помилка сервера' });
}
