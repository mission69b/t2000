import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

const SUI_RPC = process.env.SUI_RPC_URL ?? getFullnodeUrl("mainnet");

function auth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const token =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.nextUrl.searchParams.get("token");
  return token === secret;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [wallets, agents, gas, fees, x402, transactions] = await Promise.all([
    getWalletBalances(),
    getAgentStats(oneDayAgo, sevenDaysAgo, thirtyDaysAgo),
    getGasStats(oneDayAgo, sevenDaysAgo),
    getFeeStats(oneDayAgo, sevenDaysAgo),
    getX402Stats(oneDayAgo, sevenDaysAgo),
    getTransactionStats(oneDayAgo, sevenDaysAgo),
  ]);

  return NextResponse.json({
    timestamp: now.toISOString(),
    wallets,
    agents,
    gas,
    fees,
    x402,
    transactions,
  });
}

async function getWalletBalances() {
  const sponsorAddr = process.env.SPONSOR_ADDRESS;
  const gasAddr = process.env.GAS_STATION_ADDRESS;

  if (!sponsorAddr && !gasAddr) return null;

  try {
    const client = new SuiClient({ url: SUI_RPC });
    const results: Record<string, { address: string; balanceSui: number }> = {};

    if (sponsorAddr) {
      const bal = await client.getBalance({ owner: sponsorAddr });
      results.sponsor = { address: sponsorAddr, balanceSui: Number(bal.totalBalance) / 1e9 };
    }
    if (gasAddr) {
      const bal = await client.getBalance({ owner: gasAddr });
      results.gasStation = { address: gasAddr, balanceSui: Number(bal.totalBalance) / 1e9 };
    }

    const totalSui = (results.sponsor?.balanceSui ?? 0) + (results.gasStation?.balanceSui ?? 0);
    return { ...results, totalSui };
  } catch {
    return null;
  }
}

async function getAgentStats(oneDayAgo: Date, sevenDaysAgo: Date, thirtyDaysAgo: Date) {
  const [total, last24h, last7d, last30d] = await Promise.all([
    prisma.agent.count(),
    prisma.agent.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.agent.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.agent.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  const recent = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { address: true, name: true, createdAt: true, lastSeen: true },
  });

  return { total, last24h, last7d, last30d, recent };
}

async function getGasStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const [totalRecords, bootstrapCount, fallbackCount, autoTopupCount] = await Promise.all([
    prisma.gasLedger.count(),
    prisma.gasLedger.count({ where: { txType: "bootstrap" } }),
    prisma.gasLedger.count({ where: { txType: "fallback" } }),
    prisma.gasLedger.count({ where: { txType: "auto-topup" } }),
  ]);

  const allRecords = await prisma.gasLedger.findMany({
    select: { suiSpent: true, usdcCharged: true, txType: true, createdAt: true },
  });

  const totalSuiSpent = allRecords.reduce((s, r) => s + Number(r.suiSpent), 0);
  const totalUsdcCharged = allRecords.reduce((s, r) => s + Number(r.usdcCharged), 0);
  const bootstrapSuiSpent = allRecords
    .filter((r) => r.txType === "bootstrap")
    .reduce((s, r) => s + Number(r.suiSpent), 0);

  const last24h = allRecords.filter((r) => r.createdAt >= oneDayAgo);
  const last7d = allRecords.filter((r) => r.createdAt >= sevenDaysAgo);

  return {
    totalRecords,
    byType: { bootstrap: bootstrapCount, fallback: fallbackCount, autoTopup: autoTopupCount },
    totalSuiSpent: +totalSuiSpent.toFixed(4),
    totalUsdcCharged: +totalUsdcCharged.toFixed(4),
    bootstrapSuiSpent: +bootstrapSuiSpent.toFixed(4),
    last24h: { count: last24h.length, suiSpent: +last24h.reduce((s, r) => s + Number(r.suiSpent), 0).toFixed(4) },
    last7d: { count: last7d.length, suiSpent: +last7d.reduce((s, r) => s + Number(r.suiSpent), 0).toFixed(4) },
  };
}

async function getFeeStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const allFees = await prisma.protocolFeeLedger.findMany({
    select: { feeAmount: true, feeAsset: true, operation: true, createdAt: true },
  });

  const totalUsdc = allFees
    .filter((f) => f.feeAsset === "USDC")
    .reduce((s, f) => s + Number(f.feeAmount), 0);

  const byOperation: Record<string, { count: number; totalUsdc: number }> = {};
  for (const f of allFees) {
    if (!byOperation[f.operation]) byOperation[f.operation] = { count: 0, totalUsdc: 0 };
    byOperation[f.operation].count++;
    byOperation[f.operation].totalUsdc += Number(f.feeAmount);
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

  const allPayments = await prisma.x402Payment.findMany({ select: { amount: true } });
  const totalAmount = allPayments.reduce((s, p) => s + Number(p.amount), 0);

  return { total, settled, totalAmount: +totalAmount.toFixed(4), last24h, last7d };
}

async function getTransactionStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const [total, last24h, last7d] = await Promise.all([
    prisma.transaction.count(),
    prisma.transaction.count({ where: { executedAt: { gte: oneDayAgo } } }),
    prisma.transaction.count({ where: { executedAt: { gte: sevenDaysAgo } } }),
  ]);

  const allTx = await prisma.transaction.findMany({ select: { action: true } });
  const byAction: Record<string, number> = {};
  for (const tx of allTx) {
    byAction[tx.action] = (byAction[tx.action] ?? 0) + 1;
  }

  const uniqueAgents = await prisma.transaction.groupBy({ by: ["agentAddress"] });

  return { total, last24h, last7d, byAction, uniqueAgents: uniqueAgents.length };
}
