import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { sponsor } from './routes/sponsor.js';
import { health } from './routes/health.js';
import { gas } from './routes/gas.js';
import { startPriceCache } from './lib/priceCache.js';

const app = new Hono();

app.use('*', cors());

app.route('/', sponsor);
app.route('/', health);
app.route('/', gas);

app.get('/', (c) => c.json({ service: 't2000-server', version: '0.1.0' }));

const port = parseInt(process.env.PORT ?? '3000', 10);

startPriceCache();
console.log(`t2000 server starting on port ${port}`);

serve({ fetch: app.fetch, port });

export default app;
