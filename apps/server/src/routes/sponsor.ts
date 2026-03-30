import { Hono } from 'hono';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { createChallenge, formatChallenge, verifyStamp } from '../lib/hashcash.js';
import { checkRateLimit, sponsorWalletInit } from '../services/sponsor.js';
import {
  sponsorUsdc,
  checkUsdcSponsorRateLimit,
  isAlreadySponsored,
} from '../services/usdcSponsor.js';

const SPONSOR_INTERNAL_KEY = process.env.SPONSOR_INTERNAL_KEY ?? '';

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

sponsor.post('/api/sponsor/usdc', async (c) => {
  const body = await c.req.json<{
    address: string;
    source?: 'web' | 'cli';
    proof?: string;
  }>();

  if (!body.address) {
    return c.json({ error: 'address is required' }, 400);
  }

  if (!isValidSuiAddress(body.address)) {
    return c.json({ error: 'INVALID_ADDRESS', message: 'Invalid Sui address format' }, 400);
  }

  const source = body.source ?? 'cli';

  const internalKey = c.req.header('x-internal-key');
  if (source === 'web') {
    if (!SPONSOR_INTERNAL_KEY || internalKey !== SPONSOR_INTERNAL_KEY) {
      return c.json({ error: 'UNAUTHORIZED', message: 'Invalid internal key' }, 401);
    }
  } else {
    const withinLimit = await checkUsdcSponsorRateLimit();
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
  }

  const already = await isAlreadySponsored(body.address);
  if (already) {
    return c.json({ error: 'ALREADY_SPONSORED', message: 'This address has already received USDC sponsorship' }, 409);
  }

  try {
    const result = await sponsorUsdc(body.address, source);
    return c.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'USDC sponsor failed';

    if (msg === 'ALREADY_SPONSORED') {
      return c.json({ error: 'ALREADY_SPONSORED', message: 'This address has already received USDC sponsorship' }, 409);
    }
    if (msg === 'SPONSOR_DEPLETED') {
      return c.json({ error: 'SPONSOR_DEPLETED', message: 'USDC sponsorship temporarily unavailable — deposit USDC manually to get started' }, 503);
    }

    console.error('[sponsor/usdc] Error:', msg);
    return c.json({ error: 'SPONSOR_FAILED', message: msg }, 500);
  }
});

export { sponsor };
