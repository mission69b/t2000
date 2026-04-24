import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  runGuards,
  createGuardRunnerState,
  extractConversationText,
  DEFAULT_GUARD_CONFIG,
} from '../guards.js';
import { buildTool } from '../tool.js';
import type { PendingToolCall } from '../orchestration.js';

/**
 * Regression tests for the asset-intent guard.
 *
 * Failure mode being prevented: the user asks "send my SUI to 0x...",
 * the LLM calls send_transfer with no `asset` field, the tool defaults
 * to USDC, and the wrong token is shipped. We block the call so the
 * LLM is forced to re-issue with `asset: "SUI"`.
 */

const sendTransfer = buildTool({
  name: 'send_transfer',
  description: 'send',
  inputSchema: z.object({
    to: z.string(),
    amount: z.number(),
    asset: z.string().optional(),
  }),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: false,
  flags: { mutating: true, irreversible: true, requiresBalance: true },
  call: async () => ({ data: {} }),
});

const KNOWN = '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd';

function makeCall(input: Record<string, unknown>): PendingToolCall {
  return { id: 'tool_use_1', name: 'send_transfer', input };
}

function makeConvCtx(userText: string) {
  return extractConversationText([
    { role: 'user', content: [{ type: 'text', text: userText }] },
  ]);
}

describe('guardAssetIntent (send_transfer asset safety)', () => {
  it('blocks when user mentions SUI but call has no asset (defaults to USDC)', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 1.0561 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`Swap $1 to SUI and send it to ${KNOWN}`),
      undefined,
      // satisfy address-source guard so we isolate the asset check
      { contacts: [{ name: 'wallet', address: KNOWN }] },
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('asset_intent');
    expect(result.blockReason).toContain('SUI');
  });

  it('blocks when user mentions USDT but call has no asset', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 5 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`send 5 USDT to ${KNOWN}`),
      undefined,
      { contacts: [{ name: 'wallet', address: KNOWN }] },
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('asset_intent');
  });

  it('passes when user explicitly says USDC', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 1 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`send 1 USDC to ${KNOWN}`),
      undefined,
      { contacts: [{ name: 'wallet', address: KNOWN }] },
    );

    expect(result.blocked).toBe(false);
  });

  it('passes when call sets asset=SUI explicitly', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 1.0561, asset: 'SUI' }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`Swap $1 to SUI and send it to ${KNOWN}`),
      undefined,
      { contacts: [{ name: 'wallet', address: KNOWN }] },
    );

    expect(result.blocked).toBe(false);
  });

  it('passes when call sets asset=USDC explicitly even if user mentioned SUI', () => {
    // Explicit USDC means the LLM committed to a token — the user can
    // still cancel at the permission card. We only block the silent
    // default.
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 1, asset: 'USDC' }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`I'm comparing SUI prices, but send 1 USDC to ${KNOWN}`),
      undefined,
      { contacts: [{ name: 'wallet', address: KNOWN }] },
    );

    expect(result.blocked).toBe(false);
  });

  it('does not match token names that appear inside other words', () => {
    // "result" contains "sul" but not the standalone token "SUI"; the
    // word boundary should keep this as a false positive.
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 1 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`pursuit suit suite for sushi`),
      undefined,
      { contacts: [{ name: 'wallet', address: KNOWN }] },
    );

    expect(result.blocked).toBe(false);
  });

  it('blocks lowercase token mentions', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 1 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`send my sui to ${KNOWN}`),
      undefined,
      { contacts: [{ name: 'wallet', address: KNOWN }] },
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('asset_intent');
  });

  it('does not run on non-send_transfer tools', () => {
    const otherTool = buildTool({
      name: 'save_deposit',
      description: 's',
      inputSchema: z.object({ amount: z.number() }),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: false,
      flags: { mutating: true, requiresBalance: true },
      call: async () => ({ data: {} }),
    });

    const result = runGuards(
      otherTool,
      { id: 'x', name: 'save_deposit', input: { amount: 5 } },
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx('save 5 SUI worth'),
    );

    // save_deposit also has its own preflight that would reject SUI; we
    // only assert asset_intent did not fire here.
    expect(result.blockGate).not.toBe('asset_intent');
  });

  it('can be disabled via config.assetIntent = false', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 1.0561 }),
      createGuardRunnerState(),
      { ...DEFAULT_GUARD_CONFIG, assetIntent: false },
      makeConvCtx(`Swap $1 to SUI and send it to ${KNOWN}`),
      undefined,
      { contacts: [{ name: 'wallet', address: KNOWN }] },
    );

    expect(result.blocked).toBe(false);
  });
});
