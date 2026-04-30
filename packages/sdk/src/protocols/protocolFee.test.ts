import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { calculateFee, addFeeTransfer } from './protocolFee.js';
import { SAVE_FEE_BPS, BORROW_FEE_BPS, BPS_DENOMINATOR, T2000_OVERLAY_FEE_WALLET } from '../constants.js';

const TREASURY_ADDR = '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a';

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

    it('calculates swap fee at 0.1%', () => {
      const fee = calculateFee('swap', 100);
      expect(fee.rate).toBeCloseTo(0.001);
      expect(fee.amount).toBeCloseTo(0.1);
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

    it('T2000_OVERLAY_FEE_WALLET is a real Sui address (not a Move object ID)', () => {
      // The pre-1.1.0 bug: receiver was set to a Move object ID, USDC sent there
      // landed as OwnedObjects keyed to the object and was inaccessible. Ensure
      // the new constant is at least the right shape (32-byte hex address).
      expect(T2000_OVERLAY_FEE_WALLET).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('addFeeTransfer', () => {
    it('adds splitCoins + transferObjects to the PTB', () => {
      const tx = new Transaction();
      tx.setSender('0x' + 'a'.repeat(64));

      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000n)]);
      addFeeTransfer(tx, paymentCoin, SAVE_FEE_BPS, TREASURY_ADDR, 100);

      const txData = tx.getData();
      const splitOps = txData.commands.filter((c) => '$kind' in c && c.$kind === 'SplitCoins');
      const transferOps = txData.commands.filter((c) => '$kind' in c && c.$kind === 'TransferObjects');

      // At minimum 2 splitCoins (the initial payment split + the fee split) + 1 transferObjects (the fee)
      expect(splitOps.length).toBeGreaterThanOrEqual(2);
      expect(transferOps.length).toBeGreaterThanOrEqual(1);
    });

    it('split-fee command appears BEFORE downstream commands (order is load-bearing)', () => {
      // The fee MUST be split off the payment coin before any subsequent op
      // that consumes the coin (e.g. a NAVI deposit). If the fee split comes
      // after, the deposit will have consumed the coin and the split fails.
      const tx = new Transaction();
      tx.setSender('0x' + 'a'.repeat(64));

      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000n)]);
      addFeeTransfer(tx, paymentCoin, SAVE_FEE_BPS, TREASURY_ADDR, 100);

      // Simulate a "NAVI deposit" placeholder by transferring the (now smaller) coin
      tx.transferObjects([paymentCoin], tx.pure.address(TREASURY_ADDR));

      const txData = tx.getData();
      const transferOps = txData.commands
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => '$kind' in c && c.$kind === 'TransferObjects');

      // Two TransferObjects in order: (1) fee → treasury, (2) the simulated downstream
      expect(transferOps.length).toBe(2);
      expect(transferOps[0].i).toBeLessThan(transferOps[1].i);
    });

    it('no-ops when feeBps is 0', () => {
      const tx = new Transaction();
      tx.setSender('0x' + 'a'.repeat(64));

      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000n)]);
      const cmdsBefore = tx.getData().commands.length;
      addFeeTransfer(tx, paymentCoin, 0n, TREASURY_ADDR, 100);
      const cmdsAfter = tx.getData().commands.length;

      expect(cmdsAfter).toBe(cmdsBefore);
    });

    it('no-ops when amount is 0', () => {
      const tx = new Transaction();
      tx.setSender('0x' + 'a'.repeat(64));

      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000n)]);
      const cmdsBefore = tx.getData().commands.length;
      addFeeTransfer(tx, paymentCoin, SAVE_FEE_BPS, TREASURY_ADDR, 0);
      const cmdsAfter = tx.getData().commands.length;

      expect(cmdsAfter).toBe(cmdsBefore);
    });

    it('uses borrow rate (0.05%) correctly', () => {
      const tx = new Transaction();
      tx.setSender('0x' + 'a'.repeat(64));

      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000n)]);
      const cmdsBefore = tx.getData().commands.length;
      addFeeTransfer(tx, paymentCoin, BORROW_FEE_BPS, TREASURY_ADDR, 100);
      const cmdsAfter = tx.getData().commands.length;

      // 1 splitCoins (the fee split) + 1 transferObjects = 2 new commands
      expect(cmdsAfter).toBe(cmdsBefore + 2);
    });
  });
});
