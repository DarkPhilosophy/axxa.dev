import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { coffeeRouter } from './routes/coffee.js';
import { config, getCorsAllowedOrigins } from './config.js';
import { ensureSchema } from './db.js';
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
  res.json({ ok: true, database: 'postgresql' });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/coffee', coffeeRouter);

await ensureSchema();
await ensureUserColumns();
await ensureBootstrapAdmin();

app.listen(config.port, () => {
  console.log("[cafea-api] listening on :" + config.port);
});
