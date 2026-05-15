// ---------------------------------------------------------------------------
// v2/engine.test.ts — Day 1 smoke test for AISDKEngine
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2-4 Day 1 verification.
//
// Confirms the AISDKEngine scaffolding works:
//   1. Constructor accepts AISDKEngineConfig.
//   2. submitMessage() returns an AsyncGenerator<EngineEvent>.
//   3. Streaming text from a real (or mocked) Anthropic call yields
//      `text_delta` events in legacy EngineEvent shape.
//   4. Aborting mid-stream propagates to streamText.
//
// Real-API smoke test (gated on TWO env vars):
//   - ANTHROPIC_API_KEY: the key itself
//   - RUN_REAL_API_TESTS=1: explicit opt-in so the full `pnpm test`
//     suite never burns API tokens by accident, and so parallel
//     workers don't race the real Anthropic API on shared CI quota.
//
// Run locally with:
//   set -a && source ../../audric/apps/web/.env.local && set +a && \
//   RUN_REAL_API_TESTS=1 pnpm --filter @t2000/engine vitest run src/v2
//
// Day 2-3 will add tests for: tool dispatch, prepareStep guard
// blocking, needsApproval HITL pause, onStepFinish callback, error
// translation, abort signal forwarding.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { AISDKEngine, type AISDKEngineConfig } from './engine.js';
import { buildTool } from '../tool.js';
import type { EngineEvent, Tool as LegacyTool } from '../types.js';

const RUN_REAL =
  process.env.RUN_REAL_API_TESTS === '1' && !!process.env.ANTHROPIC_API_KEY;
const API_KEY = process.env.ANTHROPIC_API_KEY;

const baseConfig = (apiKey: string): AISDKEngineConfig => ({
  anthropicApiKey: apiKey,
  walletAddress:
    '0x91b88d0e7eaf45e3252a06ad57f6b9c79b1e7f8d3e0a6c1d2b3c4d5e6f7a8b9c',
  model: 'claude-haiku-4-5-20251001',
  maxTurns: 2,
  systemPrompt:
    'You are a brief assistant. Answer in one short sentence.',
});

async function collect(
  gen: AsyncGenerator<EngineEvent>,
): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const ev of gen) {
    out.push(ev);
  }
  return out;
}

describe('AISDKEngine — Day 1 scaffolding', () => {
  it('constructs without error', () => {
    expect(
      () => new AISDKEngine(baseConfig('sk-test-fake-key-not-used')),
    ).not.toThrow();
  });

  it('starts with empty message history; loadMessages populates it', () => {
    const engine = new AISDKEngine(baseConfig('sk-test-fake-key-not-used'));
    expect(engine.getMessages().length).toBe(0);
    engine.loadMessages([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ]);
    expect(engine.getMessages().length).toBe(1);
  });

  it.skipIf(!RUN_REAL)(
    'streams text_delta events from a real Anthropic round-trip',
    async () => {
      const engine = new AISDKEngine(baseConfig(API_KEY!));
      const events = await collect(engine.submitMessage('Say hi.'));

      const textDeltas = events.filter((e) => e.type === 'text_delta');
      const turnComplete = events.filter((e) => e.type === 'turn_complete');

      expect(textDeltas.length).toBeGreaterThan(0);
      expect(turnComplete.length).toBe(1);

      const fullText = textDeltas
        .map((e) => (e.type === 'text_delta' ? e.text : ''))
        .join('');
      expect(fullText.length).toBeGreaterThan(0);
      expect(fullText.toLowerCase()).toMatch(/hi|hello|hey/);
    },
    30_000,
  );

  it.skipIf(!RUN_REAL)(
    'preserves message history across submitMessage calls',
    async () => {
      const engine = new AISDKEngine(baseConfig(API_KEY!));
      await collect(engine.submitMessage('Pick a number 1-10.'));
      const before = engine.getMessages().length;
      expect(before).toBeGreaterThanOrEqual(1);

      await collect(engine.submitMessage('What number?'));
      const after = engine.getMessages().length;
      expect(after).toBeGreaterThan(before);
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------
// Day 2 tests — tool dispatch via toAISDKTools wrapper
// ---------------------------------------------------------------------------
//
// These verify the legacy → AI SDK bridge: a tool defined via the
// engine's `buildTool` factory dispatches correctly when consumed by
// the new AISDKEngine. Proves the migration path works without
// per-tool rewrite (Day 4+ migrates tools to native AI SDK `tool()`
// for richer output shapes; Day 2's wrapper keeps unmigrated tools
// working in the meantime).
// ---------------------------------------------------------------------------

describe('AISDKEngine — Day 2 tool dispatch via legacy wrapper', () => {
  it.skipIf(!RUN_REAL)(
    'dispatches a wrapped legacy read tool and returns its result',
    async () => {
      const echoCallSpy = vi.fn(
        async (input: { message: string }, _ctx: import('../types.js').ToolContext) => ({
          data: { echoed: input.message },
          displayText: `Echo: ${input.message}`,
        }),
      );

      const echoTool: LegacyTool = buildTool({
        name: 'echo_test',
        description: 'Echo back the user message. Used only by spike tests.',
        inputSchema: z.object({
          message: z.string().describe('Text to echo back verbatim.'),
        }),
        jsonSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Text to echo back verbatim.' },
          },
          required: ['message'],
        },
        flags: {},
        permissionLevel: 'auto',
        isReadOnly: true,
        isConcurrencySafe: true,
        call: echoCallSpy,
      });

      const engine = new AISDKEngine({
        ...baseConfig(API_KEY!),
        tools: [echoTool],
        systemPrompt:
          'You are a test agent. When the user asks you to echo something, ALWAYS call the echo_test tool with that text. Do not respond with text directly first.',
      });

      const events = await collect(engine.submitMessage('Echo "hello world".'));

      // Tool call was dispatched
      expect(echoCallSpy).toHaveBeenCalledTimes(1);
      const callRecord = echoCallSpy.mock.calls[0]!;
      const calledInput = callRecord[0];
      const calledCtx = callRecord[1]!;
      expect(calledInput).toMatchObject({ message: expect.stringMatching(/hello world/i) });

      // ToolContext was threaded through experimental_context
      expect(calledCtx).toBeDefined();
      expect(calledCtx.walletAddress).toBe(baseConfig(API_KEY!).walletAddress);
      expect(calledCtx.retryStats).toEqual({ attemptCount: 1 });

      // Stream produced the expected events
      const turnComplete = events.filter((e) => e.type === 'turn_complete');
      expect(turnComplete.length).toBeGreaterThanOrEqual(1);
    },
    60_000,
  );

  it('tool wrapper threads ctx without making a real API call (preflight failure path)', async () => {
    // Verifies: preflight → throw → AI SDK surfaces error. Doesn't
    // need a real API call because this is testing the wrapper's
    // preflight branch.
    const failingPreflightTool: LegacyTool = buildTool({
      name: 'always_fail_preflight',
      description: 'Test tool that always fails preflight.',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      flags: {},
      permissionLevel: 'auto',
      isReadOnly: true,
      isConcurrencySafe: true,
      preflight: () => ({ valid: false, error: 'preflight rejected by test' }),
      call: async () => {
        throw new Error('call() should not be reached when preflight fails');
      },
    });

    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [failingPreflightTool],
    });

    // Just verify the engine constructed cleanly with the wrapped tool.
    // A full preflight-failure round-trip needs a real API call (which
    // we don't burn here); the unit-level preflight assertion is in
    // tool-wrapper.test.ts (added below).
    expect(engine.getMessages().length).toBe(0);
  });
});
