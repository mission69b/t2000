// The OPEN door of `t2 job` (SPEC_T2_AGENTS_OPEN_ONCHAIN — escrow-at-post).
// ONE JOB, TWO DOORS: `t2 job hire` = you pick the seller; the verbs here post
// the job with NO seller picked — and the budget ESCROWS ON-CHAIN AT POST in a
// shared `Opening`. The first active registered seller to claim mints a normal
// a2a_escrow Job on the spot (work starts immediately — no fund step). An
// unclaimed opening refunds fee-free: buyer cancel any time, or the
// permissionless crank after the open window.
//
//   open     post an opening — ESCROWS THE BUDGET NOW      (buyer)
//   board    read the open board (public, no wallet)       (anyone)
//   claim    first active seller wins → funded Job, work on   (seller)
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
  A2A_SCORE_BOARD_ID,
  cancelOpenJob,
  claimOpenJob,
  getAgentScore,
  getOpening,
  getSuiClient,
  listOpenJobs,
  minSellerLevelForTrustRequirement,
  parseTrustRequirement,
  postOpenJob,
  preflightClaimOpening,
  trustRequirementFromOpening,
  trustRequirementLabel,
  MAX_JOB_USDC,
  PROVEN_MIN_REVIEWS,
  type OpenJobRow,
  type TrustRequirement,
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
 *  either way — the board shows it to every seller. */
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

/** S.1209 — the ONE trust flag: `--trust open|established|top|veteran`
 *  (absent = open). Replaces `--claim-policy`, `--proven` and
 *  `--min-seller-level` — no silent aliases: the removed flags error as
 *  unknown options. */
export function resolveTrustFlag(raw?: string): TrustRequirement {
  if (raw === undefined) {
    return 'open';
  }
  try {
    return parseTrustRequirement(raw);
  } catch {
    throw new Error(
      '--trust must be open (default), established, top or veteran.',
    );
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
    .description('Open — post the job to the public board with no seller picked (buyer); ESCROWS the budget on-chain now, first claim starts work. Reject on open work returns 100% to you (contract-locked) — junk delivery earns the seller nothing.')
    .requiredOption('--title <text>', "The job's public name (up to 80 chars)")
    .requiredOption('--brief <file-or-text>', 'What you want delivered — PUBLIC, every seller on the board reads it')
    .requiredOption('--max <usdc>', `Budget escrowed AT POST (max ${MAX_JOB_USDC})`)
    .option('--sla <duration>', 'Delivery window once claimed (e.g. 30m, 24h, 7d)', '24h')
    .option('--open-for <duration>', 'How long the posting stays claimable before it refunds', '24h')
    .option(
      '--trust <requirement>',
      `Who may claim: open (default — any active Agent ID) · established (reviews from ${PROVEN_MIN_REVIEWS}+ distinct buyers) · top (adds a 4.0★ average) · veteran (power-user floor); claiming stays instant and $0 under every gate (S.1209)`,
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        title: string;
        brief: string;
        max: string;
        sla: string;
        openFor: string;
        trust?: string;
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
          const trustRequirement = resolveTrustFlag(opts.trust);
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
            trustRequirement,
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
          if (trustRequirement !== 'open') {
            printInfo(
              `${trustRequirementLabel(minSellerLevelForTrustRequirement(trustRequirement))} — sellers below that effective tier cannot claim.`,
            );
          }
          printBlank();
          if (openingId) printKeyValue('Opening', openingId);
          printKeyValue('Tx', digest);
          printBlank();
          printInfo(
            'The first active seller to claim starts work immediately. No claim ' +
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
    .option('--limit <n>', 'Rows per page (default 24)', '24')
    .option('--offset <n>', 'Page start — feed a page\'s nextOffset back in', '0')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (query: string | undefined, opts: { status: string; limit: string; offset: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const offset = Number(opts.offset) || 0;
        // S.1156: ONE page with honest counts — the API says what it holds
        // (total / truncated / nextOffset); the CLI never invents a total.
        const page = await listOpenJobs(base, {
          status: opts.status as OpenJobRow['status'] & OpenJobRow['status'],
          query,
          limit: Number(opts.limit),
          offset,
        } as never);
        const rows = page.openJobs;
        if (isJsonMode()) {
          printJson(page);
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
        if (page.truncated) {
          printInfo(
            `Showing ${offset + 1}–${offset + rows.length} of ${page.total} ${opts.status} jobs`,
          );
          printBlank();
        }
        for (const row of rows) {
          // Surface the claim gate BEFORE anyone burns a claim attempt on it
          // — the S.1208 requirement chip covers policy + tier floor alike.
          const requirement = trustRequirementFromOpening(row);
          const gate = requirement !== 'Open' ? `  ${pc.magenta(requirement)}` : '';
          printLine(
            `  ${pc.bold(row.title ?? 'Untitled opening')}  ${pc.dim(`$${row.maxUsdc.toFixed(2)}`)}  ${statusColor(row.status)}${gate}` +
              (row.status === 'open' ? pc.dim(`  ${fmtLeft(row.openUntilMs)} left`) : ''),
          );
          // Board rows carry a one-line preview (S.1156), never the task —
          // the full brief is GET /v1/open-jobs/:id (`getOpenJob`).
          const preview = (row.briefPreview ?? '').replace(/\s+/g, ' ').trim();
          if (preview) {
            printLine(`    ${pc.dim(preview)}`);
          }
          printLine(`    ${pc.dim(row.id)}`);
          printBlank();
        }
        printInfo(
          'Claim one: t2 job claim <id> — the budget is already escrowed; claiming starts the job.',
        );
        if (page.nextOffset != null) {
          // The hint reproduces the page's own filters — following it must
          // land on the SAME board, not the default one.
          const flags = [
            ...(query ? [JSON.stringify(query)] : []),
            ...(opts.status !== 'open' ? [`--status ${opts.status}`] : []),
            ...(opts.limit !== '24' ? [`--limit ${opts.limit}`] : []),
            `--offset ${page.nextOffset}`,
          ];
          printInfo(`Next page: t2 job board ${flags.join(' ')}`);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('claim')
    .argument('<id>', 'The opening object id (0x…, from t2 job board)')
    .description('Claim an open job (seller) — first claim wins and the funded Job starts immediately')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (id: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        // Proven preflight (S.1054): refuse in English before the sponsored
        // rail instead of surfacing a raw Move abort. Best-effort — a
        // missing opening or unconfigured board falls through to the
        // server's own checks.
        const live = await getOpening(getSuiClient(), id.trim()).catch(() => null);
        if (live && A2A_SCORE_BOARD_ID) {
          // S.1192: one preflight covers all three gates — claim policy,
          // the active-job cap on the claimer's effective Level, and the
          // opening's Level floor. Best-effort: a read hiccup falls
          // through to the server's own checks.
          const score = await getAgentScore(getSuiClient(), agent.address()).catch(() => null);
          const pf = preflightClaimOpening(score, live);
          if (!pf.valid) {
            const have = score
              ? `${score.reviewCount} review${score.reviewCount === 1 ? '' : 's'} from ${score.distinctBuyers} distinct buyer${score.distinctBuyers === 1 ? '' : 's'}, ${score.averageStars}★ avg, ${score.activeSellerJobs} active claimed job${score.activeSellerJobs === 1 ? '' : 's'}`
              : 'no on-chain reviews yet';
            throw new Error(
              `${pf.error} Your wallet has ${have}. ` +
                'Find claimable work: t2 job board',
            );
          }
        }
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
