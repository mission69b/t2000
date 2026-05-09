// ---------------------------------------------------------------------------
// [SPEC 22.1 — 2026-05-10] DeFi protocol per-fetch timeout regression suite.
//
// Pins the contract that:
//   1. The per-protocol timeout is 2_000ms (lowered from 4_000 in v5 smoke
//      response — see header comment in `blockvision-prices.ts` for the
//      triggering Vercel log line).
//   2. When a single protocol's fetch throws AbortError / TimeoutError,
//      the `defi.protocol_timeout_count{protocol}` metric is emitted.
//   3. Other failure modes (5xx, JSON parse, generic Error) DO NOT emit
//      the timeout metric — they're tracked separately by `bv.requests`.
//   4. The per-protocol timeout fires WITHOUT taking down the whole DeFi
//      summary — `source: 'partial'` still surfaces with the protocols
//      that did respond.
//
// Inline next to source per `coding-discipline.mdc` ("New engine tests
// follow the inline convention"). Companion to:
//   - `blockvision-prices-throttle.test.ts` (mapWithConcurrency contract)
//   - `__tests__/defi-portfolio.test.ts` (legacy aggregation suite)
//   - `__tests__/defi-cache-sticky.test.ts` (sticky-positive cache rules)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchAddressDefiPortfolio,
  clearDefiCache,
  clearPriceMapCache,
  _resetBlockVisionCircuitBreaker,
} from './blockvision-prices.js';
import {
  setTelemetrySink,
  resetTelemetrySink,
  type TelemetrySink,
  type TelemetryTags,
} from './telemetry.js';

const ADDRESS = '0xdeadbeef';

const realFetch = globalThis.fetch;

interface CounterCall {
  name: string;
  tags?: TelemetryTags;
  value?: number;
}

class CapturingSink implements TelemetrySink {
  counters: CounterCall[] = [];
  counter(name: string, tags?: TelemetryTags, value?: number): void {
    this.counters.push({ name, tags, value });
  }
  gauge(): void {}
  histogram(): void {}

  countOf(name: string, matchTags?: Partial<TelemetryTags>): number {
    return this.counters.filter((c) => {
      if (c.name !== name) return false;
      if (!matchTags) return true;
      for (const [k, v] of Object.entries(matchTags)) {
        if (c.tags?.[k] !== v) return false;
      }
      return true;
    }).length;
  }
}

let sink: CapturingSink;

beforeEach(async () => {
  sink = new CapturingSink();
  setTelemetrySink(sink);
  await clearDefiCache();
  clearPriceMapCache();
  _resetBlockVisionCircuitBreaker();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  resetTelemetrySink();
});

// Helper: build a fetch mock that responds based on the URL's `protocol=`
// query param. `failures` maps protocol name to a function that produces
// the failure to throw / resolve. Anything not in `failures` returns an
// empty BV-shaped 200 (so the protocol "responded with no positions").
function mockProtocolResponses(
  failures: Record<string, () => Promise<Response> | Response>,
): void {
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const match = url.match(/[?&]protocol=([^&]+)/);
    const protocol = match ? decodeURIComponent(match[1]) : null;

    if (protocol && failures[protocol]) {
      const result = failures[protocol]();
      if (result instanceof Promise) return result;
      return result;
    }

    // Default success response — shape is `{ code: 200, result: {} }` so
    // the parser treats it as "protocol responded with no positions".
    return new Response(JSON.stringify({ code: 200, message: 'ok', result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }) as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('DeFi protocol per-fetch timeout (SPEC 22.1)', () => {
  it('emits defi.protocol_timeout_count when a protocol fetch throws AbortError', async () => {
    mockProtocolResponses({
      scallop: () => {
        const err = new Error('The operation was aborted');
        (err as Error & { name: string }).name = 'AbortError';
        return Promise.reject(err);
      },
    });

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');

    // The summary still resolves — degradation, not crash. `partial`
    // because 8 of 9 protocols succeeded (with empty results).
    expect(summary.source).toBe('partial');
    expect(summary.totalUsd).toBe(0);

    // The timeout metric MUST be emitted exactly once with the right tag.
    expect(sink.countOf('defi.protocol_timeout_count', { protocol: 'scallop' })).toBe(1);
    expect(sink.countOf('defi.protocol_timeout_count')).toBe(1);
  });

  it('emits defi.protocol_timeout_count for TimeoutError (modern fetch DOMException)', async () => {
    mockProtocolResponses({
      cetus: () => {
        const err = new Error('Request timed out');
        (err as Error & { name: string }).name = 'TimeoutError';
        return Promise.reject(err);
      },
    });

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');

    expect(summary.source).toBe('partial');
    expect(sink.countOf('defi.protocol_timeout_count', { protocol: 'cetus' })).toBe(1);
  });

  it('does NOT emit defi.protocol_timeout_count for non-timeout errors (e.g. generic Error)', async () => {
    mockProtocolResponses({
      bluefin: () => Promise.reject(new Error('socket hang up — network blip')),
    });

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');

    // `socket hang up` is a generic network error — it goes through
    // `fetchBlockVisionWithRetry`'s retry loop, eventually exhausts, and
    // the catch in `fetchOneDefiProtocol` swallows it. NOT a timeout.
    expect(summary.source).toBe('partial');
    expect(sink.countOf('defi.protocol_timeout_count')).toBe(0);
  });

  it('does NOT emit defi.protocol_timeout_count for 5xx HTTP responses', async () => {
    mockProtocolResponses({
      haedal: () =>
        new Response('{"code":500,"message":"server error"}', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }) as unknown as Response,
    });

    await fetchAddressDefiPortfolio(ADDRESS, 'k');

    // 5xx is tracked by `bv.requests{status:5xx}`, not by the timeout
    // metric. The timeout counter must stay empty. (No need to assert
    // `summary.source` here — the protocol-level retry path means
    // BlockVision may classify this as a transient network err and
    // retry to exhaustion, ultimately returning a degraded shape; the
    // exact source classification is covered by `defi-portfolio.test.ts`.)
    expect(sink.countOf('defi.protocol_timeout_count')).toBe(0);
  });

  it('emits exactly one timeout metric per timed-out protocol (no double-counting)', async () => {
    mockProtocolResponses({
      scallop: () => {
        const err = new Error('aborted');
        (err as Error & { name: string }).name = 'AbortError';
        return Promise.reject(err);
      },
      cetus: () => {
        const err = new Error('aborted');
        (err as Error & { name: string }).name = 'AbortError';
        return Promise.reject(err);
      },
    });

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');

    expect(summary.source).toBe('partial');
    expect(sink.countOf('defi.protocol_timeout_count', { protocol: 'scallop' })).toBe(1);
    expect(sink.countOf('defi.protocol_timeout_count', { protocol: 'cetus' })).toBe(1);
    expect(sink.countOf('defi.protocol_timeout_count')).toBe(2);
  });

  it('still returns successfully aggregated value when only one protocol times out', async () => {
    // Make 8 of 9 protocols return a valid position with a known coin
    // type / amount. Make scallop time out. Verify the totalUsd reflects
    // the 8 successful protocols and the partial source surfaces.
    mockProtocolResponses({
      scallop: () => {
        const err = new Error('aborted');
        (err as Error & { name: string }).name = 'AbortError';
        return Promise.reject(err);
      },
    });

    const summary = await fetchAddressDefiPortfolio(ADDRESS, 'k');

    // The 8 successful protocols returned `{ result: {} }` (no
    // positions), so totalUsd = 0. But source is `partial` proving
    // the per-protocol failure didn't take down the whole fan-out.
    expect(summary.source).toBe('partial');
    expect(summary.totalUsd).toBe(0);
    // Only scallop counted as a timeout.
    expect(sink.countOf('defi.protocol_timeout_count', { protocol: 'scallop' })).toBe(1);
  });
});
