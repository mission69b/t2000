import { describe, it, expect } from 'vitest';
import {
  resolvePermissionTier,
  resolveUsdValue,
  toolNameToOperation,
  isKnownContactAddress,
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

describe('isKnownContactAddress', () => {
  const contacts = [
    { address: '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd' },
  ];

  it('returns true for an exact match', () => {
    expect(
      isKnownContactAddress(
        '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd',
        contacts,
      ),
    ).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(
      isKnownContactAddress(
        '0x231455F0E9805BDD0945981463DAF0346310A7B3B04A733B011CC791FEB896CD',
        contacts,
      ),
    ).toBe(true);
  });

  it('returns false when a single character differs (the lost-funds case)', () => {
    // Note the `9` → `3` typo at position 20 — exactly the user's incident.
    expect(
      isKnownContactAddress(
        '0x231455f0e9805bdd0345981463daf0346310a7b3b04a733b011cc791feb896cd',
        contacts,
      ),
    ).toBe(false);
  });

  it('returns false when contacts list is empty', () => {
    expect(
      isKnownContactAddress(
        '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd',
        [],
      ),
    ).toBe(false);
  });

  it('returns false for an empty `to`', () => {
    expect(isKnownContactAddress('', contacts)).toBe(false);
  });
});

describe('resolvePermissionTier — send-safety contact rule', () => {
  const knownAddress =
    '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd';
  const unknownAddress =
    '0xaaaa55f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb89bbb';
  const contacts = [{ address: knownAddress }];

  it('downgrades auto → confirm when sending to a non-contact raw address', () => {
    expect(
      resolvePermissionTier('send', 5, DEFAULT_PERMISSION_CONFIG, undefined, {
        to: unknownAddress,
        contacts,
      }),
    ).toBe('confirm');
  });

  it('preserves auto when sending to a saved contact address', () => {
    expect(
      resolvePermissionTier('send', 5, DEFAULT_PERMISSION_CONFIG, undefined, {
        to: knownAddress,
        contacts,
      }),
    ).toBe('auto');
  });

  it('preserves explicit when sending to non-contact at high amount', () => {
    expect(
      resolvePermissionTier('send', 250, DEFAULT_PERMISSION_CONFIG, undefined, {
        to: unknownAddress,
        contacts,
      }),
    ).toBe('explicit');
  });

  it('does not affect non-send operations (no contact check)', () => {
    expect(
      resolvePermissionTier('save', 5, DEFAULT_PERMISSION_CONFIG, undefined, {
        to: unknownAddress,
        contacts,
      }),
    ).toBe('auto');
  });

  it('falls back to auto when no sendContext is provided (back-compat)', () => {
    expect(resolvePermissionTier('send', 5, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
  });

  it('regression: contact-name recipient (e.g. "wallet1") stays auto', () => {
    // Repros the v0.46.15 bug where a send to a saved contact via its
    // *name* ("send 1 SUI to wallet1") was demoted to confirm because
    // `isKnownContactAddress("wallet1", contacts)` compared the name
    // string against contact *addresses* and returned false. Contact-
    // name sends are inherently trusted (the user explicitly saved the
    // contact) and get resolved to addresses downstream — only *raw* 0x
    // recipients with no contact match should be force-confirmed.
    expect(
      resolvePermissionTier('send', 5, DEFAULT_PERMISSION_CONFIG, undefined, {
        to: 'wallet1',
        contacts,
      }),
    ).toBe('auto');
  });

  it('regression: empty/non-0x recipient stays auto regardless of contacts', () => {
    expect(
      resolvePermissionTier('send', 5, DEFAULT_PERMISSION_CONFIG, undefined, {
        to: 'alex@example.com',
        contacts: [],
      }),
    ).toBe('auto');
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

  // [F14 / 2026-05-03] Lock the absolute invariant from
  // `.cursor/rules/safeguards-defense-in-depth.mdc`:
  // "borrow always confirms (autoBelow: 0 across every preset)".
  // Regression: aggressive preset shipped with autoBelow: 10 between v1.4
  // and v1.11.2; a user on aggressive had a 6-op bundle silently auto-
  // execute because step[0]=`repay $2` resolved to `auto` and the host
  // gate only inspected step[0]. This invariant guards the engine half
  // of defense-in-depth (`shouldClientAutoApprove` bundle iteration is
  // the host half).
  it('borrow.autoBelow is 0 across every preset (debt is non-auto)', () => {
    for (const [presetName, config] of Object.entries(PERMISSION_PRESETS)) {
      const borrowRule = config.rules.find((r) => r.operation === 'borrow');
      expect(
        borrowRule,
        `${presetName} preset must define an explicit borrow rule`,
      ).toBeDefined();
      expect(
        borrowRule!.autoBelow,
        `${presetName} preset must have borrow.autoBelow === 0 (debt is too consequential to silently take on)`,
      ).toBe(0);
    }
  });

  // [F14 / 2026-05-03] Direct resolver assertion — even at $0 amount,
  // borrow under any preset must NOT resolve to `auto`. Catches a future
  // refactor that introduces a bypass (e.g. amountUsd === 0 short-circuit).
  it('resolvePermissionTier(borrow, $0..$9, *preset*) never returns auto', () => {
    for (const [presetName, config] of Object.entries(PERMISSION_PRESETS)) {
      for (const amount of [0, 0.01, 1, 5, 9.99]) {
        const tier = resolvePermissionTier('borrow', amount, config);
        expect(
          tier,
          `${presetName} preset / borrow $${amount} must not be auto`,
        ).not.toBe('auto');
      }
    }
  });
});
