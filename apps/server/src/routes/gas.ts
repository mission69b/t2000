import { Hono } from 'hono';
import {
  sponsorTransaction,
  recordGasSponsorship,
  getBootstrapCount,
  type GasRequestType,
} from '../services/gasStation.js';
import { isCircuitBreakerTripped, getSuiPriceTwap } from '../lib/priceCache.js';

const gas = new Hono();

gas.post('/api/gas', async (c) => {
  const body = await c.req.json<{
    txBytes: string;
    sender: string;
    type?: GasRequestType;
  }>();

  if (!body.txBytes || !body.sender) {
    return c.json({ error: 'txBytes and sender are required' }, 400);
  }

  try {
    const result = await sponsorTransaction(body.txBytes, body.sender, body.type);
    return c.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Gas sponsorship failed';

    if (msg.startsWith('CIRCUIT_BREAKER')) {
      return c.json({ error: 'CIRCUIT_BREAKER', message: msg, retryAfter: 300 }, 503);
    }
    if (msg.startsWith('POOL_DEPLETED')) {
      return c.json({ error: 'POOL_DEPLETED', message: msg, retryAfter: 600 }, 503);
    }
    if (msg.startsWith('GAS_FEE_EXCEEDED')) {
      return c.json({ error: 'GAS_FEE_EXCEEDED', message: msg, retryAfter: 60 }, 429);
    }

    console.error('[gas] Error:', msg);
    return c.json({ error: 'GAS_SPONSOR_FAILED', message: msg }, 500);
  }
});

gas.post('/api/gas/report', async (c) => {
  const body = await c.req.json<{
    sender: string;
    txDigest: string;
    gasCostSui: number;
    usdcCharged: number;
    type: GasRequestType;
  }>();

  try {
    await recordGasSponsorship(
      body.sender,
      body.txDigest,
      body.gasCostSui,
      body.usdcCharged,
      body.type,
    );
    return c.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Report failed';
    return c.json({ error: msg }, 500);
  }
});

gas.get('/api/gas/status', async (c) => {
  const address = c.req.query('address');

  const status: Record<string, unknown> = {
    circuitBreaker: isCircuitBreakerTripped(),
    suiPrice: getSuiPriceTwap(),
  };

  if (address) {
    const bootstrapCount = await getBootstrapCount(address);
    status.bootstrapUsed = bootstrapCount;
    status.bootstrapRemaining = Math.max(0, 10 - bootstrapCount);
  }

  return c.json(status);
});

export { gas };
