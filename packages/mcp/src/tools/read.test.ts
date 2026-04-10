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
    fundStatus: vi.fn().mockResolvedValue({
      supplied: 5.10, apy: 4.92, earnedToday: 0.0007, earnedAllTime: 0.15, projectedMonthly: 0.021,
    }),
    getPendingRewards: vi.fn().mockResolvedValue([
      { protocol: 'navi', asset: 'USDC', coinType: '0xtest', symbol: 'CERT' },
    ]),
    deposit: vi.fn().mockReturnValue({
      address: '0xtest123', network: 'Sui (mainnet)', supportedAssets: ['USDC'], instructions: 'Send USDC to the address above.',
    }),
    allRatesAcrossAssets: vi.fn().mockResolvedValue([
      { protocol: 'navi', asset: 'USDC', rates: { saveApy: 4.08, borrowApy: 4.94 } },
    ]),
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

    const origTool = server.tool.bind(server) as (...args: any[]) => any;
    server.tool = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      tools.set(name, handler);
      return origTool(...args);
    }) as any;

    registerReadTools(server, agent);
  });

  it('should register 15 read tools', () => {
    expect(tools.size).toBe(15);
    expect(tools.has('t2000_overview')).toBe(true);
    expect(tools.has('t2000_balance')).toBe(true);
    expect(tools.has('t2000_address')).toBe(true);
    expect(tools.has('t2000_positions')).toBe(true);
    expect(tools.has('t2000_rates')).toBe(true);
    expect(tools.has('t2000_health')).toBe(true);
    expect(tools.has('t2000_history')).toBe(true);
    expect(tools.has('t2000_earnings')).toBe(true);
    expect(tools.has('t2000_fund_status')).toBe(true);
    expect(tools.has('t2000_pending_rewards')).toBe(true);
    expect(tools.has('t2000_deposit_info')).toBe(true);
    expect(tools.has('t2000_all_rates')).toBe(true);
    expect(tools.has('t2000_services')).toBe(true);
    expect(tools.has('t2000_contacts')).toBe(true);
    expect(tools.has('t2000_receive')).toBe(true);
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

  it('t2000_overview should return composite data', async () => {
    const handler = tools.get('t2000_overview')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.balance.available).toBe(96.81);
    expect(data.positions.positions).toHaveLength(1);
    expect(data.health.healthFactor).toBe(4.24);
    expect(data.earnings.totalYieldEarned).toBe(0.15);
    expect(data.fundStatus.supplied).toBe(5.10);
    expect(data.pendingRewards).toHaveLength(1);
  });

  it('t2000_overview should handle partial failures', async () => {
    agent.healthFactor.mockRejectedValue(new Error('timeout'));
    const handler = tools.get('t2000_overview')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.balance.available).toBe(96.81);
    expect(data.health).toBeNull();
  });

  it('t2000_fund_status should return fund status', async () => {
    const handler = tools.get('t2000_fund_status')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.supplied).toBe(5.10);
    expect(data.apy).toBe(4.92);
    expect(data.projectedMonthly).toBe(0.021);
  });

  it('t2000_pending_rewards should return rewards with count', async () => {
    const handler = tools.get('t2000_pending_rewards')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(1);
    expect(data.rewards[0].protocol).toBe('navi');
  });

  it('t2000_deposit_info should return deposit instructions', async () => {
    const handler = tools.get('t2000_deposit_info')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.address).toBe('0xtest123');
    expect(data.network).toContain('Sui');
  });

  it('t2000_all_rates should return per-protocol rates', async () => {
    const handler = tools.get('t2000_all_rates')!;
    const result = await handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].protocol).toBe('navi');
  });

  it('t2000_services should return service catalog', async () => {
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

  it('t2000_services should return error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const handler = tools.get('t2000_services')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    vi.unstubAllGlobals();
  });

});
