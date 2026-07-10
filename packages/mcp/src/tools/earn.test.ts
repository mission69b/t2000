import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEarnTools } from './earn.js';

// Seller earnings surface — t2000_agent_earnings only. (The task-economy
// tools were deleted with the tasks board, SPEC_HUB_V1 2026-07-10.)

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xworker123'),
  } as any;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: vi.fn().mockResolvedValue(body) };
}

describe('earn tools (seller earnings)', () => {
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

  it('registers exactly the earnings tool (task tools deleted with the board)', () => {
    expect(tools.size).toBe(1);
    expect(tools.has('t2000_agent_earnings')).toBe(true);
    for (const dead of ['t2000_tasks', 't2000_task_claim', 't2000_task_submit']) {
      expect(tools.has(dead)).toBe(false);
    }
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
      jsonResponse({ error: 'Gateway unavailable.' }, false, 503),
    ));

    const handler = tools.get('t2000_agent_earnings')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.message).toBe('Gateway unavailable.');
  });

  it('falls back to a status-coded error when the gateway body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    }));

    const handler = tools.get('t2000_agent_earnings')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.message).toContain('502');
  });
});
