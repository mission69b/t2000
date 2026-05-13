import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpstashUpstreamResponseCache } from './upstash-upstream-response-cache';
import type { CachedUpstreamResponse } from './upstream-response-cache';

/**
 * Unit tests for `UpstashUpstreamResponseCache` — SPEC 26 P2 production
 * cache impl. Constructed with a mock `RedisLike` so the test surface
 * stays at the wire-bytes level (what gets sent to Redis vs. what comes
 * back) without needing a live Upstash instance.
 *
 * What we verify (the contract):
 *   1. `set` writes the right key prefix + serialized payload + TTL.
 *   2. `get` round-trips an entry written via `set` with byte-identical body.
 *   3. `get` returns `undefined` when Redis returns `null` (miss).
 *   4. `get` returns `undefined` for malformed entries (defensive — old
 *      schema versions or partial writes shouldn't crash callers).
 *   5. Body bytes survive base64 round-trip even for binary-ish content
 *      (UTF-8 edge cases, raw binary, long payloads).
 *   6. The factory `getUpstashUpstreamResponseCache()` is a singleton
 *      (separate test against the lazy-init contract).
 */

interface MockRedis {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

function createMockRedis(): MockRedis {
  return {
    get: vi.fn(),
    set: vi.fn(async () => 'OK'),
  };
}

function makeEntry(overrides: Partial<CachedUpstreamResponse> = {}): CachedUpstreamResponse {
  const body = new TextEncoder().encode('{"hello":"world"}');
  return {
    status: 200,
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    contentType: 'application/json',
    paymentReceiptHeader: 'mock-receipt-0xabc',
    ...overrides,
  };
}

// ─── set: wire-bytes contract ─────────────────────────────────────────

describe('UpstashUpstreamResponseCache.set — wire-bytes contract', () => {
  let redis: MockRedis;
  let cache: UpstashUpstreamResponseCache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new UpstashUpstreamResponseCache(redis);
  });

  it('writes under the mpp:settle: key prefix', async () => {
    await cache.set('fp-abc', makeEntry(), 60);

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key] = redis.set.mock.calls[0];
    expect(key).toBe('mpp:settle:fp-abc');
  });

  it('passes ttlSeconds through Upstash ex option', async () => {
    await cache.set('fp', makeEntry(), 60);
    await cache.set('fp', makeEntry(), 300);

    expect(redis.set.mock.calls[0][2]).toEqual({ ex: 60 });
    expect(redis.set.mock.calls[1][2]).toEqual({ ex: 300 });
  });

  it('serializes body bytes as base64', async () => {
    await cache.set('fp', makeEntry(), 60);

    const [, value] = redis.set.mock.calls[0];
    expect(value).toMatchObject({
      status: 200,
      contentType: 'application/json',
      paymentReceiptHeader: 'mock-receipt-0xabc',
    });
    // base64('{"hello":"world"}') = 'eyJoZWxsbyI6IndvcmxkIn0='
    expect((value as { bodyB64: string }).bodyB64).toBe('eyJoZWxsbyI6IndvcmxkIn0=');
  });

  it('preserves null paymentReceiptHeader (refundable / charge-failed cases)', async () => {
    await cache.set('fp', makeEntry({ paymentReceiptHeader: null }), 60);

    const [, value] = redis.set.mock.calls[0];
    expect((value as { paymentReceiptHeader: string | null }).paymentReceiptHeader).toBeNull();
  });
});

// ─── get: deserialization + miss handling ────────────────────────────

describe('UpstashUpstreamResponseCache.get — deserialization', () => {
  let redis: MockRedis;
  let cache: UpstashUpstreamResponseCache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new UpstashUpstreamResponseCache(redis);
  });

  it('returns undefined when Redis returns null (cache miss)', async () => {
    redis.get.mockResolvedValueOnce(null);

    const got = await cache.get('missing-fp');

    expect(got).toBeUndefined();
    expect(redis.get).toHaveBeenCalledWith('mpp:settle:missing-fp');
  });

  it('reads under the mpp:settle: key prefix', async () => {
    redis.get.mockResolvedValueOnce({
      status: 200,
      bodyB64: 'eyJrIjoidiJ9', // base64('{"k":"v"}')
      contentType: 'application/json',
      paymentReceiptHeader: 'r-1',
    });

    await cache.get('fp-xyz');

    expect(redis.get).toHaveBeenCalledWith('mpp:settle:fp-xyz');
  });

  it('round-trips the entry shape verbatim', async () => {
    redis.get.mockResolvedValueOnce({
      status: 201,
      bodyB64: 'eyJoZWxsbyI6IndvcmxkIn0=', // '{"hello":"world"}'
      contentType: 'application/json',
      paymentReceiptHeader: 'mock-receipt-0xabc',
    });

    const got = await cache.get('fp');

    expect(got).toBeDefined();
    expect(got!.status).toBe(201);
    expect(got!.contentType).toBe('application/json');
    expect(got!.paymentReceiptHeader).toBe('mock-receipt-0xabc');
    expect(new TextDecoder().decode(got!.body)).toBe('{"hello":"world"}');
  });

  it('coerces missing paymentReceiptHeader to null (forward-compat)', async () => {
    redis.get.mockResolvedValueOnce({
      status: 200,
      bodyB64: 'eyJrIjoidiJ9',
      contentType: 'application/json',
      // paymentReceiptHeader omitted entirely
    });

    const got = await cache.get('fp');

    expect(got!.paymentReceiptHeader).toBeNull();
  });
});

// ─── get: defensive handling of malformed entries ────────────────────

describe('UpstashUpstreamResponseCache.get — defensive (malformed entries)', () => {
  let redis: MockRedis;
  let cache: UpstashUpstreamResponseCache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new UpstashUpstreamResponseCache(redis);
  });

  it('returns undefined when status is not a number (corrupt entry)', async () => {
    redis.get.mockResolvedValueOnce({
      status: 'not a number',
      bodyB64: 'eyJrIjoidiJ9',
      contentType: 'application/json',
      paymentReceiptHeader: null,
    });

    const got = await cache.get('fp');

    // Treat as miss → caller will re-probe (correct fallback per §5.6).
    expect(got).toBeUndefined();
  });

  it('returns undefined when bodyB64 is missing', async () => {
    redis.get.mockResolvedValueOnce({
      status: 200,
      contentType: 'application/json',
      paymentReceiptHeader: null,
    });

    const got = await cache.get('fp');

    expect(got).toBeUndefined();
  });

  it('returns undefined when contentType is missing (old schema version)', async () => {
    redis.get.mockResolvedValueOnce({
      status: 200,
      bodyB64: 'eyJrIjoidiJ9',
      paymentReceiptHeader: null,
    });

    const got = await cache.get('fp');

    expect(got).toBeUndefined();
  });
});

// ─── set + get: byte-identical round-trip across content shapes ──────

describe('UpstashUpstreamResponseCache — set + get round-trip via mock store', () => {
  /**
   * Wires set + get through a single mock map so the round-trip is
   * tested as an integration (instead of testing each side against a
   * static fixture). Catches encoding drift between the two halves.
   */
  function createWiredCache(): UpstashUpstreamResponseCache {
    const store = new Map<string, unknown>();
    const redis: MockRedis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
        return 'OK';
      }),
    };
    return new UpstashUpstreamResponseCache(redis);
  }

  it('round-trips ASCII JSON body verbatim', async () => {
    const cache = createWiredCache();
    const original = makeEntry();

    await cache.set('fp', original, 60);
    const got = await cache.get('fp');

    expect(got!.status).toBe(original.status);
    expect(got!.contentType).toBe(original.contentType);
    expect(new TextDecoder().decode(got!.body)).toBe(
      new TextDecoder().decode(original.body),
    );
  });

  it('round-trips UTF-8 multibyte body (emoji, non-ASCII)', async () => {
    const cache = createWiredCache();
    const text = '{"msg":"hello 🐸 world ñ é"}';
    const bytes = new TextEncoder().encode(text);
    const entry = makeEntry({
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    await cache.set('fp-utf8', entry, 60);
    const got = await cache.get('fp-utf8');

    expect(new TextDecoder().decode(got!.body)).toBe(text);
  });

  it('round-trips raw binary bytes (PNG-like header)', async () => {
    const cache = createWiredCache();
    // Synthetic non-text bytes: a PNG signature + some random binary noise.
    const raw = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x01, 0xff, 0xfe, 0xab, 0xcd, 0xef, 0x12,
    ]);
    const entry = makeEntry({
      body: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      contentType: 'image/png',
    });

    await cache.set('fp-bin', entry, 60);
    const got = await cache.get('fp-bin');

    expect(got!.contentType).toBe('image/png');
    expect(new Uint8Array(got!.body)).toEqual(raw);
  });

  it('round-trips a large body (~50KB JSON)', async () => {
    const cache = createWiredCache();
    const large = JSON.stringify({
      data: Array.from({ length: 1000 }, (_, i) => ({
        url: `https://img.example/${i}.png`,
        revised_prompt: `revised description #${i} with some padding text`,
      })),
    });
    const bytes = new TextEncoder().encode(large);
    const entry = makeEntry({
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    await cache.set('fp-large', entry, 60);
    const got = await cache.get('fp-large');

    expect(new TextDecoder().decode(got!.body)).toBe(large);
  });
});
