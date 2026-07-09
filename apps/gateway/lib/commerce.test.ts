import { describe, expect, it } from 'vitest';
import { computeFeeMicros, uptoSettlement } from './commerce';

// $0.10 authorized max for the cases below.
const MAX = 100_000;

describe('uptoSettlement (sui-upto, Mechanism A)', () => {
  it('no report → exact: charge the full authorized max, no refund', () => {
    const s = uptoSettlement(MAX, null);
    expect(s.actualMicros).toBe(MAX);
    expect(s.refundMicros).toBe(0);
    expect(s.feeMicros).toBe(2500); // 2.5%
    expect(s.netMicros).toBe(97_500);
  });

  it('actual < max → charge actual, refund the excess, fee on actual', () => {
    const s = uptoSettlement(MAX, 50_000);
    expect(s.actualMicros).toBe(50_000);
    expect(s.refundMicros).toBe(50_000);
    expect(s.feeMicros).toBe(1250);
    expect(s.netMicros).toBe(48_750);
  });

  it('reported above max → clamped to the authorized max', () => {
    const s = uptoSettlement(MAX, 200_000);
    expect(s.actualMicros).toBe(MAX);
    expect(s.refundMicros).toBe(0);
  });

  it('reported below the min billable → floored so net clears the gasless min', () => {
    const s = uptoSettlement(MAX, 1000);
    expect(s.actualMicros).toBe(10_300);
    expect(s.netMicros).toBeGreaterThanOrEqual(10_000); // gasless floor
    expect(s.refundMicros).toBe(MAX - 10_300);
  });

  it('sub-dust savings → no refund tx, charge the full max (exact)', () => {
    const s = uptoSettlement(MAX, 98_000); // would refund only $0.002
    expect(s.refundMicros).toBe(0);
    expect(s.actualMicros).toBe(MAX);
  });

  it('refund + net + fee never exceed what was collected', () => {
    for (const report of [null, 1, 25_000, 60_000, 99_999, 250_000]) {
      const s = uptoSettlement(MAX, report);
      // Treasury collected MAX; pays out refund + net, keeps fee.
      expect(s.refundMicros + s.netMicros + s.feeMicros).toBe(MAX);
    }
  });
});

// [S.697] Hosted-compute fee: t2000-run deliveries (handlers + wraps) carry
// +2.5% off the seller's net, floor-guarded so the forward stays gasless-able.
describe('computeFeeMicros', () => {
  it('self-hosted → zero compute fee', () => {
    expect(computeFeeMicros(20_000, 19_500, false)).toBe(0);
  });

  it('hosted $0.02 sale → 2.5% of charged (50 micros)', () => {
    expect(computeFeeMicros(20_000, 19_500, true)).toBe(500);
  });

  it('hosted $1 sale → $0.025', () => {
    expect(computeFeeMicros(1_000_000, 975_000, true)).toBe(25_000);
  });

  it('floor guard: fee never pushes the net below the $0.01 gasless minimum', () => {
    // $0.0103 charged → facilitator net 10_042; full 2.5% (257) would leave
    // 9_785 < 10_000 → fee clamped to 42.
    expect(computeFeeMicros(10_300, 10_042, true)).toBe(42);
  });

  it('floor guard: net already at the floor → fee fully waived', () => {
    expect(computeFeeMicros(10_256, 10_000, true)).toBe(0);
  });

  it('net after both fees never drops below the floor across a price sweep', () => {
    for (const charged of [10_300, 11_000, 20_000, 50_000, 1_000_000]) {
      const facilitatorFee = Math.floor((charged * 250) / 10_000);
      const net = charged - facilitatorFee;
      const fee = computeFeeMicros(charged, net, true);
      expect(net - fee).toBeGreaterThanOrEqual(10_000);
      expect(fee).toBeGreaterThanOrEqual(0);
    }
  });
});
