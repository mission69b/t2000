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
//   review   rate a RELEASED job 1–5 stars                (buyer)
//
// Writes go through the sponsored rail (api.t2000.ai builds + co-pays gas;
// this wallet signs — auth is `sender == buyer/seller` in Move, so
// sponsorship never weakens it). Reads are direct RPC.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  getJob,
  getSuiClient,
  jobActionsFor,
  truncateAddress,
  validateAddress,
  verifyJobForSeller,
  MAX_JOB_USDC,
  type Job,
} from '@t2000/sdk';
import { runSponsoredTx } from '../lib/agent-register.js';
import {
  fetchJson,
  fetchOffering,
  getJobSpec,
  putJobSpec,
} from '../lib/offerings.js';
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

/** Spec/delivery commitment: a `0x…` hex hash passes through; anything else
 *  is hashed — file contents when the arg is a readable path, else the
 *  literal text (sha256 → hex). */
export async function resolveCommitment(input: string): Promise<string> {
  if (/^0x[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0) return input;
  let bytes: Buffer;
  try {
    bytes = await readFile(input);
  } catch {
    bytes = Buffer.from(input, 'utf8');
  }
  return `0x${createHash('sha256').update(bytes).digest('hex')}`;
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
}

export async function fetchSellerJobs(base: string, seller: string): Promise<IndexedJob[]> {
  const json = await fetchJson(`${base}/jobs?seller=${encodeURIComponent(seller)}&limit=100`);
  return (json.jobs ?? []) as IndexedJob[];
}

const TERMINAL_STATES = new Set(['released', 'rejected', 'refunded']);

function inboxHint(job: IndexedJob): string {
  if (job.state === 'funded') {
    return `t2 job spec ${truncateAddress(job.jobId)} → do the work → t2 job deliver ${truncateAddress(job.jobId)} <file>`;
  }
  if (job.state === 'delivered') {
    return `waiting on the buyer's review — anyone can \`t2 job release\` once it lapses`;
  }
  return '';
}

function printInboxRow(job: IndexedJob) {
  const deadline = job.state === 'funded' ? ` · deliver by ${new Date(job.deliverByMs).toISOString()}` : '';
  printLine(
    `  ${stateColor(job.state as Job['state'])}  $${job.amountUsdc.toFixed(2)} USDC · from ${truncateAddress(job.buyer)}${deadline}`,
  );
  printLine(`  ${pc.dim(job.jobId)}`);
  const hint = inboxHint(job);
  if (hint) printLine(`  ${pc.dim('→')} ${hint}`);
}

async function sponsoredJobVerb(opts: {
  base: string;
  keyPath?: string;
  action: 'create' | 'deliver' | 'release' | 'reject' | 'refund';
  params: Record<string, unknown>;
}): Promise<{ address: string; digest?: string }> {
  const agent = await withAgent({ keyPath: opts.keyPath });
  const address = agent.address();
  const { digest } = await runSponsoredTx({
    keypair: agent.keypair,
    actor: address,
    prepareUrl: `${opts.base}/job/prepare`,
    prepareBody: { address, action: opts.action, params: opts.params },
    submitUrl: `${opts.base}/job/submit`,
  });
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
window) and a no-show seller can never keep funds (anyone may refund after the
deadline). v1 caps jobs at ${MAX_JOB_USDC} USDC.

Typical flow:
  buyer   $ t2 job create 5 0xSELLER --spec brief.md --deadline 24h
  seller  $ t2 job verify 0xJOB --price 5
  seller  $ t2 job deliver 0xJOB report.pdf
  buyer   $ t2 job release 0xJOB          (or: t2 job reject 0xJOB)
  either  $ t2 job watch 0xJOB
  seller  $ t2 job watch --mine           (the provider inbox — all your jobs)

Buying a SERVICE (t2 ACP) — price + terms come from the listing:
  buyer   $ t2 browse "market report"
  buyer   $ t2 job create --agent 0xSELLER --service sui-market-report \\
              --requirements '{"token":"DEEP"}'
  seller  $ t2 job spec 0xJOB              (read the buyer's requirements)
`,
    );

  group
    .command('create')
    .argument('[amount]', `USDC to escrow (max ${MAX_JOB_USDC}; omit when buying a --service)`)
    .argument('[seller]', "The seller's Sui address (omit when buying a --service)")
    .description('Create + fund an escrow job in one transaction (buyer)')
    .option('--spec <file-or-text>', 'Job spec — a file path or inline text (hashed on-chain), or a 0x… hash')
    .option('--agent <address>', "Buy a service: the seller's agent address")
    .option('--service <slug>', 'The service slug (see t2 browse / t2 service list <agent>)')
    .option('--offering <slug>', 'Alias for --service (compat)')
    .option('--requirements <file-or-json-or-text>', 'Your requirements for the service (what the seller asked for)')
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
          agent?: string;
          service?: string;
          offering?: string;
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
          let offeringSlug: string | undefined;

          const serviceSlugOpt = opts.service ?? opts.offering;
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
            const sellerAgent = validateAddress(opts.agent);
            const offering = await fetchOffering(base, sellerAgent, serviceSlugOpt);
            offeringSlug = offering.slug;

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
            if (offering.requirements != null && requirements == null) {
              const want =
                typeof offering.requirements === 'string'
                  ? offering.requirements
                  : `JSON matching: ${JSON.stringify(offering.requirements)}`;
              throw new Error(
                `This service needs --requirements. The seller asks for: ${want}`,
              );
            }
            if (
              offering.requirements != null &&
              typeof offering.requirements === 'object' &&
              (typeof requirements !== 'object' || requirements === null)
            ) {
              throw new Error(
                `This service expects JSON requirements matching: ${JSON.stringify(offering.requirements)}`,
              );
            }

            const buyer = (await withAgent({ keyPath: opts.key })).address();
            const spec = JSON.stringify({
              type: 't2-acp-job-spec@1',
              offering: {
                agent: offering.agent,
                slug: offering.slug,
                name: offering.name,
                priceUsdc: offering.priceUsdc,
                deliverable: offering.deliverable,
              },
              requirements,
              buyer,
              createdAtMs: Date.now(),
            });
            specHash = `0x${await putJobSpec(base, spec)}`;

            amountUsdc = offering.priceUsdc;
            seller = offering.agent;
            deliverByMs = Date.now() + offering.slaMinutes * 60_000;
            reviewWindowMs = offering.reviewWindowMinutes * 60_000;
            rejectSplitBps = offering.rejectSplitBps;
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
            seller = validateAddress(sellerArg);
            specHash = await resolveCommitment(opts.spec);
            deliverByMs = Date.now() + parseDuration(opts.deadline);
            reviewWindowMs = opts.review
              ? parseDuration(opts.review)
              : DEFAULT_REVIEW_WINDOW_MS;
            rejectSplitBps = Number.parseInt(opts.split, 10);
          }
          const { address, digest } = await sponsoredJobVerb({
            base,
            keyPath: opts.key,
            action: 'create',
            params: { seller, amountUsdc, specHash, deliverByMs, reviewWindowMs, rejectSplitBps },
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
            printJson({ jobId, digest, buyer: address, seller, amountUsdc, specHash, deliverByMs, reviewWindowMs, rejectSplitBps, ...(offeringSlug ? { offering: offeringSlug } : {}) });
            return;
          }
          printBlank();
          printSuccess(`Escrowed $${amountUsdc.toFixed(2)} USDC → job for ${truncateAddress(seller)}${offeringSlug ? ` (service: ${offeringSlug})` : ''}`);
          if (jobId) printKeyValue('Job', jobId);
          printKeyValue('Spec hash', specHash);
          printKeyValue('Deliver by', new Date(deliverByMs).toISOString());
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
    .description('Seller-side check: the job is funded, pays YOU, and covers the price')
    .requiredOption('--price <usdc>', 'Your price for this job class')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (jobId: string, opts: { price: string; key?: string }) => {
      try {
        const agent = await withAgent({ keyPath: opts.key });
        const client = getSuiClient();
        const result = await verifyJobForSeller({
          client,
          jobId,
          seller: agent.address(),
          minAmountUsdc: Number.parseFloat(opts.price),
        });
        if (isJsonMode()) {
          printJson({ ok: result.ok, problems: result.problems, job: result.job });
          if (!result.ok) process.exitCode = 1;
          return;
        }
        printBlank();
        if (result.ok) {
          printSuccess('Escrow verified — funded, pays this wallet, covers the price. Safe to start work.');
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
    .argument('<proof>', 'Delivery artifact — a file path or text (hashed on-chain), or a 0x… hash')
    .description('Post your proof-of-delivery before the deadline (seller)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (jobId: string, proof: string, opts: { key?: string; api?: string }) => {
      try {
        const deliveryHash = await resolveCommitment(proof);
        const { digest } = await sponsoredJobVerb({
          base: opts.api ?? DEFAULT_API_BASE,
          keyPath: opts.key,
          action: 'deliver',
          params: { jobId, deliveryHash },
        });
        if (isJsonMode()) {
          printJson({ jobId, deliveryHash, digest });
          return;
        }
        printBlank();
        printSuccess('Delivery posted — the buyer\'s review window is now open.');
        printKeyValue('Delivery hash', deliveryHash);
        if (digest) printKeyValue('Tx', digest);
        printInfo('If the buyer neither accepts nor rejects before the window closes, anyone (including you) can run `t2 job release` to settle.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  for (const [verb, description, note] of [
    [
      'release',
      'Accept delivery — funds go to the seller (buyer; or anyone once the review window lapses)',
      'Funds released to the seller.',
    ],
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
          if (verb === 'release') {
            printInfo(`Rate the work (builds the seller's on-chain-backed reputation): t2 job review ${truncateAddress(jobId)} --stars 5`);
          }
          printBlank();
        } catch (error) {
          handleError(error);
        }
      });
  }

  group
    .command('review')
    .argument('<jobId>', 'The Job object id (0x…) of a RELEASED job you paid for')
    .description('Rate a released job 1–5 stars — receipt-bound to the Job object (buyer)')
    .requiredOption('--stars <1-5>', 'Star rating, 1 (poor) to 5 (excellent)')
    .option('--text <text>', 'Optional short review (max 400 chars)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (jobId: string, opts: { stars: string; text?: string; key?: string; api?: string }) => {
      try {
        const stars = Number.parseInt(opts.stars, 10);
        if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
          throw new Error(`--stars must be an integer 1–5 (got "${opts.stars}").`);
        }
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const address = agent.address();

        // Same signed-mutation construction as `t2 offering`: challenge
        // nonce + personal-message signature over sha256 of the payload.
        const challenge = await fetchJson(`${base}/agent/challenge`, {
          method: 'POST',
          body: { address },
        });
        const nonce = challenge.nonce as string | undefined;
        if (!nonce) throw new Error('Failed to get a challenge nonce.');
        const payload = {
          jobId: validateAddress(jobId),
          stars,
          text: opts.text?.trim() || null,
        };
        const payloadHash = createHash('sha256')
          .update(JSON.stringify(payload), 'utf8')
          .digest('hex');
        const message = new TextEncoder().encode(
          `t2000-job-review:${nonce}:${payloadHash}`,
        );
        const { signature } = await agent.keypair.signPersonalMessage(message);
        const response = await fetchJson(`${base}/job/review`, {
          method: 'POST',
          body: { address, nonce, signature, payload },
        });

        if (isJsonMode()) {
          printJson(response);
          return;
        }
        printBlank();
        printSuccess(`Review saved — ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} on job ${truncateAddress(payload.jobId)}.`);
        const review = response.review as { seller?: string } | undefined;
        if (review?.seller) {
          printKeyValue('Seller page', `https://agents.t2000.ai/${review.seller}`);
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
    .argument('[jobId]', 'The Job object id (0x…) — omit with --mine')
    .description('Poll a job — or, with --mine, the provider inbox (every job selling to you)')
    .option('--mine', 'Watch ALL jobs where this wallet is the seller (the provider inbox)')
    .option('--interval <seconds>', 'Poll interval', '15')
    .option('--once', 'Print the current state and exit')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (jobId: string | undefined, opts: { mine?: boolean; interval: string; once?: boolean; key?: string; api?: string }) => {
      try {
        const agent = await withAgent({ keyPath: opts.key });
        const me = agent.address();
        const intervalMs = Math.max(5, Number.parseInt(opts.interval, 10) || 15) * 1000;

        // ── The provider inbox: sell with NO server. The event indexer
        //    (api.t2000.ai /v1/jobs) surfaces every job funding this wallet;
        //    this loop announces new jobs + state changes and prints the
        //    seller's next verb at each step.
        if (opts.mine) {
          const base = opts.api ?? DEFAULT_API_BASE;
          const seen = new Map<string, string>(); // jobId → last printed state

          const jobs = await fetchSellerJobs(base, me);
          if (isJsonMode()) {
            printJson({ seller: me, jobs });
            return;
          }
          const open = jobs.filter((j) => !TERMINAL_STATES.has(j.state));
          printBlank();
          printInfo(`Provider inbox for ${truncateAddress(me)} — ${jobs.length} job(s), ${open.length} open.`);
          printBlank();
          for (const job of open) {
            printInboxRow(job);
            printBlank();
          }
          if (open.length === 0) {
            printInfo('No open jobs. New hires appear here the moment the escrow funds.');
            printBlank();
          }
          for (const job of jobs) seen.set(job.jobId, job.state);
          if (opts.once) return;

          for (;;) {
            await new Promise((r) => setTimeout(r, intervalMs));
            let latest: IndexedJob[];
            try {
              latest = await fetchSellerJobs(base, me);
            } catch {
              continue; // transient API blip — keep watching
            }
            for (const job of latest) {
              const prev = seen.get(job.jobId);
              if (prev === job.state) continue;
              seen.set(job.jobId, job.state);
              printBlank();
              if (prev === undefined && job.state === 'funded') {
                printSuccess(`New job — $${job.amountUsdc.toFixed(2)} USDC escrowed for you.`);
              } else {
                printInfo(`Job ${truncateAddress(job.jobId)}: ${prev ?? 'new'} → ${job.state}`);
              }
              printInboxRow(job);
              printBlank();
            }
          }
        }

        if (!jobId) {
          printError('Provide a job id — or use --mine for the provider inbox.');
          process.exitCode = 1;
          return;
        }
        const client = getSuiClient();

        for (;;) {
          const job = await getJob(client, jobId);
          const actions = jobActionsFor(job, me);
          const terminal = job.state === 'released' || job.state === 'refunded' || job.state === 'rejected';

          if (isJsonMode()) {
            printJson({ job, yourActions: actions, terminal });
          } else {
            printBlank();
            printJob(job, me);
            if (actions.length > 0) {
              printInfo(`You can now: ${actions.map((a) => `t2 job ${a} ${truncateAddress(jobId)}`).join('  ·  ')}`);
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
}
