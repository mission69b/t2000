import { describe, it, expect } from 'vitest';
import {
  MAINNET_A2A_SCORE_BOARD_ID,
  PROVEN_MIN_REVIEWS,
  buildSubmitFirstReviewTx,
  buildSubmitReviewTx,
  deriveAgentScoreId,
  activeCapForLevel,
  effectiveSellerLevel,
  meetsMinSellerLevel,
  LEVEL4_MIN_REVIEWS,
  NO_DELIVERY_REGRESSION_FLOOR,
  preflightClaimOpening,
  SELLER_LEVEL_ACTIVE_CAPS,
  sellerLevel,
  sellerLevelLabel,
  trustTierLabel,
  trustRequirementLabel,
  trustRequirementFromOpening,
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

describe('trust tiers (S.1208) — the one user-facing vocabulary', () => {
  it('names every level; sellerLevelLabel is the deprecated alias', () => {
    expect(trustTierLabel(1)).toBe('New');
    expect(trustTierLabel(2)).toBe('Established');
    expect(trustTierLabel(3)).toBe('Top rated');
    expect(trustTierLabel(4)).toBe('Veteran');
    expect(trustTierLabel(9)).toBe('Unknown tier (9)');
    for (const level of [1, 2, 3, 4]) {
      expect(sellerLevelLabel(level)).toBe(trustTierLabel(level));
    }
  });

  it('requirement chip: floors 0/1 are Open, 2..4 are "<Tier> only"', () => {
    expect(trustRequirementLabel(0)).toBe('Open');
    expect(trustRequirementLabel(1)).toBe('Open');
    expect(trustRequirementLabel(2)).toBe('Established only');
    expect(trustRequirementLabel(3)).toBe('Top rated only');
    expect(trustRequirementLabel(4)).toBe('Veteran only');
  });

  it('trustRequirementFromOpening: the tier floor is the ONE gate (S.1212 — legacy arms gone)', () => {
    expect(trustRequirementFromOpening({ minSellerLevel: 0 })).toBe('Open');
    expect(trustRequirementFromOpening({})).toBe('Open');
    // The frozen on-chain claimPolicy key is tolerated and IGNORED —
    // straggler-free board, S.1212.
    expect(trustRequirementFromOpening({ claimPolicy: 2, minSellerLevel: 0 })).toBe('Open');
    expect(trustRequirementFromOpening({ minSellerLevel: 2 })).toBe('Established only');
    expect(trustRequirementFromOpening({ minSellerLevel: 3 })).toBe('Top rated only');
    expect(trustRequirementFromOpening({ minSellerLevel: 4 })).toBe('Veteran only');
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

  it('Level 2 = Proven (3 distinct), Level 3 = 4.0★+, Level 4 = 10 reviews + ≤2 no-delivery (S.1210)', () => {
    expect(sellerLevel(score(3, 9))).toBe(2); // 3.0★ avg, proven
    expect(sellerLevel(score(3, 12))).toBe(3); // exactly 4.0★
    expect(sellerLevel(score(10, 40))).toBe(4); // 10 reviews at 4.0★
    expect(sellerLevel({ ...score(10, 40), noDelivery: 3 })).toBe(3); // reliability bar
    expect(sellerLevel(score(9, 36))).toBe(3); // one review short of L4
    expect(LEVEL4_MIN_REVIEWS).toBe(10); // the S.1210 retune, mirrored from Move
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
    expect(sellerLevelLabel(2)).toBe('Established');
  });
});

describe('preflightClaimOpening (S.1192) — English before the rail', () => {
  it('fresh seller on a floor-less Anyone opening passes', () => {
    expect(preflightClaimOpening(null, { claimPolicy: 0 }).valid).toBe(true);
    expect(preflightClaimOpening(score(0, 0), { claimPolicy: 0 }).valid).toBe(true);
  });

  it('at the cap: refuses with Seller cap (N/cap) capacity language, not a ban', () => {
    const capped = { ...score(0, 0), activeSellerJobs: 4 };
    const pf = preflightClaimOpening(capped, { claimPolicy: 0 });
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/Seller cap \(4\/4\)/);
    // S.1210: the way out is DELIVER — the seat frees when the work ships.
    expect(pf.error).toMatch(/Deliver one|lapsed job refund/);
    expect(pf.error).toMatch(/no waiting on buyer settle/);
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

  it('min level floor refuses below-floor sellers by tier name (S.1208)', () => {
    const pf = preflightClaimOpening(score(0, 0), { claimPolicy: 0, minSellerLevel: 2 });
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/Requires Established/);
    expect(pf.error).toMatch(/you are New/);
    expect(
      preflightClaimOpening(score(3, 9), { claimPolicy: 0, minSellerLevel: 2 }).valid,
    ).toBe(true);
  });

});
