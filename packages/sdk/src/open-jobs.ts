// Open jobs API client (SPEC_T2_AGENTS_OPEN_ONCHAIN, Phase 3) — the second
// door of ONE JOB, TWO DOORS. Hire = you pick the ASP. Open = post the job
// with NO ASP picked: the budget ESCROWS ON-CHAIN AT POST (a shared
// `Opening`), the first active registered ASP to claim mints a normal
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
 *  never appear (registered-agent buyers surface by id); the claiming ASP
 *  is public. Title + brief are public by design. */
/** A host-installed veto on sponsored open-board transactions (S.930).
 *
 *  Called twice per verb: once with no `txBytes` before the prepare request
 *  (so an untrusted API host can be refused before it learns the address),
 *  and once with the prepared bytes before they are signed. Throwing from
 *  either aborts the verb.
 *
 *  The SDK deliberately ships NO default policy: package-id verification
 *  needs non-env literals and a notion of "the canonical host", both of which
 *  belong to the host application. Unset = today's behavior. */
export type SponsoredTxGuard = (ctx: {
  base: string;
  action: string;
  txBytes?: string;
}) => void;

let sponsoredTxGuard: SponsoredTxGuard | null = null;

/** Install (or clear, with `null`) the sponsored-tx guard. */
export function setSponsoredTxGuard(guard: SponsoredTxGuard | null): void {
  sponsoredTxGuard = guard;
}

export interface OpenJobRow {
  id: string;
  title: string | null;
  brief: string | null;
  maxUsdc: number;
  slaMinutes: number;
  status: 'open' | 'claimed' | 'cancelled' | 'refunded' | 'expired';
  openUntilMs: number;
  seller: string | null;
  sellerAgent: { agentId: number; name: string } | null;
  buyerAgent: { agentId: number; name: string } | null;
  /** The escrow Job this opening was claimed into (claimed rows). */
  jobId: string | null;
  /** S.1054 — who may race to claim: 0 Anyone, 1 Proven, 2 Proven · 4★+
   *  (render with `claimPolicyLabel`, never the raw number). Absent on
   *  pre-S.1054 rows = 0. */
  claimPolicy?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface OpenJobFilter {
  status?: 'open' | 'claimed' | 'cancelled' | 'refunded';
  query?: string;
  buyer?: string;
  limit?: number;
}

/** Browse the Open board (GET /v1/open-jobs — public, no key needed). */
export async function listOpenJobs(
  base: string,
  filter: OpenJobFilter = {},
): Promise<OpenJobRow[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.query) params.set('q', filter.query);
  if (filter.buyer) params.set('buyer', filter.buyer);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  const json = await fetchJson(`${base}/open-jobs${qs}`);
  return (json.openJobs ?? []) as OpenJobRow[];
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
  action: 'open-create' | 'open-claim' | 'open-cancel' | 'open-refund' | 'job-review',
  params: Record<string, unknown>,
): Promise<string> {
  const address = signer.getAddress();
  // Host pin (S.930): a hook installed by the host app gets to refuse before
  // the wallet address reaches an untrusted builder.
  sponsoredTxGuard?.({ base, action });
  const prep = await fetchJson(`${base}/job/prepare`, {
    method: 'POST',
    body: { address, action, params },
  });
  const nonce = prep.nonce as string | undefined;
  const txBytes = prep.txBytes as string | undefined;
  if (!(nonce && txBytes)) {
    throw new Error('Failed to prepare the transaction.');
  }
  // Intent check (S.930): and again with the bytes, before they are signed.
  sponsoredTxGuard?.({ base, action, txBytes });
  const { signature } = await signer.signTransaction(fromBase64(txBytes));
  const json = await fetchJson(`${base}/job/submit`, {
    method: 'POST',
    body: { nonce, address, signature },
  });
  const digest = json.digest as string | undefined;
  if (!digest) {
    throw new Error('The transaction did not go through.');
  }
  return digest;
}

/** Post an open job — THE BUDGET ESCROWS ON-CHAIN NOW. `title` + `brief`
 *  are PUBLIC (every ASP on the board reads them; they become the funded
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
    /** S.1054 — 0 Anyone (default), 1 Proven, 2 Proven · 4★+. */
    claimPolicy?: number;
  },
): Promise<string> {
  return sponsoredOpeningVerb(base, signer, 'open-create', input);
}

/** Review a RELEASED job you bought — writes the STARS ON-CHAIN (S.1054:
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

/** Claim an open job (ASP side) — first claim wins ON-CHAIN and mints the
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
