import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { aggregateFees } from "./aggregateFees";

const SUI_RPC = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl("mainnet");

// Cetus USDC/SUI pool — same address as `CETUS_USDC_SUI_POOL` in @t2000/sdk
// (apps/web is the marketing site and doesn't depend on the SDK package).
const CETUS_USDC_SUI_POOL = "0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab";

// Treasury is a regular wallet address. Fees flow as `splitCoins + transferObjects`
// from Audric's prepare/route.ts. MUST match `T2000_OVERLAY_FEE_WALLET` in
// @t2000/sdk and the indexer.
const T2000_OVERLAY_FEE_WALLET = process.env.T2000_OVERLAY_FEE_WALLET
  ?? "0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a";

const MPP_GATEWAY_TREASURY = process.env.MPP_GATEWAY_TREASURY ?? "0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012";

const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

/**
 * Spot SUI/USDC from the Cetus pool. Same parser as `fetchSuiPriceUsd` in
 * `packages/sdk/src/protocols/financialSummary.ts` — kept inline here to
 * avoid making the SDK helper public for one stats consumer. Falls back to
 * 1.0 if the read fails so the route never 5xxs on a price-feed glitch.
 */
async function fetchSuiPriceUsd(client: SuiJsonRpcClient): Promise<number> {
  try {
    const pool = await client.getObject({
      id: CETUS_USDC_SUI_POOL,
      options: { showContent: true },
    });
    if (pool.data?.content?.dataType === "moveObject") {
      const fields = pool.data.content.fields as Record<string, unknown>;
      const sqrtPrice = BigInt(String(fields.current_sqrt_price ?? "0"));
      if (sqrtPrice > BigInt(0)) {
        const Q64 = BigInt(2) ** BigInt(64);
        const sqrtFloat = Number(sqrtPrice) / Number(Q64);
        const price = 1000 / (sqrtFloat * sqrtFloat);
        if (price > 0.01 && price < 1000) return price;
      }
    }
  } catch { /* fallback */ }
  return 1.0;
}

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
  const [allFees, suiPriceUsd] = await Promise.all([
    prisma.protocolFeeLedger.findMany({
      select: { feeAmount: true, feeAsset: true, operation: true, createdAt: true },
    }),
    fetchSuiPriceUsd(new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" })),
  ]);

  return aggregateFees(allFees, suiPriceUsd, oneDayAgo, sevenDaysAgo);
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
