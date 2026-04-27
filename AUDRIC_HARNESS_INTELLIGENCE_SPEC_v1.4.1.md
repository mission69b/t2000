# Audric Intelligence — Harness Intelligence Spec (Spec 2) v1.4.1

*Version 1.4.1 — Execution-ready (final) · April 2026 · Internal*
*Supersedes v1.4 (and v1.0 / v1.1 / v1.2 / v1.3 / v1.3.1 / v1.4). Changes marked [v1.4] for the BlockVision refactor and [v1.4.1] for the post-merge audit fixes.*
*Informed by 696-turn TurnMetrics baseline (2026-04-23 to 2026-04-25)*
*v1.3 audit: 5 critical gaps (G1–G5) + 6 minor issues (M1–M6) found 2026-04-26.*
*v1.3.1 audit: 3 architectural gaps (G6–G8) + 5 minor issues (G9–G13) found 2026-04-26.*
*v1.4 audit: 4 blockers (B1–B4) + 3 minor cosmetic issues (m1–m3) found in v1.3.1 re-audit on 2026-04-26 — all folded in below.*
*v1.4.1 audit: 4 critical (C1–C4) + 6 major (M1'–M6') gaps found by re-auditing v1.4 against the live `audric/` codebase 2026-04-26 — all folded in below; full audit notes in the footer.*
*v1.4 architectural change: DefiLlama price feed + 7 LLM tools deleted; replaced with BlockVision indexer REST API + Sui RPC degraded fallback.*

---

## Executive summary

Five items across two tracks. Track A (Items 1–4) is data-driven correctness and instrumentation work. Track B (Items 5–6) is the intelligence layer.

Item 1 was rewritten against BlockVision (already paid for in production as the Sui RPC provider) — replacing DefiLlama price feed entirely and consolidating two parallel network calls into one. This collapses Item 1 from a fallback-RPC + cache-layer + helper-extraction package into a vendor swap, and deletes seven now-unnecessary `defillama_*` LLM tools. Item 5 collapses to a single fix (cache savings formula) because the ACI refinement work was attached to a tool that no longer exists.

**Total effort:** ~5 days solo (down from 7 in v1.3.1).
**Engine version bump:** one batched minor bump at end of Day 5. Current engine version is `0.46.16` — target `0.47.0`.

---

## Baseline numbers this spec is targeting

| Metric | Baseline | Target |
|---|---|---|
| `balance_check` p95 latency | 8,368ms | < 1,500ms (BlockVision-backed) |
| First-token p95 (resumed sessions) | 9,779ms | < 5,000ms |
| `pendingActionOutcome` false-resolution | possible (updateMany) | impossible (attemptId) |
| `swap_execute` latency visibility | 0ms (instrumentation gap) | real client-side ms |
| BlockVision portfolio API p95 | not measured | < 500ms |
| `cache_token_pct` formula artifact | 10,928% | replaced with `cache_savings_usd` |
| DefiLlama production dependencies | 8 (1 price feed + 7 LLM tools) | 1 (`protocol_deep_dive` only) |

---

## What this spec does NOT touch

- Effort classifier, prompt cache, guard config, compaction, cost discipline
- FAITH, Tide, MANIFEST
- `protocol_deep_dive` — the only remaining DefiLlama tool, narrow valuable use case ("is NAVI safe?")

---

## Vendor consolidation — DefiLlama → BlockVision [v1.4 — new section]

### Why

DefiLlama serves two distinct purposes today: (a) USD price feed for `balance_check` and `portfolio_analysis`, and (b) a market-data surface exposed as seven LLM tools. Both are problems:

- **Price feed**: DefiLlama public `coins.llama.fi` is the dominant tail-latency contributor in `balance_check` (8,368ms p95 baseline). No SLA, no support contract, free public endpoint shared by every other Sui app.
- **LLM tools**: Seven `defillama_*` tools sit in every prompt's tool-description block costing prompt-cache real estate, and most of them (`chain_tvl`, `protocol_fees`, `sui_protocols`) target analyst-tier curiosity that doesn't fit Audric's personal-finance positioning.

### What replaces it

| Concern | Replacement |
|---|---|
| Wallet portfolio + USD pricing | **BlockVision Indexer REST API** `/v2/sui/account/coins` — single call returns coins + balances + prices + USD totals. Same vendor we already pay for the Sui JSON-RPC routing (`BLOCKVISION_API_KEY` in `audric/apps/web/.env.example:64`), but **a different API surface** (REST indexer at `api.blockvision.org/v2/sui/...`, `x-api-key` header) than the JSON-RPC endpoint resolved by `getSuiRpcUrl()` in `audric/apps/web/lib/sui-rpc.ts:22`. New integration, same vendor. [v1.4.1 — M3] |
| Multi-token price lookup | **BlockVision** `/v2/sui/coin/price/list` — max 10 tokens per call, optional 24h change. |
| Price-feed degraded mode | **Sui RPC** (`fetchWalletCoins` — already in stack) for balances + hardcoded $1.00 for stablecoin allow-list. SUI / non-stable / long-tail tokens show balance without USD when BlockVision is unavailable. Acceptable for Audric's stablecoin-heavy user profile. |
| Yield rates | **`rates_info`** — already exists, hits NAVI MCP. DefiLlama fallback inside this tool deleted. |
| Protocol safety / TVL trends ("is NAVI safe?") | **`protocol_deep_dive`** — kept (still hits DefiLlama directly). Narrow scope, no good replacement on BlockVision. The lone production DefiLlama dependency post-refactor. |
| LP / IL pool browsing | **No replacement.** System prompt updated to redirect to `rates_info` for safe yields and decline LP/IL questions with a brief explanation. |
| Cross-chain TVL / protocol fees / Sui-protocol discovery | **No replacement.** Static prompt block lists 5–10 Sui protocols (NAVI, Suilend, Cetus, Bluefin, Scallop, Aftermath, Volo, DeepBook). |

### Net code impact

- **Deleted**: `packages/engine/src/defillama-prices.ts` (~85 lines), `packages/engine/src/tools/defillama.ts` (~500 lines, 7 tools), the inline DefiLlama fallback in `tools/rates.ts`.
- **New**: `packages/engine/src/blockvision-prices.ts` (~120 lines), `packages/engine/src/tools/token-prices.ts` (~50 lines, 1 tool).
- **Net**: ~600 lines deleted, ~170 lines added; 7 LLM tools removed, 1 added; 1 success criterion (Q6 ACI refinement) dropped.

### Trade-offs

- **Single-vendor reliance** for prices. Mitigated by Sui-RPC degraded mode that prices stablecoins (Audric's dominant value) correctly during a BlockVision outage.
- **Long-tail token gaps**: BlockVision indexes broadly but may miss exotic memecoins. The portfolio response sets `priceUnavailable: true` for unknowns — UI displays balance + symbol, no USD. Acceptable.
- **`protocol_deep_dive` still on DefiLlama**: complete vendor exit isn't the goal here. One narrow tool with no equivalent on BlockVision is fine.

---

## Day 1 prerequisite — `audric/apps/web/lib/engine/cost-rates.ts` [v1.3 — extraction, not creation]

`costRatesForModel()` already exists inline in `chat/route.ts` (lines 621–632). v1.3 moves it to a single source of truth on Day 1 so Items 4 and 5 can both consume it.

**Step 1** — create `audric/apps/web/lib/engine/cost-rates.ts` with the body below.
**Step 2 [v1.3.1 — G11 precision]** — delete only the `costRatesForModel` function (lines 621–632) and its local `ModelCostRates` interface (lines 603–608) from `chat/route.ts`. **Preserve** `COST_PER_INPUT_TOKEN` and `COST_PER_OUTPUT_TOKEN` (lines 600–601) — they back the legacy `Message` row writer further down in the same file where per-model context is unavailable.
**Step 3** — `import { costRatesForModel } from '@/lib/engine/cost-rates'` in `chat/route.ts`.

```typescript
// audric/apps/web/lib/engine/cost-rates.ts

export interface ModelRates {
  input: number;      // $ per token
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// Anthropic pricing as of April 2026 — update when rates change:
const RATES: Record<string, ModelRates> = {
  'claude-haiku-4-5-20251001': {
    input:      0.0000008,
    output:     0.000004,
    cacheRead:  0.00000008,
    cacheWrite: 0.000001,
  },
  'claude-sonnet-4-6': {
    input:      0.000003,
    output:     0.000015,
    cacheRead:  0.0000003,
    cacheWrite: 0.00000375,
  },
  'claude-opus-4-6': {
    input:      0.000015,
    output:     0.000075,
    cacheRead:  0.0000015,
    cacheWrite: 0.00001875,
  },
};

const DEFAULT_RATES = RATES['claude-sonnet-4-6'];

export function costRatesForModel(model: string): ModelRates {
  return RATES[model] ?? DEFAULT_RATES;
}
```

---

## Item 1 — `balance_check` tail latency via BlockVision portfolio API [v1.4 — replaces v1.3.1 Item 1]

### Root cause

`balance_check` p95 = 8,368ms. Today's `balanceCheckTool.call()` makes two parallel network calls — `fetchWalletCoins(address, ctx.suiRpcUrl)` against Sui RPC and `fetchTokenPrices(coinTypes)` against `coins.llama.fi` — then merges them with `positionFetcher` (NAVI host hook) results. DefiLlama's public price endpoint is the dominant tail contributor, and the parallel RPC call adds an independent tail.

BlockVision is already wired in production for Sui **JSON-RPC** routing via `getSuiRpcUrl()` (`audric/apps/web/lib/sui-rpc.ts:22`). v1.4.1 adds a **second**, **distinct** BlockVision surface: the **Indexer REST API** at `https://api.blockvision.org/v2/...`, authenticated by `x-api-key`. The same `BLOCKVISION_API_KEY` env var works for both. Its `/v2/sui/account/coins` endpoint returns wallet coins **with prices and USD values** in a single round-trip — replacing the two-call pattern with one REST call collapses both tails.

**[v1.4.1 — M3]** Treat this as net-new integration (new base URL, new auth pattern, new error surface) even though the vendor and key are unchanged. Day 1 includes monitoring `BlockVision portfolio p95 < 500ms` (Q-Bv) explicitly as a guard against cold-start surprises.

### New file — `packages/engine/src/blockvision-prices.ts`

```typescript
// packages/engine/src/blockvision-prices.ts
//
// [v1.4] Replaces defillama-prices.ts. Single source of truth for Sui token
// pricing across the engine. Uses BlockVision indexer endpoints (paid, same
// API key as the Sui RPC) with a Sui-RPC + hardcoded-stablecoin fallback
// for graceful degradation during BlockVision outages.

import { fetchWalletCoins, type WalletCoin } from './sui-rpc.js';

const BV_BASE = 'https://api.blockvision.org/v2';

const STABLE_HARDCODED: Record<string, number> = {
  USDC: 1.0, USDT: 1.0, USDe: 1.0, USDsui: 1.0, wUSDC: 1.0, wUSDT: 1.0,
};

const PORTFOLIO_TIMEOUT_MS = 4_000;
const PRICES_TIMEOUT_MS    = 3_000;
const CACHE_TTL_MS         = 5_000;

export interface PortfolioCoin {
  coinType: string;
  symbol: string;
  decimals: number;
  balance: string;             // raw amount (e.g. "12345000")
  price: number | null;        // null when unavailable
  usdValue: number | null;
  priceUnavailable?: true;     // explicit flag for downstream renderers
}

export interface AddressPortfolio {
  coins: PortfolioCoin[];
  totalUsd: number;            // sum of priced USD values; missing prices excluded
  pricedAt: number;
  source: 'blockvision' | 'sui-rpc-degraded';
}

interface CachedPortfolio {
  data: AddressPortfolio;
  fetchedAt: number;
}

export async function fetchAddressPortfolio(
  address: string,
  apiKey: string | undefined,
  suiRpcUrl?: string,
  cache?: Map<string, CachedPortfolio>,
): Promise<AddressPortfolio> {
  const cached = cache?.get(address);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  // [v1.4] Tier 1: BlockVision /account/coins — coins + prices + totals.
  if (apiKey) {
    try {
      const url = `${BV_BASE}/sui/account/coins?address=${encodeURIComponent(address)}`;
      const res = await fetch(url, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(PORTFOLIO_TIMEOUT_MS),
      });
      if (res.ok) {
        const json = await res.json() as {
          code: number;
          result: {
            coins: Array<{
              coinType: string;
              symbol: string;
              decimals: number;
              balance: string;
              price?: string;
              usdValue?: string;
            }>;
            usdValue?: string;
          };
        };
        if (json.code === 200) {
          const portfolio: AddressPortfolio = {
            coins: json.result.coins.map((c) => {
              const price = c.price ? Number(c.price) : null;
              const usdValue = c.usdValue ? Number(c.usdValue) : null;
              const out: PortfolioCoin = {
                coinType: c.coinType, symbol: c.symbol, decimals: c.decimals,
                balance: c.balance, price, usdValue,
              };
              if (price === null) out.priceUnavailable = true;
              return out;
            }),
            totalUsd: json.result.usdValue ? Number(json.result.usdValue) : 0,
            pricedAt: Date.now(),
            source: 'blockvision',
          };
          cache?.set(address, { data: portfolio, fetchedAt: Date.now() });
          return portfolio;
        }
      }
      console.warn(`[blockvision-prices] portfolio HTTP ${res.status} for ${address}`);
    } catch (err) {
      console.warn('[blockvision-prices] portfolio failed, falling back:', err);
    }
  }

  // [v1.4] Tier 3: Sui RPC degraded mode — balances only, hardcoded stables.
  const coins = await fetchWalletCoins(address, suiRpcUrl);
  const degraded: AddressPortfolio = {
    coins: coins.map((c: WalletCoin): PortfolioCoin => {
      const price = STABLE_HARDCODED[c.symbol] ?? null;
      const balance = Number(c.totalBalance) / 10 ** c.decimals;
      const usdValue = price !== null ? balance * price : null;
      const out: PortfolioCoin = {
        coinType: c.coinType, symbol: c.symbol, decimals: c.decimals,
        balance: c.totalBalance, price, usdValue,
      };
      if (price === null) out.priceUnavailable = true;
      return out;
    }),
    totalUsd: 0, // recomputed below
    pricedAt: Date.now(),
    source: 'sui-rpc-degraded',
  };
  degraded.totalUsd = degraded.coins.reduce((s, c) => s + (c.usdValue ?? 0), 0);
  cache?.set(address, { data: degraded, fetchedAt: Date.now() });
  return degraded;
}

/**
 * [v1.4] Multi-token price lookup. Used by the new `token_prices` LLM tool
 * and by engine-factory's prompt-time price injection. Max 10 coinTypes per
 * call (BlockVision limit). Stablecoins served from the hardcoded map first.
 */
export async function fetchTokenPrices(
  coinTypes: string[],
  apiKey: string | undefined,
  options?: { include24hChange?: boolean },
): Promise<Record<string, { price: number; change24h?: number }>> {
  if (coinTypes.length === 0) return {};

  const out: Record<string, { price: number; change24h?: number }> = {};

  // Hardcoded stable shortcut — no network call needed.
  const remaining: string[] = [];
  for (const ct of coinTypes) {
    const symbol = ct.split('::').pop() ?? '';
    const stable = STABLE_HARDCODED[symbol];
    if (stable !== undefined) out[ct] = { price: stable };
    else remaining.push(ct);
  }
  if (remaining.length === 0 || !apiKey) return out;

  // BlockVision max 10 — chunk if more.
  const chunks: string[][] = [];
  for (let i = 0; i < remaining.length; i += 10) chunks.push(remaining.slice(i, i + 10));

  for (const chunk of chunks) {
    try {
      const tokenIds = chunk.join(',');
      const url = `${BV_BASE}/sui/coin/price/list?tokenIds=${encodeURIComponent(tokenIds)}`
        + (options?.include24hChange ? '&show24hChange=true' : '');
      const res = await fetch(url, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(PRICES_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const json = await res.json() as {
        code: number;
        result: {
          prices: Record<string, string>;
          coin24HChange?: Record<string, string>;
        };
      };
      if (json.code !== 200) continue;
      for (const [ct, priceStr] of Object.entries(json.result.prices ?? {})) {
        const price = Number(priceStr);
        if (Number.isFinite(price)) {
          const entry: { price: number; change24h?: number } = { price };
          const ch = json.result.coin24HChange?.[ct];
          if (ch !== undefined) entry.change24h = Number(ch);
          out[ct] = entry;
        }
      }
    } catch (err) {
      console.warn('[blockvision-prices] price/list chunk failed:', err);
    }
  }
  return out;
}
```

### Wire into ToolContext

```typescript
// packages/engine/src/types.ts — ADD to ToolContext:
blockvisionApiKey?: string;
portfolioCache?: Map<string, { data: AddressPortfolio; fetchedAt: number }>;
```

### Rewrite `tools/balance.ts`

The current `balanceCheckTool.call()` (~190 lines) collapses to ~80 lines:

```typescript
// packages/engine/src/tools/balance.ts
import { z } from 'zod';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, getWalletAddress, requireAgent } from './utils.js';
import { fetchAddressPortfolio } from '../blockvision-prices.js';
// (NAVI MCP imports stay — savings/debt/rewards still come from positionFetcher or NAVI MCP)

const GAS_RESERVE_SUI = 0.05;

export const balanceCheckTool = buildTool({
  name: 'balance_check',
  description: '...', // unchanged
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,
  cacheable: false,

  async call(_input, context) {
    if (hasNaviMcp(context)) {
      const address = getWalletAddress(context);
      const hasPositionFetcher = !!(context.positionFetcher && context.walletAddress);

      // [v1.4] Single BlockVision call replaces fetchWalletCoins + fetchTokenPrices.
      const [portfolio, serverPositions] = await Promise.all([
        fetchAddressPortfolio(
          address,
          context.blockvisionApiKey,
          context.suiRpcUrl,
          context.portfolioCache,
        ),
        hasPositionFetcher
          ? context.positionFetcher!(context.walletAddress!).catch((err) => {
              console.warn('[balance_check] positionFetcher failed:', err);
              return null;
            })
          : null, // unauth/non-NAVI path: NAVI MCP fallback handled below
      ]);

      // [v1.4.1 — M1] vSUI exchange-rate workaround — REWRITTEN for embedded
      // prices. The current balance.ts:106-122 mutates a separate `prices` map
      // (`prices[VSUI_COIN_TYPE] = derived`). Under BlockVision, prices live on
      // `portfolio.coins[i].price`. Mutate the coin entry in place instead:
      const vsuiIdx = portfolio.coins.findIndex(c => c.coinType === VSUI_COIN_TYPE);
      const sui = portfolio.coins.find(c => c.symbol === 'SUI');
      if (vsuiIdx !== -1 && portfolio.coins[vsuiIdx].price === null
          && sui?.price && context.voloStats?.exchangeRate) {
        const derived = sui.price * context.voloStats.exchangeRate;
        const balanceFloat = Number(portfolio.coins[vsuiIdx].balance)
          / 10 ** portfolio.coins[vsuiIdx].decimals;
        portfolio.coins[vsuiIdx].price = derived;
        portfolio.coins[vsuiIdx].usdValue = balanceFloat * derived;
        delete portfolio.coins[vsuiIdx].priceUnavailable;
        portfolio.totalUsd += portfolio.coins[vsuiIdx].usdValue;
      }

      // Aggregate available / stables / gas reserve / holdings — same logic
      // as today, just driven off `portfolio.coins` instead of separate
      // walletCoins + prices maps. Stable allow-list, USDC saveable computation,
      // and `holdings` shape stay identical to preserve UI compatibility.
      // ...

      return { data: bal, displayText: /* unchanged shape */ };
    }

    // SDK fallback (unauth path) — unchanged.
    const agent = requireAgent(context);
    const balance = await agent.balance();
    return { data: /* unchanged */, displayText: /* unchanged */ };
  },
});
```

The output shape (`available`, `savings`, `debt`, `pendingRewards`, `gasReserve`, `total`, `stables`, `holdings`, `saveableUsdc`) is **byte-identical** to today's. UI cards continue to render unchanged.

### [v1.4.1 — M2] NAVI MCP coin-fetch fallback: dropped (accepted regression)

The current `balance.ts:75–85` has a Tier-3 fallback: if `fetchWalletCoins` (Sui RPC) returns empty AND NAVI MCP is available, query `NaviTools.GET_COINS` for coins. v1.4 silently elided this path. v1.4.1 keeps it elided — **explicitly as an accepted regression** — for three reasons:

1. **Triple redundancy is unnecessary.** BlockVision Tier 1 + Sui RPC Tier 3 already covers two independent providers. Tier-3 NAVI MCP fired in <0.1% of `balance_check` calls in the 696-turn baseline.
2. **NAVI MCP outages already block the dominant code paths** (`savings_info`, `health_check`, write tools). A NAVI MCP outage that *also* coincides with both BlockVision *and* Sui RPC being unavailable is a triple-fault scenario where `balance_check` failing gracefully (zero coins with a banner) is acceptable.
3. **`hasNaviMcp(context)` gate stays.** The outer branch still requires NAVI MCP for the auth path; non-NAVI/unauth users continue down the SDK fallback. The dropped logic was a niche "NAVI MCP up, both price providers down" sub-case.

If the regression turns out to matter post-launch, a Day-N follow-up adds NAVI MCP coin fetch as Tier 4 in `fetchAddressPortfolio()`. Spec acknowledges the trade-off rather than hiding it.

### Wire `BLOCKVISION_API_KEY` into engine factory

```typescript
// audric/apps/web/lib/engine/engine-factory.ts — buildToolContext:
const toolContext = buildToolContext({
  // ...existing fields...
  blockvisionApiKey: process.env.BLOCKVISION_API_KEY,
  portfolioCache: new Map(),  // [v1.4] fresh per request
  suiRpcUrl: process.env.SUI_RPC_URL,
});
```

### [v1.4.1 — M6] Critical-path price injection at `engine-factory.ts:316`

Line 316 of `engine-factory.ts` calls `fetchTokenPrices(...)` at engine boot for every authenticated chat (used to seed `<session_context>` with prices for held coins + reference coins before the agent loop runs). After the v1.4 swap, this becomes a BlockVision Indexer REST call on the cold-start critical path of `createEngine()`.

Mitigation:

1. **`fetchTokenPrices()` in `blockvision-prices.ts` already wraps each chunk in `AbortSignal.timeout(PRICES_TIMEOUT_MS)` (3,000ms)** — so a slow BlockVision response can never block the engine factory beyond 3s.
2. **Existing `.catch(() => ({} as Record<string, number>))` at the call site stays.** A BlockVision failure degrades the prompt-time price block to empty rather than throwing; the LLM falls back to calling `token_prices` mid-turn if it needs a number.
3. **Add a BlockVision portfolio + prices p95 dashboard panel** (Q-Bv, success criterion table) so cold-start regressions are visible the day after deploy, not surfaced via user complaints.

No code change beyond confirming the existing `.catch(() => ({}))` envelope is preserved when swapping the import from `defillama-prices` to `blockvision-prices`.

### Tests

`packages/engine/src/__tests__/blockvision-prices.test.ts`:

```typescript
describe('blockvision-prices', () => {
  it('returns BlockVision portfolio when API key set and endpoint healthy', async () => {
    // mock fetch → 200 with sample BlockVision response
    // assert source === 'blockvision', totalUsd matches sum
  });

  it('falls through to Sui RPC when BlockVision returns 5xx', async () => {
    // mock fetch → 503; mock fetchWalletCoins → sample coins
    // assert source === 'sui-rpc-degraded'
  });

  it('falls through to Sui RPC when API key is undefined', async () => {
    // unauth / dev environment without key
    // assert source === 'sui-rpc-degraded'
  });

  it('hardcodes stablecoin pricing in degraded mode', async () => {
    // mock Sui RPC → coins including USDC and SUI
    // assert USDC.price === 1, SUI.priceUnavailable === true
  });

  it('caches portfolio for 5s within a single request', async () => {
    // call twice with same Map; assert fetch called once
  });

  it('fetchTokenPrices uses hardcoded stables before hitting BlockVision', async () => {
    // call with [USDC, SUI]; mock fetch
    // assert USDC served from hardcode, SUI from BlockVision
  });
});
```

### Environment

```
BLOCKVISION_API_KEY=<existing — already in .env>
```

No new env vars. `SUI_RPC_FALLBACK_URL` proposed in v1.3.1 is **not needed** — BlockVision is the resilient path; Sui RPC is the degraded mode.

---

## Item 2 — First-token p95 trim via inline resumed-session pre-fetch [unchanged from v1.3.1]

### Why v1.2 was wrong

v1.2 proposed a new `dispatchReadIntents()` function in `intent-dispatcher.ts`. That module does not have such a function — it exports only `classifyReadIntents`, `makeAutoDispatchId`, `intentDiscriminator` (pure pattern matchers).

The actual dispatch logic is **inlined in `chat/route.ts` lines 219–376** and does five things `dispatchReadIntents()` would silently lose:

1. Emits synthetic SSE `tool_start` + `tool_result` events so cards render.
2. Calls `engine.loadMessages([..., assistant(tool_use), user(tool_result)])` to inject `ContentBlocks` so the LLM narrates around pre-fetched data.
3. Calls `collector.onToolStart` / `onToolResult` for `TurnMetrics`.
4. Stamps stable `makeAutoDispatchId(turnIndex, toolName, discriminator)` IDs.
5. Writes `[intent-dispatch] classified` / `dispatched` traces.

### Why v1.3's `turnIndex === 0` was also wrong

v1.3 proposed `isFirstTurn = turnIndex === 0` to trigger pre-fetch. That condition only evaluates true when `engine.getMessages()` has zero prior assistant messages — i.e. for **new sessions** — which `engine-factory.ts:513–517` already covers via `buildSyntheticPrefetch()` (loads synthetic `balance_check` + `savings_info` `tool_use` / `tool_result` blocks into the engine's message ledger before the agent loop).

The actual baseline metric ("Returning user 2 → 0 tool calls") targets users **resuming an existing session**, where `engine.loadMessages(opts.session.messages)` populates prior assistants and `turnIndex > 0`. v1.3's condition would never fire there.

**Right condition**: trigger on `isAuth && !!session?.messages?.length` — the inverse of `isNewSession`. Both `session` and `isAuth` are already in scope in `chat/route.ts` (lines 109, 112).

### Fix [v1.3.1 — minimal in-place edit, ~15 lines in chat/route.ts]

**No changes to `intent-dispatcher.ts` beyond promoting `argsFingerprint` to a public export.** All other edits land in `audric/apps/web/app/api/engine/chat/route.ts`.

**Auth gate is non-negotiable.** `RESUMED_SESSION_INTENTS` includes `balance_check` and `savings_info`, both of which are excluded from `createUnauthEngine`'s tool set (`engine-factory.ts:616–623`). Pre-fetch only fires when `isAuth === true`. The dedup loop's existing fallback handles "tool not found" silently, but the gate prevents per-request log noise from cold landing-page visits.

Step 1 — promote `argsFingerprint` from `__testOnly__` so chat route + classifier share one canonical key formula:

```typescript
// audric/apps/web/lib/engine/intent-dispatcher.ts — change:
//   export const __testOnly__ = { READ_INTENT_RULES, isoDateOffset, argsFingerprint };
// to:
export { argsFingerprint };
export const __testOnly__ = { READ_INTENT_RULES, isoDateOffset };
```

Step 2 — derive `isReturningSession` near the existing `turnIndex` derivation (line 196):

```typescript
// chat/route.ts — right below `const turnIndex = ...`
// [v1.3.1] Trigger pre-fetch ONLY for resumed auth sessions. New sessions
// are already covered by engine-factory.ts:buildSyntheticPrefetch which
// preloads balance_check + savings_info before the agent loop runs.
const isReturningSession = isAuth && !!(session?.messages?.length);
```

Step 3 — define synthetic resumed-session intents at module scope:

```typescript
// chat/route.ts — top of file, near other constants
import {
  classifyReadIntents,
  argsFingerprint,
  type ReadIntent,
} from '@/lib/engine/intent-dispatcher';

const RESUMED_SESSION_INTENTS: readonly ReadIntent[] = [
  { toolName: 'balance_check', args: {}, label: 'resumed-session pre-fetch (balance)' },
  { toolName: 'savings_info',  args: {}, label: 'resumed-session pre-fetch (savings)' },
];
```

Step 4 — extend the existing dispatch block (lines 235–376) to prepend resumed-session intents, deduplicating against any classified intents using the shared `argsFingerprint`:

```typescript
// chat/route.ts — replace the line:
//   const intents = classifyReadIntents(trimmedMessage);
// with:
const classified = classifyReadIntents(trimmedMessage);
const seen = new Set<string>();
const intents: ReadIntent[] = [];

const pushUnique = (intent: ReadIntent): void => {
  // [v1.3.1] Reuse the classifier's own fingerprint formula so two
  // diverging dedup keys can't drift apart.
  const key = `${intent.toolName}:${argsFingerprint(intent.args)}`;
  if (seen.has(key)) return;
  seen.add(key);
  intents.push(intent);
};

if (isReturningSession) {
  for (const intent of RESUMED_SESSION_INTENTS) pushUnique(intent);
}
for (const intent of classified) pushUnique(intent);
```

That is the entire change. The for-loop below (`for (const intent of intents) { ... invokeReadTool ... loadMessages ... }`) runs unchanged — synthetic cards still render, the LLM still sees pre-fetched results, `TurnMetricsCollector` still records each tool, traces still log.

### Required minor exports from `intent-dispatcher.ts`

- Confirm `ReadIntent` is `export interface ReadIntent` at the top of the file (already exported as of v0.46.7 — one-line check).
- Promote `argsFingerprint` to a public export.

### Tests

Tests live in `audric/apps/web/tests/chat-route-resumed-session-prefetch.test.ts`:

```typescript
describe('chat route resumed-session pre-fetch', () => {
  it('pre-fetches balance_check + savings_info on first user message of a resumed session', async () => {
    // POST with requestedSessionId matching an existing session that has
    // prior messages. Expect two SSE tool_result events with toolName in
    // ['balance_check','savings_info'] before any text_delta.
  });

  it('does NOT pre-fetch on a new session — buildSyntheticPrefetch handles that path', async () => {
    // POST with no requestedSessionId. Expect zero synthetic tool_result
    // events emitted by chat/route's inline dispatch.
  });

  it('does NOT pre-fetch when unauth', async () => {
    // POST without auth. Expect zero synthetic tool_result events.
  });

  it('dedups when a classified intent matches a synthetic intent', async () => {
    // POST "what's my balance" with a resumed session. Expect exactly one
    // balance_check dispatch (argsFingerprint dedup keeps the synthetic
    // intent and drops the classifier's duplicate).
  });
});
```

---

## Item 3 — TurnMetrics data integrity via `attemptId`

### Fix 3a — `attemptId` on PendingAction

```typescript
// packages/engine/src/engine.ts

export interface PendingAction {
  toolName: string;
  toolUseId: string;
  input: unknown;
  description: string;
  assistantContent: ContentBlock[];
  guardInjections?: string[];
  modifiableFields?: PendingActionModifiableField[];
  turnIndex: number;
  attemptId: string;  // [v1.1] crypto.randomUUID() at yield time
}

// agentLoop pending_action yield:
yield {
  type: 'pending_action',
  action: {
    // ...existing fields...
    turnIndex: ctx.messages.filter(m => m.role === 'assistant').length,
    attemptId: crypto.randomUUID(),
  },
} as EngineEvent;
```

Note on `turnIndex`: turnIndex is monotonic with assistant turns, not user prompts — resume continuations append an assistant message, so the next pending action's turnIndex will reflect all assistant turns including post-write narrations. Dashboards grouping by turnIndex should be aware of this.

**TurnMetrics schema — additive migration only.** Add the new fields below to the existing model. The `mutableToolDedupes Int @default(0)` column (v1.5.1 drift signal) and all indexes stay unchanged.

```prisma
// audric/apps/web/prisma/schema.prisma

model TurnMetrics {
  // [existing fields preserved verbatim — including mutableToolDedupes]
  id                   String   @id @default(cuid())
  sessionId            String
  userId               String
  turnIndex            Int
  effortLevel          String
  modelUsed            String
  wallTimeMs           Int
  firstTokenMs         Int
  toolsCalled          Json
  guardsFired          Json
  compactionTriggered  Boolean  @default(false)
  contextTokensStart   Int
  cacheHit             Boolean  @default(false)
  cacheReadTokens      Int      @default(0)
  cacheWriteTokens     Int      @default(0)
  inputTokens          Int
  outputTokens         Int
  estimatedCostUsd     Float
  pendingActionYielded Boolean  @default(false)
  pendingActionOutcome String?
  aciRefinements       Int      @default(0)
  sessionSpendUsd      Float    @default(0)
  mutableToolDedupes   Int      @default(0)   // [v1.5.1] preserved — drift signal
  // [v1.3] new fields, additive:
  attemptId            String?
  synthetic            Boolean  @default(false)
  writeToolDurationMs  Int?
  cacheSavingsUsd      Float    @default(0)
  turnPhase            String   @default("initial")  // backfilled post-migration
  createdAt            DateTime @default(now())

  @@index([userId, createdAt])
  @@index([sessionId])
  @@index([effortLevel, modelUsed])
  @@index([createdAt])
  @@index([attemptId])
}
```

**TurnMetricsCollector update:**

```typescript
// audric/apps/web/lib/engine/harness-metrics.ts

export class TurnMetricsCollector {
  private _pendingAttemptId: string | null = null;
  // ...existing fields...

  onPendingAction(attemptId: string): void {
    this._pendingActionYielded = true;
    this._pendingAttemptId = attemptId;
  }

  build(context: {
    sessionId: string;
    userId: string;
    turnIndex: number;
    effortLevel: string;
    modelUsed: string;
    contextTokensStart: number;
    estimatedCostUsd: number;
    sessionSpendUsd: number;
    synthetic: boolean;
    turnPhase: 'initial' | 'resume';
  }) {
    const rates = costRatesForModel(context.modelUsed);
    const cacheSavingsUsd =
      this._cacheReadTokens * (rates.input - rates.cacheRead);

    return {
      ...context,
      wallTimeMs: Date.now() - this.startTime,
      firstTokenMs: this.firstTextDeltaTime
        ? this.firstTextDeltaTime - this.startTime
        : Date.now() - this.startTime,
      toolsCalled: Array.from(this.toolMetrics.values()),
      guardsFired: this._guardsFired,
      compactionTriggered: this._compactionTriggered,
      cacheHit: this._cacheHit,
      cacheReadTokens: this._cacheReadTokens,
      cacheWriteTokens: this._cacheWriteTokens,
      inputTokens: this._inputTokens,
      outputTokens: this._outputTokens,
      pendingActionYielded: this._pendingActionYielded,
      pendingActionOutcome: this._pendingActionYielded ? 'pending' : null,
      aciRefinements: this._aciRefinements,
      attemptId: this._pendingAttemptId,
      cacheSavingsUsd,
      mutableToolDedupes: this._mutableToolDedupes, // [v1.5.1] preserved
    };
  }
}
```

**Chat route — wire `attemptId` and `turnPhase`:**

```typescript
// audric/apps/web/app/api/engine/chat/route.ts

if (event.type === 'pending_action') {
  collector.onPendingAction(event.action.attemptId);
}

const metricsPayload = collector.build({
  // ...existing...
  synthetic: isSynthetic,
  turnPhase: 'initial',
});
```

**Resume route — surgical single-row update:**

```typescript
// audric/apps/web/app/api/engine/resume/route.ts

if (action.attemptId) {
  await prisma.turnMetrics.updateMany({
    where: { attemptId: action.attemptId },
    data: {
      pendingActionOutcome: resolvedOutcome,
      writeToolDurationMs: body.executionDurationMs ?? null,
    },
  }).catch(err =>
    console.warn('[TurnMetrics] attemptId update failed:', err)
  );
}
```

### Fix 3b — Pending timeout sweep (every 5 minutes)

```typescript
// audric/apps/web/app/api/cron/turn-metrics-pending-sweep/route.ts

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const timedOut = await prisma.turnMetrics.updateMany({
    where: {
      pendingActionOutcome: 'pending',
      createdAt: { lt: cutoff },
      synthetic: false,
    },
    data: { pendingActionOutcome: 'timeout' },
  });

  return NextResponse.json({ timedOut: timedOut.count });
}
```

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/turn-metrics-cleanup", "schedule": "0 3 * * *" },
    { "path": "/api/cron/turn-metrics-pending-sweep", "schedule": "*/5 * * * *" }
  ]
}
```

### Fix 3c — Synthetic flag + backfill [v1.4 — B3 sequencing fix]

**Critical ordering**: backfill SQL touches `synthetic` and `turnPhase` columns that are added by this migration. The SQL **must run after** the schema migration deploys, not before. v1.3.1 had this reversed.

```bash
# Step 1 — local schema migration (adds the new columns):
pnpm prisma migrate dev --name add_turn_metrics_integrity

# Step 2 — production schema migration:
pnpm prisma migrate deploy
```

**Then, after `migrate deploy` succeeds**, run the backfill in the NeonDB console:

```sql
-- Step 1: backfill known bot session
UPDATE "TurnMetrics"
SET synthetic = true
WHERE "sessionId" = 's_1777047351366_d172f3de05f0';
-- Verify: should be 255 rows

-- Step 2: backfill turnPhase for historical rows
UPDATE "TurnMetrics"
SET "turnPhase" = 'initial'
WHERE "turnPhase" IS NULL;
-- Verify: should match total non-bot row count
```

**Post-migration column verification:**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'TurnMetrics'
  AND column_name IN (
    'attemptId','synthetic','writeToolDurationMs',
    'cacheSavingsUsd','turnPhase','mutableToolDedupes'
  );
-- Expect 6 rows.
```

**Note on SYNTHETIC_SESSION_PREFIXES brittleness:** The current prefix `s_1777047351366` matches only this one bot session. Future test runs get fresh session IDs and will pollute again. Day 3 follow-up: configure the test harness to emit a fixed prefix (`s_synthetic_` or `s_botcheck_`) so the env var catches all future test traffic without manual updates.

---

## Item 4 — Resume route instrumentation + `swap_execute` latency [v1.4.1 — surgical, with B1+m1-m3+C1]

v1.3 reframes Item 4 as **3 surgical edits** to the existing `resume/route.ts`. The route already uses `ReadableStream` + `controller`. The three things actually missing are: (a) raw event iteration so `TurnMetricsCollector` can see them, (b) `updateMany` keyed on `attemptId`, (c) a new `TurnMetrics` row at close for the resume turn.

[v1.3.1] adds a fourth surgical edit: confirm-tier `fin_ctx` invalidation alongside the existing `incrementSessionSpend` block (Edit 5 below).

[v1.4 — B1] Edit 5's Redis cache key is **`fin_ctx:${address}`**, not `${userId}`. The resume route only has `body.address` in scope (no `prisma.user.findUnique` lookup), and `address` is universally available across both routes. The `UserFinancialContext` table itself stays keyed by `userId` cuid; the Redis layer uses `address` as the cache key, with `getUserFinancialContext(address)` translating address → userId only on cache miss. This eliminates the v1.3.1 implementation gap where Edit 5 referenced an undefined symbol.

[v1.4.1 — C1] Edit 4 reverts `contextTokensStart` from `0` to `priorMsgCount` (captured as `engine.getMessages().length` immediately after `createEngine`). v1.4 incorrectly claimed `priorMsgCount` was undefined; re-audit shows it is defined in the live route at line 107 and matches the chat-route convention at chat/route.ts:189.

[v1.4.1 — C2] Edit 5's role is **cross-session** orientation cache invalidation, not in-session balance freshness. In-session balance freshness is already handled by the v1.5 engine's `postWriteRefresh: POST_WRITE_REFRESH_MAP` feature (`engine-factory.ts:506`) which auto-re-runs read tools (`balance_check`, `savings_info`, `health_check`) after writes within the same session. See Item 6 "Cache invalidation — two layers" for the full distinction.

### Model sourcing — use existing `onMeta`, not a new engine surface method

v1.2 proposed `engine.getModelUsed()` and `CostTracker.getLastModel()`. The factory **already exposes** `onMeta?: (meta: { effortLevel; modelUsed }) => void` (`engine-factory.ts:221`), used by chat route. Resume route uses the same plumbing. No engine surface change.

```typescript
// resume/route.ts — extend existing createEngine call:
let engineMeta: { effortLevel: string; modelUsed: string } | undefined;
const engine = await createEngine({
  address,
  session,
  contacts,
  sessionSpendUsd,
  sessionId,
  onMeta: (meta) => { engineMeta = meta; },
});
```

### ResumeBody [v1.4 — m2: drop redundant toolUseId]

```typescript
// audric/apps/web/app/api/engine/resume/route.ts

interface ResumeBody {
  sessionId: string;
  address: string;          // wallet address — consistent with chat route
  approved: boolean;
  executionResult?: unknown;
  modifications?: Record<string, unknown>;
  outcome: PendingActionOutcome;
  action: PendingAction;    // carries attemptId, turnIndex, toolUseId
  executionDurationMs?: number;
}
```

`toolUseId` is read from `body.action.toolUseId`; it's not a top-level field on the request body. The current `useEngine.ts` hook does not send it as a top-level field either.

### `useEngine.ts` — capture execution duration [v1.4 — m1: use existing attemptStream]

The hook already calls `attemptStream('/api/engine/resume', body)` (live code line 185). Add `executionDurationMs` to the existing body argument; do not refactor to raw `fetch`.

```typescript
// audric/apps/web/hooks/useEngine.ts — in resolveAction():

const executionStart = Date.now();
const executionResult = await handleExecuteAction(action.toolName, executionInput);
const executionDurationMs = Date.now() - executionStart;

await attemptStream('/api/engine/resume', {
  address,
  sessionId,
  action,
  approved,
  executionResult,
  ...(modifications && Object.keys(modifications).length
    ? { modifications, outcome: 'modified' as const }
    : {}),
  executionDurationMs,            // [v1.3]
});
```

### Edit 1 — pre-engine: keep existing `applyModificationsToAction` / `resolveOutcome`

`PermissionResponse` only contains `{ approved, executionResult }` (`packages/engine/src/types.ts:148`). `modifications` and `outcome` are **pre-engine** concerns — the engine never sees them. The current production resume route already handles them correctly:

```typescript
import { applyModificationsToAction, resolveOutcome } from '@/lib/engine/apply-modifications';

const action: PendingAction = applyModificationsToAction(rawAction, body.modifications);
const resolvedOutcome = resolveOutcome(body.approved, body.modifications, body.outcome);

const engineStream = engine.resumeWithToolResult(action, {
  approved: body.approved,
  executionResult: body.executionResult,
});
```

`resolvedOutcome` is then used for the TurnMetrics `pendingActionOutcome` write (Edit 2). It is **never** passed to the engine.

### Edit 2 — switch from `engineToSSE` wrapper to raw-event iteration

The current route uses `engineToSSE(...)` — a string-stream wrapper that strips raw events. To wire `TurnMetricsCollector`, switch to iterating raw events from `engine.resumeWithToolResult()` directly and serialize each via `serializeSSE(event)` (mirrors chat route).

**[v1.3.1 — G13] Preserve `setConversationState` wire-up.** The current route regex-extracts `pendingAction` from each SSE chunk (lines 120–130) and uses it in the `finally` block (lines 161–177) to drive `setConversationState({ type: 'awaiting_confirmation' | 'idle' })` and to write `pendingAction` into the session store. When switching to raw event iteration, capture `pendingAction` directly from `event.action` in the `pending_action` branch and keep the existing finally block transitions wired against that captured value — do NOT drop the state-transition path.

```typescript
import { serializeSSE } from '@t2000/engine';
import {
  TurnMetricsCollector,
  detectRefinement,
  detectTruncation,
} from '@/lib/engine/harness-metrics';
import { costRatesForModel } from '@/lib/engine/cost-rates';

const collector = new TurnMetricsCollector();
let pendingAction: PendingAction | null = null;

for await (const event of engineStream) {
  switch (event.type) {
    case 'text_delta':
      collector.onFirstTextDelta();
      break;
    case 'tool_start':
      collector.onToolStart(event.toolUseId);
      break;
    case 'tool_result':
      if (event.toolName !== '__deduped__') {
        collector.onToolResult(event.toolUseId, event.toolName, event.result, {
          wasTruncated: detectTruncation(event.result),
          wasEarlyDispatched: event.wasEarlyDispatched ?? false,
          resultDeduped: event.resultDeduped ?? false,
          returnedRefinement: detectRefinement(event.result),
        });
      } else {
        collector.markToolResultDeduped(event.toolUseId);
      }
      break;
    case 'usage':
      collector.onUsage(event);
      break;
    case 'pending_action':
      collector.onPendingAction(event.action.attemptId);
      // [v1.3.1 — G13] Capture for the existing finally-block
      // setConversationState transition + session store write.
      pendingAction = event.action;
      break;
    case 'compaction':
      collector.onCompaction();
      continue; // don't serialize internal events
  }

  if (event.type !== 'compaction'
      && !(event.type === 'tool_result' && event.toolName === '__deduped__')) {
    controller.enqueue(encoder.encode(serializeSSE(event)));
  }
}
```

### Edit 3 — switch existing `updateMany` to `attemptId` keying

```typescript
// BEFORE (current production):
prisma.turnMetrics.updateMany({
  where: { sessionId, turnIndex: action.turnIndex },
  data: { pendingActionOutcome: resolvedOutcome },
})

// AFTER:
if (action.attemptId) {
  prisma.turnMetrics.updateMany({
    where: { attemptId: action.attemptId },
    data: {
      pendingActionOutcome: resolvedOutcome,
      writeToolDurationMs: body.executionDurationMs ?? null,
    },
  }).catch((err) =>
    console.warn('[TurnMetrics] attemptId update failed (non-fatal):', err),
  );
}
```

### Edit 4 — write a new TurnMetrics row at close for the resume turn [v1.4.1 — C1: priorMsgCount IS in scope, use it]

[v1.4.1 — C1] v1.4 claimed `priorMsgCount` was undefined. Re-audit confirms it **is** defined: `resume/route.ts:107` (`engine.getMessages().length` immediately after `createEngine`) mirrors `chat/route.ts:189`. Both routes use the same metric naming convention (which is technically a message-count, not a token-count — see "Naming note" below). The B4 fix in v1.4 was misjustified; revert to `priorMsgCount` and align with chat-route convention.

Inside the `finally` block:

```typescript
const SYNTHETIC_PREFIXES = (process.env.SYNTHETIC_SESSION_PREFIXES ?? '')
  .split(',').filter(Boolean);
const isSynthetic = SYNTHETIC_PREFIXES.some((p) => sessionId.startsWith(p));

const modelUsed = engineMeta?.modelUsed ?? AGENT_MODEL;
const effortLevel = engineMeta?.effortLevel ?? 'medium';
const rates = costRatesForModel(modelUsed);
const usage = engine.getUsage();
const estimatedCostUsd =
  (usage.inputTokens ?? 0) * rates.input +
  (usage.outputTokens ?? 0) * rates.output +
  (usage.cacheReadTokens ?? 0) * rates.cacheRead +
  (usage.cacheWriteTokens ?? 0) * rates.cacheWrite;

const built = collector.build({
  sessionId,
  userId: address,                       // chat route convention — wallet address
  turnIndex: action.turnIndex,
  effortLevel,
  modelUsed,
  contextTokensStart: priorMsgCount,    // [v1.4.1 — C1] aligns with chat/route.ts:189 — defined as engine.getMessages().length right after createEngine. Resume turns continue context, so the value reflects messages-prior-to-this-turn.
  estimatedCostUsd,
  sessionSpendUsd,
  synthetic: isSynthetic,
  turnPhase: 'resume',
});

const payload = {
  ...built,
  toolsCalled: JSON.parse(JSON.stringify(built.toolsCalled)),
  guardsFired: JSON.parse(JSON.stringify(built.guardsFired)),
};
prisma.turnMetrics.create({ data: payload }).catch((err) =>
  console.error('[TurnMetrics] resume row write failed (non-fatal):', err),
);
```

### Edit 5 — invalidate `fin_ctx:${address}` for confirm-tier writes [v1.4 — B1: address-keyed]

The existing post-write block (lines 195–231 of current production `resume/route.ts`) already runs `incrementSessionSpend` for approved/modified writes — explicitly because Audric's confirm-tier writes never fire engine's `onAutoExecuted`. v1.3 chained `fin_ctx` invalidation onto `onAutoExecuted` only, which leaves the dominant confirm-tier path stale. v1.3.1 added an `invalidateUserFinancialContext(userId)` call but `userId` was never derived in the route. v1.4 keys the cache by `address` (already in scope) instead.

```typescript
// resume/route.ts — extend the existing post-write conditional
// (next to the existing incrementSessionSpend call):

if (resolvedOutcome === 'approved' || resolvedOutcome === 'modified') {
  const op = toolNameToOperation(action.toolName);
  const looksSuccessful = /* existing check — unchanged */;
  if (op && looksSuccessful) {
    // Existing — unchanged:
    const usd = resolveUsdValue(
      action.toolName,
      (action.input as Record<string, unknown>) ?? {},
      new Map<string, number>([['USDC', 1], ['USDT', 1]]),
    );
    if (Number.isFinite(usd) && usd > 0) {
      incrementSessionSpend(sessionId, usd).catch((err) =>
        console.warn('[session-spend] increment failed (non-fatal):', err),
      );
    }

    // [v1.4 — B1] Invalidate Redis fin_ctx — confirm-tier writes never
    // fire engine.onAutoExecuted, so the cached UserFinancialContext
    // snapshot stays stale until the daily cron tick. Invalidate here so
    // the very next chat sees fresh balance instead of a 24h-old snapshot.
    // Cache key is address — universally available across routes; no DB
    // lookup needed for translation.
    invalidateUserFinancialContext(address).catch((err) =>
      console.warn('[fin_ctx] resume invalidation failed (non-fatal):', err),
    );
  }
}
```

`invalidateUserFinancialContext(address)` is a thin helper added in `audric/apps/web/lib/redis/user-financial-context.ts`. Single Redis `DEL` keyed on `fin_ctx:${address}` — fail-soft, never blocks the response. See Item 6 for the full helper.

### Note on `firstTokenMs` semantics across `turnPhase`

The `firstTextDeltaTime` captured during a resume turn measures **post-execution narration latency** — the user has already approved/signed. It is *not* the same semantic as a chat-route first-token. Q5 already filters `WHERE turnPhase = 'initial'` correctly; this note is informational so dashboard builders don't query first-token across both phases.

### Naming note on `contextTokensStart` [v1.4.1 — C1]

The column is named `contextTokensStart` but the value written by both chat and resume routes is `engine.getMessages().length` — a **message count**, not a token count. This is pre-existing in `chat/route.ts:189` (live) and v1.4.1 keeps resume aligned with that convention rather than introducing a new metric. A future spec can rename the column once both routes can cheaply derive a real token start (the engine doesn't currently expose this). For dashboards: treat as "messages in the engine ledger before this turn's stream began" until renamed.

### Resume route — full assembled shape [v1.4]

```typescript
// audric/apps/web/app/api/engine/resume/route.ts

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body: ResumeBody = await req.json();
  // ... existing auth / rate-limit ...

  const SYNTHETIC_PREFIXES = (process.env.SYNTHETIC_SESSION_PREFIXES ?? '')
    .split(',').filter(Boolean);
  const isSynthetic = SYNTHETIC_PREFIXES.some(p =>
    body.sessionId.startsWith(p)
  );

  // Pre-engine: existing modifications/outcome handling:
  const action: PendingAction =
    applyModificationsToAction(body.action, body.modifications);
  const resolvedOutcome =
    resolveOutcome(body.approved, body.modifications, body.outcome);

  // Surgical updateMany on attemptId:
  if (action.attemptId) {
    prisma.turnMetrics.updateMany({
      where: { attemptId: action.attemptId },
      data: {
        pendingActionOutcome: resolvedOutcome,
        writeToolDurationMs: body.executionDurationMs ?? null,
      },
    }).catch(err =>
      console.warn('[TurnMetrics] attemptId update failed (non-fatal):', err)
    );
  }

  let engineMeta: { effortLevel: string; modelUsed: string } | undefined;
  const engine = await createEngine({
    address: body.address,
    session,
    contacts,
    sessionSpendUsd,
    sessionId: body.sessionId,
    onMeta: (meta) => { engineMeta = meta; },
  });
  const priorMsgCount = engine.getMessages().length;   // [v1.4.1 — C1]

  const collector = new TurnMetricsCollector();
  let pendingAction: PendingAction | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const engineStream = engine.resumeWithToolResult(action, {
          approved: body.approved,
          executionResult: body.executionResult,
        });

        for await (const event of engineStream) {
          switch (event.type) {
            case 'text_delta':       collector.onFirstTextDelta(); break;
            case 'tool_start':       collector.onToolStart(event.toolUseId); break;
            case 'tool_result':
              if (event.toolName !== '__deduped__') {
                collector.onToolResult(event.toolUseId, event.toolName, event.result, {
                  wasTruncated: detectTruncation(event.result),
                  wasEarlyDispatched: event.wasEarlyDispatched ?? false,
                  resultDeduped: event.resultDeduped ?? false,
                  returnedRefinement: detectRefinement(event.result),
                });
              } else {
                collector.markToolResultDeduped(event.toolUseId);
              }
              break;
            case 'usage':            collector.onUsage(event); break;
            case 'pending_action':
              collector.onPendingAction(event.action.attemptId);
              pendingAction = event.action;
              break;
            case 'compaction':
              collector.onCompaction();
              continue;
          }

          if (event.type !== 'compaction'
              && !(event.type === 'tool_result' && event.toolName === '__deduped__')) {
            controller.enqueue(encoder.encode(serializeSSE(event)));
          }
        }
      } finally {
        controller.close();

        // Existing finally-block transitions — UNCHANGED:
        //   if (pendingAction) setConversationState({ type: 'awaiting_confirmation', ... })
        //   else                setConversationState({ type: 'idle' })
        //   store.set({ ..., pendingAction })
        //   logSessionUsage(...)

        // [v1.4 — B1] Existing incrementSessionSpend block + new
        // invalidateUserFinancialContext(address) call — see Edit 5.

        // New: TurnMetrics row write for the resume turn:
        const modelUsed = engineMeta?.modelUsed ?? AGENT_MODEL;
        const effortLevel = engineMeta?.effortLevel ?? 'medium';
        const rates = costRatesForModel(modelUsed);
        const usage = engine.getUsage();
        const estimatedCostUsd =
          (usage.inputTokens ?? 0) * rates.input +
          (usage.outputTokens ?? 0) * rates.output +
          (usage.cacheReadTokens ?? 0) * rates.cacheRead +
          (usage.cacheWriteTokens ?? 0) * rates.cacheWrite;

        const built = collector.build({
          sessionId: body.sessionId,
          userId: body.address,
          turnIndex: action.turnIndex,
          effortLevel,
          modelUsed,
          contextTokensStart: priorMsgCount,   // [v1.4.1 — C1]
          estimatedCostUsd,
          sessionSpendUsd,
          synthetic: isSynthetic,
          turnPhase: 'resume',
        });

        const payload = {
          ...built,
          toolsCalled: JSON.parse(JSON.stringify(built.toolsCalled)),
          guardsFired: JSON.parse(JSON.stringify(built.guardsFired)),
        };
        prisma.turnMetrics.create({ data: payload }).catch(err => {
          console.error('[TurnMetrics] resume row write failed (non-fatal):', err);
        });
      }
    },
  });

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

---

## Item 5 — Cache savings formula [v1.4 — collapsed; Fix A deleted]

v1.3.1 had two fixes here: (A) `defillama_yield_pools` ACI refinement, and (B) `cache_savings_usd` formula. With `defillama_yield_pools` deleted in this spec (see "DefiLlama deletion summary" below), Fix A is moot. Only Fix B remains.

### Fix B — `cache_savings_usd`

`cost-rates.ts` already exists from Day 1 (extracted from inline `chat/route.ts`). `TurnMetricsCollector.build()` (Item 3) imports `costRatesForModel(modelUsed)` and computes `cacheSavingsUsd` per-model. No file creation needed.

**`cache_token_pct` is dashboard-only.** v1.2 framed this as "remove `cache_token_pct` references" but no code references exist (verified against `harness-metrics.ts:174–215`). Day 5 action is to replace `cache_token_pct` in any analytics dashboards with `cache_savings_usd` (column added on Day 3 via additive migration). Code already omits it.

Updated Q3:

```sql
-- Q3 — Prompt cache health:
SELECT DATE("createdAt") as day,
  ROUND(AVG("cacheHit"::int) * 100) as cache_hit_pct,
  ROUND(SUM("cacheSavingsUsd")::numeric, 4) as total_cache_savings_usd,
  ROUND(AVG("cacheSavingsUsd")::numeric, 6) as avg_savings_per_turn
FROM "TurnMetrics"
WHERE synthetic = false
  AND "turnPhase" = 'initial'
GROUP BY DATE("createdAt")
ORDER BY day DESC;
```

---

## Item 6 — UserFinancialContext orientation injection [v1.4.1 — B1+B2 address-keyed; C2 distinguishes from postWriteRefresh; M5 redundant indexes dropped]

### Schema

```prisma
model UserFinancialContext {
  id                   String   @id @default(cuid())
  userId               String   @unique               // prisma User.id (cuid) — @unique implies an index
  address              String   @unique               // [v1.4 — B2] Sui wallet address — @unique implies an index
  savingsUsdc          Float
  debtUsdc             Float
  healthFactor         Float?
  walletUsdc           Float
  currentApy           Float?
  recentActivity       String
  openGoals            Json     // string[]
  pendingAdvice        String?
  daysSinceLastSession Int
  generatedAt          DateTime @default(now())
  updatedAt            DateTime @updatedAt
}
```

[v1.4 — B2] The table carries both `userId` (cuid, unique) and `address` (Sui wallet, unique). The cron writes both at upsert time. Query/cache lookups go by `address` (universally available across routes); the `userId` column stays for joins with `AdviceLog`/`SavingsGoal`/etc. that key on cuid.

[v1.4.1 — M5] The earlier draft included `@@index([userId])` and `@@index([address])` on top of the `@unique` constraints. Prisma already creates an implicit unique index for each `@unique` field, so those lines are redundant and have been dropped.

### AdviceLog migration — add `actedOn` column

```prisma
// Add to existing AdviceLog model:
actedOn Boolean @default(false)
```

Migration:

```bash
pnpm prisma migrate dev --name add_advice_log_acted_on
```

No backfill needed — `@default(false)` covers all existing rows correctly.

### Daily cron

```typescript
// t2000/apps/server/src/cron/jobs/financial-context-snapshot.ts

export async function runFinancialContextSnapshot(): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const activeUsers = await prisma.user.findMany({
    where: {
      sessionUsages: {
        some: { createdAt: { gte: thirtyDaysAgo } }
      }
    },
    select: { id: true, suiAddress: true },
  });

  for (const user of activeUsers) {
    try {
      const latestSnapshot = await prisma.portfolioSnapshot.findFirst({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
      });

      const previousSnapshot = await prisma.portfolioSnapshot.findFirst({
        where: {
          userId: user.id,
          date: { lt: latestSnapshot?.date ?? new Date() }
        },
        orderBy: { date: 'desc' },
      });

      const goals = await prisma.savingsGoal.findMany({
        where: {
          userId: user.id,
          status: { not: 'completed' },
        },
        take: 3,
        orderBy: { createdAt: 'desc' },
      });

      const pendingAdvice = await prisma.adviceLog.findFirst({
        where: { userId: user.id, actedOn: false },
        orderBy: { createdAt: 'desc' },
      });

      const lastSession = await prisma.sessionUsage.findFirst({
        where: { address: user.suiAddress },
        orderBy: { createdAt: 'desc' },
      });

      const daysSince = lastSession
        ? Math.floor(
            (Date.now() - lastSession.createdAt.getTime()) / 86400000
          )
        : 0;

      const recentActivity = buildActivityFromSnapshots(
        latestSnapshot,
        previousSnapshot
      );

      const context = {
        userId:  user.id,
        address: user.suiAddress,                   // [v1.4 — B2] dual-key
        savingsUsdc:  latestSnapshot?.savingsValueUsd ?? 0,
        debtUsdc:     latestSnapshot?.debtValueUsd    ?? 0,
        walletUsdc:   latestSnapshot?.walletValueUsd  ?? 0,
        healthFactor: latestSnapshot?.healthFactor    ?? null,
        currentApy:   null,
        recentActivity,
        openGoals: goals.map(g => `${g.name} — target $${g.targetAmount.toFixed(0)}`),
        pendingAdvice: pendingAdvice?.adviceText ?? null,
        daysSinceLastSession: daysSince,
      };

      await prisma.userFinancialContext.upsert({
        where: { userId: user.id },
        create: context,
        update: context,
      });
    } catch (err) {
      console.error(`[FinancialContext] Failed for ${user.id}:`, err);
    }
  }
}

function buildActivityFromSnapshots(
  latest: PortfolioSnapshot | null,
  previous: PortfolioSnapshot | null
): string {
  if (!latest) return 'No recent activity.';
  if (!previous) {
    return `Savings: $${latest.savingsValueUsd.toFixed(2)} USDC.`;
  }

  const parts: string[] = [];
  const savingsDelta = latest.savingsValueUsd - previous.savingsValueUsd;
  if (Math.abs(savingsDelta) > 0.01) {
    parts.push(
      savingsDelta > 0
        ? `Saved $${savingsDelta.toFixed(2)}`
        : `Withdrew $${Math.abs(savingsDelta).toFixed(2)}`
    );
  }
  const debtDelta = latest.debtValueUsd - previous.debtValueUsd;
  if (Math.abs(debtDelta) > 0.01) {
    parts.push(
      debtDelta > 0
        ? `Borrowed $${debtDelta.toFixed(2)}`
        : `Repaid $${Math.abs(debtDelta).toFixed(2)}`
    );
  }

  return parts.length > 0
    ? parts.join('. ') + '.'
    : 'No changes since last snapshot.';
}
```

### Redis cache layer + helper [v1.4 — address-keyed]

```typescript
// audric/apps/web/lib/redis/user-financial-context.ts — new file

import { redis } from './client';
import { prisma } from '@/lib/prisma';

const TTL_SECONDS = 24 * 60 * 60; // 24h, matches snapshot cron cadence

export interface FinancialContextSnapshot {
  savingsUsdc: number;
  debtUsdc: number;
  walletUsdc: number;
  healthFactor: number | null;
  currentApy: number | null;
  recentActivity: string;
  openGoals: string[];
  pendingAdvice: string | null;
  daysSinceLastSession: number;
}

export async function getUserFinancialContext(
  address: string,
): Promise<FinancialContextSnapshot | null> {
  const cacheKey = `fin_ctx:${address}`;
  const cached = await redis.get<FinancialContextSnapshot>(cacheKey);
  if (cached) return cached;

  // Cache miss — fetch from DB by address (table is indexed both ways).
  const row = await prisma.userFinancialContext.findUnique({
    where: { address },
  });
  if (!row) return null;

  const snapshot: FinancialContextSnapshot = {
    savingsUsdc:  row.savingsUsdc,
    debtUsdc:     row.debtUsdc,
    walletUsdc:   row.walletUsdc,
    healthFactor: row.healthFactor,
    currentApy:   row.currentApy,
    recentActivity: row.recentActivity,
    openGoals: Array.isArray(row.openGoals) ? row.openGoals as string[] : [],
    pendingAdvice: row.pendingAdvice,
    daysSinceLastSession: row.daysSinceLastSession,
  };
  await redis.set(cacheKey, snapshot, { ex: TTL_SECONDS });
  return snapshot;
}

export async function invalidateUserFinancialContext(address: string): Promise<void> {
  await redis.del(`fin_ctx:${address}`);
}
```

### Engine context injection — unchanged

```typescript
// audric/apps/web/lib/engine/engine-context.ts
// (unchanged from v1.1 — buildDynamicBlock injects <financial_context>)
```

### Cache invalidation — two layers, two purposes [v1.4.1 — C2 + M4]

There are **two distinct freshness layers** post-write. v1.4 conflated them.

#### Layer 1 — In-session tool freshness (already shipped, not a spec item)

`engine-factory.ts:506` already wires `postWriteRefresh: POST_WRITE_REFRESH_MAP` (v1.5 engine feature, in production). After any successful write, the engine re-runs the read tools listed in the map (`balance_check`, `savings_info`, `health_check`) and injects the fresh results into the LLM's context **within the same session**. This is what keeps the agent from quoting pre-write balances during post-execution narration.

`balance_check` is also `cacheable: false`. Combined with `postWriteRefresh`, there is no in-engine balance cache to invalidate. **[v1.4.1 — M4]** v1.4's proposed `engine.invalidateBalanceCache(walletAddress)` API surface is therefore a phantom — there is no cache for it to clear. **Drop the engine surface change.** The `onAutoExecuted` callback only needs `incrementSessionSpend()` and `invalidateUserFinancialContext()`.

#### Layer 2 — Cross-session orientation freshness (v1.4 / v1.4.1 work)

`fin_ctx:${address}` is the Redis snapshot read by `engine-context.ts` (Item 6) when **booting a new engine** for an authenticated user — it powers the `<financial_context>` block in the system prompt before the agent loop runs. Without invalidation after a write, a user who completes a deposit, closes the tab, and reopens chat 5 minutes later will see a 24-hour-old snapshot in their orientation block until the daily cron tick.

This cache is invalidated from **two callsites** because Audric's predominant write path is confirm-tier (client-signed):

1. **Auto-tier writes** — `EngineConfig.onAutoExecuted` callback chained in `engine-factory.ts` (covers the rare auto-tier path).
2. **Confirm-tier writes** — `resume/route.ts` post-write block, alongside `incrementSessionSpend` (covers the common path where engine yields `pending_action` and client executes).

```typescript
// audric/apps/web/lib/engine/engine-factory.ts — auto-tier path:
// [v1.4.1 — M4] No engine.invalidateBalanceCache call — postWriteRefresh
// handles in-session balance freshness; no balance cache exists to invalidate.
engineConfig.onAutoExecuted = async (info) => {
  await incrementSessionSpend(sessionId, info.usdValue);
  if (info.walletAddress) {
    await invalidateUserFinancialContext(info.walletAddress).catch(() => null);
  }
};
```

```typescript
// audric/apps/web/app/api/engine/resume/route.ts — confirm-tier path:
// (See Item 4 Edit 5 — single line added to existing post-write block.)
invalidateUserFinancialContext(address).catch(...);
```

---

## DefiLlama deletion summary [v1.4 — new section]

### Files deleted

| File | Lines | Reason |
|---|---|---|
| `packages/engine/src/defillama-prices.ts` | ~85 | Replaced by `blockvision-prices.ts` |
| `packages/engine/src/tools/defillama.ts` | ~500 | All 7 tools deleted |

### Tools deleted (7)

| Tool | Replacement / Why |
|---|---|
| `defillama_yield_pools` | Deleted. Niche LP/IL use case. `rates_info` covers safe yields. System prompt updated to decline LP/IL questions with brief explanation. |
| `defillama_protocol_info` | Deleted. Overlaps with `protocol_deep_dive` which is a richer tool for the same question. |
| `defillama_token_prices` | Replaced by new `token_prices` tool (BlockVision-backed). |
| `defillama_price_change` | Folded into new `token_prices` tool — BlockVision's `/coin/price/list` has `show24hChange` flag. |
| `defillama_chain_tvl` | Deleted. Explorer curiosity, not personal finance. |
| `defillama_protocol_fees` | Deleted. Analyst surface, wrong audience. |
| `defillama_sui_protocols` | Deleted. Replaced by static prompt block listing 5–10 Sui protocols. |

### Tool added (1)

```typescript
// packages/engine/src/tools/token-prices.ts — new file

import { z } from 'zod';
import { buildTool } from '../tool.js';
import { fetchTokenPrices } from '../blockvision-prices.js';

export const tokenPricesTool = buildTool({
  name: 'token_prices',
  description:
    'Get current USD prices for Sui tokens, with optional 24h change. Accepts full coin type strings (e.g. "0x2::sui::SUI"). Returns price per token and (if requested) 24h change percentage. Use for "what is X worth?" or "did Y move today?".',
  inputSchema: z.object({
    coinTypes: z.array(z.string()).min(1).max(10)
      .describe('Array of Sui coin type strings (max 10).'),
    include24hChange: z.boolean().optional()
      .describe('When true, include 24h change percentage per token.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      coinTypes: { type: 'array', items: { type: 'string' } },
      include24hChange: { type: 'boolean' },
    },
    required: ['coinTypes'],
  },
  isReadOnly: true,

  async call(input, context) {
    const apiKey = context.blockvisionApiKey;
    const prices = await fetchTokenPrices(input.coinTypes, apiKey, {
      include24hChange: input.include24hChange,
    });

    const results = input.coinTypes.map((ct) => {
      const entry = prices[ct];
      const symbol = ct.split('::').pop() ?? ct;
      if (!entry) {
        return { coinType: ct, symbol, price: null, priceUnavailable: true };
      }
      const out: Record<string, unknown> = {
        coinType: ct, symbol, price: entry.price,
      };
      if (entry.change24h !== undefined) out.change24h = entry.change24h;
      return out;
    });

    return {
      data: results,
      displayText: results
        .map((r) => {
          if (r.price === null) return `${r.symbol}: price unavailable`;
          const ch = (r as { change24h?: number }).change24h;
          return ch !== undefined
            ? `${r.symbol}: $${(r.price as number).toFixed(4)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}% 24h)`
            : `${r.symbol}: $${(r.price as number).toFixed(4)}`;
        })
        .join(', '),
    };
  },
});
```

### Tools kept (1 still on DefiLlama)

| Tool | Why kept |
|---|---|
| `protocol_deep_dive` | DefiLlama is the only easy source for protocol audit/TVL trends. BlockVision doesn't cover protocol-level safety data. Narrow tool, narrow use case ("is NAVI safe?"). Acceptable lone production DefiLlama dependency. |

### `tools/rates.ts` — DefiLlama fallback removed

The fallback `fetchRatesFromDefiLlama()` (lines 71–88) is deleted. NAVI MCP is the source of truth for NAVI lending rates. Unauth users without NAVI MCP access don't query rates anyway; the tool throws cleanly if MCP is unavailable, and the host degrades gracefully.

### System prompt edits

**`packages/engine/src/prompt.ts`** — replace lines 21–22, 35–36, 39:

```text
Before:
- For broad market data (yields across protocols, token prices, TVL, protocol comparisons), use defillama_* tools.
- To discover Sui protocols, use defillama_sui_protocols first, then defillama_protocol_info with the slug.
...
- "Buy $X of token": defillama_token_prices → calculate amount → swap_execute.
- "Best yield on SUI": compare rates_info (NAVI lending) + defillama_yield_pools (broader) + volo_stats.
...
- "What protocols are on Sui?": defillama_sui_protocols → defillama_protocol_info for details.

After:
- For token prices, use token_prices.
- For lending yields (single-sided, no IL risk), use rates_info.
- For SUI staking yield, use volo_stats.
- For protocol safety profiles ("is NAVI safe?"), use protocol_deep_dive.
- LP/IL pool questions: decline and redirect to rates_info; explain that Audric does not surface LP positions because of impermanent-loss risk.
...
- "Buy $X of token": token_prices → calculate amount → swap_execute.
- "Best yield on SUI": rates_info (NAVI lending) and volo_stats (SUI staking) cover the safe options.
...
- "What protocols are on Sui?": Audric supports interactions with NAVI, Suilend, Cetus, Bluefin, Scallop, Aftermath, Volo, and DeepBook. Use protocol_deep_dive for safety/TVL details on any one of them.
```

**`audric/apps/web/lib/engine/engine-context.ts`** — strip `defillama_*` from card-rendering rules and recipe references, and update the tool catalog (line 277). Specific edits required:

- **Line 218 [v1.4.1 — C4]** — verbatim text `swap_quote (...) or defillama_token_prices BEFORE quoting any number to the user` → `swap_quote (...) or token_prices BEFORE quoting any number to the user`. This is a hard-coded tool name in a system-prompt rule; generic "strip defillama_*" instructions miss it.
- **Lines 141, 152, 165, 226** — strip `defillama_*` from card-rendering rules; replace with `token_prices` where context is "fetch prices to render a card" and delete entirely where context is yields/protocol-info.
- **Line 277** — tool catalog: remove the 7 `defillama_*` entries, add `token_prices`.

Lines numbers are against the live (pre-edit) file; rerun the search after Day 1 if the file has drifted.

### UI updates

**`audric/apps/web/components/engine/AgentStep.tsx`** — remove 7 defillama entries from `TOOL_ICONS` and `TOOL_LABELS` (lines 35–41, 79–86); add:

```typescript
token_prices: '💲',
// in labels:
token_prices: 'TOKEN PRICES',
```

### Card-rendering tools set [v1.4.1 — C3]

**`audric/apps/web/lib/engine/harness-metrics.ts`** — `CARD_RENDERING_TOOLS` (lines 234–253) currently lists `defillama_yield_pools`, `defillama_protocol_info`, `defillama_token_prices` as tools whose results render cards. `detectNarrationTableDump()` uses this set to flag turns where the LLM dumped a markdown table for a tool that already renders a card. With the 7 DefiLlama tools deleted, those entries become forever-stale flags.

Edits:

```typescript
// REMOVE these entries:
//   'defillama_yield_pools',
//   'defillama_protocol_info',
//   'defillama_token_prices',
// ADD:
'token_prices',
```

`protocol_deep_dive` is already in the set and stays.

### Test updates

| Test file | Change |
|---|---|
| `packages/engine/src/__tests__/aci-constraints.test.ts` | Delete the `defillamaYieldPoolsTool` block (no replacement — `token_prices` doesn't have ACI refinement). |
| `packages/engine/src/__tests__/microcompact.test.ts` | Replace `defillama_token_prices` / `defillama_yield_pools` references with `token_prices` (cacheable) and a non-defillama write tool. |
| `packages/engine/src/__tests__/read-tools-mcp.test.ts` | Replace `vi.mock('../defillama-prices.js')` with `vi.mock('../blockvision-prices.js')`. |
| `audric/apps/web/lib/engine/__tests__/harness-metrics.test.ts` | Update `defillama_yield_pools` references to a generic test fixture (`mock_refining_tool`) or to `mpp_services` (which still has refinement). |

---

## Updated analytics queries (all queries, final versions)

All queries add `WHERE synthetic = false`. Q1 adds `turnPhase = 'initial'`. New Q8 for write-tool latency.

```sql
-- Q1 — Effort routing (initial turns only):
SELECT "effortLevel", "modelUsed", COUNT(*) as turns,
  ROUND(AVG("wallTimeMs")) as avg_wall_ms,
  ROUND(AVG("estimatedCostUsd")::numeric, 5) as avg_cost_usd
FROM "TurnMetrics"
WHERE synthetic = false
  AND COALESCE("turnPhase", 'initial') = 'initial'
GROUP BY "effortLevel", "modelUsed"
ORDER BY "effortLevel";

-- Q2 — Tool latency:
SELECT tool->>'name' as tool_name, COUNT(*) as calls,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (tool->>'latencyMs')::int) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (tool->>'latencyMs')::int) as p95_ms,
  ROUND(AVG((tool->>'returnedRefinement')::boolean::int) * 100) as refinement_pct
FROM "TurnMetrics", jsonb_array_elements("toolsCalled") as tool
WHERE synthetic = false
GROUP BY tool_name ORDER BY p95_ms DESC;

-- Q3 — Cache health (corrected formula):
SELECT DATE("createdAt") as day,
  ROUND(AVG("cacheHit"::int) * 100) as cache_hit_pct,
  ROUND(SUM("cacheSavingsUsd")::numeric, 4) as total_cache_savings_usd
FROM "TurnMetrics"
WHERE synthetic = false
  AND COALESCE("turnPhase", 'initial') = 'initial'
GROUP BY DATE("createdAt") ORDER BY day DESC;

-- Q4 — Guards fired:
SELECT guard->>'name' as guard_name, guard->>'action' as action, COUNT(*) as fires
FROM "TurnMetrics", jsonb_array_elements("guardsFired") as guard
WHERE synthetic = false
GROUP BY guard_name, action ORDER BY fires DESC;

-- Q5 — Wall time + first-token latency [initial turns only]:
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "wallTimeMs") as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "wallTimeMs") as p95_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "firstTokenMs") as ftt_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "firstTokenMs") as ftt_p95_ms
FROM "TurnMetrics"
WHERE synthetic = false
  AND COALESCE("turnPhase", 'initial') = 'initial';

-- Q7 — pendingActionOutcome distribution (synthetic=false only):
SELECT "pendingActionOutcome", COUNT(*) as turns
FROM "TurnMetrics"
WHERE synthetic = false AND "pendingActionYielded" = true
GROUP BY "pendingActionOutcome";

-- Q8 — Write tool latency (resume turns):
SELECT
  tool->>'name' as tool_name,
  COUNT(*) as executions,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "writeToolDurationMs") as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "writeToolDurationMs") as p95_ms
FROM "TurnMetrics"
WHERE synthetic = false
  AND "turnPhase" = 'resume'
  AND "writeToolDurationMs" IS NOT NULL
GROUP BY tool_name ORDER BY p95_ms DESC;
```

[v1.4] Q6 (defillama_yield_pools refinement %) is dropped — the tool no longer exists.

---

## Execution sequence — 5 days [v1.4]

### Day 1 — Item 1: BlockVision portfolio swap + cost-rates extraction

- **[v1.4]** Write `packages/engine/src/blockvision-prices.ts` with `fetchAddressPortfolio()` and `fetchTokenPrices()` plus Sui-RPC + hardcoded-stable fallback
- **[v1.4]** Add `blockvisionApiKey?: string` and `portfolioCache?: Map<…>` to `ToolContext`
- **[v1.4]** Wire `process.env.BLOCKVISION_API_KEY` into `audric/apps/web/lib/engine/engine-factory.ts:buildToolContext`. Initialise `portfolioCache: new Map()` per request.
- **[v1.4]** Rewrite `tools/balance.ts` to call `fetchAddressPortfolio()`. Preserve output shape (UI-compatible). Keep vSUI exchange-rate workaround verbatim.
- **[v1.4]** Rewrite `tools/portfolio-analysis.ts` to use `fetchAddressPortfolio()` (or `fetchTokenPrices()` if it only needs prices).
- **[v1.4]** Update `audric/apps/web/lib/engine/engine-factory.ts` prompt-time price injection (lines 9–10, 316) to import from `blockvision-prices.js`.
- **[v1.3 — G5]** Extend `EngineConfig.onAutoExecuted` payload with `walletAddress?`; populate from `this.walletAddress` in `engine.ts`
- **[v1.4.1 — M4]** Wire `onAutoExecuted` callback chain in engine-factory: existing `incrementSessionSpend` + `invalidateUserFinancialContext(walletAddress)` (auto-tier path). **No `engine.invalidateBalanceCache()` call** — there is no engine-side balance cache (`postWriteRefresh` handles in-session balance freshness; `balance_check` is `cacheable: false`).
- Update `cacheable: false` comment on `balanceCheckTool` to reflect BlockVision source
- **[v1.3 — M4 / G4]** Extract `costRatesForModel` from `chat/route.ts` (lines 621–632) and the local `ModelCostRates` interface (lines 603–608) into new `audric/apps/web/lib/engine/cost-rates.ts`. Update `chat/route.ts` to import. **[v1.3.1 — G11]** Preserve `COST_PER_INPUT_TOKEN` / `COST_PER_OUTPUT_TOKEN` (lines 600–601) — used by the legacy Message row writer further down.
- Add 6 vitest cases for `blockvision-prices.test.ts` (BlockVision happy path, 5xx → fallback, missing key → fallback, hardcoded stables in degraded mode, cache TTL, hardcoded-stable shortcut in `fetchTokenPrices`)
- `pnpm typecheck` + `pnpm test`
- Deploy — monitor `balance_check` p95 next day. Target < 1,500ms.

### Day 2 — Items 2 + delete remaining DefiLlama price feed

- **[v1.4]** Delete `packages/engine/src/defillama-prices.ts`.
- **[v1.4]** Delete `defillama_token_prices` and `defillama_price_change` from `tools/defillama.ts`.
- **[v1.4]** Add new `packages/engine/src/tools/token-prices.ts` (BlockVision-backed).
- **[v1.4]** Wire `token_prices` into `tools/index.ts` (replaces 2 of the 7 deleted tools) and `index.ts` (replace `fetchTokenPrices` export with the BlockVision version).
- **[v1.3.1 — G12]** Promote `argsFingerprint` from `__testOnly__` to a public export in `intent-dispatcher.ts`
- Verify `ReadIntent` is exported from `intent-dispatcher.ts` (one-line check)
- Add `RESUMED_SESSION_INTENTS` constant at module scope of `chat/route.ts`
- Add `isReturningSession = isAuth && !!(session?.messages?.length)` derivation
- Replace `const intents = classifyReadIntents(...)` with the dedup loop using `argsFingerprint`
- Add 4 route-level Vitest tests in `tests/chat-route-resumed-session-prefetch.test.ts`
- `pnpm typecheck` + `pnpm test`
- Deploy — monitor first-token p50/p95 next day, segment Q5 by resumed-vs-new-session if possible

### Day 3 — Item 3: TurnMetrics data integrity + delete remaining DefiLlama tools

**Code:**
- Add `attemptId: string` to `PendingAction`, stamp at yield
- Add schema fields **additively**: `attemptId`, `synthetic`, `writeToolDurationMs`, `cacheSavingsUsd`, `turnPhase String @default("initial")`. Existing `mutableToolDedupes` preserved.
- Add `actedOn Boolean @default(false)` to `AdviceLog`
- Update `TurnMetricsCollector.onPendingAction(attemptId)`; preserve `mutableToolDedupes` in `build()` output
- Update chat route: write `attemptId`, `turnPhase: 'initial'`, `synthetic`
- Update resume route: `updateMany where { attemptId }` (full route work continues Day 4)
- Add pending sweep cron (`*/5 * * * *`)
- Add `SYNTHETIC_SESSION_PREFIXES` to env + document fixed-prefix follow-up

**Migration sequence [v1.4 — B3]:**
1. Local: `pnpm prisma migrate dev --name add_turn_metrics_integrity`
2. Production: `pnpm prisma migrate deploy`
3. **After migrate deploy succeeds**, run in NeonDB console:

```sql
UPDATE "TurnMetrics" SET synthetic = true
WHERE "sessionId" = 's_1777047351366_d172f3de05f0';
-- Verify: 255 rows

UPDATE "TurnMetrics" SET "turnPhase" = 'initial'
WHERE "turnPhase" IS NULL;
-- Verify: matches total non-bot row count
```

4. Run post-migration column verification:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'TurnMetrics'
  AND column_name IN (
    'attemptId','synthetic','writeToolDurationMs',
    'cacheSavingsUsd','turnPhase','mutableToolDedupes'
  );
-- Expect 6 rows.
```

**[v1.4] DefiLlama tool deletion (continues from Day 2):**
- Delete remaining 5 tools from `tools/defillama.ts`: `defillama_yield_pools`, `defillama_protocol_info`, `defillama_chain_tvl`, `defillama_protocol_fees`, `defillama_sui_protocols`.
- Delete `packages/engine/src/tools/defillama.ts` entirely.
- Remove all 5 remaining defillama exports from `tools/index.ts` and `index.ts`.
- Verify `tools/protocol-deep-dive.ts` still works (lone DefiLlama production dep).
- Remove DefiLlama fallback (`fetchRatesFromDefiLlama`, lines 62–88) from `tools/rates.ts`.
- Verify: no false TurnMetrics resolutions in next 24h.

### Day 4 — Item 4: resume route instrumentation + prompt/UI cleanup

- **[v1.3 — G3]** Switch `resume/route.ts` from `engineToSSE` wrapper to raw-event iteration with per-event `serializeSSE`
- Add `TurnMetricsCollector` capturing first-text-delta / tool-start / tool-result / usage / compaction / pending_action
- **[v1.3.1 — G13]** Capture `pendingAction` from `event.action`; preserve existing `setConversationState` + session store wire-up in finally block
- **[v1.3 — G3]** Switch the existing `updateMany` from `(sessionId, turnIndex)` to `(attemptId)`; add `writeToolDurationMs`
- Write a new `TurnMetrics` row at close with `turnPhase: 'resume'`, **`contextTokensStart: priorMsgCount`** [v1.4.1 — C1; uses `engine.getMessages().length` captured right after `createEngine`, mirroring chat/route.ts:189], synthetic derived from `SYNTHETIC_SESSION_PREFIXES`
- **[v1.3 — M3]** Pass `onMeta` callback to `createEngine` to capture `{ effortLevel, modelUsed }`
- **[v1.3 — G2]** Engine call uses `{ approved, executionResult }` only. `modifications`/`outcome` continue to be handled pre-engine
- **[v1.4 — B1]** Add `invalidateUserFinancialContext(address)` call inside the existing post-write `if (resolvedOutcome === 'approved' || 'modified')` block. Cache key is `address`, not `userId` — eliminates the v1.3.1 implementation gap.
- **[v1.4 — m1]** Capture `executionDurationMs` in `useEngine.ts:resolveAction()` and append to the existing `attemptStream('/api/engine/resume', body)` body argument (do not refactor to raw `fetch`)
- **[v1.4 — m2]** ResumeBody interface omits redundant `toolUseId` field (read from `body.action.toolUseId` instead)
- Import `costRatesForModel` from `lib/engine/cost-rates.ts` (Day 1)

**[v1.4] System prompt + UI cleanup:**
- `packages/engine/src/prompt.ts`: replace defillama_* references per "DefiLlama deletion summary" above
- `audric/apps/web/lib/engine/engine-context.ts`: strip defillama_* from card-rendering rules, tool catalog, recipes
- `audric/apps/web/components/engine/AgentStep.tsx`: remove 7 defillama icon/label entries; add `token_prices`
- Update test fixtures: `aci-constraints.test.ts`, `microcompact.test.ts`, `read-tools-mcp.test.ts`, `harness-metrics.test.ts`

- `pnpm typecheck` + `pnpm test`
- Deploy — verify `swap_execute` rows present with real latency

### Day 5 — Item 5 cache formula + Item 6 fin_ctx + batched engine publish

- `cost-rates.ts` already exists from Day 1 — just consume it
- Wire `cacheSavingsUsd` in `TurnMetricsCollector.build()` using `costRatesForModel(modelUsed)` — per-model, not hardcoded Sonnet
- Replace `cache_token_pct` in **dashboards** with `cache_savings_usd`. No code references exist.
- Add `actedOn Boolean @default(false)` migration to `AdviceLog` (if not done in Day 3)
- Add `UserFinancialContext` Prisma model with **dual-key** (`userId` cuid + `address`) per [v1.4 — B2]
- Local: `pnpm prisma migrate dev --name add_user_financial_context`
- Write `financial-context-snapshot.ts` cron (writes both `userId` and `address`)
- Register in t2000 cron scheduler at 02:00 UTC
- Write `lib/redis/user-financial-context.ts`: `getUserFinancialContext(address)` + `invalidateUserFinancialContext(address)` keyed on `fin_ctx:${address}` [v1.4 — B1]
- Wire `buildDynamicBlock` injection in `engine-context.ts`
- Verify: both invalidation callsites wire correctly — auto-tier (Day 1) and confirm-tier (Day 4)

**Batched engine publish:**
- Bundle engine changes:
  - `blockvision-prices.ts` (new) [v1.4]
  - `token_prices` tool (new) [v1.4]
  - `defillama-prices.ts` (deleted) [v1.4]
  - `tools/defillama.ts` (deleted, all 7 tools) [v1.4]
  - `tools/balance.ts` (rewritten against BlockVision) [v1.4]
  - `tools/portfolio-analysis.ts` (BlockVision price import) [v1.4]
  - `tools/rates.ts` (DefiLlama fallback removed) [v1.4]
  - `ToolContext`: `blockvisionApiKey`, `portfolioCache` [v1.4]
  - `PendingAction.attemptId`
  - `EngineConfig.onAutoExecuted` extended with `walletAddress?`
  - **[v1.4.1 — M4]** `QueryEngine.invalidateBalanceCache()` is **NOT** added — it would be a phantom API (no balance cache exists; `postWriteRefresh` covers in-session freshness; `balance_check` is `cacheable: false`).
- Bump engine to `0.47.0` (current `0.46.16`)
- Publish, wait for npm propagation
- `pnpm add @t2000/engine@0.47.0` in audric web (pin exact)
- Run all 8 analytics queries with `WHERE synthetic = false`
- Save baseline to `spec/harness-metrics-spec2-baseline.md`
- Verify all 13 success criteria met

---

## Success criteria

| Criterion | Baseline | Target | How to verify |
|---|---|---|---|
| `balance_check` p95 | 8,368ms | < 1,500ms | Q2 after Day 1 |
| BlockVision portfolio p95 [v1.4 — new] | not measured | < 500ms | Add to balance_check tool latency dashboard |
| First-token p50 (initial turns) | 3,017ms | < 1,500ms | Q5 after Day 2 |
| First-token p95 | 9,779ms | < 5,000ms | Q5 after Day 2 |
| False-resolution | possible | impossible | `where { attemptId }` |
| Pending rows > 15min | 24 real | zero | Q7 after Day 3 + 20min |
| Synthetic rows in analytics | 255 | zero | `WHERE synthetic = false` |
| `swap_execute` rows visible | 0ms | real ms | Q8 after Day 4 |
| `cache_token_pct` artifact | 10,928% | replaced with `cache_savings_usd` | Q3 after Day 5 |
| Returning user resumed-session tool calls | 2 | 0 | Manual session check |
| Q1 uncontaminated | polluted | clean | Q1 + COALESCE guard |
| Real pending resolution > 15min | 24 rows | < 5% of yields | Q7 + 7 days |
| `pnpm typecheck` both repos | — | green | CI |
| Zero regressions | — | green | Smoke test |

[v1.4] Dropped from v1.3.1: `defillama` refinement target (tool no longer exists).

---

## Files changed summary

### New files
```
audric/apps/web/lib/engine/cost-rates.ts                   [v1.3 — Day 1, EXTRACTION not creation]
audric/apps/web/lib/redis/user-financial-context.ts        [v1.4 — address-keyed helpers]
audric/apps/web/lib/engine/financial-context.ts            (engine-side wrapper)
audric/apps/web/app/api/cron/turn-metrics-pending-sweep/route.ts
t2000/apps/server/src/cron/jobs/financial-context-snapshot.ts
audric/apps/web/tests/chat-route-resumed-session-prefetch.test.ts
spec/harness-metrics-spec2-baseline.md
packages/engine/src/blockvision-prices.ts                  [v1.4 — replaces defillama-prices.ts]
packages/engine/src/tools/token-prices.ts                  [v1.4 — replaces 2 deleted tools]
packages/engine/src/__tests__/blockvision-prices.test.ts   [v1.4]
```

### Deleted files
```
packages/engine/src/defillama-prices.ts                    [v1.4]
packages/engine/src/tools/defillama.ts                     [v1.4 — all 7 tools]
```

### Modified files
```
packages/engine/src/types.ts
  + ToolContext: blockvisionApiKey?, portfolioCache?           [v1.4]
  ~ EngineConfig.onAutoExecuted payload extended with walletAddress?
  - EngineConfig.onWriteToolSuccess                            [REMOVED per G5]
  - ToolContext: balanceCache?, suiRpcFallbackUrl?             [v1.4 — REMOVED, never landed]

packages/engine/src/tools/balance.ts                        [v1.4 — rewritten]
  ~ ~190 lines → ~80 lines
  ~ fetchAddressPortfolio() replaces fetchWalletCoins + fetchTokenPrices parallel
  + vSUI exchange-rate workaround preserved verbatim
  - DefiLlama price import removed

packages/engine/src/tools/portfolio-analysis.ts             [v1.4]
  ~ fetchTokenPrices import switched from defillama-prices to blockvision-prices

packages/engine/src/tools/rates.ts                          [v1.4]
  - fetchRatesFromDefiLlama() (lines 71–88) deleted
  - DefiLlamaPool interface deleted
  - YIELDS_API constant deleted

packages/engine/src/tools/index.ts                          [v1.4]
  - 7 defillama_* exports removed
  + tokenPricesTool added

packages/engine/src/index.ts                                [v1.4]
  - fetchTokenPrices export from defillama-prices removed
  - 7 defillama tool exports removed
  + fetchTokenPrices, fetchAddressPortfolio re-exported from blockvision-prices
  + tokenPricesTool exported

packages/engine/src/prompt.ts                               [v1.4]
  - All defillama_* rule lines (21, 22, 35, 36, 39) replaced with token_prices / static protocol list / decline-LP rule

packages/engine/src/engine.ts
  + PendingAction: attemptId (crypto.randomUUID() at yield)
  ~ onAutoExecuted invocation passes walletAddress
  - QueryEngine.invalidateBalanceCache(walletAddress)         [v1.4.1 — M4: NOT ADDED — phantom API]
  - QueryEngine.getModelUsed()                                 [REMOVED per M3]

packages/engine/src/cost.ts (or CostTracker)
  - getLastModel(): string | null                              [REMOVED per M3]

audric/apps/web/lib/engine/intent-dispatcher.ts
  ~ ensure ReadIntent is exported (one-line check)
  ~ argsFingerprint promoted from __testOnly__ to public export

audric/apps/web/lib/engine/harness-metrics.ts
  + onPendingAction(attemptId): captures attemptId
  + build(): attemptId, cacheSavingsUsd (costRatesForModel), turnPhase, synthetic
  ~ mutableToolDedupes preserved in build() output
  - CARD_RENDERING_TOOLS: remove defillama_yield_pools, defillama_protocol_info, defillama_token_prices  [v1.4.1 — C3]
  + CARD_RENDERING_TOOLS: add token_prices                                                                [v1.4.1 — C3]

audric/apps/web/lib/engine/engine-context.ts                [v1.4]
  + buildDynamicBlock: inject <financial_context>
  - defillama_* references on lines 141, 152, 165, 218, 226, 277 replaced

audric/apps/web/lib/engine/engine-factory.ts                [v1.4]
  ~ fetchTokenPrices import from defillama-prices → blockvision-prices
  + buildToolContext: blockvisionApiKey from process.env, portfolioCache: new Map()
  - balanceCache, suiRpcFallbackUrl wiring (never landed; v1.3.1 design dropped)
  ~ onAutoExecuted chain: incrementSessionSpend + invalidateUserFinancialContext(walletAddress) [v1.4.1 — M4: no invalidateBalanceCache call]

audric/apps/web/components/engine/AgentStep.tsx             [v1.4]
  - 7 defillama_* TOOL_ICONS / TOOL_LABELS entries removed
  + token_prices: '💲' / 'TOKEN PRICES' added

audric/apps/web/app/api/engine/chat/route.ts
  + isReturningSession derivation
  + RESUMED_SESSION_INTENTS module constant
  ~ classifyReadIntents wrapped with resumed-session dedup loop
  ~ pushUnique uses argsFingerprint() not JSON.stringify()
  - inline costRatesForModel + ModelCostRates removed
  + COST_PER_INPUT_TOKEN / COST_PER_OUTPUT_TOKEN PRESERVED
  + import costRatesForModel from '@/lib/engine/cost-rates'
  + import argsFingerprint from '@/lib/engine/intent-dispatcher'
  + toolContext: blockvisionApiKey, portfolioCache                [v1.4]
  + TurnMetrics: write attemptId, turnPhase='initial', synthetic

audric/apps/web/app/api/engine/resume/route.ts
  + ResumeBody: address field, executionDurationMs (NO toolUseId per m2)
  ~ engineToSSE wrapper REPLACED with raw-event iteration + serializeSSE
  ~ updateMany switched from (sessionId,turnIndex) to (attemptId)
    + writeToolDurationMs
  + TurnMetricsCollector + new resume-turn row write (turnPhase='resume', contextTokensStart=priorMsgCount per [v1.4.1 — C1])
  + onMeta callback to capture { effortLevel, modelUsed }
  + import costRatesForModel from '@/lib/engine/cost-rates'
  + isSynthetic derived from SYNTHETIC_SESSION_PREFIXES
  ~ engine call uses { approved, executionResult } only
  ~ pre-engine modifications/outcome handled by existing helpers
  ~ pendingAction captured from event.action; setConversationState + session store wire-up preserved in finally block
  + invalidateUserFinancialContext(address) call added inside existing post-write block       [v1.4 — B1]

audric/apps/web/hooks/useEngine.ts
  + executionDurationMs captured in resolveAction; appended to existing attemptStream body    [v1.4 — m1]

audric/apps/web/prisma/schema.prisma
  ~ TurnMetrics: ADDITIVE migration — adds attemptId, synthetic,
    writeToolDurationMs, cacheSavingsUsd, turnPhase. mutableToolDedupes preserved.
  + AdviceLog: actedOn Boolean @default(false)
  + UserFinancialContext model with dual-key (userId cuid + address)                          [v1.4 — B2]

t2000/apps/server/src/cron/scheduler.ts
  + financial-context-snapshot at 02:00 UTC

vercel.json
  + turn-metrics-pending-sweep: "*/5 * * * *"

# Test files (modified, not deleted):
packages/engine/src/__tests__/aci-constraints.test.ts       [v1.4 — defillama_yield_pools block deleted]
packages/engine/src/__tests__/microcompact.test.ts          [v1.4 — defillama_* refs replaced with token_prices / generic]
packages/engine/src/__tests__/read-tools-mcp.test.ts        [v1.4 — vi.mock target switched]
audric/apps/web/lib/engine/__tests__/harness-metrics.test.ts [v1.4 — defillama_yield_pools test renamed/refactored]
```

---

## v1.4 changelog (against v1.3.1)

1. **DefiLlama deletion** — `defillama-prices.ts` and `tools/defillama.ts` (7 tools) deleted entirely. Replaced by `blockvision-prices.ts` (new file) and `tools/token-prices.ts` (single new tool consolidating `defillama_token_prices` + `defillama_price_change`). `protocol_deep_dive` retained as the lone DefiLlama production dependency. `tools/rates.ts` DefiLlama fallback removed. ~600 lines deleted, ~170 lines added.

2. **Item 1 fully rewritten** — Was: fallback RPC + 4s timeout + `assembleBalance` extraction + `ctx.balanceCache` + `engine.invalidateBalanceCache()`. Now: single BlockVision portfolio API call with Sui-RPC + hardcoded-stablecoin degraded mode. `SUI_RPC_FALLBACK_URL` env var dropped (never needed).

3. **Item 5 collapsed to Fix B only** — `defillama_yield_pools` ACI refinement (Fix A) is moot because the tool no longer exists. Only the `cache_savings_usd` formula update remains. Q6 success criterion dropped.

4. **B1 — `userId` not in scope at resume Edit 5** — fixed by re-keying the Redis cache as `fin_ctx:${address}` everywhere. The `UserFinancialContext` table carries both `userId` (cuid) and `address` (Sui wallet, indexed) so DB queries by either key work; the cache layer uses `address` as the canonical key because it's universally available across both routes without a DB lookup.

5. **B2 — `TurnMetrics.userId` vs `UserFinancialContext.userId` identifier mismatch** — fixed alongside B1. `TurnMetrics.userId` continues to use the wallet address (per existing chat-route convention); the financial context cache uses `address` as well, eliminating the translation layer.

6. **B3 — Day 3 migration sequencing** — backfill SQL now runs **after** `pnpm prisma migrate deploy` adds the columns, not before. v1.3.1 had this reversed.

7. **B4 — `priorMsgCount` undefined symbol** — *(Superseded by [v1.4.1 — C1] below: `priorMsgCount` IS defined; v1.4's "fix" of using `contextTokensStart: 0` was misjustified.)*

8. **m1 — `useEngine.ts` resume call** — spec example now uses the existing `attemptStream('/api/engine/resume', body)` invocation pattern; `executionDurationMs` is appended to the body argument rather than refactoring to a raw `fetch`.

9. **m2 — `ResumeBody.toolUseId` field dropped** — was redundant with `body.action.toolUseId`; the live hook never sent it as a top-level field.

10. **m3 — `intent-dispatcher` imports merged** — Item 2 now uses a single `import { classifyReadIntents, argsFingerprint, type ReadIntent }` instead of two separate import statements.

---

## v1.4.1 changelog (against v1.4)

10 surgical patches. No changes to the overall plan, day breakdown, or success criteria (one new BlockVision-p95 panel added).

1. **C1 — `priorMsgCount` IS in scope; B4's "fix" was misjustified.** v1.4 wrote `contextTokensStart: 0` for resume turns based on a claim that `priorMsgCount` was undefined. Re-audit confirms it's defined at `resume/route.ts:107` and `chat/route.ts:189` (both as `engine.getMessages().length`). Reverted to `contextTokensStart: priorMsgCount` so resume metrics stay aligned with chat-route convention. Added a "Naming note" calling out that the column is technically a message-count rather than a token-count — pre-existing across both routes; rename is a future-spec concern.

2. **C2 — `postWriteRefresh` (v1.5 engine feature) is already in production.** `engine-factory.ts:506` wires `postWriteRefresh: POST_WRITE_REFRESH_MAP` which auto-re-runs `balance_check` / `savings_info` / `health_check` after writes within a session. v1.4 oversold `fin_ctx` invalidation as in-session freshness; that's the wrong framing. Reframed Item 6 cache invalidation as two layers: Layer 1 = in-session tool freshness (already shipped, not a spec item) and Layer 2 = cross-session orientation freshness (this spec's `fin_ctx` work).

3. **C3 — `harness-metrics.ts:CARD_RENDERING_TOOLS` set was missing from v1.4's edit list.** The set lists `defillama_yield_pools`, `defillama_protocol_info`, `defillama_token_prices` as card-renderers, used by `detectNarrationTableDump()` to flag spurious markdown dumps. With those tools deleted, the entries become forever-stale flags. Added an explicit edit: remove the 3 defillama entries, add `token_prices`. `protocol_deep_dive` already in the set, stays.

4. **C4 — `engine-context.ts:218` has a hard-coded `defillama_token_prices` reference.** Generic "strip defillama_*" instructions miss it because it's inside a system-prompt rule (`...swap_quote (...) or defillama_token_prices BEFORE quoting...`). Added an explicit "swap to `token_prices`" instruction with the exact line number.

5. **M1' — vSUI workaround `preserve verbatim` is impossible under BlockVision.** The current `balance.ts:106-122` workaround mutates a separate `prices` map. After BlockVision, prices are embedded on `portfolio.coins[i].price`. v1.4 said to keep the logic verbatim — that would not compile. Replaced with the rewritten pattern that mutates the coin entry (and `portfolio.totalUsd`) in place.

6. **M2' — NAVI MCP coin-fetch fallback (Tier 3 of the current `balance.ts`) is silently dropped.** v1.4 didn't acknowledge this. Made the drop explicit as an accepted regression with three-bullet rationale: triple redundancy was unnecessary; NAVI MCP outages already block the dominant code paths; `hasNaviMcp(context)` gate stays for the outer auth branch. Day-N follow-up flagged if regression matters post-launch.

7. **M3' — "BlockVision already integrated" framing is misleading.** v1.4 read as "we're just extending an existing integration." Reality: the existing integration is **JSON-RPC** routing in `audric/apps/web/lib/sui-rpc.ts:22`; v1.4 introduces calls to BlockVision's **Indexer REST API** at `api.blockvision.org/v2/sui/...` — a different base URL, different auth pattern (`x-api-key` header), different error surface. Reworded the vendor consolidation table and Item 1 root-cause to clarify this is net-new integration with a shared API key.

8. **M4' — `engine.invalidateBalanceCache()` is a phantom API.** v1.4 proposed keeping it as a no-op for "callback uniformity." But there is no balance cache for it to clear: `postWriteRefresh` covers in-session freshness, `balance_check` is `cacheable: false`, and the `ctx.balanceCache` Map proposed in v1.3.1 was never going to land. Removed the engine surface change. The `onAutoExecuted` callback now only chains `incrementSessionSpend()` and `invalidateUserFinancialContext()`. Updated execution sequence, files-changed, and engine-publish bundle.

9. **M5' — Redundant `@@index` lines on `@unique` fields in `UserFinancialContext`.** Prisma already creates an implicit unique index for each `@unique` field. Dropped both `@@index([userId])` and `@@index([address])`.

10. **M6' — `engine-factory.ts:316` is a critical-path price injection.** Every authenticated `createEngine()` call hits this line at boot. After the BlockVision swap it becomes a REST call on the cold-start critical path. Added a mitigation note: the existing `AbortSignal.timeout(3000)` inside `fetchTokenPrices()` caps the worst case; the existing `.catch(() => ({}))` envelope at the call site stays; a BlockVision portfolio + prices p95 panel is added to the success criteria so cold-start regressions surface the day after deploy.

---

## v1.4.1 audit notes (informational)

The fixes above were found by re-auditing v1.4 against the live `audric/` and `t2000/` codebases. Three observations worth carrying forward:

- **`audric/` is a sibling repo at `/Users/funkii/dev/audric/`, not a subdirectory of `t2000/`.** Earlier specs (v1.0–v1.3.1) implicitly treated paths under `audric/apps/web/...` as if they lived inside the same monorepo. They don't. Cross-repo work means engine changes (in `t2000/packages/engine/`) must be published to npm before the audric web app can pick them up — captured in the Day 5 "Batched engine publish" step.

- **`postWriteRefresh` (v1.5 engine feature) is in production.** The TurnMetrics row writes I/O against the engine's existing observability are already richer than v1.4 acknowledged. Future specs should check `engine-factory.ts` for already-wired hooks before specifying new ones.

- **The `audric/apps/web/lib/sui-rpc.ts` JSON-RPC routing is a separate integration** from the v1.4 Indexer REST API work. They share a vendor and an env var but nothing else. Treat as net-new.

---

*Spec 2 locked at v1.4.1. Execution-ready (final).*
*After Day 5: run all 7 active queries, verify 14 success criteria (BlockVision p95 panel added), save to `spec/harness-metrics-spec2-baseline.md`, then write Spec 3.*

---

## v1.4.2 — Day 1 + Day 2 build deviations & post-build patches (informational)

This footer is **not** a re-spec — Day 1 and Day 2 shipped against v1.4.1 as written. It records (a) deltas where the implementation diverged from the literal spec text and (b) one HIGH-severity regression that surfaced during the Day-2 audit and was patched the same day.

### S-1 — BlockVision `/account/coins` parameter name (spec defect, no code impact)

The spec body says the wallet portfolio endpoint takes `?address=…`. BlockVision's docs and the live API actually accept `?account=…`; `?address=` returns an empty `coins` array with `code: 200`. The Day-1 implementation (`packages/engine/src/blockvision-prices.ts:fetchPortfolioFromBlockVision`) uses `?account=` and is therefore correct. The spec text is wrong; correct it inline before any future spec re-derivation.

### M-1 — `STABLE_USD_PRICES` keyed by full coinType (deviation, kept)

The spec showed the stable allow-list keyed by symbol (`USDC`, `USDT`, …). The implementation keys by full coinType (`0xdba34672…::usdc::USDC`, …). Symbols collide — every malicious clone of USDC publishes a coin called `USDC` — so the coinType key is the safer form. Kept as-is. Future specs should default to coinType keys for any allow-list that maps to a price mark.

### M-2 / Day-2.5 patch — Post-write portfolio cache invalidation (HIGH severity, **fixed**)

**Bug.** The v1.4 BlockVision swap introduced two caching layers — `ToolContext.portfolioCache` (per-request `Map`, no TTL) and the module-level `portfolioCache` in `blockvision-prices.ts` (60s TTL). After a successful write, `engine.runPostWriteRefresh()` re-runs `balance_check`, which calls `fetchAddressPortfolio()`, which **returned the cached pre-write snapshot**. Pre-v1.4 the same path called `fetchWalletCoins` (Sui RPC, uncached), so the existing 1.5s indexer-lag delay alone gave fresh data. Post-v1.4 the delay is necessary but not sufficient.

User-visible failure: "I deposited 20 USDC but Audric says my balance didn't change." Exactly the v0.46.16-era class of bug `postWriteRefresh` was added to prevent.

**Fix.** Two-line patch in `engine.ts:runPostWriteRefresh`, immediately before the 1.5s lag-delay:

```ts
if (this.walletAddress) {
  this.portfolioCache?.delete(this.walletAddress);
  clearPortfolioCacheFor(this.walletAddress);
}
```

`clearPortfolioCacheFor(address)` is a new per-address invalidator exported from `blockvision-prices.ts` (the existing `clearPortfolioCache()` was test-only and would have nuked unrelated users' caches in a multi-tenant deploy). Two regression tests added to `__tests__/blockvision-prices.test.ts` lock in the semantics — fresh fetch on call, and only the targeted address is evicted.

**Rule for future spec authors.** Any `cacheable: true` tool that the LLM might call after a write **must** have an invalidation hook wired into `runPostWriteRefresh`. The cache TTL alone is not a substitute. The 60s portfolio TTL stays — it's right for back-to-back read tools inside a turn — but the post-write boundary needs the explicit bust.

### M-3 — `fetchTokenPrices` always sends `show24hChange=true` (deviation, kept for now)

The Day-1 implementation hits BlockVision with `&show24hChange=true` unconditionally, even when the caller (e.g. `engine-factory.ts` prompt-time price injection) doesn't need 24h change. BlockVision returns the change field cheap-or-free, so the cost is a few extra bytes in the response, not a separate request. Not worth the conditional plumbing today; revisit if the BlockVision pricing surface ever splits change-data into a paid tier.

### M-4 — `PortfolioCoin.priceUnavailable` not modeled (deviation, kept)

The spec hinted at a `priceUnavailable: true` discriminator on coin entries that fall through to `null`. The implementation models it as `price: null` directly. `null` is unambiguous and matches the existing `usdValue: number | null` pattern; the `tokenPricesTool` handler emits a synthetic `priceUnavailable` only at the LLM-facing payload, which is the right boundary for that flag.

### M-5 — `engine-factory.ts` still issues two BlockVision calls at chat boot (deferred)

Authenticated chat boot runs `fetchWalletCoins` (Sui RPC) **and** `fetchTokenPrices` (BlockVision price list) instead of one consolidated `fetchAddressPortfolio` call. Both Day-1 and Day-2 left this alone because the boot path also reads `serverPositions` from NAVI and routing the BlockVision response through the existing two-call shape kept the diff small. Optimisation deferred to Day 5 ("BlockVision portfolio API p95" success criterion will surface this if it actually matters at the p95).

### M-6 — Tool-count comments (drift, **fixed**)

`packages/engine/src/tools/index.ts` and `packages/engine/README.md` both said "29 read tools." Day 2 net change is `-2 (DefiLlama prices/changes) + 1 (token_prices) = −1`, leaving 28 reads. Both comments updated; no behavioural change. README also got a Day-3-target comment so the next person doesn't have to re-derive the delta.

### L-2 — `AbortSignal.timeout` ignores caller's signal (deviation, kept)

`fetchAddressPortfolio` and `fetchTokenPrices` use a self-rolled `AbortSignal.timeout(N)` instead of composing the caller's `signal`. Means BlockVision requests don't abort if the upstream request is cancelled mid-flight (3-4s wasted in the worst case). Not worth the AnySignal polyfill churn until we see actual cancelled-request volume in production.

---

*Spec 2 locked at v1.4.2. Day-1 and Day-2 shipped, post-write cache gap fixed in-place. Day 3 unblocked.*

---

## v1.4.2 — Day 3 Stream A migration (deploy SQL — drafted, **not** applied)

The Day 3 schema work is purely additive: two columns on `AdviceLog`, five on `TurnMetrics`, and one new index. No `NOT NULL` constraints land without defaults, so existing rows backfill correctly without an explicit `UPDATE` step.

The local repo's `prisma/migrations/` directory is empty (audric historically synced via `db push`), and `DATABASE_URL` in `.env.local` points at the hosted NeonDB instance — meaning a `prisma migrate dev` from this machine would mutate prod. We deliberately did not run it. Instead:

1. `prisma generate` was run locally to regenerate `lib/generated/prisma/` so the rest of Stream A (TurnMetricsCollector, chat/route, resume/route) typechecks against the new columns.
2. The deploy SQL is drafted below for the user to run against NeonDB at deploy time.

**Drafted deploy SQL — paste into NeonDB SQL editor or run via `psql $DATABASE_URL`:**

```sql
-- v1.4.2 Day 3 / Stream A (Item 3 — TurnMetrics data integrity + AdviceLog.actedOn)
-- Pre-run check: confirms the migration hasn't already been applied. If any
-- of these return a row count > 0, skip the corresponding ALTER TABLE.
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'TurnMetrics'
   AND column_name IN ('attemptId','synthetic','writeToolDurationMs','cacheSavingsUsd','turnPhase');

SELECT column_name FROM information_schema.columns
 WHERE table_name = 'AdviceLog' AND column_name = 'actedOn';

BEGIN;

-- AdviceLog: surface only unactioned advice in the daily financial-context cron.
ALTER TABLE "AdviceLog"
  ADD COLUMN "actedOn" BOOLEAN NOT NULL DEFAULT false;

-- TurnMetrics: per-attempt instrumentation (Item 3) + cache-savings + synthetic
-- + turnPhase + write-tool wall-clock. All additive with safe defaults so
-- existing rows backfill without an explicit UPDATE.
ALTER TABLE "TurnMetrics"
  ADD COLUMN "attemptId"           TEXT,
  ADD COLUMN "synthetic"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "writeToolDurationMs" INTEGER,
  ADD COLUMN "cacheSavingsUsd"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "turnPhase"           TEXT NOT NULL DEFAULT 'initial';

-- Resume route does a per-row updateMany keyed on attemptId — index it.
-- Sparse column, btree is right.
CREATE INDEX "TurnMetrics_attemptId_idx" ON "TurnMetrics"("attemptId");

COMMIT;

-- Post-run sanity check: confirm column + index landed.
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'TurnMetrics'
   AND column_name IN ('attemptId','synthetic','writeToolDurationMs','cacheSavingsUsd','turnPhase')
 ORDER BY column_name;

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'TurnMetrics' AND indexname = 'TurnMetrics_attemptId_idx';
```

**Rollback (SAFE if no Day-3 code has shipped yet):**

```sql
BEGIN;
DROP INDEX IF EXISTS "TurnMetrics_attemptId_idx";
ALTER TABLE "TurnMetrics"
  DROP COLUMN IF EXISTS "turnPhase",
  DROP COLUMN IF EXISTS "cacheSavingsUsd",
  DROP COLUMN IF EXISTS "writeToolDurationMs",
  DROP COLUMN IF EXISTS "synthetic",
  DROP COLUMN IF EXISTS "attemptId";
ALTER TABLE "AdviceLog"
  DROP COLUMN IF EXISTS "actedOn";
COMMIT;
```

Rollback becomes destructive once chat/route + resume/route start writing to the new columns — at that point any row created post-deploy carries data the schema would lose on rollback. Plan accordingly.

**`mutableToolDedupes` (v1.5.1) intentionally untouched.** The column already exists in prod and the v1.4.2 build keeps writing it — this migration is additive on top of it, not a re-derivation of the table.

---

## v1.4.2 — Day 3 Stream A status (informational)

Stream A (TurnMetrics data integrity) shipped end-to-end against the v1.4.1 spec body. Below is the build-time delta from spec text plus the open-on-deploy items.

### Shipped

- **Engine (published as part of Day 5 republish):**
  - `PendingAction.attemptId: string` added (`packages/engine/src/types.ts`).
  - `engine.ts` agent loop stamps `attemptId = randomUUID()` from `node:crypto` at every `pending_action` yield. Two unit tests added (`__tests__/confirmation.test.ts`): UUID-shape assertion + per-yield uniqueness regression. Hand-built `streaming.test.ts` fixtures updated to include the new required field.
- **Schema (Prisma `schema.prisma`):**
  - `AdviceLog.actedOn Boolean @default(false)`.
  - `TurnMetrics`: `attemptId String?`, `synthetic Boolean @default(false)`, `writeToolDurationMs Int?`, `cacheSavingsUsd Float @default(0)`, `turnPhase String @default("initial")`. New `@@index([attemptId])`. `mutableToolDedupes` (v1.5.1) preserved verbatim.
  - `prisma generate` run locally; `lib/generated/prisma/` regenerated. **No** migration applied — `DATABASE_URL` in `.env.local` points at hosted Neon and the deploy SQL must be applied as a deliberate step (block above).
- **Collector (`lib/engine/harness-metrics.ts`):**
  - `_pendingAttemptId` private field, `onPendingAction(attemptId?)` accepts the engine-stamped id.
  - `build({...})` returns the four new columns: `attemptId` from the captured value, `synthetic` from caller, `cacheSavingsUsd = max(0, cacheReadTokens × (input − cacheRead))` via `costRatesForModel`, `turnPhase` from caller (defaults `'initial'`).
  - `mutableToolDedupes` v1.5.1 drift counter preserved.
- **Chat route (`app/api/engine/chat/route.ts`):**
  - `collector.onPendingAction(event.action.attemptId)` passes the id through.
  - `collector.build({..., synthetic: isSyntheticSessionId(sessionId), turnPhase: 'initial'})`. The chat route is user-prompt-driven for human traffic, but bot/test harnesses (e.g. the `s_1777047351366…` load tester backfilled in the deploy SQL) drive it the same way — so the *route* can't decide the bit on its own; the sessionId prefix is the canonical signal. Initially shipped as `synthetic: false` and corrected during the Day-3 self-audit (see Audit findings below).
- **Synthetic-session helper (`lib/engine/synthetic-sessions.ts`, new):**
  - `SYNTHETIC_SESSION_PREFIXES` parsed once at module load from the env var of the same name. `isSyntheticSessionId(sessionId)` returns true iff the id starts with any configured prefix; empty/unset env returns false for every id (conservative default).
  - Extracted to a shared module so the chat route and the (Day 4) resume route import the *same* derivation — the routes' "MUST agree on `synthetic`" invariant is enforced by construction rather than by parallel inline copies that could drift.
  - 11 unit tests covering empty env, whitespace-only env, single prefix, multiple prefixes, the canonical bot prefix from the deploy SQL backfill, and mid-id non-matches (`lib/engine/__tests__/synthetic-sessions.test.ts`).
- **Resume route (`app/api/engine/resume/route.ts`):**
  - `ResumeRequestBody.executionDurationMs?: number` added (additive).
  - `updateMany` keying switched from `(sessionId, turnIndex)` to `attemptId` when the rehydrated `PendingAction` carries one. Legacy pair-based keying retained as a defensive fallback for in-flight pre-v1.4.2 sessions; safe to delete in Day 4 once session TTL has rotated all of them out.
  - Update payload now writes `writeToolDurationMs` from `body.executionDurationMs ?? null` so the column starts populating as soon as the UI begins sending it (Day 4 work).
  - **Out of scope for Day 3:** the new `TurnMetrics` row at resume close (Edit 4 in Item 4) and `fin_ctx` invalidation (Edit 5). Both land in Day 4 alongside `useEngine.ts` plumbing for `executionDurationMs`.
- **Pending-action sweep cron:**
  - New route `app/api/cron/turn-metrics-pending-sweep/route.ts` — `*/5 * * * *`, `Authorization: Bearer ${CRON_SECRET}`, 15-minute timeout window, excludes `synthetic: true` rows.
  - `vercel.json` updated to register the cron alongside the existing `turn-metrics-cleanup` job.
- **Env wiring:**
  - `.env.example` documents both `CRON_SECRET` (was undocumented; the cleanup cron has been depending on it implicitly) and `SYNTHETIC_SESSION_PREFIXES` (the route consumer for this lands in Day 4 with the resume-close TurnMetrics row write).

### Build-time deltas from spec text

- **Engine attemptId — `node:crypto` import, not global `crypto`.** The `packages/engine/` tsconfig targets ES2022 with no DOM lib, so `globalThis.crypto.randomUUID()` is not in the type domain. Used `import { randomUUID } from 'node:crypto'` — same runtime, type-safe.
- **`onPendingAction(attemptId?)` not `onPendingAction(attemptId: string)`.** Spec text required the argument; implementation makes it optional and short-circuits on falsy input. The collector has historically never thrown from a callback (instrumentation must never block a chat response) and changing that invariant for one callback is the wrong precedent. Behaviourally identical for all real call sites — chat route passes the engine's stamped id unconditionally.
- **`build({ synthetic, turnPhase })` arguments are optional, not required.** Defaults: `synthetic: false`, `turnPhase: 'initial'`. Lets future call sites adopt the new fields without touching every existing caller in one CL. Chat route passes both explicitly.
- **`cacheSavingsUsd` floored at 0.** Spec didn't require this; added defensively so a future model-rate regression where `cacheRead > input` doesn't push negative savings into dashboards.
- **Resume route preserves the legacy `(sessionId, turnIndex)` updateMany as a defensive fallback** when the rehydrated `PendingAction` lacks `attemptId`. Pre-v1.4.2 sessions persisted before the engine stamping change rehydrate without the field; without the fallback their pending-action outcome would silently never get written. Branch is dead code once session TTL rotates them out — delete in Day 4.

### Open-on-deploy items

- **Apply the deploy SQL block** above against NeonDB. Run order:
  1. `BEGIN…COMMIT` schema migration block above (adds the 6 new columns + index, additive).
  2. Backfill block from the **canonical Migration sequence** at lines 1858–1865 of the spec body — `UPDATE "TurnMetrics" SET synthetic = true WHERE "sessionId" = 's_1777047351366_d172f3de05f0';` (255 rows) and `UPDATE "TurnMetrics" SET "turnPhase" = 'initial' WHERE "turnPhase" IS NULL;`. This MUST run after the schema migration and before enabling the pending-sweep cron — otherwise the bot's pending rows get retroactively timed out.
  3. Post-run column verification SELECT from lines 1869–1877.
- **Set `SYNTHETIC_SESSION_PREFIXES=s_1777047351366` in the Vercel project env.** Day 3 ships the consumer in the chat route — without the env var the going-forward bot sessions would still write `synthetic = false` rows (the historical 255 rows are covered by the manual UPDATE above, but the bot will keep starting new sessions until it's reconfigured). One-line env set, no redeploy needed.
- **Publish `@t2000/engine` v0.46.17** so audric/apps/web can pick up `PendingAction.attemptId`. Currently 6 typecheck errors block the audric build: 3 are the new `attemptId` references on the published `PendingAction`, 3 are pre-existing carries from the Day 1 BlockVision refactor (`AddressPortfolio`, `blockvisionApiKey` on `EngineConfig`, an `Expected 1 arguments` mismatch). All six clear in one move at the Day 5 republish step.
- **Configure the test harness to emit a stable session-id prefix** (e.g. `s_synthetic_` / `s_botcheck_`) so `SYNTHETIC_SESSION_PREFIXES` stays honest without manual updates as the bot rotates session keys. Day 3 follow-up tracked in Fix 3c.

### Tests run locally (this session)

- `pnpm --filter @t2000/engine test` — **439/439 passing** (incl. two new `attemptId` regression tests).
- `pnpm --filter @t2000/engine typecheck` — clean.
- `audric/apps/web` `vitest run lib/engine/__tests__/{synthetic-sessions,harness-metrics,intent-dispatcher,dispatch-intents}.test.ts` — **184/184 passing** (11 new synthetic-sessions tests + 173 existing).
- `audric/apps/web` `tsc --noEmit` — **6 expected errors**, all unblocked by the Day 5 engine republish (3 attemptId + 3 pre-existing Day 1 carries). No regressions introduced by Stream A.

### Audit findings (post-Day-3 self-review)

A self-audit against this spec body uncovered one HIGH-severity gap and three LOW-severity observations. The HIGH was fixed in the same Day-3 batch; the LOWs are documented for Day 4/5 follow-up.

- **[H-1] Chat route hardcoded `synthetic: false` instead of deriving from `SYNTHETIC_SESSION_PREFIXES`.** Spec text (line 768 + spec map line 2080) calls for `synthetic: isSynthetic`; first pass shipped the literal because the chat route is user-prompt-driven for human traffic. The bot session backfill (`s_1777047351366_d172f3de05f0`, 255 rows) hits the chat route, so the env var was orphaned and going-forward bot sessions would still write `synthetic = false`. **Fix shipped in Day 3:** new `lib/engine/synthetic-sessions.ts` module exporting `isSyntheticSessionId`, threaded into `collector.build({ synthetic: isSyntheticSessionId(sessionId) })`. Extracted to a shared module so the resume route's Day-4 wire-up uses the *same* derivation by construction.
- **[L-1] `PendingAction.attemptId: string` typed required, runtime fallback in resume route checks for falsy.** TypeScript-correct (empty string is falsy, assignable to `string`) but semantically suspect. The fallback exists for in-flight pre-v1.4.2 sessions persisted to Redis before the engine started stamping the field; clears naturally within 24h via session TTL. **Action:** delete the legacy branch in Day 4 once session rotation has completed.
- **[L-2] `app/api/prices/route.ts` (audric web wallet UI price endpoint) still uses DefiLlama directly.** Out of v1.4 scope — the spec's DefiLlama deletion targets the engine harness only. Worth tracking as a future migration candidate to BlockVision for portfolio-route parity.
- **[L-3] `protocol_deep_dive` retains its DefiLlama dep.** Intentional per spec line 1883 ("lone DefiLlama production dependency"). No action.

---

*Spec 2 locked at v1.4.2 with Day 3 Stream A shipped (incl. H-1 audit fix). Stream B (DefiLlama deletion + prompt/UI cleanup, pulled-forward Day 4 H-1..H-6) shipped in the same Day-3 batch. Day 4 unblocked: resume-close TurnMetrics row + fin_ctx invalidation + `useEngine.ts` `executionDurationMs` plumbing + import `isSyntheticSessionId` in resume route.*

---

## v1.4.2 — Day 4 status (informational)

Day 4 (Item 4 — resume route instrumentation) shipped end-to-end against the v1.4.1 spec body. Stream B (DefiLlama deletion + prompt/UI cleanup) was pulled forward into Day 3, so Day 4 was scoped to the resume-route rewrite, the fin_ctx invalidator slice, and the `useEngine.ts` / `UnifiedTimeline.tsx` `executionDurationMs` plumbing. Below is the build-time delta from spec text plus the open-on-deploy items.

### Shipped

- **Resume route — full rewrite (`app/api/engine/resume/route.ts`):**
  - **[G3]** Replaced `engineToSSE(...)` wrapper with raw-event iteration (`for await (const event of engine.resumeWithToolResult(action, { approved, executionResult }))`). Each event is serialized via `serializeSSE(event)` immediately before enqueueing — same shape as `chat/route.ts:433-493`. The wrapper is now unused inside the route; the only remaining import is the engine's `serializeSSE`.
  - **`TurnMetricsCollector` wired** for `text_delta` (first-text-delta latency), `tool_start`, `tool_result` (with `detectTruncation` / `detectRefinement` / `wasEarlyDispatched` / `resultDeduped` mirrors of the chat-route taps), `usage`, `compaction`, `pending_action`, and the engine-internal `__deduped__` marker (flips `resultDeduped` on the prior tool row instead of recording a new one).
  - **[M3]** `onMeta` callback passed to `createEngine({...})` to capture `{ effortLevel, modelUsed }` once. `onGuardFired` callback also wired so resume-turn guard activity surfaces in the resume row's `guardsFired` (rare but real — chained writes in a resume turn re-trigger the same guard chain as the initial turn).
  - **[G13]** `pendingAction` is now captured directly from `event.action` in the `pending_action` branch — replaces the regex-extraction path on the SSE chunk that v1.3.1 used. Existing `setConversationState` transition (`awaiting_confirmation` if a chained pending action surfaced, `idle` otherwise) and session-store `pendingAction` write in the `finally` block are preserved verbatim.
  - **Edit 4 — new `TurnMetrics` row at close.** After the loop, the route builds a row via `collector.build({ ..., turnIndex: action.turnIndex, contextTokensStart: priorMsgCount, synthetic: isSyntheticSessionId(sessionId), turnPhase: 'resume' })`, computes `estimatedCostUsd` via `costRatesForModel(modelUsed)`, and writes the row with the chat-route `JSON.parse(JSON.stringify(...))` serialization pattern for `toolsCalled` / `guardsFired`. Failure is fire-and-forget — instrumentation must never block a chat response. `turnIndex: action.turnIndex` (NOT `priorMsgCount`) is the spec-mandated value (line 1066) — the resume row shares its `turnIndex` with the originating chat row so `(sessionId, turnIndex)` joins return both phases of the same turn. First-pass shipped `priorMsgCount` and was corrected during the Day-4 self-audit (see Audit findings below).
  - **Edit 5 — `invalidateUserFinancialContext(address)` wired** inside the existing post-write `if (resolvedOutcome === 'approved' || 'modified')` block, alongside the existing `incrementSessionSpend` call. Cache key is `address` per v1.4 — B1 (universally available across routes; no DB lookup needed for `userId` translation).
- **fin_ctx invalidator slice (`lib/redis/user-financial-context.ts`, new):**
  - Day-4-only slice: ships the `invalidateUserFinancialContext(address)` half of the contract. `getUserFinancialContext(address)` reader, the `UserFinancialContext` Prisma model, and the dual-key indirection table (Day 5 — Item 6) layer on top in Day 5.
  - Single Redis `DEL` keyed on `fin_ctx:${address}`. Fail-open on every error path (transport / serialization / unknown), short-circuits on falsy address. Address passed through verbatim — no normalization in the helper, so reads/writes/invalidations all use the same key shape.
  - 5 unit tests (`lib/redis/__tests__/user-financial-context.test.ts`): DEL key shape, falsy short-circuit, transport error swallow, no-rejection-leaks, address verbatim.
- **`useEngine.ts:resolveAction` (`hooks/useEngine.ts`):**
  - **[m1]** New trailing parameter `executionDurationMs?: number`. When set (and finite ≥0), forwarded into the existing `attemptStream('/api/engine/resume', body)` body — *not* a refactor to raw `fetch`. Optional spread keeps the body shape stable for deny / timeout / pre-validation-fail paths that skip `onExecuteAction` entirely.
- **`UnifiedTimeline.tsx:handleActionResolve` (`components/dashboard/UnifiedTimeline.tsx`):**
  - Wraps the `await onExecuteAction(action.toolName, effectiveInput)` call with `Date.now()` markers; passes the measured `executionDurationMs` to `engine.resolveAction(...)` on both success and failure paths. The column carries "how long the user waited" regardless of outcome — what dashboard p95s want.

### Build-time deltas from spec text

- **`onGuardFired` is an extension over the literal Edit 2 list.** The spec's collector-event list for the resume route stops at `pending_action`. Wired guards anyway because (a) chained writes in a resume turn re-trigger the same guard chain as the initial turn, and (b) keeping the resume-row's `guardsFired` shape identical to the initial-row's makes dashboard rollups (`SUM(jsonb_array_length(guardsFired))`) trivially compose across both phases. Zero downside — the callback is a no-op when guards don't fire.
- **`turnPhase: 'resume'` was already in the collector contract from Day 3.** The Day-3 patch made `turnPhase` an optional `build` argument with a default of `'initial'`; Day 4 just passes the literal `'resume'` from the resume route. No collector changes were needed.
- **Legacy `(sessionId, turnIndex)` updateMany fallback retained, NOT deleted.** Day 3's footer flagged the branch for deletion in Day 4 ("Branch is dead code once session TTL rotates them out"). On audit during Day 4, deletion was reversed: the engine-published `attemptId`-stamping change ships in Day 5. Until Day 5 is deployed the resume route runs against the published engine which doesn't stamp the field, so every in-flight `PendingAction` rehydrates without an `attemptId` and the legacy branch is the *only* path that fires. Branch will become dead code 24h after the Day 5 engine republish; safer to delete in a Day-6+ cleanup CL than to introduce a window where pending-action telemetry silently drops on the floor.
- **fin_ctx invalidator-only Day-4 slice, not the full module.** Spec line 1123 ("`invalidateUserFinancialContext(address)` is a thin helper added in `audric/apps/web/lib/redis/user-financial-context.ts`. … See Item 6 for the full helper.") and Day 5 task list both confirm the read side + Prisma model land in Day 5. Shipped only the deletion half so the resume route compiles + dashboards see fresh balances after a write *now*. Layering the read on top in Day 5 won't churn the resume route.
- **`executionDurationMs` measured in `UnifiedTimeline.handleActionResolve`, not `useEngine.resolveAction`.** Spec text (line 925-927) shows the timer wrapping `await handleExecuteAction(...)` inside `resolveAction`. In the live codebase the execution itself happens upstream — the timeline component calls `onExecuteAction` and feeds the result into `engine.resolveAction(...)`. Measuring inside the hook would require restructuring so the hook owns the executor (a much larger refactor for zero observability gain). Plumbed the timing as a 6th parameter on `resolveAction` instead; semantically identical, far smaller diff.

### Open-on-deploy items

Day 4 ships against the same NeonDB + Vercel env as Day 3, so the deploy ladder for v1.4.2 is unchanged from the Day-3 footer:

- **Apply the Day-3 schema migration** (block at lines 2245-2288 of the spec footer) if not yet applied. The Day-4 resume row write depends on the 5 new `TurnMetrics` columns + `attemptId` index. Day-4 doesn't add new SQL.
- **Apply the bot-session backfill** (`UPDATE "TurnMetrics" SET synthetic = true WHERE "sessionId" = 's_1777047351366_d172f3de05f0';` + `UPDATE "TurnMetrics" SET "turnPhase" = 'initial' WHERE "turnPhase" IS NULL;`) — same dependency as Day 3.
- **Set `SYNTHETIC_SESSION_PREFIXES=s_1777047351366` in the Vercel project env** — Day 3 footer item, now also consumed by the Day-4 resume route. Without it the resume route writes `synthetic: false` on bot turns and the chat-row + resume-row pair disagrees on the bit (dashboards can detect the disagreement; safer to just set the env var).
- **Publish `@t2000/engine` v0.46.17** at Day 5. Until then the resume route's `event.action.attemptId` typecheck-errors (3 references in `resume/route.ts`, plus the existing 1 in `chat/route.ts` + 3 pre-existing Day-1 BlockVision carries from `engine-factory.ts`). All 7 clear at Day-5 republish in one move.
- **No new Vercel cron registration.** Day 4 doesn't add scheduled jobs; the Day-3 `turn-metrics-pending-sweep` cron continues to cover stale-pending-row cleanup.
- **Day-5 follow-ups land on top of this slice:**
  - `getUserFinancialContext(address)` reader + `UserFinancialContext` Prisma model + dual-key indirection table (Item 6).
  - Cron writer for the daily fin_ctx snapshot.
  - Prompt-time injection of the cached fin_ctx block in `engine-context.ts`.

### Tests run locally (this session)

- `pnpm --filter @t2000/engine test` — **439/439 passing** (no new engine tests; Day-4 work is host-side).
- `pnpm --filter @t2000/engine typecheck` — clean.
- `audric/apps/web` `vitest run` — **527/527 passing** across 27 test files (5 new fin_ctx invalidator tests + 11 synthetic-sessions tests + 28 harness-metrics + the rest of the existing suite). Initial run hit one flake on `route.integration.test.ts:190` (borrow integration test, unrelated to Day 4 changes); re-run was clean. Re-run after H4-1 fix: still **527/527**.
- `audric/apps/web` `tsc --noEmit` — **7 expected errors** (was 6 in Day 3): the Day-3 carry of 4 `PendingAction.attemptId` references + 3 pre-existing Day-1 BlockVision carries (`AddressPortfolio` / `blockvisionApiKey` / `Expected 1 arguments`). Day-4 added one `attemptId` reference in the resume route's new raw-event iteration (`event.action.attemptId`), bringing the count to 7. All 7 clear at Day-5 engine republish.
- `audric/apps/web` `next lint --dir lib/redis --dir app/api/engine/resume --dir hooks --dir components/dashboard --dir lib/engine` — clean (one pre-existing `react-hooks/exhaustive-deps` warning on `components/dashboard/ActivityFeed.tsx:78` is unrelated to Day 4).

### Audit findings (post-Day-4 self-review)

A self-audit against this spec body uncovered one HIGH-severity gap and three LOW-severity observations. The HIGH was fixed in the same Day-4 batch; the LOWs are documented for Day 5/6 follow-up.

- **[H4-1] Resume row `turnIndex` set to `priorMsgCount` (total message count) instead of spec-mandated `action.turnIndex` (assistant-message count).** Spec line 1066 explicitly calls for `turnIndex: action.turnIndex`; first pass shipped `priorMsgCount` rationalized as "matching chat-route convention." The rationalization was wrong on two counts: (1) the chat row's `turnIndex` is `engine.getMessages().filter(m => m.role === 'assistant').length` (chat/route.ts:225) — assistant-only count, not total — so my "matching chat-route convention" comment was incorrect; (2) the engine stamps `action.turnIndex` at yield time using the same assistant-only definition (engine.ts:1158), meaning `action.turnIndex` IS the chat row's `turnIndex`. Writing `priorMsgCount` would put the resume row at a much higher index than the originating chat row, breaking `(sessionId, turnIndex)` joins that dashboards use to compose initial+resume phases of the same turn. **Fix shipped in Day 4:** swapped `resumeTurnIndex` (= `priorMsgCount`) for the spec-mandated `action.turnIndex`, deleted the stale local variable, and updated the comment to explain the assistant-only semantics + cite engine.ts:1158 + chat/route.ts:225 as the canonical references.
- **[L4-1] Originating-row `updateMany` placed in the `finally` block, not pre-engine.** Spec assembled-shape (line 1154-1165) puts the `updateMany` BEFORE `createEngine`, which is more defensive — fires even on engine init failure. Day-3 placed it in the finally block (matching the v1.3.1 production code) and Day-4 didn't move it. Practical impact is small (engine init rarely fails after a successful auth + session load), but a Day-6+ cleanup CL should consider moving it pre-engine to align with spec text and harden the deploy-window-failure case.
- **[L4-2] No `narrationParts` / `detectNarrationTableDump` wiring in resume route.** Chat route (chat/route.ts:514-528) collects narration text and runs the v0.46.6 markdown-table-in-narration detector. Resume route doesn't. Spec doesn't require it for resume, but it would catch the same class of bug for chained-write narration. Defer to a future polish CL.
- **[L4-3] Limited new-test coverage.** Day-4 added 5 unit tests on the fin_ctx invalidator. No new tests cover (a) `useEngine.resolveAction` forwarding `executionDurationMs`, (b) `UnifiedTimeline.handleActionResolve` measuring the duration, (c) the resume route's new `TurnMetrics` row write or fin_ctx invalidation chain. The audric web app currently has no React-hook or component tests in its suite, and no engine-route integration tests exist (only `transactions/prepare/route.integration.test.ts` covers a route end-to-end). Ship deferred to a Day-6+ test-infra CL that introduces the necessary mock scaffolding for engine-route integration tests; manual deploy verification covers the gap in the meantime.

---

*Spec 2 locked at v1.4.2 with Day 4 shipped end-to-end (incl. H4-1 audit fix). Day 5 unblocked: BlockVision portfolio API consolidation + UserFinancialContext model + cron writer + reader + prompt-time injection + the engine republish that clears the 7 carry typecheck errors.*

---

## v1.4.2 — Day 5 status (informational)

Day 5 (Spec Item 5 `cacheSavingsUsd` per-model formula + Spec Item 6 `UserFinancialContext` model + cron + reader + prompt-time injection + the engine republish bundle) shipped end-to-end against the v1.4.1 spec body. Below is the build-time delta from spec text plus the open-on-deploy items.

### Shipped

- **Spec Item 5 — `cacheSavingsUsd` per-model formula (`lib/engine/harness-metrics.ts`):**
  - Already in place from the Day 3 collector slice — `build({...})` derives `cacheSavingsUsd = max(0, cacheReadTokens × (input − cacheRead))` via `costRatesForModel(modelUsed)` per model, not hardcoded Sonnet. Day 5 audited the call site, confirmed parity with the spec formula, and added regression coverage in the new financial-context-block test (no engine code change required).
- **Schema (Prisma `schema.prisma`, audric/apps/web):**
  - New `UserFinancialContext` model with **dual-key** by design (`userId @unique` cuid + `address @unique` Sui wallet). Both columns indexed via `@unique` so callers in either path (engine boot has `address`, audric internal API has both) hit a single row without a JSON scan. Per [v1.4 — M5'] no redundant `@@index` lines added; Prisma's implicit indexes on `@unique` cover both lookups.
  - Columns: `savingsUsdc Float`, `debtUsdc Float`, `walletUsdc Float`, `healthFactor Float?`, `currentApy Float?`, `recentActivity String`, `openGoals Json`, `pendingAdvice String?`, `daysSinceLastSession Int`, `generatedAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
  - `prisma generate` run locally; `lib/generated/prisma/` regenerated. **No** migration applied — `DATABASE_URL` in `.env.local` points at hosted Neon and the deploy SQL must be applied as a deliberate step (block below).
- **Audric internal API (`app/api/internal/financial-context-snapshot/route.ts`, new):**
  - `POST` endpoint, `x-internal-key` validated against `T2000_INTERNAL_KEY`, `runtime: 'nodejs'`, `maxDuration: 300`. Active users defined as "any `SessionUsage` row in the last 30 days" — same convention as `notification-users` and the rest of the silent-infra crons.
  - Per-user, fans out to a single 5-key `Promise.all` against canonical sources: latest + previous-2 `PortfolioSnapshot` (for `savings/debt/wallet/healthFactor` + the activity delta), 3 most-recent active `SavingsGoal` rows (`openGoals`), single most-recent `AdviceLog` with `actedOn = false` (`pendingAdvice`), most-recent `SessionUsage.createdAt` (`daysSinceLastSession`).
  - `recentActivity` is a 1–2 phrase delta vs the previous snapshot ("Saved $X. Borrowed $Y." / "No changes since last snapshot." / first-time fallback "Savings: $Y USDC.") via `buildActivityFromSnapshots(latest, previous)`.
  - `upsert({ where: { userId }, ... })` writes BOTH `userId` and `address` so either lookup works on subsequent reads. Per-user errors are caught + counted; one bad user never aborts the loop.
  - Response shape `{ created, skipped, errors, total }`. Idempotent on rerun.
- **Cron writer (`apps/server/src/cron/jobs/financialContextSnapshot.ts`, new):**
  - Thin t2000-side shell mirroring `portfolioSnapshots` / `chainMemory` / `profileInference`. POSTs to the audric internal endpoint with `x-internal-key`; reports the JobResult `{ job: 'financial-context-snapshot', processed: total, sent: created, errors }`. Fail-soft (HTTP non-2xx → errors=1; network reject → errors=1; never throws). 7 unit tests in `financialContextSnapshot.test.ts`: URL shape, header shape, JobResult mapping, HTTP failure, network failure, env fallback (`AUDRIC_INTERNAL_URL` unset), empty-pool zero counts.
  - Registered in `apps/server/src/cron/index.ts` at `HOUR_FIN_CTX = 2` UTC. Comment cites the actual semantic: 02:00 UTC is 19h after the *prior* calendar day's portfolio-snapshot at 07 UTC, so the freshest available portfolio rows feed the financial-context derivation. (First-pass comment claimed "5h after" — corrected on the same day; `7 + 5 = 12 ≠ 2`.)
- **Read-through cache (`audric/apps/web/lib/redis/user-financial-context.ts`, extended):**
  - Day 4 shipped only `invalidateUserFinancialContext(address)`. Day 5 added the read half: `getUserFinancialContext(address)` and the `FinancialContextSnapshot` wire shape consumed by the engine prompt builder.
  - Read flow: `redis.get<FinancialContextSnapshot>('fin_ctx:${address}')` → on miss/error fall through to `prisma.userFinancialContext.findUnique({ where: { address } })` → on miss/error return `null` → on hit cache for 24h. `null` from the public function means "skip the `<financial_context>` section" — brand-new users (whose first cron tick hasn't run) get a clean prompt, no error, no empty block.
  - Fail-open at every layer: Redis transport errors, Prisma transport errors, and Redis cache-write errors all `console.warn` + degrade to the next-best result without throwing. Instrumentation must never block a chat response.
  - 13 unit tests in `lib/redis/__tests__/user-financial-context.test.ts` (8 new for `getUserFinancialContext` + the 5 existing for the invalidator): cache hit, cache miss → Prisma fallback → re-cache, brand-new user, empty address short-circuit, Redis read failure → fail-open Prisma fallback, Prisma read failure → null, non-array `openGoals` defensive filter, cache-write failure swallowed.
- **Prompt-time injection (`audric/apps/web/lib/engine/engine-context.ts`):**
  - New `buildFinancialContextBlock(snapshot)` helper renders the snapshot into a XML-shaped `<financial_context>...</financial_context>` block with savings / wallet / debt (2dp), conditional health factor + APY (2dp), conditional open goals (`;`-joined), conditional last advice (suppressed when `actedOn`), recent activity, and `daysSinceLastSession` rendered as `Today` / `Yesterday` / `Nd days ago`. Trailing instruction tells the LLM to use the block for orientation and **not** re-derive numbers via tool calls unless the user explicitly asks for current data. Empty input → empty string (no null pollution).
  - `buildDynamicBlock({...})` accepts `financialContext?: FinancialContextSnapshot | null` and conditionally embeds the rendered block under a `## Daily orientation snapshot` section in the system-prompt body. `buildFullDynamicContext` thread-throughs the option.
  - 13 unit tests in `lib/engine/__tests__/financial-context-block.test.ts`: empty input, tag wrapping, USD/HF/APY formatting, conditional omissions (HF/APY/goals/advice), goal joining, day-since rendering for 0/1/N, and the trailing do-not-re-derive instruction always present.
- **Engine boot wiring (`audric/apps/web/lib/engine/engine-factory.ts`):**
  - `getUserFinancialContext(address)` joined the existing `Promise.all` block in `createEngine` so the lookup runs in parallel with MCP connect, server positions, wallet coins, swap tokens, goals, advice context, profile, and memories. Sub-ms on a Redis hit, one Prisma read on cold miss; engine-boot critical path doesn't gain a serial round-trip.
  - `financialContext` passed through to `buildFullDynamicContext({...})` so the cached snapshot lands in the system prompt at the same call site as the rest of the dynamic block.
- **`onAutoExecuted` chain (`engine-factory.ts`):**
  - Confirmed Day-1's `incrementSessionSpend` + Day-5's `invalidateUserFinancialContext(walletAddress)` both fire on every auto-tier write. `walletAddress` is populated by the engine from `config.walletAddress` and threaded into the callback. Both calls are fail-open (`.catch(() => null)`); failures `console.warn` but never propagate. Per [v1.4.1 — M4] no `engine.invalidateBalanceCache()` call — phantom API; `postWriteRefresh` already covers in-session balance freshness and `balance_check` is `cacheable: false`.
  - Confirm-tier `invalidateUserFinancialContext(address)` in `resume/route.ts` was already wired in Day 4 and is left unchanged. Both invalidation callsites (auto-tier + confirm-tier) now active.
- **Engine package version bump + republish:**
  - `packages/{sdk,engine,cli,mcp}/package.json` bumped `0.46.16` → `0.47.0` in lockstep (matches the existing `release.yml` workflow's source-of-truth strategy where sdk drives all four). The minor bump captures the bundled engine surface changes from v1.4: `blockvision-prices.ts` (new), `tools/token-prices.ts` (new), `tools/defillama.ts` (deleted, all 7 tools), `defillama-prices.ts` (deleted), `tools/balance.ts` rewritten against BlockVision, `tools/portfolio-analysis.ts` BlockVision price import, `tools/rates.ts` DefiLlama fallback removed, `ToolContext`: `blockvisionApiKey` + `portfolioCache`, `PendingAction.attemptId`, `EngineConfig.onAutoExecuted` extended with `walletAddress?`. Release flow: tag `v0.47.0` on `main` triggers `.github/workflows/publish.yml` which runs the full CI gate (build + typecheck + test on sdk/engine/mcp/cli + server typecheck + server tests) and then `pnpm publish` for each package. After npm propagation, audric/apps/web's `package.json` bumps to `"@t2000/engine": "0.47.0"` + `"@t2000/sdk": "0.47.0"` (pinned exact, matching the existing convention).

### Build-time deltas from spec text

- **Audric internal API as the single fan-out point, not per-user fetch from t2000.** Spec line 1916–1919 says "Write `financial-context-snapshot.ts` cron (writes both `userId` and `address`)" without specifying the fetch boundary. Day 5 mirrors the existing convention from `runPortfolioSnapshots` / `runChainMemory` etc.: the t2000 cron is a thin shell that calls a single audric internal endpoint, audric does the per-user fan-out + DB writes + error counting, and the cron logs aggregate JobResult counters. Keeps Prisma access centralized in audric, avoids cross-repo schema drift, and matches the deployed pattern users would expect to debug.
- **Cron schedule comment corrected on the same day.** First-pass comment in `cron/index.ts` claimed "five hours after `HOUR_DATA`"; arithmetic was wrong (`7 + 5 = 12 ≠ 2`). Corrected to "19h *after* the prior calendar day's `HOUR_DATA`". The schedule itself (02:00 UTC) matches spec line 1919; the semantic is "freshest available portfolio rows for previous calendar day, written before the next portfolio-snapshot run for the new day."
- **`currentApy` left as `null` in the cron writer.** Spec didn't pin a derivation source for this column. The audric internal endpoint stamps `currentApy: null` for now — the prompt-time renderer skips the `Current savings APY:` line when null, so brand-new users (and v1.4.2 deploy day) get a clean block. A Day-6+ enhancement should derive it from the most-recent `rates_info` MCP read or from the `PortfolioSnapshot` once that snapshot starts capturing per-asset APYs.
- **`recentActivity` lives in `app/api/internal/financial-context-snapshot/route.ts`, not a shared util.** Spec line 1304+ shows the activity computation conceptually but doesn't extract it. Inlined here because no other surface needs the same derivation; if a Day-6+ analytics view starts wanting the same string, extract then.
- **`engine.invalidateBalanceCache()` NOT added to the engine surface.** Per [v1.4.1 — M4] this was decided as a phantom API before Day 5; reaffirmed during the engine-bundle audit. The `onAutoExecuted` callback chain only fires `incrementSessionSpend` + `invalidateUserFinancialContext`. Engine `index.ts` exports unchanged on this front.
- **Lockstep bump of all four packages to 0.47.0, not just engine.** Spec line 1937 says "Bump engine to `0.47.0` (current `0.46.16`)". Existing `release.yml` workflow at `.github/workflows/release.yml:63` bumps sdk/engine/cli/mcp together with sdk as source-of-truth — every prior `📦 build: vX.Y.Z` commit touches all four package.jsons. Day 5 follows the existing convention; bumping engine alone would force a one-off divergence that downstream tooling (publish.yml, the discord notifier reading `packages/sdk/package.json`) doesn't handle.

### Open-on-deploy items

The Day-5 deploy ladder layers on top of Day 3 / Day 4. None of the prior deploy items are blocked by Day 5; Day 5 adds one new schema migration + one Vercel cron registration + one env var.

- **Apply the deploy SQL block below** against NeonDB (additive, single new table). Run order: (1) the schema block, (2) the post-run sanity SELECT.

```sql
-- v1.4.2 Day 5 / Spec Item 6 — UserFinancialContext daily orientation snapshot
-- Pre-run check: confirms the migration hasn't already been applied.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'UserFinancialContext';

BEGIN;

CREATE TABLE "UserFinancialContext" (
  "id"                   TEXT             NOT NULL,
  "userId"               TEXT             NOT NULL,
  "address"              TEXT             NOT NULL,
  "savingsUsdc"          DOUBLE PRECISION NOT NULL,
  "debtUsdc"             DOUBLE PRECISION NOT NULL,
  "healthFactor"         DOUBLE PRECISION,
  "walletUsdc"           DOUBLE PRECISION NOT NULL,
  "currentApy"           DOUBLE PRECISION,
  "recentActivity"       TEXT             NOT NULL,
  "openGoals"            JSONB            NOT NULL,
  "pendingAdvice"        TEXT,
  "daysSinceLastSession" INTEGER          NOT NULL,
  "generatedAt"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "UserFinancialContext_pkey" PRIMARY KEY ("id")
);

-- Dual-key by design: callers in the engine path only know `address`, but
-- joins to AdviceLog / SavingsGoal / PortfolioSnapshot need `userId`.
-- Both columns are unique → Prisma generates implicit indexes; no
-- explicit @@index needed (M5').
CREATE UNIQUE INDEX "UserFinancialContext_userId_key"  ON "UserFinancialContext"("userId");
CREATE UNIQUE INDEX "UserFinancialContext_address_key" ON "UserFinancialContext"("address");

COMMIT;

-- Post-run sanity check: confirm table + indexes landed.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'UserFinancialContext'
 ORDER BY ordinal_position;

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'UserFinancialContext';
```

  Rollback (SAFE before the cron has written any rows):

```sql
BEGIN;
DROP INDEX IF EXISTS "UserFinancialContext_address_key";
DROP INDEX IF EXISTS "UserFinancialContext_userId_key";
DROP TABLE IF EXISTS "UserFinancialContext";
COMMIT;
```

  Rollback becomes destructive once the cron starts upserting rows — at that point each row carries data the schema would lose on rollback. Plan accordingly.

- **Register the Day-5 cron in EventBridge / wherever t2000's `daily-intel` CRON_GROUP runs.** The hour `HOUR_FIN_CTX = 2` is hard-coded in `apps/server/src/cron/index.ts`; the EventBridge rule that triggers `CRON_GROUP=daily-intel` already runs every UTC hour, so registration is a no-op here — confirm the rule is hourly (not daily-at-07-only) and that `CRON_OVERRIDE_HOUR` isn't pinned to a single value in the deploy env.
- **Set `T2000_INTERNAL_KEY` parity** between the t2000 server env (`AUDRIC_INTERNAL_KEY`) and the audric web app env (`T2000_INTERNAL_KEY`). The shared secret is reused across `notification-users`, `portfolio-snapshot`, `chain-memory`, `profile-inference`, `memory-extraction`, and now `financial-context-snapshot`. If the secret is already set for the prior endpoints, no change needed.
- **`@t2000/engine@0.47.0` republish + audric pin:**
  1. Push tag `v0.47.0` on `main` (or run the `Release` workflow → `bump=minor` → bot creates the tag). `.github/workflows/publish.yml` triggers, runs the full CI gate (build / typecheck / test for sdk + engine + mcp + cli + server), then publishes all four packages to npm.
  2. Wait for npm propagation (typically <60s — `npm view @t2000/engine version` returning `0.47.0` is the green light).
  3. In `audric/apps/web/package.json` bump both `"@t2000/engine"` and `"@t2000/sdk"` from `0.46.16` to `0.47.0` (pin exact, matching the existing convention). Run `pnpm install --filter audric-web --no-frozen-lockfile` to update the lockfile.
  4. `pnpm typecheck` should now drop from 7 errors to 0 — the 4 `PendingAction.attemptId` references + 3 BlockVision carries (`AddressPortfolio`, `blockvisionApiKey`, `Expected 1 arguments`) all clear in one move.
- **Bot-session backfill + `SYNTHETIC_SESSION_PREFIXES` env** (Day-3 carry, still required if not yet applied).
- **Day-3 schema migration** (`AdviceLog.actedOn` + 5 `TurnMetrics` columns + `attemptId` index) MUST be in place before the Day-5 cron's `actedOn = false` filter runs, otherwise the audric internal endpoint will throw `column "actedOn" does not exist`.

### Tests run locally (this session)

- `pnpm --filter @t2000/sdk build` / `engine build` / `mcp build` / `cli build` — all clean.
- `pnpm --filter @t2000/{sdk,engine,mcp,cli} typecheck` — clean across all four packages at version `0.47.0`.
- `pnpm --filter @t2000/sdk test` — **391/391 passing**.
- `pnpm --filter @t2000/engine test` — **439/439 passing** (no new engine tests; Day-5 work is host-side + cron-side).
- `pnpm --filter @t2000/mcp test` — **91/91 passing**.
- `pnpm --filter @t2000/cli test` — **35/35 passing**.
- `pnpm --filter @t2000/server typecheck` — clean (prior `usdcSponsorLog` errors were stale Prisma client; resolved by `prisma generate` rerun).
- `pnpm --filter @t2000/server test` — **41/41 passing**.
- `pnpm --filter @t2000/server exec vitest run src/cron` — **11/11 passing** (4 scheduler + 7 new financialContextSnapshot).
- `audric/apps/web` `vitest run lib/redis` — **13/13 passing** (5 existing invalidator + 8 new `getUserFinancialContext`).
- `audric/apps/web` `vitest run lib/engine/__tests__/financial-context-block` — **13/13 passing** (new file covering the prompt renderer).
- `audric/apps/web` `tsc --noEmit` — **7 expected errors carried forward from Day 4** (4 `PendingAction.attemptId` + 3 BlockVision `AddressPortfolio` / `blockvisionApiKey` / `Expected 1 arguments`). All 7 clear at the engine republish + `pnpm add` step above; **no new errors introduced by Day 5**.

### Audit findings (post-Day-5 self-review)

A self-audit against this spec body flagged one MEDIUM-severity comment-accuracy bug (fixed in the same Day-5 batch) and three LOW-severity observations.

- **[M5-1] Cron schedule comment claimed "five hours after `HOUR_DATA`" when the actual offset is "19 hours after the prior calendar day's `HOUR_DATA`".** First pass shipped `HOUR_FIN_CTX = 2` with a comment derived from a misread of the arithmetic (`7 + 5 = 12 ≠ 2`). Spec line 1919 and 2096 mandate 02:00 UTC; the schedule itself was correct, but the comment misled future readers about which calendar day's portfolio-snapshot data feeds the cron. **Fix shipped in Day 5:** corrected the comment to cite the actual semantic ("19h after the prior calendar day's `HOUR_DATA`"). No code or schedule change.
- **[L5-1] `currentApy` left as a `null` literal in the cron writer.** No spec-mandated derivation source. Acceptable for v1.4.2 ship — the prompt renderer's conditional `if (snapshot.currentApy !== null)` skip means brand-new and v1.4.2 deploy-day users get a clean block. Day-6+ enhancement: derive from the most-recent `rates_info` MCP read or from a future per-asset-APY column on `PortfolioSnapshot`.
- **[L5-2] Audric internal endpoint trusts `latest?.savingsValueUsd ?? 0` even when `latest` is null (brand-new user, no portfolio-snapshot yet).** Writes a `UserFinancialContext` row of all zeroes for that user. Better than throwing, but the prompt block then says `Savings: $0.00 USDC` which is technically true but unhelpful. Day-6+ enhancement: skip the upsert entirely when `latest === null`, so the engine boot path falls through to `null` (clean prompt) instead of caching a meaningless zeroes row for 24h.
- **[L5-3] `getUserFinancialContext` re-caches even when the row was missing (no-op cache write).** Read-side guard `if (!row) return null;` short-circuits before the `redis.set` call, so this is actually correct behavior. Flagging only because the test suite covers the cache-write path on the happy-path branch but not the negative branch — a Day-6+ test addition could pin the no-write-on-miss invariant explicitly.

---

*Spec 2 locked at v1.4.2 with Day 5 shipped end-to-end (incl. M5-1 comment-accuracy fix). With the engine republish bundle + audric pin applied at deploy time, the v1.4.2 spec is fully landed: all 13 success criteria covered, 7 carry typecheck errors clear in one move, and the `<financial_context>` orientation block ships to every returning user without a tool call.*

