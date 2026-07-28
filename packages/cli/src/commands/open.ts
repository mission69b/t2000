// The OPEN door of `t2 job` (SPEC_T2_AGENTS_OPEN). ONE JOB, TWO DOORS:
// `t2 job hire` = you pick the ASP (a listing or your own brief); the verbs
// here are the board door — post the job with NO ASP picked and the first
// claim wins. Funding a claim creates a normal a2a_escrow Job — same
// lifecycle, same $50 cap, same receipts.
//
//   open     post an opening — title/brief/budget/deadline  (buyer)
//   board    read the open board (public, no wallet)        (anyone)
//   claim    reserve an opening; no USDC, 2h to get funded  (ASP)
//   unclaim  hand a claim back early                        (ASP)
//   cancel   withdraw your own unclaimed opening            (buyer)
//   fund     escrow the budget into a Job (gasless)         (buyer)
//
// Registered onto the `t2 job` group by registerJob — flat verbs, same
// level as deliver/release, so there is exactly ONE job noun in the CLI.

import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  cancelOpenJob,
  claimOpenJob,
  createOpenJob,
  fundOpenJob,
  listOpenJobs,
  unclaimOpenJob,
  MAX_JOB_USDC,
  type OpenJobRow,
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
  if (status === 'funded') return pc.dim(status);
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

function printOpenJob(row: OpenJobRow) {
  printKeyValue('Open job', row.id);
  printKeyValue('Status', statusColor(row.status));
  printKeyValue('Title', row.title);
  printKeyValue('Budget', `$${row.maxUsdc.toFixed(2)} USDC`);
  printKeyValue('Deliver in', `${row.slaMinutes} min (once funded)`);
  if (row.status === 'open') {
    printKeyValue('Open for', fmtLeft(row.openUntilMs));
  }
  if (row.buyerAgent) {
    printKeyValue('Buyer', `${row.buyerAgent.name} (#${row.buyerAgent.agentId})`);
  }
  if (row.seller) {
    printKeyValue(
      'Claimed by',
      row.sellerAgent ? `${row.sellerAgent.name} (${row.seller})` : row.seller,
    );
    if (row.status === 'claimed') {
      printKeyValue('Claim lapses', fmtLeft(row.claimExpiresAtMs));
    }
  }
  if (row.jobId) {
    printKeyValue('Job', row.jobId);
  }
}

/** Adds the Open-door verbs onto the `t2 job` group. */
export function registerOpenVerbs(group: Command) {
  group
    .command('open')
    .description('Open — post the job to the public board with no ASP picked (buyer); holds no USDC, first claim wins')
    .requiredOption('--title <text>', "The job's public name (up to 80 chars)")
    .requiredOption('--brief <file-or-text>', 'What you want delivered — PUBLIC, every ASP on the board reads it')
    .requiredOption('--max <usdc>', `Budget escrowed at fund time (max ${MAX_JOB_USDC})`)
    .option('--sla <duration>', 'Delivery window once funded (e.g. 30m, 24h, 7d)', '24h')
    .option('--open-for <duration>', 'How long the posting stays claimable', '24h')
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
          const agent = await withAgent({ keyPath: opts.key });
          const row = await createOpenJob(base, agent.signer, {
            title: opts.title.trim(),
            brief,
            maxUsdc,
            slaMinutes: Math.round(parseDuration(opts.sla) / 60_000),
            openHours: parseDuration(opts.openFor) / 3_600_000,
          });
          if (isJsonMode()) {
            printJson({ openJob: row });
            return;
          }
          printBlank();
          printSuccess('Posted — your open job is on the board (no USDC moved).');
          printBlank();
          printOpenJob(row);
          printBlank();
          printInfo('When an ASP claims it: t2 job fund ' + row.id);
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
    .option('--status <status>', 'open | claimed | funded | expired | cancelled', 'open')
    .option('--limit <n>', 'Max rows (default 24)', '24')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (query: string | undefined, opts: { status: string; limit: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const rows = await listOpenJobs(base, {
          status: opts.status as OpenJobRow['status'],
          query,
          limit: Number(opts.limit),
        });
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
            `  ${pc.bold(row.title)}  ${pc.dim(`$${row.maxUsdc.toFixed(2)}`)}  ${statusColor(row.status)}` +
              (row.status === 'open' ? pc.dim(`  ${fmtLeft(row.openUntilMs)} left`) : ''),
          );
          const brief = row.brief.replace(/\s+/g, ' ');
          printLine(`    ${pc.dim(brief.length > 100 ? `${brief.slice(0, 100)}…` : brief)}`);
          printLine(`    ${pc.dim(row.id)}`);
          printBlank();
        }
        printInfo('Claim one: t2 job claim <id> — no USDC, 2h to get funded.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('claim')
    .argument('<id>', 'The open-job id (from t2 job board)')
    .description('Claim an open job (ASP) — first claim wins; no USDC, 2h to get funded')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (id: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const row = await claimOpenJob(base, agent.signer, id.trim());
        if (isJsonMode()) {
          printJson({ claimed: true, openJob: row });
          return;
        }
        printBlank();
        printSuccess('Claimed — the buyer has 2 hours to fund before it reopens.');
        printBlank();
        if (row) printOpenJob(row);
        printBlank();
        printInfo('Funded jobs land in your inbox: t2 job watch --mine');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('unclaim')
    .argument('<id>', 'The open-job id you claimed')
    .description('Hand a claim back early (ASP) — the job reopens immediately')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (id: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        await unclaimOpenJob(base, agent.signer, id.trim());
        if (isJsonMode()) {
          printJson({ unclaimed: true });
          return;
        }
        printBlank();
        printSuccess('Unclaimed — the job is back on the board.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('cancel')
    .argument('<id>', 'Your open-job id')
    .description('Withdraw your own open posting (buyer) — only while still unclaimed')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (id: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        await cancelOpenJob(base, agent.signer, id.trim());
        if (isJsonMode()) {
          printJson({ cancelled: true });
          return;
        }
        printBlank();
        printSuccess('Cancelled — the posting is off the board.');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('fund')
    .argument('<id>', 'Your claimed open-job id')
    .description('Fund a claimed opening (buyer) — escrows the budget into a normal Job, gasless')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (id: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const { digest, jobId } = await fundOpenJob(base, agent.signer, id.trim());
        if (isJsonMode()) {
          printJson({ digest, jobId });
          return;
        }
        printBlank();
        printSuccess('Funded — the budget is escrowed in an on-chain Job.');
        printBlank();
        if (jobId) printKeyValue('Job', jobId);
        printKeyValue('Tx', digest);
        printBlank();
        printInfo(
          jobId
            ? `Track it: t2 job watch ${jobId}`
            : 'Track it: t2 job watch --mine',
        );
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
