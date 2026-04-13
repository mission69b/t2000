import { describe, it, expect } from 'vitest';
import {
  resolvePermissionTier,
  resolveUsdValue,
  toolNameToOperation,
  DEFAULT_PERMISSION_CONFIG,
  PERMISSION_PRESETS,
} from '../permission-rules.js';

describe('resolvePermissionTier', () => {
  it('returns auto when amount is below autoBelow', () => {
    expect(resolvePermissionTier('save', 5, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
    expect(resolvePermissionTier('save', 49, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
  });

  it('returns confirm when amount is between autoBelow and confirmBetween', () => {
    expect(resolvePermissionTier('save', 50, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
    expect(resolvePermissionTier('save', 500, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
    expect(resolvePermissionTier('save', 999, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
  });

  it('returns explicit when amount exceeds confirmBetween', () => {
    expect(resolvePermissionTier('save', 1000, DEFAULT_PERMISSION_CONFIG)).toBe('explicit');
    expect(resolvePermissionTier('save', 5000, DEFAULT_PERMISSION_CONFIG)).toBe('explicit');
  });

  it('uses globalAutoBelow for unknown operations', () => {
    expect(resolvePermissionTier('unknown_op', 5, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
    expect(resolvePermissionTier('unknown_op', 10, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
  });

  it('borrow always requires confirmation (autoBelow: 0)', () => {
    expect(resolvePermissionTier('borrow', 0, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
    expect(resolvePermissionTier('borrow', 1, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
  });

  it('send has different thresholds than save', () => {
    expect(resolvePermissionTier('send', 5, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
    expect(resolvePermissionTier('send', 10, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
    expect(resolvePermissionTier('send', 200, DEFAULT_PERMISSION_CONFIG)).toBe('explicit');
  });
});

describe('resolveUsdValue', () => {
  const priceCache = new Map([
    ['SUI', 3.5],
    ['USDC', 1],
  ]);

  it('returns 1:1 for USDC save_deposit', () => {
    expect(resolveUsdValue('save_deposit', { amount: 100 }, priceCache)).toBe(100);
  });

  it('returns 1:1 for withdraw', () => {
    expect(resolveUsdValue('withdraw', { amount: 50 }, priceCache)).toBe(50);
  });

  it('multiplies by price for SUI send_transfer', () => {
    expect(resolveUsdValue('send_transfer', { amount: 10, asset: 'SUI' }, priceCache)).toBe(35);
  });

  it('returns 1:1 for USDC send_transfer', () => {
    expect(resolveUsdValue('send_transfer', { amount: 10, asset: 'USDC' }, priceCache)).toBe(10);
  });

  it('uses fromAmount and fromAsset for swap_execute', () => {
    expect(resolveUsdValue('swap_execute', { fromAmount: 5, fromAsset: 'SUI' }, priceCache)).toBe(17.5);
  });

  it('returns maxCost for pay_api', () => {
    expect(resolveUsdValue('pay_api', { maxCost: 2 }, priceCache)).toBe(2);
  });

  it('returns 0 for unknown tool', () => {
    expect(resolveUsdValue('balance_check', { amount: 100 }, priceCache)).toBe(0);
  });

  it('returns 0 when no amount present', () => {
    expect(resolveUsdValue('save_deposit', {}, priceCache)).toBe(0);
  });

  it('uses price for volo_stake (SUI)', () => {
    expect(resolveUsdValue('volo_stake', { amount: 10 }, priceCache)).toBe(35);
  });
});

describe('toolNameToOperation', () => {
  it('maps known tool names', () => {
    expect(toolNameToOperation('save_deposit')).toBe('save');
    expect(toolNameToOperation('send_transfer')).toBe('send');
    expect(toolNameToOperation('borrow')).toBe('borrow');
    expect(toolNameToOperation('repay_debt')).toBe('repay');
    expect(toolNameToOperation('withdraw')).toBe('withdraw');
    expect(toolNameToOperation('swap_execute')).toBe('swap');
    expect(toolNameToOperation('pay_api')).toBe('pay');
    expect(toolNameToOperation('volo_stake')).toBe('save');
    expect(toolNameToOperation('volo_unstake')).toBe('withdraw');
  });

  it('returns undefined for unknown tool names', () => {
    expect(toolNameToOperation('balance_check')).toBeUndefined();
    expect(toolNameToOperation('health_check')).toBeUndefined();
  });
});

describe('PERMISSION_PRESETS', () => {
  it('conservative has lower thresholds than balanced', () => {
    const con = PERMISSION_PRESETS.conservative;
    const bal = PERMISSION_PRESETS.balanced;
    expect(con.globalAutoBelow).toBeLessThan(bal.globalAutoBelow);
    expect(con.autonomousDailyLimit).toBeLessThan(bal.autonomousDailyLimit);
  });

  it('aggressive has higher thresholds than balanced', () => {
    const agg = PERMISSION_PRESETS.aggressive;
    const bal = PERMISSION_PRESETS.balanced;
    expect(agg.globalAutoBelow).toBeGreaterThan(bal.globalAutoBelow);
    expect(agg.autonomousDailyLimit).toBeGreaterThan(bal.autonomousDailyLimit);
  });
});
