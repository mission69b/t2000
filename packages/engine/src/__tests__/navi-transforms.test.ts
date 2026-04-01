import { describe, it, expect } from 'vitest';
import {
  transformRates,
  transformPositions,
  transformHealthFactor,
  transformBalance,
  transformSavings,
  transformRewards,
  extractMcpText,
  parseMcpJson,
  type NaviRawPool,
  type NaviRawPositionsResponse,
  type NaviRawHealthFactor,
  type NaviRawCoin,
  type NaviRawRewardsResponse,
} from '../navi-transforms.js';

// ---------------------------------------------------------------------------
// Fixtures — shapes as observed from live NAVI MCP discovery
// ---------------------------------------------------------------------------

const POOLS: NaviRawPool[] = [
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
  {
    id: 2,
    symbol: 'WBTC',
    coinType: '0x0041::wbtc::WBTC',
    price: '68000',
    market: 'main',
    ltv: 0.55,
    liquidation: { bonus: '0.15', ratio: '0.35', threshold: '0.65' },
    supply: '100',
    borrow: '20',
    supplyApy: '1.20',
    borrowApy: '3.40',
  },
];

const POSITIONS_RESPONSE: NaviRawPositionsResponse = {
  address: '0xabc',
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
      type: 'navi-lending-supply',
      market: 'main',
      tokenASymbol: 'SUI',
      tokenAPrice: 3.5,
      amountA: '1000.00',
      valueUSD: '3500.00',
      apr: '3.25',
      liquidationThreshold: '0.80',
    },
    {
      id: 'pos-3',
      protocol: 'navi',
      type: 'navi-lending-borrow',
      market: 'main',
      tokenASymbol: 'USDC',
      tokenAPrice: 1.0,
      amountA: '2000.00',
      valueUSD: '2000.00',
      apr: '6.80',
      liquidationThreshold: '0.85',
    },
  ],
};

const HEALTH_FACTOR: NaviRawHealthFactor = {
  address: '0xabc',
  healthFactor: 2.45,
};

const COINS: NaviRawCoin[] = [
  {
    coinType: '0x2::sui::SUI',
    totalBalance: '10000000000',
    coinObjectCount: 3,
    symbol: 'SUI',
    decimals: 9,
  },
  {
    coinType: '0xdba::usdc::USDC',
    totalBalance: '500000000',
    coinObjectCount: 1,
    symbol: 'USDC',
    decimals: 6,
  },
];

const REWARDS: NaviRawRewardsResponse = {
  address: '0xabc',
  rewards: [
    { pool: 'USDC', rewardType: 'supply', amount: '100.5', symbol: 'NAVX' },
    { pool: 'SUI', rewardType: 'supply', amount: '50.0', symbol: 'SUI' },
  ],
  summary: [
    { symbol: 'NAVX', totalAmount: '100.5', valueUSD: '15.20' },
    { symbol: 'SUI', totalAmount: '50.0', valueUSD: '175.00' },
  ],
};

// ---------------------------------------------------------------------------
// Tests: transformRates
// ---------------------------------------------------------------------------

describe('transformRates', () => {
  it('converts pool APYs from percentages to decimals', () => {
    const rates = transformRates(POOLS);

    expect(rates.SUI).toEqual({
      saveApy: 0.0325,
      borrowApy: 0.051,
      ltv: 0.65,
      price: 3.5,
    });
    expect(rates.USDC).toEqual({
      saveApy: 0.045,
      borrowApy: 0.068,
      ltv: 0.8,
      price: 1.0,
    });
    expect(rates.WBTC.saveApy).toBeCloseTo(0.012);
  });

  it('returns empty object for null/undefined/non-array input', () => {
    expect(transformRates(null)).toEqual({});
    expect(transformRates(undefined)).toEqual({});
    expect(transformRates('garbage')).toEqual({});
    expect(transformRates(42)).toEqual({});
  });

  it('skips pools with empty symbol', () => {
    const pools = [{ ...POOLS[0], symbol: '' }];
    expect(transformRates(pools)).toEqual({});
  });

  it('handles malformed APY values', () => {
    const pools = [{ ...POOLS[0], supplyApy: 'abc', borrowApy: null as unknown as string }];
    const rates = transformRates(pools);
    expect(rates.SUI.saveApy).toBe(0);
    expect(rates.SUI.borrowApy).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: transformPositions
// ---------------------------------------------------------------------------

describe('transformPositions', () => {
  it('maps supply and borrow positions', () => {
    const positions = transformPositions(POSITIONS_RESPONSE);
    expect(positions).toHaveLength(3);

    const supply = positions.filter((p) => p.type === 'supply');
    expect(supply).toHaveLength(2);
    expect(supply[0].symbol).toBe('USDC');
    expect(supply[0].valueUsd).toBe(5000);
    expect(supply[0].apy).toBeCloseTo(0.045);

    const borrow = positions.filter((p) => p.type === 'borrow');
    expect(borrow).toHaveLength(1);
    expect(borrow[0].symbol).toBe('USDC');
    expect(borrow[0].valueUsd).toBe(2000);
  });

  it('handles raw position array without wrapper', () => {
    const positions = transformPositions(POSITIONS_RESPONSE.positions);
    expect(positions).toHaveLength(3);
  });

  it('returns empty array for null/undefined', () => {
    expect(transformPositions(null)).toEqual([]);
    expect(transformPositions(undefined)).toEqual([]);
  });

  it('handles position with missing fields', () => {
    const raw: NaviRawPositionsResponse = {
      address: '0xabc',
      positions: [
        {
          id: 'p1',
          protocol: 'navi',
          type: 'navi-lending-supply',
          market: 'main',
          tokenASymbol: 'SUI',
          tokenAPrice: 3.5,
          amountA: '100',
          valueUSD: '350',
          apr: '3.0',
          liquidationThreshold: '0.8',
          tokenBSymbol: null,
          amountB: null,
          claimableRewards: null,
        },
      ],
    };
    const positions = transformPositions(raw);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('SUI');
  });
});

// ---------------------------------------------------------------------------
// Tests: transformHealthFactor
// ---------------------------------------------------------------------------

describe('transformHealthFactor', () => {
  it('combines health factor with position data', () => {
    const result = transformHealthFactor(HEALTH_FACTOR, POSITIONS_RESPONSE);

    expect(result.healthFactor).toBe(2.45);
    expect(result.supplied).toBe(8500); // 5000 + 3500
    expect(result.borrowed).toBe(2000);
    expect(result.maxBorrow).toBeGreaterThan(0);
    expect(result.liquidationThreshold).toBeGreaterThan(0);
  });

  it('returns Infinity HF when no borrows', () => {
    const noDebtPositions: NaviRawPositionsResponse = {
      address: '0xabc',
      positions: [POSITIONS_RESPONSE.positions[0]],
    };
    const result = transformHealthFactor(
      { address: '0xabc', healthFactor: null },
      noDebtPositions,
    );
    expect(result.healthFactor).toBe(Infinity);
    expect(result.borrowed).toBe(0);
    expect(result.supplied).toBe(5000);
  });

  it('handles null health factor with active borrows', () => {
    const result = transformHealthFactor(
      { address: '0xabc', healthFactor: null },
      POSITIONS_RESPONSE,
    );
    // HF null + borrowed > 0 → 0 (risky)
    expect(result.healthFactor).toBe(0);
  });

  it('calculates weighted liquidation threshold', () => {
    const result = transformHealthFactor(HEALTH_FACTOR, POSITIONS_RESPONSE);
    // USDC: 5000 * 0.85 = 4250, SUI: 3500 * 0.80 = 2800
    // weighted = (4250 + 2800) / 8500 = 0.82941...
    expect(result.liquidationThreshold).toBeCloseTo(0.8294, 3);
  });

  it('handles empty positions', () => {
    const result = transformHealthFactor(
      { address: '0xabc', healthFactor: null },
      { address: '0xabc', positions: [] },
    );
    expect(result.supplied).toBe(0);
    expect(result.borrowed).toBe(0);
    expect(result.healthFactor).toBe(Infinity);
    expect(result.liquidationThreshold).toBe(0);
    expect(result.maxBorrow).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: transformBalance
// ---------------------------------------------------------------------------

const PRICES = { SUI: 3.5, USDC: 1.0, WBTC: 68000 };

describe('transformBalance', () => {
  it('aggregates wallet coins in USD using prices', () => {
    const result = transformBalance(COINS, POSITIONS_RESPONSE, REWARDS, PRICES);

    // SUI: 10 SUI, 0.05 gas reserve → (10 - 0.05) * 3.5 = 34.825 available, 0.05 * 3.5 = 0.175 reserve
    // USDC: 500 * 1.0 = 500 available
    expect(result.available).toBeCloseTo(34.825 + 500, 2);
    expect(result.gasReserve).toBeCloseTo(0.175, 3);
    expect(result.savings).toBe(8500); // supply positions (already USD)
    expect(result.debt).toBe(2000); // borrow positions (already USD)
    expect(result.pendingRewards).toBeCloseTo(190.2); // 15.20 + 175.00
    expect(result.stables).toBeCloseTo(500);
  });

  it('uses stablecoin fallback price of 1.0 when no prices provided', () => {
    const result = transformBalance(COINS, POSITIONS_RESPONSE, REWARDS);

    // SUI: no price → 0 USD, USDC: stablecoin fallback → 500 * 1.0
    expect(result.available).toBeCloseTo(500, 1);
    expect(result.gasReserve).toBe(0); // SUI has 0 price
    expect(result.stables).toBeCloseTo(500);
  });

  it('handles empty inputs', () => {
    const result = transformBalance([], { address: '0x', positions: [] }, {
      address: '0x',
      rewards: [],
      summary: [],
    }, {});
    expect(result.available).toBe(0);
    expect(result.savings).toBe(0);
    expect(result.debt).toBe(0);
    expect(result.pendingRewards).toBe(0);
    expect(result.total).toBe(0);
  });

  it('handles null/undefined inputs defensively', () => {
    const result = transformBalance(null, null, null);
    expect(result.available).toBe(0);
    expect(result.total).toBe(0);
  });

  it('tracks SUI gas reserve in USD', () => {
    const smallSui: NaviRawCoin[] = [
      { coinType: '0x2::sui::SUI', totalBalance: '10000000', coinObjectCount: 1, symbol: 'SUI', decimals: 9 },
    ];
    const result = transformBalance(smallSui, { address: '0x', positions: [] }, {
      address: '0x', rewards: [], summary: [],
    }, { SUI: 3.5 });
    // 0.01 SUI total, reserve capped to 0.01, at $3.50 = $0.035
    expect(result.gasReserve).toBeCloseTo(0.035, 3);
    expect(result.available).toBeCloseTo(0);
  });
});

describe('transformRewards', () => {
  it('maps reward summary to PendingReward[]', () => {
    const rewards = transformRewards(REWARDS);
    expect(rewards).toHaveLength(2);
    expect(rewards[0]).toEqual({ symbol: 'NAVX', totalAmount: 100.5, valueUsd: 15.2 });
    expect(rewards[1]).toEqual({ symbol: 'SUI', totalAmount: 50, valueUsd: 175 });
  });

  it('returns empty array for null/undefined', () => {
    expect(transformRewards(null)).toEqual([]);
    expect(transformRewards(undefined)).toEqual([]);
  });

  it('handles missing fields', () => {
    const rewards = transformRewards({ summary: [{ symbol: 'X' }] });
    expect(rewards).toHaveLength(1);
    expect(rewards[0].totalAmount).toBe(0);
    expect(rewards[0].valueUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: transformSavings
// ---------------------------------------------------------------------------

describe('transformSavings', () => {
  it('computes weighted APY and projected earnings', () => {
    const result = transformSavings(POSITIONS_RESPONSE, POOLS);

    expect(result.positions).toHaveLength(3);
    expect(result.earnings.supplied).toBe(8500);
    expect(result.earnings.currentApy).toBeGreaterThan(0);
    expect(result.earnings.dailyEarning).toBeGreaterThan(0);
    expect(result.fundStatus.projectedMonthly).toBeGreaterThan(0);
  });

  it('uses pool rates over position APR when available', () => {
    const result = transformSavings(POSITIONS_RESPONSE, POOLS);
    // USDC pool saveApy = 4.5%, SUI pool saveApy = 3.25%
    // Weighted: (5000 * 0.045 + 3500 * 0.0325) / 8500
    const expectedApy = (5000 * 0.045 + 3500 * 0.0325) / 8500;
    expect(result.earnings.currentApy).toBeCloseTo(expectedApy, 4);
  });

  it('handles no supply positions', () => {
    const noPosResponse: NaviRawPositionsResponse = {
      address: '0xabc',
      positions: [],
    };
    const result = transformSavings(noPosResponse, POOLS);
    expect(result.earnings.supplied).toBe(0);
    expect(result.earnings.currentApy).toBe(0);
    expect(result.earnings.dailyEarning).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: MCP text extraction helpers
// ---------------------------------------------------------------------------

describe('extractMcpText', () => {
  it('extracts and joins text content blocks', () => {
    const content = [
      { type: 'text', text: '{"foo": 1}' },
      { type: 'image', data: 'binary' },
      { type: 'text', text: '{"bar": 2}' },
    ];
    expect(extractMcpText(content)).toBe('{"foo": 1}\n{"bar": 2}');
  });

  it('handles empty content', () => {
    expect(extractMcpText([])).toBe('');
  });

  it('skips text blocks with missing text', () => {
    const content = [{ type: 'text' }, { type: 'text', text: 'ok' }];
    expect(extractMcpText(content)).toBe('ok');
  });
});

describe('parseMcpJson', () => {
  it('parses valid JSON from text content', () => {
    const content = [{ type: 'text', text: '{"a": 1}' }];
    expect(parseMcpJson(content)).toEqual({ a: 1 });
  });

  it('returns raw text when JSON parse fails', () => {
    const content = [{ type: 'text', text: 'not json' }];
    expect(parseMcpJson(content)).toBe('not json');
  });
});
