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
  // [v1.0.2 hotfix / 2026-05-14] chargeAmount was REMOVED from event=classify
  // because the field fired BEFORE mppx.charge ran, producing two
  // false-alarm-counting incidents in 24 hours. Truth signal lives on
  // event=charge_succeeded now (see the dedicated describe block below).
  it('emits a single line with prefix + event + flat key=value fields for deliverable', () => {
    logSettleEvent({
      event: 'classify',
      fields: {
        route: 'openai/v1/images/generations',
        verdict: 'deliverable',
        durationMs: 14203,
      },
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe(
      '[mpp.settle] event=classify route=openai/v1/images/generations verdict=deliverable durationMs=14203',
    );
  });

  it('emits chargedFraction only for verdict=mixed (no chargeAmount on classify post-hotfix)', () => {
    logSettleEvent({
      event: 'classify',
      fields: {
        route: 'openai/v1/images/generations',
        verdict: 'mixed',
        durationMs: 18901,
        chargedFraction: 0.75,
      },
    });

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('verdict=mixed');
    expect(line).toContain('chargedFraction=0.75');
    expect(line).not.toContain('chargeAmount');
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

  it('includes reason field for refundable / probe-failed (operator diagnostic surface)', () => {
    logSettleEvent({
      event: 'classify',
      fields: {
        route: 'openai/v1/images/generations',
        verdict: 'refundable',
        durationMs: 738,
        reason: 'probe-failed: ECONNRESET',
      },
    });

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('reason=probe-failed: ECONNRESET');
  });
});

describe('logSettleEvent — charge_succeeded event (v1.0.2 truth signal)', () => {
  // The whole point of this event: count(event=charge_succeeded) over a
  // window === true on-chain charge count for that window. Pre-hotfix
  // founders inferred charge counts from event=classify chargeAmount=…
  // and got fooled twice (4 classify lines vs 1 charge in the 06:19
  // smoke). This event fires ONLY after mppx.charge returns 200, so
  // the count is mathematically the truth.
  it('emits a single line with route + chargeAmount', () => {
    logSettleEvent({
      event: 'charge_succeeded',
      fields: {
        route: 'openai/v1/images/generations',
        chargeAmount: '0.05',
      },
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe(
      '[mpp.settle] event=charge_succeeded route=openai/v1/images/generations chargeAmount=0.05',
    );
  });

  it('emits the fractional chargeAmount for mixed-verdict charges', () => {
    logSettleEvent({
      event: 'charge_succeeded',
      fields: {
        route: 'openai/v1/images/generations',
        chargeAmount: '0.037500',
      },
    });

    expect(logSpy.mock.calls[0][0]).toContain('chargeAmount=0.037500');
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
      fields: { route: 'a/b', verdict: 'deliverable', durationMs: 100 },
    });
    logSettleEvent({
      event: 'charge_succeeded',
      fields: { route: 'a/b', chargeAmount: '0.01' },
    });
    logSettleEvent({
      event: 'idempotency_hit',
      fields: { route: 'a/b' },
    });
    logSettleEvent({
      event: 'charge_failed',
      fields: { route: 'a/b', reason: 'x', absorbedCostUsd: '0.01' },
    });

    expect(logSpy).toHaveBeenCalledTimes(4);
  });
});
