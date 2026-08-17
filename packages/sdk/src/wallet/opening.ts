import { Transaction } from '@mysten/sui/transactions';
import { T2000Error } from '../errors.js';
import { USDC_DECIMALS } from '../constants.js';
import { USDC_TYPE } from '../token-registry.js';
import { validateAddress } from '../utils/sui.js';
import { selectAndSplitCoin } from './coinSelection.js';
import type { SuiCoreClient } from '../utils/sui.js';
import {
  A2A_ESCROW_FEE_CONFIG_ID,
  A2A_ESCROW_FEE_CONFIG_VERSION,
  MAX_JOB_USDC,
  MIN_JOB_USDC,
} from './job.js';

/**
 * Open door — client for `a2a_escrow::opening` (SPEC_T2_AGENTS_OPEN_ONCHAIN,
 * Phase 3 escrow-at-post). Posting an open job escrows USDC on-chain
 * immediately in a shared `Opening<USDC>`; the first ACTIVE registered seller
 * to claim mints a normal `escrow::Job` (deliver/settle with the job verbs).
 * No claim by `open_until` → `refund_unclaimed` (permissionless, fee-free);
 * the buyer can `cancel_open` any time while unclaimed.
 *
 * The `opening` module shipped in the v2 package upgrade, so its calls
 * target the LATEST published id — the original id (types, Job verbs) is
 * unchanged.
 */

/** The LATEST published `a2a_escrow` package id on MAINNET (v9 upgrade
 *  2026-08-15, S.1064 — review on REJECTED, additive; v8 = outcome
 *  counters (S.1063); v7 = distinct buyers (S.1062);
 *  v6 = S.1054 — `reputation` module + `opening::claim_proven`;
 *  v5 locked open reject at 10000 (S.1019); v4 added amount bounds
 *  (S.981); v3 added `escrow::decline`; v2 the `opening` module).
 *  A literal, never an env read, so it can serve as a signature-time trust
 *  anchor (S.930). Must match the Move upgrade publish notes.
 *
 *  S.981: EVERY version-gated verb (escrow create/deliver/release/reject/
 *  refund + decline + all opening verbs) targets this id, so a package
 *  upgrade + `migrate` cutover is a ONE-VALUE change here. The original id
 *  (`MAINNET_A2A_ESCROW_PACKAGE_ID` in job.ts) remains the anchor for type
 *  strings, event filters, and object-type queries — those never move. */
export const MAINNET_A2A_ESCROW_LATEST_PACKAGE_ID =
  '0x7a9332e167d19e7442fb30740d31a536047da10ab00715402c6fff9e80ae604d';

/** Back-compat name for the latest id (pre-S.981 consumers import this). */
export const MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID =
  MAINNET_A2A_ESCROW_LATEST_PACKAGE_ID;

/** Env-overridable latest id for testnet/dev (NOT a trust anchor). A fresh
 *  dev publish has original == latest, so `A2A_ESCROW_PACKAGE_ID` alone is
 *  honored as the fallback override. */
export const A2A_ESCROW_LATEST_PACKAGE_ID =
  process.env.A2A_ESCROW_OPENING_PACKAGE_ID ??
  process.env.A2A_ESCROW_PACKAGE_ID ??
  MAINNET_A2A_ESCROW_LATEST_PACKAGE_ID;

/** Back-compat name (pre-S.981). */
export const A2A_ESCROW_OPENING_PACKAGE_ID = A2A_ESCROW_LATEST_PACKAGE_ID;

/**
 * PINNED per-upgrade package ids — event-filter anchors, NEVER bump these.
 *
 * A Sui event's type carries the package id that FIRST DEFINED the struct,
 * not the id of the version that executed. Indexers filtering
 * `<pkg>::module` must therefore pin the DEFINING id per event family:
 *   v1 (A2A_ESCROW_PACKAGE_ID)  — JobCreated/Delivered/Released/Rejected/Refunded
 *   v2 (…_V2_ID)                — OpeningCreated/Claimed/Cancelled/Refunded
 *   v3 (…_V3_ID)                — JobDeclined
 * Filtering the floating LATEST id matches nothing once the next upgrade
 * lands (live finding, 2026-07-28: the openings indexer went dark when
 * A2A_ESCROW_OPENING_PACKAGE_ID moved v2 → v3).
 */
export const A2A_ESCROW_PACKAGE_V2_ID =
  '0x860288d789dc617f6474a0a6801d6011e53bf30d5fb801cdad47b9bc6adb098b';
export const A2A_ESCROW_PACKAGE_V3_ID =
  '0x69ad93c555519de520a5c7f7f2963ad6f8b91cefc098fc2eed75942dcb5bcbe7';
/** v6 (S.1054, upgrade FHcn7KCB… 2026-08-15) — defining id for the
 *  `reputation` module: the ScoreBoardCreated/ScoreCreated/ReviewSubmitted
 *  events and the ScoreBoard/AgentScore object types. A DEFINING-id anchor
 *  like V2/V3 — never moves again, even when LATEST does. */
export const A2A_ESCROW_PACKAGE_V6_ID =
  '0xb065033b6f72c4899055a0b3afac28f09dc7b0b7b491eada793157de20000618';
/** v7 (S.1062, upgrade 3DcWdSPE… 2026-08-15) — defining id for the
 *  distinct-buyer surface: the ReviewSubmittedV2 event and the
 *  DistinctCountKey/BuyerSeenKey DF key types. A DEFINING-id anchor like
 *  V2/V3/V6 — never moves again, even when LATEST does. */
export const A2A_ESCROW_PACKAGE_V7_ID =
  '0x4249f0b242c47c7baf0c37304365bc4bbe769bcedf11f3525e84682d59a3b23e';
/** v8 (S.1063, upgrade HNphxqJx… 2026-08-15) — defining id for the
 *  outcome surface: the OutcomeRecorded event and the
 *  RejectedAfterDeliveryKey/NoDeliveryKey/AsBuyerRejectedKey DF key types.
 *  A DEFINING-id anchor like V2/V3/V6/V7 — never moves again. */
export const A2A_ESCROW_PACKAGE_V8_ID =
  '0x1595b80bc05a03607f3908702c866ca63cf961025b4263b5ecbe419e07f8ff31';

const CLOCK_ID = '0x6';
const MODULE = 'opening';
const SHA256_HEX_RE = /^(0x)?[0-9a-fA-F]{64}$/;

/** Default claim policy: any ACTIVE registered Agent ID ($0 claim, FCFS). */
export const OPENING_CLAIM_POLICY_ANY_ACTIVE = 0;
/** S.1054 — Proven: claimer needs ≥ PROVEN_MIN_REVIEWS on-chain reviews
 *  (see `wallet/reputation.ts`). Claims route through `claim_proven`. */
export const OPENING_CLAIM_POLICY_PROVEN = 1;
/** S.1054 — Proven · 4★+: Proven AND average stars ≥ 4.0 (strictly
 *  stronger than policy 1). */
export const OPENING_CLAIM_POLICY_PROVEN_4STAR = 2;
/** Max time an opening may stay claimable (contract cap): 30 days. */
export const MAX_OPEN_WINDOW_MS = 2_592_000_000;

/** Shared, package-internal: the immutable FeeConfig ref every escrow call
 *  takes (also used by `wallet/reputation.ts` — single source). */
export function feeConfigArg(tx: Transaction) {
  return tx.sharedObjectRef({
    objectId: A2A_ESCROW_FEE_CONFIG_ID,
    initialSharedVersion: A2A_ESCROW_FEE_CONFIG_VERSION,
    mutable: false,
  });
}

function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/^0x/, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

export interface OpeningTerms {
  /** Budget in USDC — escrows NOW, at post. */
  amountUsdc: number;
  /** sha256 of the public spec envelope (t2-acp-custom@1: title + brief). */
  specHash: string;
  /** Epoch-ms the opening stays claimable until (≤ 30d out). */
  openUntilMs: number;
  /** Delivery window the claiming seller gets: deliver_by = claim + sla. */
  slaMs: number;
  reviewWindowMs: number;
  /** v5 (S.1019): MUST be 10000 — open-board reject pays the buyer in
   *  full (contract-asserted; a partial split made junk delivery +EV over
   *  an honest decline). Hire/`escrow::create` keeps the 0–10000 range. */
  rejectSplitBps: number;
  /** S.1054 — who may race to claim: 0 Anyone (default), 1 Proven,
   *  2 Proven · 4★+. Never changes HOW a claim works: still FCFS, still
   *  $0. 3+ aborts on-chain until defined. */
  claimPolicy?: number;
}

/** Every claim policy `create_open` accepts (S.1054). */
export const OPENING_CLAIM_POLICIES = [
  OPENING_CLAIM_POLICY_ANY_ACTIVE,
  OPENING_CLAIM_POLICY_PROVEN,
  OPENING_CLAIM_POLICY_PROVEN_4STAR,
] as const;

/** The only reject split `create_open` accepts since v5 (S.1019). */
export const OPEN_REJECT_SPLIT_BPS = 10_000;

/** Client-side preflight — mirrors the contract's `create_open` bounds plus
 *  the $50 client cap (the contract is value-neutral, same as Job). */
export function preflightCreateOpening(terms: OpeningTerms): {
  valid: boolean;
  code?: 'INVALID_AMOUNT' | 'INVALID_INPUT';
  error?: string;
} {
  if (!Number.isFinite(terms.amountUsdc) || terms.amountUsdc <= 0) {
    return { valid: false, code: 'INVALID_AMOUNT', error: 'Budget must be positive.' };
  }
  if (terms.amountUsdc < MIN_JOB_USDC) {
    return {
      valid: false,
      code: 'INVALID_AMOUNT',
      error: `Open jobs start at ${MIN_JOB_USDC} USDC (contract-enforced minimum). Got ${terms.amountUsdc}.`,
    };
  }
  if (terms.amountUsdc > MAX_JOB_USDC) {
    return {
      valid: false,
      code: 'INVALID_AMOUNT',
      error: `Open jobs cap at ${MAX_JOB_USDC} USDC (v1).`,
    };
  }
  if (!SHA256_HEX_RE.test(terms.specHash)) {
    return { valid: false, code: 'INVALID_INPUT', error: 'specHash must be a sha256 hex string.' };
  }
  const now = Date.now();
  if (terms.openUntilMs <= now) {
    return { valid: false, code: 'INVALID_INPUT', error: 'openUntil must be in the future.' };
  }
  if (terms.openUntilMs > now + MAX_OPEN_WINDOW_MS) {
    return { valid: false, code: 'INVALID_INPUT', error: 'Openings can stay claimable at most 30 days.' };
  }
  if (terms.slaMs <= 0) {
    return { valid: false, code: 'INVALID_INPUT', error: 'Delivery window must be positive.' };
  }
  if (terms.rejectSplitBps !== OPEN_REJECT_SPLIT_BPS) {
    return {
      valid: false,
      code: 'INVALID_INPUT',
      error:
        'Open postings lock reject at 100% buyer / 0% seller (rejectSplitBps must be 10000, ' +
        'contract-enforced since v5) — reject is economically a decline, so junk delivery has no edge.',
    };
  }
  const policy = terms.claimPolicy ?? OPENING_CLAIM_POLICY_ANY_ACTIVE;
  if (!(OPENING_CLAIM_POLICIES as readonly number[]).includes(policy)) {
    return {
      valid: false,
      code: 'INVALID_INPUT',
      error:
        'claimPolicy must be 0 (Anyone), 1 (Proven) or 2 (Proven · 4★+) — ' +
        'anything else aborts on-chain.',
    };
  }
  return { valid: true };
}

/** Build the escrow-at-post tx: split USDC → `opening::create_open`. */
export async function buildCreateOpeningTx({
  client,
  buyer,
  terms,
}: {
  client: SuiCoreClient;
  buyer: string;
  terms: OpeningTerms;
}): Promise<Transaction> {
  const pf = preflightCreateOpening(terms);
  if (!pf.valid) throw new T2000Error(pf.code ?? 'INVALID_INPUT', pf.error ?? 'Invalid opening.');
  const rawAmount = BigInt(Math.floor(terms.amountUsdc * 10 ** USDC_DECIMALS));
  const tx = new Transaction();
  const { coin } = await selectAndSplitCoin(tx, client, validateAddress(buyer), USDC_TYPE, rawAmount, {
    allowSwapAll: false,
  });
  tx.moveCall({
    target: `${A2A_ESCROW_OPENING_PACKAGE_ID}::${MODULE}::create_open`,
    typeArguments: [USDC_TYPE],
    arguments: [
      coin,
      tx.pure.vector('u8', hexToBytes(terms.specHash)),
      tx.pure.u64(terms.openUntilMs),
      tx.pure.u64(terms.slaMs),
      tx.pure.u64(terms.reviewWindowMs),
      tx.pure.u64(terms.rejectSplitBps),
      tx.pure.u8(terms.claimPolicy ?? OPENING_CLAIM_POLICY_ANY_ACTIVE),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Claim an opening (seller side) — consumes it and mints the funded Job.
 *  `registryId` = the shared `agent_id::registry::Registry` object
 *  (callers pass `AGENT_ID_REGISTRY_ID` from `@t2000/id` — single source).
 *
 *  S.1054: for a PROVEN opening (`claimPolicy` 1/2) pass `scoreId` — the
 *  claimer's own `AgentScore` (compute with `deriveAgentScoreId`) — and the
 *  call routes to `claim_proven`, which reads it immutably. Omitting it on
 *  a Proven opening aborts on-chain; preflight with `meetsClaimPolicy`
 *  first for an English refusal. */
export function buildClaimOpeningTx({
  openingId,
  registryId,
  scoreId,
}: {
  openingId: string;
  registryId: string;
  scoreId?: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_OPENING_PACKAGE_ID}::${MODULE}::${scoreId ? 'claim_proven' : 'claim'}`,
    typeArguments: [USDC_TYPE],
    arguments: scoreId
      ? [
          tx.object(openingId),
          tx.object(registryId),
          tx.object(scoreId),
          feeConfigArg(tx),
          tx.object(CLOCK_ID),
        ]
      : [
          tx.object(openingId),
          tx.object(registryId),
          feeConfigArg(tx),
          tx.object(CLOCK_ID),
        ],
  });
  return tx;
}

function openingCall(openingId: string, fn: 'cancel_open' | 'refund_unclaimed'): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_OPENING_PACKAGE_ID}::${MODULE}::${fn}`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(openingId), feeConfigArg(tx), tx.object(CLOCK_ID)],
  });
  return tx;
}

/** Buyer withdraws an unclaimed opening — fee-free, any time. */
export function buildCancelOpeningTx(openingId: string): Transaction {
  return openingCall(openingId, 'cancel_open');
}

/** Permissionless refund crank for an opening past `open_until`. */
export function buildRefundUnclaimedTx(openingId: string): Transaction {
  return openingCall(openingId, 'refund_unclaimed');
}

/** On-chain view of one Opening. */
export interface Opening {
  id: string;
  buyer: string;
  amountUsdc: number;
  feeBps: number;
  specHash: string;
  openUntilMs: number;
  slaMs: number;
  reviewWindowMs: number;
  rejectSplitBps: number;
  claimPolicy: number;
  createdAtMs: number;
}

function bytesToHex(bytes: number[] | Uint8Array): string {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Read one Opening by object id (null = gone: claimed/cancelled/refunded). */
export async function getOpening(
  client: SuiCoreClient,
  openingId: string,
): Promise<Opening | null> {
  const resp = await client.core
    .getObject({ objectId: openingId, include: { json: true } })
    .catch(() => null);
  const objType = resp?.object?.type ?? '';
  const json = resp?.object?.json as Record<string, unknown> | null | undefined;
  if (!json || !objType.includes(`::${MODULE}::Opening<`)) {
    return null;
  }
  return {
    id: openingId,
    buyer: String(json.buyer),
    amountUsdc: Number(json.amount) / 10 ** USDC_DECIMALS,
    feeBps: Number(json.fee_bps ?? 0),
    specHash: bytesToHex((json.spec_hash ?? []) as number[] | Uint8Array),
    openUntilMs: Number(json.open_until_ms),
    slaMs: Number(json.sla_ms),
    reviewWindowMs: Number(json.review_window_ms),
    rejectSplitBps: Number(json.reject_split_bps),
    claimPolicy: Number(json.claim_policy ?? 0),
    createdAtMs: Number(json.created_at_ms ?? 0),
  };
}
