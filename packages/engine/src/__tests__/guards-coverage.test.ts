/**
 * [SPEC 37 v0.7a Phase 8 verification walk — 2026-05-18]
 *
 * Closes the Phase 8 acceptance criterion: "14 guards verified — each has
 * a test asserting all 4 outcomes (pass / hint / warning / block)"
 * (`audric-v07a-engine-drain.plan.md` §Section 6).
 *
 * Pre-existing guard test files cover 7 of the 14 gates:
 *   - `guard-address-source.test.ts`   → address_source
 *   - `guard-address-scope.test.ts`    → address_scope
 *   - `guard-asset-intent.test.ts`     → asset_intent
 *   - `guard-swap-preview.test.ts`     → swap_preview
 *   - `guard-financial-context-seed.test.ts` → balance_required + health_factor
 *   - `v2/guard-runner.test.ts`        → input_validation (preflight)
 *
 * This file covers the remaining 7 gates:
 *   - retry_blocked         (safety)   — pass + block
 *   - irreversibility       (safety)   — pass×2 + hint
 *   - large_transfer        (financial) — pass×2 + hint + warn
 *   - slippage_warning      (financial) — pass×2 + hint
 *   - cost_warning          (ux)        — pass×2 + hint
 *   - artifact_preview      (ux, post-exec) — null + hint×2
 *   - stale_data            (ux, post-exec) — null + hint
 *
 * Note on "4 outcomes per guard": the plan's acceptance framing is
 * aspirational. Actual outcome surface varies per guard — most pre-exec
 * guards have 2-3 reachable outcomes (only `health_factor` has all four:
 * pass | hint | warn | block, covered in `guard-financial-context-seed`).
 * This file asserts every reachable outcome for the 7 previously-untested
 * guards; outcomes the source code can't produce are not invented.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  runGuards,
  createGuardRunnerState,
  extractConversationText,
  guardArtifactPreview,
  guardStaleData,
  type GuardConfig,
} from '../guards.js';
import { defineTool } from '../v2/define-tool.js';
import type { PendingToolCall } from '../orchestration.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a tight GuardConfig that enables ONLY the named guard(s).
 * Everything else is disabled so the target guard fires in isolation.
 */
function only(...enabled: Array<keyof GuardConfig>): GuardConfig {
  const base: GuardConfig = {
    balanceValidation: false,
    healthFactor: false,
    largeTransfer: false,
    slippage: false,
    staleData: false,
    irreversibility: false,
    artifactPreview: false,
    costWarning: false,
    retryProtection: false,
    inputValidation: false,
    addressSource: false,
    assetIntent: false,
    swapPreview: false,
    addressScope: false,
  };
  for (const key of enabled) {
    if (key === 'healthFactor') {
      base.healthFactor = { warnBelow: 2.0, blockBelow: 1.5 };
    } else if (key === 'largeTransfer') {
      base.largeTransfer = { warnAbove: 50, strongWarnAbove: 500 };
    } else {
      (base as Record<string, unknown>)[key] = true;
    }
  }
  return base;
}

function makeCall(name: string, input: Record<string, unknown> = {}): PendingToolCall {
  return { id: `tool_use_${Math.random().toString(36).slice(2)}`, name, input };
}

function makeConvCtx(opts: {
  userText?: string;
  assistantText?: string;
  fullText?: string;
} = {}) {
  const messages = [
    ...(opts.assistantText
      ? [{ role: 'assistant' as const, content: [{ type: 'text' as const, text: opts.assistantText }] }]
      : []),
    ...(opts.userText
      ? [{ role: 'user' as const, content: [{ type: 'text' as const, text: opts.userText }] }]
      : []),
  ];
  const ctx = extractConversationText(messages);
  if (opts.fullText !== undefined) {
    return { ...ctx, fullText: opts.fullText };
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// 1. retry_blocked (safety) — pass | block
// ---------------------------------------------------------------------------

describe('retry_blocked (safety guard)', () => {
  const payApi = defineTool({
    name: 'pay_api',
    description: 'pay',
    inputSchema: z.object({ url: z.string() }),
    isReadOnly: false,
    flags: { mutating: true },
    call: async () => ({ data: {} }),
  });

  it('passes when the tool has not been called before (no retry history)', () => {
    const state = createGuardRunnerState();
    const result = runGuards(
      payApi,
      makeCall('pay_api', { url: 'https://api.example/charge' }),
      state,
      only('retryProtection'),
      makeConvCtx(),
    );
    expect(result.blocked).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('blocks when the tool was previously called with paymentConfirmed (retry attempt)', () => {
    const state = createGuardRunnerState();
    // Simulate the prior tool run that confirmed payment
    state.retryTracker.record(
      'pay_api',
      { url: 'https://api.example/charge' },
      { paymentConfirmed: true },
    );
    const result = runGuards(
      payApi,
      makeCall('pay_api', { url: 'https://api.example/charge' }),
      state,
      only('retryProtection'),
      makeConvCtx(),
    );
    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('retry_blocked');
    expect(result.blockReason).toMatch(/already called|do not retry/i);
  });

  it('does not block a different URL even after recording one (key is toolName:url)', () => {
    const state = createGuardRunnerState();
    state.retryTracker.record(
      'pay_api',
      { url: 'https://api.example/charge-A' },
      { paymentConfirmed: true },
    );
    const result = runGuards(
      payApi,
      makeCall('pay_api', { url: 'https://api.example/charge-B' }),
      state,
      only('retryProtection'),
      makeConvCtx(),
    );
    expect(result.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. irreversibility (safety) — pass (not irreversible) | pass (preview) | hint
// ---------------------------------------------------------------------------

describe('irreversibility (safety guard)', () => {
  const irreversibleTool = defineTool({
    name: 'send_transfer',
    description: 'send',
    inputSchema: z.object({ to: z.string(), amount: z.number() }),
    isReadOnly: false,
    flags: { mutating: true, irreversible: true },
    call: async () => ({ data: {} }),
  });
  const reversibleTool = defineTool({
    name: 'save_deposit',
    description: 'save',
    inputSchema: z.object({ amount: z.number() }),
    isReadOnly: false,
    flags: { mutating: true /* irreversible: false (default) */ },
    call: async () => ({ data: {} }),
  });

  it('passes when the tool is NOT flagged irreversible', () => {
    const result = runGuards(
      reversibleTool,
      makeCall('save_deposit', { amount: 100 }),
      createGuardRunnerState(),
      only('irreversibility'),
      makeConvCtx({ userText: 'save 100 USDC' }),
    );
    expect(result.blocked).toBe(false);
    expect(result.events.find((e) => e.gate === 'irreversibility')).toBeUndefined();
  });

  it('passes when irreversible AND a preview/confirm marker exists in conversation', () => {
    const result = runGuards(
      irreversibleTool,
      makeCall('send_transfer', { to: '0xabc', amount: 5 }),
      createGuardRunnerState(),
      only('irreversibility'),
      makeConvCtx({ assistantText: "Here's what I'll send: 5 USDC to 0xabc..." }),
    );
    expect(result.blocked).toBe(false);
    expect(result.events.find((e) => e.gate === 'irreversibility')).toBeUndefined();
  });

  it('emits hint when irreversible AND no preview marker', () => {
    const result = runGuards(
      irreversibleTool,
      makeCall('send_transfer', { to: '0xabc', amount: 5 }),
      createGuardRunnerState(),
      only('irreversibility'),
      makeConvCtx({ userText: 'send 5 to 0xabc' }),
    );
    expect(result.blocked).toBe(false);
    const event = result.events.find((e) => e.gate === 'irreversibility');
    expect(event?.verdict).toBe('hint');
    expect(event?.tier).toBe('safety');
    expect(event?.message).toMatch(/irreversible/i);
  });
});

// ---------------------------------------------------------------------------
// 3. large_transfer (financial) — pass×2 | hint | warn
// ---------------------------------------------------------------------------

describe('large_transfer (financial guard)', () => {
  const sendTransfer = defineTool({
    name: 'send_transfer',
    description: 'send',
    inputSchema: z.object({ to: z.string(), amount: z.number() }),
    isReadOnly: false,
    flags: { mutating: true },
    call: async () => ({ data: {} }),
  });
  const otherWrite = defineTool({
    name: 'save_deposit',
    description: 'save',
    inputSchema: z.object({ amount: z.number() }),
    isReadOnly: false,
    flags: { mutating: true },
    call: async () => ({ data: {} }),
  });

  it('passes on non-send_transfer tools regardless of amount', () => {
    const result = runGuards(
      otherWrite,
      makeCall('save_deposit', { amount: 10_000 }),
      createGuardRunnerState(),
      only('largeTransfer'),
      makeConvCtx(),
    );
    expect(result.blocked).toBe(false);
    expect(result.events.find((e) => e.gate === 'large_transfer')).toBeUndefined();
  });

  it('passes when send_transfer amount is below warnAbove threshold', () => {
    const result = runGuards(
      sendTransfer,
      makeCall('send_transfer', { to: '0xabc...', amount: 10 }),
      createGuardRunnerState(),
      only('largeTransfer'),
      makeConvCtx(),
    );
    expect(result.blocked).toBe(false);
    expect(result.events.find((e) => e.gate === 'large_transfer')).toBeUndefined();
  });

  it('emits hint when amount exceeds warnAbove ($50) but stays under strongWarnAbove ($500)', () => {
    const result = runGuards(
      sendTransfer,
      makeCall('send_transfer', { to: '0xabcdef1234567890', amount: 100 }),
      createGuardRunnerState(),
      only('largeTransfer'),
      makeConvCtx(),
    );
    expect(result.blocked).toBe(false);
    const event = result.events.find((e) => e.gate === 'large_transfer');
    expect(event?.verdict).toBe('hint');
    expect(event?.tier).toBe('financial');
    expect(event?.message).toMatch(/large transfer/i);
  });

  it('emits warn when amount exceeds strongWarnAbove ($500)', () => {
    const result = runGuards(
      sendTransfer,
      makeCall('send_transfer', { to: '0xabcdef1234567890', amount: 750 }),
      createGuardRunnerState(),
      only('largeTransfer'),
      makeConvCtx(),
    );
    expect(result.blocked).toBe(false);
    const event = result.events.find((e) => e.gate === 'large_transfer');
    expect(event?.verdict).toBe('warn');
    expect(event?.tier).toBe('financial');
    expect(event?.message).toMatch(/high-value transfer/i);
  });
});

// ---------------------------------------------------------------------------
// 4. slippage_warning (financial) — pass×2 | hint
// ---------------------------------------------------------------------------

describe('slippage_warning (financial guard)', () => {
  const swapExecute = defineTool({
    name: 'swap_execute',
    description: 'swap',
    inputSchema: z.object({ from: z.string(), to: z.string(), amount: z.number() }),
    isReadOnly: false,
    flags: { mutating: true },
    call: async () => ({ data: {} }),
  });
  const nonSwap = defineTool({
    name: 'save_deposit',
    description: 'save',
    inputSchema: z.object({ amount: z.number() }),
    isReadOnly: false,
    flags: { mutating: true },
    call: async () => ({ data: {} }),
  });

  it('passes on non-swap_execute tools regardless of assistant text', () => {
    const result = runGuards(
      nonSwap,
      makeCall('save_deposit', { amount: 100 }),
      createGuardRunnerState(),
      only('slippage'),
      makeConvCtx({ assistantText: 'no estimate here' }),
    );
    expect(result.blocked).toBe(false);
    expect(result.events.find((e) => e.gate === 'slippage_warning')).toBeUndefined();
  });

  it('passes when swap_execute AND assistant text contains an output estimate (token + amount)', () => {
    const result = runGuards(
      swapExecute,
      makeCall('swap_execute', { from: 'SUI', to: 'USDC', amount: 10 }),
      createGuardRunnerState(),
      only('slippage'),
      makeConvCtx({ assistantText: "You'll receive approximately 11.5 USDC" }),
    );
    expect(result.blocked).toBe(false);
    expect(result.events.find((e) => e.gate === 'slippage_warning')).toBeUndefined();
  });

  it('emits hint when swap_execute AND no output estimate in assistant text', () => {
    const result = runGuards(
      swapExecute,
      makeCall('swap_execute', { from: 'SUI', to: 'USDC', amount: 10 }),
      createGuardRunnerState(),
      only('slippage'),
      makeConvCtx({ assistantText: 'okay running the swap' }),
    );
    expect(result.blocked).toBe(false);
    const event = result.events.find((e) => e.gate === 'slippage_warning');
    expect(event?.verdict).toBe('hint');
    expect(event?.tier).toBe('financial');
    expect(event?.message).toMatch(/expected output amount/i);
  });
});

// ---------------------------------------------------------------------------
// 5. cost_warning (ux) — pass×2 | hint
// ---------------------------------------------------------------------------

describe('cost_warning (ux guard)', () => {
  const costAwareTool = defineTool({
    name: 'pay_api',
    description: 'pay',
    inputSchema: z.object({ url: z.string() }),
    isReadOnly: false,
    flags: { mutating: true, costAware: true },
    call: async () => ({ data: {} }),
  });
  const nonCostAwareTool = defineTool({
    name: 'save_deposit',
    description: 'save',
    inputSchema: z.object({ amount: z.number() }),
    isReadOnly: false,
    flags: { mutating: true /* costAware: false */ },
    call: async () => ({ data: {} }),
  });

  it('passes when tool is NOT flagged costAware', () => {
    const result = runGuards(
      nonCostAwareTool,
      makeCall('save_deposit', { amount: 100 }),
      createGuardRunnerState(),
      only('costWarning'),
      makeConvCtx({ userText: 'go ahead' }),
    );
    expect(result.blocked).toBe(false);
    expect(result.events.find((e) => e.gate === 'cost_warning')).toBeUndefined();
  });

  it('passes when costAware AND conversation mentions cost ($, fee, pay, etc.)', () => {
    const result = runGuards(
      costAwareTool,
      makeCall('pay_api', { url: 'https://x' }),
      createGuardRunnerState(),
      only('costWarning'),
      makeConvCtx({ fullText: 'This will cost $0.50 USDC' }),
    );
    expect(result.blocked).toBe(false);
    expect(result.events.find((e) => e.gate === 'cost_warning')).toBeUndefined();
  });

  it('emits hint when costAware AND no cost mention in conversation', () => {
    const result = runGuards(
      costAwareTool,
      makeCall('pay_api', { url: 'https://x' }),
      createGuardRunnerState(),
      only('costWarning'),
      makeConvCtx({ fullText: 'just go ahead with the request' }),
    );
    expect(result.blocked).toBe(false);
    const event = result.events.find((e) => e.gate === 'cost_warning');
    expect(event?.verdict).toBe('hint');
    expect(event?.tier).toBe('ux');
    expect(event?.message).toMatch(/monetary cost/i);
  });
});

// ---------------------------------------------------------------------------
// 6. artifact_preview (ux, post-execution) — null | hint(image) | hint(PDF)
// ---------------------------------------------------------------------------

describe('artifact_preview (post-execution UX guard)', () => {
  it('returns null when result has no image/PDF artifact', () => {
    const result = guardArtifactPreview({ status: 'ok', data: { total: 42 } });
    expect(result).toBeNull();
  });

  it('returns null for non-object results (string, number, null)', () => {
    expect(guardArtifactPreview('plain text')).toBeNull();
    expect(guardArtifactPreview(42)).toBeNull();
    expect(guardArtifactPreview(null)).toBeNull();
  });

  it('emits hint when result.url is an image (png/jpg/jpeg/webp/gif/svg)', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']) {
      const result = guardArtifactPreview({ url: `https://x/foo.${ext}` });
      expect(result).not.toBeNull();
      expect(result?._gate).toBe('artifact_preview');
      expect(result?._hint).toMatch(/Show this to the user/i);
    }
  });

  it('emits hint when result has an images array', () => {
    const result = guardArtifactPreview({ images: ['https://x/a.png'] });
    expect(result).not.toBeNull();
    expect(result?._gate).toBe('artifact_preview');
  });

  it('emits hint when result.image_url is set (regardless of extension)', () => {
    const result = guardArtifactPreview({ image_url: 'https://x/no-ext' });
    expect(result).not.toBeNull();
    expect(result?._gate).toBe('artifact_preview');
  });

  it('emits hint when result.url is a PDF', () => {
    const result = guardArtifactPreview({ url: 'https://x/report.pdf' });
    expect(result).not.toBeNull();
    expect(result?._gate).toBe('artifact_preview');
  });

  it('handles URLs with query strings (image?token=...)', () => {
    const result = guardArtifactPreview({ url: 'https://x/foo.png?signed=1' });
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. stale_data (ux, post-execution) — null | hint
// ---------------------------------------------------------------------------

describe('stale_data (post-execution UX guard)', () => {
  it('returns null when tool is NOT mutating', () => {
    const result = guardStaleData({ mutating: false });
    expect(result).toBeNull();
  });

  it('returns null when tool has no mutating flag (defaults to undefined → falsy)', () => {
    const result = guardStaleData({});
    expect(result).toBeNull();
  });

  it('emits hint when tool IS mutating', () => {
    const result = guardStaleData({ mutating: true });
    expect(result).not.toBeNull();
    expect(result?._gate).toBe('stale_data');
    expect(result?._hint).toMatch(/balance snapshot is outdated/i);
  });
});
