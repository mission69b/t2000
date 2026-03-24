import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerSafetyTools } from './tools/safety.js';
import { registerPrompts } from './prompts.js';

function createMockAgent() {
  return {
    address: vi.fn().mockReturnValue('0xtest_integration'),
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
      healthFactor: 4.24, supplied: 5.10, borrowed: 0, maxBorrow: 3.50,
    }),
    history: vi.fn().mockResolvedValue([
      { digest: '0xabc', action: 'send', amount: 10, asset: 'USDC' },
    ]),
    earnings: vi.fn().mockResolvedValue({
      totalYieldEarned: 0.15, currentApy: 4.92, dailyEarning: 0.0007,
    }),
    fundStatus: vi.fn().mockResolvedValue({
      supplied: 5.10, apy: 4.92, earnedToday: 0.0007, earnedAllTime: 0.15, projectedMonthly: 0.021,
    }),
    getPendingRewards: vi.fn().mockResolvedValue([]),
    deposit: vi.fn().mockReturnValue({
      address: '0xtest123', network: 'Sui (mainnet)', supportedAssets: ['USDC'], instructions: 'Send USDC to address.',
    }),
    send: vi.fn().mockResolvedValue({
      digest: '0xsend123', amount: 10, to: '0xrecipient',
    }),
    save: vi.fn().mockResolvedValue({ digest: '0xsave123', amount: 50 }),
    withdraw: vi.fn().mockResolvedValue({ digest: '0xwithdraw123', amount: 25 }),
    borrow: vi.fn().mockResolvedValue({ digest: '0xborrow123', amount: 5 }),
    repay: vi.fn().mockResolvedValue({ digest: '0xrepay123', amount: 5 }),
    swap: vi.fn().mockResolvedValue({ digest: '0xswap123' }),
    swapQuote: vi.fn().mockResolvedValue({
      expectedOutput: 10.25, priceImpact: 0.01, fee: { amount: 0.03 },
    }),
    exchange: vi.fn().mockResolvedValue({ digest: '0xswap123' }),
    exchangeQuote: vi.fn().mockResolvedValue({
      expectedOutput: 10.25, priceImpact: 0.01, fee: { amount: 0.03 },
    }),
    rebalance: vi.fn().mockResolvedValue({ moved: false, reason: 'no improvement' }),
    maxBorrow: vi.fn().mockResolvedValue({ maxAmount: 3.50, healthFactorAfter: 2.1 }),
    enforcer: {
      assertNotLocked: vi.fn(),
      check: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        locked: false, maxPerTx: 100, maxDailySend: 1000, dailyUsed: 0,
      }),
      isConfigured: vi.fn().mockReturnValue(true),
      lock: vi.fn(),
      set: vi.fn(),
    },
    contacts: {
      list: vi.fn().mockReturnValue([]),
      resolve: vi.fn().mockImplementation((nameOrAddress: string) => {
        if (nameOrAddress.startsWith('0x')) return { address: nameOrAddress };
        throw new Error(`"${nameOrAddress}" is not a valid Sui address or saved contact.`);
      }),
      add: vi.fn().mockReturnValue({ action: 'added' }),
      remove: vi.fn().mockReturnValue(true),
    },
    portfolio: {
      getPositions: vi.fn().mockReturnValue([]),
      getRealizedPnL: vi.fn().mockReturnValue(0),
    },
    getPortfolio: vi.fn().mockResolvedValue({
      positions: [],
      totalInvested: 0,
      totalValue: 0,
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
      realizedPnL: 0,
    }),
    investBuy: vi.fn().mockResolvedValue({
      success: true, tx: '0xinvest123', type: 'buy', asset: 'SUI',
      amount: 100, price: 0.95, usdValue: 95, fee: 0, gasCost: 0.001,
    }),
    investSell: vi.fn().mockResolvedValue({
      success: true, tx: '0xinvest456', type: 'sell', asset: 'SUI',
      amount: 50, price: 0.97, usdValue: 48.5, fee: 0, gasCost: 0.001,
    }),
    allRatesAcrossAssets: vi.fn().mockResolvedValue([
      { protocol: 'navi', asset: 'USDC', rates: { saveApy: 4.08, borrowApy: 4.94 } },
    ]),
    sentinelList: vi.fn().mockResolvedValue([]),
    sentinelInfo: vi.fn().mockResolvedValue({
      id: '1', objectId: '0xsentinel', name: 'Test', model: 'gpt-4', systemPrompt: '', attackFee: 100000000n, prizePool: 1000000000n, totalAttacks: 0, successfulBreaches: 0, state: 'active',
    }),
    sentinelAttack: vi.fn().mockResolvedValue({
      attackObjectId: '0x1', sentinelId: '1', prompt: 'test', verdict: { success: false, score: 20, agentResponse: 'No', juryResponse: 'Defended' }, requestTx: '0x1', settleTx: '0x2', won: false, feePaid: 0.1,
    }),
    pay: vi.fn().mockResolvedValue({
      status: 200, body: { data: 'paid content' }, paid: true, cost: 0.01,
      receipt: { reference: '0xdigest123', timestamp: new Date().toISOString() },
    }),
  } as any;
}

describe('integration: MCP client ↔ server', () => {
  let client: Client;
  let server: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeAll(async () => {
    const agent = createMockAgent();
    server = new McpServer({ name: 't2000-test', version: '0.0.1' });

    registerReadTools(server, agent);
    registerWriteTools(server, agent);
    registerSafetyTools(server, agent);
    registerPrompts(server);

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '0.0.1' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it('lists all 35 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(35);

    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      't2000_address',
      't2000_all_rates',
      't2000_auto_invest',
      't2000_balance',
      't2000_borrow',
      't2000_claim_rewards',
      't2000_config',
      't2000_contact_add',
      't2000_contact_remove',
      't2000_contacts',
      't2000_deposit_info',
      't2000_earnings',
      't2000_exchange',
      't2000_fund_status',
      't2000_health',
      't2000_history',
      't2000_invest',
      't2000_invest_rebalance',
      't2000_lock',
      't2000_overview',
      't2000_pay',
      't2000_pending_rewards',
      't2000_portfolio',
      't2000_positions',
      't2000_rates',
      't2000_rebalance',
      't2000_repay',
      't2000_save',
      't2000_send',
      't2000_sentinel_attack',
      't2000_sentinel_info',
      't2000_sentinel_list',
      't2000_services',
      't2000_strategy',
      't2000_withdraw',
    ]);
  });

  it('lists all 20 prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts).toHaveLength(20);

    const names = prompts.map(p => p.name).sort();
    expect(names).toEqual(['budget-check', 'claim-rewards', 'dca-advisor', 'emergency', 'financial-report', 'investment-strategy', 'morning-briefing', 'onboarding', 'optimize-all', 'optimize-yield', 'quick-swap', 'risk-check', 'safeguards', 'savings-goal', 'savings-strategy', 'send-money', 'sentinel-hunt', 'sweep', 'weekly-recap', 'what-if']);
  });

  it('calls t2000_balance and returns structured JSON', async () => {
    const result = await client.callTool({ name: 't2000_balance', arguments: {} });
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.available).toBe(96.81);
    expect(data.savings).toBe(5.10);
    expect(data.total).toBe(102.75);
  });

  it('calls t2000_address and returns address', async () => {
    const result = await client.callTool({ name: 't2000_address', arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.address).toBe('0xtest_integration');
  });

  it('calls t2000_send with dryRun and returns preview', async () => {
    const result = await client.callTool({
      name: 't2000_send',
      arguments: {
        to: '0x0000000000000000000000000000000000000000000000000000000000000001',
        amount: 10,
        dryRun: true,
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.preview).toBe(true);
    expect(data.canSend).toBe(true);
    expect(data.amount).toBe(10);
  });

  it('calls t2000_config show and returns limits', async () => {
    const result = await client.callTool({
      name: 't2000_config',
      arguments: { action: 'show' },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.locked).toBe(false);
    expect(data.maxPerTx).toBe(100);
    expect(data.maxDailySend).toBe(1000);
  });

  it('calls t2000_lock and returns locked state', async () => {
    const result = await client.callTool({ name: 't2000_lock', arguments: {} });

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.locked).toBe(true);
    expect(data.message).toContain('t2000 unlock');
  });

  it('returns error for invalid tool arguments', async () => {
    const result = await client.callTool({
      name: 't2000_send',
      arguments: { to: 'not-a-valid-address', amount: 10 },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.code).toBeDefined();
  });

  it('gets a prompt with messages', async () => {
    const result = await client.getPrompt({ name: 'financial-report' });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toMatchObject({
      type: 'text',
      text: expect.stringContaining('t2000_overview'),
    });
  });
});
