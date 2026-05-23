// ---------------------------------------------------------------------------
// BlockVision DeFi per-protocol bespoke normalisers — shims for shapes the
// generic walker can't infer (implied coin types, non-standard amount
// nesting).
//
// Carved out of the legacy `blockvision-prices.ts` (SPEC PIPELINE-AUDIT-
// PHASE-2 S1 / 2026-05-23) — PURE FILE SPLIT.
//
// Five protocols need bespoke handling:
//   - bluefin       — `usdcVault` / `blueVault` expose `{amount}` with
//                     implied USDC / BLUE coin type
//   - haedal        — `stakings` expose `{sui_amount}` with implied SUI
//   - suistake      — stakings of implied SUI (bare `{amount}` field)
//   - walrus        — stakings of implied WAL
//   - suins-staking — stakings of implied NS
//
// The dispatcher (`normalizeProtocol`) routes the 9 protocols to either a
// bespoke handler (above) or the generic `walkProtocolResponse` walker.
// Coverage table is intentionally explicit — when adding a 10th protocol,
// start with the walker and only add a bespoke shim if its shape can't
// be expressed as `{coinType, amount, decimals?}` or `{coinTypeA/B, ...}`.
// ---------------------------------------------------------------------------

import type { DefiProtocol } from './protocols.js';
import { toUsd, walkProtocolResponse } from './walker.js';

// Implied coin types for protocols whose response shape buries the coin
// identity in the protocol's own conventions (no `coinType` field).
const SUI_TYPE_FULL =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const USDC_TYPE_FULL =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const BLUE_TYPE_FULL =
  '0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE';
const WAL_TYPE_FULL =
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL';
const NS_TYPE_FULL =
  '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS';

interface BluefinLp {
  coinTypeA?: string;
  coinTypeB?: string;
  coinAmountA?: number | string;
  coinAmountB?: number | string;
}

function normalizeBluefin(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data =
    (result.bluefin as {
      lps?: BluefinLp[];
      usdcVault?: { amount?: number | string };
      blueVault?: { amount?: number | string };
    }) ?? {};
  let total = 0;
  for (const lp of data.lps ?? []) {
    if (lp.coinTypeA && lp.coinAmountA != null) {
      total += toUsd(lp.coinTypeA, lp.coinAmountA, undefined, prices);
    }
    if (lp.coinTypeB && lp.coinAmountB != null) {
      total += toUsd(lp.coinTypeB, lp.coinAmountB, undefined, prices);
    }
  }
  // Vaults expose a raw `amount` without a coinType — usdcVault implies USDC
  // (6dp) and blueVault implies BLUE (9dp) per the BlockVision schema.
  if (data.usdcVault?.amount != null) {
    total += toUsd(USDC_TYPE_FULL, data.usdcVault.amount, 6, prices);
  }
  if (data.blueVault?.amount != null) {
    total += toUsd(BLUE_TYPE_FULL, data.blueVault.amount, 9, prices);
  }
  return total;
}

function normalizeHaedal(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data =
    (result.haedal as {
      lps?: Array<{
        coinTypeA?: string;
        coinTypeB?: string;
        balanceA?: number | string;
        balanceB?: number | string;
      }>;
      stakings?: Array<{ sui_amount?: number | string }>;
    }) ?? {};
  let total = 0;
  for (const lp of data.lps ?? []) {
    if (lp.coinTypeA && lp.balanceA != null) {
      total += toUsd(lp.coinTypeA, lp.balanceA, undefined, prices);
    }
    if (lp.coinTypeB && lp.balanceB != null) {
      total += toUsd(lp.coinTypeB, lp.balanceB, undefined, prices);
    }
  }
  for (const stake of data.stakings ?? []) {
    if (stake.sui_amount != null) {
      total += toUsd(SUI_TYPE_FULL, stake.sui_amount, 9, prices);
    }
  }
  return total;
}

interface BareStaking {
  amount?: number | string;
  sui_amount?: number | string;
}

function sumBareStakings(
  data: { stakings?: BareStaking[] } | undefined,
  impliedCoinType: string,
  decimals: number,
  prices: Record<string, number>,
): number {
  if (!data) return 0;
  let total = 0;
  for (const s of data.stakings ?? []) {
    const amt = s.sui_amount ?? s.amount;
    if (amt != null) total += toUsd(impliedCoinType, amt, decimals, prices);
  }
  return total;
}

function normalizeSuistake(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data = result.suistake as { stakings?: BareStaking[] } | undefined;
  return sumBareStakings(data, SUI_TYPE_FULL, 9, prices);
}

function normalizeWalrus(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const data = result.walrus as { stakings?: BareStaking[] } | undefined;
  return sumBareStakings(data, WAL_TYPE_FULL, 9, prices);
}

function normalizeSuinsStaking(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  // BlockVision may expose this under either `suins-staking`, `suinsStaking`,
  // or `suins_staking` — probe all three since the doc uses the kebab form
  // for the protocol param but JS conventions tend to camelCase response keys.
  const data =
    (result['suins-staking'] as { stakings?: BareStaking[] } | undefined) ??
    (result.suinsStaking as { stakings?: BareStaking[] } | undefined) ??
    (result.suins_staking as { stakings?: BareStaking[] } | undefined);
  return sumBareStakings(data, NS_TYPE_FULL, 6, prices);
}

const BESPOKE_NORMALIZERS: Partial<
  Record<DefiProtocol, (result: Record<string, unknown>, prices: Record<string, number>) => number>
> = {
  bluefin: normalizeBluefin,
  haedal: normalizeHaedal,
  suistake: normalizeSuistake,
  walrus: normalizeWalrus,
  'suins-staking': normalizeSuinsStaking,
};

/**
 * Per-protocol dispatcher. Returns USD value for the protocol's slice of
 * the BV `/account/defiPortfolio` response, routing to a bespoke handler
 * when one is registered (above) or to the generic `walkProtocolResponse`
 * otherwise.
 */
export function normalizeProtocol(
  protocol: DefiProtocol,
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  const bespoke = BESPOKE_NORMALIZERS[protocol];
  if (bespoke) return bespoke(result, prices);
  return walkProtocolResponse(result, prices);
}
