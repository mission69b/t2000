import { describe, it, expect } from 'vitest';
import { repayDebtTool } from '../tools/repay.js';

import { callToolBody, legacyToolView } from './_helpers/call-tool-body.js';

const repayDebtView = legacyToolView(repayDebtTool, 'repay_debt');

// [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] save_deposit + borrow were
// deleted in the DeFi-removal window-start cut; their describe blocks went
// with them. repay_debt stays live through the 7-day exit window (§2d).
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
