// The OPEN door of `t2 job` (SPEC_T2_AGENTS_OPEN_ONCHAIN — escrow-at-post).
// ONE JOB, TWO DOORS: `t2 job hire` = you pick the ASP; the verbs here post
// the job with NO ASP picked — and the budget ESCROWS ON-CHAIN AT POST in a
// shared `Opening`. The first active registered ASP to claim mints a normal
// a2a_escrow Job on the spot (work starts immediately — no fund step). An
// unclaimed opening refunds fee-free: buyer cancel any time, or the
// permissionless crank after the open window.
//
//   open     post an opening — ESCROWS THE BUDGET NOW      (buyer)
//   board    read the open board (public, no wallet)       (anyone)
//   claim    first active ASP wins → funded Job, work on   (ASP)
//   cancel   withdraw an unclaimed opening — full refund   (buyer)
//
// All writes ride the sponsored rail (gasless; Move authorizes on sender).
// Registered flat on the `t2 job` group — one job noun.

import { readFile } from 'node:fs/promises';
import {
  assertSpendAllowed,
  recordSpendIfLanded,
} from '../lib/spend-gate.js';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  cancelOpenJob,
  claimOpenJob,
  getSuiClient,
  listOpenJobs,
  postOpenJob,
  MAX_JOB_USDC,
  type OpenJobRow,
  resolveCreatedObjectId,
} from '@t2000/sdk';
import { parseDuration } from './job.js';
import { withAgent } from '../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
} from '../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';
const MAX_BRIEF_BYTES = 16 * 1024;

/** Brief input: a file path if one exists, else the literal text. PUBLIC
 *  either way — the board shows it to every ASP. */
export async function resolveBrief(input: string): Promise<string> {
  let bytes: Buffer;
  try {
    bytes = await readFile(input);
  } catch {
    bytes = Buffer.from(input, 'utf8');
  }
  if (bytes.length > MAX_BRIEF_BYTES) {
    throw new Error(
      `Brief is ${bytes.length} bytes — open-job briefs cap at 16 KiB. ` +
        'Keep it short and link out for more.',
    );
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
  } catch {
    throw new Error('Brief is not UTF-8 text — the board holds text only.');
  }
}

function statusColor(status: OpenJobRow['status']): string {
  if (status === 'open') return pc.green(status);
  if (status === 'claimed') return pc.cyan(status);
  return pc.yellow(status);
}

function fmtLeft(ms: number | null): string {
  if (ms == null) return '';
  const left = ms - Date.now();
  if (left <= 0) return 'now';
  const hours = Math.floor(left / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.floor(left / 60_000))}m`;
}

/** Best-effort: pull the created object id (Opening or Job) off a digest —
 *  the shared SDK walk (S.906 SSOT). */
function resolveCreated(
  digest: string,
  marker: '::opening::Opening<' | '::escrow::Job<',
): Promise<string | undefined> {
  return resolveCreatedObjectId(getSuiClient(), digest, marker);
}

/** Adds the Open-door verbs onto the `t2 job` group. */
export function registerOpenVerbs(group: Command) {
  group
    .command('open')
    .description('Open — post the job to the public board with no ASP picked (buyer); ESCROWS the budget on-chain now, first claim starts work. Reject on open work returns 100% to you (contract-locked) — junk delivery earns the seller nothing.')
    .requiredOption('--title <text>', "The job's public name (up to 80 chars)")
    .requiredOption('--brief <file-or-text>', 'What you want delivered — PUBLIC, every ASP on the board reads it')
    .requiredOption('--max <usdc>', `Budget escrowed AT POST (max ${MAX_JOB_USDC})`)
    .option('--sla <duration>', 'Delivery window once claimed (e.g. 30m, 24h, 7d)', '24h')
    .option('--open-for <duration>', 'How long the posting stays claimable before it refunds', '24h')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        title: string;
        brief: string;
        max: string;
        sla: string;
        openFor: string;
        key?: string;
        api?: string;
      }) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;
          const maxUsdc = Number(opts.max);
          if (!Number.isFinite(maxUsdc) || maxUsdc <= 0 || maxUsdc > MAX_JOB_USDC) {
            throw new Error(`--max must be between 0.01 and ${MAX_JOB_USDC} USDC.`);
          }
          const brief = await resolveBrief(opts.brief);
          // The budget escrows ON-CHAIN at post — a real outflow from the
          // buyer's wallet, so it belongs under the same cap as a hire.
          // (Claiming is free and is never recorded as spend.)
          assertSpendAllowed(maxUsdc);
          const agent = await withAgent({ keyPath: opts.key });
          const digest = await postOpenJob(base, agent.signer, {
            title: opts.title.trim(),
            brief,
            maxUsdc,
            slaMinutes: Math.round(parseDuration(opts.sla) / 60_000),
            openHours: parseDuration(opts.openFor) / 3_600_000,
          });
          recordSpendIfLanded(maxUsdc, digest);
          const openingId = await resolveCreated(digest, '::opening::Opening<');
          if (isJsonMode()) {
            printJson({ digest, openingId });
            return;
          }
          printBlank();
          printSuccess(
            `Posted — $${maxUsdc.toFixed(2)} USDC escrowed on-chain in the opening.`,
          );
          printBlank();
          if (openingId) printKeyValue('Opening', openingId);
          printKeyValue('Tx', digest);
          printBlank();
          printInfo(
            'The first active ASP to claim starts work immediately. No claim ' +
              `in ${opts.openFor} → full fee-free refund` +
              (openingId ? ` (or cancel now: t2 job cancel ${openingId})` : '.'),
          );
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('board')
    .argument('[query]', 'Free-text filter across titles + briefs')
    .description('Read the open board — claimable postings first (public, no wallet)')
    .option('--status <status>', 'open | claimed | cancelled | refunded', 'open')
    .option('--limit <n>', 'Max rows (default 24)', '24')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (query: string | undefined, opts: { status: string; limit: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const rows = await listOpenJobs(base, {
          status: opts.status as OpenJobRow['status'] & OpenJobRow['status'],
          query,
          limit: Number(opts.limit),
        } as never);
        if (isJsonMode()) {
          printJson({ total: rows.length, openJobs: rows });
          return;
        }
        printBlank();
        if (rows.length === 0) {
          printInfo(
            `No ${opts.status} jobs on the board` +
              (query ? ` matching "${query}"` : '') +
              '. Post one: t2 job open --title "…" --brief "…" --max 5',
          );
          printBlank();
          return;
        }
        for (const row of rows) {
          printLine(
            `  ${pc.bold(row.title ?? 'Untitled opening')}  ${pc.dim(`$${row.maxUsdc.toFixed(2)}`)}  ${statusColor(row.status)}` +
              (row.status === 'open' ? pc.dim(`  ${fmtLeft(row.openUntilMs)} left`) : ''),
          );
          const brief = (row.brief ?? '').replace(/\s+/g, ' ');
          if (brief) {
            printLine(`    ${pc.dim(brief.length > 100 ? `${brief.slice(0, 100)}…` : brief)}`);
          }
          printLine(`    ${pc.dim(row.id)}`);
          printBlank();
        }
        printInfo(
          'Claim one: t2 job claim <id> — the budget is already escrowed; claiming starts the job.',
        );
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('claim')
    .argument('<id>', 'The opening object id (0x…, from t2 job board)')
    .description('Claim an open job (ASP) — first claim wins and the funded Job starts immediately')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (id: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const digest = await claimOpenJob(base, agent.signer, id.trim());
        const jobId = await resolveCreated(digest, '::escrow::Job<');
        if (isJsonMode()) {
          printJson({ digest, jobId });
          return;
        }
        printBlank();
        printSuccess('Claimed — the escrow is yours to earn. Work starts NOW.');
        printBlank();
        if (jobId) {
          // ONE job, two objects: the claim consumes the Opening and mints
          // the Job — narrate the id handoff so nobody hunts for "two jobs".
          printKeyValue('Opening', `${id.trim()} → became the Job below`);
          printKeyValue('Job', jobId);
        }
        printKeyValue('Tx', digest);
        printBlank();
        printInfo(
          jobId
            ? `Deliver before the deadline: t2 job deliver ${jobId} <file> · watch: t2 job watch ${jobId}`
            : 'Deliver before the deadline — find it: t2 job watch --mine',
        );
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('cancel')
    .argument('<id>', 'Your opening object id (0x…)')
    .description('Withdraw your own unclaimed opening (buyer) — full refund, fee-free, any time before a claim')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (id: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const digest = await cancelOpenJob(base, agent.signer, id.trim());
        if (isJsonMode()) {
          printJson({ digest, cancelled: true });
          return;
        }
        printBlank();
        printSuccess('Cancelled — the escrowed budget is back in your wallet, fee-free.');
        printKeyValue('Tx', digest);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
