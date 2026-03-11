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
    send: vi.fn().mockResolvedValue({
      digest: '0xsend123', amount: 10, to: '0xrecipient',
    }),
    save: vi.fn().mockResolvedValue({ digest: '0xsave123', amount: 50 }),
    withdraw: vi.fn().mockResolvedValue({ digest: '0xwithdraw123', amount: 25 }),
    borrow: vi.fn().mockResolvedValue({ digest: '0xborrow123', amount: 5 }),
    repay: vi.fn().mockResolvedValue({ digest: '0xrepay123', amount: 5 }),
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

  it('lists all 16 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(16);

    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      't2000_address',
      't2000_balance',
      't2000_borrow',
      't2000_config',
      't2000_earnings',
      't2000_exchange',
      't2000_health',
      't2000_history',
      't2000_lock',
      't2000_positions',
      't2000_rates',
      't2000_rebalance',
      't2000_repay',
      't2000_save',
      't2000_send',
      't2000_withdraw',
    ]);
  });

  it('lists all 3 prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts).toHaveLength(3);

    const names = prompts.map(p => p.name).sort();
    expect(names).toEqual(['financial-report', 'optimize-yield', 'send-money']);
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
      text: expect.stringContaining('t2000_balance'),
    });
  });
});
