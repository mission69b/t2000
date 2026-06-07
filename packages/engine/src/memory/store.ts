// ---------------------------------------------------------------------------
// memory/store.ts — Phase 7 (SPEC_PHASE_7_DRAFT.md §3, 2026-05-18)
// ---------------------------------------------------------------------------
//
// `MemoryStore` is the engine-side abstraction over a pluggable memory
// backend (production target: MemWal; reference impl + test default:
// `InMemoryMemoryStore`).
//
// **Why a NEW interface shape instead of reusing `DefiCacheStore`?**
// The existing cache modules (`cache/defi`, `cache/wallet`, `navi/cache`)
// share a get/set/delete/clear contract optimized for KEYED lookups.
// MemWal's operations are different: `remember(text)` ingests an opaque
// document; `recall(query)` runs a similarity search and returns top-K
// records. There's no key. Modeling MemoryStore as another `XCacheStore`
// would force the wrong abstraction onto every consumer.
//
// **Engine-side scope:** MemoryStore is consumed by `prepareStep` in
// `v2/engine.ts` to inject a `<memory_recall>` block as layer 2 of the
// 4-layer F-4 system-prompt assembly (base → memory → skill → user
// message). The engine never decides WHEN to remember
// (host triggers it via `EngineConfig.memoryStore.remember(...)` after
// each turn) — it only consumes whatever the store returns at recall
// time.
//
// **D-question resolutions** (BENEFITS_SPEC §1886, see SPEC_PHASE_7_DRAFT
// §5 for full reasoning):
//
//   - D-1 (manual SDK vs `withMemWal` middleware): manual SDK. Middleware
//     can't deliver F-4 ordering control.
//   - D-2 (per-app delegate keys): deferred to the host's MemoryStore impl.
//   - D-3 (`Ask` API vs manual recall + injection): manual recall +
//     injection. `Ask` runs retrieval+LLM in one MemWal call, bypassing
//     our prompt caching and locking us into MemWal-side LLM choice.
//   - D-4 (expose as MCP): deferred to v0.7c product decision.
//
// ---------------------------------------------------------------------------

/**
 * One record returned by `MemoryStore.recall()`. Implementations are free
 * to attach arbitrary metadata; consumers (the prepareStep assembler in
 * `v2/engine.ts`) only require `text` to be rendered into the
 * `<memory_recall>` block.
 */
export interface MemoryRecord {
  /** The plaintext recalled from storage. */
  text: string;
  /**
   * Similarity score from the backend's vector search. Lower = more
   * similar (matches MemWal's "distance" convention; cosine-distance-like).
   * For the in-memory mock this is the negative bag-of-words overlap so
   * lower=better matches the same sort semantics.
   */
  distance: number;
  /**
   * Backend-specific metadata. Common fields when populated:
   *   - `timestamp` (number, ms since epoch) — when `remember()` was called
   *   - `source` (string) — origin tag (`'turn_intent'`, `'tool_outcome'`,
   *     `'user_note'`, etc.)
   * Engine code never reads this; it's surfaced for hosts that want to
   * filter or re-rank before consumption.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Pluggable memory backend consumed by the engine's `prepareStep` hook.
 *
 * **Lifecycle.** One instance lives for the duration of an engine request
 * (`AISDKEngine` instance). The host constructs it (typically per user,
 * possibly per session) and passes it via `EngineConfig.memoryStore`.
 *
 * **Latency contract.**
 *
 *   - `remember()` MUST be fire-and-forget from the engine's perspective.
 *     MemWal's measured p50 ingest is 25s / p95 42s (post-Mysten patch
 *     2026-05-15); blocking on it would wedge the response stream. The
 *     engine awaits the returned promise only to surface fatal errors —
 *     hosts should swallow non-fatal failures inside `remember()` itself.
 *
 *   - `recall()` is called ONCE per turn (cached in
 *     `ToolContext.memoryCache` for subsequent steps in the same turn).
 *     MemWal's measured single-recall p95 is 470-675ms; session-cached
 *     recalls hit in <5ms. The engine MUST cache (`prepareStep` only
 *     calls `recall()` at `stepNumber === 0`).
 *
 * **Failure mode.** The engine wraps `recall()` in a try/catch and
 * degrades to an empty `<memory_recall>` block on throw. Implementations
 * SHOULD throw on hard failures (network, auth) so hosts get a clear
 * signal, but MAY return an empty array on soft failures (no matching
 * records, namespace miss).
 */
export interface MemoryStore {
  /**
   * Ingest one text record into the backing store. Engine never calls
   * this directly — the host triggers ingest from its own turn-end hook
   * (e.g. after `onStepFinish` writes a turn summary, or from a daily
   * snapshot cron). Listed here so the interface is complete for hosts
   * implementing `MemWalMemoryStore`.
   *
   * @param text - The opaque document to remember. MemWal allows up to
   *   ~4kB per record before truncation; mocks typically have no limit.
   * @param opts.namespace - Optional namespace for multi-tenant scoping.
   *   MemWal uses one namespace per user; per-product sub-namespaces
   *   (`'audric:profile'`, `'audric:advice'`) are an opt-in MemWal feature.
   *   When undefined, the implementation's default namespace applies.
   */
  remember(text: string, opts?: { namespace?: string }): Promise<void>;

  /**
   * Retrieve the top-K most similar records to `query`. Called by
   * `prepareStep` at the start of each turn (cached for subsequent steps).
   *
   * @param query - Free-text query (usually the latest user message).
   * @param opts.topK - Maximum records to return. Default: 5 (matches
   *   the prepareStep default; production tuning happens in audric).
   * @param opts.namespace - Filter to one namespace (same semantics as
   *   `remember(... { namespace })`).
   *
   * @returns At most `topK` records sorted by `distance` ascending (most
   *   similar first). Empty array means no matches — NOT an error.
   */
  recall(
    query: string,
    opts?: { topK?: number; namespace?: string },
  ): Promise<MemoryRecord[]>;

  /**
   * Optional cleanup hook for hosts that need to release per-request
   * resources (close network connections, wipe in-memory credentials,
   * etc.).
   *
   * **v2.7.0 behavior:** the engine does NOT auto-invoke `destroy()` —
   * `AISDKEngine` has no request-end lifecycle hook today (the same
   * instance can serve many `submitMessage()` calls, and the
   * `AbortController` only fires per-message). Hosts that need cleanup
   * MUST invoke `destroy()` themselves at the appropriate teardown
   * point (e.g., session expiry, user logout, server shutdown).
   *
   * The slot exists on the interface so the contract is forward-compatible:
   * a future engine version MAY add an auto-invocation point (e.g.
   * `onEngineDispose()`); when that lands, hosts that already define
   * `destroy()` will pick up the behavior for free.
   *
   * The mock's `destroy()` is used by `in-memory-store.test.ts` for test
   * isolation between cases — not via the engine.
   */
  destroy?(): void;
}
