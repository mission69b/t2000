import { Redis } from '@upstash/redis';
import type {
  CachedUpstreamResponse,
  UpstreamResponseCache,
} from './upstream-response-cache';

/**
 * # `UpstashUpstreamResponseCache` — SPEC 26 P2 production implementation
 *
 * Multi-instance-correct backing for the SPEC 26 settle-on-success
 * upstream-response cache. Replaces `InMemoryUpstreamResponseCache` in
 * any environment where ≥2 gateway instances serve the same route
 * (Vercel runs ≥2 functions per route — without a shared cache, a retry
 * routed to instance B can't return the response cached by instance A's
 * probe, defeating the spec §5.2 idempotency guarantee).
 *
 * ## Why a separate file from `upstream-response-cache.ts`
 *
 * Mirrors the existing `upstash-digest-store.ts` pattern: the interface
 * + in-memory default live in one file (zero runtime dependencies); the
 * vendor-bound impl lives in a sibling file (imports `@upstash/redis`).
 * Tests of the InMemory default never touch `@upstash/redis`; tests of
 * THIS file mock a `RedisLike` shape so the wire bytes are testable
 * without a live Redis.
 *
 * ## Why base64 for the body
 *
 * Upstash Redis serializes value payloads as JSON over HTTP. JSON has
 * no native binary type — passing raw `ArrayBuffer` / `Uint8Array`
 * either errors or silently coerces to `{}` (depending on client
 * version). Base64 is the canonical text encoding for arbitrary bytes
 * over JSON; ~33% size overhead is acceptable for our 60s-TTL probe
 * responses (typical OpenAI image gen response: ~5KB JSON; binary
 * payloads aren't yet a settle-on-success path anyway).
 *
 * ## Why a `RedisLike` structural interface
 *
 * Lets unit tests pass a plain mock object with just `get` + `set`
 * methods instead of mocking the entire `@upstash/redis` module. The
 * real `Redis` class structurally satisfies this interface so the
 * factory `getUpstashUpstreamResponseCache()` passes the real client
 * through without casting.
 *
 * ## TTL semantics
 *
 * Honors the `ttlSeconds` arg from the `UpstreamResponseCache`
 * interface contract via Upstash's `ex` option (seconds, not ms).
 * Default 60s per SPEC 26 D-1 lock; routes can override via
 * `ProxyOptions.cacheTtlSeconds`.
 *
 * ## Key prefix
 *
 * `mpp:settle:` distinguishes settle-cache entries from the existing
 * `mpp:digest:` keys (replay-defense store) sharing the same Redis
 * database. Matches the convention used by `UpstashDigestStore`.
 */

const KEY_PREFIX = 'mpp:settle:';

interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

interface SerializedEntry {
  status: number;
  /** Base64-encoded body bytes (Redis JSON has no native binary type). */
  bodyB64: string;
  contentType: string;
  paymentReceiptHeader: string | null;
}

export class UpstashUpstreamResponseCache implements UpstreamResponseCache {
  constructor(private readonly redis: RedisLike) {}

  async get(fingerprint: string): Promise<CachedUpstreamResponse | undefined> {
    const stored = await this.redis.get<SerializedEntry>(KEY_PREFIX + fingerprint);
    if (!stored) return undefined;

    // Defensive: an entry written by an older version (or a corrupted
    // payload) might be missing fields. Treat as a cache miss rather
    // than throw — a fresh probe is the correct fallback behavior.
    if (
      typeof stored.status !== 'number' ||
      typeof stored.bodyB64 !== 'string' ||
      typeof stored.contentType !== 'string'
    ) {
      return undefined;
    }

    const buf = Buffer.from(stored.bodyB64, 'base64');
    // Slice produces a real ArrayBuffer (not the ambiguous SharedArrayBuffer
    // type) so the result satisfies the canonical BodyInit shape — same
    // reason CachedUpstreamResponse.body is typed as ArrayBuffer.
    const body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    return {
      status: stored.status,
      body,
      contentType: stored.contentType,
      paymentReceiptHeader: stored.paymentReceiptHeader ?? null,
    };
  }

  async set(
    fingerprint: string,
    entry: CachedUpstreamResponse,
    ttlSeconds: number,
  ): Promise<void> {
    const serialized: SerializedEntry = {
      status: entry.status,
      bodyB64: Buffer.from(entry.body).toString('base64'),
      contentType: entry.contentType,
      paymentReceiptHeader: entry.paymentReceiptHeader,
    };
    await this.redis.set(KEY_PREFIX + fingerprint, serialized, { ex: ttlSeconds });
  }
}

let _instance: UpstashUpstreamResponseCache | undefined;

/**
 * Lazy singleton factory — mirrors `getDigestStore()` in
 * `upstash-digest-store.ts`. Reads `KV_REST_API_URL` + `KV_REST_API_TOKEN`
 * at first call; throws via the Upstash client constructor if either is
 * missing.
 *
 * Caller (gateway.ts `getUpstreamResponseCache()`) MUST gate the call
 * on env-var presence so missing-config doesn't take down the gateway —
 * the gate falls back to the in-memory default in that case.
 */
export function getUpstashUpstreamResponseCache(): UpstashUpstreamResponseCache {
  if (!_instance) {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
    _instance = new UpstashUpstreamResponseCache(redis);
  }
  return _instance;
}

/**
 * Test-only reset hook so the singleton doesn't leak Redis client state
 * across tests. Not part of the production API surface.
 */
export function _resetUpstashUpstreamResponseCacheForTests(): void {
  _instance = undefined;
}
