import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SafeguardEnforcer } from './enforcer.js';
import { SafeguardError } from './errors.js';

describe('SafeguardEnforcer', () => {
  let dir: string;
  let enforcer: SafeguardEnforcer;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't2000-test-'));
    enforcer = new SafeguardEnforcer(dir);
    enforcer.load();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('defaults', () => {
    it('starts unlocked with no limits', () => {
      const config = enforcer.getConfig();
      expect(config.locked).toBe(false);
      expect(config.maxPerTx).toBe(0);
      expect(config.maxDailySend).toBe(0);
      expect(config.dailyUsed).toBe(0);
    });

    it('allows all operations when no limits set', () => {
      expect(() => enforcer.check({ operation: 'send', amount: 1_000_000 })).not.toThrow();
    });
  });

  describe('lock/unlock', () => {
    it('throws SafeguardError when locked', () => {
      enforcer.lock();
      expect(() => enforcer.assertNotLocked()).toThrow(SafeguardError);
      expect(() => enforcer.check({ operation: 'send', amount: 1 })).toThrow(SafeguardError);
    });

    it('resumes after unlock', () => {
      enforcer.lock();
      enforcer.unlock();
      expect(() => enforcer.check({ operation: 'send', amount: 1 })).not.toThrow();
    });

    it('blocks internal ops when locked', () => {
      enforcer.lock();
      expect(() => enforcer.check({ operation: 'save', amount: 100 })).toThrow(SafeguardError);
    });

    it('persists lock state to disk', () => {
      enforcer.lock();
      const reloaded = new SafeguardEnforcer(dir);
      reloaded.load();
      expect(reloaded.getConfig().locked).toBe(true);
    });
  });

  describe('maxPerTx', () => {
    it('blocks send exceeding per-tx limit', () => {
      enforcer.set('maxPerTx', 500);
      expect(() => enforcer.check({ operation: 'send', amount: 501 })).toThrow(SafeguardError);
    });

    it('allows send within per-tx limit', () => {
      enforcer.set('maxPerTx', 500);
      expect(() => enforcer.check({ operation: 'send', amount: 500 })).not.toThrow();
    });

    it('does not apply to internal ops', () => {
      enforcer.set('maxPerTx', 100);
      expect(() => enforcer.check({ operation: 'save', amount: 5000 })).not.toThrow();
      expect(() => enforcer.check({ operation: 'withdraw', amount: 5000 })).not.toThrow();
      expect(() => enforcer.check({ operation: 'borrow', amount: 5000 })).not.toThrow();
      expect(() => enforcer.check({ operation: 'repay', amount: 5000 })).not.toThrow();
    });

    it('applies to pay ops', () => {
      enforcer.set('maxPerTx', 50);
      expect(() => enforcer.check({ operation: 'pay', amount: 51 })).toThrow(SafeguardError);
    });

    it('error contains correct details', () => {
      enforcer.set('maxPerTx', 500);
      try {
        enforcer.check({ operation: 'send', amount: 1000 });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(SafeguardError);
        const err = e as SafeguardError;
        expect(err.rule).toBe('maxPerTx');
        expect(err.details.attempted).toBe(1000);
        expect(err.details.limit).toBe(500);
      }
    });
  });

  describe('maxDailySend', () => {
    it('blocks send exceeding daily limit', () => {
      enforcer.set('maxDailySend', 1000);
      enforcer.recordUsage(800);
      expect(() => enforcer.check({ operation: 'send', amount: 201 })).toThrow(SafeguardError);
    });

    it('allows send within daily limit', () => {
      enforcer.set('maxDailySend', 1000);
      enforcer.recordUsage(500);
      expect(() => enforcer.check({ operation: 'send', amount: 500 })).not.toThrow();
    });

    it('accumulates usage across multiple sends', () => {
      enforcer.set('maxDailySend', 1000);
      enforcer.recordUsage(200);
      enforcer.recordUsage(200);
      enforcer.recordUsage(200);
      enforcer.recordUsage(200);
      expect(() => enforcer.check({ operation: 'send', amount: 201 })).toThrow(SafeguardError);
      expect(() => enforcer.check({ operation: 'send', amount: 200 })).not.toThrow();
    });

    it('does not apply to internal ops', () => {
      enforcer.set('maxDailySend', 100);
      enforcer.recordUsage(100);
      expect(() => enforcer.check({ operation: 'save', amount: 5000 })).not.toThrow();
    });

    it('error contains correct details', () => {
      enforcer.set('maxDailySend', 1000);
      enforcer.recordUsage(900);
      try {
        enforcer.check({ operation: 'send', amount: 200 });
        expect.unreachable();
      } catch (e) {
        const err = e as SafeguardError;
        expect(err.rule).toBe('maxDailySend');
        expect(err.details.current).toBe(900);
        expect(err.details.limit).toBe(1000);
        expect(err.details.attempted).toBe(200);
      }
    });
  });

  describe('daily reset', () => {
    it('resets usage on a new day', () => {
      enforcer.set('maxDailySend', 1000);
      enforcer.recordUsage(900);

      const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf-8'));
      config.dailyResetDate = '2020-01-01';
      writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2));

      const fresh = new SafeguardEnforcer(dir);
      fresh.load();
      expect(() => fresh.check({ operation: 'send', amount: 900 })).not.toThrow();
    });
  });

  describe('combined limits', () => {
    it('checks maxPerTx before maxDailySend', () => {
      enforcer.set('maxPerTx', 100);
      enforcer.set('maxDailySend', 1000);
      try {
        enforcer.check({ operation: 'send', amount: 200 });
        expect.unreachable();
      } catch (e) {
        expect((e as SafeguardError).rule).toBe('maxPerTx');
      }
    });
  });

  describe('persistence', () => {
    it('persists config changes to disk', () => {
      enforcer.set('maxPerTx', 250);
      enforcer.set('maxDailySend', 500);

      const reloaded = new SafeguardEnforcer(dir);
      reloaded.load();
      expect(reloaded.getConfig().maxPerTx).toBe(250);
      expect(reloaded.getConfig().maxDailySend).toBe(500);
    });

    it('persists usage to disk', () => {
      enforcer.set('maxDailySend', 1000);
      enforcer.recordUsage(300);

      const reloaded = new SafeguardEnforcer(dir);
      reloaded.load();
      expect(reloaded.getConfig().dailyUsed).toBe(300);
    });

    it('preserves non-safeguard keys in config', () => {
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ rpcUrl: 'https://custom.rpc', network: 'mainnet' }, null, 2));

      enforcer.load();
      enforcer.set('maxPerTx', 500);

      const raw = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf-8'));
      expect(raw.rpcUrl).toBe('https://custom.rpc');
      expect(raw.network).toBe('mainnet');
      expect(raw.maxPerTx).toBe(500);
    });
  });

  describe('in-memory mode (no configDir)', () => {
    it('works without a config directory', () => {
      const memEnforcer = new SafeguardEnforcer();
      memEnforcer.load();
      expect(() => memEnforcer.check({ operation: 'send', amount: 1_000_000 })).not.toThrow();
    });

    it('set/get works in memory', () => {
      const memEnforcer = new SafeguardEnforcer();
      memEnforcer.load();
      memEnforcer.set('maxPerTx', 100);
      expect(memEnforcer.getConfig().maxPerTx).toBe(100);
      expect(() => memEnforcer.check({ operation: 'send', amount: 101 })).toThrow(SafeguardError);
    });
  });

  describe('isConfigured', () => {
    it('returns false with defaults', () => {
      expect(enforcer.isConfigured()).toBe(false);
    });

    it('returns true when maxPerTx is set', () => {
      enforcer.set('maxPerTx', 500);
      expect(enforcer.isConfigured()).toBe(true);
    });

    it('returns true when maxDailySend is set', () => {
      enforcer.set('maxDailySend', 1000);
      expect(enforcer.isConfigured()).toBe(true);
    });
  });
});
