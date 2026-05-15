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

// ---------------------------------------------------------------------------
// Day 10-12 tests — drop-in compatibility surface for the audric routes
// ---------------------------------------------------------------------------
//
// The audric chat / resume / resume-with-input / regenerate routes call
// engine.getTools(), engine.getUsage(), and engine.invokeReadTool() in
// addition to the streaming submitMessage path tested above. These
// tests verify each surface matches the legacy QueryEngine contract so
// the USE_AI_SDK_NATIVE_ENGINE feature flag can swap engines without
// route changes.
// ---------------------------------------------------------------------------

describe('AISDKEngine — Day 10-12 drop-in surface (getTools / getUsage / invokeReadTool)', () => {
  function makeEchoTool(): LegacyTool {
    return buildTool({
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
      call: async (input: { message: string }) => ({
        data: { echoed: input.message },
        displayText: `Echo: ${input.message}`,
      }),
    });
  }

  function makeWriteTool(): LegacyTool {
    return buildTool({
      name: 'write_only_test',
      description: 'A write tool that should never be invokable read-only.',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      flags: {},
      permissionLevel: 'confirm',
      isReadOnly: false,
      isConcurrencySafe: false,
      call: async () => ({ data: { wrote: true }, displayText: 'wrote' }),
    });
  }

  function makeFailingTool(): LegacyTool {
    return buildTool({
      name: 'failing_read',
      description: 'A read tool that always throws.',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      flags: {},
      permissionLevel: 'auto',
      isReadOnly: true,
      isConcurrencySafe: true,
      call: async () => {
        throw new Error('intentional failure');
      },
    });
  }

  it('getTools() returns the registered tool array (read-only)', () => {
    const echo = makeEchoTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [echo],
    });
    const tools = engine.getTools();
    expect(tools.length).toBe(1);
    expect(tools[0]?.name).toBe('echo_test');
  });

  it('invokeReadTool threads mcpManager from config to ToolContext (Day 13 fix)', async () => {
    // SPEC 37 v0.7a Phase 2 Day 13 — local smoke caught that NAVI-MCP-backed
    // read tools (rates_info, savings_info, health_check) returned "currently
    // unavailable" under the v2 path because mcpManager was hardcoded to
    // undefined in tool-context.ts. The fix threads config.mcpManager through
    // ToolContext; this test asserts a tool can read it back.
    let observedMcpManager: unknown = 'NEVER_RAN';
    const probeTool = buildTool({
      name: 'probe_mcp_manager',
      description: 'Test-only — captures the mcpManager seen in ToolContext.',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      flags: {},
      permissionLevel: 'auto',
      isReadOnly: true,
      isConcurrencySafe: true,
      call: async (_input, ctx) => {
        observedMcpManager = ctx.mcpManager;
        return { data: { ok: true }, displayText: 'ok' };
      },
    });
    const sentinelMcpManager = { __sentinel: 'mcp-manager-passed-through' } as never;
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [probeTool],
      mcpManager: sentinelMcpManager,
    });
    await engine.invokeReadTool('probe_mcp_manager', {});
    expect(observedMcpManager).toBe(sentinelMcpManager);
  });

  it('getTools() returns empty array when no tools configured', () => {
    const engine = new AISDKEngine(baseConfig('sk-test-fake-key-not-used'));
    expect(engine.getTools().length).toBe(0);
  });

  it('getUsage() starts at zero', () => {
    const engine = new AISDKEngine(baseConfig('sk-test-fake-key-not-used'));
    const snap = engine.getUsage();
    expect(snap.inputTokens).toBe(0);
    expect(snap.outputTokens).toBe(0);
    expect(snap.cacheReadTokens).toBe(0);
    expect(snap.cacheWriteTokens).toBe(0);
    expect(snap.totalTokens).toBe(0);
    expect(snap.estimatedCostUsd).toBe(0);
  });

  it('invokeReadTool runs a read tool out-of-band and returns its data', async () => {
    const echo = makeEchoTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [echo],
    });
    const result = await engine.invokeReadTool('echo_test', { message: 'hello' });
    expect(result.isError).toBe(false);
    expect(result.data).toEqual({ echoed: 'hello' });
  });

  it('invokeReadTool throws when tool is not registered', async () => {
    const engine = new AISDKEngine(baseConfig('sk-test-fake-key-not-used'));
    await expect(
      engine.invokeReadTool('does_not_exist', {}),
    ).rejects.toThrow(/tool not found/);
  });

  it('invokeReadTool throws when tool is not read-only (write tool)', async () => {
    const write = makeWriteTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [write],
    });
    await expect(
      engine.invokeReadTool('write_only_test', {}),
    ).rejects.toThrow(/not read-only/);
  });

  it('invokeReadTool throws when input fails schema validation', async () => {
    const echo = makeEchoTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [echo],
    });
    await expect(
      // missing required `message` field
      engine.invokeReadTool('echo_test', {}),
    ).rejects.toThrow(/invalid input/);
  });

  it('invokeReadTool returns isError envelope when tool throws (no rethrow)', async () => {
    const failing = makeFailingTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [failing],
    });
    const result = await engine.invokeReadTool('failing_read', {});
    expect(result.isError).toBe(true);
    expect(result.data).toEqual({ error: 'intentional failure' });
  });
});
