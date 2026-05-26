import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReadTools } from './read.js';

// [v4.0 Phase B — 2026-05-26] Read surface is 5 tools:
// balance, address, receive, history, services.

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xtest123'),
    balance: vi.fn().mockResolvedValue({
      available: 96.81,
      gasReserve: { sui: 0.86, usdEquiv: 0.84 },
      total: 102.75,
      assets: { USDC: 96.81 },
      stables: { USDC: 96.81 },
    }),
    history: vi.fn().mockResolvedValue([
      { digest: '0xabc', action: 'send', amount: 10, asset: 'USDC', timestamp: Date.now() },
    ]),
    receive: vi.fn().mockReturnValue({
      address: '0xtest123',
      uri: 'sui:pay?recipient=0xtest123',
      nonce: '0xnonce',
    }),
  } as any;
}

describe('read tools (v4 surface)', () => {
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

    registerReadTools(server, agent);
  });

  it('registers 5 v4 read tools', () => {
    expect(tools.size).toBe(5);
    expect(tools.has('t2000_balance')).toBe(true);
    expect(tools.has('t2000_address')).toBe(true);
    expect(tools.has('t2000_receive')).toBe(true);
    expect(tools.has('t2000_history')).toBe(true);
    expect(tools.has('t2000_services')).toBe(true);
  });

  it('does NOT register the deleted v3 DeFi tools', () => {
    const banned = [
      't2000_overview', 't2000_positions', 't2000_rates', 't2000_all_rates',
      't2000_health', 't2000_earnings', 't2000_fund_status',
      't2000_pending_rewards', 't2000_deposit_info', 't2000_contacts',
    ];
    for (const name of banned) {
      expect(tools.has(name)).toBe(false);
    }
  });

  it('t2000_balance returns balance JSON', async () => {
    const handler = tools.get('t2000_balance')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.available).toBe(96.81);
    expect(data.total).toBe(102.75);
  });

  it('t2000_address returns address JSON', async () => {
    const handler = tools.get('t2000_address')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.address).toBe('0xtest123');
  });

  it('t2000_receive returns a payment request URI', async () => {
    const handler = tools.get('t2000_receive')!;
    const result = await handler({ amount: 10, memo: 'Test' });
    const data = JSON.parse(result.content[0].text);
    expect(data.address).toBe('0xtest123');
    expect(data.uri).toContain('sui:pay');
  });

  it('t2000_history forwards limit through to agent.history', async () => {
    const handler = tools.get('t2000_history')!;
    const result = await handler({ limit: 5 });
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].action).toBe('send');
    expect(agent.history).toHaveBeenCalledWith({ limit: 5 });
  });

  it('t2000_history defaults to undefined limit', async () => {
    const handler = tools.get('t2000_history')!;
    await handler({});
    expect(agent.history).toHaveBeenCalledWith({ limit: undefined });
  });

  it('returns structured error when SDK throws', async () => {
    agent.balance.mockRejectedValue(new Error('RPC timeout'));
    const handler = tools.get('t2000_balance')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe('UNKNOWN');
    expect(data.message).toBe('RPC timeout');
  });

  it('t2000_services fetches the catalog from mpp.t2000.ai', async () => {
    const mockServices = [
      { id: 'openai', name: 'OpenAI', endpoints: [{ path: '/v1/chat/completions', price: '0.01' }] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockServices),
    }));
    const handler = tools.get('t2000_services')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('openai');
    vi.unstubAllGlobals();
  });

  it('t2000_services returns error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const handler = tools.get('t2000_services')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    vi.unstubAllGlobals();
  });
});
