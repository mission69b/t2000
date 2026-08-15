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
  type AgentScore,
} from './reputation.js';

const BOARD = `0x${'b'.repeat(64)}`;
const AGENT = `0x${'1'.repeat(64)}`;
const JOB = `0x${'2'.repeat(64)}`;

function score(reviewCount: number, starsSum: number): AgentScore {
  return { id: `0x${'c'.repeat(64)}`, agent: AGENT, reviewCount, starsSum, averageStars: 0 };
}

describe('meetsClaimPolicy — mirrors the Move predicates', () => {
  it('policy 0 passes with or without a score', () => {
    expect(meetsClaimPolicy(null, 0)).toBe(true);
    expect(meetsClaimPolicy(score(0, 0), 0)).toBe(true);
  });

  it('no score = zero reviews: every Proven policy refuses', () => {
    expect(meetsClaimPolicy(null, 1)).toBe(false);
    expect(meetsClaimPolicy(null, 2)).toBe(false);
  });

  it('policy 1 needs the review floor', () => {
    expect(meetsClaimPolicy(score(PROVEN_MIN_REVIEWS - 1, 10), 1)).toBe(false);
    expect(meetsClaimPolicy(score(PROVEN_MIN_REVIEWS, 3), 1)).toBe(true);
  });

  it('policy 2 needs the floor AND a 4.0 average (integer math)', () => {
    // 3 reviews, avg 3.0 — count OK, avg short.
    expect(meetsClaimPolicy(score(3, 9), 2)).toBe(false);
    // avg exactly 4.0 passes.
    expect(meetsClaimPolicy(score(3, 12), 2)).toBe(true);
    // 1 × 5★ — avg holds but the floor doesn't (policy 2 ⊃ policy 1).
    expect(meetsClaimPolicy(score(1, 5), 2)).toBe(false);
  });

  it('unknown policies refuse', () => {
    expect(meetsClaimPolicy(score(100, 500), 3)).toBe(false);
  });
});

describe('labels + requirements — the one English source', () => {
  it('labels every policy', () => {
    expect(claimPolicyLabel(0)).toBe('Anyone');
    expect(claimPolicyLabel(1)).toBe('Proven');
    expect(claimPolicyLabel(2)).toBe('Proven · 4★+');
  });

  it('requirements are the SHORT human sentence naming the real threshold (S.1059)', () => {
    expect(claimPolicyRequirement(1)).toBe(
      `Claiming needs at least ${PROVEN_MIN_REVIEWS} on-chain reviews.`,
    );
    expect(claimPolicyRequirement(2)).toContain(`${PROVEN_MIN_REVIEWS}`);
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
