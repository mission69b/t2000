import { Hono } from 'hono';
import { getSponsorWallet, getGasStationWallet, getSuiClient } from '../lib/wallets.js';
import { prisma } from '../db/prisma.js';

const health = new Hono();

health.get('/api/health', async (c) => {
  const client = getSuiClient();

  let sponsorBalance = '0';
  let gasStationBalance = '0';
  let dbStatus: 'connected' | 'error' = 'error';

  try {
    const sponsorAddr = getSponsorWallet().getPublicKey().toSuiAddress();
    const gasAddr = getGasStationWallet().getPublicKey().toSuiAddress();

    const [sponsorBal, gasBal] = await Promise.all([
      client.getBalance({ owner: sponsorAddr }),
      client.getBalance({ owner: gasAddr }),
    ]);

    sponsorBalance = (Number(sponsorBal.totalBalance) / 1e9).toFixed(4);
    gasStationBalance = (Number(gasBal.totalBalance) / 1e9).toFixed(4);
  } catch {
    // wallet balance check failed — non-fatal
  }

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
    sponsor: { balance: sponsorBalance },
    gasStation: { balance: gasStationBalance, circuitBreaker: false },
    indexer: indexerInfo,
    database: dbStatus,
  });
});

export { health };
