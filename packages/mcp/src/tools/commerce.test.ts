import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCommerceTools } from './commerce.js';

// t2 ACP commerce surface — agent services (sell) + escrow jobs (hire/
// deliver/settle/review). Mirrors `t2 service` / `t2 browse` / `t2 job`.

const OWNER = `0x${'a'.repeat(64)}`;
const SELLER = `0x${'b'.repeat(64)}`;
const JOB_ID = `0x${'c'.repeat(64)}`;

// `resolveJobId` reaches the chain via `getSuiClient().core.waitForTransaction`
// after a create — stub it so unit tests stay offline.
vi.mock('@t2000/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t2000/sdk')>();
  return {
    ...actual,
    getSuiClient: () => ({
      core: {
        waitForTransaction: async () => ({
          $kind: 'Transaction',
          Transaction: { objectTypes: { [JOB_ID]: '0xpkg::escrow::Job<0xusdc::usdc::USDC>' } },
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

/** Route-aware fetch mock for the api.t2000.ai commerce endpoints. */
function stubApi(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = vi.fn(async (url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    let json: unknown = {};
    if (url.includes('/agent/challenge')) json = { nonce: 'nonce-1' };
    else if (url.includes('/agent/service')) json = { ok: true };
    else if (url.includes('/job/spec')) json = { hash: 'ab'.repeat(32) };
    else if (url.includes('/job/prepare')) json = { nonce: 'nonce-2', txBytes: Buffer.from('tx').toString('base64') };
    else if (url.includes('/job/submit')) json = { digest: 'DIGEST123' };
    else if (url.includes('/job/review')) json = { review: { seller: SELLER } };
    else if (url.includes('/jobs?')) json = { jobs: [{ jobId: JOB_ID, buyer: SELLER, seller: OWNER, amountUsdc: 5, state: 'funded', deliverByMs: 1, deliveryHash: null }] };
    else if (url.includes('/services')) {
      json = {
        total: 1,
        services: [{
          agent: SELLER,
          agentName: 'Bot',
          agentNumericId: 1,
          slug: 'report',
          name: 'Report',
          description: 'd',
          priceUsdc: 5,
          slaMinutes: 60,
          reviewWindowMinutes: 1440,
          rejectSplitBps: 8000,
          requirements: null,
          deliverable: 'md',
          retired: false,
        }],
      };
    }
    if (url in overrides) json = overrides[url];
    return { ok: true, status: 200, json: async () => json };
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

describe('commerce tools (t2 ACP surface)', () => {
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
    registerCommerceTools(server, agent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers the 8 commerce tools', () => {
    expect(tools.size).toBe(8);
    expect(tools.has('t2000_service_create')).toBe(true);
    expect(tools.has('t2000_service_retire')).toBe(true);
    expect(tools.has('t2000_browse')).toBe(true);
    expect(tools.has('t2000_job_create')).toBe(true);
    expect(tools.has('t2000_jobs')).toBe(true);
    expect(tools.has('t2000_job_deliver')).toBe(true);
    expect(tools.has('t2000_job_settle')).toBe(true);
    expect(tools.has('t2000_job_review')).toBe(true);
  });

  describe('t2000_service_create', () => {
    it('signs the challenge and upserts the service payload', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_service_create')!;
      const result = await handler({
        name: 'Sui market report',
        priceUsdc: 5,
        slaMinutes: 1440,
        description: 'Daily report',
        deliverable: 'Markdown, sources cited',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.ok).toBe(true);
      expect(data.slug).toBe('sui-market-report');
      expect(agent.signer.signPersonalMessage).toHaveBeenCalled();
      const upsert = calls.find((c) => c.url.includes('/agent/service'));
      expect(upsert?.body).toMatchObject({ action: 'upsert', address: OWNER, nonce: 'nonce-1' });
      expect((upsert?.body as any).payload).toMatchObject({
        slug: 'sui-market-report',
        priceUsdc: 5,
        reviewWindowMinutes: 1440,
        rejectSplitBps: 8000,
      });
    });
  });

  describe('t2000_job_create (service mode)', () => {
    it('resolves the listing, stores the spec, and runs the sponsored create', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_job_create')!;
      const result = await handler({ agent: SELLER, service: 'report', requirements: '{"topic":"DEEP"}' });
      const data = JSON.parse(result.content[0].text);
      expect(data.ok).toBe(true);
      expect(data.digest).toBe('DIGEST123');
      expect(data.jobId).toBe(JOB_ID);
      expect(data.amountUsdc).toBe(5); // price came from the listing
      expect(data.specHash).toBe(`0x${'ab'.repeat(32)}`);
      const prepare = calls.find((c) => c.url.includes('/job/prepare'));
      expect((prepare?.body as any).action).toBe('create');
      expect((prepare?.body as any).params.seller).toBe(SELLER);
    });

    it('rejects service mode without both agent and service', async () => {
      stubApi();
      const handler = tools.get('t2000_job_create')!;
      const result = await handler({ service: 'report' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/go together/);
    });

    it('rejects direct mode without seller + amount + spec', async () => {
      stubApi();
      const handler = tools.get('t2000_job_create')!;
      const result = await handler({ seller: SELLER });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/seller \+ amountUsdc \+ spec/);
    });
  });

  describe('t2000_job_deliver', () => {
    it('stores the delivery content-addressed and pins its hash on-chain', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_job_deliver')!;
      const result = await handler({ jobId: JOB_ID, delivery: '# The report' });
      const data = JSON.parse(result.content[0].text);
      expect(data.ok).toBe(true);
      expect(data.deliveryHash).toBe(`0x${'ab'.repeat(32)}`);
      const store = calls.find((c) => c.url.endsWith('/job/spec'));
      expect((store?.body as any).content).toBe('# The report');
      const prepare = calls.find((c) => c.url.includes('/job/prepare'));
      expect((prepare?.body as any).action).toBe('deliver');
    });
  });

  describe('t2000_job_settle', () => {
    it('runs the sponsored release', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_job_settle')!;
      const result = await handler({ jobId: JOB_ID, action: 'release' });
      const data = JSON.parse(result.content[0].text);
      expect(data.ok).toBe(true);
      expect(data.digest).toBe('DIGEST123');
      const prepare = calls.find((c) => c.url.includes('/job/prepare'));
      expect((prepare?.body as any).action).toBe('release');
    });
  });

  describe('t2000_job_review', () => {
    it('signs the t2000-job-review challenge construction', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_job_review')!;
      const result = await handler({ jobId: JOB_ID, stars: 5, text: 'great' });
      const data = JSON.parse(result.content[0].text);
      expect(data.ok).toBe(true);
      const msgBytes = agent.signer.signPersonalMessage.mock.calls[0][0] as Uint8Array;
      const msg = new TextDecoder().decode(msgBytes);
      expect(msg).toMatch(/^t2000-job-review:nonce-1:[0-9a-f]{64}$/);
      const post = calls.find((c) => c.url.includes('/job/review'));
      expect((post?.body as any).payload).toMatchObject({ jobId: JOB_ID, stars: 5, text: 'great' });
    });
  });

  describe('t2000_jobs (inbox mode)', () => {
    it('lists the seller inbox by default', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_jobs')!;
      const result = await handler({});
      const data = JSON.parse(result.content[0].text);
      expect(data.role).toBe('seller');
      expect(data.total).toBe(1);
      expect(data.open).toBe(1);
      const listCall = calls.find((c) => c.url.includes('/jobs?'));
      expect(listCall?.url).toContain(`seller=${encodeURIComponent(OWNER)}`);
    });
  });

  describe('t2000_browse', () => {
    it('browses with a free-text query', async () => {
      const { calls } = stubApi();
      const handler = tools.get('t2000_browse')!;
      const result = await handler({ query: 'report' });
      const data = JSON.parse(result.content[0].text);
      expect(data.total).toBe(1);
      expect(data.services[0].slug).toBe('report');
      expect(calls[0].url).toContain('q=report');
    });
  });
});
