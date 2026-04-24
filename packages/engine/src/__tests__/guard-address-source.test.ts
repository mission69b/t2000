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

// Synthetic send_transfer tool — minimal surface, just enough for the
// runGuards code path to find tool.name === 'send_transfer'.
const sendTransfer = buildTool({
  name: 'send_transfer',
  description: 'send',
  inputSchema: z.object({ to: z.string(), amount: z.number() }),
  jsonSchema: { type: 'object', properties: {} },
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
  return extractConversationText([
    { role: 'user', content: [{ type: 'text', text: userText }] },
  ]);
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

  it('passes when sending to the user\'s own wallet (self)', () => {
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
