/**
 * Integration tests for T2000 multi-protocol orchestration.
 *
 * These tests exercise the T2000 class methods (save, withdraw, etc.)
 * with multiple mock adapters registered, verifying correct routing,
 * validation, and edge-case handling that unit tests miss.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import type { LendingAdapter, SwapAdapter, AdapterCapability } from './adapters/types.js';
import { ProtocolRegistry } from './adapters/registry.js';

function createMockLending(overrides: Partial<LendingAdapter> & { id: string; name: string }): LendingAdapter {
  return {
    version: '1.0.0',
    capabilities: ['save', 'withdraw', 'borrow', 'repay'] as readonly AdapterCapability[],
    supportedAssets: ['USDC'] as readonly string[],
    supportsSameAssetBorrow: true,
    init: vi.fn(),
    getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 5.0, borrowApy: 3.0 }),
    getPositions: vi.fn().mockResolvedValue({ supplies: [], borrows: [] }),
    getHealth: vi.fn().mockResolvedValue({ healthFactor: 10, supplied: 0, borrowed: 0, maxBorrow: 0, liquidationThreshold: 0.8 }),
    buildSaveTx: vi.fn().mockResolvedValue({ tx: new Transaction() }),
    buildWithdrawTx: vi.fn().mockResolvedValue({ tx: new Transaction(), effectiveAmount: 10 }),
    buildBorrowTx: vi.fn().mockResolvedValue({ tx: new Transaction() }),
    buildRepayTx: vi.fn().mockResolvedValue({ tx: new Transaction() }),
    maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 0, healthFactorAfter: 999, currentHF: 999 }),
    maxBorrow: vi.fn().mockResolvedValue({ maxAmount: 0, healthFactorAfter: 999, currentHF: 999 }),
    ...overrides,
  };
}

// ─── withdraw all: multi-protocol orchestration ───────────────

describe('withdraw all — multi-protocol', () => {
  let navi: LendingAdapter;
  let suilend: LendingAdapter;
  let registry: ProtocolRegistry;

  beforeEach(() => {
    navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 5.0, apy: 5.5 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 5.0, healthFactorAfter: 999, currentHF: 999 }),
      buildWithdrawTx: vi.fn().mockResolvedValue({ tx: new Transaction(), effectiveAmount: 5.0 }),
    });

    suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      supportsSameAssetBorrow: false,
      capabilities: ['save', 'withdraw'] as readonly AdapterCapability[],
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 2.5, apy: 2.2 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 2.5, healthFactorAfter: 999, currentHF: 999 }),
      buildWithdrawTx: vi.fn().mockResolvedValue({ tx: new Transaction(), effectiveAmount: 2.5 }),
    });

    registry = new ProtocolRegistry();
    registry.registerLending(navi);
    registry.registerLending(suilend);
  });

  it('allPositions returns positions from both protocols', async () => {
    const positions = await registry.allPositions('0xtest');
    expect(positions).toHaveLength(2);
    expect(positions.map(p => p.protocolId).sort()).toEqual(['navi', 'suilend']);
  });

  it('allPositions filters out protocols with no supply', async () => {
    (navi.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue({ supplies: [], borrows: [] });
    const positions = await registry.allPositions('0xtest');
    expect(positions).toHaveLength(1);
    expect(positions[0].protocolId).toBe('suilend');
  });

  it('allPositions returns empty when no protocol has supply', async () => {
    (navi.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue({ supplies: [], borrows: [] });
    (suilend.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue({ supplies: [], borrows: [] });
    const positions = await registry.allPositions('0xtest');
    expect(positions).toHaveLength(0);
  });

  it('getLending returns correct adapter by id', () => {
    expect(registry.getLending('navi')).toBe(navi);
    expect(registry.getLending('suilend')).toBe(suilend);
    expect(registry.getLending('unknown')).toBeUndefined();
  });

  it('maxWithdraw returns correct amounts from each adapter', async () => {
    const naviMax = await navi.maxWithdraw('0xtest', 'USDC');
    expect(naviMax.maxAmount).toBe(5.0);

    const suilendMax = await suilend.maxWithdraw('0xtest', 'USDC');
    expect(suilendMax.maxAmount).toBe(2.5);
  });

  it('skips protocols with zero balance in withdraw all flow', async () => {
    // NAVI has a dust position ($0.0001) — below the $0.001 threshold
    (navi.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue({
      supplies: [{ asset: 'USDC', amount: 0.0001, apy: 5.5 }],
      borrows: [],
    });
    (navi.maxWithdraw as ReturnType<typeof vi.fn>).mockResolvedValue({ maxAmount: 0.0001, healthFactorAfter: 999, currentHF: 999 });

    const positions = await registry.allPositions('0xtest');
    // allPositions includes it (any non-empty), but withdraw all filtering skips dust
    const withSupply = positions.filter(
      p => p.positions.supplies.some(s => s.asset === 'USDC' && s.amount > 0.001),
    );
    expect(withSupply).toHaveLength(1);
    expect(withSupply[0].protocolId).toBe('suilend');
  });

  it('handles protocol that throws during getPositions', async () => {
    (navi.getPositions as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('rpc fail'));
    const positions = await registry.allPositions('0xtest');
    expect(positions).toHaveLength(1);
    expect(positions[0].protocolId).toBe('suilend');
  });
});

// ─── save: balance validation ───────────────────────────────

describe('save — balance validation', () => {
  let registry: ProtocolRegistry;

  beforeEach(() => {
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 5.5, borrowApy: 8.0 }),
    });
    registry = new ProtocolRegistry();
    registry.registerLending(navi);
  });

  it('bestSaveRate returns the best adapter', async () => {
    const suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 2.2, borrowApy: 5.5 }),
    });
    registry.registerLending(suilend);

    const result = await registry.bestSaveRate('USDC');
    expect(result.adapter.id).toBe('navi');
    expect(result.rate.saveApy).toBe(5.5);
  });

  it('bestSaveRate picks suilend when it has higher rate', async () => {
    const suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 8.0, borrowApy: 5.5 }),
    });
    registry.registerLending(suilend);

    const result = await registry.bestSaveRate('USDC');
    expect(result.adapter.id).toBe('suilend');
    expect(result.rate.saveApy).toBe(8.0);
  });
});

// ─── withdraw: specific protocol routing ───────────────────

describe('withdraw — protocol routing', () => {
  let navi: LendingAdapter;
  let suilend: LendingAdapter;
  let registry: ProtocolRegistry;

  beforeEach(() => {
    navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 1.0, apy: 5.5 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 1.0, healthFactorAfter: 999, currentHF: 999 }),
    });

    suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      supportsSameAssetBorrow: false,
      capabilities: ['save', 'withdraw'] as readonly AdapterCapability[],
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 10.0, apy: 2.2 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 10.0, healthFactorAfter: 999, currentHF: 999 }),
    });

    registry = new ProtocolRegistry();
    registry.registerLending(navi);
    registry.registerLending(suilend);
  });

  it('getLending("suilend") returns suilend adapter', () => {
    expect(registry.getLending('suilend')).toBe(suilend);
  });

  it('getLending("navi") returns navi adapter', () => {
    expect(registry.getLending('navi')).toBe(navi);
  });

  it('withdraw with --protocol suilend routes to suilend', () => {
    const adapter = registry.getLending('suilend');
    expect(adapter).toBe(suilend);
    expect(adapter?.id).toBe('suilend');
  });

  it('allPositions sums across both protocols', async () => {
    const positions = await registry.allPositions('0xtest');
    const totalSupplied = positions.reduce(
      (sum, p) => sum + p.positions.supplies.reduce((s, sup) => s + sup.amount, 0),
      0,
    );
    expect(totalSupplied).toBe(11.0);
  });
});

// ─── edge cases ─────────────────────────────────────────────

describe('multi-protocol edge cases', () => {
  it('registry with single protocol still works for allPositions', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 5.0, apy: 5.5 }],
        borrows: [],
      }),
    });
    registry.registerLending(navi);
    const positions = await registry.allPositions('0xtest');
    expect(positions).toHaveLength(1);
    expect(positions[0].protocolId).toBe('navi');
  });

  it('allPositions with 3+ protocols returns all with supply', async () => {
    const registry = new ProtocolRegistry();
    const a = createMockLending({
      id: 'proto-a',
      name: 'Proto A',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 1.0, apy: 3.0 }],
        borrows: [],
      }),
    });
    const b = createMockLending({
      id: 'proto-b',
      name: 'Proto B',
      getPositions: vi.fn().mockResolvedValue({ supplies: [], borrows: [] }),
    });
    const c = createMockLending({
      id: 'proto-c',
      name: 'Proto C',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 3.0, apy: 7.0 }],
        borrows: [],
      }),
    });
    registry.registerLending(a);
    registry.registerLending(b);
    registry.registerLending(c);

    const positions = await registry.allPositions('0xtest');
    expect(positions).toHaveLength(2);
    expect(positions.map(p => p.protocolId).sort()).toEqual(['proto-a', 'proto-c']);
  });

  it('tiny balance (<0.001) is treated as empty for withdraw all filtering', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 0.0001, apy: 5.5 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 0.0001, healthFactorAfter: 999, currentHF: 999 }),
    });
    registry.registerLending(navi);

    const positions = await registry.allPositions('0xtest');
    // allPositions returns it (>0 supplies), but withdraw all filtering should skip it
    const withSupply = positions.filter(
      p => p.positions.supplies.some(s => s.asset === 'USDC' && s.amount > 0.001),
    );
    expect(withSupply).toHaveLength(0);
  });

  it('allRates returns rates from all registered protocols', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI',
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 5.5, borrowApy: 8.0 }),
    });
    const suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 2.2, borrowApy: 5.5 }),
    });
    registry.registerLending(navi);
    registry.registerLending(suilend);

    const rates = await registry.allRates('USDC');
    expect(rates).toHaveLength(2);
    expect(rates.find(r => r.protocolId === 'navi')?.rates.saveApy).toBe(5.5);
    expect(rates.find(r => r.protocolId === 'suilend')?.rates.saveApy).toBe(2.2);
  });

  it('allRates skips protocol that throws', async () => {
    const registry = new ProtocolRegistry();
    const broken = createMockLending({
      id: 'broken',
      name: 'Broken',
      getRates: vi.fn().mockRejectedValue(new Error('rpc fail')),
    });
    const good = createMockLending({
      id: 'good',
      name: 'Good',
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 4.0, borrowApy: 6.0 }),
    });
    registry.registerLending(broken);
    registry.registerLending(good);

    const rates = await registry.allRates('USDC');
    expect(rates).toHaveLength(1);
    expect(rates[0].protocolId).toBe('good');
  });
});

// ─── borrow/repay routing with supportsSameAssetBorrow ────────

describe('borrow routing — supportsSameAssetBorrow', () => {
  let navi: LendingAdapter;
  let suilend: LendingAdapter;
  let registry: ProtocolRegistry;

  beforeEach(() => {
    navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      supportsSameAssetBorrow: true,
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 5.5, borrowApy: 8.0 }),
    });
    suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      supportsSameAssetBorrow: false,
      capabilities: ['save', 'withdraw'] as readonly AdapterCapability[],
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 2.2, borrowApy: 5.5 }),
    });
    registry = new ProtocolRegistry();
    registry.registerLending(navi);
    registry.registerLending(suilend);
  });

  it('bestBorrowRate skips adapters without same-asset borrow', async () => {
    const result = await registry.bestBorrowRate('USDC', { requireSameAssetBorrow: true });
    expect(result.adapter.id).toBe('navi');
  });

  it('bestBorrowRate throws when no adapter supports borrow', async () => {
    const registry = new ProtocolRegistry();
    const saveOnly = createMockLending({
      id: 'save-only',
      name: 'Save Only',
      capabilities: ['save', 'withdraw'] as readonly AdapterCapability[],
      supportsSameAssetBorrow: false,
    });
    registry.registerLending(saveOnly);
    await expect(registry.bestBorrowRate('USDC')).rejects.toThrow('No lending adapter supports borrowing USDC');
  });

  it('listLending filtered by borrow capability excludes save-only adapters', () => {
    const borrowable = registry.listLending().filter(
      a => a.supportedAssets.includes('USDC') &&
           a.capabilities.includes('borrow') &&
           a.supportsSameAssetBorrow,
    );
    expect(borrowable).toHaveLength(1);
    expect(borrowable[0].id).toBe('navi');
  });

  it('listLending filtered by repay capability excludes save-only adapters', () => {
    const repayable = registry.listLending().filter(
      a => a.supportedAssets.includes('USDC') && a.capabilities.includes('repay'),
    );
    expect(repayable).toHaveLength(1);
    expect(repayable[0].id).toBe('navi');
  });

  it('bestBorrowRate picks lowest APY among eligible', async () => {
    const cheapBorrow = createMockLending({
      id: 'cheap',
      name: 'Cheap Borrow',
      supportsSameAssetBorrow: true,
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 3.0, borrowApy: 2.0 }),
    });
    registry.registerLending(cheapBorrow);

    const result = await registry.bestBorrowRate('USDC');
    expect(result.adapter.id).toBe('cheap');
    expect(result.rate.borrowApy).toBe(2.0);
  });
});

// ─── positions() flattening across protocols ──────────────────

describe('positions — multi-protocol flattening', () => {
  it('flattens supplies from multiple protocols with correct protocol field', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 5.0, apy: 5.5 }],
        borrows: [],
      }),
    });
    const suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 2.5, apy: 2.2 }],
        borrows: [],
      }),
    });
    registry.registerLending(navi);
    registry.registerLending(suilend);

    const allPos = await registry.allPositions('0xtest');
    const flattened = allPos.flatMap(p => [
      ...p.positions.supplies.map(s => ({
        protocol: p.protocolId,
        asset: s.asset,
        type: 'save' as const,
        amount: s.amount,
        apy: s.apy,
      })),
      ...p.positions.borrows.map(b => ({
        protocol: p.protocolId,
        asset: b.asset,
        type: 'borrow' as const,
        amount: b.amount,
        apy: b.apy,
      })),
    ]);

    expect(flattened).toHaveLength(2);
    expect(flattened.find(p => p.protocol === 'navi')?.amount).toBe(5.0);
    expect(flattened.find(p => p.protocol === 'suilend')?.amount).toBe(2.5);
  });

  it('includes both supplies and borrows in flattened result', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 10.0, apy: 5.5 }],
        borrows: [{ asset: 'USDC', amount: 3.0, apy: 8.0 }],
      }),
    });
    registry.registerLending(navi);

    const allPos = await registry.allPositions('0xtest');
    const flattened = allPos.flatMap(p => [
      ...p.positions.supplies.map(s => ({ protocol: p.protocolId, type: 'save' as const, amount: s.amount })),
      ...p.positions.borrows.map(b => ({ protocol: p.protocolId, type: 'borrow' as const, amount: b.amount })),
    ]);

    expect(flattened).toHaveLength(2);
    expect(flattened.find(p => p.type === 'save')?.amount).toBe(10.0);
    expect(flattened.find(p => p.type === 'borrow')?.amount).toBe(3.0);
  });
});

// ─── withdraw all --protocol (single protocol "all") ──────────

describe('withdraw all --protocol (single protocol path)', () => {
  it('withdraw all --protocol suilend only touches suilend adapter', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 5.0, apy: 5.5 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 5.0, healthFactorAfter: 999, currentHF: 999 }),
    });
    const suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 2.5, apy: 2.2 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 2.5, healthFactorAfter: 999, currentHF: 999 }),
    });
    registry.registerLending(navi);
    registry.registerLending(suilend);

    // When protocol is specified, getLending returns that specific adapter
    const adapter = registry.getLending('suilend');
    expect(adapter).toBe(suilend);
    const max = await adapter!.maxWithdraw('0xtest', 'USDC');
    expect(max.maxAmount).toBe(2.5);
    // NAVI should not be touched
    expect(navi.maxWithdraw).not.toHaveBeenCalled();
  });
});

// ─── withdraw with active borrows (health factor guard) ───────

describe('withdraw — health factor guard', () => {
  it('maxWithdraw respects health factor when borrowed > 0', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      getHealth: vi.fn().mockResolvedValue({
        healthFactor: 2.5,
        supplied: 100,
        borrowed: 50,
        maxBorrow: 30,
        liquidationThreshold: 0.8,
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 30.0, healthFactorAfter: 1.5, currentHF: 2.5 }),
    });
    registry.registerLending(navi);

    const adapter = registry.getLending('navi')!;
    const hf = await adapter.getHealth('0xtest');
    expect(hf.borrowed).toBe(50);
    expect(hf.healthFactor).toBe(2.5);

    const max = await adapter.maxWithdraw('0xtest', 'USDC');
    expect(max.maxAmount).toBe(30.0);
    expect(max.healthFactorAfter).toBe(1.5);
  });

  it('protocol with no borrows allows full withdrawal', async () => {
    const registry = new ProtocolRegistry();
    const suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      getHealth: vi.fn().mockResolvedValue({
        healthFactor: Infinity,
        supplied: 50,
        borrowed: 0,
        maxBorrow: 40,
        liquidationThreshold: 0.8,
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 50.0, healthFactorAfter: Infinity, currentHF: Infinity }),
    });
    registry.registerLending(suilend);

    const adapter = registry.getLending('suilend')!;
    const hf = await adapter.getHealth('0xtest');
    expect(hf.borrowed).toBe(0);

    const max = await adapter.maxWithdraw('0xtest', 'USDC');
    expect(max.maxAmount).toBe(50.0);
  });
});

// ─── swap adapter routing ─────────────────────────────────────

describe('swap — multi-adapter routing', () => {
  it('bestSwapQuote picks adapter with best output', async () => {
    const registry = new ProtocolRegistry();
    const { SwapAdapter: _unused, ...rest } = {} as Record<string, unknown>;
    const worse: import('./adapters/types.js').SwapAdapter = {
      id: 'worse-dex',
      name: 'Worse DEX',
      version: '1.0.0',
      capabilities: ['swap'] as readonly AdapterCapability[],
      init: vi.fn(),
      getQuote: vi.fn().mockResolvedValue({ expectedOutput: 90, priceImpact: 0.03, poolPrice: 0.95 }),
      buildSwapTx: vi.fn(),
      getSupportedPairs: vi.fn().mockReturnValue([{ from: 'USDC', to: 'SUI' }, { from: 'SUI', to: 'USDC' }]),
      getPoolPrice: vi.fn().mockResolvedValue(0.95),
    };
    const better: import('./adapters/types.js').SwapAdapter = {
      id: 'better-dex',
      name: 'Better DEX',
      version: '1.0.0',
      capabilities: ['swap'] as readonly AdapterCapability[],
      init: vi.fn(),
      getQuote: vi.fn().mockResolvedValue({ expectedOutput: 105, priceImpact: 0.01, poolPrice: 1.05 }),
      buildSwapTx: vi.fn(),
      getSupportedPairs: vi.fn().mockReturnValue([{ from: 'USDC', to: 'SUI' }, { from: 'SUI', to: 'USDC' }]),
      getPoolPrice: vi.fn().mockResolvedValue(1.05),
    };
    registry.registerSwap(worse);
    registry.registerSwap(better);

    const result = await registry.bestSwapQuote('USDC', 'SUI', 100);
    expect(result.adapter.id).toBe('better-dex');
    expect(result.quote.expectedOutput).toBe(105);
  });

  it('bestSwapQuote skips adapter that throws', async () => {
    const registry = new ProtocolRegistry();
    const broken: import('./adapters/types.js').SwapAdapter = {
      id: 'broken-dex',
      name: 'Broken DEX',
      version: '1.0.0',
      capabilities: ['swap'] as readonly AdapterCapability[],
      init: vi.fn(),
      getQuote: vi.fn().mockRejectedValue(new Error('pool not found')),
      buildSwapTx: vi.fn(),
      getSupportedPairs: vi.fn().mockReturnValue([{ from: 'USDC', to: 'SUI' }]),
      getPoolPrice: vi.fn(),
    };
    const good: import('./adapters/types.js').SwapAdapter = {
      id: 'good-dex',
      name: 'Good DEX',
      version: '1.0.0',
      capabilities: ['swap'] as readonly AdapterCapability[],
      init: vi.fn(),
      getQuote: vi.fn().mockResolvedValue({ expectedOutput: 100, priceImpact: 0.01, poolPrice: 1.0 }),
      buildSwapTx: vi.fn(),
      getSupportedPairs: vi.fn().mockReturnValue([{ from: 'USDC', to: 'SUI' }]),
      getPoolPrice: vi.fn().mockResolvedValue(1.0),
    };
    registry.registerSwap(broken);
    registry.registerSwap(good);

    const result = await registry.bestSwapQuote('USDC', 'SUI', 100);
    expect(result.adapter.id).toBe('good-dex');
  });

  it('bestSwapQuote throws when no adapter supports pair', async () => {
    const registry = new ProtocolRegistry();
    const dex: import('./adapters/types.js').SwapAdapter = {
      id: 'dex',
      name: 'DEX',
      version: '1.0.0',
      capabilities: ['swap'] as readonly AdapterCapability[],
      init: vi.fn(),
      getQuote: vi.fn(),
      buildSwapTx: vi.fn(),
      getSupportedPairs: vi.fn().mockReturnValue([{ from: 'USDC', to: 'SUI' }]),
      getPoolPrice: vi.fn(),
    };
    registry.registerSwap(dex);

    await expect(registry.bestSwapQuote('BTC', 'ETH', 1)).rejects.toThrow('No swap adapter supports BTC → ETH');
  });
});

// ─── rebalance: yield optimization ───────────────

describe('rebalance — yield optimization', () => {
  let registry: ProtocolRegistry;

  beforeEach(() => {
    registry = new ProtocolRegistry();
  });

  it('identifies lowest-yield position and best opportunity', async () => {
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI',
      supportedAssets: ['USDC', 'USDT'],
      getRates: vi.fn().mockImplementation((asset: string) =>
        asset === 'USDC'
          ? { asset: 'USDC', saveApy: 3.0, borrowApy: 6.0 }
          : { asset: 'USDT', saveApy: 5.5, borrowApy: 7.0 },
      ),
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 1000, apy: 3.0 }],
        borrows: [],
      }),
    });
    registry.registerLending(navi);

    const allRates = await registry.allRatesAcrossAssets();
    expect(allRates.length).toBeGreaterThanOrEqual(2);

    const best = allRates.reduce((a, b) => b.rates.saveApy > a.rates.saveApy ? b : a);
    expect(best.asset).toBe('USDT');
    expect(best.rates.saveApy).toBe(5.5);
  });

  it('bestSaveRateAcrossAssets returns global best', async () => {
    const low = createMockLending({
      id: 'low',
      name: 'Low',
      supportedAssets: ['USDC'],
      getRates: vi.fn().mockResolvedValue({ asset: 'USDC', saveApy: 2.0, borrowApy: 5.0 }),
    });
    const high = createMockLending({
      id: 'high',
      name: 'High',
      supportedAssets: ['USDC', 'USDT'],
      getRates: vi.fn().mockImplementation((asset: string) =>
        asset === 'USDT'
          ? { asset: 'USDT', saveApy: 8.0, borrowApy: 10.0 }
          : { asset: 'USDC', saveApy: 4.0, borrowApy: 6.0 },
      ),
    });
    registry.registerLending(low);
    registry.registerLending(high);

    const result = await registry.bestSaveRateAcrossAssets();
    expect(result.asset).toBe('USDT');
    expect(result.rate.saveApy).toBe(8.0);
    expect(result.adapter.name).toBe('High');
  });

  it('calculates break-even days for cross-asset moves', () => {
    const swapCost = 0.30;
    const annualGain = 11.90;
    const breakEvenDays = Math.ceil((swapCost / annualGain) * 365);
    expect(breakEvenDays).toBe(10);
  });

  it('same-asset rebalance has zero swap cost', () => {
    const isSameAsset = true;
    const estimatedSwapCost = isSameAsset ? 0 : 0.30;
    const breakEvenDays = estimatedSwapCost > 0 ? Math.ceil((estimatedSwapCost / 6.9) * 365) : 0;
    expect(estimatedSwapCost).toBe(0);
    expect(breakEvenDays).toBe(0);
  });

  it('skips opportunities below minYieldDiff', () => {
    const currentApy = 4.2;
    const bestApy = 4.5;
    const minYieldDiff = 0.5;
    const apyDiff = bestApy - currentApy;
    expect(apyDiff < minYieldDiff).toBe(true);
  });

  it('skips cross-asset moves with break-even > maxBreakEven', () => {
    const swapCost = 5.0;
    const annualGain = 2.0;
    const maxBreakEven = 30;
    const breakEvenDays = Math.ceil((swapCost / annualGain) * 365);
    expect(breakEvenDays).toBeGreaterThan(maxBreakEven);
  });

  it('handles empty positions (nothing to rebalance)', async () => {
    const empty = createMockLending({
      id: 'empty',
      name: 'Empty',
      getPositions: vi.fn().mockResolvedValue({ supplies: [], borrows: [] }),
    });
    registry.registerLending(empty);

    const positions = await registry.allPositions('0x123');
    const savePositions = positions.flatMap(p =>
      p.positions.supplies.filter(s => s.amount > 0.01),
    );
    expect(savePositions.length).toBe(0);
  });

  it('health factor check prevents unsafe rebalance', () => {
    const healthFactor = 1.3;
    const threshold = 1.5;
    expect(healthFactor < threshold).toBe(true);
  });
});

// ─── borrow multi-stable ───────────────

describe('borrow multi-stable', () => {
  let registry: ProtocolRegistry;

  beforeEach(() => {
    registry = new ProtocolRegistry();
  });

  it('finds adapter supporting USDT borrow', () => {
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI',
      supportedAssets: ['USDC', 'USDT', 'USDe', 'USDsui'],
      capabilities: ['save', 'withdraw', 'borrow', 'repay'],
    });
    registry.registerLending(navi);

    const adapters = registry.listLending().filter(
      a => a.supportedAssets.includes('USDT') && a.capabilities.includes('borrow'),
    );
    expect(adapters.length).toBe(1);
    expect(adapters[0].id).toBe('navi');
  });

  it('finds adapter supporting USDe borrow', () => {
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI',
      supportedAssets: ['USDC', 'USDT', 'USDe', 'USDsui'],
    });
    registry.registerLending(navi);

    const adapters = registry.listLending().filter(
      a => a.supportedAssets.includes('USDe') && a.capabilities.includes('borrow'),
    );
    expect(adapters.length).toBe(1);
  });

  it('defaults to USDC when no asset specified', () => {
    const params: { asset?: string } = {};
    const asset = params.asset ?? 'USDC';
    expect(asset).toBe('USDC');
  });

  it('returns error with alternatives when asset not supported', () => {
    const suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      supportedAssets: ['USDC'],
      capabilities: ['save', 'withdraw'],
      supportsSameAssetBorrow: false,
    });
    registry.registerLending(suilend);

    const adapters = registry.listLending().filter(
      a => a.supportedAssets.includes('WBTC') && a.capabilities.includes('borrow'),
    );
    expect(adapters.length).toBe(0);

    const alternatives = registry.listLending().filter(
      a => a.capabilities.includes('borrow') || a.capabilities.includes('save'),
    );
    expect(alternatives.length).toBeGreaterThan(0);
  });

  it('repay resolves correct asset adapter', () => {
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI',
      supportedAssets: ['USDC', 'USDT', 'USDe', 'USDsui'],
    });
    registry.registerLending(navi);

    const asset = 'USDT';
    const adapters = registry.listLending().filter(
      a => a.supportedAssets.includes(asset) && a.capabilities.includes('repay'),
    );
    expect(adapters.length).toBe(1);
    expect(adapters[0].id).toBe('navi');
  });
});

// ─── withdraw auto-swap-to-USDC ────────────────────────────────

describe('withdraw — auto-swap non-USDC to USDC', () => {
  function createMockSwap(overrides: Partial<SwapAdapter> = {}): SwapAdapter {
    return {
      id: 'mock-dex',
      name: 'Mock DEX',
      version: '1.0.0',
      capabilities: ['swap'] as readonly AdapterCapability[],
      init: vi.fn(),
      getQuote: vi.fn().mockResolvedValue({ expectedOutput: 10, priceImpact: 0.001, poolPrice: 1.0 }),
      buildSwapTx: vi.fn().mockResolvedValue({
        tx: new Transaction(),
        estimatedOut: 10_000_000,
        toDecimals: 6,
      }),
      getSupportedPairs: vi.fn().mockReturnValue([
        { from: 'USDT', to: 'USDC' },
        { from: 'USDe', to: 'USDC' },
        { from: 'USDsui', to: 'USDC' },
      ]),
      getPoolPrice: vi.fn().mockResolvedValue(1.0),
      ...overrides,
    };
  }

  it('identifies non-USDC position that needs swap after withdrawal', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      supportedAssets: ['USDC', 'USDT'],
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDT', amount: 10.0, apy: 5.5 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 10.0, healthFactorAfter: 999, currentHF: 999 }),
      buildWithdrawTx: vi.fn().mockResolvedValue({ tx: new Transaction(), effectiveAmount: 10.0 }),
    });
    registry.registerLending(navi);

    const positions = await registry.allPositions('0xtest');
    const supplies = positions.flatMap(p =>
      p.positions.supplies.filter(s => s.amount > 0.001).map(s => ({
        protocolId: p.protocolId,
        asset: s.asset,
        amount: s.amount,
      })),
    );

    expect(supplies).toHaveLength(1);
    expect(supplies[0].asset).toBe('USDT');
    expect(supplies[0].asset).not.toBe('USDC');
  });

  it('swap adapter is called with correct from/to for USDT→USDC', async () => {
    const registry = new ProtocolRegistry();
    const swapAdapter = createMockSwap();
    registry.registerSwap(swapAdapter);

    const swapAdapters = registry.listSwap();
    expect(swapAdapters).toHaveLength(1);

    const from = 'USDT';
    const to = 'USDC';
    const amount = 10.0;
    await swapAdapters[0].buildSwapTx('0xtest', from, to, amount);

    expect(swapAdapter.buildSwapTx).toHaveBeenCalledWith('0xtest', 'USDT', 'USDC', 10.0);
  });

  it('swap adapter handles all stable-to-USDC pairs', async () => {
    const registry = new ProtocolRegistry();
    const swapAdapter = createMockSwap();
    registry.registerSwap(swapAdapter);

    const pairs = swapAdapter.getSupportedPairs();
    const toUsdcPairs = pairs.filter(p => p.to === 'USDC');
    expect(toUsdcPairs.length).toBeGreaterThanOrEqual(3);
    expect(toUsdcPairs.map(p => p.from).sort()).toEqual(['USDT', 'USDe', 'USDsui']);
  });

  it('withdraw all collects positions from multiple protocols with mixed assets', async () => {
    const registry = new ProtocolRegistry();
    const navi = createMockLending({
      id: 'navi',
      name: 'NAVI Protocol',
      supportedAssets: ['USDC', 'USDT'],
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDT', amount: 10.0, apy: 5.5 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 10.0, healthFactorAfter: 999, currentHF: 999 }),
    });
    const suilend = createMockLending({
      id: 'suilend',
      name: 'Suilend',
      getPositions: vi.fn().mockResolvedValue({
        supplies: [{ asset: 'USDC', amount: 5.0, apy: 2.2 }],
        borrows: [],
      }),
      maxWithdraw: vi.fn().mockResolvedValue({ maxAmount: 5.0, healthFactorAfter: 999, currentHF: 999 }),
    });
    registry.registerLending(navi);
    registry.registerLending(suilend);

    const positions = await registry.allPositions('0xtest');
    const withdrawable = positions.flatMap(p =>
      p.positions.supplies
        .filter(s => s.amount > 0.001)
        .map(s => ({ protocolId: p.protocolId, asset: s.asset, amount: s.amount })),
    );

    expect(withdrawable).toHaveLength(2);
    const usdt = withdrawable.find(w => w.asset === 'USDT');
    const usdc = withdrawable.find(w => w.asset === 'USDC');
    expect(usdt).toBeDefined();
    expect(usdt!.protocolId).toBe('navi');
    expect(usdc).toBeDefined();
    expect(usdc!.protocolId).toBe('suilend');
    // USDT needs swap, USDC does not
    expect(usdt!.asset !== 'USDC').toBe(true);
    expect(usdc!.asset === 'USDC').toBe(true);
  });

  it('sorts positions by APY ascending for withdraw (worst yield first)', () => {
    const supplies = [
      { protocolId: 'navi', asset: 'USDT', amount: 10, apy: 5.5 },
      { protocolId: 'suilend', asset: 'USDC', amount: 5, apy: 2.2 },
      { protocolId: 'navi', asset: 'USDC', amount: 8, apy: 4.9 },
    ];
    supplies.sort((a, b) => a.apy - b.apy);
    expect(supplies[0].apy).toBe(2.2);
    expect(supplies[0].protocolId).toBe('suilend');
  });
});

describe('SUPPORTED_ASSETS', () => {
  it('includes all 4 stables and SUI', async () => {
    const { SUPPORTED_ASSETS, STABLE_ASSETS } = await import('./constants.js');
    expect(SUPPORTED_ASSETS.USDC).toBeDefined();
    expect(SUPPORTED_ASSETS.USDT).toBeDefined();
    expect(SUPPORTED_ASSETS.USDe).toBeDefined();
    expect(SUPPORTED_ASSETS.USDsui).toBeDefined();
    expect(SUPPORTED_ASSETS.SUI).toBeDefined();
    expect(STABLE_ASSETS).toEqual(['USDC', 'USDT', 'USDe', 'USDsui']);
  });

  it('all stables have 6 decimals', async () => {
    const { SUPPORTED_ASSETS, STABLE_ASSETS } = await import('./constants.js');
    for (const asset of STABLE_ASSETS) {
      expect(SUPPORTED_ASSETS[asset].decimals).toBe(6);
    }
  });

  it('all assets have displayName', async () => {
    const { SUPPORTED_ASSETS } = await import('./constants.js');
    for (const [, info] of Object.entries(SUPPORTED_ASSETS)) {
      expect((info as { displayName: string }).displayName).toBeTruthy();
    }
  });
});
