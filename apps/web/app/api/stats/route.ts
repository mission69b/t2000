// Live Sui RPC reads for the treasury + MPP gateway wallets + a static
// marketing snapshot for network-scale totals (refreshed manually).
//
// Refresh procedure for the static block: query suiscan.xyz directly via
// the treasury + gateway addresses. Update STATIC values + lastRefreshed
// and ship as a regular PR. Quarterly cadence is enough — the page is
// marketing, not telemetry.
import { NextResponse } from "next/server";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { isValidSuiAddress } from "@mysten/sui/utils";

const SUI_RPC = process.env.SUI_RPC_URL?.trim() || getJsonRpcFullnodeUrl("mainnet");

// [S.226 / 2026-05-21] Canonical hardcoded addresses are the source of
// truth. Env vars are an OPTIONAL override; if set but malformed (empty,
// whitespace, non-Sui-address shape) the canonical constant wins.
//
// This mirrors the env-validation-gate.mdc pattern surgically — t2000/apps/web
// has no Zod env schema yet (separate backlog: `t2000-web-env-gate`), so we
// validate at the read site instead. Pre-S.226 the bare `process.env.X ?? "..."`
// fallback let an empty-string env var (the exact S.25 BlockVision bug class)
// override the canonical with `""`, which SuiJsonRpcClient.getBalance rejected
// with `Invalid Sui address` — silently swallowed by the broad catch (now
// instrumented in S.226 to log the actual cause).
const T2000_OVERLAY_FEE_CANONICAL = "0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a";
const MPP_GATEWAY_TREASURY_CANONICAL = "0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012";

function resolveSuiAddress(envValue: string | undefined, canonical: string, label: string): string {
  const trimmed = envValue?.trim();
  if (!trimmed) return canonical;
  if (!isValidSuiAddress(trimmed)) {
    console.warn(
      `[api/stats] env var ${label} is set but invalid (${JSON.stringify(trimmed)}); falling back to canonical ${canonical}`
    );
    return canonical;
  }
  return trimmed;
}

const T2000_OVERLAY_FEE_WALLET = resolveSuiAddress(
  process.env.T2000_OVERLAY_FEE_WALLET,
  T2000_OVERLAY_FEE_CANONICAL,
  "T2000_OVERLAY_FEE_WALLET"
);

const MPP_GATEWAY_TREASURY = resolveSuiAddress(
  process.env.MPP_GATEWAY_TREASURY,
  MPP_GATEWAY_TREASURY_CANONICAL,
  "MPP_GATEWAY_TREASURY"
);

const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

// Refreshed manually. Approximations derived from the most recent prod
// signals captured pre-indexer-retirement:
//   - agentsRegistered: ~1057 users in the now-deleted UserMemory backing
//     store at peak (S.221 / 2026-05-21).
//   - agentsActiveLast30d: 253 PortfolioSnapshot rows written by the first
//     Vercel cron run (S.222 / 2026-05-21).
//   - totalFeesUsdcCollected + totalTransactionsProcessed: conservative
//     round-down. To refresh precisely, query suiscan for USDC transfers
//     to T2000_OVERLAY_FEE_WALLET and total tx count touching the agent
//     wallets — both of which the chain remembers permanently.
const STATIC_MARKETING_SNAPSHOT = {
  agentsRegistered: 1000,
  agentsActiveLast30d: 250,
  totalFeesUsdcCollected: 0.1,
  totalTransactionsProcessed: 2000,
  lastRefreshed: "2026-05-21",
};

interface WalletBalances {
  treasury: { address: string; balanceSui: number; balanceUsdc: number };
  mppGateway: { address: string; balanceUsdc: number };
}

export async function GET() {
  const wallets = await getWalletBalances();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    wallets,
    static: STATIC_MARKETING_SNAPSHOT,
  });
}

async function getWalletBalances(): Promise<WalletBalances | null> {
  try {
    const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });

    const [treasurySui, treasuryUsdc, gatewayUsdc] = await Promise.all([
      client.getBalance({ owner: T2000_OVERLAY_FEE_WALLET }),
      client.getBalance({ owner: T2000_OVERLAY_FEE_WALLET, coinType: USDC_TYPE }),
      client.getBalance({ owner: MPP_GATEWAY_TREASURY, coinType: USDC_TYPE }),
    ]);

    return {
      treasury: {
        address: T2000_OVERLAY_FEE_WALLET,
        balanceSui: Number(treasurySui.totalBalance) / 1e9,
        balanceUsdc: Number(treasuryUsdc.totalBalance) / 1e6,
      },
      mppGateway: {
        address: MPP_GATEWAY_TREASURY,
        balanceUsdc: Number(gatewayUsdc.totalBalance) / 1e6,
      },
    };
  } catch (err) {
    console.error(
      `[api/stats] getWalletBalances failed (SUI_RPC=${SUI_RPC}):`,
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? err.stack : undefined
    );
    return null;
  }
}
