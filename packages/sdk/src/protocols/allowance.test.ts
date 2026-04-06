import { describe, it, expect, vi } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';
import {
  buildCreateAllowanceTx,
  addDepositAllowanceTx,
  buildDepositAllowanceTx,
  buildAdminDepositAllowanceTx,
  buildDeductAllowanceTx,
  buildWithdrawAllowanceTx,
  buildWithdrawAmountAllowanceTx,
  getAllowance,
  getAllowanceBalance,
  ALLOWANCE_FEATURES,
} from './allowance.js';
import {
  T2000_PACKAGE_ID,
  T2000_CONFIG_ID,
  T2000_ADMIN_CAP_ID,
  SUPPORTED_ASSETS,
  CLOCK_ID,
} from '../constants.js';

const USDC_TYPE = SUPPORTED_ASSETS.USDC.type;
const FAKE_ALLOWANCE = '0xaaaa';
const FAKE_USDC_COIN = '0xbbbb';

function mockCoinArg(): TransactionObjectArgument {
  return { $kind: 'Result', Result: 0 } as unknown as TransactionObjectArgument;
}

function mockTx() {
  return {
    moveCall: vi.fn(),
    object: vi.fn((id: string) => ({ objectId: id })),
    pure: {
      u64: vi.fn((v: bigint) => ({ value: v })),
      u8: vi.fn((v: number) => ({ value: v })),
    },
    splitCoins: vi.fn(() => [mockCoinArg()]),
  } as unknown as Transaction;
}

// ---------------------------------------------------------------------------
// Transaction builders
// ---------------------------------------------------------------------------

describe('allowance transaction builders', () => {
  describe('buildCreateAllowanceTx', () => {
    it('returns a Transaction', () => {
      const tx = buildCreateAllowanceTx();
      expect(tx).toBeInstanceOf(Transaction);
    });
  });

  describe('addDepositAllowanceTx', () => {
    it('adds deposit moveCall with correct target', () => {
      const tx = mockTx();
      const coin = mockCoinArg();
      addDepositAllowanceTx(tx, FAKE_ALLOWANCE, coin);

      expect(tx.moveCall).toHaveBeenCalledOnce();
      const call = (tx.moveCall as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.target).toBe(`${T2000_PACKAGE_ID}::allowance::deposit`);
      expect(call.typeArguments).toEqual([USDC_TYPE]);
    });

    it('passes allowance object ID', () => {
      const tx = mockTx();
      addDepositAllowanceTx(tx, FAKE_ALLOWANCE, mockCoinArg());

      expect(tx.object).toHaveBeenCalledWith(FAKE_ALLOWANCE);
    });
  });

  describe('buildDepositAllowanceTx', () => {
    it('returns a Transaction', () => {
      const tx = buildDepositAllowanceTx(FAKE_ALLOWANCE, FAKE_USDC_COIN, 5_000_000n);
      expect(tx).toBeInstanceOf(Transaction);
    });
  });

  describe('buildAdminDepositAllowanceTx', () => {
    it('returns a Transaction', () => {
      const tx = buildAdminDepositAllowanceTx(FAKE_ALLOWANCE, FAKE_USDC_COIN, 250_000n);
      expect(tx).toBeInstanceOf(Transaction);
    });
  });

  describe('buildDeductAllowanceTx', () => {
    it('returns a Transaction', () => {
      const tx = buildDeductAllowanceTx(FAKE_ALLOWANCE, 10_000n, ALLOWANCE_FEATURES.BRIEFING);
      expect(tx).toBeInstanceOf(Transaction);
    });

    it('accepts all feature types', () => {
      for (const feature of Object.values(ALLOWANCE_FEATURES)) {
        const tx = buildDeductAllowanceTx(FAKE_ALLOWANCE, 10_000n, feature);
        expect(tx).toBeInstanceOf(Transaction);
      }
    });
  });

  describe('buildWithdrawAllowanceTx', () => {
    it('returns a Transaction', () => {
      const tx = buildWithdrawAllowanceTx(FAKE_ALLOWANCE);
      expect(tx).toBeInstanceOf(Transaction);
    });
  });

  describe('buildWithdrawAmountAllowanceTx', () => {
    it('returns a Transaction', () => {
      const tx = buildWithdrawAmountAllowanceTx(FAKE_ALLOWANCE, 1_000_000n);
      expect(tx).toBeInstanceOf(Transaction);
    });
  });
});

// ---------------------------------------------------------------------------
// Feature constants
// ---------------------------------------------------------------------------

describe('ALLOWANCE_FEATURES', () => {
  it('has expected feature tags', () => {
    expect(ALLOWANCE_FEATURES.BRIEFING).toBe(0);
    expect(ALLOWANCE_FEATURES.RATE_ALERT).toBe(1);
    expect(ALLOWANCE_FEATURES.SESSION).toBe(2);
    expect(ALLOWANCE_FEATURES.PAYMENT_ALERT).toBe(3);
    expect(ALLOWANCE_FEATURES.DCA).toBe(4);
  });

  it('has 5 features', () => {
    expect(Object.keys(ALLOWANCE_FEATURES)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

function mockClient(fields: Record<string, unknown>, type = `${T2000_PACKAGE_ID}::allowance::Allowance<${USDC_TYPE}>`) {
  return {
    getObject: vi.fn().mockResolvedValue({
      data: {
        content: {
          dataType: 'moveObject',
          type,
          fields,
        },
      },
    }),
  } as unknown as Parameters<typeof getAllowance>[0];
}

describe('getAllowance', () => {
  it('parses on-chain object fields', async () => {
    const client = mockClient({
      id: { id: FAKE_ALLOWANCE },
      owner: '0x1234',
      balance: '5000000',
      total_deposited: '10000000',
      total_spent: '5000000',
      created_at: '1700000000000',
    });

    const info = await getAllowance(client, FAKE_ALLOWANCE);

    expect(info.id).toBe(FAKE_ALLOWANCE);
    expect(info.owner).toBe('0x1234');
    expect(info.balance).toBe(5_000_000n);
    expect(info.totalDeposited).toBe(10_000_000n);
    expect(info.totalSpent).toBe(5_000_000n);
    expect(info.createdAt).toBe(1_700_000_000_000);
    expect(info.coinType).toBe(USDC_TYPE);
  });

  it('throws for missing object', async () => {
    const client = {
      getObject: vi.fn().mockResolvedValue({ data: null }),
    } as unknown as Parameters<typeof getAllowance>[0];

    await expect(getAllowance(client, FAKE_ALLOWANCE)).rejects.toThrow('not found');
  });
});

describe('getAllowanceBalance', () => {
  it('returns balance as bigint', async () => {
    const client = mockClient({
      id: { id: FAKE_ALLOWANCE },
      owner: '0x1234',
      balance: '3000000',
      total_deposited: '3000000',
      total_spent: '0',
      created_at: '1700000000000',
    });

    const balance = await getAllowanceBalance(client, FAKE_ALLOWANCE);
    expect(balance).toBe(3_000_000n);
  });
});
