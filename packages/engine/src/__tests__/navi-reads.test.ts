import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { McpClientManager } from '../mcp-client.js';
import { NAVI_SERVER_NAME, NaviTools } from '../navi-config.js';
import {
  fetchRates,
  fetchHealthFactor,
  fetchBalance,
  fetchSavings,
  fetchPositions,
  fetchAvailableRewards,
  fetchProtocolStats,
  _resetNaviCircuitBreaker,
} from '../navi-reads.js';
import {
  InMemoryNaviCacheStore,
  setNaviCacheStore,
  resetNaviCacheStore,
  naviKey,
} from '../navi-cache.js';

// Reset cache and CB state between every test case so successful tests
// don't contaminate error-handling tests with cached results.
beforeEach(() => {
  resetNaviCacheStore();
  _resetNaviCircuitBreaker();
});
afterEach(() => {
  resetNaviCacheStore();
  _resetNaviCircuitBreaker();
});

// ---------------------------------------------------------------------------
// Mock NAVI MCP server with realistic fixtures
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
  address: '0xuser',
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

const MOCK_HEALTH_FACTOR = {
  address: '0xuser',
  healthFactor: 3.8,
};

const MOCK_COINS = [
  {
    coinType: '0x2::sui::SUI',
    totalBalance: '5000000000',
    coinObjectCount: 2,
    symbol: 'SUI',
    decimals: 9,
  },
  {
    coinType: '0xdba::usdc::USDC',
    totalBalance: '250000000',
    coinObjectCount: 1,
    symbol: 'USDC',
    decimals: 6,
  },
];

const MOCK_REWARDS = {
  address: '0xuser',
  rewards: [
    { pool: 'USDC', rewardType: 'supply', amount: '50.0', symbol: 'NAVX' },
  ],
  summary: [
    { symbol: 'NAVX', totalAmount: '50.0', valueUSD: '8.50' },
  ],
};

const MOCK_STATS = {
  tvl: 262000000,
  totalBorrowUsd: 90000000,
  averageUtilization: 0.34,
  maxApy: 31.9,
  userAmount: 177000,
  interactionUserAmount: 4800,
  borrowFee: 0.002,
};

function createMockNaviServer(): McpServer {
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
    content: [{ type: 'text' as const, text: JSON.stringify(MOCK_STATS) }],
  }));

  return server;
}

// ---------------------------------------------------------------------------
// Test setup — connect manager to mock server via in-memory transport
// ---------------------------------------------------------------------------

let manager: McpClientManager;
let mockServer: McpServer;

beforeAll(async () => {
  mockServer = createMockNaviServer();
  manager = new McpClientManager({ cacheTtlMs: 100 });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} },
  );

  await Promise.all([
    client.connect(clientTransport),
    mockServer.connect(serverTransport),
  ]);

  // Manually register the connection with the correct tools
  const { tools } = await client.listTools();
  const conn = {
    config: {
      name: NAVI_SERVER_NAME,
      url: 'memory://mock',
      readOnly: true,
      cacheTtlMs: 100,
    },
    client,
    transport: clientTransport,
    tools,
    status: 'connected' as const,
  };
  // @ts-expect-error — accessing private map for test injection
  manager.connections.set(NAVI_SERVER_NAME, conn);
});

afterAll(async () => {
  await manager.disconnectAll();
});

// ---------------------------------------------------------------------------
// Tests: fetchRates
// ---------------------------------------------------------------------------

describe('fetchRates', () => {
  it('returns rates keyed by symbol', async () => {
    const rates = await fetchRates(manager);

    expect(rates.SUI).toBeDefined();
    expect(rates.USDC).toBeDefined();
    expect(rates.SUI.saveApy).toBeCloseTo(0.0325);
    expect(rates.USDC.borrowApy).toBeCloseTo(0.068);
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchHealthFactor
// ---------------------------------------------------------------------------

describe('fetchHealthFactor', () => {
  it('returns enriched health factor with position data', async () => {
    const hf = await fetchHealthFactor(manager, '0xuser');

    expect(hf.healthFactor).toBe(3.8);
    expect(hf.supplied).toBe(5000); // one supply position
    expect(hf.borrowed).toBe(1000); // one borrow position
    expect(hf.maxBorrow).toBeGreaterThan(0);
    expect(hf.liquidationThreshold).toBeCloseTo(0.85);
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchBalance
// ---------------------------------------------------------------------------

describe('fetchBalance', () => {
  it('aggregates coins, positions, and rewards in USD', async () => {
    const balance = await fetchBalance(manager, '0xuser');

    // SUI: 5 SUI at $3.50, 0.05 gas reserve → (5 - 0.05) * 3.5 = 17.325 available
    // USDC: 250 at $1.00 = 250 available
    expect(balance.available).toBeCloseTo(17.325 + 250, 1);
    expect(balance.gasReserve).toBeCloseTo(0.05 * 3.5, 2);
    expect(balance.savings).toBe(5000);
    expect(balance.debt).toBe(1000);
    expect(balance.pendingRewards).toBeCloseTo(8.5);
    expect(balance.stables).toBeCloseTo(250);
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchSavings
// ---------------------------------------------------------------------------

describe('fetchSavings', () => {
  it('returns positions with computed earnings', async () => {
    const savings = await fetchSavings(manager, '0xuser');

    expect(savings.positions).toHaveLength(2);
    expect(savings.earnings.supplied).toBe(5000);
    expect(savings.earnings.currentApy).toBeCloseTo(0.045);
    expect(savings.earnings.dailyEarning).toBeGreaterThan(0);
    expect(savings.fundStatus.projectedMonthly).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchPositions
// ---------------------------------------------------------------------------

describe('fetchPositions', () => {
  it('returns typed position entries', async () => {
    const positions = await fetchPositions(manager, '0xuser');

    expect(positions).toHaveLength(2);
    expect(positions[0].type).toBe('supply');
    expect(positions[1].type).toBe('borrow');
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchAvailableRewards
// ---------------------------------------------------------------------------

describe('fetchAvailableRewards', () => {
  it('returns PendingReward[] via transformRewards', async () => {
    const rewards = await fetchAvailableRewards(manager, '0xuser');

    expect(rewards).toHaveLength(1);
    expect(rewards[0].symbol).toBe('NAVX');
    expect(rewards[0].totalAmount).toBe(50);
    expect(rewards[0].valueUsd).toBeCloseTo(8.5);
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchProtocolStats
// ---------------------------------------------------------------------------

describe('fetchProtocolStats', () => {
  it('returns protocol statistics', async () => {
    const stats = await fetchProtocolStats(manager);

    expect(stats.tvl).toBe(262000000);
    expect(stats.totalBorrowUsd).toBe(90000000);
    expect(stats.utilization).toBeCloseTo(0.34);
    expect(stats.maxApy).toBe(31.9);
    expect(stats.totalUsers).toBe(177000);
  });
});

// ---------------------------------------------------------------------------
// Tests: error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('throws on disconnected server', async () => {
    const emptyManager = new McpClientManager();
    await expect(fetchRates(emptyManager)).rejects.toThrow(/not connected/);
  });

  it('accepts custom server name via options', async () => {
    const emptyManager = new McpClientManager();
    await expect(
      fetchRates(emptyManager, { serverName: 'custom' }),
    ).rejects.toThrow(/custom.*not connected/);
  });

  it('propagates MCP error responses', async () => {
    const errorServer = new McpServer(
      { name: 'error-navi', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    errorServer.tool(NaviTools.GET_POOLS, 'Fail', {}, async () => ({
      content: [{ type: 'text' as const, text: 'rate limit exceeded' }],
      isError: true,
    }));

    const errManager = new McpClientManager({ cacheTtlMs: 0 });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const errClient = new Client({ name: 'err-client', version: '1.0.0' }, { capabilities: {} });
    await Promise.all([errClient.connect(ct), errorServer.connect(st)]);
    const { tools } = await errClient.listTools();

    // @ts-expect-error — injecting connection for test
    errManager.connections.set(NAVI_SERVER_NAME, {
      config: { name: NAVI_SERVER_NAME, url: 'memory://err', readOnly: true, cacheTtlMs: 0 },
      client: errClient,
      transport: ct,
      tools,
      status: 'connected',
    });

    await expect(fetchRates(errManager)).rejects.toThrow(/NAVI MCP error.*rate limit/);

    await errManager.disconnectAll();
  });
});

// ---------------------------------------------------------------------------
// Tests: cache (PR 4)
// ---------------------------------------------------------------------------

describe('cache behaviour (PR 4)', () => {
  let store: InMemoryNaviCacheStore;

  beforeEach(() => {
    store = new InMemoryNaviCacheStore();
    setNaviCacheStore(store);
    _resetNaviCircuitBreaker();
  });

  afterEach(() => {
    resetNaviCacheStore();
    _resetNaviCircuitBreaker();
  });

  it('fetchRates: cache hit → no MCP call on second fetch', async () => {
    const callSpy = vi.spyOn(manager, 'callTool');

    // First call — populates cache
    await fetchRates(manager);
    const firstCallCount = callSpy.mock.calls.length;

    // Second call — should be served from cache
    await fetchRates(manager);
    expect(callSpy.mock.calls.length).toBe(firstCallCount); // no new calls

    callSpy.mockRestore();
  });

  it('fetchRates: skipCache=true bypasses the cache', async () => {
    // Populate cache
    await fetchRates(manager);

    const callSpy = vi.spyOn(manager, 'callTool');
    await fetchRates(manager, { skipCache: true });
    expect(callSpy.mock.calls.length).toBeGreaterThan(0); // made a real call

    callSpy.mockRestore();
  });

  it('fetchHealthFactor: cache hit → no MCP call on second fetch', async () => {
    const callSpy = vi.spyOn(manager, 'callTool');

    await fetchHealthFactor(manager, '0xuser');
    const firstCallCount = callSpy.mock.calls.length;

    await fetchHealthFactor(manager, '0xuser');
    expect(callSpy.mock.calls.length).toBe(firstCallCount);

    callSpy.mockRestore();
  });

  it('fetchSavings: different addresses have independent cache entries', async () => {
    await fetchSavings(manager, '0xaaa');
    await fetchSavings(manager, '0xbbb');

    const cachedAaa = await store.get(naviKey.savings('0xaaa'));
    const cachedBbb = await store.get(naviKey.savings('0xbbb'));
    expect(cachedAaa).not.toBeNull();
    expect(cachedBbb).not.toBeNull();
  });

  it('fetchRates: expired cache entry triggers re-fetch', async () => {
    // Manually insert a stale entry (already expired)
    await store.set(naviKey.rates(), { data: { STALE: {} }, cachedAt: Date.now() - 99999 }, -1);

    const callSpy = vi.spyOn(manager, 'callTool');
    // TTL=-1 means already expired; store.get should return null → re-fetch
    await fetchRates(manager);
    expect(callSpy.mock.calls.length).toBeGreaterThan(0);

    callSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Tests: circuit breaker (PR 4)
// ---------------------------------------------------------------------------

describe('circuit breaker (PR 4)', () => {
  beforeEach(() => {
    _resetNaviCircuitBreaker();
    resetNaviCacheStore();
  });

  afterEach(() => {
    _resetNaviCircuitBreaker();
    resetNaviCacheStore();
  });

  it('circuit breaker opens after 10 consecutive errors and blocks further calls', async () => {
    // Build an error server
    const cbServer = new McpServer({ name: 'cb-navi', version: '1.0.0' }, { capabilities: { tools: {} } });
    let callCount = 0;
    cbServer.tool(NaviTools.GET_POOLS, 'Always fail', {}, async () => {
      callCount++;
      return { content: [{ type: 'text' as const, text: 'rate limit' }], isError: true };
    });

    const cbManager = new McpClientManager({ cacheTtlMs: 0 });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const cbClient = new Client({ name: 'cb-client', version: '1.0.0' }, { capabilities: {} });
    await Promise.all([cbClient.connect(ct), cbServer.connect(st)]);
    const { tools } = await cbClient.listTools();

    // @ts-expect-error — injecting connection
    cbManager.connections.set(NAVI_SERVER_NAME, {
      config: { name: NAVI_SERVER_NAME, url: 'memory://cb', readOnly: true, cacheTtlMs: 0 },
      client: cbClient, transport: ct, tools, status: 'connected',
    });

    // Fire enough calls to open the CB (NAVI_CB_THRESHOLD=10 within 5s)
    for (let i = 0; i < 10; i++) {
      await fetchRates(cbManager, { skipCache: true }).catch(() => {});
    }

    // CB should now be open — next call should throw without hitting the server
    const preCbCallCount = callCount;
    await expect(fetchRates(cbManager, { skipCache: true })).rejects.toThrow(/circuit breaker open/);
    expect(callCount).toBe(preCbCallCount); // no new server call

    await cbManager.disconnectAll();
  });
});
