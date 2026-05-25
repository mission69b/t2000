/**
 * preflight-coverage.test.ts — locks the
 * "every write tool MUST implement preflight" invariant.
 *
 * From `t2000/.cursor/rules/safeguards-defense-in-depth.mdc`:
 *
 *   > Every write tool MUST implement preflight. No exceptions.
 *
 * Pre-fix audit (SPEC 30 Phase 1B follow-up, 2026-05-14): 6/12 write tools
 * shipped without `preflight` — `withdraw`, `claim_rewards`,
 * `harvest_rewards`, `volo_stake`, `volo_unstake`, `save_contact`. The
 * rule was being enforced verbally but not structurally.
 *
 * Post-S.269 + S.277: `save_contact` (S.269 item 6, dead host-side tool)
 * and Volo trio (S.277 "Earns Its Keep" cut) were deleted from the engine.
 * Surviving write tools with preflight smokes below: `save_deposit`,
 * `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`,
 * `harvest_rewards`, `swap_execute`.
 *
 * This test exists so a future write tool added without preflight
 * fails CI immediately, instead of slipping through review and
 * costing a real preflight bug at execution time. Each preflight gets
 * a smoke "rejects bogus input" test where the tool has any input
 * worth rejecting — the smoke isn't trying to be exhaustive (per-tool
 * tests own that), only to confirm the preflight exists AND fires.
 */
import { describe, it, expect } from 'vitest';

import { WRITE_TOOL_NAMES, WRITE_TOOL_SET } from './index.js';
import { withdrawTool } from './withdraw.js';
import { claimRewardsTool } from './claim.js';
import { harvestRewardsTool } from './harvest-rewards.js';

import { legacyToolView } from '../__tests__/_helpers/call-tool-body.js';

const withdrawView = legacyToolView(withdrawTool, 'withdraw');
const claimRewardsView = legacyToolView(claimRewardsTool, 'claim_rewards');
const harvestRewardsView = legacyToolView(harvestRewardsTool, 'harvest_rewards');

describe('preflight coverage — every write tool implements preflight', () => {
  it('every write tool exposes a preflight function via the test view', () => {
    // [P4.1 / v3.0.0 / 2026-05-25] Preflight no longer lives on the
    // native AI SDK tool itself; it's attached as a non-enumerable
    // `__t2000_preflight` property on `execute` by `wrapEngineExecute`.
    // `legacyToolView(tool, name).preflight` reads through that side door.
    const missing: string[] = [];
    for (const name of WRITE_TOOL_NAMES) {
      const tool = WRITE_TOOL_SET[name];
      const view = legacyToolView(tool, name);
      if (typeof view.preflight !== 'function') missing.push(name);
    }
    expect(missing).toEqual([]);
  });
});

describe('preflight smoke — newly-covered tools (SPEC 30 Phase 1B follow-up)', () => {
  describe('withdraw', () => {
    it('rejects negative amount', () => {
      const r = withdrawView.preflight!({ amount: -1 });
      expect(r.valid).toBe(false);
    });
    it('rejects unsupported asset', () => {
      const r = withdrawView.preflight!({ amount: 10, asset: 'GOLD' });
      expect(r.valid).toBe(false);
      if (!r.valid && 'error' in r) expect(r.error).toMatch(/USDC and USDsui/);
    });
    it('accepts USDC default', () => {
      const r = withdrawView.preflight!({ amount: 10 });
      expect(r.valid).toBe(true);
    });
    it('accepts USDsui (case insensitive)', () => {
      const r = withdrawView.preflight!({ amount: 10, asset: 'usdsui' });
      expect(r.valid).toBe(true);
    });
  });

  describe('claim_rewards', () => {
    it('preflight is a no-op (no inputs to validate) and accepts empty input', () => {
      const r = claimRewardsView.preflight!({});
      expect(r.valid).toBe(true);
    });
  });

  describe('harvest_rewards', () => {
    it('rejects out-of-range slippage', () => {
      expect(harvestRewardsView.preflight!({ slippage: 0.0001 }).valid).toBe(false);
      expect(harvestRewardsView.preflight!({ slippage: 0.5 }).valid).toBe(false);
    });
    it('rejects negative minRewardUsd', () => {
      expect(harvestRewardsView.preflight!({ minRewardUsd: -1 }).valid).toBe(false);
    });
    it('accepts defaults (no input)', () => {
      expect(harvestRewardsView.preflight!({}).valid).toBe(true);
    });
  });

});
