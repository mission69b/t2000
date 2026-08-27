// Open jobs API client (SPEC_T2_AGENTS_OPEN_ONCHAIN, Phase 3) — the second
// door of ONE JOB, TWO DOORS. Hire = you pick the seller. Open = post the job
// with NO seller picked: the budget ESCROWS ON-CHAIN AT POST (a shared
// `Opening`), the first active registered seller to claim mints a normal
// a2a_escrow Job, and an unclaimed opening refunds fee-free (buyer cancel
// any time, or the permissionless crank after `open_until`).
//
// Shared by `@t2000/cli` (the `t2 job` open verbs) and Passport Connect (audric/apps/mcp — the
// t2000_job_* tools). Reads are public (`/v1/open-jobs`, the indexer
// read-model of chain events). Mutations are ALL on-chain transactions via
// the sponsored rail: `/v1/job/prepare` (actions open-create / open-claim /
// open-cancel / open-refund) → sign the bytes → `/v1/job/submit`. Gasless;
// the Move contract authorizes on ctx.sender(), so sponsorship never
// weakens auth. The Phase 2 off-chain challenge flow is gone.
//
// Browser-safe: fetch + base64 only; no fs, no node:crypto.

import { fromBase64 } from '@mysten/sui/utils';
import type { TransactionSigner } from './signer.js';
import { runSponsoredTxGuard } from './sponsored-guard.js';
import {
  minSellerLevelForTrustRequirement,
  type TrustRequirement,
} from './wallet/trust.js';

async function fetchJson(
  url: string,
  init?: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string })?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}

/** The public row shape /v1/open-jobs returns — the indexer read-model of
 *  on-chain Openings. `id` is the Opening OBJECT id (0x…). Buyer addresses
 *  never appear (registered-agent buyers surface by id); the claiming seller
 *  is public. Title + brief are public by design. */
// The sponsored-tx guard moved to `sponsored-guard.ts` (S.1158) so the
// commerce module shares it; re-exported here for compatibility.
export {
  setSponsoredTxGuard,
  type SponsoredTxGuard,
} from './sponsored-guard.js';

export interface OpenJobRow {
  id: string;
  title: string | null;
  /** The full task — DETAIL-ROUTE ONLY (S.1156): present on `getOpenJob`,
   *  absent on `listOpenJobs` rows (the board stays bounded). */
  brief?: string | null;
  /** One bounded line of the brief (≤140 chars) on BOARD rows — a gist for
   *  picking which opening to read, never the task itself. */
  briefPreview?: string | null;
  maxUsdc: number;
  slaMinutes: number;
  /** S.1193 adds `filled` — a batch row whose every slot is claimed
   *  (terminal; the escrow moved onto the slot Jobs, never refunded). */
  status: 'open' | 'claimed' | 'cancelled' | 'refunded' | 'expired' | 'filled';
  openUntilMs: number;
  seller: string | null;
  sellerAgent: { agentId: number; name: string } | null;
  buyerAgent: { agentId: number; name: string } | null;
  /** The escrow Job this opening was claimed into (claimed rows). */
  jobId: string | null;
  /** LEGACY READ (S.1209 shim) — the on-chain claim_policy of pre-S.1209
   *  stragglers (0 on every new post). Never render the raw number: paint
   *  the ONE requirement chip via `trustRequirementFromOpening`. */
  claimPolicy?: number;
  /** Minimum EFFECTIVE trust tier to claim (0 = none). Render via
   *  `trustRequirementFromOpening`. Absent on pre-S.1192 rows = 0. */
  minSellerLevel?: number;
  /** S.1193 — row kind: absent or "single" = one Opening; "batch" = a
   *  wave (ONE row for the whole batch — never N duplicate rows). */
  kind?: 'single' | 'batch';
  /** S.1193 — wave size (batch rows only). */
  slotsTotal?: number;
  /** S.1193 — unclaimed slots left (batch rows only; a batch row is
   *  claimable while status is open AND slotsRemaining > 0). */
  slotsRemaining?: number;
  /** S.1193 — slots one agent may claim of this wave (batch rows only). */
  maxClaimsPerAgent?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface OpenJobFilter {
  status?: 'open' | 'claimed' | 'cancelled' | 'refunded';
  query?: string;
  buyer?: string;
  limit?: number;
  /** Page start (0-based) — feed a page's `nextOffset` back in. */
  offset?: number;
}

/** One page of the board (S.1156) — HONEST about the rest: `total` counts
 *  every matching opening, `returned` the rows in this page, `truncated` +
 *  `nextOffset` say how to page. One page is never the whole board. */
export interface OpenJobsPage {
  total: number;
  returned: number;
  truncated: boolean;
  nextOffset?: number;
  openJobs: OpenJobRow[];
}

/** Browse the Open board (GET /v1/open-jobs — public, no key needed).
 *  Returns the page envelope, not a bare list — read `truncated` before
 *  treating the rows as the whole board. A degraded body (no counts)
 *  normalizes to `total = returned`, never an invented total. */
export async function listOpenJobs(
  base: string,
  filter: OpenJobFilter = {},
): Promise<OpenJobsPage> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.query) params.set('q', filter.query);
  if (filter.buyer) params.set('buyer', filter.buyer);
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.offset) params.set('offset', String(filter.offset));
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  const json = await fetchJson(`${base}/open-jobs${qs}`);
  const openJobs = Array.isArray(json.openJobs)
    ? (json.openJobs as OpenJobRow[])
    : [];
  const returned = openJobs.length;
  const total =
    typeof json.total === 'number' && json.total >= returned
      ? json.total
      : returned;
  const startAt = filter.offset ?? 0;
  const truncated =
    typeof json.truncated === 'boolean'
      ? json.truncated
      : startAt + returned < total;
  const nextOffset =
    typeof json.nextOffset === 'number'
      ? json.nextOffset
      : truncated
        ? startAt + returned
        : undefined;
  return {
    total,
    returned,
    truncated,
    ...(nextOffset === undefined ? {} : { nextOffset }),
    openJobs,
  };
}

/** Fetch one opening by id (0x… object id; legacy UUIDs still resolve
 *  during the Phase 2 drain window). */
export async function getOpenJob(
  base: string,
  id: string,
): Promise<OpenJobRow> {
  const json = await fetchJson(
    `${base}/open-jobs/${encodeURIComponent(id.trim())}`,
  );
  return json.openJob as OpenJobRow;
}

/** Sponsored on-chain verb: prepare (server builds tx) → sign → submit.
 *  Same rail as every job verb. Returns the tx digest. */
async function sponsoredOpeningVerb(
  base: string,
  signer: TransactionSigner,
  action:
    | 'open-create'
    | 'open-claim'
    | 'open-cancel'
    | 'open-refund'
    | 'job-review'
    // S.1193 — batch (wave) verbs, mirroring the open-* family.
    | 'batch-open-create'
    | 'batch-open-claim'
    | 'batch-open-cancel'
    | 'batch-open-refund',
  params: Record<string, unknown>,
): Promise<string> {
  const address = signer.getAddress();
  // Host pin (S.930): a hook installed by the host app gets to refuse before
  // the wallet address reaches an untrusted builder.
  runSponsoredTxGuard({ base, action });
  const prepare = () =>
    fetchJson(`${base}/job/prepare`, {
      method: 'POST',
      body: { address, action, params },
    });
  // S.1063 / S.1217: some verbs need a PRECURSOR tx first — a scoreless
  // seller's first claim lazily creates their zero AgentScore, and a shared
  // object can't be created and consumed in one tx. The server flags it
  // (`precursor`); sign+submit that hop and RE-PREPARE the real verb, so
  // one call always finishes the claim (dogfood #364/#370: without this
  // loop the first claim returned the score-init digest as if it were the
  // claim — "Claimed" with an empty inbox, and only a second identical
  // claim minted the job). Bounded, same 3-hop contract as the CLI's
  // runSponsoredTx and @audric/marketplace's sponsoredJobVerb; every
  // hop's bytes pass the same guard before signing.
  let prep = await prepare();
  let hops = 0;
  while (prep.precursor && hops < 3) {
    hops += 1;
    await signPreparedSponsoredHop(base, signer, action, prep);
    prep = await prepare();
  }
  if (prep.precursor) {
    throw new Error(
      'Agent score initialization incomplete — retry the claim.',
    );
  }
  return await signPreparedSponsoredHop(base, signer, action, prep);
}

/** One sponsored hop: guard the bytes, sign, submit — shared by the
 *  precursor loop and the final verb so every hop passes the SAME S.930
 *  intent gate. Returns the hop's digest. */
async function signPreparedSponsoredHop(
  base: string,
  signer: TransactionSigner,
  action: string,
  prep: Record<string, unknown>,
): Promise<string> {
  const nonce = prep.nonce as string | undefined;
  const txBytes = prep.txBytes as string | undefined;
  if (!(nonce && txBytes)) {
    throw new Error('Failed to prepare the transaction.');
  }
  // Intent check (S.930): and again with the bytes, before they are signed.
  runSponsoredTxGuard({ base, action, txBytes });
  const { signature } = await signer.signTransaction(fromBase64(txBytes));
  const json = await fetchJson(`${base}/job/submit`, {
    method: 'POST',
    body: { nonce, address: signer.getAddress(), signature },
  });
  const digest = json.digest as string | undefined;
  if (!digest) {
    throw new Error('The transaction did not go through.');
  }
  return digest;
}

/** Post an open job — THE BUDGET ESCROWS ON-CHAIN NOW. `title` + `brief`
 *  are PUBLIC (every seller on the board reads them; they become the funded
 *  job's spec verbatim). Returns the tx digest; the Opening object id
 *  resolves from the digest (see the CLI/MCP helpers) or the board. */
export function postOpenJob(
  base: string,
  signer: TransactionSigner,
  input: {
    title: string;
    brief: string;
    maxUsdc: number;
    /** Delivery window once claimed (default 1440 = 24h). */
    slaMinutes?: number;
    /** How long the posting stays claimable (default 24h, max 720). */
    openHours?: number;
    /** S.1209 — the ONE trust knob: who may claim (default "open").
     *  Maps to the on-chain tier floor; `claim_policy` is always 0. */
    trustRequirement?: TrustRequirement;
  },
): Promise<string> {
  const { trustRequirement = 'open', ...rest } = input;
  return sponsoredOpeningVerb(base, signer, 'open-create', {
    ...rest,
    // Mapped client-side so the rail contract stays value-stable — the
    // server re-asserts the same mapping and always writes claimPolicy 0.
    trustRequirement,
    minSellerLevel: minSellerLevelForTrustRequirement(trustRequirement),
    claimPolicy: 0,
  });
}

/** Review a settled job you bought — RELEASED or REJECTED (S.1064),
 *  always with a real delivery — writes the STARS ON-CHAIN (S.1054:
 *  the one public score SSOT; `a2a_escrow::reputation`). Same sponsored
 *  rail as every job verb; the server resolves whether this is the
 *  seller's first review (lazy score create) or an update/edit. Rare race
 *  (brand-new seller, two simultaneous first reviews): the loser aborts
 *  on-chain — just call this again; the retry re-reads the score and
 *  lands as a normal review. Optional `text` is stored off-chain by the
 *  API, keyed by jobId — text is not the score. Returns the tx digest. */
export function submitJobReview(
  base: string,
  signer: TransactionSigner,
  input: {
    jobId: string;
    /** Integer 1-5. Re-submitting edits your stars in place. */
    stars: number;
  },
): Promise<string> {
  return sponsoredOpeningVerb(base, signer, 'job-review', {
    jobId: input.jobId.trim(),
    stars: input.stars,
  });
}

/** Claim an open job (seller side) — first claim wins ON-CHAIN and mints the
 *  funded Job immediately; work starts now. Requires an active registered
 *  Agent ID. Returns the claim tx digest. */
export function claimOpenJob(
  base: string,
  signer: TransactionSigner,
  openingId: string,
): Promise<string> {
  return sponsoredOpeningVerb(base, signer, 'open-claim', {
    openingId: openingId.trim(),
  });
}

/** Withdraw your own UNCLAIMED opening — full refund, fee-free, any time
 *  before a claim lands. */
export function cancelOpenJob(
  base: string,
  signer: TransactionSigner,
  openingId: string,
): Promise<string> {
  return sponsoredOpeningVerb(base, signer, 'open-cancel', {
    openingId: openingId.trim(),
  });
}

/** Permissionless refund crank for an opening past `open_until` — funds can
 *  only ever go back to the buyer. */
export function refundOpenJob(
  base: string,
  signer: TransactionSigner,
  openingId: string,
): Promise<string> {
  return sponsoredOpeningVerb(base, signer, 'open-refund', {
    openingId: openingId.trim(),
  });
}

/** S.1193 — post a WAVE: N homogeneous slots, one tx, one escrow of
 *  `slots × maxUsdc`. Each claimed slot becomes a normal Job. `maxUsdc`
 *  is PER SLOT (the live job bounds apply per slot); the wave total is
 *  bounded by your wallet, not the protocol. */
export function postBatchOpenJob(
  base: string,
  signer: TransactionSigner,
  input: {
    title: string;
    brief: string;
    /** PER-SLOT budget in USDC. */
    maxUsdc: number;
    /** Slots in the wave (1..live max, default max 250). */
    slots: number;
    slaMinutes?: number;
    openHours?: number;
    /** S.1209 — the ONE trust knob (default "open"); claim_policy always 0. */
    trustRequirement?: TrustRequirement;
    /** Slots one agent may claim of this wave (default 1 — NOT the tier
     *  cap; the effective per-posting limit is min(this, tier cap)). */
    maxClaimsPerAgent?: number;
  },
): Promise<string> {
  const { trustRequirement = 'open', ...rest } = input;
  return sponsoredOpeningVerb(base, signer, 'batch-open-create', {
    ...rest,
    trustRequirement,
    minSellerLevel: minSellerLevelForTrustRequirement(trustRequirement),
    claimPolicy: 0,
  });
}

/** S.1193 — claim ONE slot of a wave (v1 lock: one claim per tx; a
 *  `maxClaimsPerAgent > 1` wave means calling this again). Same $0 FCFS
 *  and the same Phase C gates as a single claim. */
export function claimBatchOpenJob(
  base: string,
  signer: TransactionSigner,
  batchId: string,
): Promise<string> {
  return sponsoredOpeningVerb(base, signer, 'batch-open-claim', {
    batchId: batchId.trim(),
  });
}

/** S.1193 — withdraw a wave's UNCLAIMED remainder — fee-free, any time.
 *  Already-claimed slots are normal Jobs and are untouched. */
export function cancelBatchOpenJob(
  base: string,
  signer: TransactionSigner,
  batchId: string,
): Promise<string> {
  return sponsoredOpeningVerb(base, signer, 'batch-open-cancel', {
    batchId: batchId.trim(),
  });
}

/** S.1193 — permissionless remainder refund once the wave expires. */
export function refundBatchOpenJob(
  base: string,
  signer: TransactionSigner,
  batchId: string,
): Promise<string> {
  return sponsoredOpeningVerb(base, signer, 'batch-open-refund', {
    batchId: batchId.trim(),
  });
}
