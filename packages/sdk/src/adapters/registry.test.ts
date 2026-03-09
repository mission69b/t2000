import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolRegistry } from './registry.js';
import type { LendingAdapter, SwapAdapter, AdapterCapability } from './types.js';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

function mockLending(overrides: Partial<LendingAdapter> = {}): LendingAdapter {
  return {
    id: 'mock-lending',
    name: 'Mock Lending',
    version: '1.0.0',
    capabilities: ['save', 'withdraw', 'borrow', 'repay'] as readonly AdapterCapability[],
    supportedAssets: ['USDC'] as readonly string[],
    supportsSameAssetBorrow: true,
    init: vi.fn(),
    getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 5.0, borrowApy: 3.0 }),
    getPositions: vi.fn().mockResolvedValue({ supplies: [], borrows: [] }),
    getHealth: vi.fn().mockResolvedValue({ healthFactor: 10, supplied: 100, borrowed: 0, maxBorrow: 50, liquidationThreshold: 0.8 }),
    buildSaveTx: vi.fn(),
    buildWithdrawTx: vi.fn(),
    buildBorrowTx: vi.fn(),
    buildRepayTx: vi.fn(),
    maxWithdraw: vi.fn(),
    maxBorrow: vi.fn(),
    ...overrides,
  };
}

function mockSwap(overrides: Partial<SwapAdapter> = {}): SwapAdapter {
  return {
    id: 'mock-swap',
    name: 'Mock Swap',
    version: '1.0.0',
    capabilities: ['swap'] as readonly AdapterCapability[],
    init: vi.fn(),
    getQuote: vi.fn().mockResolvedValue({ expectedOutput: 100, priceImpact: 0.01, poolPrice: 3.5 }),
    buildSwapTx: vi.fn(),
    getSupportedPairs: vi.fn().mockReturnValue([{ from: 'USDC', to: 'SUI' }, { from: 'SUI', to: 'USDC' }]),
    getPoolPrice: vi.fn().mockResolvedValue(3.5),
    ...overrides,
  };
}

describe('ProtocolRegistry', () => {
  let registry: ProtocolRegistry;

  beforeEach(() => {
    registry = new ProtocolRegistry();
  });

  describe('registration', () => {
    it('registers and retrieves lending adapters', () => {
      const adapter = mockLending({ id: 'navi' });
      registry.registerLending(adapter);
      expect(registry.getLending('navi')).toBe(adapter);
      expect(registry.listLending()).toHaveLength(1);
    });

    it('registers and retrieves swap adapters', () => {
      const adapter = mockSwap({ id: 'cetus' });
      registry.registerSwap(adapter);
      expect(registry.getSwap('cetus')).toBe(adapter);
      expect(registry.listSwap()).toHaveLength(1);
    });

    it('returns undefined for unknown adapters', () => {
      expect(registry.getLending('unknown')).toBeUndefined();
      expect(registry.getSwap('unknown')).toBeUndefined();
    });
  });

  describe('bestSaveRate', () => {
    it('returns adapter with highest save APY', async () => {
      const low = mockLending({ id: 'low', getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 3.0, borrowApy: 5.0 }) });
      const high = mockLending({ id: 'high', getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 8.0, borrowApy: 4.0 }) });
      registry.registerLending(low);
      registry.registerLending(high);

      const result = await registry.bestSaveRate('USDC');
      expect(result.adapter.id).toBe('high');
      expect(result.rate.saveApy).toBe(8.0);
    });

    it('skips adapters that do not support the asset', async () => {
      const btcOnly = mockLending({ id: 'btc', supportedAssets: ['BTC'] });
      const usdc = mockLending({ id: 'usdc' });
      registry.registerLending(btcOnly);
      registry.registerLending(usdc);

      const result = await registry.bestSaveRate('USDC');
      expect(result.adapter.id).toBe('usdc');
    });

    it('throws when no adapter supports the asset', async () => {
      registry.registerLending(mockLending({ id: 'btc', supportedAssets: ['BTC'] }));
      await expect(registry.bestSaveRate('USDC')).rejects.toThrow('No lending adapter supports saving USDC');
    });

    it('skips adapters that throw on getRates', async () => {
      const broken = mockLending({ id: 'broken', getRates: vi.fn().mockRejectedValue(new Error('rpc fail')) });
      const good = mockLending({ id: 'good' });
      registry.registerLending(broken);
      registry.registerLending(good);

      const result = await registry.bestSaveRate('USDC');
      expect(result.adapter.id).toBe('good');
    });
  });

  describe('bestBorrowRate', () => {
    it('returns adapter with lowest borrow APY', async () => {
      const expensive = mockLending({ id: 'exp', getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 3.0, borrowApy: 8.0 }) });
      const cheap = mockLending({ id: 'cheap', getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 3.0, borrowApy: 2.0 }) });
      registry.registerLending(expensive);
      registry.registerLending(cheap);

      const result = await registry.bestBorrowRate('USDC');
      expect(result.adapter.id).toBe('cheap');
      expect(result.rate.borrowApy).toBe(2.0);
    });

    it('filters adapters requiring same-asset borrow', async () => {
      const noSame = mockLending({ id: 'suilend', supportsSameAssetBorrow: false });
      const yesSame = mockLending({ id: 'navi', supportsSameAssetBorrow: true });
      registry.registerLending(noSame);
      registry.registerLending(yesSame);

      const result = await registry.bestBorrowRate('USDC', { requireSameAssetBorrow: true });
      expect(result.adapter.id).toBe('navi');
    });
  });

  describe('bestSwapQuote', () => {
    it('returns adapter with best output', async () => {
      const worse = mockSwap({ id: 'worse', getQuote: vi.fn().mockResolvedValue({ expectedOutput: 90, priceImpact: 0.02, poolPrice: 3.5 }) });
      const better = mockSwap({ id: 'better', getQuote: vi.fn().mockResolvedValue({ expectedOutput: 100, priceImpact: 0.01, poolPrice: 3.5 }) });
      registry.registerSwap(worse);
      registry.registerSwap(better);

      const result = await registry.bestSwapQuote('USDC', 'SUI', 100);
      expect(result.adapter.id).toBe('better');
      expect(result.quote.expectedOutput).toBe(100);
    });

    it('throws when no adapter supports the pair', async () => {
      registry.registerSwap(mockSwap({ getSupportedPairs: vi.fn().mockReturnValue([{ from: 'USDC', to: 'SUI' }]) }));
      await expect(registry.bestSwapQuote('BTC', 'ETH', 1)).rejects.toThrow('No swap adapter supports BTC → ETH');
    });
  });

  describe('allRates', () => {
    it('returns rates from all supporting adapters', async () => {
      const a = mockLending({ id: 'a', name: 'Alpha', getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 5, borrowApy: 3 }) });
      const b = mockLending({ id: 'b', name: 'Beta', getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 7, borrowApy: 4 }) });
      registry.registerLending(a);
      registry.registerLending(b);

      const rates = await registry.allRates('USDC');
      expect(rates).toHaveLength(2);
      expect(rates[0].protocolId).toBe('a');
      expect(rates[1].protocolId).toBe('b');
    });
  });

  describe('allPositions', () => {
    it('returns positions from adapters with active positions', async () => {
      const withPos = mockLending({
        id: 'has',
        name: 'Has Positions',
        getPositions: vi.fn().mockResolvedValue({
          supplies: [{ asset: 'USDC', amount: 100, apy: 5 }],
          borrows: [],
        }),
      });
      const empty = mockLending({
        id: 'empty',
        name: 'Empty',
        getPositions: vi.fn().mockResolvedValue({ supplies: [], borrows: [] }),
      });
      registry.registerLending(withPos);
      registry.registerLending(empty);

      const result = await registry.allPositions('0xabc');
      expect(result).toHaveLength(1);
      expect(result[0].protocolId).toBe('has');
    });
  });

  describe('bestSaveRateAcrossAssets', () => {
    it('finds best rate across all stablecoins', async () => {
      const navi = mockLending({
        id: 'navi',
        name: 'NAVI',
        supportedAssets: ['USDC', 'USDT', 'USDe', 'USDsui'],
        getRates: vi.fn().mockImplementation((asset: string) => {
          if (asset === 'USDT') return Promise.resolve({ asset, saveApy: 8.5, borrowApy: 5 });
          return Promise.resolve({ asset, saveApy: 4.0, borrowApy: 6 });
        }),
      });
      registry.registerLending(navi);

      const result = await registry.bestSaveRateAcrossAssets();
      expect(result.asset).toBe('USDT');
      expect(result.rate.saveApy).toBe(8.5);
    });

    it('throws when no adapters registered', async () => {
      await expect(registry.bestSaveRateAcrossAssets()).rejects.toThrow();
    });
  });

  describe('allRatesAcrossAssets', () => {
    it('returns rates for all supported assets', async () => {
      const adapter = mockLending({
        id: 'multi',
        name: 'Multi',
        supportedAssets: ['USDC', 'USDT'],
        getRates: vi.fn().mockImplementation((asset: string) =>
          Promise.resolve({ asset, saveApy: asset === 'USDT' ? 7 : 4, borrowApy: 5 }),
        ),
      });
      registry.registerLending(adapter);

      const results = await registry.allRatesAcrossAssets();
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some(r => r.asset === 'USDC')).toBe(true);
      expect(results.some(r => r.asset === 'USDT')).toBe(true);
    });
  });

  describe('isSupportedAsset', () => {
    it('returns true for registered asset', () => {
      registry.registerLending(mockLending({ supportedAssets: ['USDC', 'USDT'] }));
      expect(registry.isSupportedAsset('USDC')).toBe(true);
      expect(registry.isSupportedAsset('USDT')).toBe(true);
    });

    it('returns false for unregistered asset', () => {
      registry.registerLending(mockLending({ supportedAssets: ['USDC'] }));
      expect(registry.isSupportedAsset('DOGE')).toBe(false);
    });

    it('filters by capability', () => {
      registry.registerLending(mockLending({
        supportedAssets: ['USDC', 'USDT'],
        capabilities: ['save', 'withdraw'],
      }));
      expect(registry.isSupportedAsset('USDC', 'save')).toBe(true);
      expect(registry.isSupportedAsset('USDC', 'borrow')).toBe(false);
    });

    it('returns false when no adapters registered', () => {
      expect(registry.isSupportedAsset('USDC')).toBe(false);
    });
  });

  describe('getSupportedAssets', () => {
    it('returns deduplicated list across adapters', () => {
      registry.registerLending(mockLending({ id: 'a', supportedAssets: ['USDC', 'USDT'] }));
      registry.registerLending(mockLending({ id: 'b', supportedAssets: ['USDC', 'USDe'] }));
      const assets = registry.getSupportedAssets();
      expect(assets).toContain('USDC');
      expect(assets).toContain('USDT');
      expect(assets).toContain('USDe');
      expect(assets.filter(a => a === 'USDC')).toHaveLength(1);
    });

    it('filters by capability', () => {
      registry.registerLending(mockLending({
        supportedAssets: ['USDC', 'USDT'],
        capabilities: ['save', 'withdraw'],
      }));
      registry.registerLending(mockLending({
        id: 'borrow-only',
        supportedAssets: ['USDC', 'USDe'],
        capabilities: ['borrow', 'repay'],
      }));
      const saveAssets = registry.getSupportedAssets('save');
      expect(saveAssets).toContain('USDC');
      expect(saveAssets).toContain('USDT');
      expect(saveAssets).not.toContain('USDe');
    });

    it('returns empty array when no adapters registered', () => {
      expect(registry.getSupportedAssets()).toEqual([]);
    });
  });
});
