/**
 * SPEC 7 P2.5 Layer 4 — `RecipeRegistry.toPromptContext` surfaces
 * `bundle: true` step grouping as a "PAYMENT STREAM — emit in parallel"
 * block so the LLM sees the bundle instruction next to the affected steps.
 *
 * Without this, recipes that mark write steps as bundleable would still
 * drive sequential emission because the LLM only reads the numbered list.
 */
import { describe, it, expect } from 'vitest';
import { RecipeRegistry } from './registry.js';
import type { Recipe } from './types.js';

const swapAndSaveLike: Recipe = {
  name: 'swap_and_save',
  description: 'Swap a token to a stable and deposit',
  triggers: ['swap and save'],
  steps: [
    { name: 'check_balance', tool: 'balance_check', purpose: 'read balances' },
    { name: 'swap_to_usdc', tool: 'swap_execute', purpose: 'swap', bundle: true },
    { name: 'deposit', tool: 'save_deposit', purpose: 'deposit', bundle: true },
  ],
};

const accountReportLike: Recipe = {
  name: 'account_report',
  description: 'Read-only multi-card report',
  triggers: ['account report'],
  steps: [
    { name: 'balance', tool: 'balance_check', purpose: 'read balances' },
    { name: 'savings', tool: 'savings_info', purpose: 'read savings' },
  ],
};

const safeBorrowLike: Recipe = {
  name: 'safe_borrow',
  description: 'Single write — should NOT show bundle header',
  triggers: ['safe borrow'],
  steps: [
    { name: 'health', tool: 'health_check', purpose: 'check HF' },
    { name: 'execute', tool: 'borrow', purpose: 'borrow', bundle: true },
  ],
};

describe('RecipeRegistry.toPromptContext — bundle annotations', () => {
  it('shows the PAYMENT STREAM header when ≥2 bundle: true steps exist', () => {
    const registry = new RecipeRegistry();
    const out = registry.toPromptContext(swapAndSaveLike);
    expect(out).toContain('PAYMENT STREAM — emit ALL the following bundleable writes as parallel');
    expect(out).toMatch(/swap_to_usdc.*\[PAYMENT STREAM\]/);
    expect(out).toMatch(/deposit.*\[PAYMENT STREAM\]/);
    expect(out).not.toMatch(/check_balance.*\[PAYMENT STREAM\]/);
  });

  it('does NOT show the PAYMENT STREAM header when 0 bundle: true steps exist', () => {
    const registry = new RecipeRegistry();
    const out = registry.toPromptContext(accountReportLike);
    expect(out).not.toContain('PAYMENT STREAM');
  });

  it('does NOT show the PAYMENT STREAM header when only 1 bundle: true step exists', () => {
    // The marker exists for future paired-write composition but a lone
    // bundle: true step is a no-op (engine only bundles when ≥2 writes
    // emit in the same turn).
    const registry = new RecipeRegistry();
    const out = registry.toPromptContext(safeBorrowLike);
    expect(out).not.toContain('PAYMENT STREAM — emit ALL');
    expect(out).not.toMatch(/\[PAYMENT STREAM\]/);
  });

  it('preserves all the legacy step fields (tool, gate, notes, on_error)', () => {
    const registry = new RecipeRegistry();
    const recipe: Recipe = {
      name: 'with_notes',
      description: 'd',
      triggers: ['t'],
      steps: [
        {
          name: 'step1',
          tool: 'send_transfer',
          purpose: 'send',
          gate: 'review',
          gate_prompt: 'Confirm send?',
          notes: 'use the send tool',
          on_error: { action: 'abort', message: 'send failed' },
        },
      ],
    };
    const out = registry.toPromptContext(recipe);
    expect(out).toContain('step1 → send_transfer');
    expect(out).toContain('[GATE: review]');
    expect(out).toContain('"Confirm send?"');
    expect(out).toContain('Note: use the send tool');
    expect(out).toContain('On error: abort — send failed');
  });
});
