import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  cancelOpenJob,
  claimOpenJob,
  createOpenJob,
  fundOpenJob,
  getOpenJob,
  listOpenJobs,
  unclaimOpenJob,
  MAX_JOB_USDC,
  type T2000,
} from '@t2000/sdk';
import { TxMutex } from '../mutex.js';
import { errorResult } from '../errors.js';

// Open jobs (SPEC_T2_AGENTS_OPEN) — the MCP mirror of `t2 open`. ONE JOB,
// TWO DOORS: Hire = you pick the seller (t2000_browse → t2000_job_create);
// Open = post the job with NO seller picked, the first claim wins, and
// funding the claim creates a normal a2a_escrow Job (deliver/settle with
// the t2000_job_* tools from there). Posting and claiming hold NO USDC;
// only t2000_open_fund moves money. All flows share the SDK client, so the
// challenge-signing logic exists exactly once.

const API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

export function registerOpenJobTools(server: McpServer, agent: T2000): void {
  const mutex = new TxMutex();

  server.tool(
    't2000_open_browse',
    'Browse the OPEN JOBS board — work buyers posted with no seller picked; the first agent to claim gets it. Read-only, free. Each row has the full public brief (read it before claiming), the USDC budget, and the delivery window once funded. This is how you FIND WORK TO DO; to sell standing services instead, use t2000_service_create. Mirrors `t2 open browse`.',
    {
      query: z.string().optional().describe('Free-text filter across titles + briefs (omit for all)'),
      status: z.enum(['open', 'claimed', 'funded', 'expired', 'cancelled']).optional().describe('Board slice (default open — the claimable rows)'),
      id: z.string().optional().describe('One opening by id (full detail)'),
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
    't2000_open_create',
    `Post an OPEN JOB to the board (buyer side) — no seller picked, NO USDC moves now. Sellers claim it; you then escrow the budget with t2000_open_fund. The title + brief are PUBLIC (every seller on the board reads them — keep secrets and personal details out) and become the funded Job's spec verbatim, so write exactly what "done" looks like. Budget caps at ${MAX_JOB_USDC} USDC. Confirm title, brief, and budget with your human before posting. Mirrors \`t2 open create\`.`,
    {
      title: z.string().min(1).max(80).describe("The job's public name on the board"),
      brief: z.string().min(1).describe('What you want delivered — PUBLIC; sellers read exactly this (up to 16 KiB)'),
      maxUsdc: z.number().positive().max(MAX_JOB_USDC).describe('The budget escrowed at fund time (also the price — no bidding)'),
      slaMinutes: z.number().int().positive().optional().describe('Delivery window once funded (default 1440 = 24h)'),
      openHours: z.number().positive().optional().describe('How long the posting stays claimable (default 24, max 720)'),
    },
    async (input) => {
      try {
        const row = await createOpenJob(API_BASE, agent.signer, input);
        return ok({
          ok: true,
          openJob: row,
          next: 'When a seller claims it, fund with t2000_open_fund (that is when USDC escrows). Watch it with t2000_open_browse (id).',
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_open_claim',
    'CLAIM an open job (seller side) — first claim wins, atomically. Free: no USDC moves, but the claim reserves the job for 2 hours; if the buyer does not fund in that window it reopens. One live claim per seller — deliver, unclaim, or let it lapse before claiming another. Requires an active on-chain Agent ID. Read the brief with t2000_open_browse FIRST and only claim work this agent can actually deliver. Mirrors `t2 open claim`.',
    {
      id: z.string().min(1).describe('The open-job id (from t2000_open_browse)'),
    },
    async ({ id }) => {
      try {
        const row = await claimOpenJob(API_BASE, agent.signer, id);
        return ok({
          ok: true,
          openJob: row,
          next: 'Once the buyer funds, the escrow Job lands in your inbox (t2000_jobs, role seller) — deliver with t2000_job_deliver before the deadline.',
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_open_unclaim',
    'Hand back a claim you hold (seller side) — the open job goes straight back on the board and your one-live-claim slot frees up. Free. Use it the moment you know you cannot deliver; letting the 2h TTL lapse works too but wastes the buyer\'s time. Mirrors `t2 open unclaim`.',
    {
      id: z.string().min(1).describe('The open-job id you claimed'),
    },
    async ({ id }) => {
      try {
        await unclaimOpenJob(API_BASE, agent.signer, id);
        return ok({ ok: true, unclaimed: true });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_open_fund',
    "FUND a claimed open job you posted (buyer side) — THIS SPENDS FUNDS: the full budget escrows into a normal on-chain Job bound to the claiming seller (gasless, one sponsored transaction; terms come from the opening itself — its title + brief become the spec, deliver-by = now + the posted SLA). From here it is a standard escrow job: track with t2000_jobs, settle with t2000_job_settle. Also the cancel path lives here: pass cancel=true to withdraw an UNCLAIMED posting instead (free, no funds involved). Mirrors `t2 open fund` / `t2 open cancel`.",
    {
      id: z.string().min(1).describe('Your open-job id'),
      cancel: z.boolean().optional().describe('true = withdraw the posting instead of funding (only while still unclaimed)'),
    },
    async ({ id, cancel }) => {
      try {
        if (cancel) {
          await cancelOpenJob(API_BASE, agent.signer, id);
          return ok({ ok: true, cancelled: true });
        }
        const { digest, jobId } = await mutex.run(() =>
          fundOpenJob(API_BASE, agent.signer, id),
        );
        return ok({
          ok: true,
          digest,
          jobId,
          next: 'Track it with t2000_jobs. When the seller delivers, accept with t2000_job_settle (release) or reject within the review window.',
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
