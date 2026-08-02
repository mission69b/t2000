import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approxUsdValue, assertLimitConfig, LimitEnforcer, MemoryLimitEnforcer } from './enforce.js';
import { LimitExceededError } from './errors.js';
import { readLimitsFile, todayUtc } from './config.js';

describe('approxUsdValue', () => {
  it('treats stables as 1:1 USD', () => {
    expect(approxUsdValue('USDC', 10)).toBe(10);
    expect(approxUsdValue('usdsui', 5)).toBe(5);
  });
  it('returns null for SUI / unknown (not gated)', () => {
    expect(approxUsdValue('SUI', 3)).toBeNull();
    expect(approxUsdValue('WAL', 100)).toBeNull();
  });
});

describe('assertLimitConfig (pure gate)', () => {
  const base = { spentTodayUsd: 0, operation: 'send' as const };

  it('passes when no limits set', () => {
    expect(() => assertLimitConfig({ ...base, limits: undefined, amountUsd: 999 })).not.toThrow();
  });
  it('passes for non-positive amount (e.g. SUI → 0)', () => {
    expect(() => assertLimitConfig({ ...base, limits: { perTxUsd: 1 }, amountUsd: 0 })).not.toThrow();
  });
  it('blocks over perTxUsd', () => {
    expect(() => assertLimitConfig({ ...base, limits: { perTxUsd: 25 }, amountUsd: 30 })).toThrow(LimitExceededError);
  });
  it('allows at/under perTxUsd', () => {
    expect(() => assertLimitConfig({ ...base, limits: { perTxUsd: 25 }, amountUsd: 25 })).not.toThrow();
  });
  it('blocks when CUMULATIVE daily would exceed dailyUsd', () => {
    expect(() =>
      assertLimitConfig({ ...base, limits: { dailyUsd: 100 }, spentTodayUsd: 90, amountUsd: 20 }),
    ).toThrow(LimitExceededError);
  });
  it('allows when cumulative daily stays within dailyUsd', () => {
    expect(() =>
      assertLimitConfig({ ...base, limits: { dailyUsd: 100 }, spentTodayUsd: 90, amountUsd: 10 }),
    ).not.toThrow();
  });
  it('force bypasses everything', () => {
    expect(() =>
      assertLimitConfig({ ...base, limits: { perTxUsd: 1, dailyUsd: 1 }, spentTodayUsd: 100, amountUsd: 999, force: true }),
    ).not.toThrow();
  });
});

describe('LimitEnforcer (file-backed, cumulative daily)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't2000-limits-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('set/get round-trips limits', () => {
    const e = new LimitEnforcer(dir);
    e.setLimits({ perTxUsd: 25, dailyUsd: 100 });
    expect(e.getLimits()).toEqual({ perTxUsd: 25, dailyUsd: 100 });
    expect(e.hasLimits()).toBe(true);
  });

  it('enforces per-tx + accumulates daily across writes', () => {
    const e = new LimitEnforcer(dir);
    e.setLimits({ perTxUsd: 50, dailyUsd: 100 });

    // single write over per-tx → blocked
    expect(() => e.assert({ operation: 'send', amountUsd: 60 })).toThrow(/per-transaction/i);

    // three $40 writes: first two ok, the third pushes cumulative 80→120 > 100 → blocked
    e.assert({ operation: 'send', amountUsd: 40 });
    e.record(40);
    e.assert({ operation: 'swap', amountUsd: 40 });
    e.record(40);
    expect(e.dailySpentToday()).toBe(80);
    expect(() => e.assert({ operation: 'pay', amountUsd: 40 })).toThrow(/daily spend/i);

    // force overrides
    expect(() => e.assert({ operation: 'pay', amountUsd: 40, force: true })).not.toThrow();
  });

  it('resets the daily total on UTC date rollover', () => {
    const e = new LimitEnforcer(dir);
    e.setLimits({ dailyUsd: 100 });
    // seed yesterday's ledger directly
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ limits: { dailyUsd: 100 }, dailySpend: { date: '2000-01-01', usd: 95 } }),
    );
    expect(e.dailySpentToday()).toBe(0); // stale date → 0
    expect(() => e.assert({ operation: 'send', amountUsd: 90 })).not.toThrow(); // not 95+90
  });

  it('migrates legacy dailySendUsd → dailyUsd on read', () => {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ limits: { perTxUsd: 10, dailySendUsd: 50 } }));
    expect(readLimitsFile(dir).limits).toEqual({ perTxUsd: 10, dailyUsd: 50 });
  });

  it('record() rolls the date forward and increments', () => {
    const e = new LimitEnforcer(dir);
    e.record(10);
    e.record(5);
    expect(e.dailySpentToday()).toBe(15);
    expect(readLimitsFile(dir).dailySpend).toEqual({ date: todayUtc(), usd: 15 });
  });
});

describe('MemoryLimitEnforcer (signer-mode / Connect — zero disk I/O)', () => {
  it('starts unset and passes like a fresh config', () => {
    const e = new MemoryLimitEnforcer();
    expect(e.hasLimits()).toBe(false);
    expect(e.getLimits()).toBeUndefined();
    expect(() => e.assert({ operation: 'pay', amountUsd: 999 })).not.toThrow();
  });

  it('keeps the same gate semantics in memory', () => {
    const e = new MemoryLimitEnforcer();
    e.setLimits({ perTxUsd: 25, dailyUsd: 100 });
    expect(e.hasLimits()).toBe(true);
    expect(() => e.assert({ operation: 'pay', amountUsd: 30 })).toThrow(LimitExceededError);
    e.record(90);
    expect(e.dailySpentToday()).toBe(90);
    expect(() => e.assert({ operation: 'send', amountUsd: 20 })).toThrow(LimitExceededError);
    expect(() => e.assert({ operation: 'send', amountUsd: 10 })).not.toThrow();
    // force overrides, matching the file enforcer
    expect(() => e.assert({ operation: 'pay', amountUsd: 999, force: true })).not.toThrow();
    e.clearLimits();
    expect(e.hasLimits()).toBe(false);
  });

  it('never writes the config file on record()', () => {
    const dir = mkdtempSync(join(tmpdir(), 't2000-mem-'));
    try {
      const e = new MemoryLimitEnforcer();
      e.record(10);
      e.record(2.5);
      expect(e.dailySpentToday()).toBe(12.5);
      // The parent class would have written dailySpend here; memory must not.
      expect(readLimitsFile(dir).dailySpend).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resets the in-memory daily total on UTC rollover', () => {
    const e = new MemoryLimitEnforcer();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T23:59:00Z'));
    e.record(95);
    expect(e.dailySpentToday()).toBe(95);
    vi.setSystemTime(new Date('2026-08-03T00:01:00Z'));
    expect(e.dailySpentToday()).toBe(0);
    e.record(5);
    expect(e.dailySpentToday()).toBe(5);
    vi.useRealTimers();
  });
});
