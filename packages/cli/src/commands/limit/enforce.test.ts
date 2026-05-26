// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// Tests for the spending-limit enforcement gate. Locks down the
// "block by default, --force overrides" semantics + the per-tx vs
// daily-send distinction.

import { describe, it, expect } from 'vitest';
import {
  assertLimitConfig,
  approxUsdValue,
  LimitExceededError,
} from './enforce.js';
import type { CliConfig } from '../../lib/config-store.js';

describe('assertLimitConfig', () => {
  it('is a no-op when no limits are set', () => {
    const config: CliConfig = {};
    expect(() => assertLimitConfig({ config, operation: 'send', amountUsd: 1000 })).not.toThrow();
  });

  it('is a no-op when amount is zero or negative', () => {
    const config: CliConfig = { limits: { perTxUsd: 10 } };
    expect(() => assertLimitConfig({ config, operation: 'send', amountUsd: 0 })).not.toThrow();
    expect(() => assertLimitConfig({ config, operation: 'send', amountUsd: -5 })).not.toThrow();
  });

  describe('perTxUsd', () => {
    const config: CliConfig = { limits: { perTxUsd: 50 } };

    it('allows a tx at the limit', () => {
      expect(() => assertLimitConfig({ config, operation: 'send', amountUsd: 50 })).not.toThrow();
    });

    it('blocks a tx over the limit', () => {
      expect(() =>
        assertLimitConfig({ config, operation: 'send', amountUsd: 100 }),
      ).toThrow(LimitExceededError);
    });

    it('error message mentions the limit + --force hint (send)', () => {
      try {
        assertLimitConfig({ config, operation: 'send', amountUsd: 100 });
      } catch (err) {
        expect((err as Error).message).toMatch(/Exceeds per-transaction limit \(\$50\)/);
        expect((err as Error).message).toMatch(/Use --force to override/);
        return;
      }
      throw new Error('expected throw');
    });

    it('applies to swap', () => {
      expect(() =>
        assertLimitConfig({ config, operation: 'swap', amountUsd: 100 }),
      ).toThrow(LimitExceededError);
    });

    it('applies to pay', () => {
      expect(() =>
        assertLimitConfig({ config, operation: 'pay', amountUsd: 100 }),
      ).toThrow(LimitExceededError);
    });
  });

  describe('dailySendUsd', () => {
    const config: CliConfig = { limits: { dailySendUsd: 50 } };

    it('SPEC verification gate — `t2 send 100 USDC` with daily=50 → blocks', () => {
      expect(() =>
        assertLimitConfig({ config, operation: 'send', amountUsd: 100 }),
      ).toThrow(/Exceeds daily limit \(\$50\)/);
    });

    it('does NOT apply to swap (daily is send-specific)', () => {
      expect(() =>
        assertLimitConfig({ config, operation: 'swap', amountUsd: 100 }),
      ).not.toThrow();
    });

    it('does NOT apply to pay', () => {
      expect(() =>
        assertLimitConfig({ config, operation: 'pay', amountUsd: 100 }),
      ).not.toThrow();
    });

    it('allows a tx at the limit', () => {
      expect(() =>
        assertLimitConfig({ config, operation: 'send', amountUsd: 50 }),
      ).not.toThrow();
    });
  });

  describe('--force', () => {
    it('bypasses perTxUsd', () => {
      const config: CliConfig = { limits: { perTxUsd: 10 } };
      expect(() =>
        assertLimitConfig({ config, operation: 'send', amountUsd: 1000, force: true }),
      ).not.toThrow();
    });

    it('bypasses dailySendUsd', () => {
      const config: CliConfig = { limits: { dailySendUsd: 10 } };
      expect(() =>
        assertLimitConfig({ config, operation: 'send', amountUsd: 1000, force: true }),
      ).not.toThrow();
    });
  });

  it('error envelope toJSON exposes structured fields', () => {
    const err = new LimitExceededError({
      operation: 'send',
      limitKind: 'dailySendUsd',
      limit: 50,
      attempted: 100,
    });
    expect(err.toJSON()).toEqual({
      error: 'LIMIT_EXCEEDED',
      message: expect.stringContaining('Exceeds daily limit ($50)'),
      operation: 'send',
      limitKind: 'dailySendUsd',
      limit: 50,
      attempted: 100,
    });
  });
});

describe('approxUsdValue', () => {
  it('treats USDC as USD 1:1', () => {
    expect(approxUsdValue('USDC', 25)).toBe(25);
  });

  it('treats USDsui as USD 1:1 (case-insensitive)', () => {
    expect(approxUsdValue('USDsui', 25)).toBe(25);
    expect(approxUsdValue('usdsui', 25)).toBe(25);
    expect(approxUsdValue('USDSUI', 25)).toBe(25);
  });

  it('returns null for SUI (unknown without a price lookup)', () => {
    expect(approxUsdValue('SUI', 25)).toBeNull();
  });

  it('returns null for any unrecognised asset', () => {
    expect(approxUsdValue('USDT', 25)).toBeNull();
    expect(approxUsdValue('WAL', 25)).toBeNull();
  });
});
