import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuilendAdapter } from './suilend.js';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { SUPPORTED_ASSETS } from '../constants.js';

const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;
const TEST_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000001';

function makeReserveRpc(overrides: Record<string, unknown> = {}) {
  return {
    type: '0x...::reserve::Reserve',
    fields: {
      coin_type: { type: '0x1::type_name::TypeName', fields: { name: USDC_TYPE } },
      mint_decimals: 6,
      available_amount: '800000000',
      borrowed_amount: { type: '0x...::decimal::Decimal', fields: { value: String(Math.round(200_000_000 * 1e18)) } },
      ctoken_supply: '1000000000',
      unclaimed_spread_fees: { type: '0x...::decimal::Decimal', fields: { value: '0' } },
      cumulative_borrow_rate: { type: '0x...::decimal::Decimal', fields: { value: String(Math.round(1.05 * 1e18)) } },
      config: {
        type: '0x...::config::Config',
        fields: {
          element: {
            type: '0x...::config::Element',
            fields: {
              open_ltv_pct: 70,
              close_ltv_pct: 75,
              spread_fee_bps: '2000',
              interest_rate_utils: ['0', '80', '100'],
              interest_rate_aprs: ['200', '800', '5000'],
            },
          },
        },
      },
      ...overrides,
    },
  };
}

function makeObligationRpc(deposits: unknown[] = [], borrows: unknown[] = []) {
  return {
    dataType: 'moveObject' as const,
    type: '0x...::obligation::Obligation',
    fields: { deposits, borrows },
  };
}

function makeObligationDeposit(ctokenAmount: number, reserveIdx = 0) {
  return {
    type: '0x...::obligation::Deposit',
    fields: {
      coin_type: { type: '0x1::type_name::TypeName', fields: { name: USDC_TYPE } },
      deposited_ctoken_amount: String(ctokenAmount),
      reserve_array_index: String(reserveIdx),
    },
  };
}

function makeObligationBorrow(borrowedWad: number, cumRateWad: number, reserveIdx = 0) {
  return {
    type: '0x...::obligation::Borrow',
    fields: {
      coin_type: { type: '0x1::type_name::TypeName', fields: { name: USDC_TYPE } },
      borrowed_amount: { fields: { value: String(borrowedWad) } },
      cumulative_borrow_rate: { fields: { value: String(cumRateWad) } },
      reserve_array_index: String(reserveIdx),
    },
  };
}

function createMockClient() {
  return {
    getObject: vi.fn(async ({ id }: { id: string }) => {
      if (id.includes('3d4ef1859c3ee9fc72858f588b56a09da5466e64f8cc4e90a7b3b909fba8a7ae')) {
        return {
          data: {
            content: {
              dataType: 'moveObject',
              fields: { package: '0xpkg_latest' },
            },
          },
        };
      }
      if (id.includes('84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1')) {
        return {
          data: {
            content: {
              dataType: 'moveObject',
              fields: { reserves: [makeReserveRpc()] },
            },
          },
        };
      }
      return {
        data: {
          content: makeObligationRpc(),
        },
      };
    }),
    getOwnedObjects: vi.fn(async () => ({
      data: [],
      nextCursor: null,
      hasNextPage: false,
    })),
    getCoins: vi.fn(async () => ({
      data: [{ coinObjectId: '0xusdc1', balance: '5000000' }],
      nextCursor: null,
      hasNextPage: false,
    })),
  } as unknown as SuiJsonRpcClient;
}

function withObligationCaps(client: SuiJsonRpcClient, caps: Array<{ objectId: string; obligationId: string }>) {
  (client.getOwnedObjects as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: caps.map((c) => ({
      data: {
        objectId: c.objectId,
        content: {
          dataType: 'moveObject',
          fields: { obligation_id: c.obligationId },
        },
      },
    })),
    nextCursor: null,
    hasNextPage: false,
  });
}

function withObligation(client: SuiJsonRpcClient, deposits: unknown[] = [], borrows: unknown[] = []) {
  const originalGetObject = client.getObject as ReturnType<typeof vi.fn>;
  const originalImpl = originalGetObject.getMockImplementation();
  originalGetObject.mockImplementation(async (args: { id: string }) => {
    if (!args.id.includes('3d4ef') && !args.id.includes('84030d')) {
      return { data: { content: makeObligationRpc(deposits, borrows) } };
    }
    return originalImpl?.(args);
  });
}

describe('SuilendAdapter', () => {
  let adapter: SuilendAdapter;
  let mockClient: SuiJsonRpcClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    adapter = new SuilendAdapter();
    await adapter.init(mockClient);
  });

  describe('metadata', () => {
    it('has correct identity', () => {
      expect(adapter.id).toBe('suilend');
      expect(adapter.name).toBe('Suilend');
      expect(adapter.version).toBe('2.0.0');
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
    it('works with initSync (lazy init)', async () => {
      const lazyAdapter = new SuilendAdapter();
      lazyAdapter.initSync(mockClient);
      const rates = await lazyAdapter.getRates('USDC');
      expect(rates.asset).toBe('USDC');
      expect(rates.saveApy).toBeGreaterThan(0);
    });

    it('resolves package from upgrade cap', async () => {
      const rates = await adapter.getRates('USDC');
      expect(rates.saveApy).toBeGreaterThan(0);
      expect(mockClient.getObject).toHaveBeenCalled();
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
      const rates = await adapter.getRates('USDC');
      expect(rates.borrowApy).toBeCloseTo(3.5, 0);
    });
  });

  describe('getPositions', () => {
    it('returns empty positions when no obligation exists', async () => {
      const positions = await adapter.getPositions(TEST_ADDRESS);
      expect(positions.supplies).toHaveLength(0);
      expect(positions.borrows).toHaveLength(0);
    });

    it('parses deposits correctly', async () => {
      withObligationCaps(mockClient, [{ objectId: 'cap-1', obligationId: 'obligation-1' }]);
      withObligation(mockClient, [makeObligationDeposit(100_000_000)]);

      const positions = await adapter.getPositions(TEST_ADDRESS);
      expect(positions.supplies).toHaveLength(1);
      expect(positions.supplies[0].asset).toBe('USDC');
      expect(positions.supplies[0].amount).toBeGreaterThan(0);
      expect(positions.supplies[0].apy).toBeGreaterThan(0);
    });

    it('parses borrows with compounded interest', async () => {
      withObligationCaps(mockClient, [{ objectId: 'cap-1', obligationId: 'obligation-1' }]);
      withObligation(
        mockClient,
        [],
        [makeObligationBorrow(Math.round(50_000_000 * 1e18), Math.round(1.0 * 1e18))],
      );

      const positions = await adapter.getPositions(TEST_ADDRESS);
      expect(positions.borrows).toHaveLength(1);
      expect(positions.borrows[0].asset).toBe('USDC');
      expect(positions.borrows[0].amount).toBeCloseTo(52.5, 0);
    });
  });

  describe('getHealth', () => {
    it('returns Infinity health factor with no positions', async () => {
      const health = await adapter.getHealth(TEST_ADDRESS);
      expect(health.healthFactor).toBe(Infinity);
      expect(health.supplied).toBe(0);
      expect(health.borrowed).toBe(0);
    });

    it('computes health factor from positions', async () => {
      withObligationCaps(mockClient, [{ objectId: 'cap-1', obligationId: 'obligation-1' }]);
      withObligation(
        mockClient,
        [makeObligationDeposit(200_000_000)],
        [makeObligationBorrow(Math.round(50_000_000 * 1e18), Math.round(1.0 * 1e18))],
      );

      const health = await adapter.getHealth(TEST_ADDRESS);
      expect(health.healthFactor).toBeGreaterThan(1);
      expect(health.supplied).toBeGreaterThan(0);
      expect(health.borrowed).toBeGreaterThan(0);
      expect(health.liquidationThreshold).toBe(0.75);
    });
  });

  describe('buildSaveTx', () => {
    it('creates obligation when none exists', async () => {
      const result = await adapter.buildSaveTx(TEST_ADDRESS, 10, 'USDC');
      expect(result.tx).toBeDefined();
    });

    it('uses existing obligation cap when available', async () => {
      withObligationCaps(mockClient, [{ objectId: 'cap-1', obligationId: 'obligation-1' }]);
      const result = await adapter.buildSaveTx(TEST_ADDRESS, 10, 'USDC');
      expect(result.tx).toBeDefined();
    });

    it('throws when no USDC coins available', async () => {
      (mockClient.getCoins as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
        nextCursor: null,
        hasNextPage: false,
      });
      await expect(adapter.buildSaveTx(TEST_ADDRESS, 10, 'USDC')).rejects.toThrow('No USDC coins');
    });
  });

  describe('buildWithdrawTx', () => {
    it('withdraws from existing position', async () => {
      withObligationCaps(mockClient, [{ objectId: 'cap-1', obligationId: 'obligation-1' }]);
      withObligation(mockClient, [makeObligationDeposit(100_000_000)]);

      const result = await adapter.buildWithdrawTx(TEST_ADDRESS, 50, 'USDC');
      expect(result.tx).toBeDefined();
      expect(result.effectiveAmount).toBeGreaterThan(0);
    });

    it('throws when no obligation exists', async () => {
      await expect(adapter.buildWithdrawTx(TEST_ADDRESS, 10, 'USDC')).rejects.toThrow('No Suilend position');
    });

    it('caps withdrawal at deposited amount', async () => {
      withObligationCaps(mockClient, [{ objectId: 'cap-1', obligationId: 'obligation-1' }]);
      withObligation(mockClient, [makeObligationDeposit(5_000_000)]);

      const result = await adapter.buildWithdrawTx(TEST_ADDRESS, 100, 'USDC');
      expect(result.effectiveAmount).toBeLessThanOrEqual(5.1);
    });
  });

  describe('maxWithdraw', () => {
    it('returns full supply when no borrows', async () => {
      withObligationCaps(mockClient, [{ objectId: 'cap-1', obligationId: 'obligation-1' }]);
      withObligation(mockClient, [makeObligationDeposit(100_000_000)]);

      const result = await adapter.maxWithdraw(TEST_ADDRESS, 'USDC');
      expect(result.maxAmount).toBeGreaterThan(0);
      expect(result.healthFactorAfter).toBe(Infinity);
    });

    it('returns 0 when no position', async () => {
      const result = await adapter.maxWithdraw(TEST_ADDRESS, 'USDC');
      expect(result.maxAmount).toBe(0);
      expect(result.currentHF).toBe(Infinity);
    });
  });

  describe('deferred methods (Phase 10)', () => {
    it('buildBorrowTx throws', async () => {
      await expect(adapter.buildBorrowTx(TEST_ADDRESS, 100, 'USDC')).rejects.toThrow('Phase 10');
    });

    it('buildRepayTx throws', async () => {
      await expect(adapter.buildRepayTx(TEST_ADDRESS, 100, 'USDC')).rejects.toThrow('Phase 10');
    });

    it('maxBorrow throws', async () => {
      await expect(adapter.maxBorrow(TEST_ADDRESS, 'USDC')).rejects.toThrow('Phase 10');
    });
  });
});
