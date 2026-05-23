// ---------------------------------------------------------------------------
// Audric canonical-API client.
//
// When the engine runs server-side inside the Audric Next.js host, every
// portfolio / history / price read should resolve through Audric's
// canonical fetchers (`audric/apps/web-v2/lib/portfolio.ts`; transaction-
// history is now an in-engine tool since v0.7e Phase 5) so that the LLM,
// the dashboard, and the daily cron all see identical numbers. This file
// is the engine's thin client for those routes.
//
// Activation: set `AUDRIC_INTERNAL_API_URL` (canonical) or fall back to
// `NEXT_PUBLIC_APP_URL`. When neither is available — e.g. CLI, MCP
// server, or any non-Audric embedding — the helpers return `null` and
// callers MUST use their existing in-engine path. This preserves the
// engine's standalone usability.
//
// S.269 item 4 (2026-05-23) deleted the legacy `T2000_AUDRIC_API` alias
// (typed-context path AND `process.env` fallback). Pre-deletion the
// alias was a dead path: every modern host (audric/web-v2) threads
// `AUDRIC_INTERNAL_API_URL` directly. Removing the alias cuts a tier
// of "I'll search both names" complexity from every call site.
//
// All calls inherit the request `AbortSignal` from `ToolContext.signal`
// so engine-level cancellation propagates to in-flight HTTP fetches.
// ---------------------------------------------------------------------------

import type { AddressPortfolio, DefiSummary, PortfolioCoin } from './blockvision-prices.js';
import type { ServerPositionData, ToolContextEnv } from './types.js';

const FETCH_TIMEOUT_MS = 6_000;

/**
 * Resolve the audric API base URL from the engine's env shim, falling
 * back to `process.env`. Returns `null` when no override is configured —
 * callers MUST treat this as "use in-engine fallback path".
 *
 * Lookup order (first defined wins):
 *   1. `env.AUDRIC_INTERNAL_API_URL`       — canonical typed-context path
 *   2. `process.env.AUDRIC_INTERNAL_API_URL`
 *   3. `process.env.NEXT_PUBLIC_APP_URL`   — last-ditch host hint
 */
export function getAudricApiBase(env?: ToolContextEnv): string | null {
  const fromEnv = env?.AUDRIC_INTERNAL_API_URL ?? null;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');

  const fromProcess =
    process.env.AUDRIC_INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    null;
  if (fromProcess && fromProcess.trim().length > 0) return fromProcess.replace(/\/$/, '');

  return null;
}

interface AudricPortfolioWire {
  address: string;
  netWorthUsd: number;
  walletValueUsd: number;
  walletAllocations: Record<string, number>;
  wallet: PortfolioCoin[];
  positions: {
    savings: number;
    borrows: number;
    savingsRate: number;
    healthFactor: number | null;
    maxBorrow: number;
    pendingRewards: number;
    supplies: Array<{ asset: string; amount: number; amountUsd: number; apy: number; protocol: string }>;
    borrowsDetail: Array<{ asset: string; amount: number; amountUsd: number; apy: number; protocol: string }>;
  };
  estimatedDailyYield: number;
  source: AddressPortfolio['source'];
  pricedAt: number;
  // [Bug — 2026-04-28] Surface DeFi from audric's canonical /api/portfolio.
  // Pre-fix the engine wire shape stripped these fields, so any tool that
  // resolved through the audric snapshot path (portfolio_analysis,
  // future timeline tools) silently dropped DeFi value from totals — even
  // though balance_check (which calls fetchAddressDefiPortfolio directly)
  // reported them correctly. Same SSOT-divergence class as the v0.54
  // FullPortfolioCanvas bug, manifesting in a different tool.
  // Optional on the wire so older audric deploys (pre-defi) don't error.
  defiValueUsd?: number;
  defiSource?: DefiSummary['source'];
}

export interface AudricPortfolioResult {
  /** Wallet half — directly compatible with the existing `AddressPortfolio` shape. */
  portfolio: AddressPortfolio;
  /** NAVI lending positions, normalized to the engine's `ServerPositionData`. */
  positions: ServerPositionData;
  /** Net worth derived audric-side (`wallet + savings + defi - borrows`). */
  netWorthUsd: number;
  /** `savings * savingsRate / 365`, capped at 0. */
  estimatedDailyYield: number;
  /** Per-symbol balance map — convenient for adapters that already used `WalletBalances`. */
  walletAllocations: Record<string, number>;
  /**
   * [Bug — 2026-04-28] Aggregated DeFi value (Cetus LPs, Bluefin, Suilend,
   * etc.) when available. `defiSource === 'degraded'` when audric's wire
   * didn't include the field — callers should treat that as "fall back to
   * a direct fetchAddressDefiPortfolio call" (same convention used
   * inside the audric web app's UI components).
   */
  defiValueUsd: number;
  defiSource: DefiSummary['source'];
}

/**
 * Fetch the canonical portfolio snapshot from audric. Returns `null` if
 * audric isn't configured for this runtime, or if the request fails for
 * any reason — callers MUST fall back to the in-engine BlockVision +
 * NAVI path on `null`.
 */
export async function fetchAudricPortfolio(
  address: string,
  env?: ToolContextEnv,
  signal?: AbortSignal,
): Promise<AudricPortfolioResult | null> {
  const base = getAudricApiBase(env);
  if (!base) return null;

  try {
    // [SPEC 23B-W1.1, 2026-05-11] Bypass Vercel Edge cache via a unique
    // query param per call.
    //
    // The audric `/api/portfolio` route ships a `Cache-Control: public,
    // s-maxage=15, stale-while-revalidate=30` header so its three
    // browser-side consumers (`useBalance`, `FullPortfolioCanvas`,
    // `WatchAddressCanvas`) get free CDN caching during normal browsing.
    // The engine, on the other hand, is the consumer that ABSOLUTELY
    // must see fresh data: `runPostWriteRefresh` invalidates the engine's
    // own Upstash wallet cache via `clearPortfolioCacheFor()` BEFORE
    // dispatching `balance_check`, but that invalidation lives inside
    // the audric route's process. The fetch issued from the engine still
    // hits Vercel CDN first, and within the s-maxage window the CDN
    // returns the prior turn's cached response WITHOUT EVER REACHING the
    // route — so the engine's own cache invalidation never has a chance
    // to take effect.
    //
    // Symptom in production (smokes 2026-05-11, Prompts 2): user
    // withdrew USDC from savings. PWR cluster fired ~5s later.
    // `BalanceCard` returned BYTE-IDENTICAL pre-withdraw values to the
    // prior bundle's PWR. `SavingsCard` (which goes through
    // `positionFetcher` directly, never the audric API) showed the
    // correct post-withdraw state.
    //
    // 1.28.2 attempted to fix this by sending `Cache-Control: no-cache`
    // as a request header. Empirical verification (3 sequential probes
    // against `/api/portfolio` from outside Vercel, 2026-05-11 06:13 UTC)
    // proved Vercel's Edge Network IGNORES request-side `no-cache`
    // headers — the cache HIT regardless of header presence. Per Vercel
    // docs, the only documented way to bypass the Edge Network cache is
    // via the URL key itself.
    //
    // 1.28.3 fix: append a per-call `_engineNoCache=<unix-ms>` query
    // param. Vercel keys its cache on the FULL URL including query
    // params, so each engine fetch produces a unique cache key → always
    // a CDN miss → always forwards to origin → engine sees the
    // freshly-invalidated wallet cache and returns fresh data.
    //
    // The audric route only reads `address` from `searchParams`; the
    // extra query param is ignored by the handler. Browser-side hooks
    // continue to use the `?address=...`-only URL and keep their CDN
    // cache benefit. The header is also kept (defence in depth in case
    // Vercel changes behaviour later).
    const cacheBuster = `_engineNoCache=${Date.now()}`;
    // [Day 20e / 2026-05-17] Attach `x-internal-key` so audric's
    // `authenticateAnalyticsRequest()` accepts the engine call server-side.
    // Pre-fix the engine silently 401'd here and fell back to the in-engine
    // BlockVision path — same numbers in the happy case, but a structural
    // SSOT bypass under degradation. Header is optional so older audric
    // deploys (single-auth `authenticateRequest`) still 401 cleanly and the
    // fallback kicks in.
    const internalKey = env?.AUDRIC_INTERNAL_KEY;
    const res = await fetch(
      `${base}/api/portfolio?address=${encodeURIComponent(address)}&${cacheBuster}`,
      {
        signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'Cache-Control': 'no-cache',
          ...(internalKey ? { 'x-internal-key': internalKey } : {}),
        },
      },
    );
    if (!res.ok) {
      console.warn(`[audric-api] portfolio ${address.slice(0, 10)} → HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as AudricPortfolioWire;

    const portfolio: AddressPortfolio = {
      coins: Array.isArray(json.wallet) ? json.wallet : [],
      totalUsd: json.walletValueUsd ?? 0,
      pricedAt: json.pricedAt ?? Date.now(),
      source: json.source ?? 'blockvision',
    };

    const positions: ServerPositionData = {
      savings: json.positions?.savings ?? 0,
      borrows: json.positions?.borrows ?? 0,
      savingsRate: json.positions?.savingsRate ?? 0,
      healthFactor: json.positions?.healthFactor ?? null,
      maxBorrow: json.positions?.maxBorrow ?? 0,
      pendingRewards: json.positions?.pendingRewards ?? 0,
      supplies: json.positions?.supplies ?? [],
      // The engine type calls this `borrows_detail`; audric's wire shape
      // calls it `borrowsDetail`. Normalize on the engine side so
      // downstream tools can keep their existing field names.
      borrows_detail: json.positions?.borrowsDetail ?? [],
    };

    return {
      portfolio,
      positions,
      netWorthUsd: json.netWorthUsd ?? portfolio.totalUsd + positions.savings - positions.borrows,
      estimatedDailyYield: json.estimatedDailyYield ?? 0,
      walletAllocations: json.walletAllocations ?? {},
      // Default to 'degraded' (not 'partial') when the wire shape lacks
      // DeFi: 'partial' implies "we tried and got partial data" which is
      // misleading for a route that simply doesn't return the field.
      // Callers that need DeFi must fall back to a direct fetch on
      // 'degraded' — exactly the convention BalanceCard already uses.
      defiValueUsd: typeof json.defiValueUsd === 'number' ? json.defiValueUsd : 0,
      defiSource: json.defiSource ?? 'degraded',
    };
  } catch (err) {
    console.warn(`[audric-api] portfolio ${address.slice(0, 10)} fetch failed:`, err);
    return null;
  }
}

interface AudricHistoryWireItem {
  digest: string;
  action: string;
  label?: string;
  direction?: 'in' | 'out';
  amount?: number;
  asset?: string;
  counterparty?: string;
  timestamp: number;
  gasCost?: number;
}

export interface AudricHistoryRecord {
  digest: string;
  action: string;
  label?: string;
  direction?: 'in' | 'out';
  amount?: number;
  asset?: string;
  /** Counterparty address (only set for transfers with a clear recipient). */
  recipient?: string;
  timestamp: number;
  date?: string;
  gasCost?: number;
}

/**
 * Fetch the canonical transaction history list from audric. Same fall
 * back contract as `fetchAudricPortfolio` — `null` means "use in-engine
 * Sui-RPC path". Audric's `/api/history` already merges `FromAddress` +
 * `ToAddress`, dedupes by digest, and parses Move calls via
 * `@t2000/sdk`'s shared parser, so the wire shape is a 1:1 match for the
 * engine's existing `TxRecord` once we rename `counterparty` →
 * `recipient`.
 */
export async function fetchAudricHistory(
  address: string,
  opts: { limit?: number },
  env?: ToolContextEnv,
  signal?: AbortSignal,
): Promise<AudricHistoryRecord[] | null> {
  const base = getAudricApiBase(env);
  if (!base) return null;

  const params = new URLSearchParams({ address });
  if (opts.limit != null) params.set('limit', String(opts.limit));

  try {
    // [SPEC 23B-W1.1, 2026-05-11] Same cache-bypass posture as
    // `fetchAudricPortfolio` (1.28.3). `/api/history` does NOT ship a
    // Cache-Control header today (verified 2026-05-11), so this is a
    // no-op against the CDN — but applied symmetrically with the
    // portfolio fetch so a future operator who adds caching to
    // `/api/history` for browser perf can't silently regress engine-side
    // freshness.
    params.set('_engineNoCache', String(Date.now()));
    // [Day 20e / 2026-05-17] See fetchAudricPortfolio — engine attaches
    // `x-internal-key` so the route's dual-auth accepts the call. Pre-fix
    // this silently 401'd and `transaction_history` fell back to the direct
    // Sui-RPC path, bypassing audric's canonical `getTransactionHistory()`.
    const internalKey = env?.AUDRIC_INTERNAL_KEY;
    const res = await fetch(`${base}/api/history?${params}`, {
      signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'Cache-Control': 'no-cache',
        ...(internalKey ? { 'x-internal-key': internalKey } : {}),
      },
    });
    if (!res.ok) {
      console.warn(`[audric-api] history ${address.slice(0, 10)} → HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { items?: AudricHistoryWireItem[] };
    const items = Array.isArray(json.items) ? json.items : [];

    return items.map((item) => ({
      digest: item.digest,
      action: item.action,
      label: item.label,
      direction: item.direction,
      amount: item.amount,
      asset: item.asset,
      recipient: item.counterparty,
      timestamp: item.timestamp,
      date: item.timestamp > 0 ? new Date(item.timestamp).toISOString() : undefined,
      gasCost: item.gasCost,
    }));
  } catch (err) {
    console.warn(`[audric-api] history ${address.slice(0, 10)} fetch failed:`, err);
    return null;
  }
}
