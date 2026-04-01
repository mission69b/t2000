/**
 * Adapter Contract Compliance Test Suite
 *
 * Validates that any LendingAdapter implementation
 * correctly conforms to the interface contract.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { LendingAdapter } from './types.js';

vi.mock('../protocols/navi.js', () => ({}));

const { NaviAdapter } = await import('./navi.js');

export function runLendingComplianceTests(
  name: string,
  createAdapter: () => LendingAdapter,
  options: { isStub?: boolean } = {},
) {
  describe(`LendingAdapter compliance: ${name}`, () => {
    let adapter: LendingAdapter;

    it('has a non-empty string id', () => {
      adapter = createAdapter();
      expect(typeof adapter.id).toBe('string');
      expect(adapter.id.length).toBeGreaterThan(0);
    });

    it('id is lowercase kebab-case', () => {
      adapter = createAdapter();
      expect(adapter.id).toMatch(/^[a-z][a-z0-9-]*$/);
    });

    it('has a version string', () => {
      adapter = createAdapter();
      expect(typeof adapter.version).toBe('string');
      expect(adapter.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('has non-empty capabilities array', () => {
      adapter = createAdapter();
      expect(Array.isArray(adapter.capabilities)).toBe(true);
      expect(adapter.capabilities.length).toBeGreaterThan(0);
    });

    it('has non-empty supportedAssets', () => {
      adapter = createAdapter();
      expect(Array.isArray(adapter.supportedAssets)).toBe(true);
      expect(adapter.supportedAssets.length).toBeGreaterThan(0);
    });

    it('has all required interface methods', () => {
      adapter = createAdapter();
      const methods = [
        'getRates', 'getPositions', 'getHealth',
        'buildSaveTx', 'buildWithdrawTx', 'buildBorrowTx', 'buildRepayTx',
        'maxWithdraw', 'maxBorrow',
      ];
      for (const method of methods) {
        expect(typeof (adapter as unknown as Record<string, unknown>)[method]).toBe('function');
      }
    });

    if (!options.isStub) {
      it('init does not throw', async () => {
        adapter = createAdapter();
        const mockClient = {} as SuiJsonRpcClient;
        await expect(adapter.init(mockClient)).resolves.not.toThrow();
      });
    }
  });
}

runLendingComplianceTests('NaviAdapter', () => new NaviAdapter());

// --- Protocol Descriptor Compliance ---

import { descriptor as naviDesc } from './navi.js';
import { allDescriptors } from './index.js';
import type { ProtocolDescriptor } from './types.js';

const VALID_ACTIONS = ['save', 'withdraw', 'borrow', 'repay'];

function runDescriptorComplianceTests(desc: ProtocolDescriptor) {
  describe(`ProtocolDescriptor: ${desc.id}`, () => {
    it('has a non-empty id', () => {
      expect(desc.id).toBeTruthy();
      expect(desc.id).toMatch(/^[a-z][a-z0-9-]*$/);
    });

    it('has a non-empty name', () => {
      expect(desc.name).toBeTruthy();
      expect(desc.name.length).toBeGreaterThan(0);
    });

    it('has packages array (can be empty for dynamic)', () => {
      expect(Array.isArray(desc.packages)).toBe(true);
      if (!desc.dynamicPackageId) {
        expect(desc.packages.length).toBeGreaterThan(0);
      }
      for (const pkg of desc.packages) {
        expect(pkg).toMatch(/^0x[a-f0-9]+$/);
      }
    });

    it('has a non-empty actionMap', () => {
      expect(Object.keys(desc.actionMap).length).toBeGreaterThan(0);
    });

    it('actionMap values are valid action types', () => {
      for (const [pattern, action] of Object.entries(desc.actionMap)) {
        expect(VALID_ACTIONS).toContain(action);
        expect(pattern).toContain('::');
      }
    });

    it('is included in allDescriptors', () => {
      expect(allDescriptors.some(d => d.id === desc.id)).toBe(true);
    });
  });
}

runDescriptorComplianceTests(naviDesc);
