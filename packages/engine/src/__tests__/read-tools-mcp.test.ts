import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { McpClientManager } from '../mcp-client.js';
import { NAVI_SERVER_NAME, NaviTools } from '../navi-config.js';
import type { ToolContext } from '../types.js';
import { hasNaviMcp } from '../tools/utils.js';

import { balanceCheckTool } from '../tools/balance.js';
import { savingsInfoTool } from '../tools/savings.js';
import { healthCheckTool } from '../tools/health.js';
import { ratesInfoTool } from '../tools/rates.js';

vi.mock('../defillama-prices.js', () => ({
  fetchTokenPrices: vi.fn(async () => ({
    '0x2::sui::SUI': 3.50,
    '0xdba::usdc::USDC': 1.00,
  })),
}));

// ---------------------------------------------------------------------------
// Mock NAVI MCP server fixtures
// ---------------------------------------------------------------------------

const MOCK_POOLS = [
  {
    id: 0,
    symbol: 'SUI',
    coinType: '0x2::sui::SUI',
    price: '3.50',
    market: 'main',
    ltv: 0.65,
    liquidation: { bonus: '0.1', ratio: '0.35', threshold: '0.8' },
    supply: '50000000',
    borrow: '10000000',
    supplyApy: '3.25',
    borrowApy: '5.10',
  },
  {
    id: 1,
    symbol: 'USDC',
    coinType: '0xdba::usdc::USDC',
    price: '1.00',
    market: 'main',
    ltv: 0.8,
    liquidation: { bonus: '0.05', ratio: '0.3', threshold: '0.85' },
    supply: '100000000',
    borrow: '40000000',
    supplyApy: '4.50',
    borrowApy: '6.80',
  },
];

const MOCK_POSITIONS = {
  address: '0xuser123',
  positions: [
    {
      id: 'pos-1',
      protocol: 'navi',
      type: 'navi-lending-supply',
      market: 'main',
      tokenASymbol: 'USDC',
      tokenAPrice: 1.0,
      amountA: '5000.00',
      valueUSD: '5000.00',
      apr: '4.50',
      liquidationThreshold: '0.85',
    },
    {
      id: 'pos-2',
      protocol: 'navi',
      type: 'navi-lending-borrow',
      market: 'main',
      tokenASymbol: 'USDC',
      tokenAPrice: 1.0,
      amountA: '1000.00',
      valueUSD: '1000.00',
      apr: '6.80',
      liquidationThreshold: '0.85',
    },
  ],
};

const MOCK_HEALTH_FACTOR = { address: '0xuser123', healthFactor: 3.8 };

const MOCK_COINS = [
  { coinType: '0x2::sui::SUI', totalBalance: '5000000000', coinObjectCount: 2, symbol: 'SUI', decimals: 9 },
  { coinType: '0xdba::usdc::USDC', totalBalance: '250000000', coinObjectCount: 1, symbol: 'USDC', decimals: 6 },
];

const MOCK_REWARDS = {
  address: '0xuser123',
  rewards: [{ pool: 'USDC', rewardType: 'supply', amount: '50.0', symbol: 'NAVX' }],
  summary: [{ symbol: 'NAVX', totalAmount: '50.0', valueUSD: '8.50' }],
};

// ---------------------------------------------------------------------------
// Setup: mock MCP server + manager
// ---------------------------------------------------------------------------

let manager: McpClientManager;

function mcpContext(): ToolContext {
  return {
    mcpManager: manager,
    walletAddress: '0xuser123',
  };
}

function sdkContext(): ToolContext {
  return {
    agent: mockAgent(),
  };
}

function mockAgent() {
  return {
    balance: async () => ({
      available: 500,
      savings: 5000,
      debt: 1000,
      pendingRewards: 8.5,
      gasReserve: 0.18,
      total: 4508.68,
      stables: 500,
    }),
    positions: async () => ({
      positions: [
        { protocol: 'navi', type: 'supply', symbol: 'USDC', amount: 5000, valueUsd: 5000 },
      ],
    }),
    earnings: async () => ({
      totalYieldEarned: 42.5,
      currentApy: 0.045,
      dailyEarning: 0.62,
      supplied: 5000,
    }),
    fundStatus: async () => ({
      supplied: 5000,
      apy: 0.045,
      earnedToday: 0.62,
      earnedAllTime: 42.5,
      projectedMonthly: 18.75,
    }),
    healthFactor: async () => ({
      healthFactor: 3.8,
      supplied: 5000,
      borrowed: 1000,
      maxBorrow: 3250,
      liquidationThreshold: 0.85,
    }),
    rates: async () => ({
      SUI: { saveApy: 0.0325, borrowApy: 0.051 },
      USDC: { saveApy: 0.045, borrowApy: 0.068 },
    }),
  };
}

beforeAll(async () => {
  const server = new McpServer(
    { name: 'mock-navi', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.tool(NaviTools.GET_POOLS, 'Get pools', {}, async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify(MOCK_POOLS) }],
  }));
  server.tool(NaviTools.GET_HEALTH_FACTOR, 'Get HF', { address: z.string() }, async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify(MOCK_HEALTH_FACTOR) }],
  }));
  server.tool(NaviTools.GET_POSITIONS, 'Get positions', { address: z.string() }, async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify(MOCK_POSITIONS) }],
  }));
  server.tool(NaviTools.GET_COINS, 'Get coins', { address: z.string() }, async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify(MOCK_COINS) }],
  }));
  server.tool(NaviTools.GET_AVAILABLE_REWARDS, 'Get rewards', { address: z.string() }, async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify(MOCK_REWARDS) }],
  }));
  server.tool(NaviTools.GET_PROTOCOL_STATS, 'Get stats', {}, async () => ({
    content: [{ type: 'text' as const, text: '{}' }],
  }));

  manager = new McpClientManager({ cacheTtlMs: 100 });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const { tools } = await client.listTools();
  // @ts-expect-error — accessing private map for test injection
  manager.connections.set(NAVI_SERVER_NAME, {
    config: { name: NAVI_SERVER_NAME, url: 'memory://mock', readOnly: true, cacheTtlMs: 100 },
    client,
    transport: clientTransport,
    tools,
    status: 'connected',
  });
});

afterAll(async () => {
  await manager.disconnectAll();
});

// ---------------------------------------------------------------------------
// Tests: hasNaviMcp utility
// ---------------------------------------------------------------------------

describe('hasNaviMcp', () => {
  it('returns true when mcpManager has NAVI connection and walletAddress is set', () => {
    expect(hasNaviMcp(mcpContext())).toBe(true);
  });

  it('returns false when mcpManager is missing', () => {
    expect(hasNaviMcp({ walletAddress: '0xabc' })).toBe(false);
  });

  it('returns false when walletAddress is missing', () => {
    expect(hasNaviMcp({ mcpManager: manager })).toBe(false);
  });

  it('returns false for empty context (SDK-only mode)', () => {
    expect(hasNaviMcp(sdkContext())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: balance_check tool
// ---------------------------------------------------------------------------

describe('balance_check', () => {
  it('uses MCP when NAVI connection is available', async () => {
    const result = await balanceCheckTool.call({}, mcpContext());
    const data = result.data as unknown as Record<string, number>;

    expect(data.savings).toBe(5000);
    expect(data.debt).toBe(1000);
    expect(data.pendingRewards).toBeCloseTo(8.5);
    expect(data.available).toBeGreaterThan(0);
    expect(result.displayText).toContain('Balance:');
  });

  it('falls back to SDK when no MCP connection', async () => {
    const result = await balanceCheckTool.call({}, sdkContext());
    const data = result.data as unknown as Record<string, number>;

    expect(data.available).toBe(500);
    expect(data.savings).toBe(5000);
    expect(data.total).toBeCloseTo(4508.68);
    expect(result.displayText).toContain('Balance:');
  });

  it('normalizes SDK GasReserve object to number', async () => {
    const agentWithObjReserve = {
      ...mockAgent(),
      balance: async () => ({
        available: 500,
        savings: 5000,
        debt: 1000,
        pendingRewards: 8.5,
        gasReserve: { sui: 0.05, usdEquiv: 0.18 },
        total: 4508.68,
        stables: { USDC: 300, USDT: 200 },
      }),
    };
    const ctx: ToolContext = { agent: agentWithObjReserve };
    const result = await balanceCheckTool.call({}, ctx);
    const data = result.data as unknown as Record<string, number>;

    expect(data.gasReserve).toBeCloseTo(0.18);
    expect(data.stables).toBeCloseTo(500);
  });

  it('throws when neither MCP nor SDK is available', async () => {
    await expect(balanceCheckTool.call({}, {})).rejects.toThrow(/agent/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: savings_info tool
// ---------------------------------------------------------------------------

describe('savings_info', () => {
  it('uses MCP when NAVI connection is available', async () => {
    const result = await savingsInfoTool.call({}, mcpContext());
    const data = result.data as {
      positions: unknown[];
      earnings: { supplied: number; currentApy: number };
      fundStatus: { projectedMonthly: number };
    };

    expect(data.positions).toHaveLength(2);
    expect(data.earnings.supplied).toBe(5000);
    expect(data.earnings.currentApy).toBeCloseTo(0.045);
    expect(data.fundStatus.projectedMonthly).toBeGreaterThan(0);
  });

  it('falls back to SDK when no MCP connection', async () => {
    const result = await savingsInfoTool.call({}, sdkContext());
    const data = result.data as {
      earnings: { totalYieldEarned: number; currentApy: number };
      fundStatus: { earnedAllTime: number };
    };

    expect(data.earnings.totalYieldEarned).toBe(42.5);
    expect(data.earnings.currentApy).toBe(0.045);
    expect(data.fundStatus.earnedAllTime).toBe(42.5);
  });
});

// ---------------------------------------------------------------------------
// Tests: health_check tool
// ---------------------------------------------------------------------------

describe('health_check', () => {
  it('uses MCP when NAVI connection is available', async () => {
    const result = await healthCheckTool.call({}, mcpContext());
    const data = result.data as {
      healthFactor: number;
      supplied: number;
      borrowed: number;
      status: string;
    };

    expect(data.healthFactor).toBe(3.8);
    expect(data.supplied).toBe(5000);
    expect(data.borrowed).toBe(1000);
    expect(data.status).toBe('healthy');
    expect(result.displayText).toContain('3.80');
    expect(result.displayText).toContain('healthy');
  });

  it('falls back to SDK when no MCP connection', async () => {
    const result = await healthCheckTool.call({}, sdkContext());
    const data = result.data as {
      healthFactor: number;
      maxBorrow: number;
      status: string;
    };

    expect(data.healthFactor).toBe(3.8);
    expect(data.maxBorrow).toBe(3250);
    expect(data.status).toBe('healthy');
  });

  it('handles Infinity HF display text', async () => {
    const noDebtMgr = new McpClientManager({ cacheTtlMs: 100 });
    const noDebtServer = new McpServer(
      { name: 'no-debt', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    const supplyOnly = {
      address: '0xuser123',
      positions: [MOCK_POSITIONS.positions[0]],
    };
    noDebtServer.tool(NaviTools.GET_HEALTH_FACTOR, 'HF', { address: z.string() }, async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ address: '0xuser123', healthFactor: null }) }],
    }));
    noDebtServer.tool(NaviTools.GET_POSITIONS, 'Pos', { address: z.string() }, async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(supplyOnly) }],
    }));

    const [ct, st] = InMemoryTransport.createLinkedPair();
    const cl = new Client({ name: 'cl', version: '1.0.0' }, { capabilities: {} });
    await Promise.all([cl.connect(ct), noDebtServer.connect(st)]);
    const { tools } = await cl.listTools();

    // @ts-expect-error — injecting connection
    noDebtMgr.connections.set(NAVI_SERVER_NAME, {
      config: { name: NAVI_SERVER_NAME, url: 'memory://x', readOnly: true, cacheTtlMs: 0 },
      client: cl, transport: ct, tools, status: 'connected',
    });

    const ctx: ToolContext = { mcpManager: noDebtMgr, walletAddress: '0xuser123' };
    const result = await healthCheckTool.call({}, ctx);
    const data = result.data as { healthFactor: number; status: string };

    expect(data.healthFactor).toBe(Infinity);
    expect(data.status).toBe('healthy');
    expect(result.displayText).toContain('∞');

    await noDebtMgr.disconnectAll();
  });
});

// ---------------------------------------------------------------------------
// Tests: rates_info tool
// ---------------------------------------------------------------------------

describe('rates_info', () => {
  it('uses MCP when NAVI connection is available', async () => {
    const result = await ratesInfoTool.call({}, mcpContext());
    const data = result.data as Record<string, { saveApy: number; borrowApy: number }>;

    expect(data.SUI).toBeDefined();
    expect(data.USDC).toBeDefined();
    expect(data.SUI.saveApy).toBeCloseTo(0.0325);
    expect(data.USDC.borrowApy).toBeCloseTo(0.068);
    expect(result.displayText).toContain('SUI');
    expect(result.displayText).toContain('USDC');
  });

  it('falls back to SDK when no MCP connection', async () => {
    const result = await ratesInfoTool.call({}, sdkContext());
    const data = result.data as Record<string, { saveApy: number; borrowApy: number }>;

    expect(data.SUI.saveApy).toBe(0.0325);
    expect(data.USDC.borrowApy).toBe(0.068);
    expect(result.displayText).toContain('Save');
    expect(result.displayText).toContain('Borrow');
  });

  it('rates_info does not require walletAddress for MCP path', async () => {
    const ctxNoAddr: ToolContext = { mcpManager: manager, walletAddress: '0xany' };
    const result = await ratesInfoTool.call({}, ctxNoAddr);
    const data = result.data as Record<string, { saveApy: number }>;
    expect(data.SUI.saveApy).toBeCloseTo(0.0325);
  });
});
