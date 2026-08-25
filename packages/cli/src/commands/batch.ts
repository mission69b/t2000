// Batch (wave) verbs of `t2 job` (S.1193 — Phase D). ONE post = N
// homogeneous slots with a SINGLE escrow of slots × per-slot budget; each
// claimed slot mints a normal Job (deliver/settle with the ordinary job
// verbs). One claim per tx (v1 lock) — a wave allowing more claims per
// agent means running batch-claim again. Sequential 50× `t2 job open`
// is the thing this replaces; singles stay for one-offs.
//
//   batch-open    post a wave — ESCROWS slots × budget NOW    (buyer)
//   batch-claim   claim ONE slot → funded Job, work starts    (seller)
//   batch-cancel  withdraw the unclaimed remainder, fee-free  (buyer)

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
  claimPolicyLabel,
  claimPolicyRequirement,
  getAgentScore,
  getBatchClaimsByAgent,
  getBatchOpening,
  getSuiClient,
  MAX_BATCH_SLOTS_DEFAULT,
  MAX_JOB_USDC,
  OPENING_CLAIM_POLICY_ANY_ACTIVE,
  postBatchOpenJob,
  preflightBatchClaim,
  resolveCreatedObjectId,
  sellerLevelLabel,
} from '@t2000/sdk';
import { parseDuration } from './job.js';
import {
  resolveBrief,
  resolveClaimPolicyFlags,
  resolveMinSellerLevelFlag,
} from './open.js';
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
    .description('Batch — post ONE wave of N identical slots (buyer); ESCROWS slots × budget on-chain now. Each claimed slot becomes a normal Job; the unclaimed remainder refunds fee-free (cancel any time, or the crank after the window).')
    .requiredOption('--title <text>', "The wave's public name (up to 80 chars)")
    .requiredOption('--brief <file-or-text>', 'What every slot delivers — PUBLIC, one brief for the whole wave')
    .requiredOption('--max <usdc>', `PER-SLOT budget (max ${MAX_JOB_USDC}); total escrow = slots × this`)
    .requiredOption('--slots <n>', `Slots in the wave (1–${MAX_BATCH_SLOTS_DEFAULT}; the live max is AdminCap-tunable)`)
    .option('--max-claims-per-agent <n>', 'Slots one agent may claim of THIS wave (default 1)', '1')
    .option('--sla <duration>', 'Delivery window per slot once claimed (e.g. 30m, 24h, 7d)', '24h')
    .option('--open-for <duration>', 'How long the wave stays claimable before it refunds', '24h')
    .option(
      '--claim-policy <policy>',
      'Who may claim: 0 Anyone (default) · 1 Proven · 2 Proven · 4★+; claiming stays instant and $0',
    )
    .option(
      '--min-seller-level <level>',
      'Minimum seller Level to claim: 1–4 (default none) — independent of --claim-policy',
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
        claimPolicy?: string;
        minSellerLevel?: string;
        key?: string;
        api?: string;
      }) => {
        try {
          const base = opts.api ?? DEFAULT_API_BASE;
          const maxUsdc = Number(opts.max);
          if (!Number.isFinite(maxUsdc) || maxUsdc <= 0 || maxUsdc > MAX_JOB_USDC) {
            throw new Error(`--max is the PER-SLOT budget: between 0.01 and ${MAX_JOB_USDC} USDC.`);
          }
          const slots = Number(opts.slots);
          if (!Number.isInteger(slots) || slots < 1 || slots > MAX_BATCH_SLOTS_DEFAULT) {
            throw new Error(`--slots must be an integer 1–${MAX_BATCH_SLOTS_DEFAULT}.`);
          }
          const maxClaims = Number(opts.maxClaimsPerAgent);
          if (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > slots) {
            throw new Error('--max-claims-per-agent must be an integer ≥1 and ≤ --slots.');
          }
          const claimPolicy = resolveClaimPolicyFlags(opts);
          const minSellerLevel = resolveMinSellerLevelFlag(opts.minSellerLevel);
          const brief = await resolveBrief(opts.brief);
          // The WHOLE wave escrows at post — the spend gate sees the total.
          const totalUsdc = maxUsdc * slots;
          assertSpendAllowed(totalUsdc);
          const agent = await withAgent({ keyPath: opts.key });
          const digest = await postBatchOpenJob(base, agent.signer, {
            title: opts.title.trim(),
            brief,
            maxUsdc,
            slots,
            slaMinutes: Math.round(parseDuration(opts.sla) / 60_000),
            openHours: parseDuration(opts.openFor) / 3_600_000,
            claimPolicy,
            ...(minSellerLevel > 0 ? { minSellerLevel } : {}),
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
            `Wave posted — ${slots} slot${slots === 1 ? '' : 's'} × $${maxUsdc.toFixed(2)} = $${totalUsdc.toFixed(2)} USDC escrowed in ONE tx.`,
          );
          if (claimPolicy !== OPENING_CLAIM_POLICY_ANY_ACTIVE) {
            printInfo(
              `${claimPolicyLabel(claimPolicy)} gate on: ${claimPolicyRequirement(claimPolicy)}`,
            );
          }
          if (minSellerLevel > 0) {
            printInfo(`${sellerLevelLabel(minSellerLevel)}+ floor on.`);
          }
          if (maxClaims === 1) {
            printInfo('One slot per agent — a hunter cannot hoard this wave.');
          } else {
            printInfo(`Up to ${maxClaims} slots per agent (sequential claims).`);
          }
          printBlank();
          if (batchId) printKeyValue('Batch', batchId);
          printKeyValue('Tx', digest);
          printBlank();
          printInfo(
            `Each claim starts a normal job immediately. Unclaimed slots refund in ${opts.openFor}` +
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
    .argument('<batchId>', 'The batch object id (0x…, from t2 job board)')
    .description('Claim ONE slot of a wave (seller) — $0, first-come; the funded Job starts immediately. Claim again for another slot when the wave allows more than one per agent.')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`)
    .action(async (batchId: string, opts: { key?: string; api?: string }) => {
      try {
        const base = opts.api ?? DEFAULT_API_BASE;
        const agent = await withAgent({ keyPath: opts.key });
        // English preflight (best-effort, same shape as t2 job claim):
        // slots, per-agent wave limit, then the Phase C policy/cap/floor
        // stack — a read hiccup falls through to the server's own checks.
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
        printSuccess('Slot claimed — a normal funded Job minted. Work starts NOW.');
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
    .argument('<batchId>', 'Your batch object id (0x…)')
    .description("Withdraw a wave's UNCLAIMED remainder (buyer) — fee-free, any time; claimed slots are running Jobs and are untouched")
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
        printSuccess('Cancelled — the unclaimed remainder is back in your wallet, fee-free.');
        printKeyValue('Tx', digest);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
