import { describe, it, expect, vi } from 'vitest';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';
import { calculateFee, addCollectFeeToTx } from './protocolFee.js';
import { SAVE_FEE_BPS, BORROW_FEE_BPS, BPS_DENOMINATOR, T2000_PACKAGE_ID, T2000_TREASURY_ID, T2000_CONFIG_ID, SUPPORTED_ASSETS } from '../constants.js';

function mockCoinArg(): TransactionObjectArgument {
  return { $kind: 'Result', Result: 0 } as unknown as TransactionObjectArgument;
}

describe('protocolFee', () => {
  describe('calculateFee', () => {
    it('calculates save fee at 0.1%', () => {
      const fee = calculateFee('save', 100);
      expect(fee.rate).toBeCloseTo(0.001);
      expect(fee.amount).toBeCloseTo(0.1);
      expect(fee.asset).toBe('USDC');
    });

    it('calculates borrow fee at 0.05%', () => {
      const fee = calculateFee('borrow', 100);
      expect(fee.rate).toBeCloseTo(0.0005);
      expect(fee.amount).toBeCloseTo(0.05);
    });

    it('calculates correct raw USDC amount (6 decimals)', () => {
      const fee = calculateFee('save', 1000);
      expect(fee.rawAmount).toBe(1_000_000n);
    });

    it('handles small amounts', () => {
      const fee = calculateFee('save', 1);
      expect(fee.amount).toBeCloseTo(0.001);
    });

    it('handles zero amount', () => {
      const fee = calculateFee('save', 0);
      expect(fee.amount).toBe(0);
      expect(fee.rawAmount).toBe(0n);
    });
  });

  describe('fee constants', () => {
    it('SAVE_FEE_BPS is 10 (0.1%)', () => {
      expect(SAVE_FEE_BPS).toBe(10n);
    });

    it('BORROW_FEE_BPS is 5 (0.05%)', () => {
      expect(BORROW_FEE_BPS).toBe(5n);
    });

    it('BPS_DENOMINATOR is 10000', () => {
      expect(BPS_DENOMINATOR).toBe(10_000n);
    });
  });

  describe('addCollectFeeToTx', () => {
    it('adds moveCall for save operation', () => {
      const mockCoin = mockCoinArg();
      const moveCallSpy = vi.fn();

      const mockTx = {
        moveCall: moveCallSpy,
        object: vi.fn((id: string) => ({ objectId: id })),
        pure: {
          u8: vi.fn((v: number) => ({ value: v })),
        },
      } as unknown as Parameters<typeof addCollectFeeToTx>[0];

      addCollectFeeToTx(mockTx, mockCoin, 'save');

      expect(moveCallSpy).toHaveBeenCalledOnce();
      const call = moveCallSpy.mock.calls[0][0];
      expect(call.target).toBe(`${T2000_PACKAGE_ID}::treasury::collect_fee`);
      expect(call.typeArguments).toEqual([SUPPORTED_ASSETS.USDC.type]);
    });

    it('adds moveCall for borrow operation', () => {
      const mockCoin = mockCoinArg();
      const moveCallSpy = vi.fn();

      const mockTx = {
        moveCall: moveCallSpy,
        object: vi.fn((id: string) => ({ objectId: id })),
        pure: {
          u8: vi.fn((v: number) => ({ value: v })),
        },
      } as unknown as Parameters<typeof addCollectFeeToTx>[0];

      addCollectFeeToTx(mockTx, mockCoin, 'borrow');

      expect(moveCallSpy).toHaveBeenCalledOnce();
      const call = moveCallSpy.mock.calls[0][0];
      expect(call.target).toBe(`${T2000_PACKAGE_ID}::treasury::collect_fee`);
    });

    it('passes correct object IDs', () => {
      const mockCoin = mockCoinArg();
      const objectSpy = vi.fn((id: string) => ({ objectId: id }));
      const u8Spy = vi.fn((v: number) => ({ value: v }));

      const mockTx = {
        moveCall: vi.fn(),
        object: objectSpy,
        pure: { u8: u8Spy },
      } as unknown as Parameters<typeof addCollectFeeToTx>[0];

      addCollectFeeToTx(mockTx, mockCoin, 'save');

      expect(objectSpy).toHaveBeenCalledWith(T2000_TREASURY_ID);
      expect(objectSpy).toHaveBeenCalledWith(T2000_CONFIG_ID);
      expect(u8Spy).toHaveBeenCalledWith(0);
    });
  });

  describe('operation codes', () => {
    it('save is op 0', () => {
      const u8Spy = vi.fn((v: number) => ({ value: v }));
      const mockTx = {
        moveCall: vi.fn(),
        object: vi.fn((id: string) => ({ objectId: id })),
        pure: { u8: u8Spy },
      } as unknown as Parameters<typeof addCollectFeeToTx>[0];

      addCollectFeeToTx(mockTx, mockCoinArg(), 'save');
      expect(u8Spy).toHaveBeenCalledWith(0);
    });

    it('borrow is op 2', () => {
      const u8Spy = vi.fn((v: number) => ({ value: v }));
      const mockTx = {
        moveCall: vi.fn(),
        object: vi.fn((id: string) => ({ objectId: id })),
        pure: { u8: u8Spy },
      } as unknown as Parameters<typeof addCollectFeeToTx>[0];

      addCollectFeeToTx(mockTx, mockCoinArg(), 'borrow');
      expect(u8Spy).toHaveBeenCalledWith(2);
    });
  });
});
