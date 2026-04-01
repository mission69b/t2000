import type { McpClientManager, McpCallResult } from './mcp-client.js';
import { NAVI_SERVER_NAME, NaviTools } from './navi-config.js';
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
} from './navi-transforms.js';

// ---------------------------------------------------------------------------
// Options for composite reads
// ---------------------------------------------------------------------------

export interface NaviReadOptions {
  /** MCP server name override (default: 'navi'). */
  serverName?: string;
}

function sn(opts?: NaviReadOptions): string {
  return opts?.serverName ?? NAVI_SERVER_NAME;
}

// ---------------------------------------------------------------------------
// Helper: call NAVI tool and parse JSON response
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

// ---------------------------------------------------------------------------
// Composite read: rates
// ---------------------------------------------------------------------------

export async function fetchRates(
  manager: McpClientManager,
  opts?: NaviReadOptions,
): Promise<RatesResult> {
  const pools = await callNavi(manager, NaviTools.GET_POOLS, {}, opts);
  return transformRates(pools);
}

// ---------------------------------------------------------------------------
// Composite read: health factor (enriched with positions)
// ---------------------------------------------------------------------------

export async function fetchHealthFactor(
  manager: McpClientManager,
  address: string,
  opts?: NaviReadOptions,
): Promise<HealthFactorResult> {
  const [hfRaw, posRaw] = await Promise.all([
    callNavi(manager, NaviTools.GET_HEALTH_FACTOR, { address }, opts),
    callNavi(manager, NaviTools.GET_POSITIONS, {
      address,
      protocols: 'navi',
      format: 'json',
    }, opts),
  ]);

  return transformHealthFactor(hfRaw, posRaw);
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
    callNavi(manager, NaviTools.GET_COINS, { address }, opts),
    callNavi(manager, NaviTools.GET_POSITIONS, {
      address,
      protocols: 'navi',
      format: 'json',
    }, opts),
    callNavi(manager, NaviTools.GET_AVAILABLE_REWARDS, { address }, opts),
    callNavi(manager, NaviTools.GET_POOLS, {}, opts),
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
  const [positions, pools] = await Promise.all([
    callNavi(manager, NaviTools.GET_POSITIONS, {
      address,
      protocols: 'navi',
      format: 'json',
    }, opts),
    callNavi(manager, NaviTools.GET_POOLS, {}, opts),
  ]);

  return transformSavings(positions, pools);
}

// ---------------------------------------------------------------------------
// Composite read: positions only
// ---------------------------------------------------------------------------

export async function fetchPositions(
  manager: McpClientManager,
  address: string,
  opts?: NaviReadOptions & { protocols?: string },
): Promise<PositionEntry[]> {
  const raw = await callNavi(
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
  const raw = await callNavi(
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
  const raw = await callNavi<{
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
