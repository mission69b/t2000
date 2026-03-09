import { Hono } from 'hono';
import { getSuiClient } from '../lib/wallets.js';
import { prisma } from '../db/prisma.js';
import { verifyPayment } from '@t2000/x402';
import type { VerifyRequest, SettleRequest } from '@t2000/x402';

const x402 = new Hono();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

async function checkRateLimit(ip: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const count = await prisma.x402Payment.count({
    where: { verifiedAt: { gte: windowStart } },
  });
  return count < RATE_LIMIT_MAX;
}

x402.get('/x402', (c) => {
  return c.json({
    service: 't2000 x402 facilitator',
    network: 'sui:mainnet',
    endpoints: {
      verify: 'POST /x402/verify',
      settle: 'POST /x402/settle',
    },
    docs: 'https://t2000.ai/docs#x402',
    npm: 'https://www.npmjs.com/package/@t2000/x402',
  });
});

x402.post('/x402/verify', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '127.0.0.1';
  const withinLimit = await checkRateLimit(ip);
  if (!withinLimit) {
    return c.json(
      { error: 'RATE_LIMITED', message: 'Too many verification requests' },
      429,
    );
  }

  let body: VerifyRequest;
  try {
    body = await c.req.json<VerifyRequest>();
  } catch {
    return c.json({ error: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
  }

  if (!body.txHash || !body.amount || !body.payTo || !body.nonce) {
    return c.json(
      { error: 'INVALID_REQUEST', message: 'Missing required fields: txHash, amount, payTo, nonce' },
      400,
    );
  }

  try {
    const client = getSuiClient();
    const result = await verifyPayment(client, body);

    if (result.verified) {
      try {
        await prisma.x402Payment.upsert({
          where: { nonce: body.nonce },
          create: {
            nonce: body.nonce,
            txHash: body.txHash,
            payTo: body.payTo,
            amount: body.amount,
            expiresAt: new Date(body.expiresAt * 1000),
            settled: false,
          },
          update: {},
        });
      } catch (dbError) {
        console.error('[x402/verify] Audit log write failed (non-fatal):', dbError);
      }
    }

    return c.json(result);
  } catch (error) {
    console.error('[x402/verify] Error:', error instanceof Error ? error.message : error);
    return c.json({ verified: false, reason: 'internal_error' }, 500);
  }
});

x402.post('/x402/settle', async (c) => {
  let body: SettleRequest;
  try {
    body = await c.req.json<SettleRequest>();
  } catch {
    return c.json({ error: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
  }

  if (!body.nonce) {
    return c.json({ error: 'INVALID_REQUEST', message: 'Missing required field: nonce' }, 400);
  }

  try {
    const payment = await prisma.x402Payment.findUnique({
      where: { nonce: body.nonce },
    });

    if (!payment) {
      return c.json({ error: 'NOT_FOUND', message: 'Payment not found — must be verified first' }, 404);
    }

    if (!payment.settled) {
      await prisma.x402Payment.update({
        where: { nonce: body.nonce },
        data: { settled: true },
      });
    }

    return c.json({ settled: true });
  } catch (error) {
    console.error('[x402/settle] Error:', error instanceof Error ? error.message : error);
    return c.json({ error: 'INTERNAL_ERROR' }, 500);
  }
});

export { x402 };
