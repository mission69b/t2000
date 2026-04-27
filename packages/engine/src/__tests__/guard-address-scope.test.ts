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
 * Regression tests for the address-scope guard.
 *
 * Failure mode being prevented: user types "what's the balance of
 * 0x40cd...3e62", LLM calls `balance_check` with no `address` arg,
 * the tool defaults to the signed-in user's wallet, and we silently
 * return the wrong wallet's data. The guard blocks the call so the
 * LLM is forced to re-issue with `address: "0x40cd..."`.
 */

const balanceCheck = buildTool({
  name: 'balance_check',
  description: 'check balance',
  inputSchema: z.object({
    address: z.string().optional(),
  }),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  call: async () => ({ data: {} }),
});

const portfolioAnalysis = buildTool({
  name: 'portfolio_analysis',
  description: 'portfolio',
  inputSchema: z.object({
    address: z.string().optional(),
  }),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  call: async () => ({ data: {} }),
});

const swapQuote = buildTool({
  name: 'swap_quote',
  description: 'swap quote',
  inputSchema: z.object({
    from: z.string(),
    to: z.string(),
    amount: z.number(),
  }),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  call: async () => ({ data: {} }),
});

const SIGNED_IN_USER = '0x1111111111111111111111111111111111111111111111111111111111111111';
const WATCHED = '0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62';
const ANOTHER = '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd';

function makeCall(name: string, input: Record<string, unknown>): PendingToolCall {
  return { id: 'tool_use_1', name, input };
}

function makeConvCtx(userText: string) {
  return extractConversationText([
    { role: 'user', content: [{ type: 'text', text: userText }] },
  ]);
}

describe('guardAddressScope (read-tool address safety)', () => {
  it('blocks balance_check with no address when user names a third-party wallet', () => {
    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', {}),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`what's the balance of ${WATCHED}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('address_scope');
    expect(result.blockReason).toContain(WATCHED);
    expect(result.blockReason).toContain('balance_check');
  });

  it('blocks portfolio_analysis when call targets the signed-in user but the user named someone else', () => {
    const result = runGuards(
      portfolioAnalysis,
      makeCall('portfolio_analysis', { address: SIGNED_IN_USER }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`Give me a full portfolio overview of ${WATCHED}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('address_scope');
    expect(result.blockReason).toContain(WATCHED);
  });

  it('passes when call already targets the user-mentioned third-party address', () => {
    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', { address: WATCHED }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`what's the balance of ${WATCHED}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });

  it('passes balance_check with no address when no third-party address is mentioned', () => {
    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', {}),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`what's my balance`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });

  it('passes when user mentions their OWN wallet address (not a third party)', () => {
    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', {}),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`check ${SIGNED_IN_USER}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });

  it('does not fire on read tools that do not accept an address parameter', () => {
    const result = runGuards(
      swapQuote,
      makeCall('swap_quote', { from: 'USDC', to: 'SUI', amount: 1 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`quote 1 USDC to SUI; also check ${WATCHED}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });

  it('passes when call targets one of multiple mentioned third-party addresses', () => {
    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', { address: ANOTHER }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`compare ${WATCHED} and ${ANOTHER}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });
});
