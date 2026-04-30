// Pure aggregation logic for /api/stats fee totals. Lives in its own module
// so vitest can import it without dragging Prisma + Next runtime into the
// unit-test environment.
//
// IF YOU CHANGE THIS FILE: also extend
// `app/api/stats/__tests__/aggregateFees.test.ts` — the H4 regression test
// covers Decimal/BigInt safety and the H7 multi-asset USD aggregation.

const FEE_ASSET_DECIMALS: Record<string, number> = {
  USDC: 6, USDsui: 6, USDT: 6, USDe: 6, SUI: 9,
};

const STABLE_PRICES_USD: Record<string, number> = {
  USDC: 1, USDsui: 1, USDT: 1, USDe: 1,
};

export interface FeeRow {
  feeAmount: unknown;
  feeAsset: string;
  operation: string;
  createdAt: Date;
}

export function aggregateFees(rows: FeeRow[], suiPriceUsd: number, oneDayAgo: Date, sevenDaysAgo: Date) {
  // The ledger column is raw on-chain amounts (BigInt-as-string). USDC is 6 decimals.
  // Pre-B5 v2 rows from the deprecated `parseFeeEvents` indexer path used the same
  // raw-amount convention, so the math is consistent across the cutover.
  const toUsdc = (raw: unknown) => Number(raw) / 1e6;

  // Per-asset USD price. Stables = $1, SUI = live Cetus spot, anything else =
  // null (raw amount stays in `byAsset`, but we don't fake a USD value).
  const pricesUsd: Record<string, number> = { ...STABLE_PRICES_USD, SUI: suiPriceUsd };

  // Convert a raw on-chain fee amount to USD if we know both decimals + price
  // for the asset. Returns null when either is unknown — the caller should
  // skip the contribution rather than treating null as zero.
  function feeUsdValue(asset: string, raw: unknown): number | null {
    const dec = FEE_ASSET_DECIMALS[asset];
    const price = pricesUsd[asset];
    if (dec === undefined || price === undefined) return null;
    return (Number(raw) / 10 ** dec) * price;
  }

  const usdcFees = rows.filter((f) => f.feeAsset === "USDC");
  const totalUsdc = usdcFees.reduce((s, f) => s + toUsdc(f.feeAmount), 0);

  // [H7 / 2026-04-30] byOperation now aggregates USD-equivalent across ALL
  // asset types (Cetus swap overlay fees come in the OUTPUT asset, often SUI).
  // `totalUsdc` is the legacy USDC-only sum kept for backwards compatibility;
  // `totalUsdEquivalent` is the new aggregate the UI should prefer.
  const byOperation: Record<string, { count: number; totalUsdc: number; totalUsdEquivalent: number }> = {};
  for (const f of rows) {
    if (!byOperation[f.operation]) {
      byOperation[f.operation] = { count: 0, totalUsdc: 0, totalUsdEquivalent: 0 };
    }
    const op = byOperation[f.operation];
    op.count++;
    if (f.feeAsset === "USDC") op.totalUsdc += toUsdc(f.feeAmount);
    const usd = feeUsdValue(f.feeAsset, f.feeAmount);
    if (usd !== null) op.totalUsdEquivalent += usd;
  }

  // Number arithmetic (not BigInt) — some legacy ledger rows have decimal
  // fee_amount values that BigInt() would throw on. Number is precise for fee
  // totals up to 2^53 raw units (>> any realistic treasury size). H4 vitest
  // covers this contract — see __tests__/aggregateFees.test.ts.
  const byAsset: Record<string, { count: number; rawAmount: string }> = {};
  for (const f of rows) {
    const k = f.feeAsset;
    if (!byAsset[k]) byAsset[k] = { count: 0, rawAmount: "0" };
    byAsset[k].count++;
    byAsset[k].rawAmount = String(Number(byAsset[k].rawAmount) + Number(f.feeAmount));
  }

  const totalUsdEquivalent = Object.values(byOperation).reduce((s, op) => s + op.totalUsdEquivalent, 0);

  const last24hRows = usdcFees.filter((f) => f.createdAt >= oneDayAgo);
  const last7dRows = usdcFees.filter((f) => f.createdAt >= sevenDaysAgo);

  return {
    totalRecords: rows.length,
    totalUsdcCollected: +totalUsdc.toFixed(4),
    totalUsdEquivalent: +totalUsdEquivalent.toFixed(4),
    byOperation: Object.fromEntries(
      Object.entries(byOperation).map(([k, v]) => [k, {
        count: v.count,
        totalUsdc: +v.totalUsdc.toFixed(4),
        totalUsdEquivalent: +v.totalUsdEquivalent.toFixed(4),
      }]),
    ),
    byAsset,
    last24h: { count: last24hRows.length, usdc: +last24hRows.reduce((s, f) => s + toUsdc(f.feeAmount), 0).toFixed(4) },
    last7d: { count: last7dRows.length, usdc: +last7dRows.reduce((s, f) => s + toUsdc(f.feeAmount), 0).toFixed(4) },
  };
}
