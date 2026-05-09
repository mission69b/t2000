// ---------------------------------------------------------------------------
// Bounded poll-on-balance-delta replacement for the fixed 1500ms post-write
// sleep that waits for the Sui RPC owned-coin index to catch up.
//
// Why this exists
// ---------------
// SPEC 19 Phase A telemetry (engine v1.24.9 spike, 2026-05-09) showed the
// hardcoded 1500ms sleep in `runPostWriteRefresh` accounted for 59-64% of
// post-write refresh wall-clock. The sleep was originally added in v0.46.16
// to mask Sui RPC owned-coin indexer lag (~500-1500ms after the tx is
// settled in a checkpoint). It used the worst-case duration on EVERY write
// even though the median case has the indexer caught up well before 1500ms.
//
// This helper preserves the SAME correctness contract — never proceed with
// post-write refresh until the indexer has caught up — but exits early on
// the first detected balance delta vs a baseline captured before cache
// invalidation. Median win is ~500-1200ms per write; worst case (no delta
// detected within ceiling) is identical to the old fixed-sleep behavior.
//
// Contract
// --------
//   1. Capture baseline `Map<coinType, balance>` via Sui RPC BEFORE the
//      cache invalidation runs. Baseline failure → fall back to fixed
//      sleep (correctness preserved; same behavior as pre-A1).
//   2. Poll every `pollIntervalMs` for a balance delta vs baseline.
//   3. Exit early on first detected change → indexer caught up.
//   4. Hit ceiling at `ceilingMs` → exit defensively (same as old fixed
//      sleep — never wait longer than the original guarantee).
//   5. Aborted mid-poll → exit immediately, return `'aborted'`.
//
// What "delta" means
// ------------------
//   - ANY coin's balance differs from baseline → delta detected.
//   - A new coin appears (e.g. SUI received from a swap) → delta.
//   - An existing coin disappears (rare but possible if a coin object is
//     fully consumed) → delta.
//   - Same `Map.size` AND same `(coinType, balance)` for every coin →
//     no delta (indexer hasn't updated yet).
//
// Why not "wait for two consecutive identical polls" (no baseline)
// ----------------------------------------------------------------
// "Stable-stale-stale" is indistinguishable from "stable-stable-post-write"
// without the baseline. We need to know what the pre-write state was to
// know that we've moved past it.
//
// Failure modes (all fail-open)
// -----------------------------
//   - `suiRpcUrl` missing → fall back to fixed sleep.
//   - `address` missing → fall back to fixed sleep.
//   - Baseline fetch throws → fall back to fixed sleep.
//   - Single poll attempt throws → log warn, treat as "no change", continue
//     polling. (Don't bail just because one RPC call flaked.)
// ---------------------------------------------------------------------------

import { fetchWalletCoins } from './sui/rpc.js';

export type PostWritePollOutcome =
  | 'detected_change'        // baseline differs from current → exit early
  | 'ceiling'                // ceilingMs elapsed without delta → exit defensively
  | 'aborted'                // signal aborted → exit immediately
  | 'fallback_no_baseline'   // baseline fetch failed → fixed-sleep behavior
  | 'fallback_no_address'    // no walletAddress → fixed-sleep behavior
  | 'fallback_no_rpc';       // no rpcUrl → fixed-sleep behavior

export interface PostWritePollResult {
  outcome: PostWritePollOutcome;
  /** Number of poll attempts made (0 if fallback fired before polling). */
  attempts: number;
  /** Wall-clock ms from `pollForIndexerCatchup` entry to return. */
  resolvedAtMs: number;
}

export interface PostWritePollOptions {
  suiRpcUrl: string | undefined;
  address: string | undefined;
  /** Hard ceiling on total wait time. Default 1500ms (matches old fixed sleep). */
  ceilingMs: number;
  /** Wait between poll attempts. Default 250ms. */
  pollIntervalMs: number;
  signal: AbortSignal;
}

export async function pollForIndexerCatchup(
  options: PostWritePollOptions,
): Promise<PostWritePollResult> {
  const { suiRpcUrl, address, ceilingMs, pollIntervalMs, signal } = options;
  const start = Date.now();

  if (!suiRpcUrl) {
    await sleepWithFallback(ceilingMs, signal);
    return {
      outcome: 'fallback_no_rpc',
      attempts: 0,
      resolvedAtMs: Date.now() - start,
    };
  }
  if (!address) {
    await sleepWithFallback(ceilingMs, signal);
    return {
      outcome: 'fallback_no_address',
      attempts: 0,
      resolvedAtMs: Date.now() - start,
    };
  }

  let baseline: Map<string, bigint>;
  try {
    const coins = await fetchWalletCoins(address, suiRpcUrl);
    baseline = new Map(
      coins.map((c) => [c.coinType, BigInt(c.totalBalance)]),
    );
  } catch (err) {
    console.warn(
      '[post-write-poll] baseline fetch failed; falling back to fixed sleep:',
      err,
    );
    await sleepWithFallback(ceilingMs, signal);
    return {
      outcome: 'fallback_no_baseline',
      attempts: 0,
      resolvedAtMs: Date.now() - start,
    };
  }

  // Number of poll attempts that fit under the ceiling. With default
  // 250ms interval and 1500ms ceiling, that's 6 attempts max — first
  // poll at t=250ms, last at t=1500ms.
  const maxAttempts = Math.max(1, Math.floor(ceilingMs / pollIntervalMs));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) {
      return {
        outcome: 'aborted',
        attempts: attempt - 1,
        resolvedAtMs: Date.now() - start,
      };
    }

    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, pollIntervalMs);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });

    if (signal.aborted) {
      return {
        outcome: 'aborted',
        attempts: attempt,
        resolvedAtMs: Date.now() - start,
      };
    }

    let current: Map<string, bigint>;
    try {
      const coins = await fetchWalletCoins(address, suiRpcUrl);
      current = new Map(
        coins.map((c) => [c.coinType, BigInt(c.totalBalance)]),
      );
    } catch (err) {
      // Fail-open: don't bail just because one RPC call flaked. The
      // indexer might be caught up by the next attempt.
      console.warn(
        `[post-write-poll] poll attempt ${attempt} failed; continuing:`,
        err,
      );
      continue;
    }

    if (balancesDiffer(baseline, current)) {
      return {
        outcome: 'detected_change',
        attempts: attempt,
        resolvedAtMs: Date.now() - start,
      };
    }
  }

  return {
    outcome: 'ceiling',
    attempts: maxAttempts,
    resolvedAtMs: Date.now() - start,
  };
}

function balancesDiffer(
  a: Map<string, bigint>,
  b: Map<string, bigint>,
): boolean {
  if (a.size !== b.size) return true;
  for (const [coinType, balance] of a) {
    if (b.get(coinType) !== balance) return true;
  }
  return false;
}

async function sleepWithFallback(
  ms: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}
