/**
 * Unit tests for `settle-metrics.ts` — pin the log-line format the
 * Vercel filter recipes (in the helper's docstring) depend on. Anyone
 * editing the formatter MUST run these tests; a silent format change
 * would invisibly break the founder's saved Vercel queries.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { logSettleEvent } from './settle-metrics';

let logSpy: MockInstance<typeof console.log>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

describe('logSettleEvent — classify event line format', () => {
  it('emits a single line with prefix + event + flat key=value fields for deliverable', () => {
    logSettleEvent({
      event: 'classify',
      fields: {
        route: 'openai/v1/images/generations',
        verdict: 'deliverable',
        durationMs: 14203,
        chargeAmount: '0.05',
      },
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe(
      '[mpp.settle] event=classify route=openai/v1/images/generations verdict=deliverable durationMs=14203 chargeAmount=0.05',
    );
  });

  it('emits chargedFraction only for verdict=mixed', () => {
    logSettleEvent({
      event: 'classify',
      fields: {
        route: 'openai/v1/images/generations',
        verdict: 'mixed',
        durationMs: 18901,
        chargeAmount: '0.0375',
        chargedFraction: 0.75,
      },
    });

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('verdict=mixed');
    expect(line).toContain('chargeAmount=0.0375');
    expect(line).toContain('chargedFraction=0.75');
  });

  it('omits chargeAmount entirely for verdict=refundable (no charge happened)', () => {
    logSettleEvent({
      event: 'classify',
      fields: {
        route: 'openai/v1/images/generations',
        verdict: 'refundable',
        durationMs: 1287,
      },
    });

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toBe(
      '[mpp.settle] event=classify route=openai/v1/images/generations verdict=refundable durationMs=1287',
    );
    expect(line).not.toContain('chargeAmount');
    expect(line).not.toContain('chargedFraction');
  });
});

describe('logSettleEvent — charge_failed event', () => {
  it('emits absorbedCostUsd for the D-9 weekly-sum recipe', () => {
    logSettleEvent({
      event: 'charge_failed',
      fields: {
        route: 'openai/v1/images/generations',
        reason: 'Sui chain congestion',
        absorbedCostUsd: '0.05',
      },
    });

    expect(logSpy.mock.calls[0][0]).toBe(
      '[mpp.settle] event=charge_failed route=openai/v1/images/generations reason=Sui chain congestion absorbedCostUsd=0.05',
    );
  });
});

describe('logSettleEvent — idempotency_hit event', () => {
  it('emits the route only — D-9 counter just needs the count', () => {
    logSettleEvent({
      event: 'idempotency_hit',
      fields: { route: 'openai/v1/images/generations' },
    });

    expect(logSpy.mock.calls[0][0]).toBe(
      '[mpp.settle] event=idempotency_hit route=openai/v1/images/generations',
    );
  });
});

describe('logSettleEvent — value sanitization (Vercel log fragmentation defense)', () => {
  it('strips newlines from free-text reason so the line stays single-record', () => {
    logSettleEvent({
      event: 'charge_failed',
      fields: {
        route: 'x/y',
        reason: 'multi\nline\nerror message',
        absorbedCostUsd: '0.05',
      },
    });

    const line = logSpy.mock.calls[0][0] as string;
    // The whole reason becomes one space-separated string.
    expect(line).toContain('reason=multi line error message');
    // Critically: no \n anywhere in the line.
    expect(line).not.toContain('\n');
  });

  it('caps free-text values at 200 chars so the Vercel UI stays readable', () => {
    const longReason = 'x'.repeat(500);
    logSettleEvent({
      event: 'charge_failed',
      fields: { route: 'x/y', reason: longReason, absorbedCostUsd: '0.05' },
    });

    const line = logSpy.mock.calls[0][0] as string;
    const reasonField = line.match(/reason=(\S+(?:\s\S+)*?) absorbedCostUsd/);
    expect(reasonField).toBeTruthy();
    expect(reasonField![1].length).toBeLessThanOrEqual(200);
  });

  it('collapses internal whitespace runs (tabs, multiple spaces) to single space', () => {
    logSettleEvent({
      event: 'charge_failed',
      fields: {
        route: 'x/y',
        reason: 'spaced    out\t\twith\ttabs',
        absorbedCostUsd: '0.05',
      },
    });

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('reason=spaced out with tabs');
  });
});

describe('logSettleEvent — emits exactly one console.log call per event', () => {
  it('every event maps to exactly one log line (Vercel: one record)', () => {
    logSettleEvent({
      event: 'classify',
      fields: { route: 'a/b', verdict: 'deliverable', durationMs: 100, chargeAmount: '0.01' },
    });
    logSettleEvent({
      event: 'idempotency_hit',
      fields: { route: 'a/b' },
    });
    logSettleEvent({
      event: 'charge_failed',
      fields: { route: 'a/b', reason: 'x', absorbedCostUsd: '0.01' },
    });

    expect(logSpy).toHaveBeenCalledTimes(3);
  });
});
