import { describe, it, expect } from 'vitest';
import {
  runGuards,
  createGuardRunnerState,
  extractConversationText,
  DEFAULT_GUARD_CONFIG,
} from '../guards.js';
import { makeGuardView } from './_helpers/call-tool-body.js';
import type { PendingToolCall } from '../types.js';

/**
 * Regression tests for the address-scope guard.
 *
 * Failure mode being prevented: user types "what's the balance of
 * 0x40cd...3e62", LLM calls `balance_check` with no `address` arg,
 * the tool defaults to the signed-in user's wallet, and we silently
 * return the wrong wallet's data. The guard blocks the call so the
 * LLM is forced to re-issue with `address: "0x40cd..."`.
 */

const balanceCheck = makeGuardView('balance_check');
const portfolioAnalysis = makeGuardView('portfolio_analysis');
const swapQuote = makeGuardView('swap_quote');

const SIGNED_IN_USER = '0x1111111111111111111111111111111111111111111111111111111111111111';
const WATCHED = '0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62';
const ANOTHER = '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd';

function makeCall(name: string, input: Record<string, unknown>): PendingToolCall {
  return { id: 'tool_use_1', name, input };
}

function makeConvCtx(userText: string) {
  return extractConversationText([{ role: 'user', content: [{ type: 'text', text: userText }] }]);
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

  // ---------------------------------------------------------------------------
  // Day 13.5 regression — multi-turn scope (currentUserText, NOT recentUserText)
  // ---------------------------------------------------------------------------
  //
  // SPEC 37 v0.7a Phase 2 Day 13.5 / 2026-05-16. Production smoke caught
  // address_scope blocking balance_check on a "Save $10 USDC" turn that
  // followed a "Send 0.01 USDC to 0xaca29…" turn. The third-party
  // address from the prior `Send` turn lived in recentUserText's
  // 10-turn window and the guard wrongly enforced "you must target
  // 0xaca29…" against the unrelated subsequent save's balance_check
  // (which has no address argument and correctly defaults to the
  // signed-in user's wallet). Fix: address_scope now uses
  // currentUserText (last user-text entry only). These tests pin the
  // correct multi-turn semantics.
  // ---------------------------------------------------------------------------

  it('does NOT block balance_check on the current turn when prior user turn mentioned a third-party address', () => {
    // Two-turn conversation: "Send 0.01 USDC to <WATCHED>" → "Save $10 USDC".
    // The current turn ("Save $10 USDC") names no address; balance_check
    // with input:{} should default to the signed-in user and pass.
    const messages = [
      { role: 'user', content: [{ type: 'text', text: `Send 0.01 USDC to ${WATCHED}` }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'send_1',
            name: 'send_transfer',
            input: { to: WATCHED, amount: 0.01 },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', toolUseId: 'send_1', content: '{"success":true}' }],
      },
      { role: 'user', content: [{ type: 'text', text: 'Save $10 USDC' }] },
    ];
    const convCtx = extractConversationText(messages);

    // Sanity: the prior turn IS still in recentUserText (proves the
    // wider window would have picked it up — the legacy bug shape).
    expect(convCtx.recentUserText).toContain(WATCHED);
    // But currentUserText is just "Save $10 USDC" — no address.
    expect(convCtx.currentUserText).toBe('Save $10 USDC');
    expect(convCtx.currentUserText).not.toContain(WATCHED);

    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', {}),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      convCtx,
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });

  it('still blocks balance_check when the CURRENT turn mentions a third-party address', () => {
    // Sanity check the fix doesn't accidentally weaken the guard:
    // when the user this turn DOES name a third-party wallet,
    // balance_check defaulting to the signed-in user is still a bug.
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'Save $10 USDC' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Saved!' }] },
      { role: 'user', content: [{ type: 'text', text: `Now what's the balance of ${WATCHED}?` }] },
    ];
    const convCtx = extractConversationText(messages);
    expect(convCtx.currentUserText).toContain(WATCHED);

    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', {}),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      convCtx,
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('address_scope');
    expect(result.blockReason).toContain(WATCHED);
  });

  // ---------------------------------------------------------------------------
  // F7 regression — send/pay/transfer intent relaxation (2026-05-31)
  // ---------------------------------------------------------------------------
  //
  // Smoke caught the scope guard blocking a legitimate pre-send
  // self-balance check: "Send 0.5 USDC to 0xABC" → balance_check (no
  // address, = self) → the recipient address tripped address_scope and
  // the agent spewed `balance_check ✗ Error` accordions. The mentioned
  // address is a RECIPIENT on a send turn, not an inspection target, so
  // a self-scoped read is correct. The write-side guardAddressSource
  // still validates the actual send recipient.
  // ---------------------------------------------------------------------------

  it('does NOT block balance_check (no address) when the current turn is a SEND to the mentioned address', () => {
    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', {}),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`Send 0.5 USDC to ${WATCHED}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });

  it('does NOT block balance_check targeting the signed-in user during a send turn', () => {
    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', { address: SIGNED_IN_USER }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`transfer 10 USDC to ${WATCHED}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });

  it('still BLOCKS a read-intent "give me a portfolio overview of 0xABC" (no send verb)', () => {
    // "give" is intentionally NOT a send verb — this is a read that must
    // stay scope-checked.
    const result = runGuards(
      portfolioAnalysis,
      makeCall('portfolio_analysis', {}),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`Give me a portfolio overview of ${WATCHED}`),
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('address_scope');
  });

  it('handles audric host pattern: <post_write_anchor> + user prompt concatenated in one text block', () => {
    // Audric concatenates the synthetic post-write anchor with the
    // user's actual prompt into a single user text block:
    //   "<post_write_anchor>...</post_write_anchor>\n\nSave $10 USDC"
    // Anchors don't contain Sui addresses, so currentUserText
    // detection is unaffected — but pin the behaviour against future
    // regressions in either the anchor template or the regex.
    const ANCHOR =
      '<post_write_anchor>\nA write executed earlier in this session. The freshest balance_check / savings_info result in your conversation history is at turn 2…\n</post_write_anchor>';
    const messages = [
      { role: 'user', content: [{ type: 'text', text: `Send 0.01 USDC to ${WATCHED}` }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'send_1',
            name: 'send_transfer',
            input: { to: WATCHED, amount: 0.01 },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', toolUseId: 'send_1', content: '{"success":true}' }],
      },
      { role: 'user', content: [{ type: 'text', text: `${ANCHOR}\n\nSave $10 USDC` }] },
    ];
    const convCtx = extractConversationText(messages);

    // currentUserText carries the anchor + prompt — but no third-party address.
    expect(convCtx.currentUserText).toContain('Save $10 USDC');
    expect(convCtx.currentUserText).toContain('post_write_anchor');
    expect(convCtx.currentUserText).not.toContain(WATCHED);

    const result = runGuards(
      balanceCheck,
      makeCall('balance_check', {}),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      convCtx,
      undefined,
      { walletAddress: SIGNED_IN_USER },
    );

    expect(result.blocked).toBe(false);
  });
});
