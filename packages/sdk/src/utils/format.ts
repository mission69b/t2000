import { MIST_PER_SUI, BPS_DENOMINATOR, USDC_DECIMALS, SUI_DECIMALS, SUPPORTED_ASSETS } from '../constants.js';
import type { SupportedAsset } from '../constants.js';

export function mistToSui(mist: bigint): number {
  return Number(mist) / Number(MIST_PER_SUI);
}

export function suiToMist(sui: number): bigint {
  return BigInt(Math.round(sui * Number(MIST_PER_SUI)));
}

export function usdcToRaw(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

export function rawToUsdc(raw: bigint): number {
  return Number(raw) / 10 ** USDC_DECIMALS;
}

export function stableToRaw(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

export function rawToStable(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

export function getDecimals(asset: SupportedAsset): number {
  return SUPPORTED_ASSETS[asset].decimals;
}

export function rawToDisplay(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

export function displayToRaw(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

export function bpsToPercent(bps: bigint): number {
  return Number(bps) / Number(BPS_DENOMINATOR) * 100;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatSui(amount: number): string {
  if (amount < 0.001) return `${amount.toFixed(6)} SUI`;
  return `${amount.toFixed(3)} SUI`;
}

export function formatLargeNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

export function formatAssetAmount(amount: number, asset: string): string {
  if (asset === 'BTC') return amount.toFixed(8);
  if (asset === 'ETH') return amount.toFixed(6);
  return amount.toFixed(4);
}

const ASSET_LOOKUP: Map<string, string> = new Map();
for (const [key, info] of Object.entries(SUPPORTED_ASSETS)) {
  ASSET_LOOKUP.set(key.toUpperCase(), key);
  if (info.displayName && info.displayName.toUpperCase() !== key.toUpperCase()) {
    ASSET_LOOKUP.set(info.displayName.toUpperCase(), key);
  }
}

/**
 * Case-insensitive lookup against SUPPORTED_ASSETS keys AND display names.
 * 'usde' → 'USDe', 'suiusde' → 'USDe', 'suiusdt' → 'USDT', 'usdsui' → 'USDsui'.
 * Returns the original input if not found so downstream validation can reject it.
 */
export function normalizeAsset(input: string): string {
  return ASSET_LOOKUP.get(input.toUpperCase()) ?? input;
}
