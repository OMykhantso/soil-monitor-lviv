import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/soil_monitoring',
  fisUrl: (process.env.FIS_URL || 'http://localhost:8000').replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtTtl: process.env.JWT_TTL || '12h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@soil.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin12345',
};

if (config.jwtSecret === 'change-me-in-production' && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
