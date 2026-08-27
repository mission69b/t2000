import { describe, expect, it } from 'vitest';
import {
  buildBatchClaimTx,
  buildCancelBatchOpeningTx,
  buildRefundBatchExpiredTx,
  MAX_BATCH_SLOTS_DEFAULT,
  preflightBatchClaim,
  preflightCreateBatchOpening,
  type BatchOpeningTerms,
} from './batch.js';
import type { AgentScore } from './reputation.js';

// S.1193 — the batch surface mirrors the single-opening rules per slot,
// adds the wave bounds, and targets only the new `batch` module entries.

const BATCH_ID = `0x${'1'.repeat(64)}`;
const REGISTRY_ID = `0x${'2'.repeat(64)}`;
const SCORE_ID = `0x${'3'.repeat(64)}`;

function terms(overrides: Partial<BatchOpeningTerms> = {}): BatchOpeningTerms {
  return {
    amountUsdc: 0.08,
    slots: 50,
    specHash: `0x${'a'.repeat(64)}`,
    openUntilMs: Date.now() + 3_600_000,
    slaMs: 86_400_000,
    reviewWindowMs: 600_000,
    rejectSplitBps: 10_000,
    ...overrides,
  };
}

function score(overrides: Partial<AgentScore> = {}): AgentScore {
  return {
    id: SCORE_ID,
    agent: `0x${'4'.repeat(64)}`,
    reviewCount: 0,
    starsSum: 0,
    averageStars: 0,
    distinctBuyers: 0,
    rejectedAfterDelivery: 0,
    noDelivery: 0,
    asBuyerRejected: 0,
    activeSellerJobs: 0,
    ...overrides,
  };
}

describe('preflightCreateBatchOpening (S.1193)', () => {
  it('accepts the desk wave shape (50 × $0.08, max 1 per agent default)', () => {
    expect(preflightCreateBatchOpening(terms()).valid).toBe(true);
    expect(preflightCreateBatchOpening(terms({ maxClaimsPerAgent: 1 })).valid).toBe(true);
  });

  it('reuses the single-opening rules per slot (cap, split, policy)', () => {
    expect(preflightCreateBatchOpening(terms({ amountUsdc: 101 })).valid).toBe(false);
    expect(preflightCreateBatchOpening(terms({ rejectSplitBps: 8000 })).valid).toBe(false);
    expect(preflightCreateBatchOpening(terms({ claimPolicy: 3 })).valid).toBe(false);
    expect(preflightCreateBatchOpening(terms({ minSellerLevel: 5 })).valid).toBe(false);
  });

  it('bounds slots 1..default max and maxClaimsPerAgent 1..slots', () => {
    expect(preflightCreateBatchOpening(terms({ slots: 0 })).valid).toBe(false);
    expect(preflightCreateBatchOpening(terms({ slots: 1.5 })).valid).toBe(false);
    expect(
      preflightCreateBatchOpening(terms({ slots: MAX_BATCH_SLOTS_DEFAULT + 1 })).valid,
    ).toBe(false);
    expect(preflightCreateBatchOpening(terms({ maxClaimsPerAgent: 0 })).valid).toBe(false);
    expect(
      preflightCreateBatchOpening(terms({ slots: 5, maxClaimsPerAgent: 6 })).valid,
    ).toBe(false);
    expect(
      preflightCreateBatchOpening(terms({ slots: 5, maxClaimsPerAgent: 5 })).valid,
    ).toBe(true);
  });
});

describe('batch builders target only the batch module', () => {
  function onlyCall(tx: ReturnType<typeof buildCancelBatchOpeningTx>) {
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { module: string; function: string };
    }>;
    expect(calls).toHaveLength(1);
    return `${calls[0].MoveCall.module}::${calls[0].MoveCall.function}`;
  }

  it('claim / cancel / refund hit batch::*', () => {
    expect(
      onlyCall(
        buildBatchClaimTx({ batchId: BATCH_ID, registryId: REGISTRY_ID, scoreId: SCORE_ID }),
      ),
    ).toBe('batch::batch_claim');
    expect(onlyCall(buildCancelBatchOpeningTx(BATCH_ID))).toBe('batch::cancel_batch_open');
    expect(onlyCall(buildRefundBatchExpiredTx(BATCH_ID))).toBe('batch::refund_batch_expired');
  });

  it('claim refuses a missing scoreId in English', () => {
    expect(() =>
      buildBatchClaimTx({ batchId: BATCH_ID, registryId: REGISTRY_ID, scoreId: '' }),
    ).toThrow(/AgentScore/);
  });
});

describe('preflightBatchClaim — wave gates first, then the single stack', () => {
  const wave = {
    claimPolicy: 0,
    slotsRemaining: 47,
    maxClaimsPerAgent: 1,
  };

  it('fresh seller on an open Anyone wave passes', () => {
    expect(preflightBatchClaim(score(), wave, 0).valid).toBe(true);
    expect(preflightBatchClaim(null, wave, 0).valid).toBe(true);
  });

  it('zero slots left refuses before anything else', () => {
    const pf = preflightBatchClaim(score(), { ...wave, slotsRemaining: 0 }, 0);
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/No slots left/);
  });

  it('per-agent wave limit refuses with the counts', () => {
    const pf = preflightBatchClaim(score(), wave, 1);
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/1 slot per agent/);
    expect(
      preflightBatchClaim(score(), { ...wave, maxClaimsPerAgent: 3 }, 2).valid,
    ).toBe(true);
  });

  it('the Phase C stack still applies (active cap + level floor + policy)', () => {
    const capped = score({ activeSellerJobs: 4 });
    const pf = preflightBatchClaim(capped, wave, 0);
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/Seller cap \(4\/4\)/);
    const floored = preflightBatchClaim(score(), { ...wave, minSellerLevel: 2 }, 0);
    expect(floored.valid).toBe(false);
    expect(floored.error).toMatch(/Requires Established/);
    const proven = preflightBatchClaim(null, { ...wave, claimPolicy: 1 }, 0);
    expect(proven.valid).toBe(false);
    expect(proven.error).toMatch(/distinct buyers/);
  });
});
