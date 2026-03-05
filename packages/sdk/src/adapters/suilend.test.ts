import { describe, it, expect } from 'vitest';
import { SuilendAdapter } from './suilend.js';
import type { SuiClient } from '@mysten/sui/client';

describe('SuilendAdapter', () => {
  it('has correct metadata', () => {
    const adapter = new SuilendAdapter();
    expect(adapter.id).toBe('suilend');
    expect(adapter.name).toBe('Suilend');
    expect(adapter.capabilities).toContain('save');
    expect(adapter.capabilities).toContain('withdraw');
    expect(adapter.capabilities).not.toContain('borrow');
    expect(adapter.capabilities).not.toContain('repay');
    expect(adapter.supportsSameAssetBorrow).toBe(false);
    expect(adapter.supportedAssets).toContain('USDC');
  });

  it('init throws not implemented', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.init({} as SuiClient)).rejects.toThrow('not implemented');
  });

  it('buildBorrowTx throws deferred to Phase 10', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.buildBorrowTx('0x1', 100, 'USDC')).rejects.toThrow('Phase 10');
  });

  it('buildRepayTx throws deferred to Phase 10', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.buildRepayTx('0x1', 100, 'USDC')).rejects.toThrow('Phase 10');
  });

  it('maxBorrow throws deferred to Phase 10', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.maxBorrow('0x1', 'USDC')).rejects.toThrow('Phase 10');
  });

  it('getRates throws not implemented', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.getRates('USDC')).rejects.toThrow('not implemented');
  });

  it('getPositions throws not implemented', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.getPositions('0x1')).rejects.toThrow('not implemented');
  });

  it('getHealth throws not implemented', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.getHealth('0x1')).rejects.toThrow('not implemented');
  });

  it('buildSaveTx throws not implemented', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.buildSaveTx('0x1', 100, 'USDC')).rejects.toThrow('not implemented');
  });

  it('buildWithdrawTx throws not implemented', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.buildWithdrawTx('0x1', 100, 'USDC')).rejects.toThrow('not implemented');
  });

  it('maxWithdraw throws not implemented', async () => {
    const adapter = new SuilendAdapter();
    await expect(adapter.maxWithdraw('0x1', 'USDC')).rejects.toThrow('not implemented');
  });
});
