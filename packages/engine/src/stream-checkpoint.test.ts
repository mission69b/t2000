// ---------------------------------------------------------------------------
// stream-checkpoint.test.ts — StreamCheckpointStore contract + detectInFlightTool
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 5 Slice C — cases 11, 12 + helper unit tests.
// (Cases 1–10 live in `v2/engine-checkpoint.test.ts` because they
// exercise the AISDKEngine.submitMessage wiring, not the store contract.)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InMemoryStreamCheckpointStore,
  detectInFlightTool,
} from './stream-checkpoint.js';
import type { EngineEvent } from './types.js';

const sample = (n: number): EngineEvent => ({
  type: 'text_delta',
  text: `chunk ${n}`,
});

describe('InMemoryStreamCheckpointStore — contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // [v2.5.0 5e-4] AbortSignal honored mid-replay — host-side cancel
  // (consumer gone, fresh submitMessage starting, etc) lets the store
  // skip yielding the rest of the log without throwing.
  it('replay honors AbortSignal aborted BEFORE first yield (no events emitted)', async () => {
    vi.useRealTimers();
    const store = new InMemoryStreamCheckpointStore();
    await store.append('s1', sample(1));
    await store.append('s1', sample(2));
    await store.append('s1', sample(3));

    const controller = new AbortController();
    controller.abort();
    const out: EngineEvent[] = [];
    for await (const ev of store.replay('s1', { signal: controller.signal })) {
      out.push(ev);
    }
    expect(out).toEqual([]);
  });

  it('replay honors AbortSignal aborted MID-yield (partial events emitted)', async () => {
    vi.useRealTimers();
    const store = new InMemoryStreamCheckpointStore();
    for (let i = 1; i <= 5; i++) await store.append('s1', sample(i));

    const controller = new AbortController();
    const out: EngineEvent[] = [];
    for await (const ev of store.replay('s1', { signal: controller.signal })) {
      out.push(ev);
      if (out.length === 2) controller.abort();
    }
    // First 2 yielded before abort; loop body aborts AFTER pushing #2.
    // Next iteration checks signal at top → exits. Total = 2 events.
    expect(out).toHaveLength(2);
    expect(out.map((e) => (e as { text: string }).text)).toEqual([
      'chunk 1',
      'chunk 2',
    ]);
  });

  it('replay without signal works as before (back-compat)', async () => {
    vi.useRealTimers();
    const store = new InMemoryStreamCheckpointStore();
    for (let i = 1; i <= 3; i++) await store.append('s1', sample(i));

    const out: EngineEvent[] = [];
    for await (const ev of store.replay('s1')) out.push(ev);
    expect(out).toHaveLength(3);
  });

  it('replay with non-aborted signal yields all events', async () => {
    vi.useRealTimers();
    const store = new InMemoryStreamCheckpointStore();
    for (let i = 1; i <= 3; i++) await store.append('s1', sample(i));

    const controller = new AbortController();
    const out: EngineEvent[] = [];
    for await (const ev of store.replay('s1', { signal: controller.signal })) {
      out.push(ev);
    }
    expect(out).toHaveLength(3);
  });

  it('append returns 1-indexed monotonic sequence numbers per streamId', async () => {
    const store = new InMemoryStreamCheckpointStore();
    expect(await store.append('s1', sample(1))).toBe(1);
    expect(await store.append('s1', sample(2))).toBe(2);
    expect(await store.append('s1', sample(3))).toBe(3);
  });

  it('replay yields events in append order; empty when streamId unknown', async () => {
    const store = new InMemoryStreamCheckpointStore();
    await store.append('s1', sample(1));
    await store.append('s1', sample(2));

    const replayed: EngineEvent[] = [];
    for await (const ev of store.replay('s1')) replayed.push(ev);
    expect(replayed).toEqual([sample(1), sample(2)]);

    const empty: EngineEvent[] = [];
    for await (const ev of store.replay('unknown')) empty.push(ev);
    expect(empty).toEqual([]);
  });

  it('clear removes the stream and is idempotent', async () => {
    const store = new InMemoryStreamCheckpointStore();
    await store.append('s1', sample(1));
    expect(await store.has!('s1')).toBe(true);

    await store.clear('s1');
    expect(await store.has!('s1')).toBe(false);

    // Idempotent: second clear is a no-op.
    await expect(store.clear('s1')).resolves.toBeUndefined();
    await expect(store.clear('never-existed')).resolves.toBeUndefined();
  });

  // Case 11 — TTL eviction (default 5 min; we override to 100ms for the test)
  it('case 11 — evicts stream after TTL elapses', async () => {
    const store = new InMemoryStreamCheckpointStore({ ttlMs: 100 });
    await store.append('s1', sample(1));
    expect(await store.has!('s1')).toBe(true);

    await vi.advanceTimersByTimeAsync(150);

    expect(await store.has!('s1')).toBe(false);
    const replayed: EngineEvent[] = [];
    for await (const ev of store.replay('s1')) replayed.push(ev);
    expect(replayed).toEqual([]);
  });

  it('TTL resets on every append (long stream stays alive)', async () => {
    const store = new InMemoryStreamCheckpointStore({ ttlMs: 100 });
    await store.append('s1', sample(1));
    await vi.advanceTimersByTimeAsync(60);
    await store.append('s1', sample(2));
    await vi.advanceTimersByTimeAsync(60);
    await store.append('s1', sample(3));

    // Total elapsed = 120ms, but TTL was reset twice — stream should still exist.
    expect(await store.has!('s1')).toBe(true);

    await vi.advanceTimersByTimeAsync(150);
    expect(await store.has!('s1')).toBe(false);
  });

  // Case 12 — Concurrent streams are independent
  it('case 12 — independent streams have independent sequence numbers and logs', async () => {
    const store = new InMemoryStreamCheckpointStore();
    expect(await store.append('s1', sample(1))).toBe(1);
    expect(await store.append('s2', sample(100))).toBe(1);
    expect(await store.append('s1', sample(2))).toBe(2);
    expect(await store.append('s2', sample(101))).toBe(2);
    expect(await store.append('s1', sample(3))).toBe(3);

    const s1: EngineEvent[] = [];
    for await (const ev of store.replay('s1')) s1.push(ev);
    expect(s1).toEqual([sample(1), sample(2), sample(3)]);

    const s2: EngineEvent[] = [];
    for await (const ev of store.replay('s2')) s2.push(ev);
    expect(s2).toEqual([sample(100), sample(101)]);

    expect(store.size).toBe(2);

    // Clearing one stream doesn't touch the other.
    await store.clear('s1');
    expect(store.size).toBe(1);
    expect(await store.has!('s1')).toBe(false);
    expect(await store.has!('s2')).toBe(true);
  });

  it('clear cancels the pending TTL timer', async () => {
    const store = new InMemoryStreamCheckpointStore({ ttlMs: 100 });
    await store.append('s1', sample(1));
    await store.clear('s1');

    // Re-append the same streamId; the original TTL must NOT fire and
    // evict this fresh content.
    await store.append('s1', sample(99));
    await vi.advanceTimersByTimeAsync(60);
    expect(await store.has!('s1')).toBe(true);
  });
});

describe('detectInFlightTool', () => {
  it('returns null when every tool_start has a matching tool_result', () => {
    const events: EngineEvent[] = [
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 't1',
        result: {},
        isError: false,
      },
      {
        type: 'tool_start',
        toolName: 'rates_info',
        toolUseId: 't2',
        input: {},
      },
      {
        type: 'tool_result',
        toolName: 'rates_info',
        toolUseId: 't2',
        result: {},
        isError: false,
      },
    ];
    expect(detectInFlightTool(events)).toBeNull();
  });

  it('returns the dangling tool_start when its result is missing', () => {
    const events: EngineEvent[] = [
      { type: 'tool_start', toolName: 'balance_check', toolUseId: 't1', input: {} },
      {
        type: 'tool_result',
        toolName: 'balance_check',
        toolUseId: 't1',
        result: {},
        isError: false,
      },
      {
        type: 'tool_start',
        toolName: 'navi_lend',
        toolUseId: 't2',
        input: {},
      },
      // No t2 tool_result — stream was killed mid-tool.
    ];
    expect(detectInFlightTool(events)).toEqual({
      toolUseId: 't2',
      toolName: 'navi_lend',
    });
  });

  it('returns the LAST dangling tool_start when multiple are in-flight', () => {
    const events: EngineEvent[] = [
      { type: 'tool_start', toolName: 'a', toolUseId: 't1', input: {} },
      { type: 'tool_start', toolName: 'b', toolUseId: 't2', input: {} },
    ];
    // Last dangling is t2; we surface it (most recent head-of-line).
    expect(detectInFlightTool(events)).toEqual({ toolUseId: 't2', toolName: 'b' });
  });

  it('returns null on an empty event list', () => {
    expect(detectInFlightTool([])).toBeNull();
  });

  it('ignores non-tool events entirely', () => {
    const events: EngineEvent[] = [
      { type: 'text_delta', text: 'hi' },
      { type: 'turn_complete', stopReason: 'end_turn' },
    ];
    expect(detectInFlightTool(events)).toBeNull();
  });
});
