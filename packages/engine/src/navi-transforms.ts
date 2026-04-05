import { getDecimalsForCoinType } from '@t2000/sdk';

// ---------------------------------------------------------------------------
// Raw NAVI MCP response types (as returned by the live NAVI MCP server)
// ---------------------------------------------------------------------------

export interface NaviRawPool {
  id: number;
  symbol: string;
  coinType: string;
  price: string;
  market: string;
  ltv: number;
  liquidation: {
    bonus: string;
    ratio: string;
    threshold: string;
  };
  supply: string;
  borrow: string;
  supplyApy: string;
  borrowApy: string;
}

export interface NaviRawPosition {
  id: string;
  protocol: string;
  type: string;
  market: string;
  tokenASymbol: string;
  tokenAPrice: number;
  amountA: string;
  tokenBSymbol?: string | null;
  tokenBPrice?: number | null;
  amountB?: string | null;
  valueUSD: string;
  apr: string;
  liquidationThreshold: string;
  lowerPrice?: string | null;
  upperPrice?: string | null;
  currentPrice?: string | null;
  claimableRewards?: string | null;
  isActive?: boolean;
}

export interface NaviRawPositionsResponse {
  address: string;
  positions: NaviRawPosition[];
}

export interface NaviRawHealthFactor {
  address: string;
  healthFactor: number | null;
}

export interface NaviRawCoin {
  coinType: string;
  totalBalance: string;
  coinObjectCount: number;
  symbol?: string;
  decimals?: number;
}

export interface NaviRawRewardsResponse {
  address: string;
  rewards: Array<{
    pool?: string;
    rewardType?: string;
    amount?: string;
    symbol?: string;
    valueUsd?: number;
  }>;
  summary: Array<{
    symbol: string;
    totalAmount: string;
    valueUSD?: string;
  }>;
}

export interface NaviRawProtocolStats {
  tvl: number;
  totalBorrowUsd: number;
  averageUtilization: number;
  maxApy: number;
  userAmount: number;
  interactionUserAmount: number;
  borrowFee: number;
}

// ---------------------------------------------------------------------------
// Transformed engine-friendly types
// ---------------------------------------------------------------------------

export interface RatesResult {
  [symbol: string]: {
    saveApy: number;
    borrowApy: number;
    ltv: number;
    price: number;
  };
}

export interface HealthFactorResult {
  healthFactor: number;
  supplied: number;
  borrowed: number;
  maxBorrow: number;
  liquidationThreshold: number;
}

export interface BalanceResult {
  available: number;
  savings: number;
  debt: number;
  pendingRewards: number;
  gasReserve: number;
  total: number;
  stables: number;
}

export interface PositionEntry {
  protocol: string;
  type: 'supply' | 'borrow';
  symbol: string;
  amount: number;
  valueUsd: number;
  apy: number;
  liquidationThreshold: number;
}

export interface SavingsResult {
  positions: PositionEntry[];
  earnings: {
    totalYieldEarned: number;
    currentApy: number;
    dailyEarning: number;
    supplied: number;
  };
  fundStatus: {
    supplied: number;
    apy: number;
    earnedToday: number;
    earnedAllTime: number;
    projectedMonthly: number;
  };
}

// ---------------------------------------------------------------------------
// Safe number parser — handles strings, numbers, null, undefined
// ---------------------------------------------------------------------------

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Transform: pools → rates
// ---------------------------------------------------------------------------

export function transformRates(raw: unknown): RatesResult {
  const pools = Array.isArray(raw) ? (raw as NaviRawPool[]) : [];
  const result: RatesResult = {};

  for (const pool of pools) {
    if (!pool.symbol) continue;
    result[pool.symbol] = {
      saveApy: toNum(pool.supplyApy) / 100,
      borrowApy: toNum(pool.borrowApy) / 100,
      ltv: toNum(pool.ltv),
      price: toNum(pool.price),
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Transform: positions → typed PositionEntry[]
// ---------------------------------------------------------------------------

// NAVI MCP divides ALL position amounts by 10^9 (original storage precision),
// but newer pools (id > 10) store at the token's native decimals. For 6-decimal
// stablecoins in newer pools, this makes amounts 1000x too small.
// Correction factor: 10^(9 - 6) = 1000.
// Remove this map if/when the NAVI MCP fixes pool-aware decimal handling.
const NAVI_NEWER_POOL_SYMBOLS = new Set([
  'USDSUI', 'USDsui',
  'SUI_USDE', 'suiUSDe', 'USDe',
  'suiUSDT',
]);
const NEWER_POOL_FACTOR = 1000;

function naviDecimalFactor(symbol: string): number {
  return NAVI_NEWER_POOL_SYMBOLS.has(symbol) ? NEWER_POOL_FACTOR : 1;
}

export function transformPositions(raw: unknown): PositionEntry[] {
  const data = raw as NaviRawPositionsResponse | undefined;
  const positions = data?.positions ?? (Array.isArray(raw) ? (raw as NaviRawPosition[]) : []);

  return positions.map((p) => {
    const symbol = p.tokenASymbol ?? 'UNKNOWN';
    const factor = naviDecimalFactor(symbol);
    return {
      protocol: p.protocol ?? 'navi',
      type: p.type?.includes('borrow') ? ('borrow' as const) : ('supply' as const),
      symbol,
      amount: toNum(p.amountA) * factor,
      valueUsd: toNum(p.valueUSD) * factor,
      apy: toNum(p.apr) / 100,
      liquidationThreshold: toNum(p.liquidationThreshold),
    };
  });
}

// ---------------------------------------------------------------------------
// Transform: health factor (+ optional positions for enrichment)
// ---------------------------------------------------------------------------

export function transformHealthFactor(
  rawHf: unknown,
  rawPositions?: unknown,
): HealthFactorResult {
  const hf = rawHf as NaviRawHealthFactor | undefined;
  const positions = transformPositions(rawPositions);

  const supplied = positions
    .filter((p) => p.type === 'supply')
    .reduce((sum, p) => sum + p.valueUsd, 0);
  const borrowed = positions
    .filter((p) => p.type === 'borrow')
    .reduce((sum, p) => sum + p.valueUsd, 0);

  const supplyPositions = positions.filter((p) => p.type === 'supply');
  const weightedLt =
    supplied > 0
      ? supplyPositions.reduce(
          (acc, p) => acc + p.liquidationThreshold * p.valueUsd,
          0,
        ) / supplied
      : 0;

  const maxBorrow = supplied * weightedLt - borrowed;

  return {
    healthFactor: toNum(hf?.healthFactor) || (borrowed === 0 ? Infinity : 0),
    supplied,
    borrowed,
    maxBorrow: Math.max(0, maxBorrow),
    liquidationThreshold: weightedLt,
  };
}

// ---------------------------------------------------------------------------
// Transform: rewards → typed reward summaries
// ---------------------------------------------------------------------------

export interface PendingReward {
  symbol: string;
  totalAmount: number;
  valueUsd: number;
}

export function transformRewards(raw: unknown): PendingReward[] {
  const data = raw as NaviRawRewardsResponse | undefined;
  return (data?.summary ?? []).map((s) => ({
    symbol: s.symbol ?? 'UNKNOWN',
    totalAmount: toNum(s.totalAmount),
    valueUsd: toNum(s.valueUSD),
  }));
}

// ---------------------------------------------------------------------------
// Transform: coins + positions + rewards → balance breakdown
// Requires `prices` map (symbol → USD price) for proper cross-currency totals.
// ---------------------------------------------------------------------------

const STABLECOIN_SYMBOLS = new Set([
  'USDC', 'USDT', 'wUSDC', 'wUSDT', 'FDUSD', 'AUSD', 'BUCK', 'suiUSDe', 'USDSUI',
]);

const GAS_RESERVE_SUI = 0.05;

export interface BalancePrices {
  [symbol: string]: number;
}

export function transformBalance(
  rawCoins: unknown,
  rawPositions: unknown,
  rawRewards: unknown,
  prices?: BalancePrices,
): BalanceResult {
  const coins = Array.isArray(rawCoins) ? (rawCoins as NaviRawCoin[]) : [];
  const positions = transformPositions(rawPositions);
  const rewards = transformRewards(rawRewards);

  let availableUsd = 0;
  let stablesUsd = 0;
  let gasReserveUsd = 0;

  for (const coin of coins) {
    const symbol = coin.symbol ?? '';
    const decimals = coin.decimals ?? getDecimalsForCoinType(coin.coinType ?? '');
    const balance = toNum(coin.totalBalance) / 10 ** decimals;
    const price = prices?.[symbol] ?? (STABLECOIN_SYMBOLS.has(symbol) ? 1 : 0);

    if (symbol === 'SUI' || coin.coinType === '0x2::sui::SUI') {
      const reserveAmount = Math.min(balance, GAS_RESERVE_SUI);
      gasReserveUsd = reserveAmount * price;
      availableUsd += (balance - reserveAmount) * price;
    } else {
      availableUsd += balance * price;
      if (STABLECOIN_SYMBOLS.has(symbol)) {
        stablesUsd += balance * price;
      }
    }
  }

  const savings = positions
    .filter((p) => p.type === 'supply')
    .reduce((sum, p) => sum + p.valueUsd, 0);
  const debt = positions
    .filter((p) => p.type === 'borrow')
    .reduce((sum, p) => sum + p.valueUsd, 0);

  const pendingRewardsUsd = rewards.reduce((sum, r) => sum + r.valueUsd, 0);

  return {
    available: availableUsd,
    savings,
    debt,
    pendingRewards: pendingRewardsUsd,
    gasReserve: gasReserveUsd,
    total: availableUsd + savings + gasReserveUsd + pendingRewardsUsd - debt,
    stables: stablesUsd,
  };
}

// ---------------------------------------------------------------------------
// Transform: positions + pools → savings info
// ---------------------------------------------------------------------------

export function transformSavings(
  rawPositions: unknown,
  rawPools: unknown,
): SavingsResult {
  const positions = transformPositions(rawPositions);
  const rates = transformRates(rawPools);

  const supplyPositions = positions.filter((p) => p.type === 'supply');
  const supplied = supplyPositions.reduce((sum, p) => sum + p.valueUsd, 0);

  const weightedApy =
    supplied > 0
      ? supplyPositions.reduce(
          (acc, p) => acc + (rates[p.symbol]?.saveApy ?? p.apy) * p.valueUsd,
          0,
        ) / supplied
      : 0;

  const dailyEarning = (supplied * weightedApy) / 365;
  const projectedMonthly = dailyEarning * 30;

  return {
    positions,
    earnings: {
      totalYieldEarned: 0, // not available from MCP reads alone
      currentApy: weightedApy,
      dailyEarning,
      supplied,
    },
    fundStatus: {
      supplied,
      apy: weightedApy,
      earnedToday: dailyEarning,
      earnedAllTime: 0, // not available from MCP reads alone
      projectedMonthly,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers: extract text content from MCP response
// ---------------------------------------------------------------------------

export function extractMcpText(
  content: Array<{ type: string; text?: string; [key: string]: unknown }>,
): string {
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}

export function parseMcpJson<T = unknown>(
  content: Array<{ type: string; text?: string; [key: string]: unknown }>,
): T {
  const text = extractMcpText(content);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
