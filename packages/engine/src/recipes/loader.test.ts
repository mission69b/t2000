/**
 * SPEC 7 P2.5 Layer 4 — recipe loader `bundle: true` validation.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseRecipe, loadRecipes } from './loader.js';

describe('recipe loader — bundle: true validation', () => {
  it('accepts bundle: true on a bundleable confirm-tier write tool', () => {
    const yamlContent = `
name: Test bundleable recipe
description: split-send pattern
triggers: [split-send]
steps:
  - name: send-a
    tool: send_transfer
    purpose: send first leg
    bundle: true
  - name: send-b
    tool: send_transfer
    purpose: send second leg
    bundle: true
`;
    const recipe = parseRecipe(yamlContent);
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.steps[0].bundle).toBe(true);
    expect(recipe.steps[1].bundle).toBe(true);
  });

  it('rejects bundle: true on pay_api (non-bundleable confirm-tier)', () => {
    const yamlContent = `
name: Bad recipe
description: pay_api in a bundle
triggers: [bad]
steps:
  - name: pay
    tool: pay_api
    purpose: bundle pay_api
    bundle: true
`;
    expect(() => parseRecipe(yamlContent)).toThrow(/bundle: true/);
  });

  it('rejects bundle: true on save_contact (Postgres-only)', () => {
    const yamlContent = `
name: Bad recipe
description: save_contact in a bundle
triggers: [bad]
steps:
  - name: save
    tool: save_contact
    purpose: bundle save_contact
    bundle: true
`;
    expect(() => parseRecipe(yamlContent)).toThrow(/bundle: true/);
  });

  it('rejects bundle: true with no tool field', () => {
    const yamlContent = `
name: Bad recipe
description: missing tool
triggers: [bad]
steps:
  - name: incomplete
    purpose: no tool
    bundle: true
`;
    expect(() => parseRecipe(yamlContent)).toThrow(/bundle: true/);
  });

  it('rejects bundle: true on an unknown tool', () => {
    const yamlContent = `
name: Bad recipe
description: unknown tool
triggers: [bad]
steps:
  - name: unknown
    tool: send_unicorn
    purpose: bundle unknown
    bundle: true
`;
    expect(() => parseRecipe(yamlContent)).toThrow(/bundle: true/);
  });

  it('accepts steps without bundle: true on any tool (validation gate is opt-in)', () => {
    const yamlContent = `
name: Mixed recipe
description: read + non-bundled write
triggers: [mixed]
steps:
  - name: check
    tool: balance_check
    purpose: read
  - name: pay
    tool: pay_api
    purpose: pay (NOT bundled)
`;
    const recipe = parseRecipe(yamlContent);
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.steps[0].bundle).toBeUndefined();
    expect(recipe.steps[1].bundle).toBeUndefined();
  });

  it('accepts every v1 bundleable tool', () => {
    const bundleable = [
      'save_deposit', 'withdraw', 'borrow', 'repay_debt',
      'send_transfer', 'swap_execute', 'claim_rewards',
      'volo_stake', 'volo_unstake',
    ];
    for (const tool of bundleable) {
      const yamlContent = `
name: Test ${tool}
description: bundle ${tool}
triggers: [t]
steps:
  - name: step1
    tool: ${tool}
    purpose: test
    bundle: true
  - name: step2
    tool: ${tool}
    purpose: test
    bundle: true
`;
      expect(() => parseRecipe(yamlContent), `should accept ${tool}`).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// SPEC 7 v0.3.1 G11 acceptance gate — loader unit-test parses BOTH the legacy
// read-mostly recipes (no `bundle:` key) AND the 3 multi-write recipes with
// the new `bundle: true` syntax cleanly. Ship-blocker for P2.5.
//
// Pulls the actual recipe directory at `t2000-skills/recipes/` and asserts:
//   1. Every YAML in the directory parses without error.
//   2. The 3 multi-write recipes (swap_and_save, portfolio_rebalance,
//      emergency_withdraw) now carry the `bundle: true` step grouping:
//        • `swap_and_save` MUST have ≥2 bundle steps (swap + deposit —
//          a true multi-step bundle whose distinct step names trigger
//          the PAYMENT INTENT header in `RecipeRegistry.toPromptContext`).
//        • `portfolio_rebalance` MUST have ≥1 bundle step (`execute_swaps`
//          alone — the LLM is instructed via the step's `notes` to emit
//          this single step's `tool_use` block multiple times in one
//          turn, so the parallel-emission shape is encoded in prose, not
//          step count).
//        • `emergency_withdraw` MUST have ≥1 bundle step (`execute_withdraw`
//          alone — reserves the marker for the future paired close-
//          position flow `repay_debt + withdraw`; today's solo step is
//          a no-op when emitted alone).
//   3. The 3 read-mostly recipes (safe_borrow, send_to_contact, account_report)
//      stay legacy — zero `bundle:` keys (no parser regression).
// ---------------------------------------------------------------------------

const RECIPES_DIR = join(__dirname, '..', '..', '..', '..', 't2000-skills', 'recipes');

describe('recipe loader — G11 acceptance gate (legacy + new syntax coexist)', () => {
  // Skip the directory-load tests when running against a published tarball
  // (e.g. CI dependency installs) where the t2000-skills/ folder isn't a
  // sibling of packages/engine. The unit-test schema-only cases above still
  // run unconditionally.
  const skipIfMissing = existsSync(RECIPES_DIR) ? it : it.skip;

  skipIfMissing('loads every recipe from t2000-skills/recipes/ without error', () => {
    const recipes = loadRecipes(RECIPES_DIR);
    expect(recipes.length).toBeGreaterThanOrEqual(6);
    const names = recipes.map((r) => r.name).sort();
    expect(names).toContain('swap_and_save');
    expect(names).toContain('portfolio_rebalance');
    expect(names).toContain('emergency_withdraw');
    expect(names).toContain('safe_borrow');
    expect(names).toContain('send_to_contact');
    expect(names).toContain('account_report');
  });

  skipIfMissing('swap_and_save has the new bundle: true syntax (≥2 bundle steps)', () => {
    const recipes = loadRecipes(RECIPES_DIR);
    const swapAndSave = recipes.find((r) => r.name === 'swap_and_save');
    expect(swapAndSave).toBeDefined();
    const bundleSteps = swapAndSave!.steps.filter((s) => s.bundle === true);
    expect(bundleSteps.length).toBeGreaterThanOrEqual(2);
    const tools = bundleSteps.map((s) => s.tool).sort();
    expect(tools).toEqual(['save_deposit', 'swap_execute']);
  });

  skipIfMissing('portfolio_rebalance has the new bundle: true syntax (≥1 bundle write)', () => {
    const recipes = loadRecipes(RECIPES_DIR);
    const rebalance = recipes.find((r) => r.name === 'portfolio_rebalance');
    expect(rebalance).toBeDefined();
    const bundleSteps = rebalance!.steps.filter((s) => s.bundle === true);
    expect(bundleSteps.length).toBeGreaterThanOrEqual(1);
    expect(bundleSteps.every((s) => s.tool === 'swap_execute')).toBe(true);
  });

  skipIfMissing('emergency_withdraw has the new bundle: true syntax (≥1 bundle write)', () => {
    const recipes = loadRecipes(RECIPES_DIR);
    const emergency = recipes.find((r) => r.name === 'emergency_withdraw');
    expect(emergency).toBeDefined();
    const bundleSteps = emergency!.steps.filter((s) => s.bundle === true);
    expect(bundleSteps.length).toBeGreaterThanOrEqual(1);
    // The marker is reserved for paired writes (e.g. repay_debt + withdraw)
    // — currently only `withdraw` carries it.
    expect(bundleSteps[0].tool).toBe('withdraw');
  });

  skipIfMissing('legacy read-mostly recipes have NO bundle: keys (no parser regression)', () => {
    const recipes = loadRecipes(RECIPES_DIR);
    const legacy = ['safe_borrow', 'send_to_contact', 'account_report'];
    for (const name of legacy) {
      const recipe = recipes.find((r) => r.name === name);
      expect(recipe, `recipe '${name}' should exist`).toBeDefined();
      const bundleSteps = recipe!.steps.filter((s) => s.bundle === true);
      expect(bundleSteps.length, `'${name}' must stay legacy (no bundle: keys)`).toBe(0);
    }
  });
});
