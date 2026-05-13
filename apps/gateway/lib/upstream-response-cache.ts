/**
 * # Upstream-response cache for SPEC 26 settle-on-success mode
 *
 * Stores the bytes of a successful upstream probe so that within the cache
 * TTL (D-1 lock: 60s), an identical retry returns the same body without
 * re-billing AND without firing a second upstream request.
 *
 * ## Why a separate cache from the existing digest store
 *
 * `UpstashDigestStore` (lib/upstash-digest-store.ts) prevents Sui digest
 * replay — that's an MPP protocol concern, owned by the `mppx` library.
 * THIS cache is gateway business logic for the settle-on-success flow:
 *
 *   - Different lifecycle: digest store TTL is 24h (matches Sui finality
 *     window for replay defense); response cache TTL is 60s (matches
 *     client-retry burst window for idempotency, NOT chain replay).
 *   - Different key shape: digest store keys on a Sui object digest;
 *     response cache keys on `chargeProxyFingerprint()` output.
 *   - Different value shape: digest store holds a presence flag (boolean);
 *     response cache holds the bytes of the upstream response.
 *
 * Mixing them would couple two unrelated concerns and force Upstash schema
 * upgrades to ripple across both surfaces. Keeping them separate matches
 * the engineering-principles.mdc Principle 6 guidance ("factor when LOGIC
 * duplicates, not when SHAPE does").
 *
 * ## Why the cache interface is dependency-injected
 *
 * Injection lets P1 ship a fully-tested in-memory default + ship the real
 * Upstash impl in P2 without touching `chargeProxy` again. Tests use the
 * in-memory variant (deterministic, no network); prod injects the
 * `UpstashUpstreamResponseCache` when wired in P2.
 *
 * ## What we cache
 *
 * The full response shape needed to reconstruct it: status code, body
 * bytes (string-encoded — JSON for vendor responses; base64 for binary
 * payloads if a non-JSON route ever opts into settle-on-success), and the
 * content-type header so we don't lose the discriminator.
 *
 * We do NOT cache the Sui Payment-Receipt header. That's stamped fresh on
 * each charge — even on a cache hit we re-issue a charge so the user sees
 * a deterministic on-chain trail per request. Replay defense is owned by
 * the digest store.
 *
 * Wait — cache hit re-issues a charge? That contradicts the SPEC 26 §5.2
 * "no double-charge" guarantee. Let me re-state correctly:
 *
 * **Cache hit semantics (D-1 + §5.2):** the cached entry holds the
 * upstream body AND the Payment-Receipt header from the FIRST successful
 * charge. On a cache hit within TTL, we return the cached body + cached
 * receipt — NO second charge. The user sees the same digest, the same
 * status, the same body. This is how idempotency holds for legitimate
 * retries (network blip mid-response → client retries → returns the same
 * thing it would have seen). The digest store's separate replay defense
 * (`mppx` enforces "digest already used" → throws) prevents an attacker
 * from re-using a stolen receipt against a different request.
 */

export interface CachedUpstreamResponse {
  /** HTTP status from upstream (post-transform if `transformUpstreamResponse` ran). */
  status: number;
  /**
   * Response body bytes captured pre-charge. ArrayBuffer (not Uint8Array)
   * because that's the canonical web `BodyInit` type — `Uint8Array<ArrayBufferLike>`
   * doesn't unify cleanly with the DOM lib's expected `Uint8Array<ArrayBuffer>`
   * under Node 22+ types, so we pin to the unambiguous form.
   */
  body: ArrayBuffer;
  /** Content-type from upstream (post-transform). Reserved for the discriminator on hit. */
  contentType: string;
  /** Sui Payment-Receipt header from the original charge (so cache hits return identical receipts). */
  paymentReceiptHeader: string | null;
}

export interface UpstreamResponseCache {
  /**
   * Returns the cached entry for the fingerprint, or `undefined` if absent
   * or expired. Implementations MUST honor TTL semantics — an entry
   * inserted N seconds ago with TTL T must return `undefined` when N >= T.
   */
  get(fingerprint: string): Promise<CachedUpstreamResponse | undefined>;

  /**
   * Inserts an entry under the fingerprint with a TTL hint (seconds).
   * Implementations may apply a max TTL cap (e.g. Upstash 24h) but MUST
   * honor the requested TTL when it's shorter than the cap.
   */
  set(fingerprint: string, entry: CachedUpstreamResponse, ttlSeconds: number): Promise<void>;
}

/**
 * In-memory cache used as the unit-test default + as a SAFE fallback in
 * environments where Upstash isn't wired (local dev). Production prod
 * wiring (P2) injects `UpstashUpstreamResponseCache` instead.
 *
 * NOT suitable for multi-instance deployments — every gateway instance
 * holds its own copy, so a cache hit on instance A doesn't help a retry
 * routed to instance B. Multi-instance correctness REQUIRES the Upstash
 * variant (Vercel runs ≥2 functions per route).
 */
export class InMemoryUpstreamResponseCache implements UpstreamResponseCache {
  private readonly store = new Map<string, { entry: CachedUpstreamResponse; expiresAt: number }>();

  async get(fingerprint: string): Promise<CachedUpstreamResponse | undefined> {
    const row = this.store.get(fingerprint);
    if (!row) return undefined;
    if (Date.now() >= row.expiresAt) {
      this.store.delete(fingerprint);
      return undefined;
    }
    return row.entry;
  }

  async set(
    fingerprint: string,
    entry: CachedUpstreamResponse,
    ttlSeconds: number,
  ): Promise<void> {
    this.store.set(fingerprint, {
      entry,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /** Test helper: nuke all entries between tests. Not part of the interface. */
  clear(): void {
    this.store.clear();
  }
}
