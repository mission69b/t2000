import { z } from 'zod';
import { fetchRates } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcpGlobal, getMcpManager, hasAgent, requireAgent } from './utils.js';

// [v1.4 — Day 3] DefiLlama fallback removed. The two upstream tiers
// (NAVI MCP + SDK agent) cover every authenticated and read-only-system
// path the harness exercises in production. The Tier 3 DefiLlama lookup
// was a leftover from when SDK agent rates weren't reliable; the SDK
// path has been stable for ~v0.45+ and the DefiLlama supply-only payload
// (no borrow APYs) was already a degraded experience. Honest "rates
// unavailable" is better than a half-correct mark from a deprecated
// vendor. Audited and accepted as a regression in the Day-3 deletion
// pass — see AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md.

/**
 * [v0.46.6] Stablecoin allow-list used by the `stableOnly` filter.
 *
 * Lower-cased symbol matching — covers the canonical USDC/USDT family
 * and the Sui-native synthetic stables (USDSUI, USDY, suiUSDT, USDe,
 * AUSD, FDUSD, BUCK). Excludes XAUm (gold-pegged, not USD-pegged) and
 * any LST/LRT.
 */
const STABLECOIN_SYMBOLS = new Set<string>([
  'usdc',
  'wusdc',
  'usdt',
  'wusdt',
  'suiusdt',
  'usdy',
  'usdsui',
  'usde',
  'ausd',
  'fdusd',
  'buck',
]);

type RateMap = Record<string, { saveApy: number; borrowApy: number }>;

function isStable(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol.toLowerCase());
}

function applyFilters(
  rates: RateMap,
  opts: { assets?: string[]; stableOnly?: boolean; topN?: number },
): RateMap {
  let entries = Object.entries(rates);
  if (opts.assets && opts.assets.length) {
    const wanted = new Set(opts.assets.map((a) => a.toLowerCase()));
    entries = entries.filter(([sym]) => wanted.has(sym.toLowerCase()));
  } else if (opts.stableOnly) {
    entries = entries.filter(([sym]) => isStable(sym));
  }
  // Sort by save APY desc so `topN` picks the best yields when no
  // explicit `assets` filter was supplied.
  entries.sort(([, a], [, b]) => b.saveApy - a.saveApy);
  if (opts.topN && opts.topN > 0) {
    entries = entries.slice(0, opts.topN);
  }
  return Object.fromEntries(entries);
}

function formatRatesSummary(rates: RateMap): string {
  return Object.entries(rates)
    .map(([asset, r]) => `${asset}: Save ${(r.saveApy * 100).toFixed(2)}% / Borrow ${(r.borrowApy * 100).toFixed(2)}%`)
    .join(', ');
}

export const ratesInfoTool = buildTool({
  name: 'rates_info',
  description:
    'NAVI Protocol lending markets ONLY (single-sided save/borrow, no impermanent-loss risk). Use this for stablecoin and bluechip lending yields. Renders a rich rates card. Filter args: `assets` (specific symbols like ["USDC"]), `stableOnly` (true to show only USD-pegged assets), `topN` (max rows in card, default 8, max 50).',
  inputSchema: z.object({
    assets: z
      .array(z.string())
      .optional()
      .describe('Filter to specific asset symbols (e.g. ["USDC"], ["USDC","USDT","USDSUI"]). Case-insensitive.'),
    stableOnly: z
      .boolean()
      .optional()
      .describe('When true, return only stablecoin markets (USDC, USDT, USDSUI, USDY, suiUSDT, etc.). Ignored when `assets` is supplied.'),
    topN: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Cap the number of rows in the card (default 8). Use 50 to render the full NAVI catalog.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      assets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter to specific asset symbols (case-insensitive).',
      },
      stableOnly: {
        type: 'boolean',
        description: 'When true, return only stablecoin markets. Ignored when `assets` is supplied.',
      },
      topN: {
        type: 'number',
        description: 'Cap the number of rows in the card (default 8, max 50).',
      },
    },
    required: [],
  },
  isReadOnly: true,

  async call(input, context) {
    const opts = {
      assets: input.assets,
      stableOnly: input.stableOnly,
      topN: input.topN ?? 8,
    };

    if (hasNaviMcpGlobal(context)) {
      const all = await fetchRates(getMcpManager(context));
      const filtered = applyFilters(all, opts);
      return { data: filtered, displayText: formatRatesSummary(filtered) };
    }

    if (hasAgent(context)) {
      const agent = requireAgent(context);
      const all = await agent.rates();
      const filtered = applyFilters(all, opts);
      return { data: filtered, displayText: formatRatesSummary(filtered) };
    }

    // [v1.4 — Day 3] No third tier. Both upstream paths are unavailable
    // — surface that honestly so the LLM can route the user (e.g. "try
    // again in a moment") instead of fabricating a number from a
    // deprecated vendor.
    throw new Error(
      'rates_info: NAVI lending data is currently unavailable. Try again shortly.',
    );
  },
});

// Exported for testing.
export const _internal = { applyFilters, isStable, STABLECOIN_SYMBOLS };
