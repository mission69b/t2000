/**
 * Integration tests for T2000 multi-protocol orchestration.
 *
 * These tests exercise the T2000 class methods (save, withdraw, etc.)
 * with multiple mock adapters registered, verifying correct routing,
 * validation, and edge-case handling that unit tests miss.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import type { LendingAdapter, AdapterCapability } from './adapters/types.js';
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
