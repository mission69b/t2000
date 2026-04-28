// ---------------------------------------------------------------------------
// [PR 2 — v0.55] Cross-instance lock + awaitOrFetch regression suite
// ---------------------------------------------------------------------------
//
// Pins the cross-process coalescing contract introduced in PR 2.
//
// What this prevents (the bug class):
// Even with v0.54's shared DeFi cache and PR-1's shared wallet cache, when
// N concurrent Vercel instances all miss the cache for the same address
// at the same instant, every instance independently fans out to BlockVision
// (10 calls per address: 1 wallet + 9 protocols). At 200 concurrent users
// watching one popular address, a single cache-miss instant produces
// 200 × 10 = 2000 BV calls in <1 second — self-inflicted DoS.
//
// `awaitOrFetch(key, fetcher, { pollCache })` solves this:
//   - Leader (1 instance) acquires the lock and runs `fetcher()`, which
//     writes the cache as its last act.
//   - Followers (N-1 instances) poll the cache. As soon as the leader's
//     write lands, every follower sees it and returns — only 1 BV fan-out
//     happens cross-process.
//   - On lock-backend failure, lease expiry, or poll-budget exhaustion,
//     followers fall through to a direct `fetcher()` call (defensive
//     degraded path — never block forever on a phantom lock).
//
// The lease is 15s by default — sized to cover the worst-case
// `fetchBlockVisionWithRetry` budget (3 × 4s timeout + ~1s backoff = ~13s).
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  awaitOrFetch,
  InMemoryFetchLock,
  setFetchLock,
  resetFetchLock,
  getFetchLock,
  DEFAULT_LEASE_SEC,
  DEFAULT_POLL_BUDGET_MS,
  DEFAULT_POLL_INTERVAL_MS,
  type FetchLock,
} from '../cross-instance-lock.js';

beforeEach(() => {
  resetFetchLock();
});

afterEach(() => {
  resetFetchLock();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// InMemoryFetchLock — unit tests
// ---------------------------------------------------------------------------

describe('[PR 2 — v0.55] InMemoryFetchLock', () => {
  it('acquire returns true the first time, false while held', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);
    expect(await lock.acquire('k', 60)).toBe(false);
  });

  it('release frees the lock for the next acquirer', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);
    await lock.release('k');
    expect(await lock.acquire('k', 60)).toBe(true);
  });

  it('different keys do not block each other', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('a', 60)).toBe(true);
    expect(await lock.acquire('b', 60)).toBe(true);
    expect(await lock.acquire('a', 60)).toBe(false);
    expect(await lock.acquire('b', 60)).toBe(false);
  });

  it('lease expires after the window — next acquire succeeds', async () => {
    vi.useFakeTimers();
    try {
      const lock = new InMemoryFetchLock();
      expect(await lock.acquire('k', 1)).toBe(true);
      // Immediately re-acquire fails.
      expect(await lock.acquire('k', 1)).toBe(false);
      // Advance past the lease.
      vi.advanceTimersByTime(1_001);
      expect(await lock.acquire('k', 1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('release on an unheld key is a no-op', async () => {
    const lock = new InMemoryFetchLock();
    await expect(lock.release('never-held')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setFetchLock injection — module-level slot
// ---------------------------------------------------------------------------

describe('[PR 2 — v0.55] setFetchLock injection', () => {
  it('setFetchLock swaps the active backend', async () => {
    const probe: FetchLock = {
      acquire: vi.fn(async () => true),
      release: vi.fn(async () => {}),
    };
    setFetchLock(probe);
    expect(getFetchLock()).toBe(probe);

    await awaitOrFetch('k', async () => 'val');
    expect(probe.acquire).toHaveBeenCalledWith('k', DEFAULT_LEASE_SEC);
    expect(probe.release).toHaveBeenCalledWith('k');
  });

  it('resetFetchLock restores in-memory default', () => {
    const probe: FetchLock = {
      acquire: vi.fn(async () => true),
      release: vi.fn(async () => {}),
    };
    setFetchLock(probe);
    resetFetchLock();
    const restored = getFetchLock();
    expect(restored).not.toBe(probe);
    expect(restored).toBeInstanceOf(InMemoryFetchLock);
  });
});

// ---------------------------------------------------------------------------
// awaitOrFetch — leader path
// ---------------------------------------------------------------------------

describe('[PR 2 — v0.55] awaitOrFetch — leader path', () => {
  it('runs the fetcher and returns its result when the lock is acquired', async () => {
    const fetcher = vi.fn(async () => 'leader-result');
    const result = await awaitOrFetch('k', fetcher);
    expect(result).toBe('leader-result');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('releases the lock after the fetcher resolves', async () => {
    const lock = new InMemoryFetchLock();
    const releaseSpy = vi.spyOn(lock, 'release');
    await awaitOrFetch('k', async () => 'ok', { lock });
    expect(releaseSpy).toHaveBeenCalledWith('k');
  });

  it('releases the lock even when the fetcher throws — propagates the error', async () => {
    const lock = new InMemoryFetchLock();
    const releaseSpy = vi.spyOn(lock, 'release');
    const err = new Error('fetcher exploded');
    await expect(
      awaitOrFetch('k', async () => {
        throw err;
      }, { lock }),
    ).rejects.toBe(err);
    expect(releaseSpy).toHaveBeenCalledWith('k');
    // Lock is now free for the next caller.
    expect(await lock.acquire('k', 60)).toBe(true);
  });

  it('uses the explicit `leaseSec` opt over the default', async () => {
    const lock: FetchLock = {
      acquire: vi.fn(async () => true),
      release: vi.fn(async () => {}),
    };
    await awaitOrFetch('k', async () => 'ok', { lock, leaseSec: 42 });
    expect(lock.acquire).toHaveBeenCalledWith('k', 42);
  });

  it('default lease is 15 seconds — sized for worst-case BV retry budget', () => {
    expect(DEFAULT_LEASE_SEC).toBe(15);
  });

  it('default poll budget is 4.5 seconds — under engine per-tool timeout', () => {
    expect(DEFAULT_POLL_BUDGET_MS).toBe(4_500);
  });

  it('default poll interval is 100 ms — ~45 polls per coalesced fan-out', () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// awaitOrFetch — follower path
// ---------------------------------------------------------------------------

describe('[PR 2 — v0.55] awaitOrFetch — follower path', () => {
  it('follower polls the cache and returns the leader\'s value (no own fetch)', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true); // Pretend the leader holds it.

    let pollCount = 0;
    const cacheValue = 'leader-wrote-this';
    const pollCache = vi.fn(async () => {
      pollCount++;
      // Cache fills on the 2nd poll — simulates the leader's write
      // landing while the follower is mid-poll.
      return pollCount >= 2 ? cacheValue : null;
    });

    const fetcher = vi.fn(async () => 'follower-fetched-fresh');
    const result = await awaitOrFetch('k', fetcher, {
      lock,
      pollCache,
      pollIntervalMs: 5, // Make the test fast.
      pollBudgetMs: 200,
    });

    expect(result).toBe(cacheValue);
    expect(fetcher).not.toHaveBeenCalled(); // Coalesced — no follower fetch
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  it('without pollCache, follower falls through immediately to its own fetch', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);

    const fetcher = vi.fn(async () => 'follower-fetched');
    const result = await awaitOrFetch('k', fetcher, { lock /* no pollCache */ });
    expect(result).toBe('follower-fetched');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('poll budget exhausted → follower falls through to its own fetch (defensive)', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);

    const pollCache = vi.fn(async () => null); // Cache never fills.
    const fetcher = vi.fn(async () => 'fallback-fetch');

    const result = await awaitOrFetch('k', fetcher, {
      lock,
      pollCache,
      pollIntervalMs: 1,
      pollBudgetMs: 25, // Very short budget so test is quick.
    });
    expect(result).toBe('fallback-fetch');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(pollCache).toHaveBeenCalled(); // We polled at least once.
  });

  it('pollCache that throws keeps polling; eventually falls through', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);

    let pollAttempts = 0;
    const pollCache = vi.fn(async () => {
      pollAttempts++;
      throw new Error('redis blip');
    });
    const fetcher = vi.fn(async () => 'fallback');

    // Silence the warn spam.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await awaitOrFetch('k', fetcher, {
      lock,
      pollCache,
      pollIntervalMs: 1,
      pollBudgetMs: 25,
    });
    expect(result).toBe('fallback');
    expect(pollAttempts).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// awaitOrFetch — lock-backend failure modes
// ---------------------------------------------------------------------------

describe('[PR 2 — v0.55] awaitOrFetch — lock-backend failure modes', () => {
  it('lock.acquire throws → falls through to direct fetch (degraded mode)', async () => {
    const flakyLock: FetchLock = {
      acquire: vi.fn(async () => {
        throw new Error('upstash unreachable');
      }),
      release: vi.fn(async () => {}),
    };
    const fetcher = vi.fn(async () => 'direct-result');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await awaitOrFetch('k', fetcher, { lock: flakyLock });
    expect(result).toBe('direct-result');
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Release is NOT called when acquire throws (we never owned the lock).
    expect(flakyLock.release).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('lock.release that throws does not affect the leader\'s result', async () => {
    const lock: FetchLock = {
      acquire: vi.fn(async () => true),
      release: vi.fn(async () => {
        throw new Error('release failed');
      }),
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await awaitOrFetch('k', async () => 'ok', { lock });
    expect(result).toBe('ok');

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// awaitOrFetch — coalescing contract end-to-end
// ---------------------------------------------------------------------------

describe('[PR 2 — v0.55] awaitOrFetch — coalescing contract', () => {
  it('two concurrent in-process callers — leader fetches, follower polls cache', async () => {
    // Simulates the cross-instance scenario inside one process by sharing
    // a single InMemoryFetchLock + a single mutable cache between the
    // two concurrent calls. The leader runs the fetcher (which writes
    // to the shared cache); the follower polls the same cache and
    // returns without running its own fetcher.
    const lock = new InMemoryFetchLock();
    let cacheValue: string | null = null;
    let leaderFetches = 0;
    let followerFetches = 0;

    const leaderFetcher = vi.fn(async () => {
      leaderFetches++;
      // Slow leader — gives the follower time to enter and begin polling.
      await new Promise((r) => setTimeout(r, 30));
      cacheValue = 'shared-cache-write';
      return cacheValue;
    });

    const followerFetcher = vi.fn(async () => {
      followerFetches++;
      return 'follower-direct-fetch';
    });

    const pollCache = async () => cacheValue;

    const [leaderResult, followerResult] = await Promise.all([
      awaitOrFetch('k', leaderFetcher, {
        lock,
        pollCache,
        pollIntervalMs: 5,
        pollBudgetMs: 500,
      }),
      // Tiny stagger so leader gets the lock first.
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve(
            awaitOrFetch('k', followerFetcher, {
              lock,
              pollCache,
              pollIntervalMs: 5,
              pollBudgetMs: 500,
            }),
          );
        }, 5);
      }),
    ]);

    expect(leaderResult).toBe('shared-cache-write');
    expect(followerResult).toBe('shared-cache-write');
    expect(leaderFetches).toBe(1);
    expect(followerFetches).toBe(0); // Coalesced — follower never fetched
  });

  it('different keys do NOT coalesce — both run their fetchers', async () => {
    const lock = new InMemoryFetchLock();
    const fetcherA = vi.fn(async () => 'a');
    const fetcherB = vi.fn(async () => 'b');

    const [a, b] = await Promise.all([
      awaitOrFetch('key-a', fetcherA, { lock }),
      awaitOrFetch('key-b', fetcherB, { lock }),
    ]);
    expect(a).toBe('a');
    expect(b).toBe('b');
    expect(fetcherA).toHaveBeenCalledTimes(1);
    expect(fetcherB).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// awaitOrFetch — abort signal
// ---------------------------------------------------------------------------

describe('[PR 2 — v0.55] awaitOrFetch — abort signal', () => {
  it('aborting mid-poll throws AbortError', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);

    const controller = new AbortController();
    const pollCache = vi.fn(async () => null); // Never fills.
    const fetcher = vi.fn(async () => 'never');

    const promise = awaitOrFetch('k', fetcher, {
      lock,
      pollCache,
      pollIntervalMs: 50,
      pollBudgetMs: 5_000,
      signal: controller.signal,
    });

    // Abort after a tick so we're definitely inside the sleep.
    setTimeout(() => controller.abort(), 5);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    // We never fell through to a direct fetch — the abort terminated us.
    expect(fetcher).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// awaitOrFetch — jitter behaves
// ---------------------------------------------------------------------------

describe('[PR 2 — v0.55] awaitOrFetch — jitter', () => {
  it('rng controls poll-interval jitter (deterministic test seam)', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);

    const sleepWaits: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      sleepWaits.push(ms);
    });

    // rng() always returns 0.5 → jitterPx = (0.5 * 0.4 - 0.2) * 100 = 0
    // → wait = 100 + 0 = 100ms (no jitter).
    const rng = () => 0.5;
    const pollCache = vi.fn(async () => null);

    let nowVal = 0;
    const now = () => nowVal;

    const fetcher = vi.fn(async () => 'fallback');

    // Drive `now` forward so the loop terminates after a few sleeps.
    sleep.mockImplementation(async (ms: number) => {
      sleepWaits.push(ms);
      nowVal += ms;
    });

    await awaitOrFetch('k', fetcher, {
      lock,
      pollCache,
      pollIntervalMs: 100,
      pollBudgetMs: 250, // ~2-3 polls
      rng,
      sleep,
      now,
    });

    // Every recorded sleep should be exactly 100ms (jitter is zero).
    for (const wait of sleepWaits) {
      expect(wait).toBe(100);
    }
    // Defensive degradation triggered after budget exhausted.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rng=0 → jitter pulls wait DOWN by 20%', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);

    const sleepWaits: number[] = [];
    let nowVal = 0;
    const now = () => nowVal;
    const sleep = vi.fn(async (ms: number) => {
      sleepWaits.push(ms);
      nowVal += ms;
    });

    await awaitOrFetch('k', async () => 'fallback', {
      lock,
      pollCache: async () => null,
      pollIntervalMs: 100,
      pollBudgetMs: 250,
      rng: () => 0, // jitterPx = (0 * 0.4 - 0.2) * 100 = -20 → wait = 80
      sleep,
      now,
    });

    for (const wait of sleepWaits) {
      expect(wait).toBe(80);
    }
  });

  it('rng=1 → jitter pulls wait UP by 20%', async () => {
    const lock = new InMemoryFetchLock();
    expect(await lock.acquire('k', 60)).toBe(true);

    const sleepWaits: number[] = [];
    let nowVal = 0;
    const now = () => nowVal;
    const sleep = vi.fn(async (ms: number) => {
      sleepWaits.push(ms);
      nowVal += ms;
    });

    await awaitOrFetch('k', async () => 'fallback', {
      lock,
      pollCache: async () => null,
      pollIntervalMs: 100,
      pollBudgetMs: 250,
      rng: () => 1, // jitterPx = (1 * 0.4 - 0.2) * 100 = 20 → wait = 120
      sleep,
      now,
    });

    for (const wait of sleepWaits) {
      expect(wait).toBe(120);
    }
  });
});
