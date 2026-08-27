import { bcs } from '@mysten/sui/bcs';
import { Transaction } from '@mysten/sui/transactions';
import { deriveDynamicFieldID, deriveObjectID } from '@mysten/sui/utils';
import { T2000Error } from '../errors.js';
import { USDC_TYPE } from '../token-registry.js';
import { validateAddress } from '../utils/sui.js';
import type { SuiCoreClient } from '../utils/sui.js';
import {
  A2A_ESCROW_LATEST_PACKAGE_ID,
  A2A_ESCROW_PACKAGE_V7_ID,
  A2A_ESCROW_PACKAGE_V8_ID,
  A2A_ESCROW_PACKAGE_V10_ID,
  feeConfigArg,
} from './opening.js';

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
/** The Proven floor (`claim_policy` 1, and the floor of 2). Since S.1062
 *  this counts DISTINCT BUYERS, not raw reviews — one friendly buyer ×3
 *  no longer unlocks Proven. The name survives for the published surface;
 *  the value is unchanged at 3. */
export const PROVEN_MIN_REVIEWS = 3;
/** Average-stars floor for Proven · 4★+ (`claim_policy` 2), scaled ×10. */
export const PROVEN_MIN_AVG_STARS_X10 = 40;
/** Star bounds on a review. */
export const REVIEW_MIN_STARS = 1;
export const REVIEW_MAX_STARS = 5;

// === Seller levels (S.1192) — mirror `reputation.move`, never copy ===
/** A seller's capacity label, 1-indexed (buyer copy: "Level 1"…"Level 4").
 *  Separate from claim policy — an opening can require both. */
export type SellerLevel = 1 | 2 | 3 | 4;
/** Default in-flight claimed-job caps per level (index = level − 1).
 *  Package defaults — the LIVE values are AdminCap-tunable FeeConfig DFs;
 *  the chain is the enforcement, these feed display + preflight. */
export const SELLER_LEVEL_ACTIVE_CAPS: readonly number[] = [4, 10, 20, 30];
/** `noDelivery >= floor` regresses the EFFECTIVE level to 1 (default;
 *  AdminCap-tunable on-chain). */
export const NO_DELIVERY_REGRESSION_FLOOR = 3;
/** Level 4 additionally needs ≥ this many reviews… */
export const LEVEL4_MIN_REVIEWS = 20;
/** …and ≤ this many no-delivery outcomes. */
export const LEVEL4_MAX_NO_DELIVERY = 2;

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
  /** Distinct buyer addresses that have reviewed since S.1062 — the
   *  Proven gate input. 0 when the DF is absent (pre-S.1062 scores never
   *  grandfather in). */
  distinctBuyers: number;
  /** S.1063 protocol outcomes — display-only facts, NEVER stars and never
   *  part of any Proven predicate. 0 when the DF is absent. */
  rejectedAfterDelivery: number;
  noDelivery: number;
  asBuyerRejected: number;
  /** S.1192 — live board-claimed jobs in flight (funded + delivered).
   *  0 when the DF is absent (soft start) or pre-V10-pin. */
  activeSellerJobs: number;
}

/** Read one u64 counter DF off a score's UID (0 when the DF is absent,
 *  when the defining id isn't pinned yet, or on any read hiccup — Move is
 *  the enforcement; these reads are display/preflight). Empty Move key
 *  structs BCS-encode as their implicit `dummy_field: bool = false`. */
async function readCounterDf(
  client: SuiCoreClient,
  scoreId: string,
  definingId: string,
  keyStruct: string,
): Promise<number> {
  if (!definingId) return 0;
  try {
    const fieldId = deriveDynamicFieldID(
      scoreId,
      `${definingId}::${MODULE}::${keyStruct}`,
      new Uint8Array([0]),
    );
    const resp = await client.core.getObject({
      objectId: fieldId,
      include: { json: true },
    });
    const json = resp?.object?.json as Record<string, unknown> | null | undefined;
    return Number((json as { value?: unknown } | null)?.value ?? 0);
  } catch {
    return 0;
  }
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
  const [distinctBuyers, rejectedAfterDelivery, noDelivery, asBuyerRejected, activeSellerJobs] =
    await Promise.all([
      readCounterDf(client, scoreId, A2A_ESCROW_PACKAGE_V7_ID, 'DistinctCountKey'),
      readCounterDf(client, scoreId, A2A_ESCROW_PACKAGE_V8_ID, 'RejectedAfterDeliveryKey'),
      readCounterDf(client, scoreId, A2A_ESCROW_PACKAGE_V8_ID, 'NoDeliveryKey'),
      readCounterDf(client, scoreId, A2A_ESCROW_PACKAGE_V8_ID, 'AsBuyerRejectedKey'),
      readCounterDf(client, scoreId, A2A_ESCROW_PACKAGE_V10_ID, 'ActiveSellerJobsKey'),
    ]);
  return {
    id: scoreId,
    agent: String(json.agent),
    reviewCount,
    starsSum,
    averageStars: reviewCount > 0 ? Math.round((starsSum / reviewCount) * 100) / 100 : 0,
    distinctBuyers,
    rejectedAfterDelivery,
    noDelivery,
    asBuyerRejected,
    activeSellerJobs,
  };
}

/** Lazily create an agent's zero score (S.1063) — needed before an outcome
 *  verb (reject/refund) when the target agent has no score yet: a shared
 *  object can't be created and then passed as input inside one tx. A zero
 *  score grants NOTHING (no stars, no distinct, no Proven). The sponsored
 *  rail chains this automatically. */
export function buildCreateEmptyScoreTx({
  agent,
  boardId,
}: {
  agent: string;
  boardId?: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::${MODULE}::create_empty_score`,
    typeArguments: [],
    arguments: [
      tx.object(boardIdOrThrow(boardId)),
      tx.pure.address(validateAddress(agent)),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Does a score satisfy an Opening's claim policy? (`null` score = zero
 *  reviews.) Mirrors the Move predicates exactly — S.1062: the Proven
 *  floor counts DISTINCT BUYERS; integer avg math; policy 2 strictly
 *  stronger than policy 1. */
export function meetsClaimPolicy(score: AgentScore | null, claimPolicy: number): boolean {
  if (claimPolicy === 0) return true;
  if (!score) return false;
  const proven = score.distinctBuyers >= PROVEN_MIN_REVIEWS;
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
    return `Claiming needs Established — reviews from at least ${PROVEN_MIN_REVIEWS} distinct buyers.`;
  }
  if (claimPolicy === 2) {
    return `Claiming needs Top rated — reviews from at least ${PROVEN_MIN_REVIEWS} distinct buyers and a 4.0★ average.`;
  }
  return 'Anyone can claim (active Agent ID required).';
}

// === Seller levels (S.1192) — mirror the Move predicates exactly ===

/** Computed Level 1..4 from on-chain aggregates (`null` score = Level 1,
 *  the empty-score default). Reuses the SAME predicates the claim
 *  policies read — one SSOT for every threshold. */
export function sellerLevel(score: AgentScore | null): SellerLevel {
  if (!score) return 1;
  const provenAvg =
    score.distinctBuyers >= PROVEN_MIN_REVIEWS &&
    score.starsSum * 10 >= score.reviewCount * PROVEN_MIN_AVG_STARS_X10;
  if (provenAvg) {
    return score.reviewCount >= LEVEL4_MIN_REVIEWS &&
      score.noDelivery <= LEVEL4_MAX_NO_DELIVERY
      ? 4
      : 3;
  }
  return score.distinctBuyers >= PROVEN_MIN_REVIEWS ? 2 : 1;
}

/** The level capacity actually gates on: `noDelivery >= floor` regresses
 *  to Level 1 regardless of stars (reliability caps capacity without
 *  touching star math). Uses the package-default floor — the live value
 *  is an AdminCap DF; the chain is the enforcement. */
export function effectiveSellerLevel(score: AgentScore | null): SellerLevel {
  if (!score) return 1;
  if (score.noDelivery >= NO_DELIVERY_REGRESSION_FLOOR) return 1;
  return sellerLevel(score);
}

/** Default active-job cap for a level (the live cap is AdminCap-tunable
 *  on-chain; this feeds display + preflight). */
export function activeCapForLevel(level: SellerLevel): number {
  return SELLER_LEVEL_ACTIVE_CAPS[level - 1];
}

/** Whether this seller clears an opening's `minSellerLevel` floor — on
 *  the EFFECTIVE level, matching the Move gate. */
export function meetsMinSellerLevel(score: AgentScore | null, minLevel: number): boolean {
  if (minLevel <= 0) return true;
  return effectiveSellerLevel(score) >= minLevel;
}

// === Trust tiers (S.1208) — the ONE user-facing trust vocabulary ===

/** User-facing name for a seller level. Every human/agent surface paints
 *  these — numeric "Level N" is protocol detail, never default UI copy. */
export function trustTierLabel(level: number): string {
  if (level === 1) return 'New';
  if (level === 2) return 'Established';
  if (level === 3) return 'Top rated';
  if (level === 4) return 'Veteran';
  return `Unknown tier (${level})`;
}

/** @deprecated S.1208 — use `trustTierLabel`. Same strings. */
export function sellerLevelLabel(level: number): string {
  return trustTierLabel(level);
}

/** Buyer-facing requirement chip for a posting's `minSellerLevel` floor.
 *  0/1 floors gate nothing beyond an active Agent ID → "Open". */
export function trustRequirementLabel(minSellerLevel: number): string {
  if (minSellerLevel <= 1) return 'Open';
  if (minSellerLevel === 2) return 'Established only';
  if (minSellerLevel === 3) return 'Top rated only';
  if (minSellerLevel === 4) return 'Veteran only';
  return `Unknown requirement (${minSellerLevel})`;
}

/** The ONE requirement chip for an opening's combined gates. Legacy
 *  `claimPolicy` 1/2 (pre-S.1209 posts) map onto the tier ladder —
 *  policy 1 shares Established's distinct-buyer floor, policy 2 adds
 *  Top rated's 4.0★ average. The board is cleared pre-launch, so the
 *  legacy arms should be unreachable — kept for stray reads. */
export function trustRequirementFromOpening(opening: {
  claimPolicy?: number;
  minSellerLevel?: number;
}): string {
  const minLevel = opening.minSellerLevel ?? 0;
  if (minLevel >= 2) return trustRequirementLabel(minLevel);
  const policy = opening.claimPolicy ?? 0;
  if (policy === 1) return 'Established';
  if (policy === 2) return 'Top rated';
  return 'Open';
}

/** English preflight for a claim (S.1192) — refuse BEFORE the sponsored
 *  rail instead of surfacing a raw Move abort. Checks, in gate order:
 *  claim policy (S.1054), the active-job cap on the claimer's effective
 *  level, then the opening's level floor. Capacity language, not ban
 *  language — a capped seller finishes work and claims again. */
export function preflightClaimOpening(
  score: AgentScore | null,
  opening: { claimPolicy: number; minSellerLevel?: number },
): { valid: boolean; error?: string } {
  if (!meetsClaimPolicy(score, opening.claimPolicy)) {
    return { valid: false, error: claimPolicyRequirement(opening.claimPolicy) };
  }
  const level = effectiveSellerLevel(score);
  const cap = activeCapForLevel(level);
  const active = score?.activeSellerJobs ?? 0;
  if (active >= cap) {
    return {
      valid: false,
      error:
        `Seller cap (${active}/${cap}) — ${trustTierLabel(level)} sellers run up to ${cap} ` +
        'claimed jobs in flight. Finish (deliver + settle) a job or wait for a deadline ' +
        'refund, then claim again.',
    };
  }
  const minLevel = opening.minSellerLevel ?? 0;
  if (!meetsMinSellerLevel(score, minLevel)) {
    return {
      valid: false,
      error:
        `Requires ${trustTierLabel(minLevel)} — you are ${trustTierLabel(level)}. ` +
        `Established = reviews from ${PROVEN_MIN_REVIEWS}+ distinct buyers; Top rated adds ` +
        'a 4.0★ average; no-shows can regress a tier. Earn it on Open postings first.',
    };
  }
  return { valid: true };
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
