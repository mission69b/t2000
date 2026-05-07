import type { McpClientManager, McpCallResult } from '../mcp/client.js';
import { NAVI_SERVER_NAME, NaviTools } from './config.js';
import {
  parseMcpJson,
  transformBalance,
  transformHealthFactor,
  transformPositions,
  transformRates,
  transformRewards,
  transformSavings,
  type BalanceResult,
  type HealthFactorResult,
  type PendingReward,
  type PositionEntry,
  type RatesResult,
  type SavingsResult,
} from './transforms.js';
import {
  getNaviCacheStore,
  naviKey,
  NAVI_ADDR_TTL_SEC,
  NAVI_RATES_TTL_SEC,
} from './cache.js';
import { getTelemetrySink } from '../telemetry.js';

// ---------------------------------------------------------------------------
// Options for composite reads
// ---------------------------------------------------------------------------

export interface NaviReadOptions {
  /** MCP server name override (default: 'navi'). */
  serverName?: string;
  /** Skip the cache for this call (default: false). Useful for post-write refreshes. */
  skipCache?: boolean;
}

function sn(opts?: NaviReadOptions): string {
  return opts?.serverName ?? NAVI_SERVER_NAME;
}

// ---------------------------------------------------------------------------
// Circuit breaker (PR 4)
//
// NAVI MCP can return errors (rate limits, 5xx) under load. A process-local
// CB mirrors the BlockVision pattern: open after NAVI_CB_THRESHOLD errors
// in NAVI_CB_WINDOW_MS, suppress retries for NAVI_CB_COOLDOWN_MS.
// Per-process state is intentional — same rationale as BV CB.
// ---------------------------------------------------------------------------
const NAVI_CB_WINDOW_MS = 5_000;
const NAVI_CB_THRESHOLD = 10;
const NAVI_CB_COOLDOWN_MS = 30_000;

let naviCb429Timestamps: number[] = [];
let naviCbOpenUntil = 0;

function naviCbIsOpen(now: number): boolean {
  return now < naviCbOpenUntil;
}

function naviCbRecordError(now: number): void {
  naviCb429Timestamps.push(now);
  naviCb429Timestamps = naviCb429Timestamps.filter((t) => now - t < NAVI_CB_WINDOW_MS);
  if (naviCb429Timestamps.length >= NAVI_CB_THRESHOLD && !naviCbIsOpen(now)) {
    naviCbOpenUntil = now + NAVI_CB_COOLDOWN_MS;
    getTelemetrySink().gauge('navi.cb_open', 1);
    console.warn(
      `[navi-reads] circuit breaker OPEN — ${NAVI_CB_THRESHOLD} errors in ${NAVI_CB_WINDOW_MS}ms, retries disabled for ${NAVI_CB_COOLDOWN_MS / 1000}s`,
    );
    naviCb429Timestamps = [];
  }
}

/** Test seam — reset NAVI CB state between tests. */
export function _resetNaviCircuitBreaker(): void {
  naviCb429Timestamps = [];
  naviCbOpenUntil = 0;
}

// ---------------------------------------------------------------------------
// Retry config
// ---------------------------------------------------------------------------
const NAVI_RETRY_MAX_ATTEMPTS = 3;
const NAVI_RETRY_BASE_DELAY_MS = 200;
const NAVI_RETRY_BACKOFF_FACTOR = 3;

// ---------------------------------------------------------------------------
// Helper: call NAVI tool with retry and circuit breaker
// ---------------------------------------------------------------------------

async function callNavi<T = unknown>(
  manager: McpClientManager,
  tool: string,
  args: Record<string, unknown> = {},
  opts?: NaviReadOptions,
): Promise<T> {
  const result: McpCallResult = await manager.callTool(sn(opts), tool, args);
  if (result.isError) {
    const msg = result.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text!)
      .join(' ');
    throw new Error(`NAVI MCP error (${tool}): ${msg || 'unknown error'}`);
  }
  return parseMcpJson<T>(result.content);
}

async function callNaviWithRetry<T = unknown>(
  manager: McpClientManager,
  tool: string,
  args: Record<string, unknown> = {},
  opts?: NaviReadOptions,
): Promise<T> {
  const sink = getTelemetrySink();
  const now = () => Date.now();

  if (naviCbIsOpen(now())) {
    sink.counter('navi.requests', { tool, status: 'cb_open' });
    throw new Error(`[navi-reads] circuit breaker open — skipping ${tool}`);
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < NAVI_RETRY_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delay = NAVI_RETRY_BASE_DELAY_MS * Math.pow(NAVI_RETRY_BACKOFF_FACTOR, attempt - 1);
      await new Promise<void>((r) => setTimeout(r, delay));
    }
    try {
      const result = await callNavi<T>(manager, tool, args, opts);
      sink.counter('navi.requests', { tool, status: '2xx', attempt: String(attempt) });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      sink.counter('navi.requests', { tool, status: '5xx', attempt: String(attempt) });
      naviCbRecordError(now());

      if (naviCbIsOpen(now())) {
        throw lastError;
      }
    }
  }
  throw lastError ?? new Error(`NAVI MCP: ${tool} failed after ${NAVI_RETRY_MAX_ATTEMPTS} attempts`);
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const entry = await getNaviCacheStore().get(key);
    if (entry !== null) {
      getTelemetrySink().counter('navi.cache_hit', { key_prefix: key.split(':').slice(0, 2).join(':'), freshness: 'fresh' });
      return entry.data as T; // safe cast: we control what we write
    }
    getTelemetrySink().counter('navi.cache_hit', { key_prefix: key.split(':').slice(0, 2).join(':'), freshness: 'miss' });
    return null;
  } catch {
    return null;
  }
}

async function cacheSet<T>(key: string, data: T, ttlSec: number): Promise<void> {
  try {
    await getNaviCacheStore().set(key, { data, cachedAt: Date.now() }, ttlSec);
  } catch {
    // swallow — cache miss is always tolerable
  }
}

// ---------------------------------------------------------------------------
// Composite read: rates
// ---------------------------------------------------------------------------

export async function fetchRates(
  manager: McpClientManager,
  opts?: NaviReadOptions,
): Promise<RatesResult> {
  const key = naviKey.rates();
  if (!opts?.skipCache) {
    const cached = await cacheGet<RatesResult>(key);
    if (cached) return cached;
  }

  const pools = await callNaviWithRetry(manager, NaviTools.GET_POOLS, {}, opts);
  const result = transformRates(pools);
  await cacheSet(key, result, NAVI_RATES_TTL_SEC);
  return result;
}

// ---------------------------------------------------------------------------
// Composite read: health factor (enriched with positions)
// ---------------------------------------------------------------------------

export async function fetchHealthFactor(
  manager: McpClientManager,
  address: string,
  opts?: NaviReadOptions,
): Promise<HealthFactorResult> {
  const key = naviKey.health(address);
  if (!opts?.skipCache) {
    const cached = await cacheGet<HealthFactorResult>(key);
    if (cached) return cached;
  }

  const [hfRaw, posRaw] = await Promise.all([
    callNaviWithRetry(manager, NaviTools.GET_HEALTH_FACTOR, { address }, opts),
    callNaviWithRetry(manager, NaviTools.GET_POSITIONS, {
      address,
      protocols: 'navi',
      format: 'json',
    }, opts),
  ]);

  const result = transformHealthFactor(hfRaw, posRaw);
  await cacheSet(key, result, NAVI_ADDR_TTL_SEC);
  return result;
}

// ---------------------------------------------------------------------------
// Composite read: balance breakdown
// ---------------------------------------------------------------------------

export async function fetchBalance(
  manager: McpClientManager,
  address: string,
  opts?: NaviReadOptions,
): Promise<BalanceResult> {
  const [coins, positions, rewards, pools] = await Promise.all([
    callNaviWithRetry(manager, NaviTools.GET_COINS, { address }, opts),
    callNaviWithRetry(manager, NaviTools.GET_POSITIONS, {
      address,
      protocols: 'navi',
      format: 'json',
    }, opts),
    callNaviWithRetry(manager, NaviTools.GET_AVAILABLE_REWARDS, { address }, opts),
    callNaviWithRetry(manager, NaviTools.GET_POOLS, {}, opts),
  ]);

  const rates = transformRates(pools);
  const prices: Record<string, number> = {};
  for (const [symbol, rate] of Object.entries(rates)) {
    prices[symbol] = rate.price;
  }

  return transformBalance(coins, positions, rewards, prices);
}

// ---------------------------------------------------------------------------
// Composite read: savings info (positions + pool APYs)
// ---------------------------------------------------------------------------

export async function fetchSavings(
  manager: McpClientManager,
  address: string,
  opts?: NaviReadOptions,
): Promise<SavingsResult> {
  const key = naviKey.savings(address);
  if (!opts?.skipCache) {
    const cached = await cacheGet<SavingsResult>(key);
    if (cached) return cached;
  }

  const [positions, pools] = await Promise.all([
    callNaviWithRetry(manager, NaviTools.GET_POSITIONS, {
      address,
      protocols: 'navi',
      format: 'json',
    }, opts),
    callNaviWithRetry(manager, NaviTools.GET_POOLS, {}, opts),
  ]);

  const result = transformSavings(positions, pools);
  await cacheSet(key, result, NAVI_ADDR_TTL_SEC);
  return result;
}

// ---------------------------------------------------------------------------
// Composite read: positions only
// ---------------------------------------------------------------------------

export async function fetchPositions(
  manager: McpClientManager,
  address: string,
  opts?: NaviReadOptions & { protocols?: string },
): Promise<PositionEntry[]> {
  const raw = await callNaviWithRetry(
    manager,
    NaviTools.GET_POSITIONS,
    { address, protocols: opts?.protocols ?? 'navi', format: 'json' },
    opts,
  );
  return transformPositions(raw);
}

// ---------------------------------------------------------------------------
// Composite read: available rewards
// ---------------------------------------------------------------------------

export async function fetchAvailableRewards(
  manager: McpClientManager,
  address: string,
  opts?: NaviReadOptions,
): Promise<PendingReward[]> {
  const raw = await callNaviWithRetry(
    manager,
    NaviTools.GET_AVAILABLE_REWARDS,
    { address },
    opts,
  );
  return transformRewards(raw);
}

// ---------------------------------------------------------------------------
// Composite read: protocol stats
// ---------------------------------------------------------------------------

export interface ProtocolStats {
  tvl: number;
  totalBorrowUsd: number;
  utilization: number;
  maxApy: number;
  totalUsers: number;
}

export async function fetchProtocolStats(
  manager: McpClientManager,
  opts?: NaviReadOptions,
): Promise<ProtocolStats> {
  const raw = await callNaviWithRetry<{
    tvl?: number;
    totalBorrowUsd?: number;
    averageUtilization?: number;
    maxApy?: number;
    userAmount?: number;
  }>(manager, NaviTools.GET_PROTOCOL_STATS, {}, opts);

  return {
    tvl: raw?.tvl ?? 0,
    totalBorrowUsd: raw?.totalBorrowUsd ?? 0,
    utilization: raw?.averageUtilization ?? 0,
    maxApy: raw?.maxApy ?? 0,
    totalUsers: raw?.userAmount ?? 0,
  };
}
