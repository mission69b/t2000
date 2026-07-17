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
import { withAgent } from '../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printError,
  printInfo,
  printJson,
  printKeyValue,
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
`,
    );

  group
    .command('create')
    .argument('<amount>', `USDC to escrow (max ${MAX_JOB_USDC})`)
    .argument('<seller>', "The seller's Sui address (their listing's payTo wallet)")
    .description('Create + fund an escrow job in one transaction (buyer)')
    .requiredOption('--spec <file-or-text>', 'Job spec — a file path or inline text (hashed on-chain), or a 0x… hash')
    .option('--deadline <duration>', 'Time the seller has to deliver (e.g. 30m, 24h, 7d)', '24h')
    .option('--review <duration>', 'Your accept/reject window after delivery', '24h')
    .option('--split <bps>', 'Your share in bps if you reject (0–10000)', String(DEFAULT_REJECT_SPLIT_BPS))
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (
        amountArg: string,
        sellerArg: string,
        opts: {
          spec: string;
          deadline: string;
          review: string;
          split: string;
          key?: string;
          api?: string;
        },
      ) => {
        try {
          const amountUsdc = Number.parseFloat(amountArg);
          if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
            throw new Error(`Amount must be a positive number (got "${amountArg}").`);
          }
          const seller = validateAddress(sellerArg);
          const specHash = await resolveCommitment(opts.spec);
          const deliverByMs = Date.now() + parseDuration(opts.deadline);
          const reviewWindowMs = opts.review
            ? parseDuration(opts.review)
            : DEFAULT_REVIEW_WINDOW_MS;
          const rejectSplitBps = Number.parseInt(opts.split, 10);

          const base = opts.api ?? DEFAULT_API_BASE;
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
            printJson({ jobId, digest, buyer: address, seller, amountUsdc, specHash, deliverByMs, reviewWindowMs, rejectSplitBps });
            return;
          }
          printBlank();
          printSuccess(`Escrowed $${amountUsdc.toFixed(2)} USDC → job for ${truncateAddress(seller)}`);
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
          printBlank();
        } catch (error) {
          handleError(error);
        }
      });
  }

  group
    .command('watch')
    .argument('<jobId>', 'The Job object id (0x…)')
    .description('Poll the job — state, timers, and what YOU can do right now')
    .option('--interval <seconds>', 'Poll interval', '15')
    .option('--once', 'Print the current state and exit')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (jobId: string, opts: { interval: string; once?: boolean; key?: string }) => {
      try {
        const agent = await withAgent({ keyPath: opts.key });
        const me = agent.address();
        const client = getSuiClient();
        const intervalMs = Math.max(5, Number.parseInt(opts.interval, 10) || 15) * 1000;

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
