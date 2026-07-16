import { describe, expect, it } from 'vitest';
import { parseChallengeAmount } from './mpp-cost.js';

describe('parseChallengeAmount — truthful MPP cost (Bug 1)', () => {
  it('parses a decimal price string from the challenge', () => {
    expect(parseChallengeAmount({ request: { amount: '0.012' } })).toBe(0.012);
    expect(parseChallengeAmount({ request: { amount: '1.20' } })).toBe(1.2);
  });

  it('accepts a numeric amount', () => {
    expect(parseChallengeAmount({ request: { amount: 0.06 } })).toBe(0.06);
  });

  it('returns undefined for missing / malformed amounts (caller falls back to maxPrice)', () => {
    expect(parseChallengeAmount(null)).toBeUndefined();
    expect(parseChallengeAmount(undefined)).toBeUndefined();
    expect(parseChallengeAmount({})).toBeUndefined();
    expect(parseChallengeAmount({ request: {} })).toBeUndefined();
    expect(parseChallengeAmount({ request: { amount: 'not-a-number' } })).toBeUndefined();
    expect(parseChallengeAmount({ request: { amount: NaN } })).toBeUndefined();
  });

  it('does NOT confuse the real charge with a large maxPrice ceiling', () => {
    // The bug: a $0.01 call under maxPrice:1.0 reported cost 1.0. The challenge
    // amount is the truth.
    expect(parseChallengeAmount({ request: { amount: '0.012' } })).not.toBe(1.0);
  });
});
