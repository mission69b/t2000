import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  cancelOpenJob,
  claimOpenJob,
  getOpenJob,
  getSuiClient,
  listOpenJobs,
  postOpenJob,
  MAX_JOB_USDC,
  type T2000,
} from '@t2000/sdk';
import { TxMutex } from '../mutex.js';
import { errorResult } from '../errors.js';

// Open jobs (SPEC_T2_AGENTS_OPEN_ONCHAIN — escrow-at-post) — the MCP
// mirror of the `t2 job` open verbs. ONE JOB, TWO DOORS: Hire = you pick
// the ASP (t2000_browse → t2000_job_hire); Open = post the job with NO ASP
// picked — THE BUDGET ESCROWS ON-CHAIN AT POST. The first active
// registered ASP to claim mints the funded a2a_escrow Job on the spot
// (work starts immediately; deliver/settle with the t2000_job_* tools).
// Unclaimed openings refund fee-free via t2000_job_cancel (buyer) or the
// permissionless crank after the open window. All writes ride the
// sponsored rail — gasless, authorized on the wallet's own signature.

const API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

/** Best-effort: created object id (Opening or Job) from a digest. */
async function resolveCreated(
  digest: string,
  marker: '::opening::Opening<' | '::escrow::Job<',
): Promise<string | undefined> {
  try {
    const client = getSuiClient();
    const result = await client.core.waitForTransaction({
      digest,
      include: { objectTypes: true },
      timeout: 15_000,
    });
    const txn =
      result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
    const types = txn.objectTypes ?? {};
    return Object.keys(types).find((id) => types[id]?.includes(marker));
  } catch {
    return undefined;
  }
}

export function registerOpenJobTools(server: McpServer, agent: T2000): void {
  const mutex = new TxMutex();

  server.tool(
    't2000_job_board',
    'Browse the OPEN JOBS board — work buyers posted with no ASP picked, with the budget ALREADY escrowed on-chain; the first active agent to claim gets the funded job. Read-only, free. Each row has the full public brief (read it before claiming), the escrowed USDC budget, and the delivery window a claim starts. This is how you FIND WORK TO DO; to sell standing services instead, use t2000_service_create. Mirrors `t2 job board`.',
    {
      query: z.string().optional().describe('Free-text filter across titles + briefs (omit for all)'),
      status: z.enum(['open', 'claimed', 'cancelled', 'refunded']).optional().describe('Board slice (default open — the claimable rows)'),
      id: z.string().optional().describe('One opening by object id (full detail)'),
    },
    async ({ query, status, id }) => {
      try {
        if (id) {
          return ok({ openJob: await getOpenJob(API_BASE, id) });
        }
        const rows = await listOpenJobs(API_BASE, {
          status: status ?? 'open',
          query,
          limit: 48,
        });
        return ok({
          total: rows.length,
          openJobs: rows,
          ...(rows.length === 0 && (status ?? 'open') === 'open'
            ? { hint: 'Nothing on the board right now — check back, or find work to BUY with t2000_browse.' }
            : {}),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_job_open',
    `Post an OPEN JOB to the board (buyer side) — no ASP picked. THIS SPENDS FUNDS NOW: the full budget escrows on-chain in the posting itself (a shared Opening). The first active registered ASP to claim mints the funded Job immediately and work starts — there is no approve/fund step after posting, and no ASP veto. The title + brief are PUBLIC (every ASP reads them; they become the funded Job's spec verbatim), so write exactly what "done" looks like and keep secrets out. Nobody claims in openHours → full fee-free refund (t2000_job_cancel any time before a claim). Budget caps at ${MAX_JOB_USDC} USDC. Confirm title, brief, and budget with your human BEFORE posting. Mirrors \`t2 job open\`.`,
    {
      title: z.string().min(1).max(80).describe("The job's public name on the board"),
      brief: z.string().min(1).describe('What you want delivered — PUBLIC; ASPs read exactly this (up to 16 KiB)'),
      maxUsdc: z.number().positive().max(MAX_JOB_USDC).describe('The budget — escrows ON-CHAIN at post (also the price; no bidding)'),
      slaMinutes: z.number().int().positive().optional().describe('Delivery window once claimed (default 1440 = 24h)'),
      openHours: z.number().positive().optional().describe('How long the posting stays claimable before auto-refund (default 24, max 720)'),
    },
    async (input) => {
      try {
        const digest = await mutex.run(() =>
          postOpenJob(API_BASE, agent.signer, input),
        );
        const openingId = await resolveCreated(digest, '::opening::Opening<');
        return ok({
          ok: true,
          digest,
          openingId,
          next: 'The budget is escrowed. Watch for a claim with t2000_job_board (id) — the claim itself starts the funded Job (track with t2000_jobs). Changed your mind before a claim? t2000_job_cancel refunds in full.',
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_job_claim',
    'CLAIM an open job (ASP side) — first claim wins ON-CHAIN and mints the funded escrow Job immediately: claiming IS starting the job, with the budget already escrowed and your delivery clock running (deliver-by = now + the posted SLA). Free to call (gasless), but it is a COMMITMENT — miss the deadline and the escrow refunds the buyer. Requires an active on-chain Agent ID. Read the brief with t2000_job_board FIRST and only claim work this agent can actually deliver. Mirrors `t2 job claim`.',
    {
      id: z.string().min(1).describe('The opening object id (0x…, from t2000_job_board)'),
    },
    async ({ id }) => {
      try {
        const digest = await mutex.run(() =>
          claimOpenJob(API_BASE, agent.signer, id),
        );
        const jobId = await resolveCreated(digest, '::escrow::Job<');
        return ok({
          ok: true,
          digest,
          openingId: id,
          jobId,
          note: 'One job, two objects: the claim consumed the Opening and minted the Job — use the jobId from here on.',
          next: 'The funded Job is yours — deliver with t2000_job_deliver before the deadline (track with t2000_jobs, role seller).',
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_job_cancel',
    'Withdraw an UNCLAIMED open job you posted (buyer side) — the full escrowed budget returns to this wallet, fee-free. Works any time before an ASP claims (after a claim the job is running; settle it with the normal job verbs). Mirrors `t2 job cancel`.',
    {
      id: z.string().min(1).describe('Your opening object id (0x…)'),
    },
    async ({ id }) => {
      try {
        const digest = await mutex.run(() =>
          cancelOpenJob(API_BASE, agent.signer, id),
        );
        return ok({ ok: true, digest, cancelled: true });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
