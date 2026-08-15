import { Transaction } from '@mysten/sui/transactions';
import { T2000Error } from '../errors.js';
import { USDC_TYPE } from '../token-registry.js';
import { USDC_DECIMALS } from '../constants.js';
import {
  type PreflightResult,
  PREFLIGHT_OK,
  preflightFail,
  checkSuiAddress,
} from '../preflight.js';
import { validateAddress, type SuiCoreClient } from '../utils/sui.js';
import { selectAndSplitCoin } from './coinSelection.js';
import { A2A_ESCROW_LATEST_PACKAGE_ID } from './opening.js';

/**
 * A2A Escrow — client for the `a2a_escrow::escrow` Move package
 * (SPEC_A2A_ESCROW, t2 Agents Phase 3).
 *
 * One shared `Job<USDC>` object per engagement; the escrow balance lives IN
 * the object (no treasury, no admin key). These builders construct UNSIGNED
 * transactions; the caller signs (buyer for create/release/reject, seller
 * for deliver, ANYONE for the two timeout cranks) and may sponsor gas — the
 * Move calls authorize on `ctx.sender()`, so sponsorship never weakens auth.
 *
 * Browser-safe (no fs / keyManager imports) so store surfaces can build the
 * buyer-side legs on a zkLogin session key.
 *
 * Deployed on Sui mainnet 2026-07-18 (fresh publish after the contract
 * review — in-contract protocol fee (5% since 2026-07-19; D-1, SPEC_ACP_SUI §7) snapshotted
 * onto the Job at create, FeeConfig versioning, bounded windows). Override
 * via env for testnet/dev.
 */

/** The published `a2a_escrow` package id on MAINNET — a literal, never an
 *  env read.
 *
 *  Security (S.930): the env-overridable constant below is a dev/testnet
 *  convenience, which makes it useless as a trust anchor — anything verifying
 *  "is this the real escrow package?" against it would be checking the
 *  attacker's own answer. Signature-time verification compares against THIS.
 *  Must match the Move upgrade publish notes. */
export const MAINNET_A2A_ESCROW_PACKAGE_ID =
  '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd';

/** The published `a2a_escrow` package id (mainnet default; env-overridable
 *  for testnet/dev — NOT a trust anchor, see above). */
export const A2A_ESCROW_PACKAGE_ID =
  process.env.A2A_ESCROW_PACKAGE_ID ?? MAINNET_A2A_ESCROW_PACKAGE_ID;

/** The shared `FeeConfig` object every escrow entry reads (mainnet). */
export const A2A_ESCROW_FEE_CONFIG_ID =
  process.env.A2A_ESCROW_FEE_CONFIG_ID ??
  '0xddaa25570950b7484dbf20797ebcf75707be9c87cd67bef2a06ed2e81d2c494b';

/** `initial_shared_version` of the FeeConfig — lets builders reference the
 *  shared object without a resolution round-trip (browser + PTB friendly). */
export const A2A_ESCROW_FEE_CONFIG_VERSION = Number(
  process.env.A2A_ESCROW_FEE_CONFIG_VERSION ?? 931861903,
);

const CLOCK_ID = '0x6';
const MODULE = 'escrow';

/** Immutable reference to the shared FeeConfig for the five escrow verbs. */
function feeConfigArg(tx: Transaction) {
  return tx.sharedObjectRef({
    objectId: A2A_ESCROW_FEE_CONFIG_ID,
    initialSharedVersion: A2A_ESCROW_FEE_CONFIG_VERSION,
    mutable: false,
  });
}

/** v1 job-value cap in USDC — same instinct as the catalog price cap: the
 *  no-arbitration reject-split is only fair at sizes where neither side is
 *  incentivized to game it (SPEC_A2A_ESCROW §2). On-chain since the S.981
 *  v4 upgrade (`MAX_JOB_AMOUNT_DEFAULT`, AdminCap-tunable ≤ 100 USDC). */
export const MAX_JOB_USDC = 50;

/** Job-value floor in USDC — the CURRENT contract-configured minimum, not an
 *  immutable code fact (S.1053, founder 2026-08-15: one-cent micro-work).
 *  On-chain SSOT is the live `FeeConfig` min-amount DF (AdminCap
 *  `set_min_job_amount`, package hard floor 0.01); this mirror is the
 *  preflight's human error, and an admin retune between releases surfaces
 *  as the on-chain abort instead. Every consumer (CLI, console, Connect)
 *  must import this — never copy the number. */
export const MIN_JOB_USDC = 0.01;

/** Contract-enforced create bounds (mirror `escrow.move` — the caps that
 *  close the v1 unbounded-window overflow lock). */
export const MAX_REVIEW_WINDOW_MS = 2_592_000_000; // 30 days
export const MAX_DELIVER_HORIZON_MS = 31_536_000_000; // 365 days

/** Job lifecycle states, mirroring the Move constants. */
export const JOB_STATES = [
  'funded',
  'delivered',
  'released',
  'refunded',
  'rejected',
] as const;
export type JobState = (typeof JOB_STATES)[number];

export interface JobTerms {
  /** The seller's wallet (the listing's payTo / claimed Agent ID wallet). */
  seller: string;
  /** Job value in display USDC (e.g. `5` = 5 USDC). ≤ `MAX_JOB_USDC`. */
  amountUsdc: number;
  /** Hash/commitment of the job spec (hex string, `0x…` or bare). */
  specHash: string;
  /** Epoch-ms deadline the seller must deliver by. */
  deliverByMs: number;
  /** Buyer's accept/reject window (ms) after delivery; lapse = release. */
  reviewWindowMs: number;
  /** Buyer's share in basis points on reject (0–10000). Fixed at create. */
  rejectSplitBps: number;
}

/** Parsed on-chain `Job` object. */
export interface Job {
  id: string;
  buyer: string;
  seller: string;
  /** Locked amount in display USDC (immutable record). */
  amountUsdc: number;
  /** What's still in the object — 0 after settlement. */
  escrowUsdc: number;
  /** Protocol fee bps snapshotted at create (taken from seller-bound funds
   *  at settlement; refunds are fee-free). */
  feeBps: number;
  specHash: string;
  deliverByMs: number;
  reviewWindowMs: number;
  rejectSplitBps: number;
  state: JobState;
  deliveryHash: string | null;
  deliveredAtMs: number | null;
  createdAtMs: number;
}

// ---------------------------------------------------------------------------
// Hash plumbing — spec/delivery commitments travel as vector<u8>.
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new T2000Error(
      'INVALID_AMOUNT',
      `Expected a hex hash (0x…), got "${hex.slice(0, 32)}"`,
    );
  }
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

/** gRPC's `json` include renders Move `vector<u8>` as a base64 STRING;
 *  JSON-RPC (and tests) hand back number arrays. Accept both. */
function bytesToHex(bytes: number[] | Uint8Array | string): string {
  const arr =
    typeof bytes === 'string'
      ? Array.from(atob(bytes), (c) => c.charCodeAt(0))
      : bytes;
  let s = '0x';
  for (const b of arr) s += b.toString(16).padStart(2, '0');
  return s;
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

/**
 * Synchronous, network-free preflight for `create`. Terms sanity only —
 * the balance read happens in `buildCreateJobTx`.
 */
export function preflightCreateJob(terms: JobTerms): PreflightResult {
  const addressCheck = checkSuiAddress(terms.seller);
  if (!addressCheck.valid) return addressCheck;
  if (!Number.isFinite(terms.amountUsdc) || terms.amountUsdc <= 0) {
    return preflightFail('INVALID_AMOUNT', `Amount must be positive. Got ${terms.amountUsdc}.`);
  }
  if (terms.amountUsdc < MIN_JOB_USDC) {
    return preflightFail(
      'INVALID_AMOUNT',
      `Escrow jobs start at ${MIN_JOB_USDC} USDC (contract-enforced minimum). Got ${terms.amountUsdc}.`,
    );
  }
  if (terms.amountUsdc > MAX_JOB_USDC) {
    return preflightFail(
      'INVALID_AMOUNT',
      `v1 caps escrow jobs at ${MAX_JOB_USDC} USDC (no-arbitration split only stays fair at small sizes). Got ${terms.amountUsdc}.`,
    );
  }
  if (terms.deliverByMs <= Date.now()) {
    return preflightFail('INVALID_AMOUNT', 'deliverByMs must be in the future.');
  }
  if (terms.deliverByMs > Date.now() + MAX_DELIVER_HORIZON_MS) {
    return preflightFail('INVALID_AMOUNT', 'deliverByMs is more than 365 days out.');
  }
  if (terms.reviewWindowMs < 0 || terms.reviewWindowMs > MAX_REVIEW_WINDOW_MS) {
    return preflightFail('INVALID_AMOUNT', 'reviewWindowMs must be 0–30 days.');
  }
  if (
    !Number.isInteger(terms.rejectSplitBps) ||
    terms.rejectSplitBps < 0 ||
    terms.rejectSplitBps > 10_000
  ) {
    return preflightFail('INVALID_AMOUNT', 'rejectSplitBps must be an integer 0–10000.');
  }
  try {
    hexToBytes(terms.specHash);
  } catch (e) {
    return preflightFail('INVALID_AMOUNT', (e as T2000Error).message);
  }
  return PREFLIGHT_OK;
}

// ---------------------------------------------------------------------------
// Transaction builders (unsigned; caller signs + executes / sponsors)
// ---------------------------------------------------------------------------

/**
 * Buyer creates AND funds a job in one PTB — `escrow::create` consumes a
 * `Coin<USDC>` sourced from the buyer's coins + address balance.
 */
export async function buildCreateJobTx({
  client,
  buyer,
  terms,
}: {
  client: SuiCoreClient;
  buyer: string;
  terms: JobTerms;
}): Promise<Transaction> {
  const pf = preflightCreateJob(terms);
  if (!pf.valid) throw new T2000Error(pf.code, pf.error);

  const seller = validateAddress(terms.seller);
  if (seller === validateAddress(buyer)) {
    throw new T2000Error('INVALID_ADDRESS', 'Buyer and seller must be different wallets.');
  }
  // Floor, never round up — a rounded-up raw amount can exceed the on-chain
  // balance (financial-amounts discipline).
  const rawAmount = BigInt(Math.floor(terms.amountUsdc * 10 ** USDC_DECIMALS));

  const tx = new Transaction();
  const { coin } = await selectAndSplitCoin(tx, client, buyer, USDC_TYPE, rawAmount, {
    allowSwapAll: false,
  });
  // S.981: version-gated verbs target the LATEST package id (the original id
  // stays the type/event anchor). Pre-cutover this is byte-identical code at
  // the v3 id; post-upgrade it's what keeps create on the version-gated path.
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::${MODULE}::create`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.pure.address(seller),
      coin,
      tx.pure.vector('u8', hexToBytes(terms.specHash)),
      tx.pure.u64(terms.deliverByMs),
      tx.pure.u64(terms.reviewWindowMs),
      tx.pure.u64(terms.rejectSplitBps),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Seller's pre-delivery abort (SPEC_T2_AGENTS_TRUST §B): FUNDED only →
 *  full fee-free refund to the buyer, terminal state REFUNDED (the
 *  JobDeclined event is what distinguishes a decline from a deadline
 *  refund). Targets the latest package id — `decline` shipped in v3. */
export function buildDeclineJobTx(jobId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::${MODULE}::decline`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(jobId), feeConfigArg(tx), tx.object(CLOCK_ID)],
  });
  return tx;
}

function jobCall(jobId: string, fn: 'release'): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::${MODULE}::${fn}`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(jobId), feeConfigArg(tx), tx.object(CLOCK_ID)],
  });
  return tx;
}

/** Buyer rejects delivered work — S.1063: settles through
 *  `reputation::reject_v2` (Passport buyer) or `reject_v2_agent_buyer`
 *  (registered Agent-ID buyer, who also accrues `as_buyer_rejected`), so
 *  the protocol outcome lands on the seller's score. Score ids derive
 *  locally (`deriveAgentScoreId`); pass `buyerScoreId` exactly when the
 *  buyer is a registered agent — the contract refuses a mismatched
 *  variant, so a registered buyer can't dodge its own counter. */
export function buildRejectJobTx(
  jobId: string,
  v2: { sellerScoreId: string; registryId: string; buyerScoreId?: string },
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::reputation::${v2.buyerScoreId ? 'reject_v2_agent_buyer' : 'reject_v2'}`,
    typeArguments: [USDC_TYPE],
    arguments: v2.buyerScoreId
      ? [
          tx.object(jobId),
          tx.object(v2.sellerScoreId),
          tx.object(v2.buyerScoreId),
          tx.object(v2.registryId),
          feeConfigArg(tx),
          tx.object(CLOCK_ID),
        ]
      : [
          tx.object(jobId),
          tx.object(v2.sellerScoreId),
          tx.object(v2.registryId),
          feeConfigArg(tx),
          tx.object(CLOCK_ID),
        ],
  });
  return tx;
}

/** Deadline refund (no delivery) — S.1063: settles through
 *  `reputation::refund_v2` so `no_delivery` lands on the seller's score.
 *  Still permissionless: funds only ever return to the buyer. */
export function buildRefundJobTx(
  jobId: string,
  v2: { sellerScoreId: string },
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::reputation::refund_v2`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(jobId),
      tx.object(v2.sellerScoreId),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Seller posts the delivery commitment (hex hash) before the deadline. */
export function buildDeliverJobTx(jobId: string, deliveryHash: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_LATEST_PACKAGE_ID}::${MODULE}::deliver`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(jobId),
      tx.pure.vector('u8', hexToBytes(deliveryHash)),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Buyer accepts (or anyone, once the review window lapsed) → funds to seller. */
export function buildReleaseJobTx(jobId: string): Transaction {
  return jobCall(jobId, 'release');
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Fetch + parse a `Job` shared object. Throws `RPC_ERROR` when the id
 *  doesn't resolve to an a2a_escrow Job. */
export async function getJob(client: SuiCoreClient, jobId: string): Promise<Job> {
  const resp = await client.core
    .getObject({ objectId: jobId, include: { json: true } })
    .catch((e: unknown) => {
      throw new T2000Error(
        'RPC_ERROR',
        `Job ${jobId} not found: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  const objType = resp.object?.type ?? '';
  const json = resp.object?.json as Record<string, unknown> | null | undefined;
  if (!json || !objType.includes(`::${MODULE}::Job<`)) {
    throw new T2000Error('RPC_ERROR', `Object ${jobId} is not an a2a_escrow Job.`);
  }
  const stateNum = Number(json.state ?? -1);
  const state = JOB_STATES[stateNum];
  if (!state) {
    throw new T2000Error('RPC_ERROR', `Job ${jobId} has unknown state ${stateNum}.`);
  }
  const deliveredAtMs = Number(json.delivered_at_ms ?? 0);
  const deliveryBytes = (json.delivery_hash ?? []) as number[] | Uint8Array;
  const hasDelivery = deliveredAtMs > 0;
  return {
    id: jobId,
    buyer: String(json.buyer),
    seller: String(json.seller),
    amountUsdc: Number(json.amount) / 10 ** USDC_DECIMALS,
    escrowUsdc: Number(json.escrow) / 10 ** USDC_DECIMALS,
    feeBps: Number(json.fee_bps ?? 0),
    specHash: bytesToHex((json.spec_hash ?? []) as number[] | Uint8Array),
    deliverByMs: Number(json.deliver_by_ms),
    reviewWindowMs: Number(json.review_window_ms),
    rejectSplitBps: Number(json.reject_split_bps),
    state,
    deliveryHash: hasDelivery ? bytesToHex(deliveryBytes) : null,
    deliveredAtMs: hasDelivery ? deliveredAtMs : null,
    createdAtMs: Number(json.created_at_ms),
  };
}

/** What `caller` can do to `job` right now — drives `t2 job watch` (the
 *  ACP-style "available action" readout) and any host UI. */
export function jobActionsFor(
  job: Job,
  caller: string,
  nowMs = Date.now(),
): string[] {
  const me = validateAddress(caller);
  const isBuyer = me === job.buyer;
  const isSeller = me === job.seller;
  const actions: string[] = [];
  if (job.state === 'funded') {
    if (isSeller && nowMs <= job.deliverByMs) actions.push('deliver');
    // S.1015 (beta #93 round five): NEVER volunteer buyer release on a
    // funded job — with zero deliveries it pays the full escrow to a
    // no-show seller, terminally. The Move goodwill escape (funded→release
    // by the buyer, for off-band delivery) stays on-chain but is opt-in at
    // the command layer only (`t2 job release --pay-without-delivery`).
    if (nowMs > job.deliverByMs) actions.push('refund');
  } else if (job.state === 'delivered') {
    const windowClosesMs = (job.deliveredAtMs ?? 0) + job.reviewWindowMs;
    if (isBuyer && nowMs <= windowClosesMs) actions.push('release', 'reject');
    if (nowMs > windowClosesMs) actions.push('release');
  }
  return actions;
}

export interface JobVerification {
  ok: boolean;
  job: Job;
  /** Human-readable reasons when `ok` is false. */
  problems: string[];
}

/**
 * Seller-side escrow verification — the x402 `intent: "escrow"` credential
 * check. Before starting work on a job id received in an `X-PAYMENT` header,
 * the seller confirms ON-CHAIN (works for every buyer signer, incl. zkLogin):
 * funded, pays ME, covers the price, and leaves enough runway to deliver.
 */
export async function verifyJobForSeller({
  client,
  jobId,
  seller,
  minAmountUsdc,
  minRunwayMs = 60_000,
}: {
  client: SuiCoreClient;
  jobId: string;
  seller: string;
  /** The listing's price for this job class. */
  minAmountUsdc: number;
  /** Minimum time-to-deadline to accept the job (default 60s). */
  minRunwayMs?: number;
}): Promise<JobVerification> {
  const job = await getJob(client, jobId);
  const problems: string[] = [];
  if (job.state !== 'funded') {
    problems.push(`state is "${job.state}", expected "funded"`);
  }
  if (job.seller !== validateAddress(seller)) {
    problems.push(`job pays ${job.seller}, not this seller`);
  }
  if (job.escrowUsdc < minAmountUsdc) {
    problems.push(`escrow holds ${job.escrowUsdc} USDC, price is ${minAmountUsdc}`);
  }
  if (job.deliverByMs - Date.now() < minRunwayMs) {
    problems.push('deadline too close to accept');
  }
  return { ok: problems.length === 0, job, problems };
}
