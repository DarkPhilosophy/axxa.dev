import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { coffeeRouter } from './routes/coffee.js';
import { config, getCorsAllowedOrigins } from './config.js';
import { ensureSchema } from './db.js';
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

const healthHandler = (_req, res) => {
  const runtime = getRuntimeStatus();
  res.json({
    ok: true,
    service: 'cafea-backend',
    database: 'postgresql',
    runtime
  });
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
