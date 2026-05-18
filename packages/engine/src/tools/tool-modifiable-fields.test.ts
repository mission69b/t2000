// tool-modifiable-fields.test.ts — Regression coverage for F-11 (2026-05-18
// founder smoke). Pre-fix, every USDsui save/borrow/withdraw/repay emitted
// modifiableFields[].asset === 'USDC' regardless of input.asset; the UI's
// amount editor labelled USDsui txs as USDC. Post-fix, the asset on
// amount-bearing fields tracks input.asset for the asset-overridable tools.

import { describe, it, expect } from 'vitest';
import {
  getModifiableFields,
  TOOL_MODIFIABLE_FIELDS,
} from './tool-modifiable-fields.js';

describe('getModifiableFields — back-compat (no input)', () => {
  it('returns registry default (USDC) for save_deposit when input is omitted', () => {
    const fields = getModifiableFields('save_deposit');
    expect(fields).toEqual([{ name: 'amount', kind: 'amount', asset: 'USDC' }]);
  });

  it('returns undefined for unregistered tool names', () => {
    expect(getModifiableFields('not_a_real_tool')).toBeUndefined();
  });

  it('returns the registry entry as-is for non-asset-overridable tools', () => {
    expect(getModifiableFields('send_transfer')).toBe(
      TOOL_MODIFIABLE_FIELDS.send_transfer,
    );
    expect(getModifiableFields('swap_execute')).toBe(
      TOOL_MODIFIABLE_FIELDS.swap_execute,
    );
    expect(getModifiableFields('volo_stake')).toBe(
      TOOL_MODIFIABLE_FIELDS.volo_stake,
    );
  });
});

describe('getModifiableFields — F-11 asset override (USDC vs USDsui)', () => {
  for (const toolName of ['save_deposit', 'withdraw', 'borrow', 'repay_debt'] as const) {
    describe(toolName, () => {
      it(`rewrites asset to USDsui when input.asset === 'USDsui'`, () => {
        const fields = getModifiableFields(toolName, { amount: 0.5, asset: 'USDsui' });
        const amountField = fields?.find((f) => f.name === 'amount');
        expect(amountField?.asset).toBe('USDsui');
      });

      it(`keeps asset USDC when input.asset === 'USDC'`, () => {
        const fields = getModifiableFields(toolName, { amount: 0.5, asset: 'USDC' });
        const amountField = fields?.find((f) => f.name === 'amount');
        expect(amountField?.asset).toBe('USDC');
      });

      it(`falls back to registry default when input.asset is missing`, () => {
        const fields = getModifiableFields(toolName, { amount: 0.5 });
        const amountField = fields?.find((f) => f.name === 'amount');
        expect(amountField?.asset).toBe('USDC');
      });

      it(`ignores unrecognised asset values (fail-safe to registry default)`, () => {
        const fields = getModifiableFields(toolName, { amount: 0.5, asset: 'BTC' });
        const amountField = fields?.find((f) => f.name === 'amount');
        expect(amountField?.asset).toBe('USDC');
      });

      it(`does not mutate the registry entry`, () => {
        getModifiableFields(toolName, { amount: 0.5, asset: 'USDsui' });
        const original = TOOL_MODIFIABLE_FIELDS[toolName];
        expect(original.find((f) => f.name === 'amount')?.asset).toBe('USDC');
      });
    });
  }

  it('does NOT override asset on send_transfer (no asset on amount field)', () => {
    const fields = getModifiableFields('send_transfer', { amount: 1, asset: 'USDsui', to: '0x1' });
    const amountField = fields?.find((f) => f.name === 'amount');
    expect(amountField?.asset).toBeUndefined();
  });

  it('does NOT override asset on swap_execute (no asset on amount field)', () => {
    const fields = getModifiableFields('swap_execute', { from: 'USDC', to: 'SUI', amount: 1, asset: 'USDsui' });
    const amountField = fields?.find((f) => f.name === 'amount');
    expect(amountField?.asset).toBeUndefined();
  });

  it('does NOT override asset on volo_stake (hardcoded SUI)', () => {
    const fields = getModifiableFields('volo_stake', { amount: 1, asset: 'USDsui' });
    const amountField = fields?.find((f) => f.name === 'amount');
    expect(amountField?.asset).toBe('SUI');
  });

  it('does NOT override asset on volo_unstake (hardcoded vSUI)', () => {
    const fields = getModifiableFields('volo_unstake', { amount: 1, asset: 'USDsui' });
    const amountField = fields?.find((f) => f.name === 'amount');
    expect(amountField?.asset).toBe('vSUI');
  });
});
