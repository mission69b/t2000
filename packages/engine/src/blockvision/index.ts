// ---------------------------------------------------------------------------
// BlockVision Indexer REST API — wallet portfolio + multi-token price feed.
//
// Replaces the DefiLlama public price endpoint (`coins.llama.fi`) for both
// `balance_check` (full portfolio) and `portfolio_analysis` /
// `engine-factory` prompt-time price seeding (multi-token quotes).
//
// Two endpoints are wrapped here:
//
//   GET /v2/sui/account/coins         — full wallet portfolio + USD prices
//                                       (paid Pro-tier endpoint; one call)
//   GET /v2/sui/coin/price/list       — multi-token price list
//                                       (max 10 tokens per call; chunked
//                                        transparently if more are passed)
//
// Auth: `x-api-key` header. The shared API key is available as
// `process.env.BLOCKVISION_API_KEY` in the audric web app and is threaded
// into `ToolContext.blockvisionApiKey` via the engine factory.
//
// Failure mode: layered fallback. If BlockVision `/account/coins` returns
// 5xx, 429, or the `apiKey` is missing/blank we drop to a Sui-RPC path
// for the coin list, then [v0.50.3] still attempt the BlockVision
// `/coin/price/list` endpoint to USD-price non-stable holdings. Only when
// BOTH BV endpoints fail do we degrade to the hardcoded stable allow-list
// (USDC/USDT/USDe/USDsui get $1.00, everything else `null`). The two
// endpoints have separate rate limits and price-list responses are cached
// in-process for `CACHE_TTL_MS`, so the second call is frequently a hot
// hit. The `source` field on the returned portfolio surfaces the final
// path so callers can decide whether to badge "approximate" totals.
//
// ---------------------------------------------------------------------------
// LAYOUT (SPEC PIPELINE-AUDIT-PHASE-2 S1 / 2026-05-23)
//
// Pre-split: one 2009-LoC monolith at `packages/engine/src/blockvision-prices.ts`.
//
// Post-split (here):
//   blockvision/
//   ├── index.ts        — this file (public API re-export surface)
//   ├── retry.ts        — fetchBlockVisionWithRetry + circuit breaker
//   ├── wallet.ts       — fetchAddressPortfolio + Sui-RPC fallback
//   ├── prices.ts       — fetchTokenPrices + STABLE_USD_PRICES + chunking
//   ├── defi/
//   │   ├── index.ts        — fetchAddressDefiPortfolio aggregator
//   │   ├── protocols.ts    — DEFI_PROTOCOLS registry + concurrency cap
//   │   ├── walker.ts       — generic shape walker + toUsd helper
//   │   ├── normalizers.ts  — bespoke per-protocol shims
//   │   └── one-protocol.ts — single-protocol BV fetcher
//   └── admin.ts        — clear* helpers
//
// Back-compat: `packages/engine/src/blockvision-prices.ts` is now a
// one-line re-export of this index, so every existing internal +
// external (`@t2000/engine`) consumer keeps working with zero churn.
// ---------------------------------------------------------------------------

export {
  fetchBlockVisionWithRetry,
  _resetBlockVisionCircuitBreaker,
} from './retry.js';

export {
  type PortfolioCoin,
  type AddressPortfolio,
  fetchAddressPortfolio,
} from './wallet.js';

export { fetchTokenPrices } from './prices.js';

export {
  type DefiProtocol,
  __internal_DEFI_PROTOCOL_CONCURRENCY,
} from './defi/protocols.js';

export {
  type DefiSummary,
  fetchAddressDefiPortfolio,
  __internal_mapWithConcurrency,
} from './defi/index.js';

export {
  clearDefiCache,
  clearDefiCacheFor,
  clearPortfolioCache,
  clearPortfolioCacheFor,
  clearPriceMapCache,
} from './admin.js';
