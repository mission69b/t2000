import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerOpenJobTools } from './open-jobs.js';

// Open jobs (escrow-at-post) — the MCP mirror of the `t2 job` open verbs:
// board (read), open (post = money moves), claim (mints the funded Job),
// cancel (fee-free refund of an unclaimed posting).

const OWNER = `0x${'a'.repeat(64)}`;
const OPENING_ID = `0x${'f'.repeat(64)}`;
const JOB_ID = `0x${'c'.repeat(64)}`;
const ROW = {
  id: OPENING_ID,
  title: 'Logo sketch',
  brief: 'Three concepts, PNG',
  maxUsdc: 5,
  slaMinutes: 1440,
  status: 'open',
  openUntilMs: 1,
  seller: null,
  sellerAgent: null,
  buyerAgent: null,
  jobId: null,
  createdAtMs: 1,
  updatedAtMs: 1,
};

// resolveCreated reads the chain — stub it offline.
vi.mock('@t2000/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t2000/sdk')>();
  return {
    ...actual,
    getSuiClient: () => ({
      core: {
        waitForTransaction: async () => ({
          $kind: 'Transaction',
          Transaction: {
            objectTypes: {
              [OPENING_ID]: '0xpkg::opening::Opening<0xusdc::usdc::USDC>',
              [JOB_ID]: '0xpkg::escrow::Job<0xusdc::usdc::USDC>',
            },
          },
        }),
      },
    }),
  };
});

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

/** Route-aware fetch mock for the board reads + sponsored rail. */
function stubApi(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = vi.fn(async (url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    let json: unknown = {};
    if (url.includes('/job/prepare'))
      json = { nonce: 'nonce-1', txBytes: Buffer.from('tx').toString('base64') };
    else if (url.includes('/job/submit')) json = { digest: 'DIGEST123' };
    else if (url.includes(`/open-jobs/${OPENING_ID}`)) json = { openJob: ROW };
    else if (url.includes('/open-jobs')) json = { openJobs: [ROW] };
    if (url in overrides) json = overrides[url];
    return { ok: true, status: 200, json: async () => json };
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

describe('open-job tools (escrow-at-post)', () => {
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

  it('registers the 4 open-job tools', () => {
    expect(tools.size).toBe(4);
    for (const name of [
      't2000_job_board',
      't2000_job_open',
      't2000_job_claim',
      't2000_job_cancel',
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it('board lists openings and hints when empty', async () => {
    stubApi();
    const handler = tools.get('t2000_job_board')!;
    const data = JSON.parse((await handler({})).content[0].text);
    expect(data.total).toBe(1);
    expect(data.openJobs[0].id).toBe(OPENING_ID);

    stubApi({
      'https://api.t2000.ai/v1/open-jobs?status=open&limit=48': { openJobs: [] },
    });
    const empty = JSON.parse((await handler({})).content[0].text);
    expect(empty.total).toBe(0);
    expect(empty.hint).toMatch(/t2000_browse/);
  });

  it('open posts via the sponsored open-create action (money moves at post)', async () => {
    const { calls } = stubApi();
    const handler = tools.get('t2000_job_open')!;
    const data = JSON.parse(
      (
        await handler({ title: 'Logo sketch', brief: 'Three concepts', maxUsdc: 5 })
      ).content[0].text,
    );
    expect(data.ok).toBe(true);
    expect(data.digest).toBe('DIGEST123');
    expect(data.openingId).toBe(OPENING_ID);
    expect(data.next).toMatch(/t2000_job_cancel/);
    expect(agent.signer.signTransaction).toHaveBeenCalled();
    const prep = calls.find((c) => c.url.includes('/job/prepare'));
    expect(prep?.body).toMatchObject({
      address: OWNER,
      action: 'open-create',
      params: { title: 'Logo sketch', maxUsdc: 5 },
    });
  });

  it('claim mints the funded Job and points at deliver', async () => {
    const { calls } = stubApi();
    const handler = tools.get('t2000_job_claim')!;
    const data = JSON.parse((await handler({ id: OPENING_ID })).content[0].text);
    expect(data.ok).toBe(true);
    expect(data.jobId).toBe(JOB_ID);
    expect(data.next).toMatch(/t2000_job_deliver/);
    const prep = calls.find((c) => c.url.includes('/job/prepare'));
    expect(prep?.body).toMatchObject({
      action: 'open-claim',
      params: { openingId: OPENING_ID },
    });
  });

  it('claim surfaces the still-claimable refusal as a tool error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'This opening is no longer claimable (claimed, cancelled, or refunded).' },
        }),
      })),
    );
    const handler = tools.get('t2000_job_claim')!;
    const result = await handler({ id: OPENING_ID });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/no longer claimable/i);
  });

  it('cancel refunds an unclaimed posting', async () => {
    const { calls } = stubApi();
    const handler = tools.get('t2000_job_cancel')!;
    const data = JSON.parse((await handler({ id: OPENING_ID })).content[0].text);
    expect(data).toMatchObject({ ok: true, cancelled: true, digest: 'DIGEST123' });
    const prep = calls.find((c) => c.url.includes('/job/prepare'));
    expect(prep?.body).toMatchObject({
      action: 'open-cancel',
      params: { openingId: OPENING_ID },
    });
  });
});
