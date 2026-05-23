// ---------------------------------------------------------------------------
// BlockVision DeFi response walker — generic shape extraction.
//
// Carved out of the legacy `blockvision-prices.ts` (SPEC PIPELINE-AUDIT-
// PHASE-2 S1 / 2026-05-23) — PURE FILE SPLIT.
//
// Recursively walks a protocol's response and sums net USD value, handling
// the common shape patterns BlockVision returns:
//
//   - Paired LPs: {coinTypeA, coinTypeB, balanceA, balanceB} with X/Y and
//     tokenX/Y aliases (Cetus/Bluefin/Haedal/Steamm/Turbos/Magma/Ferra/
//     FlowX/Kriya/Momentum/BlueMove); decimals can be at sibling
//     (coinTypeADecimals, decimalsA) or nested (coinA.decimals).
//   - Single-coin: {coinType, amount/balance/value, decimals?} with
//     `type: 'Borrow'` flag for NAVI-style flat lists.
//   - Pre-USD totals: Scallop's totalSupplyValue / totalDebtValue /
//     totalCollateralValue / totalLockedScaValue at root.
//
// Debt detection happens in two ways: the parent key (`borrows`, `debt`,
// `borrowings` → flips debtSide for the entire subtree) OR the item's own
// `type` field set to `'Borrow'` (NAVI flat list).
//
// Reward / fee branches (`rewards`, `fees`, `pendingRewards`, etc.) are
// skipped entirely — those amounts are typically already implicit in the
// position's principal value, and double-counting them inflates net worth.
// Power users rarely have unclaimed-reward stacks worth >1% of their LP.
//
// Exports:
//   - `walkProtocolResponse` — sums the whole tree, returns net USD
//   - `collectCoinTypes`     — pre-walk pass to discover coinTypes
//                              the price-fill step needs to fetch
//   - `toUsd`                — bespoke normalisers (defi/normalizers.ts)
//                              also need to USD-convert single fields
// ---------------------------------------------------------------------------

import { getDecimalsForCoinType, normalizeCoinType } from '@t2000/sdk';
import { STABLE_USD_PRICES } from '../prices.js';

const PAIR_A_COIN_KEYS = ['coinTypeA', 'coinTypeX', 'tokenXType'] as const;
const PAIR_B_COIN_KEYS = ['coinTypeB', 'coinTypeY', 'tokenYType'] as const;
const PAIR_A_AMOUNT_KEYS = [
  'balanceA',
  'amountA',
  'coinAmountA',
  'coinAAmount',
  'coinTypeAAmount',
  'tokenXBalance',
  'tokenXAmount',
  'amountX',
  'valueA',
] as const;
const PAIR_B_AMOUNT_KEYS = [
  'balanceB',
  'amountB',
  'coinAmountB',
  'coinBAmount',
  'coinTypeBAmount',
  'tokenYBalance',
  'tokenYAmount',
  'amountY',
  'valueB',
] as const;
const PAIR_A_DECIMALS_KEYS = ['coinTypeADecimals', 'tokenXDecimals', 'decimalsA'] as const;
const PAIR_B_DECIMALS_KEYS = ['coinTypeBDecimals', 'tokenYDecimals', 'decimalsB'] as const;

const SINGLE_COIN_KEYS = ['coinType', 'depositToken', 'token'] as const;
const SINGLE_AMOUNT_KEYS = ['amount', 'balance', 'value', 'equity'] as const;
const SINGLE_DECIMALS_KEYS = ['decimals', 'decimal', 'coinDecimals'] as const;

const DEBT_KEYS = new Set([
  'borrow',
  'borrows',
  'debt',
  'debts',
  'borrowings',
  'borrowedpools',
]);
// Skip reward/fee/incentive subtrees so we don't double-count pending yield
// already implied by the position principal value.
const SKIP_KEYS = new Set([
  'rewards',
  'reward',
  'fees',
  'fee',
  'pendingrewards',
  'incentiveinfos',
  'feereward',
  'incentivereward',
]);

function isCoinTypeString(v: unknown): v is string {
  if (typeof v !== 'string' || !v.includes('::')) return false;
  // Accept both `0x…::module::TYPE` and unprefixed `…::module::TYPE`
  // (Typus's `depositToken` / `rewardsToken` omit the leading `0x`).
  return v.startsWith('0x') || /^[0-9a-fA-F]/.test(v);
}

function ensure0xPrefix(coinType: string): string {
  return coinType.startsWith('0x') ? coinType : '0x' + coinType;
}

function isAmountValue(v: unknown): v is string | number {
  return (
    (typeof v === 'string' && v.trim().length > 0) ||
    (typeof v === 'number' && Number.isFinite(v))
  );
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function pickField<T>(
  obj: Record<string, unknown>,
  keys: readonly string[],
  predicate: (v: unknown) => v is T,
): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (predicate(v)) return v;
  }
  return undefined;
}

function nestedDecimals(node: unknown): number | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  if (typeof obj.decimals === 'number') return obj.decimals;
  return undefined;
}

/**
 * Convert a BlockVision amount field to a human-readable token quantity.
 * BlockVision is inconsistent across protocols:
 *   - integer string ("229380000000") or integer number (1485) → raw,
 *     divide by 10^decimals
 *   - decimal-string ("4.240927787") or non-integer JS number (4.24) →
 *     already human-readable, return as-is
 */
function toHumanQuantity(raw: string | number, decimalsHint: number | undefined): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    if (!Number.isInteger(raw)) return raw;
    if (decimalsHint != null) return raw / 10 ** decimalsHint;
    return raw;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  if (trimmed.includes('.') || trimmed.includes('e') || trimmed.includes('E')) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 0;
  const dec = decimalsHint ?? 9;
  return n / 10 ** dec;
}

function priceFor(coinType: string, prices: Record<string, number>): number {
  const prefixed = ensure0xPrefix(coinType);
  const norm = normalizeCoinType(prefixed);
  return prices[norm] ?? prices[prefixed] ?? prices[coinType] ?? STABLE_USD_PRICES[norm] ?? 0;
}

/**
 * Convert a (coinType, raw amount, optional decimals hint) tuple to USD.
 * Used by the generic walker AND by the bespoke per-protocol normalisers
 * (defi/normalizers.ts) — that's why it's exported.
 */
export function toUsd(
  coinType: string,
  raw: unknown,
  decimalsHint: number | undefined,
  prices: Record<string, number>,
): number {
  if (raw == null || (typeof raw !== 'string' && typeof raw !== 'number')) return 0;
  if (typeof raw === 'string' && raw.trim().length === 0) return 0;
  const prefixed = ensure0xPrefix(coinType);
  const decimals =
    typeof decimalsHint === 'number' ? decimalsHint : getDecimalsForCoinType(prefixed);
  const human = toHumanQuantity(raw, decimals);
  if (!Number.isFinite(human)) return 0;
  return human * priceFor(prefixed, prices);
}

interface ExtractedPair {
  coinTypeA: string;
  amountA: string | number;
  decimalsA: number | undefined;
  coinTypeB: string;
  amountB: string | number;
  decimalsB: number | undefined;
}

function extractPair(obj: Record<string, unknown>): ExtractedPair | null {
  const coinTypeA = pickField(obj, PAIR_A_COIN_KEYS, isCoinTypeString);
  const coinTypeB = pickField(obj, PAIR_B_COIN_KEYS, isCoinTypeString);
  if (!coinTypeA || !coinTypeB) return null;
  const amountA = pickField(obj, PAIR_A_AMOUNT_KEYS, isAmountValue);
  const amountB = pickField(obj, PAIR_B_AMOUNT_KEYS, isAmountValue);
  if (amountA == null || amountB == null) return null;
  const decimalsA =
    pickField(obj, PAIR_A_DECIMALS_KEYS, isFiniteNumber) ??
    nestedDecimals(obj.coinA);
  const decimalsB =
    pickField(obj, PAIR_B_DECIMALS_KEYS, isFiniteNumber) ??
    nestedDecimals(obj.coinB);
  return { coinTypeA, amountA, decimalsA, coinTypeB, amountB, decimalsB };
}

interface ExtractedSingle {
  coinType: string;
  amount: string | number;
  decimals: number | undefined;
  isBorrow: boolean;
}

function extractSingle(obj: Record<string, unknown>): ExtractedSingle | null {
  const coinType = pickField(obj, SINGLE_COIN_KEYS, isCoinTypeString);
  if (!coinType) return null;
  const amount = pickField(obj, SINGLE_AMOUNT_KEYS, isAmountValue);
  if (amount == null) return null;
  const decimals = pickField(obj, SINGLE_DECIMALS_KEYS, isFiniteNumber);
  const isBorrow = obj.type === 'Borrow';
  return { coinType, amount, decimals, isBorrow };
}

export function walkProtocolResponse(
  result: Record<string, unknown>,
  prices: Record<string, number>,
): number {
  let total = 0;
  walk(result, false);
  return total;

  function walk(node: unknown, debtSide: boolean): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, debtSide);
      return;
    }
    const obj = node as Record<string, unknown>;

    // Scallop pre-USD totals (root-level only, but cheap to check anywhere).
    if (typeof obj.totalSupplyValue === 'number') total += obj.totalSupplyValue;
    if (typeof obj.totalCollateralValue === 'number') total += obj.totalCollateralValue;
    if (typeof obj.totalLockedScaValue === 'number') total += obj.totalLockedScaValue;
    if (typeof obj.totalDebtValue === 'number') total -= obj.totalDebtValue;

    const pair = extractPair(obj);
    if (pair) {
      const a = toUsd(pair.coinTypeA, pair.amountA, pair.decimalsA, prices);
      const b = toUsd(pair.coinTypeB, pair.amountB, pair.decimalsB, prices);
      total += debtSide ? -(a + b) : a + b;
    } else {
      const single = extractSingle(obj);
      if (single) {
        const usd = toUsd(single.coinType, single.amount, single.decimals, prices);
        total += debtSide || single.isBorrow ? -usd : usd;
      }
    }

    for (const [k, v] of Object.entries(obj)) {
      const lk = k.toLowerCase();
      if (SKIP_KEYS.has(lk)) continue;
      const childDebt = debtSide || DEBT_KEYS.has(lk);
      walk(v, childDebt);
    }
  }
}

/**
 * Walks the response object recursively and collects every string value at
 * any key that looks like a Sui coin-type field. Used to discover which
 * token prices we still need to fetch before normalisers run. Coin types
 * may be returned without the `0x` prefix (Typus); we normalize before
 * adding so the price-cache key matches subsequent lookups.
 */
export function collectCoinTypes(obj: unknown, out: Set<string>): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const x of obj) collectCoinTypes(x, out);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string' && isCoinTypeString(v)) {
      const lk = k.toLowerCase();
      if (
        lk.includes('cointype') ||
        lk === 'tokenxtype' ||
        lk === 'tokenytype' ||
        lk === 'deposittoken' ||
        lk === 'rewardstoken' ||
        lk === 'token' ||
        lk === 'coinaddress' ||
        lk === 'phantomtype' ||
        lk === 'typename'
      ) {
        out.add(ensure0xPrefix(v));
      }
    } else if (typeof v === 'object' && v !== null) {
      collectCoinTypes(v, out);
    }
  }
}
