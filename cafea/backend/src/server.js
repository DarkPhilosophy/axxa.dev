import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { coffeeRouter } from './routes/coffee.js';
import { config, resolvedDbUrl } from './config.js';
import { ensureSchema } from './db.js';
import { ensureBootstrapAdmin, ensureUserColumns } from './services/init.js';

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, namespace: config.dbNamespace, dbUrl: resolvedDbUrl });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/coffee', coffeeRouter);

ensureSchema();
ensureUserColumns();
await ensureBootstrapAdmin();

app.listen(config.port, () => {
  console.log(`[cafea-api] listening on :${config.port}`);
});
