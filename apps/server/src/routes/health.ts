import { Hono } from 'hono';
import { getSponsorWallet, getGasStationWallet, getSuiClient } from '../lib/wallets.js';
import { prisma } from '../db/prisma.js';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const health = new Hono();

health.get('/api/health', async (c) => {
  const client = getSuiClient();

  let sponsorAddress = '';
  let sponsorBalance = '0';
  let sponsorUsdc = '0';
  let gasStationAddress = '';
  let gasStationBalance = '0';
  let dbStatus: 'connected' | 'error' = 'error';

  try {
    sponsorAddress = getSponsorWallet().getPublicKey().toSuiAddress();
    gasStationAddress = getGasStationWallet().getPublicKey().toSuiAddress();

    const [sponsorBal, gasBal, sponsorUsdcBal] = await Promise.all([
      client.getBalance({ owner: sponsorAddress }),
      client.getBalance({ owner: gasStationAddress }),
      client.getBalance({ owner: sponsorAddress, coinType: USDC_TYPE }),
    ]);

    sponsorBalance = (Number(sponsorBal.totalBalance) / 1e9).toFixed(4);
    gasStationBalance = (Number(gasBal.totalBalance) / 1e9).toFixed(4);
    sponsorUsdc = (Number(sponsorUsdcBal.totalBalance) / 1e6).toFixed(2);
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
    sponsor: { address: sponsorAddress, sui: sponsorBalance, usdc: sponsorUsdc },
    gasStation: { address: gasStationAddress, sui: gasStationBalance, circuitBreaker: false },
    indexer: indexerInfo,
    database: dbStatus,
  });
});

export { health };
