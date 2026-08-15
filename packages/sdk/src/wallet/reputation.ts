import { bcs } from '@mysten/sui/bcs';
import { Transaction } from '@mysten/sui/transactions';
import { deriveObjectID } from '@mysten/sui/utils';
import { T2000Error } from '../errors.js';
import { USDC_TYPE } from '../token-registry.js';
import { validateAddress } from '../utils/sui.js';
import type { SuiCoreClient } from '../utils/sui.js';
import { A2A_ESCROW_LATEST_PACKAGE_ID, feeConfigArg } from './opening.js';

/**
 * On-chain reputation — client for `a2a_escrow::reputation` (S.1054,
 * SPEC_AGENT_ID_REPUTATION Phase C). One shared `AgentScore` per reviewed
 * seller, lazily created on their first review at a DETERMINISTIC address
 * derived from the shared `ScoreBoard` — `deriveAgentScoreId` computes it
 * locally, no lookup. Aggregates only (`review_count` + `stars_sum`);
 * review TEXT stays off-chain (jobId-keyed rows on the API).
 *
 * Write authority is Move-enforced: only the buyer of a RELEASED (and
 * actually delivered) `escrow::Job` can write, once per job — resubmitting
 * edits the stars in place. There is no admin mint: reputation is receipts.
 *
 * These aggregates are the ONE public score SSOT (profile stars, Proven
 * claim gates). `claim_policy` `1`/`2` openings claim via
 * `opening::claim_proven`, which reads the claimer's own score immutably.
 */

/** The shared `reputation::ScoreBoard` object id on MAINNET — the derived-
 *  address namespace parent every `AgentScore` hangs off. Created ONCE by
 *  the S.1054 cutover (`create_score_board`); single instance is
 *  chain-enforced (S.1054b: the id records into the `ScoreBoardKey` DF on
 *  FeeConfig and a second create aborts). This pin MUST equal
 *  `escrow::config_score_board_id(FeeConfig)` — verify at cutover. */
export const MAINNET_A2A_SCORE_BOARD_ID =
  '0x7506f01e01b1c48d73832949a2808929b80dec2f7104889e012f8a4f09719f6e'; // create digest DxrhQniY…, verified == FeeConfig ScoreBoardKey DF

/** Env-overridable board id for testnet/dev (NOT a trust anchor). */
export const A2A_SCORE_BOARD_ID =
  process.env.A2A_SCORE_BOARD_ID ?? MAINNET_A2A_SCORE_BOARD_ID;

const MODULE = 'reputation';
const CLOCK_ID = '0x6';

// === Proven thresholds — mirror `reputation.move`, never copy elsewhere ===
/** Reviews required for Proven (`claim_policy` 1, and the floor of 2). */
export const PROVEN_MIN_REVIEWS = 3;
/** Average-stars floor for Proven · 4★+ (`claim_policy` 2), scaled ×10. */
export const PROVEN_MIN_AVG_STARS_X10 = 40;
/** Star bounds on a review. */
export const REVIEW_MIN_STARS = 1;
export const REVIEW_MAX_STARS = 5;

function boardIdOrThrow(boardId?: string): string {
  const id = boardId ?? A2A_SCORE_BOARD_ID;
  if (!id) {
    throw new T2000Error(
      'INVALID_INPUT',
      'The reputation ScoreBoard id is not configured (pre-S.1054-cutover build?).',
    );
  }
  return id;
}

/** Compute the deterministic `AgentScore` object id for an agent — pure
 *  local math (`sui::derived_object`), no RPC. The object may not exist
 *  yet: no score object ⇔ zero on-chain reviews. */
export function deriveAgentScoreId(agent: string, boardId?: string): string {
  return deriveObjectID(
    boardIdOrThrow(boardId),
    'address',
    bcs.Address.serialize(validateAddress(agent)).toBytes(),
  );
}

/** On-chain view of one agent's score aggregates. */
export interface AgentScore {
  id: string;
  agent: string;
  reviewCount: number;
  starsSum: number;
  /** Integer-safe average, rounded to 2dp for display (0 when no reviews). */
  averageStars: number;
}

/** Read an agent's score (null = no reviews yet — the lazy-create means the
 *  object simply doesn't exist). */
export async function getAgentScore(
  client: SuiCoreClient,
  agent: string,
  boardId?: string,
): Promise<AgentScore | null> {
  const scoreId = deriveAgentScoreId(agent, boardId);
  const resp = await client.core
    .getObject({ objectId: scoreId, include: { json: true } })
    .catch(() => null);
  const objType = resp?.object?.type ?? '';
  const json = resp?.object?.json as Record<string, unknown> | null | undefined;
  if (!json || !objType.includes(`::${MODULE}::AgentScore`)) {
    return null;
  }
  const reviewCount = Number(json.review_count ?? 0);
  const starsSum = Number(json.stars_sum ?? 0);
  return {
    id: scoreId,
    agent: String(json.agent),
    reviewCount,
    starsSum,
    averageStars: reviewCount > 0 ? Math.round((starsSum / reviewCount) * 100) / 100 : 0,
  };
}

/** Does a score satisfy an Opening's claim policy? (`null` score = zero
 *  reviews.) Mirrors the Move predicates exactly — integer math, and
 *  policy 2 is strictly stronger than policy 1. */
export function meetsClaimPolicy(score: AgentScore | null, claimPolicy: number): boolean {
  if (claimPolicy === 0) return true;
  if (!score) return false;
  const proven = score.reviewCount >= PROVEN_MIN_REVIEWS;
  if (claimPolicy === 1) return proven;
  if (claimPolicy === 2) {
    return proven && score.starsSum * 10 >= score.reviewCount * PROVEN_MIN_AVG_STARS_X10;
  }
  return false;
}

/** Human label for a claim policy — every surface uses these, never the
 *  raw enum. */
export function claimPolicyLabel(claimPolicy: number): string {
  if (claimPolicy === 0) return 'Anyone';
  if (claimPolicy === 1) return 'Proven';
  if (claimPolicy === 2) return 'Proven · 4★+';
  return `Unknown policy ${claimPolicy}`;
}

/** One English sentence for a Proven refusal — CLI/MCP/prepare all reuse
 *  this instead of surfacing a raw Move abort. */
export function claimPolicyRequirement(claimPolicy: number): string {
  if (claimPolicy === 1) {
    return `Claiming needs at least ${PROVEN_MIN_REVIEWS} on-chain reviews.`;
  }
  if (claimPolicy === 2) {
    return `Claiming needs at least ${PROVEN_MIN_REVIEWS} on-chain reviews and a 4.0★ average.`;
  }
  return 'Anyone can claim (active Agent ID required).';
}

function assertStars(stars: number): void {
  if (!Number.isInteger(stars) || stars < REVIEW_MIN_STARS || stars > REVIEW_MAX_STARS) {
    throw new T2000Error('INVALID_INPUT', 'Stars must be an integer 1-5.');
  }
}

/** Review a released job when the seller ALREADY has a score object —
 *  also the star-EDIT path (same buyer re-rating the same job). */
export function buildSubmitReviewTx({
  scoreId,
  jobId,
  stars,
}: {
  scoreId: string;
  jobId: string;
  stars: number;
}): Transaction {
  assertStars(stars);
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::${MODULE}::submit_review`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(scoreId),
      tx.object(validateAddress(jobId)),
      tx.pure.u8(stars),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** First review a seller ever receives — lazily creates their score at its
 *  derived address (aborts on-chain if it raced into existence; retry with
 *  `buildSubmitReviewTx`). */
export function buildSubmitFirstReviewTx({
  jobId,
  stars,
  boardId,
}: {
  jobId: string;
  stars: number;
  boardId?: string;
}): Transaction {
  assertStars(stars);
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::${MODULE}::submit_first_review`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(boardIdOrThrow(boardId)),
      tx.object(validateAddress(jobId)),
      tx.pure.u8(stars),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}
