import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReadTools } from './read.js';

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xtest123'),
    balance: vi.fn().mockResolvedValue({
      available: 96.81,
      savings: 5.10,
      gasReserve: { sui: 0.86, usdEquiv: 0.84 },
      total: 102.75,
      assets: { USDC: 101.91 },
      stables: { USDC: 96.81 },
    }),
    positions: vi.fn().mockResolvedValue({
      positions: [
        { protocol: 'navi', asset: 'USDC', type: 'save', amount: 5.10, apy: 4.92 },
      ],
    }),
    rates: vi.fn().mockResolvedValue({
      USDC: { saveApy: 4.92, borrowApy: 8.5 },
    }),
    healthFactor: vi.fn().mockResolvedValue({
      healthFactor: 4.24,
      supplied: 5.10,
      borrowed: 0,
      maxBorrow: 3.50,
      liquidationThreshold: 0.8,
    }),
    history: vi.fn().mockResolvedValue([
      { digest: '0xabc', action: 'send', amount: 10, asset: 'USDC', timestamp: Date.now() },
    ]),
    earnings: vi.fn().mockResolvedValue({
      totalYieldEarned: 0.15,
      currentApy: 4.92,
      dailyEarning: 0.0007,
      supplied: 5.10,
    }),
    enforcer: {
      assertNotLocked: vi.fn(),
      check: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ locked: false, maxPerTx: 100, maxDailySend: 1000, dailyUsed: 0 }),
      isConfigured: vi.fn().mockReturnValue(true),
    },
    contacts: {
      list: vi.fn().mockReturnValue([
        { name: 'Tom', address: '0x8b3etest' },
        { name: 'Alice', address: '0x40cdtest' },
      ]),
      resolve: vi.fn().mockImplementation((nameOrAddress: string) => {
        if (nameOrAddress.startsWith('0x')) return { address: nameOrAddress };
        return { address: '0x8b3etest', contactName: 'Tom' };
      }),
    },
    getPortfolio: vi.fn().mockResolvedValue({
      positions: [{ asset: 'SUI', totalAmount: 100, costBasis: 95, avgPrice: 0.95, currentPrice: 0.97, currentValue: 97, unrealizedPnL: 2, unrealizedPnLPct: 2.1, trades: [] }],
      totalInvested: 95, totalValue: 97, unrealizedPnL: 2, unrealizedPnLPct: 2.1, realizedPnL: 0,
    }),
  } as any;
}

describe('read tools', () => {
  let server: McpServer;
  let agent: ReturnType<typeof createMockAgent>;
  let tools: Map<string, Function>;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    agent = createMockAgent();
    tools = new Map();

    const origTool = server.tool.bind(server);
    server.tool = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      tools.set(name, handler);
      return origTool(...args);
    }) as any;

    registerReadTools(server, agent);
  });

  it('should register 9 read tools', () => {
    expect(tools.size).toBe(9);
    expect(tools.has('t2000_balance')).toBe(true);
    expect(tools.has('t2000_address')).toBe(true);
    expect(tools.has('t2000_positions')).toBe(true);
    expect(tools.has('t2000_rates')).toBe(true);
    expect(tools.has('t2000_health')).toBe(true);
    expect(tools.has('t2000_history')).toBe(true);
    expect(tools.has('t2000_earnings')).toBe(true);
    expect(tools.has('t2000_contacts')).toBe(true);
  });

  it('t2000_balance should return balance JSON', async () => {
    const handler = tools.get('t2000_balance')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.available).toBe(96.81);
    expect(data.savings).toBe(5.10);
    expect(data.total).toBe(102.75);
  });

  it('t2000_address should return address JSON', async () => {
    const handler = tools.get('t2000_address')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.address).toBe('0xtest123');
  });

  it('t2000_positions should return positions JSON', async () => {
    const handler = tools.get('t2000_positions')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.positions).toHaveLength(1);
    expect(data.positions[0].protocol).toBe('navi');
  });

  it('t2000_rates should return rates JSON', async () => {
    const handler = tools.get('t2000_rates')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.USDC.saveApy).toBe(4.92);
  });

  it('t2000_health should return health JSON', async () => {
    const handler = tools.get('t2000_health')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.healthFactor).toBe(4.24);
  });

  it('t2000_history should return history JSON', async () => {
    const handler = tools.get('t2000_history')!;
    const result = await handler({ limit: 5 });
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].action).toBe('send');
    expect(agent.history).toHaveBeenCalledWith({ limit: 5 });
  });

  it('t2000_history should pass undefined limit by default', async () => {
    const handler = tools.get('t2000_history')!;
    await handler({});
    expect(agent.history).toHaveBeenCalledWith({ limit: undefined });
  });

  it('t2000_earnings should return earnings JSON', async () => {
    const handler = tools.get('t2000_earnings')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.totalYieldEarned).toBe(0.15);
    expect(data.currentApy).toBe(4.92);
  });

  it('t2000_contacts should return contacts list', async () => {
    const handler = tools.get('t2000_contacts')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.contacts).toHaveLength(2);
    expect(data.contacts[0].name).toBe('Tom');
    expect(data.contacts[1].name).toBe('Alice');
  });

  it('t2000_contacts should return empty list when no contacts', async () => {
    agent.contacts.list.mockReturnValue([]);
    const handler = tools.get('t2000_contacts')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.contacts).toEqual([]);
  });

  it('should return error when SDK throws', async () => {
    agent.balance.mockRejectedValue(new Error('RPC timeout'));
    const handler = tools.get('t2000_balance')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe('UNKNOWN');
    expect(data.message).toBe('RPC timeout');
  });

  it('t2000_portfolio should return portfolio with P&L', async () => {
    const handler = tools.get('t2000_portfolio')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.positions).toHaveLength(1);
    expect(data.positions[0].asset).toBe('SUI');
    expect(data.positions[0].unrealizedPnL).toBe(2);
    expect(data.totalValue).toBe(97);
  });

  it('t2000_portfolio should return empty when no positions', async () => {
    agent.getPortfolio.mockResolvedValue({
      positions: [], totalInvested: 0, totalValue: 0,
      unrealizedPnL: 0, unrealizedPnLPct: 0, realizedPnL: 0,
    });
    const handler = tools.get('t2000_portfolio')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.positions).toEqual([]);
    expect(data.totalValue).toBe(0);
  });

  it('t2000_portfolio should add price unavailable note', async () => {
    agent.getPortfolio.mockResolvedValue({
      positions: [{ asset: 'SUI', totalAmount: 100, costBasis: 95, avgPrice: 0.95, currentPrice: 0, currentValue: 0, unrealizedPnL: 0, unrealizedPnLPct: 0, trades: [] }],
      totalInvested: 95, totalValue: 0, unrealizedPnL: -95, unrealizedPnLPct: -100, realizedPnL: 0,
    });
    const handler = tools.get('t2000_portfolio')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.positions[0].note).toBe('price unavailable');
  });
});
