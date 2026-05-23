// ---------------------------------------------------------------------------
// BlockVision DeFi protocol registry — the 9 protocols we aggregate.
//
// Carved out of the legacy `blockvision-prices.ts` (SPEC PIPELINE-AUDIT-
// PHASE-2 S1 / 2026-05-23) — PURE FILE SPLIT.
//
// [v0.50.2] 9 protocols — the v0.50 majors (Cetus/Suilend/Scallop/Bluefin/
// Aftermath/Haedal) plus three native-token stakings (Suistake/SuiNS-staking/
// Walrus). v0.50.1 expanded to all 26 BlockVision protocols, but the resulting
// 26-call burst caused the wallet `/account/coins` endpoint to occasionally
// 429, falling back to Sui-RPC degraded mode where non-stables are unpriced
// — so wallet display showed $0 for users with MANIFEST/FAITH/etc. holdings.
// 9 protocols = 9+1 burst per balance_check, comfortably below BV burst
// caps. Walker + bespoke shims stay as-is — adding a future protocol is a
// 1-line append here. Deliberately excludes NAVI (already covered by
// `savings_info` via positionFetcher / NAVI MCP — including would
// double-count savings).
// ---------------------------------------------------------------------------

export const DEFI_PROTOCOLS = [
  'aftermath',
  'bluefin',
  'cetus',
  'haedal',
  'scallop',
  'suilend',
  'suins-staking',
  'suistake',
  'walrus',
] as const;
export type DefiProtocol = (typeof DEFI_PROTOCOLS)[number];

// ---------------------------------------------------------------------------
// [S18-F4 / vercel-logs L11 — May 2026] Bounded-concurrency fan-out.
//
// The pre-fix code fired all 9 BlockVision per-protocol calls in parallel
// via `Promise.allSettled(DEFI_PROTOCOLS.map(...))`. At burst (e.g. 100
// concurrent dashboard loads), peak QPS = 100 × 9 = 900 req/s against a
// single BlockVision API key, well above the ~30 req/s/key soft cap.
// Result: rolling 429 cluster captured in the May 2026 vercel-logs triage,
// absorbed by `fetchBlockVisionWithRetry`'s exponential backoff but visible
// as user-facing latency spikes during dashboard auto-refresh windows.
//
// Fix: cap the per-portfolio fan-out at `DEFI_PROTOCOL_CONCURRENCY` in-flight
// requests. With concurrency=3, a single portfolio fetch becomes:
//   ceil(9 / 3) = 3 batches × ~200ms typical per-protocol latency = ~600ms
// vs. the pre-fix ~200ms fully-parallel case. The +400ms latency cost lands
// only on COLD-cache fetches (warm cache hits Upstash and skips the fan-out
// entirely). Peak burst QPS drops 3× (900 → 300), which combined with the
// per-instance fetchBlockVisionWithRetry circuit-breaker eliminates the 429
// cluster pattern while preserving cache-warming semantics.
// ---------------------------------------------------------------------------
export const DEFI_PROTOCOL_CONCURRENCY = 3;

// Exported for tests + downstream throttle benchmarking. Not part of the
// public engine API surface; reserve the right to inline this if a
// dedicated concurrency utility lands later.
export const __internal_DEFI_PROTOCOL_CONCURRENCY = DEFI_PROTOCOL_CONCURRENCY;
