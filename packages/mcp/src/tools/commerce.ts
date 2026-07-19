import { createHash } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  fetchService,
  getJob,
  getJobSpec,
  getSuiClient,
  jobActionsFor,
  listServices,
  putJobSpec,
  validateAddress,
  MAX_JOB_USDC,
  type T2000,
} from '@t2000/sdk';
import { TxMutex } from '../mutex.js';
import { errorResult } from '../errors.js';

// t2 ACP commerce surface (SPEC_ACP_SUI) — the MCP mirror of `t2 service`,
// `t2 browse`, and `t2 job`. A SERVICE is a structured, fixed-price unit of
// deliverable work attached to this wallet's Agent ID (no server, no endpoint
// required to sell). A JOB is ONE shared Move object (`a2a_escrow::escrow::
// Job<USDC>`) holding the funds itself — no platform custody. Writes go
// through the sponsored rail (api.t2000.ai builds + co-pays gas; this wallet
// signs — Move enforces `sender == buyer/seller`, so sponsorship never
// weakens auth). Catalog mutations (services, reviews) are signed
// personal-message challenges, same construction as the CLI.

const API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

/** Challenge → sign `t2000-<kind>:{nonce}:{sha256(payload)}` → POST. */
async function signedMutation(opts: {
  agent: T2000;
  kind: 'agent-service' | 'job-review';
  url: string;
  body: (nonce: string, signature: string, payload: Record<string, unknown>) => Record<string, unknown>;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const address = opts.agent.address();
  const chRes = await fetch(`${API_BASE}/agent/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const challenge = (await chRes.json().catch(() => ({}))) as { nonce?: string };
  if (!challenge.nonce) throw new Error('Failed to get a challenge nonce.');
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(opts.payload), 'utf8')
    .digest('hex');
  const message = new TextEncoder().encode(
    `t2000-${opts.kind}:${challenge.nonce}:${payloadHash}`,
  );
  const { signature } = await opts.agent.signer.signPersonalMessage(message);
  const res = await fetch(opts.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts.body(challenge.nonce, signature, opts.payload)),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    throw new Error(
      typeof err === 'string' ? err : ((err as { message?: string })?.message ?? `HTTP ${res.status}`),
    );
  }
  return json;
}

/** Sponsored job verb: prepare (server builds tx) → sign → submit. */
async function sponsoredJobVerb(
  agent: T2000,
  action: 'create' | 'deliver' | 'release' | 'reject' | 'refund',
  params: Record<string, unknown>,
): Promise<{ digest?: string }> {
  const address = agent.address();
  const prepRes = await fetch(`${API_BASE}/job/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, action, params }),
  });
  const prep = (await prepRes.json().catch(() => ({}))) as {
    nonce?: string;
    txBytes?: string;
    error?: { message?: string } | string;
  };
  if (!prepRes.ok) {
    const msg = typeof prep.error === 'string' ? prep.error : (prep.error?.message ?? `HTTP ${prepRes.status}`);
    throw new Error(msg);
  }
  if (!(prep.nonce && prep.txBytes)) throw new Error('Failed to prepare the transaction.');
  const bytes = new Uint8Array(Buffer.from(prep.txBytes, 'base64'));
  const { signature } = await agent.signer.signTransaction(bytes);
  const subRes = await fetch(`${API_BASE}/job/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce: prep.nonce, address, signature }),
  });
  const sub = (await subRes.json().catch(() => ({}))) as { digest?: string; error?: { message?: string } | string };
  if (!subRes.ok) {
    const msg = typeof sub.error === 'string' ? sub.error : (sub.error?.message ?? `HTTP ${subRes.status}`);
    throw new Error(msg);
  }
  return { digest: sub.digest };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** `requirements` input: inline JSON object → object, anything else → trimmed text. */
function parseRequirements(input: string | undefined): unknown {
  if (input === undefined) return null;
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON — free text
  }
  return input.trim();
}

/** Wait for a job-create digest and pull the created Job object id. */
async function resolveJobId(digest: string | undefined): Promise<string | undefined> {
  if (!digest) return undefined;
  try {
    const client = getSuiClient();
    const result = await client.core.waitForTransaction({
      digest,
      include: { objectTypes: true },
      timeout: 15_000,
    });
    const txn = result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
    const types = txn.objectTypes ?? {};
    return Object.keys(types).find((id) => types[id]?.includes('::escrow::Job<'));
  } catch {
    return undefined; // best-effort — the digest is still returned
  }
}

/** One row from GET /v1/jobs — the indexed read-model of on-chain Jobs. */
interface IndexedJob {
  jobId: string;
  buyer: string;
  seller: string;
  amountUsdc: number;
  state: string;
  deliverByMs: number;
  deliveryHash: string | null;
}

export function registerCommerceTools(server: McpServer, agent: T2000): void {
  const mutex = new TxMutex();

  // ── Selling ──────────────────────────────────────────────────────────

  server.tool(
    't2000_service_create',
    "List (or update) a SERVICE under this wallet's Agent ID — a structured, fixed-price unit of deliverable work (name, USDC price, delivery SLA, what the buyer provides, what they get back). Buyers browse services and fund an on-chain USDC escrow Job against one; you deliver with t2000_job_deliver and the escrow settles to you (5% protocol fee). NO server or endpoint needed to sell. Re-run with the same slug to update. Requires an on-chain Agent ID (`t2 agent register`). Free — one signed message, no funds spent. Mirrors `t2 service create`.",
    {
      name: z.string().max(80).describe('Service name, e.g. "Sui market report" (max 80 chars)'),
      priceUsdc: z.number().min(0.01).max(50).describe('Fixed price in USDC (0.01–50)'),
      slaMinutes: z.number().int().positive().describe('Delivery SLA in minutes (e.g. 1440 = 24h) — the escrow refunds the buyer if you miss it'),
      description: z.string().max(2000).describe('What this service is — buyers see it on your profile (max 2000 chars)'),
      deliverable: z.string().max(1000).describe('What the buyer receives, e.g. "Markdown report, sources cited" (max 1000 chars)'),
      slug: z.string().optional().describe('Machine name (default: derived from name)'),
      requirements: z.string().optional().describe('What the buyer must provide — free text or a JSON schema string'),
      reviewWindowMinutes: z.number().int().positive().optional().describe("Buyer's accept/reject window after delivery (default 1440 = 24h)"),
      rejectSplitBps: z.number().int().min(0).max(10_000).optional().describe("Buyer's share in bps if they reject (default 8000 = 80/20 buyer-favored)"),
    },
    async ({ name, priceUsdc, slaMinutes, description, deliverable, slug, requirements, reviewWindowMinutes, rejectSplitBps }) => {
      try {
        const payload = {
          slug: (slug ?? slugify(name)).trim().toLowerCase(),
          name: name.trim(),
          description: description.trim(),
          priceUsdc,
          slaMinutes,
          reviewWindowMinutes: reviewWindowMinutes ?? 1440,
          rejectSplitBps: rejectSplitBps ?? 8000,
          requirements: parseRequirements(requirements),
          deliverable: deliverable.trim(),
        };
        await signedMutation({
          agent,
          kind: 'agent-service',
          url: `${API_BASE}/agent/service`,
          payload,
          body: (nonce, signature, p) => ({ address: agent.address(), nonce, signature, action: 'upsert', payload: p }),
        });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              ...payload,
              storefront: `https://agents.t2000.ai/${agent.address()}`,
              buyersRun: `t2 job create --agent ${agent.address()} --service ${payload.slug}`,
              watchInbox: 'Use t2000_jobs (role: seller) to see incoming jobs.',
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_service_retire',
    'Take one of your services off the board (soft-delete — already-funded jobs still settle on-chain). Re-create with the same slug to relist. Mirrors `t2 service retire <slug>`.',
    { slug: z.string().describe('The service slug to retire (see t2000_browse with your address)') },
    async ({ slug }) => {
      try {
        const payload = { slug: slug.trim().toLowerCase() };
        await signedMutation({
          agent,
          kind: 'agent-service',
          url: `${API_BASE}/agent/service`,
          payload,
          body: (nonce, signature, p) => ({ address: agent.address(), nonce, signature, action: 'retire', payload: p }),
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, retired: payload.slug }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_browse',
    "Browse agent SERVICES across the t2 agent economy — structured, fixed-price deliverable work other agents sell (hire them with t2000_job_create), or one agent's full catalog. No arguments = everything live. This is how you FIND WORK TO BUY; distinct from t2000_services (per-call MPP APIs). Mirrors `t2 browse` / `t2 service list`.",
    {
      query: z.string().optional().describe('Free-text search across service names/descriptions (omit for all)'),
      agent: z.string().optional().describe("One agent's Sui address — their catalog, retired included (e.g. your own to check your listings)"),
    },
    async ({ query, agent: agentAddr }) => {
      try {
        const result = await listServices(API_BASE, {
          agent: agentAddr ? validateAddress(agentAddr) : undefined,
          query,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ── Jobs (buying + the escrow lifecycle) ─────────────────────────────

  server.tool(
    't2000_job_create',
    `HIRE an agent: create + fund an on-chain USDC escrow Job in one sponsored transaction (buyer side). THIS SPENDS FUNDS — the price is locked in the Job object until settlement. Two modes:
1. SERVICE mode (preferred): pass agent + service (a slug from t2000_browse) + requirements. Price/SLA/terms come from the listing.
2. DIRECT mode: pass seller + amountUsdc + spec (your brief; stored content-addressed, sha256 pinned on-chain) + optional deadline/review/split terms.
The escrow protects both sides: no delivery by the deadline → anyone can refund the buyer; delivery + lapsed review window → anyone can release to the seller. Max ${MAX_JOB_USDC} USDC. Mirrors \`t2 job create\`.`,
    {
      agent: z.string().optional().describe("SERVICE mode: the seller's agent address"),
      service: z.string().optional().describe('SERVICE mode: the service slug'),
      requirements: z.string().optional().describe('SERVICE mode: what the seller asked buyers to provide — JSON string or free text'),
      seller: z.string().optional().describe("DIRECT mode: the seller's Sui address"),
      amountUsdc: z.number().positive().max(MAX_JOB_USDC).optional().describe('DIRECT mode: USDC to escrow'),
      spec: z.string().optional().describe('DIRECT mode: the job brief (stored content-addressed; its sha256 goes on-chain)'),
      deadlineMinutes: z.number().int().positive().optional().describe('DIRECT mode: time the seller has to deliver (default 1440 = 24h)'),
      reviewWindowMinutes: z.number().int().positive().optional().describe('DIRECT mode: your accept/reject window after delivery (default 1440)'),
      rejectSplitBps: z.number().int().min(0).max(10_000).optional().describe('DIRECT mode: your share in bps if you reject (default 8000)'),
    },
    async (input) => {
      try {
        const buyer = agent.address();
        let params: Record<string, unknown>;
        let serviceSlug: string | undefined;

        if (input.service || input.agent) {
          if (!(input.service && input.agent)) {
            throw new Error('agent and service go together (service mode).');
          }
          const sellerAgent = validateAddress(input.agent);
          const service = await fetchService(API_BASE, sellerAgent, input.service);
          serviceSlug = service.slug;
          const requirements = parseRequirements(input.requirements);
          if (service.requirements != null && requirements == null) {
            const want = typeof service.requirements === 'string'
              ? service.requirements
              : `JSON matching: ${JSON.stringify(service.requirements)}`;
            throw new Error(`This service needs requirements. The seller asks for: ${want}`);
          }
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
          params = {
            seller: service.agent,
            amountUsdc: service.priceUsdc,
            specHash: `0x${await putJobSpec(API_BASE, spec)}`,
            deliverByMs: Date.now() + service.slaMinutes * 60_000,
            reviewWindowMs: service.reviewWindowMinutes * 60_000,
            rejectSplitBps: service.rejectSplitBps,
          };
        } else {
          if (!(input.seller && input.amountUsdc && input.spec)) {
            throw new Error('Provide seller + amountUsdc + spec (direct mode) or agent + service (buy a listing).');
          }
          params = {
            seller: validateAddress(input.seller),
            amountUsdc: input.amountUsdc,
            specHash: `0x${await putJobSpec(API_BASE, input.spec)}`,
            deliverByMs: Date.now() + (input.deadlineMinutes ?? 1440) * 60_000,
            reviewWindowMs: (input.reviewWindowMinutes ?? 1440) * 60_000,
            rejectSplitBps: input.rejectSplitBps ?? 8000,
          };
        }

        const { digest } = await mutex.run(() => sponsoredJobVerb(agent, 'create', params));
        const jobId = await resolveJobId(digest);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              jobId,
              digest,
              buyer,
              ...params,
              ...(serviceSlug ? { service: serviceSlug } : {}),
              next: 'Track it with t2000_jobs. When the seller delivers, accept with t2000_job_settle (release) or reject within the review window.',
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_jobs',
    "Escrow-job status. With jobId → the on-chain Job (state, parties, amount, deadlines), the actions THIS wallet can take right now, the buyer's spec/requirements (content-verified against the on-chain hash), and — once delivered — the delivery content. Without jobId → this wallet's job inbox from the indexer (role: seller = jobs you were hired for, buyer = jobs you funded). Read-only. Mirrors `t2 job watch [--mine]` + `t2 job spec`.",
    {
      jobId: z.string().optional().describe('A Job object id (0x…) for full detail (omit to list your jobs)'),
      role: z.enum(['seller', 'buyer']).optional().describe('Inbox mode: which side of the table (default seller)'),
    },
    async ({ jobId, role }) => {
      try {
        const me = agent.address();
        if (jobId) {
          const client = getSuiClient();
          const job = await getJob(client, validateAddress(jobId));
          const actions = jobActionsFor(job, me);
          let spec: string | null = null;
          try {
            spec = await getJobSpec(API_BASE, job.specHash);
          } catch {
            spec = null; // direct jobs may have an out-of-band spec (hash-only)
          }
          let delivery: string | null = null;
          if (job.deliveryHash) {
            try {
              delivery = await getJobSpec(API_BASE, job.deliveryHash);
            } catch {
              delivery = null; // hash-only delivery — artifact handed over off-chain
            }
          }
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ job, yourAddress: me, yourActions: actions, spec, delivery }),
            }],
          };
        }
        const key = role === 'buyer' ? 'buyer' : 'seller';
        const res = await fetch(`${API_BASE}/jobs?${key}=${encodeURIComponent(me)}&limit=100`);
        if (!res.ok) throw new Error(`Job index lookup failed (${res.status})`);
        const data = (await res.json()) as { jobs?: IndexedJob[] };
        const jobs = data.jobs ?? [];
        const open = jobs.filter((j) => !['released', 'rejected', 'refunded'].includes(j.state));
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ role: key, address: me, total: jobs.length, open: open.length, jobs }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_job_deliver',
    "Post your DELIVERY on a funded job you're selling (seller side, before the deadline). The delivery content is stored content-addressed and its sha256 is pinned to the Job object on-chain — the buyer verifies what they read is exactly what you delivered. Opens the buyer's review window. Sponsored (no gas). Mirrors `t2 job deliver`.",
    {
      jobId: z.string().describe('The Job object id (0x…) — see t2000_jobs (role: seller)'),
      delivery: z.string().describe('The delivery content itself (e.g. the report markdown). Stored + hash-pinned on-chain.'),
    },
    async ({ jobId, delivery }) => {
      try {
        const deliveryHash = `0x${await putJobSpec(API_BASE, delivery)}`;
        const { digest } = await mutex.run(() =>
          sponsoredJobVerb(agent, 'deliver', { jobId: validateAddress(jobId), deliveryHash }),
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              jobId,
              deliveryHash,
              digest,
              next: "The buyer's review window is open. If they neither accept nor reject before it closes, anyone (including you) can settle with t2000_job_settle (release).",
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_job_settle',
    `Settle an escrow job — MOVES THE ESCROWED FUNDS:
- release: accept the delivery → funds to the seller (buyer; or ANYONE once the review window lapses — the anti-ghosting crank)
- reject: within the review window → funds split per the terms agreed at create (buyer only)
- refund: no delivery by the deadline → funds back to the buyer (anyone may crank)
Check t2000_jobs first — it tells you which of these THIS wallet can run right now. Sponsored (no gas). Mirrors \`t2 job release|reject|refund\`.`,
    {
      jobId: z.string().describe('The Job object id (0x…)'),
      action: z.enum(['release', 'reject', 'refund']).describe('Which settlement to run'),
    },
    async ({ jobId, action }) => {
      try {
        const { digest } = await mutex.run(() =>
          sponsoredJobVerb(agent, action, { jobId: validateAddress(jobId) }),
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              jobId,
              action,
              digest,
              ...(action === 'release'
                ? { next: "Rate the work with t2000_job_review — it builds the seller's on-chain-backed reputation." }
                : {}),
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_job_review',
    'Rate a RELEASED job you paid for, 1–5 stars — receipt-bound to the Job object, shown on the seller\'s public profile (agents.t2000.ai). Re-run to edit. Free — one signed message, no funds spent. Mirrors `t2 job review`.',
    {
      jobId: z.string().describe('The Job object id (0x…) of a released job this wallet funded'),
      stars: z.number().int().min(1).max(5).describe('1 (poor) to 5 (excellent)'),
      text: z.string().max(400).optional().describe('Optional short review (max 400 chars)'),
    },
    async ({ jobId, stars, text }) => {
      try {
        const payload = {
          jobId: validateAddress(jobId),
          stars,
          text: text?.trim() || null,
        };
        const response = await signedMutation({
          agent,
          kind: 'job-review',
          url: `${API_BASE}/job/review`,
          payload,
          body: (nonce, signature, p) => ({ address: agent.address(), nonce, signature, payload: p }),
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, ...response }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
