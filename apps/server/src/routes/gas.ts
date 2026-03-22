import { Hono } from 'hono';
import { isValidSuiAddress } from '@mysten/sui/utils';
import {
  sponsorTransaction,
  recordGasSponsorship,
  getBootstrapCount,
  type GasRequestType,
} from '../services/gasStation.js';
import { isCircuitBreakerTripped, getSuiPriceTwap } from '../lib/priceCache.js';
import { createChallenge, formatChallenge, verifyStamp } from '../lib/hashcash.js';
import { prisma } from '../db/prisma.js';

const gas = new Hono();

const SENDER_RATE_LIMIT = 20;
const SENDER_RATE_WINDOW_MS = 60 * 60 * 1000;

async function checkSenderRateLimit(sender: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - SENDER_RATE_WINDOW_MS);
  const count = await prisma.gasLedger.count({
    where: { agentAddress: sender, createdAt: { gte: windowStart } },
  });
  return count < SENDER_RATE_LIMIT;
}

gas.post('/api/gas', async (c) => {
  const body = await c.req.json<{
    txJson?: string;
    txBytes?: string;
    txBcsBytes?: string;
    sender: string;
    type?: GasRequestType;
    proof?: string;
  }>();

  if ((!body.txJson && !body.txBytes && !body.txBcsBytes) || !body.sender) {
    return c.json({ error: 'txJson, txBytes, txBcsBytes, or sender missing' }, 400);
  }

  if (!isValidSuiAddress(body.sender)) {
    return c.json({ error: 'INVALID_ADDRESS', message: 'Invalid Sui address' }, 400);
  }

  const withinLimit = await checkSenderRateLimit(body.sender);
  if (!withinLimit) {
    if (!body.proof) {
      const challenge = createChallenge(body.sender);
      return c.json({
        error: 'RATE_LIMITED',
        challenge: formatChallenge(challenge),
        message: 'Solve the hashcash challenge and resubmit with proof field',
      }, 429);
    }

    if (!verifyStamp(body.proof, body.sender)) {
      return c.json({ error: 'INVALID_PROOF', message: 'Hashcash proof is invalid' }, 403);
    }
  }

  try {
    const result = await sponsorTransaction(
      { txJson: body.txJson, txBytes: body.txBytes, txBcsBytes: body.txBcsBytes },
      body.sender,
      body.type,
    );
    return c.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Gas sponsorship failed';

    if (msg.startsWith('CIRCUIT_BREAKER')) {
      return c.json({ error: 'CIRCUIT_BREAKER', message: 'SUI price unstable — sponsorship paused', retryAfter: 300 }, 503);
    }
    if (msg.startsWith('POOL_DEPLETED')) {
      return c.json({ error: 'POOL_DEPLETED', message: 'Gas station balance low — try again later', retryAfter: 600 }, 503);
    }
    if (msg.startsWith('GAS_FEE_EXCEEDED')) {
      return c.json({ error: 'GAS_FEE_EXCEEDED', message: 'Gas fee exceeds ceiling — try again when network is less congested', retryAfter: 60 }, 429);
    }
    if (msg.startsWith('PRICE_STALE')) {
      return c.json({ error: 'PRICE_STALE', message: 'Price data outdated — sponsorship temporarily paused', retryAfter: 60 }, 503);
    }

    console.error('[gas] Error:', msg);
    return c.json({ error: 'GAS_SPONSOR_FAILED', message: msg }, 500);
  }
});

const TX_DIGEST_RE = /^[A-Za-z0-9+/=]{32,64}$/;

gas.post('/api/gas/report', async (c) => {
  const body = await c.req.json<{
    sender: string;
    txDigest: string;
    gasCostSui: number;
    usdcCharged: number;
    type: GasRequestType;
  }>();

  if (!body.sender || !body.txDigest || !body.type) {
    return c.json({ error: 'sender, txDigest, and type are required' }, 400);
  }

  if (!isValidSuiAddress(body.sender)) {
    return c.json({ error: 'INVALID_ADDRESS' }, 400);
  }

  if (!TX_DIGEST_RE.test(body.txDigest)) {
    return c.json({ error: 'INVALID_DIGEST', message: 'Invalid transaction digest format' }, 400);
  }

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
    console.error('[gas/report] Error:', error instanceof Error ? error.message : error);
    return c.json({ error: 'REPORT_FAILED' }, 500);
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
