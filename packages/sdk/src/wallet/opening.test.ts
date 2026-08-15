import { describe, it, expect } from 'vitest';
import { MAX_JOB_USDC, MIN_JOB_USDC } from './job.js';
import { preflightCreateOpening, type OpeningTerms } from './opening.js';

function terms(overrides: Partial<OpeningTerms> = {}): OpeningTerms {
  return {
    amountUsdc: 5,
    specHash: `0x${'a'.repeat(64)}`,
    openUntilMs: Date.now() + 3_600_000,
    slaMs: 86_400_000,
    reviewWindowMs: 600_000,
    rejectSplitBps: 10_000,
    ...overrides,
  };
}

describe('preflightCreateOpening amount bounds (S.981)', () => {
  it('accepts sane terms', () => {
    expect(preflightCreateOpening(terms()).valid).toBe(true);
  });

  it('rejects a budget under the contract minimum with a human message', () => {
    const pf = preflightCreateOpening(terms({ amountUsdc: MIN_JOB_USDC - 0.000001 }));
    expect(pf.valid).toBe(false);
    expect(pf.error).toContain(`${MIN_JOB_USDC}`);
  });

  it('accepts the exact minimum', () => {
    expect(preflightCreateOpening(terms({ amountUsdc: MIN_JOB_USDC })).valid).toBe(true);
  });

  it('rejects a budget over the cap', () => {
    expect(preflightCreateOpening(terms({ amountUsdc: MAX_JOB_USDC + 1 })).valid).toBe(false);
  });
});


describe('preflightCreateOpening reject split (S.1019 v5)', () => {
  it('refuses anything but 10000 — open reject is 100% buyer', () => {
    const pf = preflightCreateOpening(terms({ rejectSplitBps: 8000 }));
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/100% buyer.*10000/s);
  });

  it('10000 passes', () => {
    expect(preflightCreateOpening(terms({ rejectSplitBps: 10_000 })).valid).toBe(true);
  });
});
