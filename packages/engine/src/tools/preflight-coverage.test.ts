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

import { WRITE_TOOLS } from './index.js';
import { addRecipientTool } from './add-recipient.js';
import { updateTodoTool } from './update-todo.js';
import { withdrawTool } from './withdraw.js';
import { claimRewardsTool } from './claim.js';
import { harvestRewardsTool } from './harvest-rewards.js';

// Opt-in write tools that hosts append to `getDefaultTools()`. They're
// NOT in `WRITE_TOOLS` (the default-export list), but they ARE write
// tools (`isReadOnly: false`) and therefore subject to the same
// "every write tool MUST implement preflight" rule. Lock them
// alongside WRITE_TOOLS so a future opt-in write tool added without
// preflight is caught by this test.
const OPT_IN_WRITE_TOOLS = [addRecipientTool, updateTodoTool];
const ALL_WRITE_TOOLS = [...WRITE_TOOLS, ...OPT_IN_WRITE_TOOLS];

describe('preflight coverage — every write tool implements preflight', () => {
  it('every WRITE_TOOLS entry has a preflight function', () => {
    const missing: string[] = [];
    for (const tool of WRITE_TOOLS) {
      if (typeof tool.preflight !== 'function') missing.push(tool.name);
    }
    expect(missing).toEqual([]);
  });

  it('every OPT-IN write tool also has a preflight function', () => {
    const missing: string[] = [];
    for (const tool of OPT_IN_WRITE_TOOLS) {
      if (tool.isReadOnly) continue; // belt-and-suspenders
      if (typeof tool.preflight !== 'function') missing.push(tool.name);
    }
    expect(missing).toEqual([]);
  });

  it('every write tool (default + opt-in) has a preflight function', () => {
    // Belt-and-suspenders: combined assertion catches any future write
    // tool added to either list. If the previous two specs pass and this
    // one fails, something is structurally wrong with the import wiring.
    const missing: string[] = [];
    for (const tool of ALL_WRITE_TOOLS) {
      if (tool.isReadOnly) continue;
      if (typeof tool.preflight !== 'function') missing.push(tool.name);
    }
    expect(missing).toEqual([]);
  });
});

describe('preflight smoke — newly-covered tools (SPEC 30 Phase 1B follow-up)', () => {
  describe('withdraw', () => {
    it('rejects negative amount', () => {
      const r = withdrawTool.preflight!({ amount: -1 });
      expect(r.valid).toBe(false);
    });
    it('rejects unsupported asset', () => {
      const r = withdrawTool.preflight!({ amount: 10, asset: 'GOLD' });
      expect(r.valid).toBe(false);
      if (!r.valid && 'error' in r) expect(r.error).toMatch(/USDC and USDsui/);
    });
    it('accepts USDC default', () => {
      const r = withdrawTool.preflight!({ amount: 10 });
      expect(r.valid).toBe(true);
    });
    it('accepts USDsui (case insensitive)', () => {
      const r = withdrawTool.preflight!({ amount: 10, asset: 'usdsui' });
      expect(r.valid).toBe(true);
    });
  });

  describe('claim_rewards', () => {
    it('preflight is a no-op (no inputs to validate) and accepts empty input', () => {
      const r = claimRewardsTool.preflight!({});
      expect(r.valid).toBe(true);
    });
  });

  describe('harvest_rewards', () => {
    it('rejects out-of-range slippage', () => {
      expect(harvestRewardsTool.preflight!({ slippage: 0.0001 }).valid).toBe(false);
      expect(harvestRewardsTool.preflight!({ slippage: 0.5 }).valid).toBe(false);
    });
    it('rejects negative minRewardUsd', () => {
      expect(harvestRewardsTool.preflight!({ minRewardUsd: -1 }).valid).toBe(false);
    });
    it('accepts defaults (no input)', () => {
      expect(harvestRewardsTool.preflight!({}).valid).toBe(true);
    });
  });

});
