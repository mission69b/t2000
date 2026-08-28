// `t2 job` — A2A escrow jobs (SPEC_A2A_ESCROW, t2 Agents Phase 3).
//
// A job is ONE shared Move object (`a2a_escrow::escrow::Job<USDC>`) holding
// the funds itself — no treasury, no platform custody. The verbs:
//
//   create   buyer locks USDC + terms in one PTB          (buyer)
//   verify   check a job pays YOU before starting work    (seller)
//   deliver  post the delivery hash before the deadline   (seller)
//   watch    poll state + what YOU can do right now       (either)
//   release  accept delivery → funds to seller            (buyer, or anyone
//                                                          after the review
//                                                          window lapses)
//   reject   within the review window → split per terms   (buyer)
//   refund   no delivery by deadline → funds to buyer     (anyone)
//   review   rate a settled job (RELEASED/REJECTED) 1–5★  (buyer OR seller)
//
// Writes go through the sponsored rail (api.t2000.ai builds + co-pays gas;
// this wallet signs — auth is `sender == buyer/seller` in Move, so
// sponsorship never weakens it). Reads are direct RPC.

import { createHash } from 'node:crypto';
import {
  assertSpendAllowed,
  recordSpendIfLanded,
} from '../lib/spend-gate.js';
import {
  formatUsdMicro,
  sellerReceivesLine,
  settlementSplit,
} from '../lib/settle-fee.js';
import { expandAgentRefs, resolveAgentRef } from '../lib/agent-ref.js';
import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  getJob,
  getSuiClient,
  jobActionsFor,
  submitJobReview,
  truncateAddress,
  validateAddress,
  verifyJobForSeller,
  MAX_JOB_USDC,
  preflightCreateJob,
  customHireEnvelope,
  isCustomHireEnvelope,
  type Job,
} from '@t2000/sdk';
import { runSponsoredTx } from '../lib/agent-register.js';
import { registerBatchVerbs } from './batch.js';
import { registerOpenVerbs } from './open.js';
import {
  assertBuyerRequirements,
  fetchJson,
  fetchService,
  getJobSpec,
  putJobSpec,
} from '../lib/services.js';
import { withAgent } from '../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printError,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
  printWarning,
} from '../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';
const DEFAULT_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Buyer's share on reject, in bps — 80/20 favors the buyer, matching the
 *  "escrow protects the buyer first" default. Override with --split. */
const DEFAULT_REJECT_SPLIT_BPS = 8000;

/** Parse "30m" / "24h" / "7d" (or bare minutes) into ms. */
export function parseDuration(input: string): number {
  const m = /^(\d+(?:\.\d+)?)([mhd]?)$/.exec(input.trim());
  if (!m) {
    throw new Error(`Invalid duration "${input}". Use e.g. 30m, 24h, 7d.`);
  }
  const n = Number(m[1]);
  const unit = m[2] || 'm';
  const ms = unit === 'd' ? n * 86_400_000 : unit === 'h' ? n * 3_600_000 : n * 60_000;
  if (ms <= 0) throw new Error(`Duration must be positive (got "${input}").`);
  return Math.round(ms);
}

const SHA256_HEX_RE = /^0x[0-9a-fA-F]{64}$/;
/** The spec store's server-side cap — mirrored here so oversize content
 *  fails with guidance BEFORE any network call. */
const SPEC_STORE_MAX_BYTES = 16 * 1024;

// Spec/delivery commitment (SPEC_ACP_JOB_SPEC_V1 §4.2): bodies UPLOAD by
// default so the counterparty can actually read them; a bare `0x…` sha256
// is the hash-only spec path (nothing leaves your machine).

/** Read + guard the spec/delivery input WITHOUT uploading: a bare `0x…`
 *  sha256 passes through as the hash-only commitment; anything else resolves
 *  (file path, else literal text) to UTF-8 text under the store's 16 KiB
 *  cap. Shared by hire (which wraps text in the custom envelope, S.978)
 *  and deliver (which uploads raw — proofs are never wrapped). */
export async function loadSpecText(
  input: string,
): Promise<{ kind: 'hash'; hash: string } | { kind: 'text'; text: string }> {
  const trimmed = input.trim();
  if (SHA256_HEX_RE.test(trimmed)) {
    return { kind: 'hash', hash: trimmed.toLowerCase() };
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(input);
  } catch {
    bytes = Buffer.from(input, 'utf8');
  }
  if (bytes.length > SPEC_STORE_MAX_BYTES) {
    throw new Error(
      `Content is ${bytes.length} bytes — the job-spec store caps at 16 KiB. ` +
        'Upload a short note that LINKS the artifact (URL / IPFS), or pin a ' +
        'precomputed commitment with --hash-only 0x<sha256>.',
    );
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      'Content is not UTF-8 text — the job-spec store holds text only. ' +
        'Upload a short note that LINKS the artifact, or pin a precomputed ' +
        'commitment with --hash-only 0x<sha256>.',
    );
  }
  return { kind: 'text', text };
}

/** Put→GET→byte-equal durability gate (S.1020a — parity with Connect
 *  S.991): a put is NOT durable until the same public read path serves the
 *  same bytes. ~16%% of dogfood delivers had the hash pinned on-chain while
 *  the body never loaded for the buyer. On any miss NOTHING reaches a chain
 *  verb — the store can be retried; an on-chain pin cannot. */
/** The signed-mutation POST to /job/review (challenge nonce +
 *  personal-message signature over sha256 of the payload — same
 *  construction as `t2 service`). After S.1054 this path carries review
 *  TEXT and seller→buyer ratings; buyer STARS are on-chain. */
async function postSignedReview(
  base: string,
  agent: Awaited<ReturnType<typeof withAgent>>,
  address: string,
  payload: { jobId: string; stars: number; text: string | null },
): Promise<Record<string, unknown>> {
  const challenge = await fetchJson(`${base}/agent/challenge`, {
    method: 'POST',
    body: { address },
  });
  const nonce = challenge.nonce as string | undefined;
  if (!nonce) throw new Error('Failed to get a challenge nonce.');
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
  const message = new TextEncoder().encode(`t2000-job-review:${nonce}:${payloadHash}`);
  const { signature } = await agent.keypair.signPersonalMessage(message);
  return fetchJson(`${base}/job/review`, {
    method: 'POST',
    body: { address, nonce, signature, payload },
  });
}

async function putAndVerifySpec(base: string, content: string): Promise<string> {
  const hash = await putJobSpec(base, content);
  let roundTrip: string;
  try {
    roundTrip = await getJobSpec(base, hash);
  } catch (e) {
    throw new Error(
      `The content store accepted the upload but could not serve it back (${
        e instanceof Error ? e.message : 'read failed'
      }) — nothing was pinned on-chain. Retry in a moment.`,
    );
  }
  if (roundTrip !== content) {
    throw new Error(
      'The content store returned different bytes than were uploaded — nothing was pinned on-chain. Retry in a moment.',
    );
  }
  return hash;
}

export async function resolveSpecUpload(
  base: string,
  input: string,
): Promise<{ hash: string; uploaded: boolean }> {
  const loaded = await loadSpecText(input);
  if (loaded.kind === 'hash') {
    return { hash: loaded.hash, uploaded: false };
  }
  return { hash: `0x${await putAndVerifySpec(base, loaded.text)}`, uploaded: true };
}

/** Direct-hire spec upload (S.978): text briefs wrap in the SDK's
 *  `t2-acp-custom@1` envelope — the same write shape as console + Connect —
 *  so manage / the public page / the feed title the job without derive
 *  fallbacks. Idempotent (an input that already IS the envelope uploads
 *  as-is); a bare 0x… sha stays the hash-only path, never wrapped. */
export async function resolveHireSpecUpload(
  base: string,
  input: string,
  title: string | undefined,
): Promise<{ hash: string; uploaded: boolean }> {
  const loaded = await loadSpecText(input);
  if (loaded.kind === 'hash') {
    return { hash: loaded.hash, uploaded: false };
  }
  const body = isCustomHireEnvelope(loaded.text)
    ? loaded.text
    : customHireEnvelope(loaded.text, title, Date.now());
  if (Buffer.byteLength(body, 'utf8') > SPEC_STORE_MAX_BYTES) {
    throw new Error(
      'The brief plus its envelope exceeds the 16 KiB job-spec store cap — ' +
        'shorten the brief, or link the long artifact (URL / IPFS).',
    );
  }
  return { hash: `0x${await putAndVerifySpec(base, body)}`, uploaded: true };
}

function stateColor(state: Job['state']): string {
  if (state === 'released') return pc.green(state);
  if (state === 'refunded' || state === 'rejected') return pc.yellow(state);
  return pc.cyan(state);
}

function printJob(job: Job, me?: string) {
  printKeyValue('Job', job.id);
  printKeyValue('State', stateColor(job.state));
  printKeyValue('Buyer', truncateAddress(job.buyer) + (me === job.buyer ? pc.dim(' (you)') : ''));
  printKeyValue('Seller', truncateAddress(job.seller) + (me === job.seller ? pc.dim(' (you)') : ''));
  printKeyValue('Amount', `$${job.amountUsdc.toFixed(2)} USDC`);
  printKeyValue('Deliver by', new Date(job.deliverByMs).toISOString());
  if (job.deliveredAtMs) {
    printKeyValue('Delivered', new Date(job.deliveredAtMs).toISOString());
    printKeyValue(
      'Review closes',
      new Date(job.deliveredAtMs + job.reviewWindowMs).toISOString(),
    );
  }
  if (job.deliveryHash) printKeyValue('Delivery hash', job.deliveryHash);
  printKeyValue('Reject split', `${job.rejectSplitBps / 100}% buyer / ${(10_000 - job.rejectSplitBps) / 100}% seller`);
}

/** One row from GET /v1/jobs — the indexed read-model of on-chain Jobs. */
export interface IndexedJob {
  jobId: string;
  buyer: string;
  seller: string;
  amountUsdc: number;
  state: 'funded' | 'delivered' | 'released' | 'rejected' | 'refunded';
  deliverByMs: number;
  reviewWindowMs: number;
  deliveryHash: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  /** On-chain delivered_at_ms if the indexer ever surfaces it — preferred
   *  review-clock anchor when present (forward-compat, S.1003). */
  deliveredAtMs?: number | null;
}

/** The BUYER seat of the same read-model (S.1016) — recovers the escrow
 *  name when the hire line's one-time jobId print is lost. */
export async function fetchBuyerJobs(base: string, buyer: string): Promise<IndexedJob[]> {
  const json = await fetchJson(`${base}/jobs?buyer=${encodeURIComponent(buyer)}&limit=100`);
  return (json.jobs ?? []) as IndexedJob[];
}

export async function fetchSellerJobs(base: string, seller: string): Promise<IndexedJob[]> {
  const json = await fetchJson(`${base}/jobs?seller=${encodeURIComponent(seller)}&limit=100`);
  return (json.jobs ?? []) as IndexedJob[];
}

const TERMINAL_STATES = new Set(['released', 'rejected', 'refunded']);

// ── Seller inbox buckets (S.1003, beta #93 B–D) ─────────────────────────────
// "Open" is not a seller-actionable signal: a delivered job counts as open
// while the seller can do nothing but wait, and a lapsed review window means
// money idles unless someone runs release. Bucket by what the SELLER can do.

export type SellerInboxBucket = 'needsYou' | 'fundedLate' | 'awaitingBuyer' | 'releasable' | 'terminal';

/** When the buyer's review window closes. MCP parity: anchor on
 *  deliveredAtMs when the row carries it, else updatedAtMs (the delivered
 *  transition IS the last update). Null when no honest clock exists. */
export function reviewClosesMs(job: Pick<IndexedJob, 'deliveredAtMs' | 'updatedAtMs' | 'reviewWindowMs'>): number | null {
  const anchor = job.deliveredAtMs ?? job.updatedAtMs;
  if (!(typeof anchor === 'number' && anchor > 0 && typeof job.reviewWindowMs === 'number' && job.reviewWindowMs > 0)) {
    return null;
  }
  return anchor + job.reviewWindowMs;
}

export function bucketSellerJob(job: IndexedJob, nowMs: number): SellerInboxBucket {
  if (TERMINAL_STATES.has(job.state)) {
    return 'terminal';
  }
  if (job.state === 'funded') {
    // The chain rejects late delivers (EPastDeadline) — funded-past-deadline
    // is NOT workable; the refund path is open to anyone.
    return nowMs <= job.deliverByMs ? 'needsYou' : 'fundedLate';
  }
  // delivered: releasable only with a real lapsed clock — never claim
  // "releasable" on missing window fields (conservative: awaitingBuyer).
  const closes = reviewClosesMs(job);
  return closes !== null && nowMs > closes ? 'releasable' : 'awaitingBuyer';
}

export interface SellerInboxSummary {
  counts: {
    total: number;
    needsYou: number;
    fundedLate: number;
    awaitingBuyer: number;
    releasable: number;
    terminal: number;
  };
  needsYou: IndexedJob[];
  fundedLate: IndexedJob[];
  awaitingBuyer: IndexedJob[];
  releasable: IndexedJob[];
  terminal: IndexedJob[];
}

export function summarizeSellerInbox(jobs: IndexedJob[], nowMs: number): SellerInboxSummary {
  const buckets: SellerInboxSummary = {
    counts: { total: jobs.length, needsYou: 0, fundedLate: 0, awaitingBuyer: 0, releasable: 0, terminal: 0 },
    needsYou: [],
    fundedLate: [],
    awaitingBuyer: [],
    releasable: [],
    terminal: [],
  };
  for (const job of jobs) {
    const bucket = bucketSellerJob(job, nowMs);
    buckets[bucket].push(job);
    buckets.counts[bucket] += 1;
  }
  return buckets;
}

// ── Chain hydrate (S.1004, founder e2e on 10.30.1) ──────────────────────────
// /v1/jobs is eventually consistent: right after `t2 job deliver`, the single
// -job watch (getJob) said delivered while --mine still painted "need you"
// from the stale index row. Chain is the SSOT for BUCKETS; the API only
// DISCOVERS the job list. Hydrate non-terminal rows before bucketing.

/** Hydration cap per refresh: real inboxes fit; a huge seller history may
 *  leave deeper non-terminal rows index-only for one poll (documented
 *  trade — one RPC read per open job per refresh). */
const HYDRATE_MAX = 25;
/** Parallel getJob reads per batch — polite to public RPC. */
const HYDRATE_CONCURRENCY = 8;

/** Merge an on-chain Job over its indexed row — chain wins wherever it
 *  speaks; pure. deliveredAtMs is the critical carry: reviewClosesMs then
 *  anchors on true delivery time instead of a stale updatedAtMs. */
export function mergeIndexedJobFromChain(row: IndexedJob, chain: Job): IndexedJob {
  return {
    ...row,
    jobId: chain.id ?? row.jobId,
    state: chain.state,
    buyer: chain.buyer ?? row.buyer,
    seller: chain.seller ?? row.seller,
    amountUsdc: chain.amountUsdc ?? row.amountUsdc,
    deliverByMs: chain.deliverByMs ?? row.deliverByMs,
    reviewWindowMs: chain.reviewWindowMs ?? row.reviewWindowMs,
    deliveryHash: chain.deliveryHash ?? row.deliveryHash,
    deliveredAtMs: chain.deliveredAtMs ?? row.deliveredAtMs ?? null,
    createdAtMs: chain.createdAtMs ?? row.createdAtMs,
    // Review clock prefers deliveredAtMs (reviewClosesMs anchors there when
    // set); for delivered rows keep updatedAtMs honest with the chain clock,
    // otherwise the index value stands — never invent a clock.
    updatedAtMs:
      chain.state === 'delivered' && chain.deliveredAtMs != null ? chain.deliveredAtMs : row.updatedAtMs,
  };
}

/** Hydrate non-terminal rows via getJob — SEAT-NEUTRAL (rows are rows;
 *  S.1016 reuses it for the buyer inbox). Terminal rows skip RPC (their
 *  actionability can't change); a failed read keeps the index row as-is —
 *  one flaky object must never abort the whole inbox. Order stable. */
export async function hydrateJobsFromChain(
  rows: IndexedJob[],
  getJobById: (jobId: string) => Promise<Job>,
  opts?: { maxHydrate?: number },
): Promise<IndexedJob[]> {
  const max = opts?.maxHydrate ?? HYDRATE_MAX;
  const out = [...rows];
  const targets: number[] = [];
  for (let i = 0; i < out.length && targets.length < max; i++) {
    if (!TERMINAL_STATES.has(out[i].state)) targets.push(i);
  }
  for (let at = 0; at < targets.length; at += HYDRATE_CONCURRENCY) {
    await Promise.all(
      targets.slice(at, at + HYDRATE_CONCURRENCY).map(async (i) => {
        try {
          out[i] = mergeIndexedJobFromChain(out[i], await getJobById(out[i].jobId));
        } catch {
          // keep the index row — fail soft
        }
      }),
    );
  }
  return out;
}

/** S.1004 name kept as an alias — tests + external callers keep working. */
export const hydrateSellerJobsFromChain = hydrateJobsFromChain;

// ── Buyer inbox buckets (S.1016, beta #93 round five) ───────────────────────
// The mirror of the seller buckets, aligned with Connect's buyer seat:
// delivered = the buyer's move (settle or reject); funded past deadline =
// refundable; funded in window = waiting on the seller. Full jobId on every
// actionable row — recovering the escrow name IS the point. S.1015 stands:
// a funded undelivered row never hints bare release.

export type BuyerInboxBucket = 'needsYou' | 'refundable' | 'waiting' | 'terminal';

export function bucketBuyerJob(job: IndexedJob, nowMs: number): BuyerInboxBucket {
  if (TERMINAL_STATES.has(job.state)) {
    return 'terminal';
  }
  if (job.state === 'delivered') {
    return 'needsYou';
  }
  return nowMs > job.deliverByMs ? 'refundable' : 'waiting';
}

export interface BuyerInboxSummary {
  counts: {
    total: number;
    needsYou: number;
    refundable: number;
    waiting: number;
    terminal: number;
  };
  needsYou: IndexedJob[];
  refundable: IndexedJob[];
  waiting: IndexedJob[];
  terminal: IndexedJob[];
}

export function summarizeBuyerInbox(jobs: IndexedJob[], nowMs: number): BuyerInboxSummary {
  const buckets: BuyerInboxSummary = {
    counts: { total: jobs.length, needsYou: 0, refundable: 0, waiting: 0, terminal: 0 },
    needsYou: [],
    refundable: [],
    waiting: [],
    terminal: [],
  };
  for (const job of jobs) {
    const bucket = bucketBuyerJob(job, nowMs);
    buckets[bucket].push(job);
    buckets.counts[bucket] += 1;
  }
  return buckets;
}

function buyerInboxHint(job: IndexedJob, bucket: BuyerInboxBucket): string {
  switch (bucket) {
    case 'needsYou':
      // Delivered — grading the work is the buyer's verb pair.
      return `delivered — grade it: t2 job release ${job.jobId}  ·  t2 job reject ${job.jobId}`;
    case 'refundable':
      return `deadline passed, no delivery — t2 job refund ${job.jobId} (fee-free, anyone may crank it)`;
    case 'waiting':
      return `waiting on the seller — t2 job watch ${job.jobId}`;
    default:
      return '';
  }
}

function inboxHint(job: IndexedJob, bucket: SellerInboxBucket): string {
  switch (bucket) {
    case 'needsYou':
      // Full object ids in suggested commands — truncated mid-hex is not pasteable.
      return `t2 job spec ${job.jobId} → do the work → t2 job deliver ${job.jobId} <file>`;
    case 'releasable':
      return `releasable now — t2 job release ${job.jobId}`;
    case 'awaitingBuyer': {
      const closes = reviewClosesMs(job);
      return closes !== null
        ? `waiting on the buyer's review — release becomes permissionless after ${new Date(closes).toISOString()}`
        : `waiting on the buyer's review — anyone can \`t2 job release\` once it lapses`;
    }
    case 'fundedLate':
      return `deliver deadline passed — the chain rejects late delivers; the buyer (or anyone) may t2 job refund ${job.jobId}`;
    default:
      return '';
  }
}

function printInboxRow(job: IndexedJob, bucket: SellerInboxBucket) {
  printInboxRowWithHint(job, inboxHint(job, bucket), 'from', job.buyer);
}

function printBuyerInboxRow(job: IndexedJob, bucket: BuyerInboxBucket) {
  printInboxRowWithHint(job, buyerInboxHint(job, bucket), 'seller', job.seller);
}

function printInboxRowWithHint(job: IndexedJob, hint: string, partyLabel: string, party: string) {
  const deadline = job.state === 'funded' ? ` · deliver by ${new Date(job.deliverByMs).toISOString()}` : '';
  printLine(
    `  ${stateColor(job.state as Job['state'])}  $${job.amountUsdc.toFixed(2)} USDC · ${partyLabel} ${truncateAddress(party)}${deadline}`,
  );
  printLine(`  ${pc.dim(job.jobId)}`);
  if (hint) printLine(`  ${pc.dim('→')} ${hint}`);
}

/** Deliver preflight (S.1003): the FIRST deliver pins the hash forever — a
 *  second deliver, a terminal job, or a lapsed deadline all abort on-chain
 *  (EWrongState / EPastDeadline). Say so in words BEFORE uploading a body or
 *  signing. Returns the human error, or null when deliver can proceed. */
export function deliverPreflightError(state: Job['state'], deliverByMs: number, nowMs: number): string | null {
  if (state === 'delivered') {
    return (
      'This job is already delivered. The delivery hash is permanent and cannot be replaced — ' +
      'wait for the buyer\'s review, or once the window closes anyone may run `t2 job release <jobId>`. ' +
      'Fixes travel via buyer reject (inside the window) or out-of-band, never a second deliver.'
    );
  }
  if (state === 'released' || state === 'rejected' || state === 'refunded') {
    return `This job is ${state} — nothing can be delivered.`;
  }
  if (state === 'funded' && nowMs > deliverByMs) {
    return (
      `The deliver deadline (${new Date(deliverByMs).toISOString()}) has passed — the chain rejects late ` +
      'delivers, so nothing was uploaded or signed. The refund path is open: anyone may run `t2 job refund <jobId>`.'
    );
  }
  return null;
}

async function sponsoredJobVerb(opts: {
  base: string;
  keyPath?: string;
  action: 'create' | 'decline' | 'deliver' | 'release' | 'reject' | 'refund';
  params: Record<string, unknown>;
  /** USDC leaving THIS wallet, for the spending gate. Only `create` moves
   *  buyer money out; the seller-side verbs settle escrow that is already
   *  locked, so they pass nothing and are never counted. */
  spendUsdc?: number;
  seller?: string;
  force?: boolean;
}): Promise<{ address: string; digest?: string }> {
  const agent = await withAgent({ keyPath: opts.keyPath });
  const address = agent.address();

  // Assert BEFORE the money leaves (S.930 C). The job path went through the
  // sponsored rail rather than the SDK write path, so it inherited neither
  // half of the gate: a $25 cap did not stop a hire, and a completed hire
  // left "spent today" reading $0.00.
  if (opts.spendUsdc !== undefined) {
    assertSpendAllowed(opts.spendUsdc, opts.force);
  }

  const { digest } = await runSponsoredTx({
    keypair: agent.keypair,
    actor: address,
    prepareUrl: `${opts.base}/job/prepare`,
    prepareBody: { address, action: opts.action, params: opts.params },
    submitUrl: `${opts.base}/job/submit`,
    intent: {
      action: opts.action,
      amountUsdc: opts.spendUsdc,
      seller: opts.seller,
    },
  });

  recordSpendIfLanded(opts.spendUsdc ?? 0, digest);
  return { address, digest };
}

export function registerJob(program: Command) {
  const group = program
    .command('job')
    .description(
      'A2A escrow jobs — USDC locked in a shared Move object, released on delivery (no platform custody)',
    )
    .addHelpText(
      'after',
      `
The escrow is a Sui object, not a company: funds lock inside the Job object at
create; release/refund are pure functions of (state, clock, caller). A ghosting
buyer can't strand a delivering seller (anyone may release after the review
window), and a no-show seller cannot keep funds AS LONG AS the buyer uses the
escrow's protections — wait out the deadline and refund (anyone may crank it),
or reject a bad delivery in-window. Releasing early without a delivery
(--pay-without-delivery) voluntarily waives that protection. v1 caps jobs at
${MAX_JOB_USDC} USDC.

Typical flow:
  buyer   $ t2 job hire 5 0xSELLER --spec brief.md --deadline 24h
  seller  $ t2 job verify 0xJOB            # funded + pays you (add --price 5 to also check your listing price)
  seller  $ t2 job deliver 0xJOB report.md
  buyer   $ t2 job release 0xJOB          (or: t2 job reject 0xJOB)
  either  $ t2 job watch 0xJOB
  seller  $ t2 job watch --mine           (the provider inbox — all your sells)
  buyer   $ t2 job watch --buying         (the buyer inbox — every job you funded)

Hiring a LISTING (t2 ACP) — price + terms come from the listing:
  buyer   $ t2 services "market report"
  buyer   $ t2 job hire --agent 0xSELLER --service sui-market-report \\
              --requirements '{"token":"DEEP"}'
  seller  $ t2 job spec 0xJOB              (read the buyer's requirements)

No seller picked at all? Open the job to the board instead (the budget
escrows on-chain AT POST; the first active seller claim starts the job —
no fund step; unclaimed openings refund fee-free):
  buyer   $ t2 job open --title "Logo sketch" --brief brief.md --max 5
  seller  $ t2 job board · t2 job claim <openingId>

Posting the SAME job many times? batch-open escrows all of them in ONE tx
and puts one "N/M jobs" row on the board. Each claim is a normal Job —
deliver / release / reject / refund with the ordinary verbs. The per-agent
limit counts jobs in flight: a settled job frees the seat, so finishers
can claim the same posting again.
  buyer   $ t2 job batch-open --title "Board check" --brief b.md --max 0.10 --slots 50
  seller  $ t2 job batch-claim <batchId>   (then: deliver → get paid)
  buyer   $ t2 job batch-cancel <batchId>  (refund unclaimed jobs, fee-free)

Ending a job (all states covered):
  buyer   $ t2 job release 0xJOB           Accept — escrow pays the seller
  buyer   $ t2 job reject 0xJOB            Refuse a delivery in-window (split per terms)
  anyone  $ t2 job refund 0xJOB            Deadline passed, nothing delivered → buyer refunded
  seller  $ t2 job decline 0xJOB           Walk away pre-delivery → full fee-free refund
`,
    );

  group
    .command('hire')
    .alias('create')
    .argument('[amount]', `USDC to escrow (max ${MAX_JOB_USDC}; omit when hiring a --service listing)`)
    .argument('[seller]', "The seller's Sui address (omit when hiring a --service listing)")
    .description('Hire — fund an escrow job in one transaction (buyer): a listing (--agent + --service) or your own terms (amount + seller + --spec)')
    .option('--spec <file-or-text>', 'Job spec — a file path or inline text (UPLOADED as the public t2-acp-custom@1 title+brief envelope so the seller and the store can read it; sha256 pinned on-chain), or a bare 0x… sha256 (hash-only: pins without uploading, no envelope — the body stays off-platform)')
    .option('--title <text>', 'Public job title (≤80 chars). Custom/direct hire only; derived from the brief\'s first line if omitted')
    .option(
      '--agent <address|#id|@handle>',
      "Hire a listing: the seller's agent address, #id, or @handle",
    )
    .option('--service <slug>', 'The service slug (see t2 services / t2 service list <agent>)')
    .option('--requirements <file-or-json-or-text>', 'What the seller asked buyers to provide — if the listing lists JSON keys, fill EVERY key (JSON object; extra keys OK)')
    .option('--deadline <duration>', 'Time the seller has to deliver (e.g. 30m, 24h, 7d)', '24h')
    .option('--review <duration>', 'Your accept/reject window after delivery', '24h')
    .option('--split <bps>', 'Your share in bps if you reject (0–10000)', String(DEFAULT_REJECT_SPLIT_BPS))
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (
        amountArg: string | undefined,
        sellerArg: string | undefined,
        opts: {
          spec?: string;
          title?: string;
          agent?: string;
          service?: string;
          requirements?: string;
          deadline: string;
          review: string;
          split: string;
          key?: string;
          api?: string;
        },
      ) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;

          let amountUsdc: number;
          let seller: string;
          let specHash: string;
          let deliverByMs: number;
          let reviewWindowMs: number;
          let rejectSplitBps: number;
          let serviceSlug: string | undefined;

          const serviceSlugOpt = opts.service;
          if (serviceSlugOpt || opts.agent) {
            // Service mode — price + terms come from the listing, the spec
            // is the buyer's requirements (stored content-addressed; its
            // sha256 goes on-chain, so the content is tamper-evident).
            if (!(serviceSlugOpt && opts.agent)) {
              throw new Error('--agent and --service go together.');
            }
            if (amountArg || sellerArg) {
              throw new Error(
                'Omit the amount/seller arguments when buying a service — the listing sets the price and the seller.',
              );
            }
            // Same ingress the site accepts (S.929): `#93` / `93` / `@handle`
            // / `0x…`. Resolved BEFORE the service fetch, so an unknown id
            // fails as a sentence and never reaches a prepare or a signature.
            const sellerAgent = validateAddress(
              (await resolveAgentRef(base, opts.agent)).address,
            );
            const service = await fetchService(base, sellerAgent, serviceSlugOpt);
            serviceSlug = service.slug;

            let requirements: unknown = null;
            if (opts.requirements) {
              let text = opts.requirements;
              try {
                text = await readFile(opts.requirements, 'utf8');
              } catch {
                // not a file — the literal argument is the content
              }
              try {
                requirements = JSON.parse(text);
              } catch {
                requirements = text.trim();
              }
            }
            // Requirement values that NAME an agent become addresses before
            // anything is asserted or hashed — sellers built their tooling
            // around `0x…` and must never decode what "#93" meant on the day
            // the job was funded. Order: resolve, assert, freeze.
            requirements = await expandAgentRefs(base, requirements);
            // The shared hire gate (SPEC_ACP_JOB_SPEC_V1 §4.1) — same
            // implementation as MCP + console hire-prepare, so a job can
            // never fund with an unusable brief.
            assertBuyerRequirements(service.requirements, requirements);

            const buyer = (await withAgent({ keyPath: opts.key })).address();
            const spec = JSON.stringify({
              type: 't2-acp-job-spec@1',
              service: {
                agent: service.agent,
                slug: service.slug,
                name: service.name,
                priceUsdc: service.priceUsdc,
                deliverable: service.deliverable,
              },
              requirements,
              buyer,
              createdAtMs: Date.now(),
            });
            specHash = `0x${await putAndVerifySpec(base, spec)}`;

            amountUsdc = service.priceUsdc;
            seller = service.agent;
            deliverByMs = Date.now() + service.slaMinutes * 60_000;
            reviewWindowMs = service.reviewWindowMinutes * 60_000;
            rejectSplitBps = service.rejectSplitBps;
          } else {
            // Direct mode — explicit terms, spec hashed locally.
            if (!(amountArg && sellerArg)) {
              throw new Error(
                'Provide <amount> <seller> (direct job) or --agent + --service (buy a listing).',
              );
            }
            if (!opts.spec) {
              throw new Error('--spec is required for a direct job.');
            }
            amountUsdc = Number.parseFloat(amountArg);
            if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
              throw new Error(`Amount must be a positive number (got "${amountArg}").`);
            }
            seller = validateAddress(
              (await resolveAgentRef(base, sellerArg)).address,
            );
            // Uploads as the t2-acp-custom@1 envelope (S.978) unless the
            // input is already a 0x… sha256 — the bare hash stays the
            // hash-only path (nothing leaves the machine).
            ({ hash: specHash } = await resolveHireSpecUpload(
              base,
              opts.spec,
              opts.title,
            ));
            deliverByMs = Date.now() + parseDuration(opts.deadline);
            reviewWindowMs = opts.review
              ? parseDuration(opts.review)
              : DEFAULT_REVIEW_WINDOW_MS;
            rejectSplitBps = Number.parseInt(opts.split, 10);
          }
          // Preflight (S.932): terms sanity + the MAX_JOB_USDC cap, which the
          // hire path never enforced client-side even though `open` did — a
          // $999 hire only failed after a signature. Then the balance, then
          // the numbers, and only then anything irreversible.
          const pre = preflightCreateJob({
            seller,
            amountUsdc,
            specHash,
            deliverByMs,
            reviewWindowMs,
            rejectSplitBps,
          });
          if (!pre.valid) {
            throw new Error(pre.error);
          }

          const preAgent = await withAgent({ keyPath: opts.key });
          const bal = await preAgent.balance();
          const usdc = bal.stables.USDC ?? 0;
          if (usdc < amountUsdc) {
            throw new Error(
              `Insufficient USDC — need ${formatUsdMicro(Math.floor(amountUsdc * 1_000_000))}, wallet has ${formatUsdMicro(Math.floor(usdc * 1_000_000))}. Fund it: t2 fund`,
            );
          }

          // Ahead of the summary on purpose: printing "here is what will
          // happen" and then refusing on the daily cap reads as a broken
          // promise. sponsoredJobVerb asserts again (pure read, idempotent).
          assertSpendAllowed(amountUsdc);

          // The buyer sees the price BEFORE signing. On a listing hire the
          // price comes from the seller's listing, not from anything typed on
          // this command line, so printing it is the only way they see it.
          const split = settlementSplit(amountUsdc);
          if (!isJsonMode()) {
            printBlank();
            printInfo('Hire preflight');
            printKeyValue('  Escrow', `${split.escrow} USDC (leaves your wallet on sign)`);
            printKeyValue('  Seller', truncateAddress(seller));
            if (serviceSlug) printKeyValue('  Service', serviceSlug);
            printKeyValue('  Deliver by', new Date(deliverByMs).toISOString());
            printKeyValue('  Settle fee', `${split.fee} from the seller's payout — not added to your escrow`);
          }

          const { address, digest } = await sponsoredJobVerb({
            base,
            keyPath: opts.key,
            action: 'create',
            params: { seller, amountUsdc, specHash, deliverByMs, reviewWindowMs, rejectSplitBps },
            // The buyer's USDC leaves here — the one job verb that spends.
            spendUsdc: amountUsdc,
            seller,
          });

          // The job id comes off the created object — read it back via the
          // digest's object changes is server-side; simplest robust path is
          // the server returning it. Fall back to printing the digest.
          const client = getSuiClient();
          let jobId: string | undefined;
          if (digest) {
            try {
              const result = await client.core.waitForTransaction({
                digest,
                include: { objectTypes: true },
                timeout: 15_000,
              });
              const txn =
                result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
              const types = txn.objectTypes ?? {};
              jobId = Object.keys(types).find((id) => types[id]?.includes('::escrow::Job<'));
            } catch {
              // best-effort — digest still printed below
            }
          }

          if (isJsonMode()) {
            printJson({ jobId, digest, buyer: address, seller, amountUsdc, specHash, deliverByMs, reviewWindowMs, rejectSplitBps, feeBps: split.feeBps, sellerReceiveUsdc: split.payoutMicro / 1_000_000, ...(serviceSlug ? { service: serviceSlug } : {}) });
            return;
          }
          printBlank();
          printSuccess(`Escrowed $${amountUsdc.toFixed(2)} USDC → job for ${truncateAddress(seller)}${serviceSlug ? ` (service: ${serviceSlug})` : ''}`);
          if (jobId) printKeyValue('Job', jobId);
          printKeyValue('Spec hash', specHash);
          printKeyValue('Deliver by', new Date(deliverByMs).toISOString());
          printKeyValue('Seller receives', sellerReceivesLine(amountUsdc));
          if (digest) printKeyValue('Tx', digest);
          printBlank();
          if (jobId) {
            printInfo(`Hand the seller the job id — they verify it with: t2 job verify ${jobId} --price ${amountUsdc}`);
          }
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('verify')
    .argument('<jobId>', 'The Job object id (0x…)')
    .description('Seller-side check: the job is funded and pays YOU. --price additionally checks the escrow covers your listing price')
    .option('--price <usdc>', 'Your price for this job class (optional — the escrow amount is already on-chain)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (jobId: string, opts: { price?: string; key?: string }) => {
      try {
        const agent = await withAgent({ keyPath: opts.key });
        const client = getSuiClient();
        const result = await verifyJobForSeller({
          client,
          jobId,
          seller: agent.address(),
          // S.1226 — price is a listing-class check; without it the
          // on-chain escrow + funded state + seller are the verification.
          ...(opts.price === undefined
            ? {}
            : { minAmountUsdc: Number.parseFloat(opts.price) }),
        });
        if (isJsonMode()) {
          printJson({ ok: result.ok, problems: result.problems, job: result.job });
          if (!result.ok) process.exitCode = 1;
          return;
        }
        printBlank();
        if (result.ok) {
          printSuccess(
            opts.price === undefined
              ? `Escrow verified — funded with ${result.job.escrowUsdc} USDC, pays this wallet. Safe to start work.`
              : 'Escrow verified — funded, pays this wallet, covers the price. Safe to start work.',
          );
        } else {
          printError('Do NOT start work on this job:');
          for (const p of result.problems) printWarning(`  ${p}`);
          process.exitCode = 1;
        }
        printBlank();
        printJob(result.job, agent.address());
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('deliver')
    .argument('<jobId>', 'The Job object id (0x…)')
    .argument('<proof>', 'Delivery body — a file path or text (UPLOADED so the buyer can read it; sha256 pinned on-chain), or a bare 0x… sha256')
    .description('Post your delivery before the deadline (seller) — ONE SHOT: the sha256 pins on-chain permanently and cannot be replaced. Fix mistakes via buyer reject (inside the review window) or out-of-band — never a second deliver. Decline is only possible BEFORE delivery.')
    .option('--hash-only', "Pin <proof> as a precomputed 0x… sha256 WITHOUT uploading a body — the hashed-spec / large-artifact path (the buyer can't read it on-platform; hand the artifact over out-of-band)")
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (jobId: string, proof: string, opts: { hashOnly?: boolean; key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        // Preflight BEFORE any upload (S.1003): a redeliver / terminal /
        // past-deadline job aborts on-chain anyway — catch it here with
        // words instead of a raw MoveAbort, and never orphan an uploaded
        // body. A failed read falls through: don't invent state, let the
        // verb surface whatever the chain says.
        const existing = await getJob(getSuiClient(), jobId).catch(() => null);
        if (existing) {
          const preflightError = deliverPreflightError(existing.state, existing.deliverByMs, Date.now());
          if (preflightError) {
            throw new Error(preflightError.replaceAll('<jobId>', jobId));
          }
        }
        let deliveryHash: string;
        let uploaded = false;
        if (opts.hashOnly) {
          const hash = proof.trim().toLowerCase();
          if (!SHA256_HEX_RE.test(hash)) {
            throw new Error('--hash-only expects a 0x… 64-char sha256 (e.g. from `shasum -a 256`).');
          }
          deliveryHash = hash;
        } else {
          ({ hash: deliveryHash, uploaded } = await resolveSpecUpload(base, proof));
        }
        if (!isJsonMode()) {
          // Point of no return — copy only, NEVER a stdin prompt: this
          // command must stay safe for unattended/cron sellers.
          printInfo('Delivery pins once. The buyer review window starts after this succeeds; you cannot replace the hash.');
        }
        const { digest } = await sponsoredJobVerb({
          base,
          keyPath: opts.key,
          action: 'deliver',
          params: { jobId, deliveryHash },
        });
        if (isJsonMode()) {
          printJson({ jobId, deliveryHash, uploaded, digest, onceOnly: true });
          return;
        }
        printBlank();
        printSuccess('Delivery posted — the buyer\'s review window is now open.');
        printInfo('This delivery cannot be amended — further `t2 job deliver` calls on this job will fail.');
        printKeyValue('Delivery hash', deliveryHash);
        if (digest) printKeyValue('Tx', digest);
        if (uploaded) {
          printInfo('Body uploaded — the buyer reads it content-addressed (tamper-evident against the on-chain hash).');
        } else {
          printInfo('Hash-only commitment — the buyer cannot read the body on-platform; hand the artifact over out-of-band.');
        }
        printInfo('If the buyer neither accepts nor rejects before the window closes, anyone (including you) can run `t2 job release` to settle.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  // Release lives OUTSIDE the shared verb loop (S.1015): it alone carries
  // the --pay-without-delivery goodwill flag, and it alone needs the
  // funded-no-delivery preflight — attaching either to reject/refund/
  // decline would be wrong.
  group
    .command('release')
    .argument('<jobId>', 'The Job object id (0x…)')
    .description('Accept delivery — funds go to the seller (buyer; or anyone once the review window lapses). On a FUNDED job with no delivery this pays the full escrow to the seller, terminally — refused unless --pay-without-delivery.')
    .option('--pay-without-delivery', 'DELIBERATE goodwill: release the full escrow on a funded job with NO delivery (off-band delivery only — the seller keeps everything, no refund path)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (jobId: string, opts: { payWithoutDelivery?: boolean; key?: string; api?: string }) => {
      try {
        // Preflight (same style as deliver, S.1003): read the chain before
        // signing. Unreadable job → proceed; the prepare API runs the same
        // gate server-side (S.1015 root fix) and the chain stays authority.
        const existing = await getJob(getSuiClient(), jobId).catch(() => null);
        const undelivered =
          existing?.state === 'funded' && !existing.deliveryHash;
        if (undelivered && !opts.payWithoutDelivery) {
          throw new Error(
            'This job is FUNDED with no delivery — releasing now pays the full escrow to the ' +
              'seller with no recovery path. Wait for the delivery, refund after the deadline ' +
              '(t2 job refund), or — only if the work arrived off-band — re-run with ' +
              '--pay-without-delivery.',
          );
        }
        if (undelivered && opts.payWithoutDelivery) {
          printWarning(
            'Paying WITHOUT an on-chain delivery: the full escrow goes to the seller, terminally. ' +
              'No refund path exists after this.',
          );
        }
        const { digest } = await sponsoredJobVerb({
          base: opts.api ?? DEFAULT_API_BASE,
          keyPath: opts.key,
          action: 'release',
          params: {
            jobId,
            ...(opts.payWithoutDelivery ? { payWithoutDelivery: true } : {}),
          },
        });
        if (isJsonMode()) {
          printJson({ jobId, action: 'release', digest, ...(undelivered ? { paidWithoutDelivery: true } : {}) });
          return;
        }
        printBlank();
        printSuccess('Funds released to the seller.');
        if (digest) printKeyValue('Tx', digest);
        // Review tip ONLY when a delivery existed — there is no work to
        // rate after a goodwill pay, and no pre-filled star count ever
        // (stars are API-mutable opinion, not a chain fact).
        if (existing?.deliveryHash) {
          printInfo(`Rate the work: t2 job review ${jobId} --stars <1-5>`);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  for (const [verb, description, note] of [
    [
      'reject',
      'Reject a delivery within the review window — funds split per the create terms (buyer)',
      'Delivery rejected — funds split per the terms agreed at create.',
    ],
    [
      'refund',
      'Reclaim funds after the deadline passed with no delivery (anyone may crank this)',
      'Escrow refunded to the buyer.',
    ],
    [
      'decline',
      "Pass on an undelivered job you were hired for — the buyer's escrow returns in full, fee-free (seller, before delivery)",
      "Declined — the buyer's escrow went back in full, fee-free. (An Open-claimed posting does not resurrect; the buyer re-posts.)",
    ],
  ] as const) {
    group
      .command(verb)
      .argument('<jobId>', 'The Job object id (0x…)')
      .description(description)
      .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
      .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
      .action(async (jobId: string, opts: { key?: string; api?: string }) => {
        try {
          const { digest } = await sponsoredJobVerb({
            base: opts.api ?? DEFAULT_API_BASE,
            keyPath: opts.key,
            action: verb,
            params: { jobId },
          });
          if (isJsonMode()) {
            printJson({ jobId, action: verb, digest });
            return;
          }
          printBlank();
          printSuccess(note);
          if (digest) printKeyValue('Tx', digest);
          printBlank();
        } catch (error) {
          handleError(error);
        }
      });
  }

  group
    .command('review')
    .argument('<jobId>', 'The Job object id (0x…) of a RELEASED job you were party to')
    .description('Rate a settled job (released OR rejected, with a delivery) 1–5 stars — role-aware: buyers rate the seller (stars land ON-CHAIN, the one public score); sellers rate the buyer (off-chain; public only if the buyer holds an Agent ID)')
    .requiredOption('--stars <1-5>', 'Star rating, 1 (poor) to 5 (excellent)')
    .option('--text <text>', 'Optional short review (max 1000 chars) — text stays off-chain, keyed to the job')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (jobId: string, opts: { stars: string; text?: string; key?: string; api?: string }) => {
      try {
        const stars = Number.parseInt(opts.stars, 10);
        if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
          throw new Error(`--stars must be an integer 1–5 (got "${opts.stars}").`);
        }
        // Role decides the rail, so the job read is required here (the
        // chain + API refuse independently — this is the English layer).
        const reviewedJob = await getJob(getSuiClient(), jobId).catch(() => null);
        if (!reviewedJob) {
          throw new Error('Could not read that job on-chain — check the id and retry.');
        }
        // S.1015: a review requires a DELIVERY — a goodwill-released job
        // has no work to rate, and a sockpuppet ★5 on it would cost only
        // the settle fee. Move + API refuse too; defense in depth.
        if (!reviewedJob.deliveryHash) {
          throw new Error(
            'This job has no on-chain delivery — there is no work to rate. Reviews attach only ' +
              'to jobs the seller actually delivered.',
          );
        }
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();
        const text = opts.text?.trim() || null;

        if (address === reviewedJob.buyer) {
          // Buyer → seller: STARS GO ON-CHAIN (S.1054 — the one public
          // score SSOT; `a2a_escrow::reputation`). Sponsored rail, same as
          // every job verb. Re-running edits the stars in place.
          let digest: string;
          try {
            digest = await submitJobReview(base, agent.signer, { jobId, stars });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            // S.1054b: lost first-review race — two buyers created a
            // brand-new seller's score at once; the derived claim aborts
            // "already claimed". The retry re-routes to a normal review.
            if (/already claimed/i.test(msg)) {
              throw new Error(
                "Another buyer just created this seller's score in a simultaneous first review — " +
                  're-run the same command; your review lands as a normal update.',
              );
            }
            throw error;
          }
          // Optional text rides the existing signed API path — text is
          // not the score; it stays off-chain keyed by jobId.
          let textSaved = false;
          if (text) {
            await postSignedReview(base, agent, address, { jobId: validateAddress(jobId), stars, text });
            textSaved = true;
          }
          if (isJsonMode()) {
            printJson({ jobId: validateAddress(jobId), stars, digest, textSaved });
            return;
          }
          printBlank();
          printSuccess(
            `Review on-chain — ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} on job ${truncateAddress(validateAddress(jobId))}.`,
          );
          printKeyValue('Tx', digest);
          if (textSaved) printInfo('Your review text is saved off-chain with the job.');
          printKeyValue('Seller page', `https://t2000.ai/${reviewedJob.seller}`);
          printInfo('Re-run with different --stars to edit — the score updates in place.');
          printBlank();
          return;
        }

        // Seller → buyer rating: stays on the signed API path (off-chain by
        // design — buyer ratings never gate Open claims).
        const response = await postSignedReview(base, agent, address, {
          jobId: validateAddress(jobId),
          stars,
          text,
        });
        if (isJsonMode()) {
          printJson(response);
          return;
        }
        printBlank();
        printSuccess(`Review saved — ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} on job ${truncateAddress(validateAddress(jobId))}.`);
        // Surface the privacy status the rating was written under —
        // Agent-ID buyers are public, Passport buyers stay private, always.
        const rating = response.rating as { visibility?: string } | undefined;
        if (rating?.visibility) {
          printInfo(
            rating.visibility === 'public'
              ? 'This buyer holds a registered Agent ID — your rating shows on their public agent profile.'
              : 'This buyer is a Passport (human) wallet — your rating is recorded privately, never shown publicly.',
          );
        }
        printInfo('Re-run with different --stars/--text to edit your review.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('spec')
    .argument('<jobId>', 'The Job object id (0x…)')
    .description("Fetch the buyer's job spec / requirements by the on-chain hash (seller)")
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (jobId: string, opts: { api?: string }) => {
      try {
        const client = getSuiClient();
        const job = await getJob(client, jobId);
        // getJobSpec verifies sha256(content) == the on-chain hash — the
        // store is untrusted; the chain commitment is the authority.
        const content = await getJobSpec(opts.api ?? DEFAULT_API_BASE, job.specHash);
        if (isJsonMode()) {
          let parsed: unknown = content;
          try {
            parsed = JSON.parse(content);
          } catch {
            // free-text spec — return as string
          }
          printJson({ jobId, specHash: job.specHash, spec: parsed });
          return;
        }
        printBlank();
        printKeyValue('Job', jobId);
        printKeyValue('Spec hash', `${job.specHash} ${pc.green('(content verified)')}`);
        printBlank();
        printLine(content);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('watch')
    .argument('[jobId]', 'The Job object id (0x…) — omit with --mine or --buying')
    .description('Poll a job — or an inbox: --mine (every job selling to you) / --buying (every job you funded)')
    .option('--mine', 'Watch ALL jobs where this wallet is the seller (the provider inbox)')
    .option('--buying', 'Watch ALL jobs where this wallet is the BUYER — recovers job ids the hire line printed once (S.1016)')
    .option('--interval <seconds>', 'Poll interval', '15')
    .option('--once', 'Print the current state and exit')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (jobId: string | undefined, opts: { mine?: boolean; buying?: boolean; interval: string; once?: boolean; key?: string; api?: string }) => {
      try {
        if (opts.mine && opts.buying) {
          throw new Error('Pick one seat: --mine (selling) or --buying (funding) — not both.');
        }
        if (jobId && (opts.mine || opts.buying)) {
          throw new Error('Pick one mode: a job id OR an inbox flag (--mine / --buying).');
        }
        const agent = await withAgent({ keyPath: opts.key });
        const me = agent.address();
        const intervalMs = Math.max(5, Number.parseInt(opts.interval, 10) || 15) * 1000;

        // ── The buyer inbox (S.1016): the same read-model, buyer seat.
        //    Lose the hire line's one-time jobId print and this recovers
        //    the escrow name — full ids on every actionable row.
        if (opts.buying) {
          const base = opts.api ?? DEFAULT_API_BASE;
          const seen = new Map<string, BuyerInboxBucket>();
          const buyClient = getSuiClient();
          const loadInbox = async (): Promise<IndexedJob[]> =>
            hydrateJobsFromChain(await fetchBuyerJobs(base, me), (id) => getJob(buyClient, id));

          const jobs = await loadInbox();
          const inbox = summarizeBuyerInbox(jobs, Date.now());
          if (isJsonMode()) {
            printJson({
              buyer: me,
              counts: inbox.counts,
              needsYou: inbox.needsYou,
              refundable: inbox.refundable,
              waiting: inbox.waiting,
              terminal: inbox.terminal,
              jobs,
            });
            return;
          }
          printBlank();
          printInfo(
            `Buyer inbox for ${truncateAddress(me)} — ${jobs.length} job(s) · ` +
              `${inbox.counts.needsYou} need you · ${inbox.counts.refundable} refundable · ` +
              `${inbox.counts.waiting} waiting`,
          );
          printBlank();
          for (const [bucket, rows] of [
            ['needsYou', inbox.needsYou],
            ['refundable', inbox.refundable],
            ['waiting', inbox.waiting],
          ] as const) {
            for (const job of rows) {
              printBuyerInboxRow(job, bucket);
              printBlank();
            }
          }
          if (jobs.length - inbox.counts.terminal === 0) {
            printInfo('No open buys. Hire a listing or post an Open job and it lands here.');
            printBlank();
          }
          for (const job of jobs) seen.set(job.jobId, bucketBuyerJob(job, Date.now()));
          if (opts.once) return;

          for (;;) {
            await new Promise((r) => setTimeout(r, intervalMs));
            let latest: IndexedJob[];
            try {
              latest = await loadInbox();
            } catch {
              continue; // transient API blip — keep watching
            }
            const nowMs = Date.now();
            for (const job of latest) {
              const bucket = bucketBuyerJob(job, nowMs);
              const prev = seen.get(job.jobId);
              if (prev === bucket) continue;
              seen.set(job.jobId, bucket);
              printBlank();
              if (bucket === 'needsYou') {
                printSuccess(`Delivered — grade it: t2 job release ${job.jobId} · t2 job reject ${job.jobId}`);
              } else if (bucket === 'refundable') {
                printSuccess(`Refundable — t2 job refund ${job.jobId} (deadline passed, no delivery)`);
              } else {
                printInfo(`Job ${truncateAddress(job.jobId)}: ${prev ?? 'new'} → ${job.state}`);
              }
              printBuyerInboxRow(job, bucket);
              printBlank();
            }
          }
        }

        // ── The provider inbox: sell with NO server. The event indexer
        //    (api.t2000.ai /v1/jobs) surfaces every job funding this wallet;
        //    this loop announces new jobs + state changes and prints the
        //    seller's next verb at each step.
        if (opts.mine) {
          const base = opts.api ?? DEFAULT_API_BASE;
          // jobId → last announced bucket. Buckets (not raw states): a
          // delivered job becomes RELEASABLE by clock alone — a state-keyed
          // loop would never surface money left on the table (S.1003).
          const seen = new Map<string, SellerInboxBucket>();
          const mineClient = getSuiClient();
          // Discover from the index, bucket from the CHAIN (S.1004): the
          // indexer lags writes, and stale rows made correct buckets lie.
          const loadInbox = async (): Promise<IndexedJob[]> =>
            hydrateSellerJobsFromChain(await fetchSellerJobs(base, me), (id) => getJob(mineClient, id));

          const jobs = await loadInbox();
          const inbox = summarizeSellerInbox(jobs, Date.now());
          if (isJsonMode()) {
            // Compat: `jobs` stays the full API list; counts + buckets are
            // additive so pollers stop re-deriving seller actionability.
            printJson({
              seller: me,
              counts: inbox.counts,
              needsYou: inbox.needsYou,
              fundedLate: inbox.fundedLate,
              awaitingBuyer: inbox.awaitingBuyer,
              releasable: inbox.releasable,
              terminal: inbox.terminal,
              jobs,
            });
            return;
          }
          printBlank();
          // "need you" counts ONLY deliverable funded work — never delivered
          // (waiting) or funded-late (dead) rows; all counters always print
          // so operator scripts see a stable shape.
          printInfo(
            `Provider inbox for ${truncateAddress(me)} — ${jobs.length} job(s) · ` +
              `${inbox.counts.needsYou} need you · ${inbox.counts.awaitingBuyer} awaiting buyer · ` +
              `${inbox.counts.releasable} releasable now`,
          );
          if (inbox.counts.fundedLate > 0) {
            printLine(pc.dim(`  ${inbox.counts.fundedLate} past deliver deadline (not deliverable — refund path is open to others)`));
          }
          printBlank();
          // Actionable first: your work, then money to collect, then waits.
          for (const [bucket, rows] of [
            ['needsYou', inbox.needsYou],
            ['releasable', inbox.releasable],
            ['awaitingBuyer', inbox.awaitingBuyer],
            ['fundedLate', inbox.fundedLate],
          ] as const) {
            for (const job of rows) {
              printInboxRow(job, bucket);
              printBlank();
            }
          }
          const openCount = jobs.length - inbox.counts.terminal;
          if (openCount === 0) {
            printInfo('No open jobs. New hires appear here the moment the escrow funds.');
            printBlank();
          }
          for (const job of jobs) seen.set(job.jobId, bucketSellerJob(job, Date.now()));
          if (opts.once) return;

          for (;;) {
            await new Promise((r) => setTimeout(r, intervalMs));
            let latest: IndexedJob[];
            try {
              latest = await loadInbox();
            } catch {
              continue; // transient API blip — keep watching
            }
            const nowMs = Date.now();
            for (const job of latest) {
              const bucket = bucketSellerJob(job, nowMs);
              const prev = seen.get(job.jobId);
              if (prev === bucket) continue;
              seen.set(job.jobId, bucket);
              printBlank();
              if (prev === undefined && bucket === 'needsYou') {
                printSuccess(`New job — $${job.amountUsdc.toFixed(2)} USDC escrowed for you.`);
              } else if (bucket === 'releasable') {
                printSuccess(`Releasable now — t2 job release ${job.jobId}`);
              } else {
                printInfo(`Job ${truncateAddress(job.jobId)}: ${prev ?? 'new'} → ${job.state}`);
              }
              printInboxRow(job, bucket);
              printBlank();
            }
          }
        }

        if (!jobId) {
          printError('Provide a job id — or an inbox: --mine (selling) / --buying (funding).');
          process.exitCode = 1;
          return;
        }
        const client = getSuiClient();

        // An OPENING id resolves to its Job (the claim consumed the Opening
        // and minted the Job — one job, two objects; same as the web
        // redirect). Unclaimed openings have no Job yet.
        let watchId = jobId;
        try {
          await getJob(client, watchId);
        } catch {
          const opening = await fetchJson(
            `${(opts.api ?? DEFAULT_API_BASE)}/open-jobs/${encodeURIComponent(watchId)}`,
          ).catch(() => null);
          const row = opening?.openJob as { jobId?: string | null; status?: string } | undefined;
          if (row?.jobId) {
            printInfo(`Opening ${truncateAddress(watchId)} became Job ${truncateAddress(row.jobId)} at claim — watching the Job.`);
            watchId = row.jobId;
          } else if (row) {
            printInfo(`This is an opening (status: ${row.status}) — no Job exists until a seller claims it. Board: t2 job board`);
            return;
          }
        }

        for (;;) {
          const job = await getJob(client, watchId);
          const actions = jobActionsFor(job, me);
          const terminal = job.state === 'released' || job.state === 'refunded' || job.state === 'rejected';

          if (isJsonMode()) {
            printJson({ job, yourActions: actions, terminal });
          } else {
            printBlank();
            printJob(job, me);
            if (actions.length > 0) {
              printInfo(`You can now: ${actions.map((a) => `t2 job ${a} ${watchId}`).join('  ·  ')}`);
            } else if (!terminal) {
              printInfo('Nothing for you to do yet — waiting on the counterparty / clock.');
            }
          }

          if (terminal || opts.once || isJsonMode()) return;
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      } catch (error) {
        handleError(error);
      }
    });

  // The OPEN door — board verbs live flat on this same group (one noun).
  registerOpenVerbs(group);
  registerBatchVerbs(group);
}
