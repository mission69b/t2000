import { Hono } from 'hono';
import { getSuiClient } from '../lib/wallets.js';
import { prisma } from '../db/prisma.js';

const health = new Hono();

health.get('/api/health', async (c) => {
  const client = getSuiClient();

  let dbStatus: 'connected' | 'error' = 'error';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }

  let indexerInfo = null;
  try {
    const cursor = await prisma.indexerCursor.findUnique({
      where: { cursorName: 'main' },
    });
    if (cursor) {
      const latest = await client.getLatestCheckpointSequenceNumber();
      const lag = Number(BigInt(latest) - cursor.lastCheckpoint);
      indexerInfo = {
        lastCheckpoint: cursor.lastCheckpoint.toString(),
        latestCheckpoint: latest,
        lag,
        lastProcessedAt: cursor.lastProcessedAt.toISOString(),
      };
    }
  } catch {
    // indexer not running yet
  }

  const status = dbStatus === 'connected' ? 'ok' : 'degraded';

  return c.json({
    status,
    indexer: indexerInfo,
    database: dbStatus,
  });
});

export { health };
