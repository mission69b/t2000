import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

const SUI_RPC = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl("mainnet");
const TREASURY_ID = "0x3bb501b8300125dca59019247941a42af6b292a150ce3cfcce9449456be2ec91";
const REBATE_ADDRESS = "0x94bb9f0dcf957b0874e7c3f228517ef8800a500f40596bafad8a35ef6f85f0d6";
const MPP_GATEWAY_TREASURY = process.env.MPP_GATEWAY_TREASURY ?? "0x703284465d889aa19cbd6806f5e60445d40f558ba1470e96240abf6b65509d2f";

export async function GET() {

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [wallets, agents, gas, fees, mpp, transactions] = await Promise.all([
    getWalletBalances(),
    getAgentStats(oneDayAgo, sevenDaysAgo, thirtyDaysAgo),
    getGasStats(oneDayAgo, sevenDaysAgo),
    getFeeStats(oneDayAgo, sevenDaysAgo),
    getMppStats(oneDayAgo, sevenDaysAgo),
    getTransactionStats(oneDayAgo, sevenDaysAgo),
  ]);

  return NextResponse.json({
    timestamp: now.toISOString(),
    wallets,
    agents,
    gas,
    fees,
    mpp,
    transactions,
  });
}

async function getWalletBalances() {
  const sponsorAddr = process.env.SPONSOR_ADDRESS;
  const gasAddr = process.env.GAS_STATION_ADDRESS;

  if (!sponsorAddr && !gasAddr) return null;

  try {
    const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });
    const results: Record<string, { address?: string; balanceSui: number; balanceUsdc?: number }> = {};

    if (sponsorAddr) {
      const bal = await client.getBalance({ owner: sponsorAddr });
      results.sponsor = { address: sponsorAddr, balanceSui: Number(bal.totalBalance) / 1e9 };
    }
    if (gasAddr) {
      const bal = await client.getBalance({ owner: gasAddr });
      results.gasStation = { address: gasAddr, balanceSui: Number(bal.totalBalance) / 1e9 };
    }

    const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

    const [rebateSui, rebateUsdc] = await Promise.all([
      client.getBalance({ owner: REBATE_ADDRESS }),
      client.getBalance({ owner: REBATE_ADDRESS, coinType: USDC_TYPE }),
    ]);

    // Read on-chain treasury balance (populated by collect_fee since v2).
    // Fall back to DB fee ledger if on-chain read fails.
    let treasuryUsdc = 0;
    try {
      const treasuryObj = await client.getObject({
        id: TREASURY_ID,
        options: { showContent: true },
      });
      if (treasuryObj.data?.content?.dataType === "moveObject") {
        const fields = treasuryObj.data.content.fields as Record<string, unknown>;
        const raw = fields.balance;
        const balanceValue =
          typeof raw === "string" || typeof raw === "number"
            ? String(raw)
            : typeof raw === "object" && raw !== null
              ? ((raw as Record<string, unknown>).fields as Record<string, string> | undefined)?.value
                ?? String((raw as Record<string, unknown>).value ?? "0")
              : "0";
        treasuryUsdc = Number(balanceValue) / 1e6;
      }
    } catch {
      const allFees = await prisma.protocolFeeLedger.findMany({
        select: { feeAmount: true, feeAsset: true },
      });
      treasuryUsdc = allFees
        .filter((f) => f.feeAsset === "USDC")
        .reduce((s, f) => s + Number(f.feeAmount), 0);
    }

    results.treasury = {
      address: TREASURY_ID,
      balanceSui: 0,
      balanceUsdc: +treasuryUsdc.toFixed(6),
    };

    results.rebate = {
      address: REBATE_ADDRESS,
      balanceSui: Number(rebateSui.totalBalance) / 1e9,
      balanceUsdc: Number(rebateUsdc.totalBalance) / 1e6,
    };

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

  return { total, last24h, last7d, last30d };
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
  let onChainTotal = 0;
  try {
    const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });
    const treasuryObj = await client.getObject({
      id: TREASURY_ID,
      options: { showContent: true },
    });
    if (treasuryObj.data?.content?.dataType === "moveObject") {
      const fields = treasuryObj.data.content.fields as Record<string, unknown>;
      const raw = fields.total_collected;
      onChainTotal = Number(typeof raw === "string" || typeof raw === "number" ? raw : "0") / 1e6;
    }
  } catch { /* fall through to DB */ }

  const V2_DEPLOY = new Date("2025-06-02T00:00:00Z");
  const allFees = await prisma.protocolFeeLedger.findMany({
    where: { createdAt: { gte: V2_DEPLOY } },
    select: { feeAmount: true, feeAsset: true, operation: true, createdAt: true },
  });

  const dbTotal = allFees
    .filter((f) => f.feeAsset === "USDC")
    .reduce((s, f) => s + Number(f.feeAmount), 0);

  const totalUsdc = onChainTotal > 0 ? onChainTotal : dbTotal;

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

async function getMppStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

  const legacyTotal = 0;
  const legacySettled = 0;
  const legacyAmount = 0;

  let gatewayBalance = 0;
  let gatewayTxCount = 0;
  let gateway24h = 0;
  let gateway7d = 0;

  if (MPP_GATEWAY_TREASURY) {
    try {
      const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });

      const usdcBal = await client.getBalance({
        owner: MPP_GATEWAY_TREASURY,
        coinType: USDC_TYPE,
      });
      gatewayBalance = Number(usdcBal.totalBalance) / 1e6;

      const txs = await client.queryTransactionBlocks({
        filter: { ToAddress: MPP_GATEWAY_TREASURY },
        limit: 50,
        order: "descending",
      });
      gatewayTxCount = txs.data.length;
      if (txs.hasNextPage) {
        gatewayTxCount = Math.max(gatewayTxCount, 50);
      }

      if (txs.data.length > 0) {
        const digests = txs.data.map((tx) => tx.digest);
        const detailed = await client.multiGetTransactionBlocks({
          digests,
          options: { showInput: true },
        });

        const oneDayMs = oneDayAgo.getTime();
        const sevenDayMs = sevenDaysAgo.getTime();
        for (const tx of detailed) {
          const ts = Number(tx.timestampMs ?? 0);
          if (ts >= oneDayMs) gateway24h++;
          if (ts >= sevenDayMs) gateway7d++;
        }
      }
    } catch {
      /* RPC failure — fall through with 0s */
    }
  }

  const total = gatewayTxCount + legacyTotal;
  const totalAmount = gatewayBalance + legacyAmount;

  return {
    total,
    settled: legacySettled + gatewayTxCount,
    totalAmount: +totalAmount.toFixed(4),
    last24h: gateway24h,
    last7d: gateway7d,
    gatewayAddress: MPP_GATEWAY_TREASURY || undefined,
    gatewayBalance: +gatewayBalance.toFixed(4),
  };
}

const EXCLUDED_ACTIONS = new Set(["sentinel_attack", "sentinel_settle"]);
const EXCLUDED_PROTOCOLS = new Set(["sentinel"]);

async function getTransactionStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const excludeFilter = { action: { notIn: [...EXCLUDED_ACTIONS] } };

  const [total, last24h, last7d] = await Promise.all([
    prisma.transaction.count({ where: excludeFilter }),
    prisma.transaction.count({ where: { ...excludeFilter, executedAt: { gte: oneDayAgo } } }),
    prisma.transaction.count({ where: { ...excludeFilter, executedAt: { gte: sevenDaysAgo } } }),
  ]);

  const allTx = await prisma.transaction.findMany({
    where: excludeFilter,
    select: { action: true, protocol: true },
  });
  const byAction: Record<string, number> = {};
  const byProtocol: Record<string, number> = {};
  for (const tx of allTx) {
    byAction[tx.action] = (byAction[tx.action] ?? 0) + 1;
    if (tx.protocol && !EXCLUDED_PROTOCOLS.has(tx.protocol)) {
      byProtocol[tx.protocol] = (byProtocol[tx.protocol] ?? 0) + 1;
    }
  }

  const uniqueAgents = await prisma.transaction.groupBy({
    by: ["agentAddress"],
    where: excludeFilter,
  });

  return { total, last24h, last7d, byAction, byProtocol, uniqueAgents: uniqueAgents.length };
}
