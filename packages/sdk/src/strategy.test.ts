import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StrategyManager } from './strategy.js';
import { T2000Error } from './errors.js';

describe('StrategyManager', () => {
  let dir: string;
  let sm: StrategyManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'strategy-test-'));
    sm = new StrategyManager(dir);
  });

  describe('seed defaults', () => {
    it('seeds three built-in strategies on first load', () => {
      const all = sm.getAll();
      expect(Object.keys(all)).toContain('bluechip');
      expect(Object.keys(all)).toContain('layer1');
      expect(Object.keys(all)).toContain('sui-heavy');
    });

    it('persists defaults to disk', () => {
      const raw = JSON.parse(readFileSync(join(dir, 'strategies.json'), 'utf-8'));
      expect(raw.strategies.bluechip).toBeDefined();
      expect(raw.strategies.bluechip.custom).toBe(false);
    });

    it('does not overwrite existing strategies on reload', () => {
      sm.create({ name: 'custom', allocations: { SUI: 60, BTC: 40 } });
      const sm2 = new StrategyManager(dir);
      const all = sm2.getAll();
      expect(all['custom']).toBeDefined();
      expect(all['bluechip']).toBeDefined();
    });
  });

  describe('getAll', () => {
    it('returns a shallow copy', () => {
      const a = sm.getAll();
      const b = sm.getAll();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('get', () => {
    it('returns a built-in strategy', () => {
      const s = sm.get('bluechip');
      expect(s.name).toBe('Bluechip / Large-Cap');
      expect(s.custom).toBe(false);
      expect(s.allocations).toHaveProperty('BTC');
    });

    it('throws STRATEGY_NOT_FOUND for unknown name', () => {
      expect(() => sm.get('nonexistent')).toThrow(T2000Error);
      try {
        sm.get('nonexistent');
      } catch (e) {
        expect((e as T2000Error).code).toBe('STRATEGY_NOT_FOUND');
      }
    });
  });

  describe('create', () => {
    it('creates a custom strategy', () => {
      const s = sm.create({ name: 'My Plan', allocations: { SUI: 70, ETH: 30 } });
      expect(s.name).toBe('My Plan');
      expect(s.custom).toBe(true);
      expect(s.allocations).toEqual({ SUI: 70, ETH: 30 });
    });

    it('normalizes name to lowercase key with dashes', () => {
      sm.create({ name: 'My Cool Plan', allocations: { BTC: 50, SUI: 50 } });
      const s = sm.get('my-cool-plan');
      expect(s.name).toBe('My Cool Plan');
    });

    it('sets default description when not provided', () => {
      const s = sm.create({ name: 'test', allocations: { SUI: 100 } });
      expect(s.description).toBe('Custom strategy: test');
    });

    it('uses provided description', () => {
      const s = sm.create({ name: 'test', allocations: { SUI: 100 }, description: 'All in SUI' });
      expect(s.description).toBe('All in SUI');
    });

    it('persists to disk', () => {
      sm.create({ name: 'test', allocations: { SUI: 100 } });
      const sm2 = new StrategyManager(dir);
      expect(sm2.get('test')).toBeDefined();
    });

    it('throws when key already exists', () => {
      sm.create({ name: 'test', allocations: { SUI: 100 } });
      expect(() => sm.create({ name: 'test', allocations: { SUI: 100 } })).toThrow(T2000Error);
      try {
        sm.create({ name: 'test', allocations: { SUI: 100 } });
      } catch (e) {
        expect((e as T2000Error).code).toBe('STRATEGY_INVALID_ALLOCATIONS');
      }
    });

    it('throws for invalid allocations', () => {
      expect(() => sm.create({ name: 'bad', allocations: { SUI: 50 } })).toThrow(T2000Error);
    });
  });

  describe('delete', () => {
    it('deletes a custom strategy', () => {
      sm.create({ name: 'temp', allocations: { SUI: 100 } });
      expect(sm.get('temp')).toBeDefined();
      sm.delete('temp');
      expect(() => sm.get('temp')).toThrow(T2000Error);
    });

    it('throws STRATEGY_NOT_FOUND for unknown name', () => {
      try {
        sm.delete('nonexistent');
      } catch (e) {
        expect((e as T2000Error).code).toBe('STRATEGY_NOT_FOUND');
      }
    });

    it('throws STRATEGY_BUILTIN when deleting built-in', () => {
      try {
        sm.delete('bluechip');
      } catch (e) {
        expect((e as T2000Error).code).toBe('STRATEGY_BUILTIN');
      }
    });

    it('persists deletion to disk', () => {
      sm.create({ name: 'temp', allocations: { SUI: 100 } });
      sm.delete('temp');
      const sm2 = new StrategyManager(dir);
      expect(() => sm2.get('temp')).toThrow(T2000Error);
    });
  });

  describe('validateAllocations', () => {
    it('accepts allocations summing to 100', () => {
      expect(() => sm.validateAllocations({ BTC: 50, ETH: 30, SUI: 20 })).not.toThrow();
    });

    it('accepts single-asset 100%', () => {
      expect(() => sm.validateAllocations({ SUI: 100 })).not.toThrow();
    });

    it('rejects allocations not summing to 100', () => {
      try {
        sm.validateAllocations({ BTC: 50, ETH: 30 });
      } catch (e) {
        expect((e as T2000Error).code).toBe('STRATEGY_INVALID_ALLOCATIONS');
        expect((e as T2000Error).message).toContain('sum to 100');
      }
    });

    it('rejects allocations summing over 100', () => {
      expect(() => sm.validateAllocations({ BTC: 60, ETH: 50 })).toThrow(T2000Error);
    });

    it('rejects invalid asset names', () => {
      try {
        sm.validateAllocations({ DOGE: 100 });
      } catch (e) {
        expect((e as T2000Error).code).toBe('STRATEGY_INVALID_ALLOCATIONS');
        expect((e as T2000Error).message).toContain('not an investment asset');
      }
    });

    it('rejects zero allocation', () => {
      try {
        sm.validateAllocations({ BTC: 0, SUI: 100 });
      } catch (e) {
        expect((e as T2000Error).code).toBe('STRATEGY_INVALID_ALLOCATIONS');
        expect((e as T2000Error).message).toContain('must be > 0');
      }
    });

    it('rejects negative allocation', () => {
      expect(() => sm.validateAllocations({ BTC: -10, SUI: 110 })).toThrow(T2000Error);
    });

    it('allows floating point that sums to 100 within tolerance', () => {
      expect(() => sm.validateAllocations({ BTC: 33.33, ETH: 33.33, SUI: 33.34 })).not.toThrow();
    });
  });

  describe('validateMinAmount', () => {
    it('accepts amount above minimum', () => {
      expect(() => sm.validateMinAmount({ BTC: 50, ETH: 30, SUI: 20 }, 10)).not.toThrow();
    });

    it('rejects amount below minimum', () => {
      try {
        sm.validateMinAmount({ BTC: 50, ETH: 30, SUI: 20 }, 2);
      } catch (e) {
        expect((e as T2000Error).code).toBe('STRATEGY_MIN_AMOUNT');
        expect((e as T2000Error).message).toContain('Minimum $5');
      }
    });

    it('calculates min based on smallest allocation', () => {
      // 10% allocation → min $10 (ceil(100/10))
      expect(() => sm.validateMinAmount({ SUI: 90, BTC: 10 }, 9)).toThrow(T2000Error);
      expect(() => sm.validateMinAmount({ SUI: 90, BTC: 10 }, 10)).not.toThrow();
    });

    it('accepts single-asset strategy with $1', () => {
      expect(() => sm.validateMinAmount({ SUI: 100 }, 1)).not.toThrow();
    });
  });
});
