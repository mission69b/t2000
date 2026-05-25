import { describe, it, expect } from 'vitest';
import { T2000Error } from '@t2000/sdk';
import { saveDepositTool } from '../tools/save.js';
import { borrowTool } from '../tools/borrow.js';
import { repayDebtTool } from '../tools/repay.js';

import { callToolBody, legacyToolView } from './_helpers/call-tool-body.js';

const saveDepositView = legacyToolView(saveDepositTool, 'save_deposit');
const borrowView = legacyToolView(borrowTool, 'borrow');
const repayDebtView = legacyToolView(repayDebtTool, 'repay_debt');
// [v0.51.0] save_deposit and borrow now accept USDC OR USDsui (strategic
// exception — see .cursor/rules/savings-usdc-only.mdc). Every other asset must
// still be rejected. The Zod schema ships an `enum` so TypeScript also blocks
// disallowed assets at compile time. The runtime allow-list is enforced by
// `assertAllowedAsset('save'|'borrow', asset)` in @t2000/sdk.
describe('save_deposit tool', () => {
  it('description names both saveable assets and the auto-chain prohibition', () => {
    expect(saveDepositTool.description).toContain('USDC or USDsui');
    expect(saveDepositTool.description).toContain('do NOT call this tool');
    expect(saveDepositTool.description).toContain('never auto-chain');
  });

  it('runtime preflight rejects USDT', async () => {
    // Cast through `unknown` because the Zod schema would catch this at
    // compile time — the test exists to verify the runtime guard is also
    // wired up (defense in depth for the LLM bypassing the schema).
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = saveDepositView.preflight?.(badInput);
    expect(result?.valid).toBe(false);
    if (result && !result.valid && 'error' in result) expect(result.error).toContain('USDC or USDsui');
  });

  it('runtime preflight rejects SUI', async () => {
    const badInput = { amount: 1, asset: 'SUI' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = saveDepositView.preflight?.(badInput);
    expect(result?.valid).toBe(false);
  });

  it('runtime preflight rejects USDe (other stable still blocked)', async () => {
    const badInput = { amount: 5, asset: 'USDe' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = saveDepositView.preflight?.(badInput);
    expect(result?.valid).toBe(false);
  });

  it('SDK assertAllowedAsset rejects USDT at call() — backstop after preflight', async () => {
    // If the LLM somehow bypassed both the JSON schema enum AND the
    // preflight, the SDK still throws T2000Error('INVALID_ASSET').
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    await expect(callToolBody(saveDepositTool, badInput, {})).rejects.toThrow(T2000Error);
    try {
      await callToolBody(saveDepositTool, badInput, {});
    } catch (e) {
      expect((e as T2000Error).code).toBe('INVALID_ASSET');
    }
  });

  it('preflight accepts USDC', () => {
    expect(saveDepositView.preflight?.({ amount: 10, asset: 'USDC' })).toEqual({ valid: true });
  });

  it('preflight accepts USDsui (strategic exception)', () => {
    expect(saveDepositView.preflight?.({ amount: 10, asset: 'USDsui' })).toEqual({ valid: true });
  });

  it('preflight accepts omitted asset (defaults to USDC)', () => {
    expect(saveDepositView.preflight?.({ amount: 10 })).toEqual({ valid: true });
  });

  it('is a write tool with confirm permission', () => {
    expect(saveDepositView.isReadOnly).toBe(false);
    expect(saveDepositView.permissionLevel).toBe('confirm');
  });

  it('asset parameter is optional in schema and enum-constrained', () => {
    const props = saveDepositView.jsonSchema.properties as Record<string, { type?: string; description?: string; enum?: string[] }>;
    expect(props.asset).toBeDefined();
    expect(props.asset.enum).toEqual(['USDC', 'USDsui']);
    const required = (saveDepositView.jsonSchema.required ?? []) as string[];
    expect(required).not.toContain('asset');
  });
});

describe('borrow tool', () => {
  it('description names both borrowable assets', () => {
    expect(borrowTool.description).toContain('USDC or USDsui');
  });

  it('runtime preflight rejects USDT', async () => {
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = borrowView.preflight?.(badInput);
    expect(result?.valid).toBe(false);
    if (result && !result.valid && 'error' in result) expect(result.error).toContain('USDC or USDsui');
  });

  it('runtime preflight rejects SUI', async () => {
    const badInput = { amount: 1, asset: 'SUI' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = borrowView.preflight?.(badInput);
    expect(result?.valid).toBe(false);
  });

  it('SDK assertAllowedAsset rejects USDT at call() — backstop after preflight', async () => {
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    await expect(callToolBody(borrowTool, badInput, {})).rejects.toThrow(T2000Error);
    try {
      await callToolBody(borrowTool, badInput, {});
    } catch (e) {
      expect((e as T2000Error).code).toBe('INVALID_ASSET');
    }
  });

  it('preflight accepts USDC and USDsui', () => {
    expect(borrowView.preflight?.({ amount: 10, asset: 'USDC' })).toEqual({ valid: true });
    expect(borrowView.preflight?.({ amount: 10, asset: 'USDsui' })).toEqual({ valid: true });
  });

  it('is a write tool with confirm permission', () => {
    expect(borrowView.isReadOnly).toBe(false);
    expect(borrowView.permissionLevel).toBe('confirm');
  });

  it('asset parameter is optional in schema and enum-constrained', () => {
    const props = borrowView.jsonSchema.properties as Record<string, { type?: string; description?: string; enum?: string[] }>;
    expect(props.asset).toBeDefined();
    expect(props.asset.enum).toEqual(['USDC', 'USDsui']);
    const required = (borrowView.jsonSchema.required ?? []) as string[];
    expect(required).not.toContain('asset');
  });
});

// [v0.51.1] repay_debt now accepts asset='USDC'|'USDsui'. The SDK fetches the
// correct coin type for the targeted asset — pre-v0.51.1 it hardcoded USDC,
// which silently broke USDsui repayment. Same allow-list semantics as save +
// borrow.
describe('repay_debt tool', () => {
  it('description names both repayable assets and the symmetry rule', () => {
    expect(repayDebtTool.description).toContain('USDC or USDsui');
    expect(repayDebtTool.description).toContain('USDsui debt MUST be repaid with USDsui');
    expect(repayDebtTool.description).toContain('do NOT auto-swap');
  });

  it('runtime preflight rejects USDT', async () => {
    const badInput = { amount: 10, asset: 'USDT' } as unknown as { amount: number; asset?: 'USDC' | 'USDsui' };
    const result = repayDebtView.preflight?.(badInput);
    expect(result?.valid).toBe(false);
    if (result && !result.valid && 'error' in result) expect(result.error).toContain('USDC or USDsui');
  });

  it('preflight accepts USDC, USDsui, and omitted asset', () => {
    expect(repayDebtView.preflight?.({ amount: 10, asset: 'USDC' })).toEqual({ valid: true });
    expect(repayDebtView.preflight?.({ amount: 10, asset: 'USDsui' })).toEqual({ valid: true });
    expect(repayDebtView.preflight?.({ amount: 10 })).toEqual({ valid: true });
  });

  it('is a write tool with confirm permission', () => {
    expect(repayDebtView.isReadOnly).toBe(false);
    expect(repayDebtView.permissionLevel).toBe('confirm');
  });

  it('asset parameter is optional in schema and enum-constrained', () => {
    const props = repayDebtView.jsonSchema.properties as Record<string, { type?: string; description?: string; enum?: string[] }>;
    expect(props.asset).toBeDefined();
    expect(props.asset.enum).toEqual(['USDC', 'USDsui']);
    const required = (repayDebtView.jsonSchema.required ?? []) as string[];
    expect(required).not.toContain('asset');
  });

  // ─────────────────────────────────────────────────────────────────────
  // [v2.0.3 / 2026-05-17] Dust-debt display polish
  // ─────────────────────────────────────────────────────────────────────
  // Regression: after "Repay all debt" the LLM narrated
  //   "Remaining debt is minimal at $0.001"
  // which reads as a failure state — the user just tapped "repay all"
  // and successfully cleared their position. NAVI's lending index
  // accrues sub-cent interest between blocks, leaving ~$0.001-$0.005
  // dust on a fresh full repay. Fix floors sub-DEBT_DUST_USD residual
  // to 0 in BOTH the structured data the LLM sees AND the displayText.
  describe('dust-debt floor (v2.0.3)', () => {
    function mkContext(repayResult: {
      success: boolean;
      tx: string;
      amount: number;
      remainingDebt: number;
      gasCost: number;
      asset?: string;
    }) {
      // Minimal stub of the agent that repay.ts requires via requireAgent.
      // Only the .repay() method is exercised here.
      return {
        sui: {} as never,
        agent: {
          repay: async () => repayResult,
        } as never,
      };
    }

    it('floors sub-DEBT_DUST_USD remaining debt to 0 in data + displayText', async () => {
      const ctx = mkContext({
        success: true,
        tx: '0xabcdef1234567890',
        amount: 0.5,
        remainingDebt: 0.001, // NAVI dust
        gasCost: 0.001,
        asset: 'USDC',
      });
      const out = await callToolBody(repayDebtTool, 
        { amount: 0.5, asset: 'USDC' },
        ctx as never,
      );
      expect((out.data as { remainingDebt: number }).remainingDebt).toBe(0);
      expect(out.displayText).toContain('no remaining debt');
      expect(out.displayText).not.toContain('$0.00');
      expect(out.displayText).not.toContain('$0.001');
    });

    it('preserves above-dust remaining debt unchanged', async () => {
      const ctx = mkContext({
        success: true,
        tx: '0xabcdef1234567890',
        amount: 0.5,
        remainingDebt: 0.25,
        gasCost: 0.001,
        asset: 'USDC',
      });
      const out = await callToolBody(repayDebtTool, 
        { amount: 0.5, asset: 'USDC' },
        ctx as never,
      );
      expect((out.data as { remainingDebt: number }).remainingDebt).toBe(0.25);
      expect(out.displayText).toContain('remaining debt: $0.25');
    });

    it('exact zero remainingDebt also reads as "no remaining debt"', async () => {
      const ctx = mkContext({
        success: true,
        tx: '0xabcdef1234567890',
        amount: 1,
        remainingDebt: 0,
        gasCost: 0.001,
        asset: 'USDsui',
      });
      const out = await callToolBody(repayDebtTool, 
        { amount: 1, asset: 'USDsui' },
        ctx as never,
      );
      expect(out.displayText).toContain('no remaining debt');
    });
  });
});
