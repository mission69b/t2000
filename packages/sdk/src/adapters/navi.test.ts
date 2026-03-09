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

  it('getPositions maps navi positions to adapter format', async () => {
    vi.mocked(naviProtocol.getPositions).mockResolvedValue({
      positions: [
        { asset: 'USDC', type: 'save', amount: 100, apy: 4.5 },
        { asset: 'USDC', type: 'borrow', amount: 20, apy: 6.2 },
      ],
    } as Awaited<ReturnType<typeof naviProtocol.getPositions>>);

    const result = await adapter.getPositions('0xaddr');
    expect(result.supplies).toHaveLength(1);
    expect(result.supplies[0]).toEqual({ asset: 'USDC', amount: 100, apy: 4.5 });
    expect(result.borrows).toHaveLength(1);
    expect(result.borrows[0]).toEqual({ asset: 'USDC', amount: 20, apy: 6.2 });
  });

  it('getHealth delegates to navi', async () => {
    const mockHF = { healthFactor: 3.5, supplied: 100, borrowed: 20, maxBorrow: 50, liquidationThreshold: 0.8 };
    vi.mocked(naviProtocol.getHealthFactor).mockResolvedValue(mockHF as Awaited<ReturnType<typeof naviProtocol.getHealthFactor>>);

    const result = await adapter.getHealth('0xaddr');
    expect(result.healthFactor).toBe(3.5);
  });

  it('buildSaveTx delegates with collectFee', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildSaveTx).mockResolvedValue(tx);

    const result = await adapter.buildSaveTx('0xaddr', 100, 'USDC', { collectFee: true });
    expect(result.tx).toBe(tx);
    expect(naviProtocol.buildSaveTx).toHaveBeenCalledWith(mockClient, '0xaddr', 100, { collectFee: true, asset: 'USDC' });
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

  it('buildBorrowTx delegates', async () => {
    const tx = new Transaction();
    vi.mocked(naviProtocol.buildBorrowTx).mockResolvedValue(tx);

    const result = await adapter.buildBorrowTx('0xaddr', 50, 'USDC', { collectFee: true });
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
      mockClient, '0xaddr', 20, { asset: 'USDsui' },
    );
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
});
