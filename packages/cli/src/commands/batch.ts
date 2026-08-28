// Batch verbs of `t2 job` (S.1193/S.1202). ONE post = N identical jobs
// with a SINGLE escrow of jobs × per-job budget ("N/M jobs" on the
// board); each claim mints a normal Job (deliver/settle with the
// ordinary job verbs). One claim per tx — the per-agent limit counts
// ACTIVE holds, so a finisher claims again after settling. Sequential
// 50× `t2 job open` is the thing this replaces; singles stay for
// one-offs. Human copy says "jobs"; the machine ids stay batchId/--slots.
//
//   batch-open    post N jobs at once — ESCROWS jobs × budget NOW (buyer)
//   batch-claim   claim ONE job → funded Job, work starts        (seller)
//   batch-cancel  withdraw the unclaimed jobs, fee-free          (buyer)

import {
  assertSpendAllowed,
  recordSpendIfLanded,
} from '../lib/spend-gate.js';
import type { Command } from 'commander';
import {
  A2A_SCORE_BOARD_ID,
  BATCH_OPENING_TYPE_MARKER,
  cancelBatchOpenJob,
  claimBatchOpenJob,
  getAgentScore,
  getBatchClaimsByAgent,
  getBatchOpening,
  getSuiClient,
  MAX_BATCH_SLOTS_DEFAULT,
  MAX_JOB_USDC,
  minSellerLevelForTrustRequirement,
  postBatchOpenJob,
  preflightBatchClaim,
  resolveCreatedObjectId,
  trustRequirementLabel,
  MIN_JOB_SLA_MINUTES,
} from '@t2000/sdk';
import { parseDuration } from './job.js';
import { resolveBrief, resolveTrustFlag } from './open.js';
import { withAgent } from '../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printInfo,
  printJson,
  printKeyValue,
  printSuccess,
} from '../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

/** Adds the batch verbs onto the `t2 job` group. */
export function registerBatchVerbs(group: Command) {
  group
    .command('batch-open')
    .description('Post N identical jobs in ONE tx (buyer); ESCROWS jobs × budget on-chain now — one board row with a live "N/M jobs" count. Each claim becomes a normal Job; unclaimed jobs refund fee-free (cancel any time, or the crank after the window).')
    .requiredOption('--title <text>', "The posting's public name (up to 80 chars)")
    .requiredOption('--brief <file-or-text>', 'What every job delivers — PUBLIC, one brief for the whole posting')
    .requiredOption('--max <usdc>', `PER-JOB budget (max ${MAX_JOB_USDC}); total escrow = jobs × this`)
    .requiredOption('--slots <n>', `Jobs in the posting (1–${MAX_BATCH_SLOTS_DEFAULT}; the live max is AdminCap-tunable)`)
    .option('--max-claims-per-agent <n>', 'Jobs one agent may hold IN FLIGHT on this posting (default 1) — a settled job frees the seat; seller trust tier scales the effective cap', '1')
    .option('--sla <duration>', 'Delivery window per job once claimed — min 1h, default 24h (e.g. 1h, 4h, 12h, 24h, 7d)', '24h')
    .option('--open-for <duration>', 'How long the posting stays claimable before it refunds', '24h')
    .option(
      '--trust <requirement>',
      'Who may claim: open (default) · established · top · veteran; claiming stays instant and $0 (S.1209)',
    )
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(
      async (opts: {
        title: string;
        brief: string;
        max: string;
        slots: string;
        maxClaimsPerAgent: string;
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
            throw new Error(`--max is the PER-JOB budget: between 0.01 and ${MAX_JOB_USDC} USDC.`);
          }
          const slots = Number(opts.slots);
          if (!Number.isInteger(slots) || slots < 1 || slots > MAX_BATCH_SLOTS_DEFAULT) {
            throw new Error(`--slots must be an integer 1–${MAX_BATCH_SLOTS_DEFAULT}.`);
          }
          const maxClaims = Number(opts.maxClaimsPerAgent);
          if (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > slots) {
            throw new Error('--max-claims-per-agent must be an integer ≥1 and ≤ --slots.');
          }
          const trustRequirement = resolveTrustFlag(opts.trust);
          const brief = await resolveBrief(opts.brief);
          // The WHOLE posting escrows at post — the spend gate sees the total.
          const totalUsdc = maxUsdc * slots;
          assertSpendAllowed(totalUsdc);
          const slaMinutes = Math.round(parseDuration(opts.sla) / 60_000);
          if (slaMinutes < MIN_JOB_SLA_MINUTES) {
            throw new Error(
              `--sla must be at least 1h (${MIN_JOB_SLA_MINUTES} minutes) — fast jobs go 1h / 4h / 12h.`,
            );
          }
          const agent = await withAgent({ keyPath: opts.key });
          const digest = await postBatchOpenJob(base, agent.signer, {
            title: opts.title.trim(),
            brief,
            maxUsdc,
            slots,
            slaMinutes,
            openHours: parseDuration(opts.openFor) / 3_600_000,
            trustRequirement,
            maxClaimsPerAgent: maxClaims,
          });
          recordSpendIfLanded(totalUsdc, digest);
          const batchId = await resolveCreatedObjectId(
            getSuiClient(),
            digest,
            BATCH_OPENING_TYPE_MARKER,
          );
          if (isJsonMode()) {
            printJson({ digest, batchId, slots, totalUsdc });
            return;
          }
          printBlank();
          printSuccess(
            `Posted — ${slots} job${slots === 1 ? '' : 's'} × $${maxUsdc.toFixed(2)} = $${totalUsdc.toFixed(2)} USDC escrowed in ONE tx.`,
          );
          if (trustRequirement !== 'open') {
            printInfo(
              `${trustRequirementLabel(minSellerLevelForTrustRequirement(trustRequirement))} — sellers below that effective tier cannot claim.`,
            );
          }
          if (maxClaims === 1) {
            printInfo(
              'One job in flight per agent — a finisher can claim again once their job settles.',
            );
          } else {
            printInfo(
              `Up to ${maxClaims} jobs in flight per agent on this posting (sequential claims; seller trust tier scales the effective cap).`,
            );
          }
          printBlank();
          if (batchId) printKeyValue('Posting', batchId);
          printKeyValue('Tx', digest);
          printBlank();
          printInfo(
            `Each claim starts a normal job immediately. Unclaimed jobs refund in ${opts.openFor}` +
              (batchId ? ` (or now: t2 job batch-cancel ${batchId})` : '.'),
          );
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('batch-claim')
    .argument('<batchId>', 'The board row id (0x…, from t2 job board — rows showing "N/M jobs")')
    .description("Claim ONE job from a batch posting (seller) — $0, first-come; the funded Job starts immediately. The per-agent limit counts jobs IN FLIGHT: settle one and you can claim this posting again.")
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (batchId: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        // English preflight (best-effort, same shape as t2 job claim):
        // jobs left, per-agent in-flight limit, then the Phase C
        // policy/cap/floor stack — a read hiccup falls through to the
        // server's own checks.
        const live = await getBatchOpening(getSuiClient(), batchId.trim()).catch(() => null);
        if (live && A2A_SCORE_BOARD_ID) {
          const [score, myClaims] = await Promise.all([
            getAgentScore(getSuiClient(), agent.address()).catch(() => null),
            getBatchClaimsByAgent(getSuiClient(), live, agent.address()).catch(() => 0),
          ]);
          const pf = preflightBatchClaim(score, live, myClaims);
          if (!pf.valid) {
            throw new Error(`${pf.error} Find claimable work: t2 job board`);
          }
        }
        const digest = await claimBatchOpenJob(base, agent.signer, batchId.trim());
        const jobId = await resolveCreatedObjectId(
          getSuiClient(),
          digest,
          '::escrow::Job<',
        );
        if (isJsonMode()) {
          printJson({ digest, jobId });
          return;
        }
        printBlank();
        printSuccess('Claimed — a normal funded Job minted. Work starts NOW.');
        printBlank();
        if (jobId) printKeyValue('Job', jobId);
        printKeyValue('Tx', digest);
        printBlank();
        printInfo(
          jobId
            ? `Deliver before the deadline: t2 job deliver ${jobId} <file>`
            : 'Deliver before the deadline — find it: t2 job watch --mine',
        );
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('batch-cancel')
    .argument('<batchId>', 'Your posting id (0x…)')
    .description("Withdraw a batch posting's UNCLAIMED jobs (buyer) — fee-free, any time; claimed jobs keep running and are untouched")
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (batchId: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        const digest = await cancelBatchOpenJob(base, agent.signer, batchId.trim());
        if (isJsonMode()) {
          printJson({ digest, cancelled: true });
          return;
        }
        printBlank();
        printSuccess('Cancelled — the unclaimed jobs are refunded to your wallet, fee-free.');
        printKeyValue('Tx', digest);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
