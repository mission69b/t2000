import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEarnTools } from './earn.js';

// [S.N earn surface — 2026-07-06] 4 tools mirroring the CLI worker loop:
// t2000_tasks (list), t2000_task_claim, t2000_task_submit,
// t2000_agent_earnings. The board POSTER side (post/review/approve/close)
// is deliberately NOT an MCP surface — asserted below.

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xworker123'),
  } as any;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: vi.fn().mockResolvedValue(body) };
}

describe('earn tools (task economy + seller earnings)', () => {
  let server: McpServer;
  let agent: ReturnType<typeof createMockAgent>;
  let tools: Map<string, Function>;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    agent = createMockAgent();
    tools = new Map();

    const origTool = server.tool.bind(server) as (...args: any[]) => any;
    server.tool = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      tools.set(name, handler);
      return origTool(...args);
    }) as any;

    registerEarnTools(server, agent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers exactly the 4 earn tools', () => {
    expect(tools.size).toBe(4);
    expect(tools.has('t2000_tasks')).toBe(true);
    expect(tools.has('t2000_task_claim')).toBe(true);
    expect(tools.has('t2000_task_submit')).toBe(true);
    expect(tools.has('t2000_agent_earnings')).toBe(true);
  });

  it('does NOT register poster-side board tools (CLI-only by design)', () => {
    for (const name of ['t2000_task_post', 't2000_task_review', 't2000_task_approve', 't2000_task_close']) {
      expect(tools.has(name)).toBe(false);
    }
  });

  it('t2000_tasks merges reward tasks + the community board', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/tasks/stats')) {
        return Promise.resolve(jsonResponse({
          active: true,
          tasks: [{ id: 'buy-sui', kind: 'claim', rewardNetUsd: 0.08, status: 'live' }],
        }));
      }
      if (url.endsWith('/tasks/board')) {
        return Promise.resolve(jsonResponse({
          tasks: [{ id: 'task_1', title: 'Translate a doc', rewardUsd: 0.5 }],
        }));
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const handler = tools.get('t2000_tasks')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.rewards).toHaveLength(1);
    expect(data.rewards[0].id).toBe('buy-sui');
    expect(data.board).toHaveLength(1);
    expect(data.board[0].id).toBe('task_1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mpp.t2000.ai/tasks/stats',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mpp.t2000.ai/tasks/board',
      expect.anything(),
    );
  });

  it('t2000_task_claim posts the wallet address + optional proofs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ paid: true, netUsd: 0.08, suiscan: 'https://suiscan.xyz/mainnet/tx/0xr' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const handler = tools.get('t2000_task_claim')!;
    const result = await handler({ task: 'buy-sui', txDigest: '0xswap' });
    const data = JSON.parse(result.content[0].text);
    expect(data.paid).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mpp.t2000.ai/tasks/claim');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      task: 'buy-sui',
      address: '0xworker123',
      txDigest: '0xswap',
    });
  });

  it('t2000_task_claim omits absent proof fields (automated-task retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ paid: false, note: 'No qualifying sale yet.' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const handler = tools.get('t2000_task_claim')!;
    await handler({ task: 'first-sale' });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ task: 'first-sale', address: '0xworker123' });
  });

  it('t2000_task_submit posts proof to the board task', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, note: 'Submitted — the poster reviews next.' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const handler = tools.get('t2000_task_submit')!;
    const result = await handler({
      taskId: 'task_1',
      proof: 'Translated the doc; diff attached',
      url: 'https://example.com/diff',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mpp.t2000.ai/tasks/board/task_1/submit');
    expect(JSON.parse(init.body)).toEqual({
      address: '0xworker123',
      proof: 'Translated the doc; diff attached',
      url: 'https://example.com/diff',
    });
  });

  it('t2000_agent_earnings fetches the commerce stats for the own address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ sales: 12, volumeUsd: 0.48, buyers: 5, lastSaleAt: '2026-07-05T00:00:00Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const handler = tools.get('t2000_agent_earnings')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.address).toBe('0xworker123');
    expect(data.sales).toBe(12);
    expect(data.buyers).toBe(5);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mpp.t2000.ai/commerce/stats/0xworker123');
  });

  it('surfaces the gateway error message on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Task already claimed by this wallet.' }, false, 409),
    ));

    const handler = tools.get('t2000_task_claim')!;
    const result = await handler({ task: 'buy-sui', txDigest: '0xswap' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.message).toBe('Task already claimed by this wallet.');
  });

  it('falls back to a status-coded error when the gateway body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    }));

    const handler = tools.get('t2000_tasks')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.message).toContain('502');
  });
});
