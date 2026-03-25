/**
 * Investment strategy definitions — single source of truth for the web app.
 *
 * These mirror DEFAULT_STRATEGIES in @t2000/sdk/constants.ts.
 * If the SDK strategies change, update here.
 */

export interface StrategyDef {
  key: string;
  name: string;
  description: string;
  allocations: Record<string, number>;
}

export const STRATEGIES: StrategyDef[] = [
  {
    key: 'bluechip',
    name: 'Bluechip',
    description: 'Large-cap crypto index',
    allocations: { BTC: 50, ETH: 30, SUI: 20 },
  },
  {
    key: 'layer1',
    name: 'Layer 1s',
    description: 'Smart contract platforms',
    allocations: { ETH: 50, SUI: 50 },
  },
  {
    key: 'sui-heavy',
    name: 'Sui-Heavy',
    description: 'Sui-weighted portfolio',
    allocations: { BTC: 20, ETH: 20, SUI: 60 },
  },
  {
    key: 'all-weather',
    name: 'All-Weather',
    description: 'Crypto and commodities',
    allocations: { BTC: 30, ETH: 20, SUI: 20, GOLD: 30 },
  },
  {
    key: 'safe-haven',
    name: 'Safe Haven',
    description: 'Store-of-value assets',
    allocations: { BTC: 50, GOLD: 50 },
  },
];

export const STRATEGY_MAP: Record<string, StrategyDef> =
  Object.fromEntries(STRATEGIES.map((s) => [s.key, s]));

export function getStrategyAllocations(key: string): Record<string, number> | null {
  return STRATEGY_MAP[key]?.allocations ?? null;
}
