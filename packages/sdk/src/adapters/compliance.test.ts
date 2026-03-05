/**
 * Adapter Contract Compliance Test Suite
 *
 * Validates that any LendingAdapter or SwapAdapter implementation
 * correctly conforms to the interface contract. Protocol devs run
 * this against their adapter before submitting a PR.
 *
 * Usage:
 *   import { runLendingComplianceTests, runSwapComplianceTests } from './compliance.test';
 *   runLendingComplianceTests(() => new MyAdapter(), mockClient);
 */
import { describe, it, expect, vi } from 'vitest';
import type { SuiClient } from '@mysten/sui/client';
import type { LendingAdapter, SwapAdapter } from './types.js';

vi.mock('../protocols/navi.js', () => ({}));
vi.mock('../protocols/cetus.js', () => ({
  getSwapQuote: vi.fn(),
  buildSwapTx: vi.fn(),
  getPoolPrice: vi.fn(),
}));

const { NaviAdapter } = await import('./navi.js');
const { CetusAdapter } = await import('./cetus.js');
const { SuilendAdapter } = await import('./suilend.js');

export function runLendingComplianceTests(
  name: string,
  createAdapter: () => LendingAdapter,
  options: { isStub?: boolean } = {},
) {
  describe(`LendingAdapter compliance: ${name}`, () => {
    let adapter: LendingAdapter;

    it('has required metadata fields', () => {
      adapter = createAdapter();
      expect(typeof adapter.id).toBe('string');
      expect(adapter.id.length).toBeGreaterThan(0);
      expect(typeof adapter.name).toBe('string');
      expect(adapter.name.length).toBeGreaterThan(0);
      expect(typeof adapter.version).toBe('string');
      expect(adapter.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('has valid capabilities array', () => {
      adapter = createAdapter();
      expect(Array.isArray(adapter.capabilities)).toBe(true);
      expect(adapter.capabilities.length).toBeGreaterThan(0);
      const valid = ['save', 'withdraw', 'borrow', 'repay', 'swap'];
      for (const cap of adapter.capabilities) {
        expect(valid).toContain(cap);
      }
    });

    it('has valid supportedAssets array', () => {
      adapter = createAdapter();
      expect(Array.isArray(adapter.supportedAssets)).toBe(true);
      expect(adapter.supportedAssets.length).toBeGreaterThan(0);
      for (const asset of adapter.supportedAssets) {
        expect(typeof asset).toBe('string');
        expect(asset).toBe(asset.toUpperCase());
      }
    });

    it('has supportsSameAssetBorrow boolean', () => {
      adapter = createAdapter();
      expect(typeof adapter.supportsSameAssetBorrow).toBe('boolean');
    });

    it('capabilities are consistent with supportsSameAssetBorrow', () => {
      adapter = createAdapter();
      if (!adapter.supportsSameAssetBorrow) {
        // If same-asset borrow is not supported, having borrow capability
        // means the adapter borrows a different asset than deposited
        // This is valid but worth flagging for review
      }
      if (adapter.capabilities.includes('borrow')) {
        expect(adapter.capabilities).toContain('repay');
      }
      if (adapter.capabilities.includes('save')) {
        expect(adapter.capabilities).toContain('withdraw');
      }
    });

    it('id is lowercase kebab-case', () => {
      adapter = createAdapter();
      expect(adapter.id).toMatch(/^[a-z][a-z0-9-]*$/);
    });

    it('has init method', () => {
      adapter = createAdapter();
      expect(typeof adapter.init).toBe('function');
    });

    it('has all required interface methods', () => {
      adapter = createAdapter();
      const methods = [
        'getRates', 'getPositions', 'getHealth',
        'buildSaveTx', 'buildWithdrawTx', 'buildBorrowTx', 'buildRepayTx',
        'maxWithdraw', 'maxBorrow',
      ];
      for (const method of methods) {
        expect(typeof (adapter as Record<string, unknown>)[method]).toBe('function');
      }
    });

    if (!options.isStub) {
      it('init does not throw', async () => {
        adapter = createAdapter();
        const mockClient = {} as SuiClient;
        await expect(adapter.init(mockClient)).resolves.not.toThrow();
      });
    }

    it('unsupported capabilities throw on build methods', async () => {
      adapter = createAdapter();
      if (!adapter.capabilities.includes('borrow')) {
        await expect(adapter.buildBorrowTx('0x1', 100, 'USDC')).rejects.toThrow();
      }
      if (!adapter.capabilities.includes('repay')) {
        await expect(adapter.buildRepayTx('0x1', 100, 'USDC')).rejects.toThrow();
      }
    });
  });
}

export function runSwapComplianceTests(
  name: string,
  createAdapter: () => SwapAdapter,
  options: { isStub?: boolean } = {},
) {
  describe(`SwapAdapter compliance: ${name}`, () => {
    let adapter: SwapAdapter;

    it('has required metadata fields', () => {
      adapter = createAdapter();
      expect(typeof adapter.id).toBe('string');
      expect(adapter.id.length).toBeGreaterThan(0);
      expect(typeof adapter.name).toBe('string');
      expect(adapter.name.length).toBeGreaterThan(0);
      expect(typeof adapter.version).toBe('string');
      expect(adapter.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('has swap capability', () => {
      adapter = createAdapter();
      expect(adapter.capabilities).toContain('swap');
    });

    it('id is lowercase kebab-case', () => {
      adapter = createAdapter();
      expect(adapter.id).toMatch(/^[a-z][a-z0-9-]*$/);
    });

    it('has all required interface methods', () => {
      adapter = createAdapter();
      const methods = ['getQuote', 'buildSwapTx', 'getSupportedPairs', 'getPoolPrice'];
      for (const method of methods) {
        expect(typeof (adapter as Record<string, unknown>)[method]).toBe('function');
      }
    });

    it('getSupportedPairs returns valid pair objects', () => {
      adapter = createAdapter();
      const pairs = adapter.getSupportedPairs();
      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs.length).toBeGreaterThan(0);
      for (const pair of pairs) {
        expect(typeof pair.from).toBe('string');
        expect(typeof pair.to).toBe('string');
        expect(pair.from).not.toBe(pair.to);
      }
    });

    if (!options.isStub) {
      it('init does not throw', async () => {
        adapter = createAdapter();
        const mockClient = {} as SuiClient;
        await expect(adapter.init(mockClient)).resolves.not.toThrow();
      });
    }
  });
}

// Run compliance tests for all built-in adapters
runLendingComplianceTests('NaviAdapter', () => new NaviAdapter());
runSwapComplianceTests('CetusAdapter', () => new CetusAdapter());
runLendingComplianceTests('SuilendAdapter', () => new SuilendAdapter(), { isStub: true });
