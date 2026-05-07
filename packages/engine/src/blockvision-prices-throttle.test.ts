/**
 * [S18-F4 / vercel-logs L11] Tests for `mapWithConcurrency` — the
 * bounded fan-out helper that caps BlockVision per-protocol parallelism
 * at DEFI_PROTOCOL_CONCURRENCY (=3) per portfolio fetch.
 *
 * Inline next to source per `coding-discipline.mdc` ("New engine tests
 * follow the inline convention"). The pre-existing __tests__/ tests for
 * blockvision-prices.ts are grandfathered; new helpers go inline.
 */

import { describe, it, expect } from 'vitest';
import {
  __internal_mapWithConcurrency as mapWithConcurrency,
  __internal_DEFI_PROTOCOL_CONCURRENCY as DEFI_PROTOCOL_CONCURRENCY,
} from './blockvision-prices';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('returns Promise.allSettled-shaped results in input order', async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      async (n) => n * 10,
      2,
    );

    expect(results).toHaveLength(5);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      10, 20, 30, 40, 50,
    ]);
  });

  it('preserves rejection in the same slot as the input that threw', async () => {
    const results = await mapWithConcurrency(
      ['a', 'fail', 'b'],
      async (s) => {
        if (s === 'fail') throw new Error('boom');
        return s.toUpperCase();
      },
      2,
    );

    expect(results[0]).toEqual({ status: 'fulfilled', value: 'A' });
    expect(results[1].status).toBe('rejected');
    if (results[1].status === 'rejected') {
      expect((results[1].reason as Error).message).toBe('boom');
    }
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'B' });
  });

  it('caps concurrent in-flight executions at the requested limit', async () => {
    let inflight = 0;
    let peakInflight = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(
      items,
      async (n) => {
        inflight += 1;
        peakInflight = Math.max(peakInflight, inflight);
        await sleep(20);
        inflight -= 1;
        return n;
      },
      3,
    );

    expect(peakInflight).toBeLessThanOrEqual(3);
    expect(peakInflight).toBeGreaterThan(0);
  });

  it('handles empty input', async () => {
    const results = await mapWithConcurrency([], async (n: number) => n, 5);
    expect(results).toEqual([]);
  });

  it('handles concurrency > items length without spawning excess workers', async () => {
    let workersStarted = 0;
    await mapWithConcurrency(
      [1, 2, 3],
      async (n) => {
        workersStarted += 1;
        await sleep(5);
        return n;
      },
      100,
    );
    expect(workersStarted).toBe(3);
  });

  it('handles concurrency = 1 (effectively serial)', async () => {
    const order: number[] = [];
    await mapWithConcurrency(
      [1, 2, 3, 4],
      async (n) => {
        order.push(n);
        await sleep(5);
        return n;
      },
      1,
    );
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('passes index to the worker function', async () => {
    const seenIndices: number[] = [];
    await mapWithConcurrency(
      ['a', 'b', 'c'],
      async (_, idx) => {
        seenIndices.push(idx);
        return idx;
      },
      2,
    );
    expect(seenIndices.sort()).toEqual([0, 1, 2]);
  });

  it('still completes when ALL items reject', async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3],
      async () => {
        throw new Error('always');
      },
      2,
    );
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
  });

  it('exports DEFI_PROTOCOL_CONCURRENCY = 3', () => {
    expect(DEFI_PROTOCOL_CONCURRENCY).toBe(3);
  });

  it('completes 9-item fan-out at concurrency=3 in roughly 3 batches', async () => {
    const t0 = Date.now();
    await mapWithConcurrency(
      Array.from({ length: 9 }, (_, i) => i),
      async () => {
        await sleep(50);
      },
      3,
    );
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(elapsed).toBeLessThan(250);
  });
});
