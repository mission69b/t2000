// [SPEC 30 D-14 — 2026-05-14] Importing the env module triggers boot-time
// Zod validation. Throws a structured error before any service starts up
// when required vars (DATABASE_URL, AUDRIC_INTERNAL_KEY,
// T2000_OVERLAY_FEE_WALLET) are missing or empty. Replaces the previous
// ad-hoc `REQUIRED_ENV.filter` check which only covered `DATABASE_URL`
// and silently let the others ship as empty strings.
import { env } from './env.js';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { health } from './routes/health.js';
import { testDatabaseConnection } from './db/prisma.js';

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});

const app = new Hono();

app.use('*', cors({
  origin: ['https://t2000.ai', 'https://audric.ai', 'https://app.t2000.ai', 'https://api.t2000.ai'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-internal-key'],
}));
app.use('*', bodyLimit({ maxSize: 256 * 1024 }));

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  if (c.req.path !== '/api/health') {
    console.log(`[server] ${c.req.method} ${c.req.path} → ${status} (${ms}ms)`);
  }
});

app.route('/', health);
// [B5 v2 / 2026-04-30] /api/fees POST + GET removed. Fees are now indexed
// directly from on-chain USDC transfers to T2000_OVERLAY_FEE_WALLET. Stats
// API queries `ProtocolFeeLedger` via Prisma directly.

app.get('/', (c) => c.json({ service: 't2000-server', version: '0.1.0' }));

const port = env.PORT;

(async () => {
  await testDatabaseConnection();
  console.log(`t2000 server starting on port ${port}`);
  serve({ fetch: app.fetch, port });
})();

export default app;
