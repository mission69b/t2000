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
  // [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] 'save' + 'borrow' operations
  // were removed with their tools; boundary tests now pin 'withdraw'
  // (autoBelow 25 / confirmBetween 500 in the balanced default).
  it('returns auto when amount is below autoBelow', () => {
    expect(resolvePermissionTier('withdraw', 5, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
    expect(resolvePermissionTier('withdraw', 24, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
  });

  it('returns confirm when amount is between autoBelow and confirmBetween', () => {
    expect(resolvePermissionTier('withdraw', 25, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
    expect(resolvePermissionTier('withdraw', 250, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
    expect(resolvePermissionTier('withdraw', 499, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
  });

  it('returns explicit when amount exceeds confirmBetween', () => {
    expect(resolvePermissionTier('withdraw', 500, DEFAULT_PERMISSION_CONFIG)).toBe('explicit');
    expect(resolvePermissionTier('withdraw', 5000, DEFAULT_PERMISSION_CONFIG)).toBe('explicit');
  });

  it('uses globalAutoBelow for unknown operations', () => {
    expect(resolvePermissionTier('unknown_op', 5, DEFAULT_PERMISSION_CONFIG)).toBe('auto');
    expect(resolvePermissionTier('unknown_op', 10, DEFAULT_PERMISSION_CONFIG)).toBe('confirm');
  });

  it('send has different thresholds than withdraw', () => {
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

  it('returns 1:1 for repay_debt', () => {
    expect(resolveUsdValue('repay_debt', { amount: 100 }, priceCache)).toBe(100);
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

  it('returns 0 for unknown tool', () => {
    expect(resolveUsdValue('balance_check', { amount: 100 }, priceCache)).toBe(0);
  });

  it('returns 0 when no amount present', () => {
    expect(resolveUsdValue('withdraw', {}, priceCache)).toBe(0);
  });
});

describe('toolNameToOperation', () => {
  it('maps known tool names', () => {
    expect(toolNameToOperation('send_transfer')).toBe('send');
    expect(toolNameToOperation('repay_debt')).toBe('repay');
    expect(toolNameToOperation('withdraw')).toBe('withdraw');
    expect(toolNameToOperation('swap_execute')).toBe('swap');
  });

  it('returns undefined for unknown / removed tool names', () => {
    expect(toolNameToOperation('balance_check')).toBeUndefined();
    expect(toolNameToOperation('save_deposit')).toBeUndefined();
    expect(toolNameToOperation('borrow')).toBeUndefined();
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
      resolvePermissionTier('withdraw', 5, DEFAULT_PERMISSION_CONFIG, undefined, {
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

  // [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] The F14 borrow-always-
  // confirms invariant tests were removed with the 'borrow' operation.

  // ---------------------------------------------------------------------------
  // [SPEC 37 v0.7a Phase 8 verification walk / 2026-05-18]
  //
  // Phase 8 acceptance: "USD-aware permission resolver — 3 presets verified
  // (conservative/balanced/aggressive) with auto/confirm/explicit boundary
  // tests for every operation".
  //
  // The two existing assertions above pin (1) relative ordering of
  // globalAutoBelow + autonomousDailyLimit, and (2) the borrow=non-auto
  // invariant. The grid below pins the full resolver contract: for every
  // preset × every operation, the boundary between auto / confirm / explicit
  // matches the documented threshold. This is the regression net that
  // catches drift like the F14 borrow.autoBelow=10 incident (silent
  // auto-borrow on aggressive preset, fixed in v1.11.3) before it ships.
  //
  // Test design: every operation in every preset has a `rule` (asserted
  // below as the first invariant). For each rule, we assert four boundary
  // points: (a) below autoBelow → auto, (b) AT autoBelow → confirm
  // (boundary is `<`), (c) just below confirmBetween → confirm, (d) AT
  // confirmBetween → explicit. Borrow gets a special case since autoBelow
  // is 0 — the (a) point doesn't exist for any positive amount.
  // ---------------------------------------------------------------------------

  it('every preset defines a rule for every PermissionOperation (no gaps)', () => {
    const operations = ['send', 'withdraw', 'swap', 'pay', 'repay'] as const;
    for (const [presetName, config] of Object.entries(PERMISSION_PRESETS)) {
      for (const op of operations) {
        const rule = config.rules.find((r) => r.operation === op);
        expect(rule, `${presetName} preset must define a rule for '${op}'`).toBeDefined();
      }
    }
  });

  it('every preset rule has autoBelow <= confirmBetween (no inverted thresholds)', () => {
    for (const [presetName, config] of Object.entries(PERMISSION_PRESETS)) {
      for (const rule of config.rules) {
        expect(
          rule.autoBelow,
          `${presetName} / ${rule.operation}: autoBelow (${rule.autoBelow}) must be <= confirmBetween (${rule.confirmBetween})`,
        ).toBeLessThanOrEqual(rule.confirmBetween);
      }
    }
  });

  it('preset boundary grid: each rule resolves auto/confirm/explicit correctly at threshold edges', () => {
    for (const [presetName, config] of Object.entries(PERMISSION_PRESETS)) {
      for (const rule of config.rules) {
        const { operation, autoBelow, confirmBetween } = rule;
        const tag = `${presetName} / ${operation}`;

        // (a) Just below autoBelow → auto.
        // Skip for borrow (autoBelow: 0 → no positive amount is below it).
        // Skip for send too — the contact-rule downgrades raw 0x recipients,
        // but the basic boundary check uses no sendContext so it's still valid;
        // we exclude only borrow.
        if (autoBelow > 0) {
          const justBelow = autoBelow - 0.01;
          expect(
            resolvePermissionTier(operation, justBelow, config),
            `${tag}: $${justBelow} (< autoBelow=$${autoBelow}) should be auto`,
          ).toBe('auto');
        }

        // (b) AT autoBelow → confirm (boundary is exclusive `<`).
        // For borrow this lands at $0; resolver returns auto for $0 < $0 → false,
        // so falls through to `else if ($0 < confirmBetween)` → confirm.
        expect(
          resolvePermissionTier(operation, autoBelow, config),
          `${tag}: $${autoBelow} (== autoBelow) should be confirm`,
        ).toBe('confirm');

        // (c) Just below confirmBetween → confirm.
        const justBelowConfirm = confirmBetween - 0.01;
        if (justBelowConfirm > autoBelow) {
          expect(
            resolvePermissionTier(operation, justBelowConfirm, config),
            `${tag}: $${justBelowConfirm} (< confirmBetween=$${confirmBetween}) should be confirm`,
          ).toBe('confirm');
        }

        // (d) AT confirmBetween → explicit (boundary is exclusive `<`).
        expect(
          resolvePermissionTier(operation, confirmBetween, config),
          `${tag}: $${confirmBetween} (== confirmBetween) should be explicit`,
        ).toBe('explicit');

        // (e) Well above confirmBetween → explicit.
        expect(
          resolvePermissionTier(operation, confirmBetween * 10, config),
          `${tag}: $${confirmBetween * 10} (>> confirmBetween) should be explicit`,
        ).toBe('explicit');
      }
    }
  });

  it('preset boundary grid: unknown operation falls back to globalAutoBelow per preset', () => {
    for (const [presetName, config] of Object.entries(PERMISSION_PRESETS)) {
      const tag = `${presetName} / unknown_op`;
      // Below globalAutoBelow → auto.
      expect(
        resolvePermissionTier('mystery_op_not_in_rules', config.globalAutoBelow - 0.01, config),
        `${tag}: below globalAutoBelow=$${config.globalAutoBelow} should be auto`,
      ).toBe('auto');
      // At globalAutoBelow → confirm (fallback confirmBetween defaults to 1000).
      expect(
        resolvePermissionTier('mystery_op_not_in_rules', config.globalAutoBelow, config),
        `${tag}: at globalAutoBelow should be confirm`,
      ).toBe('confirm');
    }
  });

  it('preset autonomousDailyLimit gates auto→confirm downgrade for every preset', () => {
    for (const [presetName, config] of Object.entries(PERMISSION_PRESETS)) {
      const tag = `${presetName}`;
      // withdraw rule under every preset has autoBelow > 0, so a small
      // withdraw WITH sessionSpendUsd ≈ limit should downgrade.
      const withdrawRule = config.rules.find((r) => r.operation === 'withdraw')!;
      const smallWithdraw = Math.min(withdrawRule.autoBelow / 2, 1);
      // Below limit → still auto.
      expect(
        resolvePermissionTier('withdraw', smallWithdraw, config, /* sessionSpend */ 0),
        `${tag}: small withdraw with $0 prior spend should be auto`,
      ).toBe('auto');
      // Pushing cumulative over autonomousDailyLimit → downgraded to confirm.
      const spendThatPushesOver = config.autonomousDailyLimit;
      expect(
        resolvePermissionTier('withdraw', smallWithdraw, config, spendThatPushesOver),
        `${tag}: small withdraw with $${spendThatPushesOver} prior spend (limit=$${config.autonomousDailyLimit}) should downgrade to confirm`,
      ).toBe('confirm');
    }
  });
});
