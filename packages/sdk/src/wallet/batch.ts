import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { deriveDynamicFieldID } from '@mysten/sui/utils';
import { T2000Error } from '../errors.js';
import { USDC_DECIMALS } from '../constants.js';
import { USDC_TYPE } from '../token-registry.js';
import { validateAddress } from '../utils/sui.js';
import { selectAndSplitCoin } from './coinSelection.js';
import type { SuiCoreClient } from '../utils/sui.js';
import {
  A2A_ESCROW_OPENING_PACKAGE_ID,
  feeConfigArg,
  OPENING_CLAIM_POLICY_ANY_ACTIVE,
  preflightCreateOpening,
  type OpeningTerms,
} from './opening.js';
import {
  type AgentScore,
  preflightClaimOpening,
} from './reputation.js';

/**
 * Batch openings — client for `a2a_escrow::batch` (S.1193, Phase D wave
 * post). ONE post = N homogeneous slots backed by a single escrow of
 * `amount × slots`; each claimed slot mints a normal `escrow::Job`
 * (ClaimedJobKey stamped — settles with the ordinary job verbs and frees
 * the claimer's global active seat). One `batch_claim` per tx (v1 lock);
 * `maxClaimsPerAgent > 1` means sequential claim txs.
 *
 * Amount bounds are PER SLOT (same live min/max as a single post). The
 * wave TOTAL (`slots × amountUsdc`) is deliberately unbounded on-chain —
 * the wallet balance and the desk's own budget bound it.
 */

const MODULE = 'batch';
const CLOCK_ID = '0x6';

/** Mirror of the Move package default for slots per wave. The LIVE value
 *  is an AdminCap FeeConfig DF (`config_max_batch_slots`) — the chain is
 *  the SSOT and may be retuned between npm releases (same class as
 *  `MAX_JOB_USDC`); this mirror feeds the preflight's English only. */
export const MAX_BATCH_SLOTS_DEFAULT = 250;

/** Object-type marker for `resolveCreatedObjectId` digest walks. */
export const BATCH_OPENING_TYPE_MARKER = '::batch::BatchOpening<' as const;

export interface BatchOpeningTerms extends OpeningTerms {
  /** Slots in the wave (1..live max; default live max 250). `amountUsdc`
   *  is PER SLOT — total escrow = `slots × amountUsdc`. */
  slots: number;
  /** Slots one agent may claim of THIS wave (≥1; default 1). */
  maxClaimsPerAgent?: number;
}

/** Client-side preflight — the single-opening rules on the PER-SLOT terms
 *  plus the wave bounds. */
export function preflightCreateBatchOpening(terms: BatchOpeningTerms): {
  valid: boolean;
  code?: 'INVALID_AMOUNT' | 'INVALID_INPUT';
  error?: string;
} {
  const single = preflightCreateOpening(terms);
  if (!single.valid) return single;
  if (
    !Number.isInteger(terms.slots) ||
    terms.slots < 1 ||
    terms.slots > MAX_BATCH_SLOTS_DEFAULT
  ) {
    return {
      valid: false,
      code: 'INVALID_INPUT',
      error: `slots must be an integer 1–${MAX_BATCH_SLOTS_DEFAULT} (the live max is AdminCap-tunable on-chain).`,
    };
  }
  const maxClaims = terms.maxClaimsPerAgent ?? 1;
  if (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > terms.slots) {
    return {
      valid: false,
      code: 'INVALID_INPUT',
      error: 'maxClaimsPerAgent must be an integer ≥1 and ≤ slots.',
    };
  }
  return { valid: true };
}

/** Build the wave post: split `slots × amount` USDC → `create_batch_open`. */
export async function buildCreateBatchOpeningTx({
  client,
  buyer,
  terms,
}: {
  client: SuiCoreClient;
  buyer: string;
  terms: BatchOpeningTerms;
}): Promise<Transaction> {
  const pf = preflightCreateBatchOpening(terms);
  if (!pf.valid) throw new T2000Error(pf.code ?? 'INVALID_INPUT', pf.error ?? 'Invalid batch.');
  const perSlotRaw = BigInt(Math.floor(terms.amountUsdc * 10 ** USDC_DECIMALS));
  const totalRaw = perSlotRaw * BigInt(terms.slots);
  const tx = new Transaction();
  const { coin } = await selectAndSplitCoin(
    tx,
    client,
    validateAddress(buyer),
    USDC_TYPE,
    totalRaw,
    { allowSwapAll: false },
  );
  tx.moveCall({
    target: `${A2A_ESCROW_OPENING_PACKAGE_ID}::${MODULE}::create_batch_open`,
    typeArguments: [USDC_TYPE],
    arguments: [
      coin,
      tx.pure.u64(terms.slots),
      tx.pure.vector('u8', hexToBytes(terms.specHash)),
      tx.pure.u64(terms.openUntilMs),
      tx.pure.u64(terms.slaMs),
      tx.pure.u64(terms.reviewWindowMs),
      tx.pure.u64(terms.rejectSplitBps),
      tx.pure.u8(terms.claimPolicy ?? OPENING_CLAIM_POLICY_ANY_ACTIVE),
      tx.pure.u8(terms.minSellerLevel ?? 0),
      tx.pure.u8(terms.maxClaimsPerAgent ?? 1),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Claim ONE slot — same score plumbing as `buildClaimOpeningTx`
 *  (claimer's own AgentScore always; `create_empty_score` precursor when
 *  it doesn't exist yet). Unlike singles there is no policy-based entry
 *  split: `batch_claim` handles every policy internally. */
export function buildBatchClaimTx({
  batchId,
  registryId,
  scoreId,
}: {
  batchId: string;
  registryId: string;
  scoreId: string;
}): Transaction {
  if (!scoreId) {
    throw new T2000Error(
      'INVALID_INPUT',
      "Claiming needs the claimer's own AgentScore id (derive with " +
        'deriveAgentScoreId; create it first with buildCreateEmptyScoreTx when missing).',
    );
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_OPENING_PACKAGE_ID}::${MODULE}::batch_claim`,
    typeArguments: [USDC_TYPE],
    arguments: [
      tx.object(batchId),
      tx.object(registryId),
      tx.object(scoreId),
      feeConfigArg(tx),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

function batchCall(batchId: string, fn: 'cancel_batch_open' | 'refund_batch_expired'): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${A2A_ESCROW_OPENING_PACKAGE_ID}::${MODULE}::${fn}`,
    typeArguments: [USDC_TYPE],
    arguments: [tx.object(batchId), feeConfigArg(tx), tx.object(CLOCK_ID)],
  });
  return tx;
}

/** Buyer withdraws the unclaimed remainder — fee-free, any time. */
export function buildCancelBatchOpeningTx(batchId: string): Transaction {
  return batchCall(batchId, 'cancel_batch_open');
}

/** Permissionless remainder refund once `open_until` lapses. */
export function buildRefundBatchExpiredTx(batchId: string): Transaction {
  return batchCall(batchId, 'refund_batch_expired');
}

/** On-chain view of one BatchOpening. */
export interface BatchOpening {
  id: string;
  buyer: string;
  /** PER-SLOT escrow in display USDC. */
  amountUsdc: number;
  slotsTotal: number;
  slotsRemaining: number;
  feeBps: number;
  specHash: string;
  openUntilMs: number;
  slaMs: number;
  reviewWindowMs: number;
  rejectSplitBps: number;
  claimPolicy: number;
  minSellerLevel: number;
  maxClaimsPerAgent: number;
  /** Object id of the on-chain `claims_by_agent` Table (per-agent counts
   *  live as its dynamic fields — see `getBatchClaimsByAgent`). */
  claimsTableId: string | null;
  createdAtMs: number;
}

function bytesToHex(bytes: number[] | Uint8Array): string {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/^0x/, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

/** Read one BatchOpening by object id (null = not a batch / gone). A
 *  drained or cancelled batch still resolves (`slotsRemaining: 0`) — the
 *  object persists in v1; existence is NOT the state. */
export async function getBatchOpening(
  client: SuiCoreClient,
  batchId: string,
): Promise<BatchOpening | null> {
  const resp = await client.core
    .getObject({ objectId: batchId, include: { json: true } })
    .catch(() => null);
  const objType = resp?.object?.type ?? '';
  const json = resp?.object?.json as Record<string, unknown> | null | undefined;
  if (!json || !objType.includes(BATCH_OPENING_TYPE_MARKER)) {
    return null;
  }
  const table = json.claims_by_agent as { id?: unknown } | null | undefined;
  return {
    id: batchId,
    buyer: String(json.buyer),
    amountUsdc: Number(json.amount) / 10 ** USDC_DECIMALS,
    slotsTotal: Number(json.slots_total),
    slotsRemaining: Number(json.slots_remaining),
    feeBps: Number(json.fee_bps ?? 0),
    specHash: bytesToHex((json.spec_hash ?? []) as number[] | Uint8Array),
    openUntilMs: Number(json.open_until_ms),
    slaMs: Number(json.sla_ms),
    reviewWindowMs: Number(json.review_window_ms),
    rejectSplitBps: Number(json.reject_split_bps),
    claimPolicy: Number(json.claim_policy ?? 0),
    minSellerLevel: Number(json.min_seller_level ?? 0),
    maxClaimsPerAgent: Number(json.max_claims_per_agent ?? 1),
    claimsTableId: table?.id ? String(table.id) : null,
    createdAtMs: Number(json.created_at_ms ?? 0),
  };
}

/** Slots `agent` already claimed of this batch — best-effort read of the
 *  on-chain Table entry (0 on miss/hiccup; Move enforces the real limit). */
export async function getBatchClaimsByAgent(
  client: SuiCoreClient,
  batch: BatchOpening,
  agent: string,
): Promise<number> {
  if (!batch.claimsTableId) return 0;
  try {
    const fieldId = deriveDynamicFieldID(
      batch.claimsTableId,
      'address',
      bcs.Address.serialize(validateAddress(agent)).toBytes(),
    );
    const resp = await client.core.getObject({
      objectId: fieldId,
      include: { json: true },
    });
    const json = resp?.object?.json as { value?: unknown } | null | undefined;
    return Number(json?.value ?? 0);
  } catch {
    return 0;
  }
}

/** English preflight for a batch claim — the wave gates first (slots,
 *  per-agent limit), then the exact single-claim stack (policy → active
 *  cap → level floor via `preflightClaimOpening`). */
export function preflightBatchClaim(
  score: AgentScore | null,
  batch: {
    claimPolicy: number;
    minSellerLevel?: number;
    slotsRemaining: number;
    maxClaimsPerAgent: number;
  },
  myClaims: number,
): { valid: boolean; error?: string } {
  if (batch.slotsRemaining <= 0) {
    return {
      valid: false,
      error:
        'No slots left on this batch — every slot is claimed. Find open waves on the board.',
    };
  }
  if (myClaims >= batch.maxClaimsPerAgent) {
    return {
      valid: false,
      error:
        `This wave allows ${batch.maxClaimsPerAgent} slot${batch.maxClaimsPerAgent === 1 ? '' : 's'} per agent and this wallet already holds ${myClaims}. ` +
        'Deliver what you claimed; other waves on the board are open.',
    };
  }
  return preflightClaimOpening(score, batch);
}
