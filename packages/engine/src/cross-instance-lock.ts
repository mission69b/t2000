// ---------------------------------------------------------------------------
// FetchLock — pluggable cross-instance request coalescing
// ---------------------------------------------------------------------------
//
// Why this module exists
// ----------------------
// Even with v0.54's shared DeFi cache and v0.55's shared wallet cache,
// when N concurrent Vercel instances all miss the cache for the same
// address at the same instant, all N independently fire the BlockVision
// portfolio call AND the 9-protocol DeFi fan-out. At 200 concurrent
// users with one popular shared address (e.g. a treasury everyone is
// watching), a single cache-miss instant produces 200 × 10 = 2000 BV
// calls in <1 second — self-inflicted DoS.
//
// `defiInflight` and `portfolioInflight` Maps coalesce WITHIN a process,
// but every Vercel instance is its own process. We need a CROSS-process
// coalescer.
//
// The contract
// ------------
// `awaitOrFetch(key, fetcher, opts)`:
//   1. Try `lock.acquire(key, leaseSec)` — backed by Upstash `SET NX EX`
//      in production, in-memory Map in CLI/tests/dev.
//   2. **Lock acquired** → run `fetcher()` (which writes the cache as
//      its last act), then `release()`. Cache write is the signal —
//      no separate pub/sub channel needed.
//   3. **Lock NOT acquired** → another instance is fetching. Poll
//      `opts.pollCache()` every ~100ms (jittered) for up to
//      `pollBudgetMs`. If cache fills → return that. If timeout →
//      fall through to a direct `fetcher()` call (defensive degraded
//      path; never block forever on a phantom lock).
//
// Lease sizing
// ------------
// Default lease is **15 seconds**, sized for the worst-case
// `fetchBlockVisionWithRetry` budget:
//   - 3 HTTP attempts × 4s timeout = 12s
//   - + backoff sleeps 250ms + 750ms = 1s
//   - Total ≈ 13s
// A shorter lease (e.g. 5s) expires mid-fetch under load, the leader
// loses the lock, a follower acquires it, and now 2 instances are
// fetching the same address — exactly the amplification we exist to
// prevent. We never extend; if a process dies, the lease expires and
// the next caller takes over.
//
// Default poll budget is **4.5 seconds** — must be < the engine's
// per-tool timeout (typically 5s for `balance_check` /
// `portfolio_analysis`) so a dead leader doesn't cascade into a tool
// timeout for every follower. 4.5s × 100ms poll = ≤45 cheap GETs per
// follower per coalesced fan-out.
//
// Implementation note: store transport errors are swallowed and the
// caller falls through to `fetcher()` (i.e. degrades to per-instance
// fetching). A Redis outage should never break a successful read.
// ---------------------------------------------------------------------------

/**
 * Pluggable distributed mutex. Implementations MUST tolerate transport
 * errors gracefully — `acquire` returning `false` (not throwing) on
 * backend failure is fine; the caller will fall through to a direct
 * fetch. The Upstash impl uses `SET NX EX` which is the canonical
 * Redis distributed-lock primitive at this scale.
 */
export interface FetchLock {
  /**
   * Try to acquire the lock for `key`, with an automatic expiry of
   * `leaseSec` seconds.
   *
   * Returns `true` if acquired (caller is now the leader for that key,
   * MUST call `release` when done). Returns `false` if the lock is
   * already held by someone else (caller is a follower).
   *
   * Errors are swallowed (logged); on backend failure return `false`
   * so the caller falls through to its degraded direct-fetch path.
   */
  acquire(key: string, leaseSec: number): Promise<boolean>;

  /**
   * Release the lock for `key`. Idempotent — calling on a key the
   * caller doesn't hold is a no-op (we accept a small window of
   * potential ABA: if our lease expired and another caller took the
   * key, we'll harmlessly delete THEIR lock once. Production traffic
   * patterns make this exceedingly rare; the cost is one extra
   * fan-out, which is the same cost we'd pay anyway under contention.)
   *
   * Errors are swallowed (logged) — release failures are non-fatal
   * because the lease expires on its own.
   */
  release(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation — default for CLI, tests, and pre-injection use
// ---------------------------------------------------------------------------

/**
 * Process-local mutex backed by a `Map<key, expiryMs>`. Used as the
 * default when no other lock has been injected via `setFetchLock()`.
 *
 * NOT suitable for multi-instance deployments — each Vercel function
 * instance gets its own Map, which means N concurrent instances all
 * acquire successfully and all fan out to BlockVision. Audric replaces
 * this at engine init with `UpstashFetchLock`; the CLI keeps it
 * (single-process, so process-local is correct).
 */
export class InMemoryFetchLock implements FetchLock {
  private readonly held = new Map<string, number>();

  async acquire(key: string, leaseSec: number): Promise<boolean> {
    const now = Date.now();
    const expiry = this.held.get(key);
    if (expiry !== undefined && expiry > now) return false;
    this.held.set(key, now + leaseSec * 1000);
    return true;
  }

  async release(key: string): Promise<void> {
    this.held.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Module-level injection slot
// ---------------------------------------------------------------------------

let activeLock: FetchLock = new InMemoryFetchLock();

/**
 * Swap the active fetch lock backend. Call once at engine init from a
 * runtime that wants a non-default backend (e.g. Audric injecting
 * `UpstashFetchLock`). Idempotent — calling again replaces the previous
 * lock instance, but does NOT migrate held leases (which are stored in
 * the backend, not the lock object).
 */
export function setFetchLock(lock: FetchLock): void {
  activeLock = lock;
}

/** Returns the currently active lock. Used by `awaitOrFetch`. */
export function getFetchLock(): FetchLock {
  return activeLock;
}

/** Restore the default in-memory lock. Used by test teardowns. */
export function resetFetchLock(): void {
  activeLock = new InMemoryFetchLock();
}

// ---------------------------------------------------------------------------
// awaitOrFetch — the high-level coalescing primitive
// ---------------------------------------------------------------------------

/** Default lease seconds — sized for worst-case BV retry budget. See header. */
export const DEFAULT_LEASE_SEC = 15;

/** Default follower poll budget ms — must be < engine per-tool timeout. */
export const DEFAULT_POLL_BUDGET_MS = 4_500;

/** Default poll interval ms (jittered ±20%) — ~45 GETs over 4.5s. */
export const DEFAULT_POLL_INTERVAL_MS = 100;

export interface AwaitOrFetchOpts<T> {
  /** Override the active lock instance (test seam). */
  lock?: FetchLock;
  /** Lease seconds for `lock.acquire`. Default 15. */
  leaseSec?: number;
  /** Total ms a follower will poll the cache before falling through. Default 4500. */
  pollBudgetMs?: number;
  /** Poll cadence ms (jittered ±20%). Default 100. */
  pollIntervalMs?: number;
  /**
   * Optional cache reader for followers. If provided, followers poll
   * this every `pollIntervalMs` (jittered) until it returns non-null
   * or the budget is exhausted. If omitted, followers fall through
   * immediately to a direct `fetcher()` call (no coalescing benefit).
   *
   * The follower's "is this fresh enough?" decision lives inside this
   * callback — it should return `null` when the cache entry exists but
   * is too stale to serve, so the poll keeps trying.
   */
  pollCache?: () => Promise<T | null>;
  /** Test seam — defaults to `Math.random()`. */
  rng?: () => number;
  /** Test seam — defaults to `setTimeout`-backed promise. */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam — defaults to `Date.now()`. */
  now?: () => number;
  /** Optional abort signal — caller cancellation halts polling. */
  signal?: AbortSignal;
}

/**
 * Cross-instance request coalescer.
 *
 * `key` MUST be stable across instances for the same logical fetch —
 * e.g. `bv-lock:wallet:0xabc...` for the wallet portfolio of `0xabc...`.
 * Different operations on the same address (wallet vs DeFi) MUST use
 * different keys so they don't block each other.
 *
 * `fetcher` is the leader's work. It SHOULD write the cache as its
 * last act, otherwise followers will time out and fall through to
 * direct fetches (functionally correct, just no coalescing benefit).
 *
 * The leader is guaranteed to call `release()` even if `fetcher()`
 * throws — propagated to the caller after release completes.
 *
 * Followers degrade to direct `fetcher()` on:
 *   - lock backend failure (`acquire` threw or returned `false` due to a
 *     transport error rather than contention)
 *   - poll budget exhausted (leader didn't write cache, or wrote with
 *     an old enough `pricedAt` that `pollCache` keeps returning `null`)
 *   - no `pollCache` callback provided
 */
export async function awaitOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: AwaitOrFetchOpts<T> = {},
): Promise<T> {
  const lock = opts.lock ?? getFetchLock();
  const leaseSec = opts.leaseSec ?? DEFAULT_LEASE_SEC;
  const pollBudgetMs = opts.pollBudgetMs ?? DEFAULT_POLL_BUDGET_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        if (opts.signal) {
          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          };
          if (opts.signal.aborted) onAbort();
          else opts.signal.addEventListener('abort', onAbort, { once: true });
        }
      }));

  let acquired = false;
  try {
    acquired = await lock.acquire(key, leaseSec);
  } catch (err) {
    // Backend failure — degrade to direct fetch (no coalescing).
    console.warn(`[fetch-lock] acquire(${key}) threw; falling through to direct fetch:`, err);
    return fetcher();
  }

  if (acquired) {
    try {
      return await fetcher();
    } finally {
      try {
        await lock.release(key);
      } catch (err) {
        // Release failure is non-fatal — lease expires on its own.
        console.warn(`[fetch-lock] release(${key}) failed (non-fatal):`, err);
      }
    }
  }

  // ---------------------------------------------------------------
  // Follower path
  // ---------------------------------------------------------------
  // Without a pollCache there's no benefit to waiting — a follower
  // can't know when the leader is done. Fall through immediately.
  if (!opts.pollCache) {
    return fetcher();
  }

  const deadline = now() + pollBudgetMs;
  while (now() < deadline) {
    // Symmetric jitter ±20% so concurrent followers don't hammer
    // Redis on synchronized 100ms boundaries.
    const jitterPx = (rng() * 0.4 - 0.2) * pollIntervalMs;
    const wait = Math.max(0, pollIntervalMs + jitterPx);
    try {
      await sleep(wait);
    } catch (err) {
      // Caller cancelled mid-poll — propagate.
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      // Anything else is a sleep impl bug; bail to direct fetch.
      return fetcher();
    }
    let cached: T | null = null;
    try {
      cached = await opts.pollCache();
    } catch (err) {
      // pollCache transport failure — log and keep polling, not the
      // caller's problem. Eventually the budget runs out and we fall
      // through to a direct fetch.
      console.warn(`[fetch-lock] pollCache(${key}) threw; continuing to poll:`, err);
    }
    if (cached !== null) return cached;
  }

  // Defensive degraded path: leader didn't fill the cache within the
  // poll budget. Could be a dead leader, a too-slow leader, or a
  // misconfigured pollCache that always returns null. Fetching
  // directly preserves correctness at the cost of one fan-out.
  return fetcher();
}
