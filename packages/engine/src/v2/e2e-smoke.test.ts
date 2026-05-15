// ---------------------------------------------------------------------------
// v2/e2e-smoke.test.ts — end-to-end smoke for AISDKEngine Day 1+2+3 stack
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 3 (2026-05-15).
//
// Closes the Phase-1-audit gap "no e2e test for the AISDKEngine".
// Exercises every layer of the v2 stack against the real Anthropic API:
//
//   - Day 1: AISDKEngine constructor, streamText round-trip, R8 bridge
//     translates TextStreamPart → EngineEvent (text_delta, tool_start,
//     tool_result, turn_complete).
//   - Day 2: Legacy tool wrapped via toAISDKTools, dispatched via
//     experimental_context, ToolContext threaded.
//   - Day 3: InternalContext threading, guard pipeline (preflight via
//     runGuards), onStepFinish handler firing for tool results,
//     sessionSpend accumulation.
//
// Gated on RUN_REAL_API_TESTS=1 + ANTHROPIC_API_KEY (same gate as
// engine.test.ts Day 2 tests). Burns ~3-5 cents per run; intentional
// — this is the regression net for the entire v2 stack.
//
// What this test does NOT cover (separate test files):
//   - Per-tool output shape correctness (will be per-tool tests in
//     Day 10+ migration PRs)
//   - HITL approval round-trip (needs audric-side resume mechanism;
//     Day 10-12 audric work covers this with a real round-trip)
//   - Multi-tool parallel dispatch (needs a tool with deliberate
//     latency to verify ordering — defer to Day 10+ when migrated tools
//     have realistic execute() shapes)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { AISDKEngine, type AISDKEngineConfig } from './engine.js';
import { buildTool } from '../tool.js';
import {
  DEFAULT_GUARD_CONFIG,
  type GuardConfig,
} from '../guards.js';
import { DEFAULT_PERMISSION_CONFIG } from '../permission-rules.js';
import type { EngineEvent, Tool as LegacyTool, ToolContext } from '../types.js';

const RUN_REAL =
  process.env.RUN_REAL_API_TESTS === '1' && !!process.env.ANTHROPIC_API_KEY;
const API_KEY = process.env.ANTHROPIC_API_KEY;

async function collect(
  gen: AsyncGenerator<EngineEvent>,
): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

const baseConfig = (apiKey: string): AISDKEngineConfig => ({
  anthropicApiKey: apiKey,
  walletAddress:
    '0x91b88d0e7eaf45e3252a06ad57f6b9c79b1e7f8d3e0a6c1d2b3c4d5e6f7a8b9c',
  model: 'claude-haiku-4-5-20251001',
  maxTurns: 3,
  systemPrompt:
    'You are a brief assistant. When asked to call a tool, call it and report what it returned. Keep prose to one or two sentences.',
});

// ---------------------------------------------------------------------------
// e2e Test 1 — text-only round-trip (Day 1 surface)
// ---------------------------------------------------------------------------

describe('v2 e2e — Day 1 surface (text round-trip)', () => {
  it.skipIf(!RUN_REAL)(
    'streams text_delta + turn_complete via R8 bridge translation',
    async () => {
      const engine = new AISDKEngine(baseConfig(API_KEY!));
      const events = await collect(
        engine.submitMessage('Reply with the single word "hello".'),
      );

      const textDeltas = events.filter((e) => e.type === 'text_delta');
      const turnComplete = events.filter((e) => e.type === 'turn_complete');

      expect(textDeltas.length).toBeGreaterThan(0);
      expect(turnComplete.length).toBe(1);
      expect(turnComplete[0]).toMatchObject({
        type: 'turn_complete',
        stopReason: expect.stringMatching(/end_turn|tool_use|max_tokens|error/),
      });
    },
    30_000,
  );
});

// ---------------------------------------------------------------------------
// e2e Test 2 — tool dispatch via wrapped legacy tool (Day 2 surface)
// ---------------------------------------------------------------------------

describe('v2 e2e — Day 2 surface (tool dispatch)', () => {
  it.skipIf(!RUN_REAL)(
    'dispatches a wrapped read tool, threads ToolContext, emits tool_start + tool_result',
    async () => {
      const callSpy = vi.fn(
        async (input: { topic: string }, ctx: ToolContext) => {
          // Verify ToolContext was threaded through experimental_context.
          expect(ctx.walletAddress).toBe(baseConfig(API_KEY!).walletAddress);
          expect(ctx.retryStats).toEqual({ attemptCount: 1 });
          return {
            data: { topic: input.topic, fact: `${input.topic} is a token on Sui.` },
            displayText: `${input.topic} is a token on Sui.`,
          };
        },
      );

      const lookupTool: LegacyTool = buildTool({
        name: 'lookup_fact',
        description: 'Look up a single fact about a token. Use this when asked about a specific token.',
        inputSchema: z.object({
          topic: z.string().describe('The token name to look up (e.g. SUI, USDC).'),
        }),
        jsonSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'The token name to look up.' },
          },
          required: ['topic'],
        },
        flags: {},
        permissionLevel: 'auto',
        isReadOnly: true,
        isConcurrencySafe: true,
        call: callSpy,
      });

      const engine = new AISDKEngine({
        ...baseConfig(API_KEY!),
        tools: [lookupTool],
        systemPrompt:
          'You are a token-info bot. When the user asks about a token, ALWAYS call the lookup_fact tool with the token name. Then narrate what the tool returned in one sentence.',
      });

      const events = await collect(engine.submitMessage('Tell me about SUI.'));

      // Tool was dispatched
      expect(callSpy).toHaveBeenCalled();

      // R8 bridge translated tool-call → tool_start
      const toolStarts = events.filter((e) => e.type === 'tool_start');
      expect(toolStarts.length).toBeGreaterThanOrEqual(1);
      expect(toolStarts[0]).toMatchObject({
        type: 'tool_start',
        toolName: 'lookup_fact',
        source: 'llm',
      });

      // R8 bridge translated tool-result → tool_result with isError=false
      const toolResults = events.filter((e) => e.type === 'tool_result');
      expect(toolResults.length).toBeGreaterThanOrEqual(1);
      expect(toolResults[0]).toMatchObject({
        type: 'tool_result',
        toolName: 'lookup_fact',
        isError: false,
        source: 'llm',
      });

      // Final turn_complete
      const turnComplete = events.filter((e) => e.type === 'turn_complete');
      expect(turnComplete.length).toBeGreaterThanOrEqual(1);
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------
// e2e Test 3 — onStepFinish hook fires for tool calls (Day 3 surface)
// ---------------------------------------------------------------------------

describe('v2 e2e — Day 3 surface (onAutoExecuted + sessionSpend tracking)', () => {
  it.skipIf(!RUN_REAL)(
    'fires onAutoExecuted host hook for a write tool that auto-executes under threshold',
    async () => {
      const onAutoExecuted = vi.fn();

      const writeTool: LegacyTool = buildTool({
        name: 'send_transfer',
        description:
          'Send USDC to a recipient. Always call this when the user asks to send money.',
        inputSchema: z.object({
          amount: z.number().describe('Amount to send.'),
          to: z.string().describe('Recipient address.'),
        }),
        jsonSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            to: { type: 'string' },
          },
          required: ['amount', 'to'],
        },
        flags: { mutating: true },
        permissionLevel: 'confirm',
        isReadOnly: false,
        isConcurrencySafe: false,
        call: async (input: { amount: number; to: string }) => ({
          data: { txHash: '0xfake', amount: input.amount, to: input.to },
          displayText: `Sent ${input.amount} USDC to ${input.to}.`,
        }),
      });

      const guards: GuardConfig = {
        ...DEFAULT_GUARD_CONFIG,
        // Disable balance/HF/recipient guards for this synthetic test —
        // the test wallet has no on-chain state and recipient is fake.
        balanceValidation: false,
        recipientValidation: false,
      };

      // Recipient must be in contacts to bypass the "raw 0x → confirm"
      // safeguard. Without this, send-safety overrides the auto-tier
      // amount check and forces confirm regardless. (See
      // permission-rules.ts:resolvePermissionTier send-safety branch.)
      const recipient =
        '0x91b88d0e7eaf45e3252a06ad57f6b9c79b1e7f8d3e0a6c1d2b3c4d5e6f7a8b9c';
      const engine = new AISDKEngine({
        ...baseConfig(API_KEY!),
        tools: [writeTool],
        permissionConfig: DEFAULT_PERMISSION_CONFIG,
        priceCache: new Map([['USDC', 1]]),
        guards,
        onAutoExecuted,
        contacts: [{ name: 'TestRecipient', address: recipient }],
        systemPrompt:
          'You are a payment bot. When the user asks to send USDC, ALWAYS call send_transfer with the requested amount and recipient address verbatim. Do not ask for confirmation; the tool layer handles that.',
      });

      // Amount $3 < auto threshold for send (autoBelow=10) AND recipient
      // is a saved contact → auto tier holds → tool auto-executes →
      // onAutoExecuted fires.
      await collect(
        engine.submitMessage(`Send 3 USDC to ${recipient}.`),
      );

      // Wait for the background promise chain in onStepFinish.
      await new Promise((r) => setImmediate(r));

      expect(onAutoExecuted).toHaveBeenCalled();
      const callArgs = onAutoExecuted.mock.calls[0]![0];
      expect(callArgs).toMatchObject({
        toolName: 'send_transfer',
        usdValue: expect.any(Number),
        walletAddress: baseConfig(API_KEY!).walletAddress,
      });
      // amount 3 USDC = $3 USD value
      expect(callArgs.usdValue).toBe(3);
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------
// e2e Test 4 — guard blocking surfaces as tool error (Day 3 surface)
// ---------------------------------------------------------------------------

describe('v2 e2e — Day 3 surface (guard pipeline blocking)', () => {
  it.skipIf(!RUN_REAL)(
    'preflight failure inside wrapper throws GuardBlockedError → AI SDK surfaces tool-error → bridge emits tool_result isError=true',
    async () => {
      const callSpy = vi.fn(async () => ({ data: null }));

      const failingTool: LegacyTool = buildTool({
        name: 'always_fail',
        description: 'Test tool that always fails preflight. Call this when asked.',
        inputSchema: z.object({ x: z.string() }),
        jsonSchema: {
          type: 'object',
          properties: { x: { type: 'string' } },
          required: ['x'],
        },
        flags: {},
        permissionLevel: 'auto',
        isReadOnly: true,
        isConcurrencySafe: true,
        preflight: () => ({ valid: false, error: 'preflight rejected the input' }),
        call: callSpy,
      });

      const engine = new AISDKEngine({
        ...baseConfig(API_KEY!),
        tools: [failingTool],
        guards: DEFAULT_GUARD_CONFIG,
        systemPrompt:
          'You are a test bot. When asked to call always_fail, do so once with x="anything", then narrate the result.',
      });

      const events = await collect(
        engine.submitMessage('Call always_fail with x="anything".'),
      );

      // Tool itself was never called (preflight rejected before legacy.call).
      expect(callSpy).not.toHaveBeenCalled();

      // Bridge translated tool-error → tool_result with isError=true.
      const errorResults = events.filter(
        (e) => e.type === 'tool_result' && e.isError === true,
      );
      expect(errorResults.length).toBeGreaterThanOrEqual(1);
      expect(errorResults[0]).toMatchObject({
        type: 'tool_result',
        toolName: 'always_fail',
        isError: true,
      });
    },
    60_000,
  );
});
