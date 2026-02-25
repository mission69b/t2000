import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { sponsor } from './routes/sponsor.js';
import { health } from './routes/health.js';
import { gas } from './routes/gas.js';
import { fees } from './routes/fees.js';
import { x402 } from './routes/x402.js';
import { startPriceCache } from './lib/priceCache.js';

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});

const app = new Hono();

app.use('*', cors());

app.route('/', sponsor);
app.route('/', health);
app.route('/', gas);
app.route('/', fees);
app.route('/', x402);

app.get('/', (c) => c.json({ service: 't2000-server', version: '0.1.0' }));

const port = parseInt(process.env.PORT ?? '3000', 10);

startPriceCache();
console.log(`t2000 server starting on port ${port}`);

serve({ fetch: app.fetch, port });

export default app;
