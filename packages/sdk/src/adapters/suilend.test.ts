import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuilendAdapter } from './suilend.js';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { SUPPORTED_ASSETS } from '../constants.js';

const TEST_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000001';

const mockSdkInstance = {
  createObligation: vi.fn(() => 'new-cap-ref'),
  depositIntoObligation: vi.fn(),
  withdrawAndSendToUser: vi.fn(),
  withdraw: vi.fn(() => 'coin-ref'),
  deposit: vi.fn(),
  borrowAndSendToUser: vi.fn(),
  borrow: vi.fn(() => 'borrow-coin-ref'),
  repayIntoObligation: vi.fn(),
  repay: vi.fn(),
  claimRewardsAndSendToUser: vi.fn(),
};

const mockReserveMap: Record<string, unknown> = {};
const mockRefreshedRawReserves: unknown[] = [];
let mockObligations: unknown[] = [];
let mockObligationOwnerCaps: Array<{ id: string; obligationId: string }> = [];

vi.mock('@suilend/sdk/client', () => ({
  SuilendClient: {
    initialize: vi.fn(async () => mockSdkInstance),
    getObligationOwnerCaps: vi.fn(async () => mockObligationOwnerCaps),
  },
  LENDING_MARKET_ID: '0xlending_market',
  LENDING_MARKET_TYPE: '0xlending_market_type',
}));

vi.mock('@suilend/sdk/lib/initialize', () => ({
  initializeSuilend: vi.fn(async () => ({
    reserveMap: mockReserveMap,
    refreshedRawReserves: mockRefreshedRawReserves,
  })),
  initializeObligations: vi.fn(async () => ({
    obligations: mockObligations,
    obligationOwnerCaps: mockObligationOwnerCaps,
  })),
}));

vi.mock('@suilend/sdk/lib/types', () => ({
  Side: { DEPOSIT: 0, BORROW: 1 },
}));

function makeReserve(coinType: string, depositApr = 4.5, borrowApr = 6.2) {
  return {
    coinType,
    depositAprPercent: { toNumber: () => depositApr },
    borrowAprPercent: { toNumber: () => borrowApr },
    depositsPoolRewardManager: { poolRewards: [] },
    borrowsPoolRewardManager: { poolRewards: [] },
  };
}

function mockBigNumber(val: number) {
  return {
    toNumber: () => val,
    toFixed: (dp: number) => val.toFixed(dp),
    times: (n: number) => mockBigNumber(val * n),
    integerValue: () => mockBigNumber(Math.floor(val)),
  };
}

function makeObligation(
  deposits: Array<{ coinType: string; amount: number; amountUsd: number; reserve?: unknown }> = [],
  borrows: Array<{ coinType: string; amount: number; amountUsd: number; reserve?: unknown }> = [],
) {
  const usdcReserve = makeReserve(SUPPORTED_ASSETS.USDC.type);
  return {
    deposits: deposits.map((d) => ({
      coinType: d.coinType,
      depositedAmount: { toNumber: () => d.amount },
      depositedAmountUsd: { toNumber: () => d.amountUsd },
      depositedCtokenAmount: mockBigNumber(d.amount * 1e6),
      reserve: d.reserve ?? usdcReserve,
      reserveArrayIndex: 0n,
    })),
    borrows: borrows.map((b) => ({
      coinType: b.coinType,
      borrowedAmount: { toNumber: () => b.amount },
      borrowedAmountUsd: { toNumber: () => b.amountUsd },
      reserve: b.reserve ?? usdcReserve,
    })),
    depositedAmountUsd: { toNumber: () => deposits.reduce((s, d) => s + d.amountUsd, 0) },
    borrowedAmountUsd: { toNumber: () => borrows.reduce((s, b) => s + b.amountUsd, 0) },
    borrowLimitUsd: { toNumber: () => deposits.reduce((s, d) => s + d.amountUsd, 0) * 0.7 },
    unhealthyBorrowValueUsd: { toNumber: () => deposits.reduce((s, d) => s + d.amountUsd, 0) * 0.75 },
  };
}

function createMockClient() {
  return {
    getObject: vi.fn(),
    getOwnedObjects: vi.fn(),
    getCoins: vi.fn(async () => ({
      data: [{ coinObjectId: '0xusdc1', balance: '5000000' }],
      nextCursor: null,
      hasNextPage: false,
    })),
  } as unknown as SuiJsonRpcClient;
}

describe('SuilendAdapter', () => {
  let adapter: SuilendAdapter;
  let mockClient: SuiJsonRpcClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockObligations = [];
    mockObligationOwnerCaps = [];
    Object.keys(mockReserveMap).forEach((k) => delete mockReserveMap[k]);

    const usdcReserve = makeReserve(SUPPORTED_ASSETS.USDC.type);
    mockReserveMap['USDC'] = usdcReserve;

    mockClient = createMockClient();
    adapter = new SuilendAdapter();
    await adapter.init(mockClient);
  });

  describe('metadata', () => {
    it('has correct identity', () => {
      expect(adapter.id).toBe('suilend');
      expect(adapter.name).toBe('Suilend');
    });

    it('supports save, withdraw, borrow, and repay', () => {
      expect(adapter.capabilities).toContain('save');
      expect(adapter.capabilities).toContain('withdraw');
      expect(adapter.capabilities).toContain('borrow');
      expect(adapter.capabilities).toContain('repay');
    });

    it('does not support same-asset borrow', () => {
      expect(adapter.supportsSameAssetBorrow).toBe(false);
    });

    it('supports USDC', () => {
      expect(adapter.supportedAssets).toContain('USDC');
    });
  });

  describe('getRates', () => {
    it('returns rates from SDK reserve', async () => {
      const rates = await adapter.getRates('USDC');
      expect(rates.asset).toBe('USDC');
      expect(rates.saveApy).toBe(4.5);
      expect(rates.borrowApy).toBe(6.2);
    });

    it('throws for unsupported asset', async () => {
      await expect(adapter.getRates('FAKECOIN')).rejects.toThrow('does not support');
    });
  });

  describe('getPositions', () => {
    it('returns empty positions when no obligation exists', async () => {
      const positions = await adapter.getPositions(TEST_ADDRESS);
      expect(positions.supplies).toHaveLength(0);
      expect(positions.borrows).toHaveLength(0);
    });

    it('parses deposits with USD values', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 100, amountUsd: 100 }],
      )];

      const positions = await adapter.getPositions(TEST_ADDRESS);
      expect(positions.supplies).toHaveLength(1);
      expect(positions.supplies[0].asset).toBe('USDC');
      expect(positions.supplies[0].amount).toBe(100);
      expect(positions.supplies[0].amountUsd).toBe(100);
      expect(positions.supplies[0].apy).toBe(4.5);
    });

    it('parses borrows with USD values', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [],
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 50, amountUsd: 50 }],
      )];

      const positions = await adapter.getPositions(TEST_ADDRESS);
      expect(positions.borrows).toHaveLength(1);
      expect(positions.borrows[0].asset).toBe('USDC');
      expect(positions.borrows[0].amount).toBe(50);
      expect(positions.borrows[0].amountUsd).toBe(50);
    });

    it('filters dust positions', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 0.00001, amountUsd: 0.00001 }],
      )];

      const positions = await adapter.getPositions(TEST_ADDRESS);
      expect(positions.supplies).toHaveLength(0);
    });

    it('resolves non-USDC assets by coin type', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      const suiReserve = makeReserve(SUPPORTED_ASSETS.SUI.type, 2.5, 5.0);
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.SUI.type, amount: 13.5, amountUsd: 13.93, reserve: suiReserve }],
      )];

      const positions = await adapter.getPositions(TEST_ADDRESS);
      expect(positions.supplies).toHaveLength(1);
      expect(positions.supplies[0].asset).toBe('SUI');
      expect(positions.supplies[0].amountUsd).toBe(13.93);
    });
  });

  describe('getHealth', () => {
    it('returns Infinity health factor with no positions', async () => {
      const health = await adapter.getHealth(TEST_ADDRESS);
      expect(health.healthFactor).toBe(Infinity);
      expect(health.supplied).toBe(0);
      expect(health.borrowed).toBe(0);
    });

    it('computes health factor from obligation', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 200, amountUsd: 200 }],
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 50, amountUsd: 50 }],
      )];

      const health = await adapter.getHealth(TEST_ADDRESS);
      expect(health.healthFactor).toBe(3.0);
      expect(health.supplied).toBe(200);
      expect(health.borrowed).toBe(50);
      expect(health.liquidationThreshold).toBe(0.75);
    });
  });

  describe('buildSaveTx', () => {
    it('creates a deposit transaction', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      const result = await adapter.buildSaveTx(TEST_ADDRESS, 10, 'USDC');
      expect(result.tx).toBeInstanceOf(Transaction);
      expect(mockSdkInstance.depositIntoObligation).toHaveBeenCalled();
    });

    it('creates obligation when none exists', async () => {
      mockObligationOwnerCaps = [];
      const { SuilendClient } = await import('@suilend/sdk/client');
      vi.mocked(SuilendClient.getObligationOwnerCaps).mockResolvedValueOnce([]);

      const result = await adapter.buildSaveTx(TEST_ADDRESS, 10, 'USDC');
      expect(result.tx).toBeInstanceOf(Transaction);
      expect(mockSdkInstance.createObligation).toHaveBeenCalled();
    });
  });

  describe('buildWithdrawTx', () => {
    it('withdraws from existing position', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 100, amountUsd: 100 }],
      )];
      const { SuilendClient } = await import('@suilend/sdk/client');
      vi.mocked(SuilendClient.getObligationOwnerCaps).mockResolvedValueOnce([
        { id: 'cap-1', obligationId: 'ob-1' } as never,
      ]);

      const result = await adapter.buildWithdrawTx(TEST_ADDRESS, 50, 'USDC');
      expect(result.tx).toBeInstanceOf(Transaction);
      expect(result.effectiveAmount).toBe(50);
    });

    it('caps withdrawal at deposited amount', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 5, amountUsd: 5 }],
      )];
      const { SuilendClient } = await import('@suilend/sdk/client');
      vi.mocked(SuilendClient.getObligationOwnerCaps).mockResolvedValueOnce([
        { id: 'cap-1', obligationId: 'ob-1' } as never,
      ]);

      const result = await adapter.buildWithdrawTx(TEST_ADDRESS, 100, 'USDC');
      expect(result.effectiveAmount).toBe(5);
    });

    it('throws when no obligation cap exists', async () => {
      const { SuilendClient } = await import('@suilend/sdk/client');
      vi.mocked(SuilendClient.getObligationOwnerCaps).mockResolvedValueOnce([]);

      await expect(adapter.buildWithdrawTx(TEST_ADDRESS, 10, 'USDC')).rejects.toThrow('No Suilend position');
    });
  });

  describe('maxWithdraw', () => {
    it('returns full supply when no borrows', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 100, amountUsd: 100 }],
      )];

      const result = await adapter.maxWithdraw(TEST_ADDRESS, 'USDC');
      expect(result.maxAmount).toBe(100);
      expect(result.healthFactorAfter).toBe(Infinity);
    });

    it('returns 0 when no position', async () => {
      const result = await adapter.maxWithdraw(TEST_ADDRESS, 'USDC');
      expect(result.maxAmount).toBe(0);
      expect(result.currentHF).toBe(Infinity);
    });

    it('limits withdrawal to maintain health factor', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 200, amountUsd: 200 }],
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 50, amountUsd: 50 }],
      )];

      const result = await adapter.maxWithdraw(TEST_ADDRESS, 'USDC');
      expect(result.maxAmount).toBe(100);
      expect(result.currentHF).toBe(3.0);
    });
  });

  describe('borrow and repay', () => {
    it('buildBorrowTx throws when no obligation cap', async () => {
      const { SuilendClient } = await import('@suilend/sdk/client');
      vi.mocked(SuilendClient.getObligationOwnerCaps).mockResolvedValueOnce([]);

      await expect(adapter.buildBorrowTx(TEST_ADDRESS, 100, 'USDC')).rejects.toThrow('No Suilend position');
    });

    it('buildRepayTx throws when no obligation cap', async () => {
      const { SuilendClient } = await import('@suilend/sdk/client');
      vi.mocked(SuilendClient.getObligationOwnerCaps).mockResolvedValueOnce([]);

      await expect(adapter.buildRepayTx(TEST_ADDRESS, 100, 'USDC')).rejects.toThrow('No Suilend obligation');
    });

    it('maxBorrow returns 0 when no position', async () => {
      const result = await adapter.maxBorrow(TEST_ADDRESS, 'USDC');
      expect(result.maxAmount).toBe(0);
      expect(result.currentHF).toBe(Infinity);
    });

    it('maxBorrow returns available borrow capacity', async () => {
      mockObligationOwnerCaps = [{ id: 'cap-1', obligationId: 'ob-1' }];
      mockObligations = [makeObligation(
        [{ coinType: SUPPORTED_ASSETS.USDC.type, amount: 200, amountUsd: 200 }],
      )];

      const result = await adapter.maxBorrow(TEST_ADDRESS, 'USDC');
      expect(result.maxAmount).toBe(140);
      expect(result.healthFactorAfter).toBe(1.5);
    });
  });
});
