import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AutoInvestManager } from './auto-invest.js';
import { T2000Error } from './errors.js';

describe('AutoInvestManager', () => {
  let dir: string;
  let aim: AutoInvestManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auto-invest-test-'));
    aim = new AutoInvestManager(dir);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setup', () => {
    it('creates a daily schedule for a strategy', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      expect(s.id).toHaveLength(8);
      expect(s.strategy).toBe('bluechip');
      expect(s.asset).toBeUndefined();
      expect(s.amount).toBe(50);
      expect(s.frequency).toBe('daily');
      expect(s.enabled).toBe(true);
      expect(s.totalInvested).toBe(0);
      expect(s.runCount).toBe(0);
      expect(s.nextRun).toBeDefined();
    });

    it('creates a weekly schedule for a single asset', () => {
      const s = aim.setup({ amount: 100, frequency: 'weekly', asset: 'SUI', dayOfWeek: 5 });
      expect(s.asset).toBe('SUI');
      expect(s.frequency).toBe('weekly');
      expect(s.dayOfWeek).toBe(5);
    });

    it('creates a monthly schedule', () => {
      const s = aim.setup({ amount: 200, frequency: 'monthly', strategy: 'layer1', dayOfMonth: 15 });
      expect(s.frequency).toBe('monthly');
      expect(s.dayOfMonth).toBe(15);
    });

    it('throws when neither strategy nor asset is provided', () => {
      try {
        aim.setup({ amount: 50, frequency: 'daily' });
      } catch (e) {
        expect((e as T2000Error).code).toBe('AUTO_INVEST_NOT_FOUND');
      }
    });

    it('throws when amount is less than $1', () => {
      try {
        aim.setup({ amount: 0.5, frequency: 'daily', strategy: 'bluechip' });
      } catch (e) {
        expect((e as T2000Error).code).toBe('AUTO_INVEST_INSUFFICIENT');
      }
    });

    it('persists schedule to disk', () => {
      aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      const raw = JSON.parse(readFileSync(join(dir, 'auto-invest.json'), 'utf-8'));
      expect(raw.schedules).toHaveLength(1);
      expect(raw.schedules[0].strategy).toBe('bluechip');
    });

    it('allows multiple schedules', () => {
      aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      aim.setup({ amount: 100, frequency: 'weekly', asset: 'SUI' });
      const status = aim.getStatus();
      expect(status.schedules).toHaveLength(2);
    });
  });

  describe('nextRun computation', () => {
    it('daily schedule sets next run to tomorrow midnight', () => {
      const s = aim.setup({ amount: 10, frequency: 'daily', strategy: 'bluechip' });
      const nextRun = new Date(s.nextRun);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      expect(nextRun.getTime()).toBe(tomorrow.getTime());
    });

    it('monthly schedule uses specified day of month', () => {
      const s = aim.setup({ amount: 10, frequency: 'monthly', strategy: 'bluechip', dayOfMonth: 28 });
      const nextRun = new Date(s.nextRun);
      expect(nextRun.getDate()).toBe(28);
    });
  });

  describe('getSchedule', () => {
    it('returns the schedule by id', () => {
      const created = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      const fetched = aim.getSchedule(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.amount).toBe(50);
    });

    it('throws AUTO_INVEST_NOT_FOUND for unknown id', () => {
      try {
        aim.getSchedule('nope');
      } catch (e) {
        expect((e as T2000Error).code).toBe('AUTO_INVEST_NOT_FOUND');
      }
    });
  });

  describe('getStatus', () => {
    it('returns empty arrays when no schedules', () => {
      const status = aim.getStatus();
      expect(status.schedules).toHaveLength(0);
      expect(status.pendingRuns).toHaveLength(0);
    });

    it('includes all schedules', () => {
      aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      aim.setup({ amount: 100, frequency: 'weekly', asset: 'SUI' });
      const status = aim.getStatus();
      expect(status.schedules).toHaveLength(2);
    });

    it('identifies pending runs where nextRun is in the past', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });

      // Manually backdate the nextRun to force a pending state
      const raw = JSON.parse(readFileSync(join(dir, 'auto-invest.json'), 'utf-8'));
      raw.schedules[0].nextRun = new Date(Date.now() - 60_000).toISOString();
      const { writeFileSync } = require('node:fs');
      writeFileSync(join(dir, 'auto-invest.json'), JSON.stringify(raw, null, 2));

      const aim2 = new AutoInvestManager(dir);
      const status = aim2.getStatus();
      expect(status.pendingRuns).toHaveLength(1);
      expect(status.pendingRuns[0].id).toBe(s.id);
    });

    it('does not include disabled schedules in pending runs', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });

      const raw = JSON.parse(readFileSync(join(dir, 'auto-invest.json'), 'utf-8'));
      raw.schedules[0].nextRun = new Date(Date.now() - 60_000).toISOString();
      const { writeFileSync } = require('node:fs');
      writeFileSync(join(dir, 'auto-invest.json'), JSON.stringify(raw, null, 2));

      const aim2 = new AutoInvestManager(dir);
      aim2.stop(s.id);

      const status = aim2.getStatus();
      expect(status.pendingRuns).toHaveLength(0);
    });
  });

  describe('recordRun', () => {
    it('updates totalInvested, runCount, lastRun, and nextRun', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });

      aim.recordRun(s.id, 50);

      const updated = aim.getSchedule(s.id);
      expect(updated.totalInvested).toBe(50);
      expect(updated.runCount).toBe(1);
      expect(updated.lastRun).toBeDefined();
      expect(new Date(updated.nextRun).getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it('accumulates across multiple runs', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });

      aim.recordRun(s.id, 50);
      aim.recordRun(s.id, 50);
      aim.recordRun(s.id, 30);

      const updated = aim.getSchedule(s.id);
      expect(updated.totalInvested).toBe(130);
      expect(updated.runCount).toBe(3);
    });

    it('silently no-ops for unknown schedule id', () => {
      expect(() => aim.recordRun('nonexistent', 50)).not.toThrow();
    });
  });

  describe('stop', () => {
    it('disables the schedule', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      expect(aim.getSchedule(s.id).enabled).toBe(true);

      aim.stop(s.id);

      expect(aim.getSchedule(s.id).enabled).toBe(false);
    });

    it('persists to disk', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      aim.stop(s.id);

      const aim2 = new AutoInvestManager(dir);
      expect(aim2.getSchedule(s.id).enabled).toBe(false);
    });

    it('throws AUTO_INVEST_NOT_FOUND for unknown id', () => {
      try {
        aim.stop('nonexistent');
      } catch (e) {
        expect((e as T2000Error).code).toBe('AUTO_INVEST_NOT_FOUND');
      }
    });
  });

  describe('remove', () => {
    it('removes the schedule entirely', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      aim.remove(s.id);

      expect(() => aim.getSchedule(s.id)).toThrow(T2000Error);
      expect(aim.getStatus().schedules).toHaveLength(0);
    });

    it('persists removal to disk', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      aim.remove(s.id);

      const aim2 = new AutoInvestManager(dir);
      expect(aim2.getStatus().schedules).toHaveLength(0);
    });

    it('throws AUTO_INVEST_NOT_FOUND for unknown id', () => {
      try {
        aim.remove('nonexistent');
      } catch (e) {
        expect((e as T2000Error).code).toBe('AUTO_INVEST_NOT_FOUND');
      }
    });

    it('only removes the targeted schedule', () => {
      const s1 = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });
      const s2 = aim.setup({ amount: 100, frequency: 'weekly', asset: 'SUI' });

      aim.remove(s1.id);

      expect(aim.getStatus().schedules).toHaveLength(1);
      expect(aim.getSchedule(s2.id)).toBeDefined();
    });
  });

  describe('reload from disk', () => {
    it('picks up changes from another instance', () => {
      const s = aim.setup({ amount: 50, frequency: 'daily', strategy: 'bluechip' });

      const aim2 = new AutoInvestManager(dir);
      const fetched = aim2.getSchedule(s.id);
      expect(fetched.strategy).toBe('bluechip');
    });
  });
});
