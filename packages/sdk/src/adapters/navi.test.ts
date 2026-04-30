import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NaviAdapter } from './navi.js';
import * as naviProtocol from '../protocols/navi.js';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

vi.mock('../protocols/navi.js', () => ({
  getRates: vi.fn(),
  getPositions: vi.fn(),
  getHealthFactor: vi.fn(),
  buildSaveTx: vi.fn(),
  buildWithdrawTx: vi.fn(),
  buildBorrowTx: vi.fn(),
  buildRepayTx: vi.fn(),
  maxWithdrawAmount: vi.fn(),
  maxBorrowAmount: vi.fn(),
  getPendingRewards: vi.fn(),
  addClaimRewardsToTx: vi.fn(),
}));

describe('NaviAdapter', () => {
  let adapter: NaviAdapter;
  const mockClient = {} as SuiJsonRpcClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new NaviAdapter();
    await adapter.init(mockClient);
  });

  it('has correct metadata', () => {
    expect(adapter.id).toBe('navi');
    expect(adapter.name).toBe('NAVI Protocol');
    expect(adapter.capabilities).toContain('save');
    expect(adapter.capabilities).toContain('withdraw');
    expect(adapter.capabilities).toContain('borrow');
    expect(adapter.capabilities).toContain('repay');
    expect(adapter.supportsSameAssetBorrow).toBe(true);
    expect(adapter.supportedAssets).toContain('USDC');
  });

  it('getRates delegates to navi protocol', async () => {
    const mockRates = { USDC: { saveApy: 4.5, borrowApy: 6.2 } };
    vi.mocked(naviProtocol.getRates).mockResolvedValue(mockRates as ReturnType<typeof naviProtocol.getRates> extends Promise<infer T> ? T : never);

    const result = await adapter.getRates('USDC');
    expect(result).toEqual({ asset: 'USDC', saveApy: 4.5, borrowApy: 6.2 });
    expect(naviProtocol.getRates).toHaveBeenCalledWith(mockClient);
  });

  it('getRates normalizes case-sensitive asset keys (USDe, USDsui)', async () => {
    const mockRates = {
      USDC: { saveApy: 4.5, borrowApy: 6.2 },
      USDT: { saveApy: 5.5, borrowApy: 7.9 },
      USDe: { saveApy: 0.4, borrowApy: 3.3 },
      USDsui: { saveApy: 1.8, borrowApy: 6.0 },
    };
    vi.mocked(naviProtocol.getRates).mockResolvedValue(mockRates as ReturnType<typeof naviProtocol.getRates> extends Promise<infer T> ? T : never);

    const usde = await adapter.getRates('USDe');
    expect(usde).toEqual({ asset: 'USDe', saveApy: 0.4, borrowApy: 3.3 });

    const usdsui = await adapter.getRates('USDsui');
    expect(usdsui).toEqual({ asset: 'USDsui', saveApy: 1.8, borrowApy: 6.0 });

    const usdt = await adapter.getRates('usdt');
    expect(usdt.asset).toBe('USDT');
  });

  it('getRates throws for unsupported asset', async () => {
    const mockRates = { USDC: { saveApy: 4.5, borrowApy: 6.2 } };
    vi.mocked(naviProtocol.getRates).mockResolvedValue(mockRates as ReturnType<typeof naviProtocol.getRates> extends Promise<infer T> ? T : never);

    await expect(adapter.getRates('FAKE')).rejects.toThrow('NAVI does not support');
  });

  it('getPositions maps navi positions to adapter format with amountUsd', async () => {
    vi.mocked(naviProtocol.getPositions).mockResolvedValue({
      positions: [
        { asset: 'USDC', type: 'save', amount: 100, amountUsd: 100, apy: 4.5 },
        { asset: 'USDC', type: 'borrow', amount: 20, amountUsd: 20, apy: 6.2 },
      ],
    } as Awaited<ReturnType<typeof naviProtocol.getPositions>>);

    const result = await adapter.getPositions('0xaddr');
    expect(result.supplies).toHaveLength(1);
    expect(result.supplies[0]).toEqual({ asset: 'USDC', amount: 100, amountUsd: 100, apy: 4.5 });
    expect(result.borrows).toHaveLength(1);
    expect(result.borrows[0]).toEqual({ asset: 'USDC', amount: 20, amountUsd: 20, apy: 6.2 });
  });

  it('getPositions passes through amountUsd for non-stablecoin assets', async () => {
    vi.mocked(naviProtocol.getPositions).mockResolvedValue({
      positions: [
        { asset: 'ETH', type: 'save', amount: 0.02, amountUsd: 46.20, apy: 1.7 },
        { asset: 'SUI', type: 'save', amount: 13.5, amountUsd: 13.93, apy: 2.7 },
      ],
    } as Awaited<ReturnType<typeof naviProtocol.getPositions>>);

    const result = await adapter.getPositions('0xaddr');
    expect(result.supplies).toHaveLength(2);
    expect(result.supplies[0].amountUsd).toBe(46.20);
    expect(result.supplies[1].amountUsd).toBe(13.93);
  });

  it('getHealth delegates to navi', async () => {
    const mockHF = { healthFactor: 3.5, supplied: 100, borrowed: 20, maxBorrow: 50, liquidationThreshold: 0.8 };
    vi.mocked(naviProtocol.getHealthFactor).mockResolvedValue(mockHF as Awaited<ReturnType<typeof naviProtocol.getHealthFactor>>);

    const result = await adapter.getHealth('0xaddr');
    expect(result.healthFactor).toBe(3.5);
  });

  it('buildSaveTx delegates without fee plumbing (B5 v2 — SDK is fee-free)', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildSaveTx).mockResolvedValue(tx);

    const result = await adapter.buildSaveTx('0xaddr', 100, 'USDC');
    expect(result.tx).toBe(tx);
    expect(naviProtocol.buildSaveTx).toHaveBeenCalledWith(mockClient, '0xaddr', 100, { asset: 'USDC' });
  });

  it('buildSaveTx normalizes "usdt" to "USDT"', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildSaveTx).mockResolvedValue(tx);

    await adapter.buildSaveTx('0xaddr', 100, 'usdt');
    expect(naviProtocol.buildSaveTx).toHaveBeenCalledWith(
      mockClient, '0xaddr', 100, expect.objectContaining({ asset: 'USDT' }),
    );
  });

  it('buildWithdrawTx returns effectiveAmount', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildWithdrawTx).mockResolvedValue({ tx, effectiveAmount: 95 });

    const result = await adapter.buildWithdrawTx('0xaddr', 100, 'USDC');
    expect(result.tx).toBe(tx);
    expect(result.effectiveAmount).toBe(95);
  });

  it('buildWithdrawTx normalizes "usde" to "USDe"', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildWithdrawTx).mockResolvedValue({ tx, effectiveAmount: 50 });

    await adapter.buildWithdrawTx('0xaddr', 50, 'usde');
    expect(naviProtocol.buildWithdrawTx).toHaveBeenCalledWith(
      mockClient, '0xaddr', 50, { asset: 'USDe' },
    );
  });

  it('buildBorrowTx delegates without fee plumbing (B5 v2 — SDK is fee-free)', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildBorrowTx).mockResolvedValue(tx);

    const result = await adapter.buildBorrowTx('0xaddr', 50, 'USDC');
    expect(result.tx).toBe(tx);
  });

  it('buildRepayTx delegates', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildRepayTx).mockResolvedValue(tx);

    const result = await adapter.buildRepayTx('0xaddr', 20, 'USDC');
    expect(result.tx).toBe(tx);
  });

  it('buildRepayTx normalizes "usdsui" to "USDsui"', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildRepayTx).mockResolvedValue(tx);

    await adapter.buildRepayTx('0xaddr', 20, 'usdsui');
    expect(naviProtocol.buildRepayTx).toHaveBeenCalledWith(
      mockClient, '0xaddr', 20, { asset: 'USDsui', skipOracle: undefined, skipPythUpdate: undefined },
    );
  });

  // Sponsored-tx safety regression: Pyth's SuiPythClient.updatePriceFeeds
  // uses tx.splitCoins(tx.gas, ...) which Sui rejects when the tx is
  // wrapped by an external sponsor (Enoki). Hosts MUST be able to opt
  // in to skipPythUpdate so the SDK never adds the tx.gas-using path.
  it('buildBorrowTx forwards skipPythUpdate to navi protocol', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildBorrowTx).mockResolvedValue(tx);

    await adapter.buildBorrowTx('0xaddr', 0.1, 'USDC', { skipPythUpdate: true });

    expect(naviProtocol.buildBorrowTx).toHaveBeenCalledWith(
      mockClient,
      '0xaddr',
      0.1,
      expect.objectContaining({ asset: 'USDC', skipPythUpdate: true }),
    );
  });

  it('buildWithdrawTx forwards skipPythUpdate to navi protocol', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildWithdrawTx).mockResolvedValue({ tx, effectiveAmount: 0.5 });

    await adapter.buildWithdrawTx('0xaddr', 0.5, 'USDC', { skipPythUpdate: true });

    expect(naviProtocol.buildWithdrawTx).toHaveBeenCalledWith(
      mockClient,
      '0xaddr',
      0.5,
      expect.objectContaining({ asset: 'USDC', skipPythUpdate: true }),
    );
  });

  it('buildRepayTx forwards skipPythUpdate to navi protocol', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildRepayTx).mockResolvedValue(tx);

    await adapter.buildRepayTx('0xaddr', 0.5, 'USDC', { skipPythUpdate: true });

    expect(naviProtocol.buildRepayTx).toHaveBeenCalledWith(
      mockClient,
      '0xaddr',
      0.5,
      expect.objectContaining({ asset: 'USDC', skipPythUpdate: true }),
    );
  });

  it('buildBorrowTx defaults skipPythUpdate to undefined for self-funded callers', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildBorrowTx).mockResolvedValue(tx);

    await adapter.buildBorrowTx('0xaddr', 1, 'USDC');

    const call = vi.mocked(naviProtocol.buildBorrowTx).mock.calls[0][3];
    expect(call?.skipPythUpdate).toBeUndefined();
  });

  it('maxWithdraw delegates', async () => {
    const mockMax = { maxAmount: 80, healthFactorAfter: 2.0, currentHF: 3.5 };
    vi.mocked(naviProtocol.maxWithdrawAmount).mockResolvedValue(mockMax);

    const result = await adapter.maxWithdraw('0xaddr', 'USDC');
    expect(result.maxAmount).toBe(80);
  });

  it('maxBorrow delegates', async () => {
    const mockMax = { maxAmount: 40, healthFactorAfter: 1.8, currentHF: 3.5 };
    vi.mocked(naviProtocol.maxBorrowAmount).mockResolvedValue(mockMax);

    const result = await adapter.maxBorrow('0xaddr', 'USDC');
    expect(result.maxAmount).toBe(40);
  });

  it('getPendingRewards delegates to navi protocol', async () => {
    const mockRewards = [
      { protocol: 'navi', asset: 'USDC', coinType: '0x549::cert::CERT', symbol: 'vSUI', amount: 0, estimatedValueUsd: 0 },
    ];
    vi.mocked(naviProtocol.getPendingRewards).mockResolvedValue(mockRewards);

    const result = await adapter.getPendingRewards!('0xaddr');
    expect(result).toHaveLength(1);
    expect(result[0].protocol).toBe('navi');
    expect(result[0].asset).toBe('USDC');
  });

  it('getPendingRewards returns empty when no incentives', async () => {
    vi.mocked(naviProtocol.getPendingRewards).mockResolvedValue([]);

    const result = await adapter.getPendingRewards!('0xaddr');
    expect(result).toHaveLength(0);
  });

  it('addClaimRewardsToTx delegates to navi protocol', async () => {
    const mockClaimed = [
      { protocol: 'navi', asset: 'USDC', coinType: '0x549::cert::CERT', symbol: 'vSUI', amount: 0, estimatedValueUsd: 0 },
    ];
    vi.mocked(naviProtocol.addClaimRewardsToTx).mockResolvedValue(mockClaimed);

    const tx = new Transaction();
    const result = await adapter.addClaimRewardsToTx!(tx, '0xaddr');
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('vSUI');
  });
});
