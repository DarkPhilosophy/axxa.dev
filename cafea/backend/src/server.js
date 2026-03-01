import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { coffeeRouter } from './routes/coffee.js';
import { config, getCorsAllowedOrigins } from './config.js';
import { ensureSchema, one } from './db.js';
import { getRuntimeStatus, recordRuntimeError } from './runtime-status.js';
import { ensureBootstrapAdmin, ensureUserColumns } from './services/init.js';

const app = express();
const allowedOrigins = getCorsAllowedOrigins();
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    }
  })
);
app.use(express.json({ limit: '1mb' }));

const healthHandler = async (_req, res) => {
  const pingStartedAt = process.hrtime.bigint();
  const runtime = getRuntimeStatus();
  try {
    await one('SELECT 1 AS ok');
    const dbPingMs = Number(process.hrtime.bigint() - pingStartedAt) / 1_000_000;
    return res.json({
      ok: true,
      service: 'cafea-backend',
      database: 'postgresql',
      db_ping_ms: Number(dbPingMs.toFixed(2)),
      runtime
    });
  } catch (err) {
    recordRuntimeError('health.db_ping', err);
    return res.status(503).json({
      ok: false,
      service: 'cafea-backend',
      database: 'postgresql',
      db_ping_ms: null,
      error: 'database_unreachable',
      runtime
    });
  }
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/coffee', coffeeRouter);

await ensureSchema();
await ensureUserColumns();
await ensureBootstrapAdmin();

process.on('unhandledRejection', (reason) => {
  recordRuntimeError('process.unhandledRejection', reason);
  console.error('[process/unhandledRejection]', reason?.message || reason);
});

process.on('uncaughtExceptionMonitor', (err) => {
  recordRuntimeError('process.uncaughtException', err);
  console.error('[process/uncaughtException]', err?.message || err);
});

app.listen(config.port, () => {
  console.log("[cafea-api] listening on :" + config.port);
});
