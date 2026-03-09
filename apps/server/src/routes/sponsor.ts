import { Hono } from 'hono';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { createChallenge, formatChallenge, verifyStamp } from '../lib/hashcash.js';
import { checkRateLimit, sponsorWalletInit } from '../services/sponsor.js';

const sponsor = new Hono();

sponsor.post('/api/sponsor', async (c) => {
  const body = await c.req.json<{
    address: string;
    proof?: string;
    name?: string;
  }>();

  if (!body.address) {
    return c.json({ error: 'address is required' }, 400);
  }

  if (!isValidSuiAddress(body.address)) {
    return c.json({ error: 'INVALID_ADDRESS', message: 'Invalid Sui address format' }, 400);
  }

  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '127.0.0.1';

  const withinLimit = await checkRateLimit(ip);
  if (!withinLimit) {
    if (!body.proof) {
      const challenge = createChallenge(body.address);
      return c.json({
        error: 'RATE_LIMITED',
        challenge: formatChallenge(challenge),
        message: 'Solve the hashcash challenge and resubmit with proof field',
      }, 429);
    }

    if (!verifyStamp(body.proof, body.address)) {
      return c.json({ error: 'INVALID_PROOF', message: 'Hashcash proof is invalid' }, 403);
    }
  }

  try {
    const result = await sponsorWalletInit(body.address, ip, body.name);
    return c.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Sponsor failed';
    console.error('[sponsor] Error:', msg);
    return c.json({ error: 'SPONSOR_FAILED', message: msg }, 500);
  }
});

export { sponsor };
