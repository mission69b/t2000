import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  runGuards,
  createGuardRunnerState,
  extractConversationText,
  extractTrustedAddressesFromResult,
  DEFAULT_GUARD_CONFIG,
} from '../guards.js';
import { defineTool } from '../v2/define-tool.js';
import type { PendingToolCall } from '../orchestration.js';

// Synthetic send_transfer tool — minimal surface, just enough for the
// runGuards code path to find tool.name === 'send_transfer'.
const sendTransfer = defineTool({
  name: 'send_transfer',
  description: 'send',
  inputSchema: z.object({ to: z.string(), amount: z.number() }),
  isReadOnly: false,
  flags: { mutating: true, irreversible: true, requiresBalance: true },
  call: async () => ({ data: {} }),
});

const KNOWN = '0x231455f0e9805bdd0945981463daf0346310a7b3b04a733b011cc791feb896cd';
const TYPO = '0x231455f0e9805bdd0345981463daf0346310a7b3b04a733b011cc791feb896cd';
const SELF = '0xdeadbeef'.padEnd(66, '0');

function makeCall(input: Record<string, unknown>): PendingToolCall {
  return { id: 'tool_use_1', name: 'send_transfer', input };
}

function makeConvCtx(userText: string) {
  return extractConversationText([{ role: 'user', content: [{ type: 'text', text: userText }] }]);
}

describe('guardAddressSource (send_transfer safety guard)', () => {
  it('blocks when the address is not in any trusted source', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 10 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx('hi please send 10 usdc'),
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('address_source');
    expect(result.blockReason).toContain('Safety check failed');
  });

  it('passes when the address matches a saved contact', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 10 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx('send to my main wallet'),
      undefined,
      { contacts: [{ name: 'main', address: KNOWN }] },
    );

    expect(result.blocked).toBe(false);
  });

  it('is case-insensitive on contact match', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN.toUpperCase().replace('0X', '0x'), amount: 10 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx('send'),
      undefined,
      { contacts: [{ name: 'main', address: KNOWN }] },
    );

    expect(result.blocked).toBe(false);
  });

  it('passes when the address appears verbatim in the user message', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 10 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`please send 10 usdc to ${KNOWN} thanks`),
    );

    expect(result.blocked).toBe(false);
  });

  it('blocks when the LLM mistypes one digit (the lost-funds case)', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: TYPO, amount: 13.53 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx(`send to ${KNOWN}`),
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('address_source');
  });

  it("passes when sending to the user's own wallet (self)", () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: SELF, amount: 5 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx('send to myself'),
      undefined,
      { walletAddress: SELF },
    );

    expect(result.blocked).toBe(false);
  });

  it('passes for non-0x recipients (contact name passthrough)', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: 'mom', amount: 5 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx('send 5 to mom'),
    );

    expect(result.blocked).toBe(false);
  });

  it('does not block other tools (e.g. save_deposit)', () => {
    const otherTool = defineTool({
      name: 'save_deposit',
      description: 's',
      inputSchema: z.object({ amount: z.number() }),
      isReadOnly: false,
      flags: { mutating: true, requiresBalance: true },
      call: async () => ({ data: {} }),
    });

    const result = runGuards(
      otherTool,
      { id: 'x', name: 'save_deposit', input: { amount: 5 } },
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      makeConvCtx('save 5'),
    );

    expect(result.blocked).toBe(false);
  });

  it('drops user messages older than the 10-turn window', () => {
    // Build a transcript where KNOWN appears in turn 0 and the next 10
    // user turns are noise. Per `extractConversationText`, only the
    // last 10 user messages are considered authoritative — so a turn-0
    // address must not count as "user-provided".
    const messages = [
      { role: 'user', content: [{ type: 'text', text: `to ${KNOWN}` }] },
      ...Array.from({ length: 11 }, (_, i) => ({
        role: 'user',
        content: [{ type: 'text', text: `noise ${i}` }],
      })),
    ];

    const convCtx = extractConversationText(messages);
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 10 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      convCtx,
    );

    expect(result.blocked).toBe(true);
  });

  it('does not match addresses that only appear in assistant messages', () => {
    // An assistant message echoing an address is not a user-provided
    // source — only the user's own messages count.
    const convCtx = extractConversationText([
      { role: 'user', content: [{ type: 'text', text: 'send 10' }] },
      { role: 'assistant', content: [{ type: 'text', text: `i'll send to ${KNOWN}` }] },
    ]);

    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 10 }),
      createGuardRunnerState(),
      DEFAULT_GUARD_CONFIG,
      convCtx,
    );

    expect(result.blocked).toBe(true);
  });

  it('can be disabled via config.addressSource = false', () => {
    const result = runGuards(
      sendTransfer,
      makeCall({ to: KNOWN, amount: 10 }),
      createGuardRunnerState(),
      { ...DEFAULT_GUARD_CONFIG, addressSource: false },
      makeConvCtx('no address here'),
    );

    expect(result.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [S.121 Option C] Trusted-from-resolution tests.
//
// 4th trusted source: addresses resolved THIS SESSION via an identity-resolving
// read tool (`lookup_user`, `resolve_suins`) where the tool's input identifier
// appeared in the user's recent messages. Closes the UX gap where the LLM
// non-deterministically chose to pass the SuiNS name (which bypassed the
// guard's 0x-hex check) vs. the resolved 0x address (which the guard blocked
// because the user never typed the address themselves).
//
// Safety invariant: a hallucinated lookup (LLM resolves a handle the user
// never named) never enters the trusted set, so the original "no addresses
// from LLM memory" guarantee is preserved.
// ---------------------------------------------------------------------------

const RESOLVED = '0x7f2059fb1c395f4800809b4b97ed8e661535c8c55f89b1379b6b9d0208d2f6dc';
const HALLUCINATED = '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

describe('guardAddressSource — trustedAddresses (S.121 Option C)', () => {
  it('PASSES: lookup_user resolved a user-named handle, send to that resolved 0x', () => {
    const state = createGuardRunnerState();
    const convCtx = makeConvCtx('Send 1 USDC to @funkii');

    extractTrustedAddressesFromResult(
      'lookup_user',
      { query: '@funkii' },
      { found: true, address: RESOLVED, fullHandle: 'funkii.audric.sui' },
      convCtx.recentUserText,
      state,
    );

    expect(state.trustedAddresses.has(RESOLVED.toLowerCase())).toBe(true);

    const result = runGuards(
      sendTransfer,
      makeCall({ to: RESOLVED, amount: 1 }),
      state,
      DEFAULT_GUARD_CONFIG,
      convCtx,
    );

    expect(result.blocked).toBe(false);
  });

  it('BLOCKS: hallucinated lookup_user (LLM made up a handle the user never typed)', () => {
    const state = createGuardRunnerState();
    const convCtx = makeConvCtx('Send 1 USDC to @funkii');

    extractTrustedAddressesFromResult(
      'lookup_user',
      { query: '@bob' },
      { found: true, address: HALLUCINATED, fullHandle: 'bob.audric.sui' },
      convCtx.recentUserText,
      state,
    );

    expect(state.trustedAddresses.has(HALLUCINATED.toLowerCase())).toBe(false);

    const result = runGuards(
      sendTransfer,
      makeCall({ to: HALLUCINATED, amount: 1 }),
      state,
      DEFAULT_GUARD_CONFIG,
      convCtx,
    );

    expect(result.blocked).toBe(true);
    expect(result.blockGate).toBe('address_source');
  });

  it('PASSES: resolve_suins for a user-named .sui name, send to resolved 0x', () => {
    const state = createGuardRunnerState();
    // User text contains ".sui" → trips guardAssetIntent's `\bSUI\b` regex.
    // Pass `asset: 'USDC'` explicitly on the call (the audric prod path
    // always does this) so the test isolates the address_source guard.
    const convCtx = makeConvCtx('send 1 usdc to adeniyi.sui');

    extractTrustedAddressesFromResult(
      'resolve_suins',
      { name: 'adeniyi.sui' },
      { address: RESOLVED, name: 'adeniyi.sui' },
      convCtx.recentUserText,
      state,
    );

    expect(state.trustedAddresses.has(RESOLVED.toLowerCase())).toBe(true);

    const result = runGuards(
      sendTransfer,
      makeCall({ to: RESOLVED, amount: 1, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      convCtx,
    );

    expect(result.blocked).toBe(false);
  });

  it('BLOCKS: resolve_suins for a name the user never said (hallucinated)', () => {
    const state = createGuardRunnerState();
    const convCtx = makeConvCtx('send 1 to adeniyi.sui');

    extractTrustedAddressesFromResult(
      'resolve_suins',
      { name: 'attacker.sui' },
      { address: HALLUCINATED, name: 'attacker.sui' },
      convCtx.recentUserText,
      state,
    );

    expect(state.trustedAddresses.has(HALLUCINATED.toLowerCase())).toBe(false);

    const result = runGuards(
      sendTransfer,
      makeCall({ to: HALLUCINATED, amount: 1, asset: 'USDC' }),
      state,
      DEFAULT_GUARD_CONFIG,
      convCtx,
    );

    expect(result.blocked).toBe(true);
  });

  it('does NOT trust addresses from non-allow-listed tools (e.g. transaction_history)', () => {
    // transaction_history returns counterparty addresses for many parties —
    // trusting all of them would silently expand the trust set far beyond
    // what the user named. Only `lookup_user` and `resolve_suins` should
    // contribute to the trusted set.
    const state = createGuardRunnerState();
    const convCtx = makeConvCtx('show my history');

    extractTrustedAddressesFromResult(
      'transaction_history',
      { address: SELF },
      { items: [{ counterparty: HALLUCINATED, amount: 5 }] },
      convCtx.recentUserText,
      state,
    );

    expect(state.trustedAddresses.size).toBe(0);
  });

  it('does NOT add addresses when input identifier is absent from user text', () => {
    // Edge case: assistant text mentions the handle but user never did.
    // We only check `recentUserText` (user messages), so this should NOT
    // contribute — same invariant as the existing "assistant messages
    // don't count" test for verbatim addresses.
    const state = createGuardRunnerState();
    const convCtx = extractConversationText([
      { role: 'user', content: [{ type: 'text', text: 'send 1 usdc' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'to @funkii?' }] },
    ]);

    extractTrustedAddressesFromResult(
      'lookup_user',
      { query: '@funkii' },
      { found: true, address: RESOLVED },
      convCtx.recentUserText,
      state,
    );

    expect(state.trustedAddresses.has(RESOLVED.toLowerCase())).toBe(false);
  });

  it('PASSES: trust persists across multiple runGuards calls in the same session', () => {
    // Multi-turn: lookup_user resolved @funkii in turn 1; send_transfer
    // fires in turn 2 (or later in turn 1). Both calls share the same
    // GuardRunnerState, so the trust carries over.
    const state = createGuardRunnerState();

    const turn1Ctx = makeConvCtx('who is @funkii');
    extractTrustedAddressesFromResult(
      'lookup_user',
      { query: '@funkii' },
      { found: true, address: RESOLVED },
      turn1Ctx.recentUserText,
      state,
    );

    const turn2Ctx = makeConvCtx(`who is @funkii\nsend 1 usdc`);
    const result = runGuards(
      sendTransfer,
      makeCall({ to: RESOLVED, amount: 1 }),
      state,
      DEFAULT_GUARD_CONFIG,
      turn2Ctx,
    );

    expect(result.blocked).toBe(false);
  });

  it('handles case-insensitive handle matching (user types @Funkii, lookup uses @funkii)', () => {
    const state = createGuardRunnerState();
    const convCtx = makeConvCtx('Send to @Funkii');

    extractTrustedAddressesFromResult(
      'lookup_user',
      { query: '@funkii' },
      { found: true, address: RESOLVED },
      convCtx.recentUserText,
      state,
    );

    expect(state.trustedAddresses.has(RESOLVED.toLowerCase())).toBe(true);
  });

  it('does NOT trust addresses returned for a 0x-shaped input (verbatim path handles those)', () => {
    // If the LLM passes an existing 0x address to lookup_user (reverse
    // lookup), we shouldn't promote OTHER addresses in the result to
    // trusted just because the 0x input echoes user text — that path is
    // already covered by the verbatim check.
    const state = createGuardRunnerState();
    const convCtx = makeConvCtx(`look up ${SELF}`);

    extractTrustedAddressesFromResult(
      'lookup_user',
      { query: SELF },
      { found: true, address: HALLUCINATED },
      convCtx.recentUserText,
      state,
    );

    expect(state.trustedAddresses.has(HALLUCINATED.toLowerCase())).toBe(false);
  });
});
