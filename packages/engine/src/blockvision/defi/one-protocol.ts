// ---------------------------------------------------------------------------
// BlockVision per-protocol DeFi fetcher — single `/account/defiPortfolio`
// call for one protocol, with 2s timeout + retry + per-protocol-timeout
// telemetry.
//
// Carved out of the legacy `blockvision-prices.ts` (SPEC PIPELINE-AUDIT-
// PHASE-2 S1 / 2026-05-23) — PURE FILE SPLIT.
//
// [SPEC 22.1 — 2026-05-10] Lowered 4_000 → 2_000ms. With
// DEFI_PROTOCOL_CONCURRENCY=3, worst-case fan-out time when one or more
// protocols hang drops from 12s (3 batches × 4s) to 6s (3 batches × 2s).
//
// `defi.protocol_timeout_count{protocol}` is emitted from this helper so
// we can measure per-protocol timeout rates post-deploy. Healthy target:
// < 1% per protocol over 24h.
// ---------------------------------------------------------------------------

import { getTelemetrySink } from '../../telemetry.js';
import { BLOCKVISION_BASE, fetchBlockVisionWithRetry } from '../retry.js';
import type { DefiProtocol } from './protocols.js';

const DEFI_PORTFOLIO_TIMEOUT_MS = 2_000;

interface BlockVisionDefiResponse {
  code: number;
  message: string;
  result?: Record<string, unknown>;
}

export async function fetchOneDefiProtocol(
  address: string,
  protocol: DefiProtocol,
  apiKey: string,
  retryStats?: { attemptCount: number },
): Promise<Record<string, unknown> | null> {
  const url = `${BLOCKVISION_BASE}/account/defiPortfolio?address=${encodeURIComponent(address)}&protocol=${protocol}`;
  const signal = AbortSignal.timeout(DEFI_PORTFOLIO_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchBlockVisionWithRetry(
      url,
      {
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        signal,
      },
      { signal, retryStats },
    );
  } catch (err) {
    // [SPEC 22.1 — 2026-05-10] Distinguish AbortError (our 2s timeout
    // fired or upstream cancelled) from other failures so we can chart
    // per-protocol flakiness without conflating it with 5xx / network
    // errors that `bv.requests` already tracks. The DOMException name
    // check covers both `AbortError` (modern Fetch) and the legacy
    // DOMException variants Node emits.
    const errName = (err as { name?: string })?.name;
    if (errName === 'AbortError' || errName === 'TimeoutError') {
      getTelemetrySink().counter('defi.protocol_timeout_count', { protocol });
    }
    console.warn(`[defi] ${protocol} fetch threw:`, err);
    return null;
  }
  if (!res.ok) {
    console.warn(`[defi] ${protocol} HTTP ${res.status}`);
    return null;
  }
  let json: BlockVisionDefiResponse;
  try {
    json = (await res.json()) as BlockVisionDefiResponse;
  } catch (err) {
    console.warn(`[defi] ${protocol} JSON parse failed:`, err);
    return null;
  }
  if (json.code !== 200 || !json.result) return null;
  return json.result;
}
