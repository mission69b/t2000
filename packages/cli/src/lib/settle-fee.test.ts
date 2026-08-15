import { describe, expect, it } from 'vitest';
import {
  formatUsdMicro,
  sellerReceivesLine,
  SERVICES_SETTLE_FEE_BPS,
  settlementSplit,
} from './settle-fee.js';

// A seller reads these numbers when deciding what to charge. Rounding UP would
// promise money the chain never pays, so the split floors the fee exactly the
// way the Move contract does and the seller keeps the remainder.

describe('formatUsdMicro', () => {
  it('shows every micro that exists, never fewer than 2dp', () => {
    expect(formatUsdMicro(47_500)).toBe('$0.0475');
    expect(formatUsdMicro(2_500)).toBe('$0.0025');
    expect(formatUsdMicro(50_000)).toBe('$0.05');
    expect(formatUsdMicro(1_000_000)).toBe('$1.00');
    expect(formatUsdMicro(12_345_678)).toBe('$12.345678');
  });

  it('floors — a displayed payout is never more than the real one', () => {
    expect(formatUsdMicro(1_999_999.9)).toBe('$1.999999');
    expect(formatUsdMicro(0)).toBe('$0.00');
  });

  it('refuses to guess on garbage', () => {
    expect(formatUsdMicro(Number.NaN)).toBe('—');
    expect(formatUsdMicro(-1)).toBe('—');
  });
});

describe('settlementSplit', () => {
  it('takes the fee from the payout, never from the buyer', () => {
    const s = settlementSplit(0.05);
    expect(s.escrow).toBe('$0.05'); // buyer's number is untouched
    expect(s.fee).toBe('$0.0025');
    expect(s.payout).toBe('$0.0475');
    expect(s.feeMicro + s.payoutMicro).toBe(50_000);
  });

  it('one-cent job (S.1053): 10,000 → 500 fee + 9,500 payout, no rounded-up display', () => {
    const s = settlementSplit(0.01);
    expect(s.escrow).toBe('$0.01');
    expect(s.feeMicro).toBe(500);
    expect(s.payoutMicro).toBe(9_500);
    expect(s.fee).toBe('$0.0005'); // not $0.00-rounded-away, not $0.001
    expect(s.payout).toBe('$0.0095'); // never displayed as $0.01
  });

  it('never loses a micro to rounding, at any size', () => {
    for (const price of [0.01, 0.05, 0.1, 1, 5, 12.34, 50]) {
      const s = settlementSplit(price);
      expect(s.feeMicro + s.payoutMicro).toBe(Math.floor(price * 1_000_000));
    }
  });

  it('floors the fee, so the seller keeps the remainder', () => {
    // 12.34 × 5% = 0.617 exactly; no silent rounding to $0.62.
    const s = settlementSplit(12.34);
    expect(s.fee).toBe('$0.617');
    expect(s.payout).toBe('$11.723');
  });

  it('honours a per-job bps that differs from the display default', () => {
    const s = settlementSplit(1, 250);
    expect(s.fee).toBe('$0.025');
    expect(s.payout).toBe('$0.975');
  });
});

describe('sellerReceivesLine', () => {
  it('names the amount, the rate and the fee', () => {
    expect(sellerReceivesLine(5)).toBe('$4.75 after the 5% settle fee ($0.25)');
  });

  it('quotes the display default', () => {
    expect(SERVICES_SETTLE_FEE_BPS).toBe(500);
  });
});
