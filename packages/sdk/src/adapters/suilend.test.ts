import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuilendAdapter } from './suilend.js';
import type { SuiClient } from '@mysten/sui/client';
import { SUPPORTED_ASSETS } from '../constants.js';

const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;

function makeReserve(overrides: Record<string, unknown> = {}) {
  return {
    coinType: { name: USDC_TYPE },
    mintDecimals: 6,
    availableAmount: 800_000_000n,
    borrowedAmount: { value: BigInt(Math.round(200_000_000 * 1e18)) },
    ctokenSupply: 1_000_000_000n,
    unclaimedSpreadFees: { value: 0n },
    cumulativeBorrowRate: { value: BigInt(Math.round(1.05 * 1e18)) },
    price: { value: BigInt(1e18) },
    smoothedPrice: { value: BigInt(1e18) },
    priceIdentifier: { bytes: new Uint8Array(32) },
    config: {
      element: {
        openLtvPct: 70,
        closeLtvPct: 75,
        spreadFeeBps: 2000n,
        interestRateUtils: [0n, 80n, 100n],
        interestRateAprs: [200n, 800n, 5000n],
      },
    },
    ...overrides,
  };
}

function makeObligation(deposits: unknown[] = [], borrows: unknown[] = []) {
  return {
    id: 'obligation-1',
    deposits,
    borrows,
    userRewardManagers: [],
  };
}

const mockSuilendClient = {
  lendingMarket: {
    id: 'lending-market-1',
    $typeArgs: ['0xfoo::suilend::MAIN_POOL'],
    reserves: [makeReserve()],
  },
  createObligation: vi.fn(() => [{ kind: 'Result', index: 0 }]),
  deposit: vi.fn(),
  withdrawAndSendToUser: vi.fn(),
  getObligation: vi.fn(() => makeObligation()),
  findReserveArrayIndex: vi.fn(() => 0n),
};

vi.mock('@suilend/sdk', () => ({
  SuilendClient: {
    initialize: vi.fn(async () => mockSuilendClient),
    getObligationOwnerCaps: vi.fn(async () => []),
  },
  LENDING_MARKET_ID: 'mock-lending-market-id',
  LENDING_MARKET_TYPE: 'mock-lending-market-type',
}));

const mockClient = {
  getCoins: vi.fn(async () => ({
    data: [{ coinObjectId: '0xusdc1', balance: '5000000' }],
    nextCursor: null,
    hasNextPage: false,
  })),
} as unknown as SuiClient;

describe('SuilendAdapter', () => {
  let adapter: SuilendAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSuilendClient.lendingMarket.reserves = [makeReserve()];
    mockSuilendClient.getObligation.mockResolvedValue(makeObligation());
    adapter = new SuilendAdapter();
    await adapter.init(mockClient);
  });

  describe('metadata', () => {
    it('has correct identity', () => {
      expect(adapter.id).toBe('suilend');
      expect(adapter.name).toBe('Suilend');
      expect(adapter.version).toBe('1.0.0');
    });

    it('supports save and withdraw only', () => {
      expect(adapter.capabilities).toContain('save');
      expect(adapter.capabilities).toContain('withdraw');
      expect(adapter.capabilities).not.toContain('borrow');
      expect(adapter.capabilities).not.toContain('repay');
    });

    it('does not support same-asset borrow', () => {
      expect(adapter.supportsSameAssetBorrow).toBe(false);
    });

    it('supports USDC', () => {
      expect(adapter.supportedAssets).toContain('USDC');
    });
  });

  describe('init', () => {
    it('initializes SuilendClient with correct parameters', async () => {
      const sdk = await import('@suilend/sdk') as any;
      expect(sdk.SuilendClient.initialize).toHaveBeenCalledWith(
        'mock-lending-market-id',
        'mock-lending-market-type',
        mockClient,
      );
    });

    it('lazy-initializes when called without explicit init', async () => {
      const lazyAdapter = new SuilendAdapter();
      lazyAdapter.initSync(mockClient);
      const rates = await lazyAdapter.getRates('USDC');
      expect(rates.asset).toBe('USDC');
      expect(rates.saveApy).toBeGreaterThan(0);
    });
  });

  describe('getRates', () => {
    it('returns computed rates for USDC', async () => {
      const rates = await adapter.getRates('USDC');
      expect(rates.asset).toBe('USDC');
      expect(rates.saveApy).toBeGreaterThan(0);
      expect(rates.borrowApy).toBeGreaterThan(0);
      expect(rates.borrowApy).toBeGreaterThan(rates.saveApy);
    });

    it('throws for unsupported asset', async () => {
      await expect(adapter.getRates('BTC')).rejects.toThrow('does not support');
    });

    it('computes utilization-based rates correctly', async () => {
      // Reserve: 800 USDC available, 200 USDC borrowed → 20% utilization
      // At 20% util: borrowApr should interpolate between 0% → 80% util breakpoints
      // interestRateAprs: [200, 800, 5000] → [2%, 8%, 50%] after /100
      // Linear interpolation between (0, 2%) and (80, 8%) at 20%:
      // t = 20/80 = 0.25, borrowApr = 2 + 0.25 * (8 - 2) = 3.5%
      const rates = await adapter.getRates('USDC');
      expect(rates.borrowApy).toBeCloseTo(3.5, 0);
    });
  });

  describe('getPositions', () => {
    it('returns empty positions when no obligation exists', async () => {
      const positions = await adapter.getPositions('0xuser');
      expect(positions.supplies).toHaveLength(0);
      expect(positions.borrows).toHaveLength(0);
    });

    it('parses deposits correctly', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValueOnce([
        { id: 'cap-1', obligationId: 'obligation-1' },
      ]);

      mockSuilendClient.getObligation.mockResolvedValueOnce(
        makeObligation([
          {
            coinType: { name: USDC_TYPE },
            depositedCtokenAmount: 100_000_000n,
            reserveArrayIndex: 0n,
          },
        ]),
      );

      const positions = await adapter.getPositions('0xuser');
      expect(positions.supplies).toHaveLength(1);
      expect(positions.supplies[0].asset).toBe('USDC');
      expect(positions.supplies[0].amount).toBeGreaterThan(0);
      expect(positions.supplies[0].apy).toBeGreaterThan(0);
    });

    it('parses borrows with compounded interest', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValueOnce([
        { id: 'cap-1', obligationId: 'obligation-1' },
      ]);

      const borrowedRaw = BigInt(Math.round(50_000_000 * 1e18));
      const posRate = BigInt(Math.round(1.0 * 1e18));

      mockSuilendClient.getObligation.mockResolvedValueOnce(
        makeObligation([], [
          {
            coinType: { name: USDC_TYPE },
            borrowedAmount: { value: borrowedRaw },
            cumulativeBorrowRate: { value: posRate },
            reserveArrayIndex: 0n,
          },
        ]),
      );

      const positions = await adapter.getPositions('0xuser');
      expect(positions.borrows).toHaveLength(1);
      expect(positions.borrows[0].asset).toBe('USDC');
      // 50 USDC borrowed, reserve cumRate=1.05, position cumRate=1.0 → compounded = 50 * 1.05 = 52.5
      expect(positions.borrows[0].amount).toBeCloseTo(52.5, 0);
    });
  });

  describe('getHealth', () => {
    it('returns Infinity health factor with no positions', async () => {
      const health = await adapter.getHealth('0xuser');
      expect(health.healthFactor).toBe(Infinity);
      expect(health.supplied).toBe(0);
      expect(health.borrowed).toBe(0);
    });

    it('computes health factor from positions', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValue([
        { id: 'cap-1', obligationId: 'obligation-1' },
      ]);

      const depositCtoken = 200_000_000n;
      const borrowedRaw = BigInt(Math.round(50_000_000 * 1e18));
      const posRate = BigInt(Math.round(1.0 * 1e18));

      mockSuilendClient.getObligation.mockResolvedValue(
        makeObligation(
          [{ coinType: { name: USDC_TYPE }, depositedCtokenAmount: depositCtoken, reserveArrayIndex: 0n }],
          [{ coinType: { name: USDC_TYPE }, borrowedAmount: { value: borrowedRaw }, cumulativeBorrowRate: { value: posRate }, reserveArrayIndex: 0n }],
        ),
      );

      const health = await adapter.getHealth('0xuser');
      expect(health.healthFactor).toBeGreaterThan(1);
      expect(health.supplied).toBeGreaterThan(0);
      expect(health.borrowed).toBeGreaterThan(0);
      expect(health.liquidationThreshold).toBe(0.75);
    });
  });

  describe('buildSaveTx', () => {
    it('creates obligation when none exists', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValue([]);

      const result = await adapter.buildSaveTx('0xuser', 10, 'USDC');
      expect(result.tx).toBeDefined();
      expect(mockSuilendClient.createObligation).toHaveBeenCalled();
      expect(mockSuilendClient.deposit).toHaveBeenCalled();
    });

    it('uses existing obligation cap when available', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValue([
        { id: 'cap-1', obligationId: 'obligation-1' },
      ]);

      const result = await adapter.buildSaveTx('0xuser', 10, 'USDC');
      expect(result.tx).toBeDefined();
      expect(mockSuilendClient.createObligation).not.toHaveBeenCalled();
      expect(mockSuilendClient.deposit).toHaveBeenCalled();
    });

    it('throws when no USDC coins available', async () => {
      (mockClient.getCoins as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
        nextCursor: null,
        hasNextPage: false,
      });

      await expect(adapter.buildSaveTx('0xuser', 10, 'USDC')).rejects.toThrow('No USDC coins');
    });
  });

  describe('buildWithdrawTx', () => {
    it('withdraws from existing position', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValue([
        { id: 'cap-1', obligationId: 'obligation-1' },
      ]);

      mockSuilendClient.getObligation.mockResolvedValue(
        makeObligation([
          {
            coinType: { name: USDC_TYPE },
            depositedCtokenAmount: 100_000_000n,
            reserveArrayIndex: 0n,
          },
        ]),
      );

      const result = await adapter.buildWithdrawTx('0xuser', 50, 'USDC');
      expect(result.tx).toBeDefined();
      expect(result.effectiveAmount).toBeGreaterThan(0);
      expect(mockSuilendClient.withdrawAndSendToUser).toHaveBeenCalled();
    });

    it('throws when no obligation exists', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValue([]);

      await expect(adapter.buildWithdrawTx('0xuser', 10, 'USDC')).rejects.toThrow('No Suilend position');
    });

    it('caps withdrawal at deposited amount', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValue([
        { id: 'cap-1', obligationId: 'obligation-1' },
      ]);

      mockSuilendClient.getObligation.mockResolvedValue(
        makeObligation([
          {
            coinType: { name: USDC_TYPE },
            depositedCtokenAmount: 5_000_000n,
            reserveArrayIndex: 0n,
          },
        ]),
      );

      const result = await adapter.buildWithdrawTx('0xuser', 100, 'USDC');
      // 5_000_000 cTokens * ratio ~1.0 / 10^6 = ~5 USDC
      expect(result.effectiveAmount).toBeLessThanOrEqual(5.1);
    });
  });

  describe('maxWithdraw', () => {
    it('returns full supply when no borrows', async () => {
      const sdk = await import('@suilend/sdk') as any;
      sdk.SuilendClient.getObligationOwnerCaps.mockResolvedValue([
        { id: 'cap-1', obligationId: 'obligation-1' },
      ]);

      mockSuilendClient.getObligation.mockResolvedValue(
        makeObligation([
          {
            coinType: { name: USDC_TYPE },
            depositedCtokenAmount: 100_000_000n,
            reserveArrayIndex: 0n,
          },
        ]),
      );

      const result = await adapter.maxWithdraw('0xuser', 'USDC');
      expect(result.maxAmount).toBeGreaterThan(0);
      expect(result.healthFactorAfter).toBe(Infinity);
    });

    it('returns 0 when no position', async () => {
      const result = await adapter.maxWithdraw('0xuser', 'USDC');
      expect(result.maxAmount).toBe(0);
      expect(result.currentHF).toBe(Infinity);
    });
  });

  describe('deferred methods (Phase 10)', () => {
    it('buildBorrowTx throws', async () => {
      await expect(adapter.buildBorrowTx('0x1', 100, 'USDC')).rejects.toThrow('Phase 10');
    });

    it('buildRepayTx throws', async () => {
      await expect(adapter.buildRepayTx('0x1', 100, 'USDC')).rejects.toThrow('Phase 10');
    });

    it('maxBorrow throws', async () => {
      await expect(adapter.maxBorrow('0x1', 'USDC')).rejects.toThrow('Phase 10');
    });
  });
});
