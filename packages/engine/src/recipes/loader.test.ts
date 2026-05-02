/**
 * SPEC 7 P2.5 Layer 4 — recipe loader `bundle: true` validation.
 */
import { describe, it, expect } from 'vitest';
import { parseRecipe } from './loader.js';

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
