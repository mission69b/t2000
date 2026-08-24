import { describe, it, expect } from 'vitest';
import {
  MAINNET_A2A_SCORE_BOARD_ID,
  PROVEN_MIN_REVIEWS,
  buildSubmitFirstReviewTx,
  buildSubmitReviewTx,
  claimPolicyLabel,
  claimPolicyRequirement,
  deriveAgentScoreId,
  meetsClaimPolicy,
  activeCapForLevel,
  effectiveSellerLevel,
  meetsMinSellerLevel,
  NO_DELIVERY_REGRESSION_FLOOR,
  preflightClaimOpening,
  SELLER_LEVEL_ACTIVE_CAPS,
  sellerLevel,
  sellerLevelLabel,
  type AgentScore,
} from './reputation.js';

const BOARD = `0x${'b'.repeat(64)}`;
const AGENT = `0x${'1'.repeat(64)}`;
const JOB = `0x${'2'.repeat(64)}`;

function score(
  reviewCount: number,
  starsSum: number,
  distinctBuyers = reviewCount,
): AgentScore {
  return {
    id: `0x${'c'.repeat(64)}`,
    agent: AGENT,
    reviewCount,
    starsSum,
    averageStars: 0,
    distinctBuyers,
    rejectedAfterDelivery: 0,
    noDelivery: 0,
    asBuyerRejected: 0,
    activeSellerJobs: 0,
  };
}

describe('meetsClaimPolicy — mirrors the Move predicates (S.1062: distinct buyers)', () => {
  it('policy 0 passes with or without a score', () => {
    expect(meetsClaimPolicy(null, 0)).toBe(true);
    expect(meetsClaimPolicy(score(0, 0), 0)).toBe(true);
  });

  it('no score = zero reviews: every Proven policy refuses', () => {
    expect(meetsClaimPolicy(null, 1)).toBe(false);
    expect(meetsClaimPolicy(null, 2)).toBe(false);
  });

  it('policy 1 needs the DISTINCT-BUYER floor, not raw review count', () => {
    // The v2 soft-Sybil case: 3 reviews, one buyer — refused.
    expect(meetsClaimPolicy(score(3, 15, 1), 1)).toBe(false);
    expect(meetsClaimPolicy(score(PROVEN_MIN_REVIEWS - 1, 10, 2), 1)).toBe(false);
    expect(meetsClaimPolicy(score(PROVEN_MIN_REVIEWS, 3, PROVEN_MIN_REVIEWS), 1)).toBe(true);
    // More reviews than distinct buyers is fine once the floor holds.
    expect(meetsClaimPolicy(score(10, 50, 3), 1)).toBe(true);
  });

  it('policy 2 needs the distinct floor AND a 4.0 average (integer math)', () => {
    // 3 distinct, avg 3.0 — floor OK, avg short.
    expect(meetsClaimPolicy(score(3, 9, 3), 2)).toBe(false);
    // avg exactly 4.0 passes.
    expect(meetsClaimPolicy(score(3, 12, 3), 2)).toBe(true);
    // 4.0+ average but only one distinct buyer — refused (floor gates avg).
    expect(meetsClaimPolicy(score(3, 15, 1), 2)).toBe(false);
    // 1 × 5★ — avg holds but the floor doesn't (policy 2 ⊃ policy 1).
    expect(meetsClaimPolicy(score(1, 5, 1), 2)).toBe(false);
  });

  it('unknown policies refuse', () => {
    expect(meetsClaimPolicy(score(100, 500, 100), 3)).toBe(false);
  });
});

describe('labels + requirements — the one English source', () => {
  it('labels every policy', () => {
    expect(claimPolicyLabel(0)).toBe('Anyone');
    expect(claimPolicyLabel(1)).toBe('Proven');
    expect(claimPolicyLabel(2)).toBe('Proven · 4★+');
  });

  it('requirements are the SHORT human sentence naming the real threshold (S.1059/S.1062)', () => {
    expect(claimPolicyRequirement(1)).toBe(
      `Claiming needs at least ${PROVEN_MIN_REVIEWS} reviews from distinct buyers.`,
    );
    expect(claimPolicyRequirement(2)).toContain(`${PROVEN_MIN_REVIEWS}`);
    expect(claimPolicyRequirement(2)).toContain('distinct buyers');
    expect(claimPolicyRequirement(2)).toContain('4.0');
    // The Passport claim surface paints this verbatim — no essay prefix.
    expect(claimPolicyRequirement(2)).toMatch(/^Claiming needs/);
  });
});

describe('deriveAgentScoreId', () => {
  it('is deterministic and board-scoped', () => {
    const a = deriveAgentScoreId(AGENT, BOARD);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deriveAgentScoreId(AGENT, BOARD)).toBe(a);
    expect(deriveAgentScoreId(`0x${'3'.repeat(64)}`, BOARD)).not.toBe(a);
  });

  it('defaults to the pinned mainnet ScoreBoard (S.1054 cutover)', () => {
    expect(MAINNET_A2A_SCORE_BOARD_ID).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deriveAgentScoreId(AGENT)).toBe(
      deriveAgentScoreId(AGENT, MAINNET_A2A_SCORE_BOARD_ID),
    );
  });
});

describe('review tx builders', () => {
  it('submit_review targets the reputation module with the score + job', async () => {
    const tx = buildSubmitReviewTx({ scoreId: `0x${'c'.repeat(64)}`, jobId: JOB, stars: 5 });
    const data = tx.getData();
    const call = data.commands.find((c) => 'MoveCall' in c)?.MoveCall;
    expect(call?.module).toBe('reputation');
    expect(call?.function).toBe('submit_review');
  });

  it('submit_first_review takes the board', async () => {
    const tx = buildSubmitFirstReviewTx({ boardId: BOARD, jobId: JOB, stars: 4 });
    const call = tx.getData().commands.find((c) => 'MoveCall' in c)?.MoveCall;
    expect(call?.function).toBe('submit_first_review');
  });

  it('refuses non-integer or out-of-range stars', () => {
    for (const stars of [0, 6, 4.5, Number.NaN]) {
      expect(() => buildSubmitReviewTx({ scoreId: BOARD, jobId: JOB, stars })).toThrow(/1-5/);
    }
  });
});

describe('seller levels (S.1192) — mirror the Move bars', () => {
  it('null / empty score = Level 1', () => {
    expect(sellerLevel(null)).toBe(1);
    expect(sellerLevel(score(0, 0))).toBe(1);
    expect(effectiveSellerLevel(null)).toBe(1);
  });

  it('Level 2 = Proven (3 distinct), Level 3 = 4.0★+, Level 4 = 20 reviews + ≤2 no-delivery', () => {
    expect(sellerLevel(score(3, 9))).toBe(2); // 3.0★ avg, proven
    expect(sellerLevel(score(3, 12))).toBe(3); // exactly 4.0★
    expect(sellerLevel(score(20, 80))).toBe(4); // 20 reviews at 4.0★
    expect(sellerLevel({ ...score(20, 80), noDelivery: 3 })).toBe(3); // reliability bar
    expect(sellerLevel(score(19, 76))).toBe(3); // one review short of L4
  });

  it('regression: no_delivery >= 3 floors the EFFECTIVE level to 1', () => {
    const regressed = { ...score(20, 100), noDelivery: NO_DELIVERY_REGRESSION_FLOOR };
    expect(sellerLevel(regressed)).toBe(3); // stars still say 3 (L4 bar needs ≤2)
    expect(effectiveSellerLevel(regressed)).toBe(1);
    expect(meetsMinSellerLevel(regressed, 2)).toBe(false);
    expect(meetsMinSellerLevel(regressed, 1)).toBe(true);
  });

  it('caps ladder 4/10/20/30 + labels', () => {
    expect(SELLER_LEVEL_ACTIVE_CAPS).toEqual([4, 10, 20, 30]);
    expect(activeCapForLevel(1)).toBe(4);
    expect(activeCapForLevel(4)).toBe(30);
    expect(sellerLevelLabel(2)).toBe('Level 2');
  });
});

describe('preflightClaimOpening (S.1192) — English before the rail', () => {
  it('fresh seller on a floor-less Anyone opening passes', () => {
    expect(preflightClaimOpening(null, { claimPolicy: 0 }).valid).toBe(true);
    expect(preflightClaimOpening(score(0, 0), { claimPolicy: 0 }).valid).toBe(true);
  });

  it('at the cap: refuses with Active: N/cap capacity language, not a ban', () => {
    const capped = { ...score(0, 0), activeSellerJobs: 4 };
    const pf = preflightClaimOpening(capped, { claimPolicy: 0 });
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/Active: 4\/4/);
    expect(pf.error).toMatch(/Finish|deadline refund/);
    // One under the cap still claims.
    expect(
      preflightClaimOpening({ ...score(0, 0), activeSellerJobs: 3 }, { claimPolicy: 0 }).valid,
    ).toBe(true);
  });

  it('the cap follows the EFFECTIVE level (a Level 2 seller gets 10 seats)', () => {
    const proven = { ...score(3, 9), activeSellerJobs: 9 };
    expect(preflightClaimOpening(proven, { claimPolicy: 0 }).valid).toBe(true);
    expect(
      preflightClaimOpening({ ...proven, activeSellerJobs: 10 }, { claimPolicy: 0 }).valid,
    ).toBe(false);
  });

  it('min level floor refuses below-floor sellers by name', () => {
    const pf = preflightClaimOpening(score(0, 0), { claimPolicy: 0, minSellerLevel: 2 });
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/Level 2\+/);
    expect(pf.error).toMatch(/Level 1/);
    expect(
      preflightClaimOpening(score(3, 9), { claimPolicy: 0, minSellerLevel: 2 }).valid,
    ).toBe(true);
  });

  it('claim policy still gates first (S.1054 order preserved)', () => {
    const pf = preflightClaimOpening(null, { claimPolicy: 2 });
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/distinct buyers and a 4\.0★ average/);
  });
});
