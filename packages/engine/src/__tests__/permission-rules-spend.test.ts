import { describe, it, expect } from 'vitest';
import {
  resolvePermissionTier,
  DEFAULT_PERMISSION_CONFIG,
} from '../permission-rules.js';

/**
 * [v1.4] Day 2 — sessionSpendUsd parameter on resolvePermissionTier.
 *
 * The default config has autonomousDailyLimit=200 and a `save` rule with
 * autoBelow=50, so a $40 save is normally `auto`. When session spend is
 * close to the daily limit, the resolver downgrades `auto` to `confirm`.
 */
describe('resolvePermissionTier — sessionSpendUsd cumulative cap', () => {
  it('returns auto when sessionSpendUsd is undefined (current behavior preserved)', () => {
    expect(resolvePermissionTier('save', 40, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
    expect(resolvePermissionTier('save', 40, DEFAULT_PERMISSION_CONFIG, undefined)).toBe('auto');
  });

  it('returns auto when cumulative spend stays under the daily limit', () => {
    // 100 + 40 = 140, well under 200 daily limit
    expect(resolvePermissionTier('save', 40, DEFAULT_PERMISSION_CONFIG, 100)).toBe('auto');
  });

  it('downgrades auto to confirm when cumulative spend would breach the daily limit', () => {
    // 180 already spent + 40 incoming = 220 > 200 daily limit → must confirm
    expect(resolvePermissionTier('save', 40, DEFAULT_PERMISSION_CONFIG, 180)).toBe('confirm');
  });

  it('does not weaken tiers — confirm/explicit pass through unchanged regardless of spend', () => {
    // 100 USD save is in the confirm tier (50–1000); spend should not move it.
    expect(resolvePermissionTier('save', 100, DEFAULT_PERMISSION_CONFIG, 0)).toBe('confirm');
    expect(resolvePermissionTier('save', 100, DEFAULT_PERMISSION_CONFIG, 1000)).toBe('confirm');
    // 1500 USD save is explicit; spend never elevates that to auto.
    expect(resolvePermissionTier('save', 1500, DEFAULT_PERMISSION_CONFIG, 0)).toBe('explicit');
    expect(resolvePermissionTier('save', 1500, DEFAULT_PERMISSION_CONFIG, 5000)).toBe('explicit');
  });

  it('treats spend exactly equal to the daily limit as still autonomous', () => {
    // sessionSpend (160) + amount (40) = 200, equal to limit, NOT greater → still auto
    expect(resolvePermissionTier('save', 40, DEFAULT_PERMISSION_CONFIG, 160)).toBe('auto');
  });
});
