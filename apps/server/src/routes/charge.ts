import { Hono } from 'hono';
import { buildDeductAllowanceTx } from '@t2000/sdk';
import type { AllowanceFeature } from '@t2000/sdk';
import { executeAdminTx } from '../services/sui-executor.js';

const INTERNAL_KEY = process.env.SPONSOR_INTERNAL_KEY ?? '';

const charge = new Hono();

/**
 * POST /api/internal/charge
 * Deducts a specified amount from the user's on-chain allowance.
 * Used by Audric for session charges ($0.01/session).
 * Auth: x-internal-key header.
 */
charge.post('/api/internal/charge', async (c) => {
  const internalKey = c.req.header('x-internal-key');
  if (!INTERNAL_KEY || internalKey !== INTERNAL_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{
    allowanceId?: string;
    amount?: number;
    feature?: number;
  }>();

  const { allowanceId, amount, feature } = body;

  if (!allowanceId || typeof allowanceId !== 'string') {
    return c.json({ error: 'allowanceId is required' }, 400);
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return c.json({ error: 'amount must be a positive number' }, 400);
  }
  if (feature === undefined || typeof feature !== 'number') {
    return c.json({ error: 'feature is required' }, 400);
  }

  try {
    const tx = buildDeductAllowanceTx(allowanceId, BigInt(amount), feature as AllowanceFeature);
    const result = await executeAdminTx(tx);

    if (result.status !== 'success') {
      return c.json({ error: 'Transaction failed', digest: result.digest, status: result.status }, 502);
    }

    return c.json({ digest: result.digest, status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[charge] Allowance deduction failed:`, message);
    return c.json({ error: message }, 500);
  }
});

export { charge };
