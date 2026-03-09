import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { sponsor } from './routes/sponsor.js';
import { health } from './routes/health.js';
import { gas } from './routes/gas.js';
import { fees } from './routes/fees.js';
import { x402 } from './routes/x402.js';
import { startPriceCache } from './lib/priceCache.js';
import { testDatabaseConnection } from './db/prisma.js';

const REQUIRED_ENV = ['DATABASE_URL', 'SPONSOR_PRIVATE_KEY', 'GAS_STATION_PRIVATE_KEY'];
const missing = REQUIRED_ENV.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[server] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});

const app = new Hono();

app.use('*', cors({
  origin: ['https://t2000.ai', 'https://api.t2000.ai'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
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

app.route('/', sponsor);
app.route('/', health);
app.route('/', gas);
app.route('/', fees);
app.route('/', x402);

app.get('/', (c) => c.json({ service: 't2000-server', version: '0.1.0' }));

const port = parseInt(process.env.PORT ?? '3000', 10);

(async () => {
  await testDatabaseConnection();
  startPriceCache();
  console.log(`t2000 server starting on port ${port}`);
  serve({ fetch: app.fetch, port });
})();

export default app;
