import { Hono } from 'hono';
import { prisma } from '../db/prisma.js';
import { getSponsorWallet, getGasStationWallet, getSuiClient } from '../lib/wallets.js';

const stats = new Hono();

stats.get('/api/stats', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  const secret = process.env.ADMIN_SECRET;

  if (!secret || token !== secret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const client = getSuiClient();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    walletBalances,
    agentStats,
    gasStats,
    feeStats,
    x402Stats,
    txStats,
  ] = await Promise.all([
    getWalletBalances(client),
    getAgentStats(oneDayAgo, sevenDaysAgo, thirtyDaysAgo),
    getGasStats(oneDayAgo, sevenDaysAgo),
    getFeeStats(oneDayAgo, sevenDaysAgo),
    getX402Stats(oneDayAgo, sevenDaysAgo),
    getTransactionStats(oneDayAgo, sevenDaysAgo),
  ]);

  return c.json({
    timestamp: now.toISOString(),
    wallets: walletBalances,
    agents: agentStats,
    gas: gasStats,
    fees: feeStats,
    x402: x402Stats,
    transactions: txStats,
  });
});

async function getWalletBalances(client: ReturnType<typeof getSuiClient>) {
  try {
    const sponsorAddr = getSponsorWallet().getPublicKey().toSuiAddress();
    const gasAddr = getGasStationWallet().getPublicKey().toSuiAddress();

    const [sponsorBal, gasBal] = await Promise.all([
      client.getBalance({ owner: sponsorAddr }),
      client.getBalance({ owner: gasAddr }),
    ]);

    const sponsorSui = Number(sponsorBal.totalBalance) / 1e9;
    const gasSui = Number(gasBal.totalBalance) / 1e9;

    return {
      sponsor: { address: sponsorAddr, balanceSui: sponsorSui },
      gasStation: { address: gasAddr, balanceSui: gasSui },
      totalSui: sponsorSui + gasSui,
    };
  } catch {
    return { sponsor: null, gasStation: null, totalSui: 0 };
  }
}

async function getAgentStats(oneDayAgo: Date, sevenDaysAgo: Date, thirtyDaysAgo: Date) {
  const [total, last24h, last7d, last30d] = await Promise.all([
    prisma.agent.count(),
    prisma.agent.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.agent.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.agent.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  const recentAgents = await prisma.agent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      address: true,
      name: true,
      createdAt: true,
      lastSeen: true,
    },
  });

  return { total, last24h, last7d, last30d, recent: recentAgents };
}

async function getGasStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const [totalRecords, bootstrapCount, fallbackCount, autoTopupCount] = await Promise.all([
    prisma.gasLedger.count(),
    prisma.gasLedger.count({ where: { txType: 'bootstrap' } }),
    prisma.gasLedger.count({ where: { txType: 'fallback' } }),
    prisma.gasLedger.count({ where: { txType: 'auto-topup' } }),
  ]);

  const allRecords = await prisma.gasLedger.findMany({
    select: { suiSpent: true, usdcCharged: true, txType: true, createdAt: true },
  });

  const totalSuiSpent = allRecords.reduce((sum, r) => sum + Number(r.suiSpent), 0);
  const totalUsdcCharged = allRecords.reduce((sum, r) => sum + Number(r.usdcCharged), 0);
  const bootstrapSuiSpent = allRecords
    .filter((r) => r.txType === 'bootstrap')
    .reduce((sum, r) => sum + Number(r.suiSpent), 0);

  const last24hRecords = allRecords.filter((r) => r.createdAt >= oneDayAgo);
  const last7dRecords = allRecords.filter((r) => r.createdAt >= sevenDaysAgo);

  return {
    totalRecords,
    byType: { bootstrap: bootstrapCount, fallback: fallbackCount, autoTopup: autoTopupCount },
    totalSuiSpent: +totalSuiSpent.toFixed(4),
    totalUsdcCharged: +totalUsdcCharged.toFixed(4),
    bootstrapSuiSpent: +bootstrapSuiSpent.toFixed(4),
    last24h: { count: last24hRecords.length, suiSpent: +last24hRecords.reduce((s, r) => s + Number(r.suiSpent), 0).toFixed(4) },
    last7d: { count: last7dRecords.length, suiSpent: +last7dRecords.reduce((s, r) => s + Number(r.suiSpent), 0).toFixed(4) },
  };
}

async function getFeeStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const allFees = await prisma.protocolFeeLedger.findMany({
    select: { feeAmount: true, feeAsset: true, operation: true, createdAt: true },
  });

  const totalUsdc = allFees
    .filter((f) => f.feeAsset === 'USDC')
    .reduce((sum, f) => sum + Number(f.feeAmount), 0);

  const byOperation: Record<string, { count: number; totalUsdc: number }> = {};
  for (const f of allFees) {
    const op = f.operation;
    if (!byOperation[op]) byOperation[op] = { count: 0, totalUsdc: 0 };
    byOperation[op].count++;
    byOperation[op].totalUsdc += Number(f.feeAmount);
  }

  const last24h = allFees.filter((f) => f.createdAt >= oneDayAgo);
  const last7d = allFees.filter((f) => f.createdAt >= sevenDaysAgo);

  return {
    totalRecords: allFees.length,
    totalUsdcCollected: +totalUsdc.toFixed(4),
    byOperation,
    last24h: { count: last24h.length, usdc: +last24h.reduce((s, f) => s + Number(f.feeAmount), 0).toFixed(4) },
    last7d: { count: last7d.length, usdc: +last7d.reduce((s, f) => s + Number(f.feeAmount), 0).toFixed(4) },
  };
}

async function getX402Stats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const [total, settled, last24h, last7d] = await Promise.all([
    prisma.x402Payment.count(),
    prisma.x402Payment.count({ where: { settled: true } }),
    prisma.x402Payment.count({ where: { verifiedAt: { gte: oneDayAgo } } }),
    prisma.x402Payment.count({ where: { verifiedAt: { gte: sevenDaysAgo } } }),
  ]);

  const allPayments = await prisma.x402Payment.findMany({
    select: { amount: true },
  });
  const totalAmount = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    total,
    settled,
    totalAmount: +totalAmount.toFixed(4),
    last24h,
    last7d,
  };
}

async function getTransactionStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const [total, last24h, last7d] = await Promise.all([
    prisma.transaction.count(),
    prisma.transaction.count({ where: { executedAt: { gte: oneDayAgo } } }),
    prisma.transaction.count({ where: { executedAt: { gte: sevenDaysAgo } } }),
  ]);

  const allTx = await prisma.transaction.findMany({
    select: { action: true },
  });

  const byAction: Record<string, number> = {};
  for (const tx of allTx) {
    byAction[tx.action] = (byAction[tx.action] ?? 0) + 1;
  }

  const uniqueAgents = await prisma.transaction.groupBy({
    by: ['agentAddress'],
  });

  return {
    total,
    last24h,
    last7d,
    byAction,
    uniqueAgents: uniqueAgents.length,
  };
}

export { stats };
