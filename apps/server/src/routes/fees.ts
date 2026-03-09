import { Hono } from 'hono';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { prisma } from '../db/prisma.js';

const fees = new Hono();

const TX_DIGEST_RE = /^[A-Za-z0-9+/=]{32,64}$/;

fees.post('/api/fees', async (c) => {
  const body = await c.req.json<{
    agentAddress: string;
    operation: string;
    feeAmount: string;
    feeRate: string;
    txDigest: string;
  }>();

  if (!body.agentAddress || !body.operation || !body.txDigest) {
    return c.json({ error: 'agentAddress, operation, and txDigest are required' }, 400);
  }

  if (!isValidSuiAddress(body.agentAddress)) {
    return c.json({ error: 'INVALID_ADDRESS' }, 400);
  }

  if (!TX_DIGEST_RE.test(body.txDigest)) {
    return c.json({ error: 'INVALID_DIGEST', message: 'Invalid transaction digest format' }, 400);
  }

  const existing = await prisma.protocolFeeLedger.findFirst({
    where: { txDigest: body.txDigest },
  });
  if (existing) {
    return c.json({ ok: true, duplicate: true });
  }

  try {
    await prisma.protocolFeeLedger.create({
      data: {
        agentAddress: body.agentAddress,
        operation: body.operation,
        feeAmount: body.feeAmount ?? '0',
        feeRate: body.feeRate ?? '0',
        txDigest: body.txDigest,
      },
    });
    return c.json({ ok: true });
  } catch (error) {
    console.error('[fees] Error:', error instanceof Error ? error.message : error);
    return c.json({ error: 'FEE_RECORD_FAILED' }, 500);
  }
});

fees.get('/api/fees', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);

  try {
    const records = await prisma.protocolFeeLedger.findMany({
      where: { agentAddress: address },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const totalFees = records.reduce((sum: number, r: { feeAmount: unknown }) => sum + Number(r.feeAmount), 0);

    return c.json({ records, totalFees });
  } catch (error) {
    console.error('[fees] Error:', error instanceof Error ? error.message : error);
    return c.json({ error: 'FETCH_FAILED' }, 500);
  }
});

export { fees };
