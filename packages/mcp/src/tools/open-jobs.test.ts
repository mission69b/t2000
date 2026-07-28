import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerOpenJobTools } from './open-jobs.js';

// Open jobs surface (SPEC_T2_AGENTS_OPEN) — the MCP mirror of the `t2 job` open verbs:
// browse the board, post an opening, claim/unclaim as a seller, fund (or
// cancel) as the buyer. Only fund moves money.

const OWNER = `0x${'a'.repeat(64)}`;
const OPEN_ID = 'f0a4d3e2-0000-0000-0000-000000000001';
const ROW = {
  id: OPEN_ID,
  title: 'Logo sketch',
  brief: 'Three concepts, PNG',
  maxUsdc: 5,
  slaMinutes: 1440,
  status: 'open',
  openUntilMs: 1,
  claimExpiresAtMs: null,
  seller: null,
  sellerAgent: null,
  buyerAgent: null,
  jobId: null,
  createdAtMs: 1,
  updatedAtMs: 1,
};

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue(OWNER),
    signer: {
      getAddress: vi.fn().mockReturnValue(OWNER),
      signTransaction: vi.fn().mockResolvedValue({ signature: 'tx-sig' }),
      signPersonalMessage: vi.fn().mockResolvedValue({ signature: 'msg-sig' }),
    },
  } as any;
}

/** Route-aware fetch mock for the /v1/open-jobs endpoints. */
function stubApi(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = vi.fn(async (url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    let json: unknown = {};
    if (url.includes('/agent/challenge')) json = { nonce: 'nonce-1' };
    else if (url.includes('/fund-prepare'))
      json = { nonce: 'nonce-2', txBytes: Buffer.from('tx').toString('base64') };
    else if (url.includes('/fund-submit')) json = { digest: 'DIGEST123', jobId: `0x${'c'.repeat(64)}` };
    else if (url.includes('/claim')) json = { claimed: true, openJob: { ...ROW, status: 'claimed', seller: OWNER } };
    else if (url.includes('/unclaim')) json = { unclaimed: true };
    else if (url.includes('/cancel')) json = { cancelled: true };
    else if (url.includes(`/open-jobs/${OPEN_ID}`)) json = { openJob: ROW };
    else if (url.includes('/open-jobs')) json = { openJobs: [ROW] };
    if (url in overrides) json = overrides[url];
    return { ok: true, status: 200, json: async () => json };
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

describe('open-job tools (the t2 job open verbs)', () => {
  let tools: Map<string, Function>;
  let agent: ReturnType<typeof createMockAgent>;

  beforeEach(() => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    agent = createMockAgent();
    tools = new Map();
    const origTool = server.tool.bind(server) as (...args: any[]) => any;
    server.tool = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      tools.set(name, handler);
      return origTool(...args);
    }) as any;
    registerOpenJobTools(server, agent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers the 5 open-job tools', () => {
    expect(tools.size).toBe(5);
    for (const name of [
      't2000_job_board',
      't2000_job_open',
      't2000_job_claim',
      't2000_job_unclaim',
      't2000_job_fund',
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });

  describe('t2000_job_board', () => {
    it('lists the board (default open) and hints when empty', async () => {
      stubApi();
      const handler = tools.get('t2000_job_board')!;
      const data = JSON.parse((await handler({})).content[0].text);
      expect(data.total).toBe(1);
      expect(data.openJobs[0].id).toBe(OPEN_ID);

      stubApi({ [`https://api.t2000.ai/v1/open-jobs?status=open&limit=48`]: { openJobs: [] } });
      const empty = JSON.parse((await handler({})).content[0].text);
      expect(empty.total).toBe(0);
      expect(empty.hint).toMatch(/t2000_browse/);
    });

    it('fetches one opening by id', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_job_board')!;
      const data = JSON.parse((await handler({ id: OPEN_ID })).content[0].text);
      expect(data.openJob.id).toBe(OPEN_ID);
      expect(calls[0]?.url).toContain(`/open-jobs/${OPEN_ID}`);
    });
  });

  describe('t2000_job_open', () => {
    it('signs the create challenge and posts the opening', async () => {
      const { calls } = stubApi({
        'https://api.t2000.ai/v1/open-jobs': { openJob: ROW },
      });
      const handler = tools.get('t2000_job_open')!;
      const data = JSON.parse(
        (
          await handler({ title: 'Logo sketch', brief: 'Three concepts', maxUsdc: 5 })
        ).content[0].text,
      );
      expect(data.ok).toBe(true);
      expect(data.openJob.id).toBe(OPEN_ID);
      expect(data.next).toMatch(/t2000_job_fund/);
      expect(agent.signer.signPersonalMessage).toHaveBeenCalled();
      const post = calls.find((c) => c.url.endsWith('/open-jobs'));
      expect(post?.body).toMatchObject({
        address: OWNER,
        nonce: 'nonce-1',
        signature: 'msg-sig',
        title: 'Logo sketch',
        maxUsdc: 5,
      });
    });
  });

  describe('t2000_job_claim / unclaim', () => {
    it('claim returns the claimed row + delivery guidance', async () => {
      stubApi();
      const handler = tools.get('t2000_job_claim')!;
      const data = JSON.parse((await handler({ id: OPEN_ID })).content[0].text);
      expect(data.ok).toBe(true);
      expect(data.openJob.status).toBe('claimed');
      expect(data.next).toMatch(/t2000_job_deliver/);
    });

    it('unclaim succeeds quietly', async () => {
      stubApi();
      const handler = tools.get('t2000_job_unclaim')!;
      const data = JSON.parse((await handler({ id: OPEN_ID })).content[0].text);
      expect(data).toEqual({ ok: true, unclaimed: true });
    });

    it('surfaces API refusals as tool errors', async () => {
      const calls: { url: string }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          calls.push({ url });
          if (url.includes('/agent/challenge'))
            return { ok: true, status: 200, json: async () => ({ nonce: 'n' }) };
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: 'This open job is no longer claimable (taken, expired, or cancelled).' }),
          };
        }),
      );
      const handler = tools.get('t2000_job_claim')!;
      const result = await handler({ id: OPEN_ID });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/no longer claimable/i);
    });
  });

  describe('t2000_job_fund', () => {
    it('prepare → sign → submit, returning digest + jobId', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_job_fund')!;
      const data = JSON.parse((await handler({ id: OPEN_ID })).content[0].text);
      expect(data.ok).toBe(true);
      expect(data.digest).toBe('DIGEST123');
      expect(data.jobId).toBe(`0x${'c'.repeat(64)}`);
      expect(agent.signer.signTransaction).toHaveBeenCalled();
      const submit = calls.find((c) => c.url.includes('/fund-submit'));
      expect(submit?.body).toMatchObject({ nonce: 'nonce-2', address: OWNER, signature: 'tx-sig' });
    });

    it('cancel=true withdraws instead of funding (no tx signed)', async () => {
      stubApi();
      const handler = tools.get('t2000_job_fund')!;
      const data = JSON.parse(
        (await handler({ id: OPEN_ID, cancel: true })).content[0].text,
      );
      expect(data).toEqual({ ok: true, cancelled: true });
      expect(agent.signer.signTransaction).not.toHaveBeenCalled();
    });
  });
});
