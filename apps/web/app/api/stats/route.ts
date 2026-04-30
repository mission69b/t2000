import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

const SUI_RPC = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl("mainnet");

// Treasury is a regular wallet address. Fees flow as `splitCoins + transferObjects`
// from Audric's prepare/route.ts. MUST match `T2000_OVERLAY_FEE_WALLET` in
// @t2000/sdk and the indexer.
const T2000_OVERLAY_FEE_WALLET = process.env.T2000_OVERLAY_FEE_WALLET
  ?? "0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a";

const MPP_GATEWAY_TREASURY = process.env.MPP_GATEWAY_TREASURY ?? "0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012";

const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

export async function GET() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [wallets, agents, fees, mpp, transactions] = await Promise.all([
    getWalletBalances(),
    getAgentStats(oneDayAgo, sevenDaysAgo, thirtyDaysAgo),
    getFeeStats(oneDayAgo, sevenDaysAgo),
    getMppStats(oneDayAgo, sevenDaysAgo),
    getTransactionStats(oneDayAgo, sevenDaysAgo),
  ]);

  return NextResponse.json({
    timestamp: now.toISOString(),
    wallets,
    agents,
    fees,
    mpp,
    transactions,
  });
}

/**
 * Live treasury wallet balance via RPC. Single source of truth for "what's in
 * the treasury right now." Historical totals come from `getFeeStats` (Prisma
 * `ProtocolFeeLedger`, indexer-fed).
 */
async function getWalletBalances() {
  try {
    const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });

    const [treasurySui, treasuryUsdc] = await Promise.all([
      client.getBalance({ owner: T2000_OVERLAY_FEE_WALLET }),
      client.getBalance({ owner: T2000_OVERLAY_FEE_WALLET, coinType: USDC_TYPE }),
    ]);

    return {
      treasury: {
        address: T2000_OVERLAY_FEE_WALLET,
        balanceSui: Number(treasurySui.totalBalance) / 1e9,
        balanceUsdc: Number(treasuryUsdc.totalBalance) / 1e6,
      },
    };
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

/**
 * Historical fee totals + by-operation breakdown from the indexer-fed ledger.
 * The indexer scans every checkpoint, detects USDC transfers to the treasury
 * wallet, and writes a `ProtocolFeeLedger` row. So this query is the canonical
 * "total fees ever collected" — even if the admin has withdrawn the wallet
 * since (which would zero out the live RPC balance above).
 */
async function getFeeStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const allFees = await prisma.protocolFeeLedger.findMany({
    select: { feeAmount: true, feeAsset: true, operation: true, createdAt: true },
  });

  // The ledger column is raw on-chain amounts (BigInt-as-string). USDC is 6 decimals.
  // Pre-B5 v2 rows from the deprecated `parseFeeEvents` indexer path used the same
  // raw-amount convention, so the math is consistent across the cutover.
  const toUsdc = (raw: unknown) => Number(raw) / 1e6;

  // [B5 v2] Cetus swap overlay fees come in the swap's OUTPUT asset, which can
  // be SUI / NAVX / etc. — not USDC. The indexer records all asset types; the
  // stats UI shows USDC totals (the most meaningful aggregate), plus a raw
  // by-asset breakdown so non-USDC volume is at least visible to operators.
  const usdcFees = allFees.filter((f) => f.feeAsset === "USDC");
  const totalUsdc = usdcFees.reduce((s, f) => s + toUsdc(f.feeAmount), 0);

  const byOperation: Record<string, { count: number; totalUsdc: number }> = {};
  for (const f of usdcFees) {
    if (!byOperation[f.operation]) byOperation[f.operation] = { count: 0, totalUsdc: 0 };
    byOperation[f.operation].count++;
    byOperation[f.operation].totalUsdc += toUsdc(f.feeAmount);
  }

  // Number arithmetic (not BigInt) — some legacy ledger rows have decimal
  // fee_amount values that BigInt() would throw on. Number is precise for fee
  // totals up to 2^53 raw units (>> any realistic treasury size).
  const byAsset: Record<string, { count: number; rawAmount: string }> = {};
  for (const f of allFees) {
    const k = f.feeAsset;
    if (!byAsset[k]) byAsset[k] = { count: 0, rawAmount: "0" };
    byAsset[k].count++;
    byAsset[k].rawAmount = String(Number(byAsset[k].rawAmount) + Number(f.feeAmount));
  }

  const last24hRows = usdcFees.filter((f) => f.createdAt >= oneDayAgo);
  const last7dRows = usdcFees.filter((f) => f.createdAt >= sevenDaysAgo);

  return {
    totalRecords: allFees.length,
    totalUsdcCollected: +totalUsdc.toFixed(4),
    byOperation: Object.fromEntries(
      Object.entries(byOperation).map(([k, v]) => [k, { count: v.count, totalUsdc: +v.totalUsdc.toFixed(4) }]),
    ),
    byAsset,
    last24h: { count: last24hRows.length, usdc: +last24hRows.reduce((s, f) => s + toUsdc(f.feeAmount), 0).toFixed(4) },
    last7d: { count: last7dRows.length, usdc: +last7dRows.reduce((s, f) => s + toUsdc(f.feeAmount), 0).toFixed(4) },
  };
}

async function getMppStats(oneDayAgo: Date, sevenDaysAgo: Date) {
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

async function getTransactionStats(oneDayAgo: Date, sevenDaysAgo: Date) {
  const [total, last24h, last7d] = await Promise.all([
    prisma.transaction.count(),
    prisma.transaction.count({ where: { executedAt: { gte: oneDayAgo } } }),
    prisma.transaction.count({ where: { executedAt: { gte: sevenDaysAgo } } }),
  ]);

  const allTx = await prisma.transaction.findMany({
    select: { action: true, protocol: true },
  });
  const byAction: Record<string, number> = {};
  const byProtocol: Record<string, number> = {};
  for (const tx of allTx) {
    byAction[tx.action] = (byAction[tx.action] ?? 0) + 1;
    if (tx.protocol) {
      byProtocol[tx.protocol] = (byProtocol[tx.protocol] ?? 0) + 1;
    }
  }

  const uniqueAgents = await prisma.transaction.groupBy({
    by: ["agentAddress"],
  });

  return { total, last24h, last7d, byAction, byProtocol, uniqueAgents: uniqueAgents.length };
}
