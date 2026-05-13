import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InMemoryUpstreamResponseCache,
  type CachedUpstreamResponse,
} from './upstream-response-cache';

/**
 * Unit tests for `InMemoryUpstreamResponseCache` — the SPEC 26 P1 default
 * implementation of the upstream-response cache. P2 will ship the Upstash
 * variant; both must satisfy the same `UpstreamResponseCache` contract
 * verified here.
 *
 * What we verify (the contract):
 *   - get returns undefined for an absent key
 *   - set + get round-trips the entry verbatim
 *   - set with TTL T means get returns undefined at exactly T seconds (D-1
 *     lock: 60s default)
 *   - re-setting overwrites in place (no leak / no merge)
 *   - clear removes everything (test helper, not part of interface)
 *
 * Uses fake timers for the TTL test so the suite stays sub-millisecond.
 */

function makeEntry(overrides: Partial<CachedUpstreamResponse> = {}): CachedUpstreamResponse {
  const body = new TextEncoder().encode('{"hello":"world"}');
  return {
    status: 200,
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    contentType: 'application/json',
    paymentReceiptHeader: 'mock-receipt-0x123',
    ...overrides,
  };
}

describe('InMemoryUpstreamResponseCache — empty state', () => {
  it('returns undefined for a key that was never set', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    expect(await cache.get('never-set')).toBeUndefined();
  });
});

describe('InMemoryUpstreamResponseCache — set + get round-trip', () => {
  it('returns the entry verbatim after set', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    const entry = makeEntry({ status: 201, paymentReceiptHeader: 'r-1' });

    await cache.set('fp-1', entry, 60);
    const got = await cache.get('fp-1');

    expect(got).toBeDefined();
    expect(got!.status).toBe(201);
    expect(got!.contentType).toBe('application/json');
    expect(got!.paymentReceiptHeader).toBe('r-1');
    // Body bytes round-trip identically (same byte length, same content).
    expect(got!.body.byteLength).toBe(entry.body.byteLength);
    expect(new TextDecoder().decode(got!.body)).toBe('{"hello":"world"}');
  });

  it('handles null paymentReceiptHeader (refundable / charge-failed cases)', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    const entry = makeEntry({ paymentReceiptHeader: null });

    await cache.set('fp-r', entry, 60);
    const got = await cache.get('fp-r');

    expect(got!.paymentReceiptHeader).toBeNull();
  });
});

describe('InMemoryUpstreamResponseCache — TTL semantics (D-1 lock)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the entry while within TTL window', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    await cache.set('fp', makeEntry(), 60);

    vi.advanceTimersByTime(59_000);
    expect(await cache.get('fp')).toBeDefined();
  });

  it('returns undefined exactly at the TTL boundary', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    await cache.set('fp', makeEntry(), 60);

    vi.advanceTimersByTime(60_000);
    expect(await cache.get('fp')).toBeUndefined();
  });

  it('returns undefined past the TTL boundary', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    await cache.set('fp', makeEntry(), 60);

    vi.advanceTimersByTime(120_000);
    expect(await cache.get('fp')).toBeUndefined();
  });

  it('different TTLs are honored independently', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    await cache.set('short', makeEntry(), 5);
    await cache.set('long', makeEntry(), 600);

    vi.advanceTimersByTime(10_000);
    expect(await cache.get('short')).toBeUndefined();
    expect(await cache.get('long')).toBeDefined();
  });
});

describe('InMemoryUpstreamResponseCache — re-set overwrites in place', () => {
  it('re-setting the same key replaces the entry', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    await cache.set('fp', makeEntry({ status: 200, paymentReceiptHeader: 'r-old' }), 60);
    await cache.set('fp', makeEntry({ status: 201, paymentReceiptHeader: 'r-new' }), 60);

    const got = await cache.get('fp');
    expect(got!.status).toBe(201);
    expect(got!.paymentReceiptHeader).toBe('r-new');
  });

  it('re-setting refreshes the TTL window', async () => {
    vi.useFakeTimers();
    try {
      const cache = new InMemoryUpstreamResponseCache();
      await cache.set('fp', makeEntry(), 60);
      vi.advanceTimersByTime(50_000); // 50s into the original 60s window
      await cache.set('fp', makeEntry(), 60); // refresh TTL
      vi.advanceTimersByTime(40_000); // would have expired the original (90s total)
      expect(await cache.get('fp')).toBeDefined(); // refreshed → still alive
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('InMemoryUpstreamResponseCache — test helper', () => {
  it('clear() removes all entries', async () => {
    const cache = new InMemoryUpstreamResponseCache();
    await cache.set('a', makeEntry(), 60);
    await cache.set('b', makeEntry(), 60);

    cache.clear();

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
  });
});
