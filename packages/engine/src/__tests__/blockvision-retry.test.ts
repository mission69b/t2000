// ---------------------------------------------------------------------------
// Regression suite for the [Bug — 2026-04-28] BlockVision 429 retry wrapper.
//
// Pre-fix manifestation: a single BlockVision 429 — common during peak
// traffic windows because the Pro tier has both per-key and global edge
// throttles — cascaded through the whole stack on the same chat turn:
//   - balance_check's wallet read degraded to Sui-RPC ($0 for long-tail
//     tokens like FAITH/ZEN/etc that have no stable allow-list price)
//   - DeFi read returned `partial + 0`, then served stale-cache or empty
//   - portfolio_analysis trusted audric's `partial + 0` → no DeFi line
//   - the user saw three different totals on the same wallet on the
//     same screen ($229.92 / $620.87 / $0 DeFi)
//
// The retry wrapper absorbs the burst before any of that surfaces. Three
// attempts with jittered exponential backoff (250/750/2250ms ± 25%)
// covers the typical 1–3s BV throttle window. `Retry-After` honored
// when present (capped at 5s so a misbehaving header can't stall a
// tool past its per-call timeout budget).
//
// These tests use deterministic injected `sleep` + `rng` so the suite
// runs in milliseconds rather than seconds. The injected `sleep`
// records the requested delay so we can assert backoff math without
// actually waiting.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchBlockVisionWithRetry,
  _resetBlockVisionCircuitBreaker,
} from '../blockvision-prices.js';

const URL = 'https://api.blockvision.org/v2/sui/account/coins?account=0x1bf820';
const HEADERS = { 'x-api-key': 'test-key', accept: 'application/json' };

function mockResponse(status: number, headers: Record<string, string> = {}, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('fetchBlockVisionWithRetry', () => {
  // Typed as `any` because vi.spyOn's generic resolution on `fetch`
  // produces a `MockInstance<(input: string | URL | Request, init?:
  // RequestInit | undefined) => Promise<Response>>` which doesn't
  // assign to the broader `MockInstance<(this: unknown, ...args:
  // unknown[]) => unknown>`. Local-to-tests, no production impact.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  let sleepCalls: number[];
  let sleep: (ms: number) => Promise<void>;
  let rng: () => number;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    sleepCalls = [];
    sleep = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });
    // No jitter — pure base delays for deterministic assertions.
    rng = () => 0.5;
    // Reset module-level circuit-breaker state between tests so the
    // 429s in one test don't poison the breaker for the next.
    _resetBlockVisionCircuitBreaker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetBlockVisionCircuitBreaker();
  });

  // -------------------------------------------------------------------
  // Happy path — first attempt succeeds, no retry, no sleep.
  // -------------------------------------------------------------------

  it('returns immediately on a 200 (no retry, no sleep)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toEqual([]);
  });

  // -------------------------------------------------------------------
  // 429 retry — the production bug. First call 429s, second succeeds.
  // -------------------------------------------------------------------

  it('retries once on 429 and succeeds on the second attempt', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Base backoff for attempt 1 → attempt 2 is 250ms; jitter symmetric
    // around 0.5 → 0 so the realised delay is exactly 250ms.
    expect(sleepCalls).toEqual([250]);
  });

  it('retries twice on consecutive 429s and succeeds on the third attempt', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // 250 → 750 (3x exponential), no jitter at rng=0.5.
    expect(sleepCalls).toEqual([250, 750]);
  });

  it('gives up after 3 attempts and returns the last 429 response', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([250, 750]);
  });

  // -------------------------------------------------------------------
  // Retry-After honored — and capped.
  // -------------------------------------------------------------------

  it('honors Retry-After header when present (in seconds)', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    // 2 seconds = 2000ms; jitter 0 at rng=0.5.
    expect(sleepCalls).toEqual([2000]);
  });

  it('caps Retry-After at 5s to stay inside per-call timeout budget', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429, { 'retry-after': '3600' }))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(sleepCalls).toEqual([5000]);
  });

  it('ignores malformed Retry-After (HTTP-date format) and falls back to exponential', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429, { 'retry-after': 'Wed, 01 Jan 2026 00:00:00 GMT' }))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    // Falls back to base 250ms.
    expect(sleepCalls).toEqual([250]);
  });

  // -------------------------------------------------------------------
  // Non-retryable responses — fail fast.
  // -------------------------------------------------------------------

  it('does NOT retry on 400 (client error)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(400));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toEqual([]);
  });

  it('does NOT retry on 401 (auth — won\'t change on retry)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(401));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 404', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(404));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------
  // 5xx — transient server errors retry just like 429.
  // -------------------------------------------------------------------

  it('retries on 503 (transient server error)', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([250]);
  });

  it('retries on 502 then 504 then succeeds', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(502))
      .mockResolvedValueOnce(mockResponse(504))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------
  // Network errors — retry unless caller aborted.
  // -------------------------------------------------------------------

  it('retries on network error (TypeError fetch failed) and succeeds', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws when every attempt is a network error (no Response to return)', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(
      fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng }),
    ).rejects.toThrow('fetch failed');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on AbortError (caller cancelled)', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    fetchSpy.mockRejectedValueOnce(abortErr);

    await expect(
      fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng }),
    ).rejects.toThrow('Aborted');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------
  // Jitter — symmetric ±25% around the base delay.
  // -------------------------------------------------------------------

  it('applies +25% jitter when rng() returns 1', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng: () => 1 });

    // 250 + (2*1-1) * 0.25 * 250 = 250 + 62.5 = 312.5
    expect(sleepCalls[0]).toBeCloseTo(312.5, 1);
  });

  it('applies -25% jitter when rng() returns 0', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200, {}, { ok: true }));

    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng: () => 0 });

    // 250 + (2*0-1) * 0.25 * 250 = 250 - 62.5 = 187.5
    expect(sleepCalls[0]).toBeCloseTo(187.5, 1);
  });

  // -------------------------------------------------------------------
  // Mixed scenarios — the production case.
  // -------------------------------------------------------------------

  it('handles the production 429 burst pattern: 429 → 429 → 200', async () => {
    // Mirrors the user's Vercel logs: two consecutive 429s on the
    // transaction-history endpoint, then BV recovers. With retry,
    // the user sees a 200 result instead of cascading degradation.
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429, { 'retry-after': '1' }))
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200, {}, { coins: [{ usd: 1580 }] }));

    const res = await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // First wait honored Retry-After (1s = 1000ms), second was the
    // exponential backoff for attempt 2 → 3 (750ms). No jitter at rng=0.5.
    expect(sleepCalls).toEqual([1000, 750]);
  });

  // -------------------------------------------------------------------
  // Circuit breaker — scaling guard against amplifying load on a real
  // BV outage. After 10 429s in a 5s window the breaker opens for 30s
  // and 429s short-circuit (no retry). Prevents 3x traffic amplification
  // when BV is genuinely overloaded.
  // -------------------------------------------------------------------

  it('opens the circuit breaker after 10 cumulative 429s and skips retries', async () => {
    let now = 1_000_000;
    const tickingNow = () => now;
    // Each call returns 3 429s (no retry succeeds). 4 such calls
    // produce 12 cumulative 429s — past the 10-threshold.
    fetchSpy.mockResolvedValue(mockResponse(429));

    // Calls 1–3: 9 cumulative 429s — breaker still closed, full retries.
    for (let i = 0; i < 3; i++) {
      await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng, now: tickingNow });
      now += 100; // small tick within the window
    }
    expect(fetchSpy).toHaveBeenCalledTimes(9); // 3 calls × 3 attempts

    // Call 4: first attempt 429 → cumulative=10, breaker opens →
    // remaining attempts skipped. Net: only 1 attempt for this call.
    fetchSpy.mockClear();
    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng, now: tickingNow });
    // Pre-breaker this would have been 3 attempts; with breaker open
    // after the first 429 of this call, only the second attempt (the
    // 11th cumulative 429) sees a closed→open transition mid-call.
    expect(fetchSpy.mock.calls.length).toBeLessThan(3);
  });

  it('skips retries entirely once breaker is open (full traffic suppression)', async () => {
    let now = 1_000_000;
    const tickingNow = () => now;
    fetchSpy.mockResolvedValue(mockResponse(429));

    // Force the breaker open by exhausting the threshold quickly.
    for (let i = 0; i < 4; i++) {
      await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng, now: tickingNow });
      now += 100;
    }

    // Now any subsequent call within the 30s cooldown should not retry.
    fetchSpy.mockClear();
    sleepCalls.length = 0; // reset sleep tracker — only count the asserted call
    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng, now: tickingNow });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toEqual([]); // no backoff sleeps
  });

  it('429s outside the rolling window do not contribute to threshold', async () => {
    let now = 1_000_000;
    const tickingNow = () => now;
    fetchSpy.mockResolvedValue(mockResponse(429));

    // 9 cumulative 429s within 5s window — under threshold.
    for (let i = 0; i < 3; i++) {
      await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng, now: tickingNow });
      now += 100;
    }
    // Advance past the 5s window — old 429s drop out.
    now += 6_000;
    fetchSpy.mockClear();

    // Three more attempts should retry normally — old 429s evicted.
    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng, now: tickingNow });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('total worst-case wait is bounded — 250 + 750 = 1000ms before final attempt', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429));

    await fetchBlockVisionWithRetry(URL, { headers: HEADERS }, { sleep, rng });

    const totalWait = sleepCalls.reduce((s, ms) => s + ms, 0);
    expect(totalWait).toBe(1000);
    // Worst case with +25% jitter: 312.5 + 937.5 = 1250ms — still
    // inside every per-call timeout budget (3s prices, 4s portfolio,
    // 5s defi). This is the contract the caller relies on.
    expect(totalWait).toBeLessThan(1500);
  });
});
