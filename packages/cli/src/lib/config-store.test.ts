import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import {
  readConfig,
  writeConfig,
  configExists,
  setLimits,
  clearLimits,
  hasLimits,
} from './config-store.js';

describe('config-store', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 't2000-test-'));
    configPath = join(tempDir, 'config.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readConfig', () => {
    it('returns empty config when no file exists', async () => {
      expect(await readConfig(configPath)).toEqual({});
    });

    it('returns empty config on invalid JSON', async () => {
      await writeFile(configPath, 'not json');
      expect(await readConfig(configPath)).toEqual({});
    });

    it('round-trips a limits-only config', async () => {
      await writeConfig({ limits: { perTxUsd: 100, dailySendUsd: 500 } }, configPath);
      expect(await readConfig(configPath)).toEqual({
        limits: { perTxUsd: 100, dailySendUsd: 500 },
      });
    });

    it('strips unknown top-level fields', async () => {
      await writeFile(
        configPath,
        JSON.stringify({ limits: { perTxUsd: 10 }, mysteryField: 'x', oldPin: 'y' }),
      );
      const cfg = await readConfig(configPath);
      expect(cfg).toEqual({ limits: { perTxUsd: 10 } });
    });

    it('strips negative or zero limit values', async () => {
      await writeFile(
        configPath,
        JSON.stringify({ limits: { perTxUsd: -5, dailySendUsd: 0 } }),
      );
      expect(await readConfig(configPath)).toEqual({});
    });
  });

  describe('writeConfig', () => {
    it('writes the config file with 0o600 perms', async () => {
      await writeConfig({ limits: { perTxUsd: 10 } }, configPath);
      const mode = (await stat(configPath)).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('configExists detects the written file', async () => {
      expect(await configExists(configPath)).toBe(false);
      await writeConfig({ limits: { perTxUsd: 10 } }, configPath);
      expect(await configExists(configPath)).toBe(true);
    });
  });

  describe('setLimits / clearLimits / hasLimits', () => {
    it('setLimits merges into existing config', () => {
      const cfg = setLimits({ limits: { perTxUsd: 10 } }, { dailySendUsd: 500 });
      expect(cfg.limits).toEqual({ perTxUsd: 10, dailySendUsd: 500 });
    });

    it('setLimits overrides existing values', () => {
      const cfg = setLimits({ limits: { perTxUsd: 10 } }, { perTxUsd: 99 });
      expect(cfg.limits?.perTxUsd).toBe(99);
    });

    it('clearLimits removes the limits block entirely', () => {
      const cfg = clearLimits({ limits: { perTxUsd: 10, dailySendUsd: 100 } });
      expect(cfg.limits).toBeUndefined();
    });

    it('hasLimits true when at least one limit set', () => {
      expect(hasLimits({ limits: { perTxUsd: 10 } })).toBe(true);
      expect(hasLimits({ limits: { dailySendUsd: 500 } })).toBe(true);
    });

    it('hasLimits false when limits absent or empty', () => {
      expect(hasLimits({})).toBe(false);
      expect(hasLimits({ limits: {} })).toBe(false);
    });
  });
});
