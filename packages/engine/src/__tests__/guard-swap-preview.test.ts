import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  runGuards,
  createGuardRunnerState,
  updateGuardStateAfterToolResult,
  extractConversationText,
  DEFAULT_GUARD_CONFIG,
} from '../guards.js';
import { buildTool } from '../tool.js';
import type { PendingToolCall } from '../orchestration.js';

/**
 * Regression tests for the swap-preview guard.
 *
 * Failure mode being prevented: the LLM tells the user "$1 USDC will get
 * you ~0.285 SUI" (from stale training memory — actual SUI price was
 * $0.95, so they get ~1.05 SUI), then calls swap_execute. The user sees
 * a wildly wrong estimate before the permission card renders. We block
 * swap_execute unless a real swap_quote ran for the same (from, to,
 * amount) within the recent window.
 */

const swapExecute = buildTool({
  name: 'swap_execute',
  description: 'swap',
  inputSchema: z.object({
    from: z.string(),
    to: z.string(),
    amount: z.number().positive(),
    byAmountIn: z.boolean().optional(),
  }),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: false,
  flags: { mutating: true, requiresBalance: true },
  preflight: (input) => {
    if (input.from.toLowerCase() === input.to.toLowerCase()) {
      return { valid: false, error: `Cannot swap ${input.from} to itself.` };
    }
    return { valid: true };
  },
  call: async () => ({ data: {} }),
});

const swapQuote = buildTool({
  name: 'swap_quote',
  description: 'quote',
  inputSchema: z.object({
    from: z.string(),
    to: z.string(),
    amount: z.number().positive(),
  }),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  call: async () => ({ data: {} }),
});

function makeCall(input: Record<string, unknown>): PendingToolCall {
  return { id: 'tool_use_1', name: 'swap_execute', input };
}

const EMPTY_CONV = extractConversationText([]);

describe('guardSwapPreview (swap_execute requires recent swap_quote)', () => {
  it('blocks swap_execute when no matching swap_quote ran', () => {
    const result = runGuards(
      swapExecute,
      makeCall({ from: 'USDC', to: 'SUI', amount: 1 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('swap_preview');
    expect(result.blockReason).toContain('swap_quote');
    expect(result.blockReason).toContain('USDC');
    expect(result.blockReason).toContain('SUI');
  });

  it('passes when a matching swap_quote was just recorded', () => {
    const state = createGuardRunnerState();
    updateGuardStateAfterToolResult(
      'swap_quote',
      swapQuote,
      { from: 'USDC', to: 'SUI', amount: 1 },
      { fromAmount: 1, toAmount: 1.05, route: 'cetus', priceImpact: 0.001 },
      false,
      state,
    );

    const result = runGuards(
      swapExecute,
      makeCall({ from: 'USDC', to: 'SUI', amount: 1 }),
      state,
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    expect(result.blocked).toBe(false);
  });

  it('matches case-insensitively (sui vs SUI)', () => {
    const state = createGuardRunnerState();
    updateGuardStateAfterToolResult(
      'swap_quote',
      swapQuote,
      { from: 'usdc', to: 'sui', amount: 1 },
      { fromAmount: 1, toAmount: 1.05 },
      false,
      state,
    );

    const result = runGuards(
      swapExecute,
      makeCall({ from: 'USDC', to: 'SUI', amount: 1 }),
      state,
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    expect(result.blocked).toBe(false);
  });

  it('accepts amounts within ±1% tolerance', () => {
    const state = createGuardRunnerState();
    updateGuardStateAfterToolResult(
      'swap_quote',
      swapQuote,
      { from: 'USDC', to: 'SUI', amount: 100 },
      { fromAmount: 100, toAmount: 105 },
      false,
      state,
    );

    const result = runGuards(
      swapExecute,
      // 100.5 is within 1% of 100
      makeCall({ from: 'USDC', to: 'SUI', amount: 100.5 }),
      state,
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    expect(result.blocked).toBe(false);
  });

  it('blocks amounts outside ±1% tolerance', () => {
    const state = createGuardRunnerState();
    updateGuardStateAfterToolResult(
      'swap_quote',
      swapQuote,
      { from: 'USDC', to: 'SUI', amount: 100 },
      { fromAmount: 100, toAmount: 105 },
      false,
      state,
    );

    const result = runGuards(
      swapExecute,
      // 102 is 2% above 100 → outside tolerance
      makeCall({ from: 'USDC', to: 'SUI', amount: 102 }),
      state,
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('swap_preview');
  });

  it('blocks if quote was for a different pair', () => {
    const state = createGuardRunnerState();
    updateGuardStateAfterToolResult(
      'swap_quote',
      swapQuote,
      { from: 'USDC', to: 'SUI', amount: 1 },
      { fromAmount: 1, toAmount: 1.05 },
      false,
      state,
    );

    const result = runGuards(
      swapExecute,
      // user pivoted to USDT but didn't re-quote
      makeCall({ from: 'USDC', to: 'USDT', amount: 1 }),
      state,
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('swap_preview');
  });

  it('does not run on non-swap_execute tools', () => {
    const otherTool = buildTool({
      name: 'send_transfer',
      description: 'send',
      inputSchema: z.object({ to: z.string(), amount: z.number(), asset: z.string().optional() }),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: false,
      flags: { mutating: true, requiresBalance: true },
      call: async () => ({ data: {} }),
    });

    const result = runGuards(
      otherTool,
      // explicit asset to bypass asset_intent
      { id: 'x', name: 'send_transfer', input: { to: '0xdead', amount: 1, asset: 'USDC' } },
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    expect(result.blockGate).not.toBe('swap_preview');
  });

  it('can be disabled via config.swapPreview = false', () => {
    const result = runGuards(
      swapExecute,
      makeCall({ from: 'USDC', to: 'SUI', amount: 1 }),
      createGuardRunnerState(),
      { ...DEFAULT_GUARD_CONFIG, swapPreview: false },
      EMPTY_CONV,
    );

    expect(result.blocked).toBe(false);
  });

  it('does not record failed swap_quote calls', () => {
    const state = createGuardRunnerState();
    updateGuardStateAfterToolResult(
      'swap_quote',
      swapQuote,
      { from: 'USDC', to: 'SUI', amount: 1 },
      { error: 'no route' },
      true, // isError=true → must NOT record
      state,
    );

    const result = runGuards(
      swapExecute,
      makeCall({ from: 'USDC', to: 'SUI', amount: 1 }),
      state,
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('swap_preview');
  });

  it('allows multiple sequential quote→execute pairs in the same session', () => {
    const state = createGuardRunnerState();

    updateGuardStateAfterToolResult(
      'swap_quote',
      swapQuote,
      { from: 'USDC', to: 'SUI', amount: 1 },
      { fromAmount: 1, toAmount: 1.05 },
      false,
      state,
    );
    expect(
      runGuards(
        swapExecute,
        makeCall({ from: 'USDC', to: 'SUI', amount: 1 }),
        state,
        DEFAULT_GUARD_CONFIG,
        EMPTY_CONV,
      ).blocked,
    ).toBe(false);

    updateGuardStateAfterToolResult(
      'swap_quote',
      swapQuote,
      { from: 'SUI', to: 'USDT', amount: 0.5 },
      { fromAmount: 0.5, toAmount: 0.47 },
      false,
      state,
    );
    expect(
      runGuards(
        swapExecute,
        makeCall({ from: 'SUI', to: 'USDT', amount: 0.5 }),
        state,
        DEFAULT_GUARD_CONFIG,
        EMPTY_CONV,
      ).blocked,
    ).toBe(false);
  });

  it('preflight (from===to) still wins over swap_preview', () => {
    const result = runGuards(
      swapExecute,
      makeCall({ from: 'USDC', to: 'USDC', amount: 1 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      EMPTY_CONV,
    );

    // input_validation runs first and short-circuits
    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('input_validation');
  });
});
