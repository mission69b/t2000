import { Hono } from 'hono';
import { prisma } from '../db/prisma.js';

const fees = new Hono();

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
    const msg = error instanceof Error ? error.message : 'Failed to record fee';
    console.error('[fees] Error:', msg);
    return c.json({ error: msg }, 500);
  }
});

fees.get('/api/fees', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);

  const records = await prisma.protocolFeeLedger.findMany({
    where: { agentAddress: address },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const totalFees = records.reduce((sum, r) => sum + Number(r.feeAmount), 0);

  return c.json({ records, totalFees });
});

export { fees };
