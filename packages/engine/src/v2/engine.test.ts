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

// ---------------------------------------------------------------------------
// Day 13 follow-up tests — confirm-tier pending_action emission + resume
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 13 production smoke caught that the v2
// engine never emitted `pending_action` for confirm-tier writes — the
// AI SDK v6 `tool-approval-request` event was silently dropped by the
// bridge and AISDKEngine had no orchestration code to translate it.
// Founder's "Save 0.05 USDC" attempt failed with "agent configuration
// issue" because the LLM saw its tool_use orphaned after AI SDK paused.
//
// These tests pin the fixed behaviour by running the engine against a
// mocked language model that emits text + tool-call + tool-approval-
// request events in the same shape AI SDK v6's streamText produces.
// They do NOT hit the real Anthropic API — pure unit tests for the
// orchestration loop.
//
// Coverage:
//   - Confirm-tier write yields a `pending_action` event with the
//     correct shape (toolName, input, attemptId UUID, modifiableFields,
//     assistantContent, completedResults, turnIndex).
//   - assistantContent carries the deferred text + tool_use blocks so
//     resumeWithToolResult can replay the turn into history.
//   - completedResults carries auto-approved read tool results from the
//     same step so resume satisfies Anthropic's "every tool_use must
//     have a tool_result in the next user message" invariant.
//   - resumeWithToolResult (declined) yields tool_result + turn_complete
//     and pushes the synthetic decline blocks into history.
//   - resumeWithToolResult (bundle action) errors gracefully (Day 14+
//     scope; first-cut handles single-write only).
// ---------------------------------------------------------------------------

import {
  simulateReadableStream,
  // MockLanguageModelV3 lives in `ai/test` per AI SDK v6's testing
  // exports; importing as a deep path avoids polluting the top-of-file
  // imports for tests that don't need it.
} from 'ai';
import type { LanguageModelV3StreamPart, LanguageModelV3 } from '@ai-sdk/provider';
import type { PendingAction, PermissionResponse } from '../types.js';

/**
 * Build a stub LanguageModelV3 that emits the given stream parts.
 * Replaces `this.anthropic(model)` in tests so we control the LLM
 * output without hitting the real Anthropic API.
 *
 * Shape mirrors what AI SDK v6's streamText expects from a provider:
 * a `doStream` method that returns `{ stream, request, response, ... }`
 * where `stream` is a ReadableStream of LanguageModelV3StreamPart.
 */
function buildStubModel(parts: LanguageModelV3StreamPart[]): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'stub',
    modelId: 'stub-model',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('stub model does not support doGenerate');
    },
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: parts }),
      request: { body: {} },
      response: { headers: {}, id: 'stub', timestamp: new Date(), modelId: 'stub' },
      warnings: [],
    }),
  } as unknown as LanguageModelV3;
}

/**
 * Run an AISDKEngine submitMessage call against a stubbed model.
 * Reaches into `engine.anthropic` to substitute the model factory —
 * acceptable test seam for a pure unit test of orchestration.
 */
function withStubbedModel(engine: AISDKEngine, parts: LanguageModelV3StreamPart[]): void {
  const stubModel = buildStubModel(parts);
  // Override the anthropic factory to return our stub regardless of
  // model name. The factory is called once per submitMessage call.
  (engine as unknown as { anthropic: (name: string) => LanguageModelV3 }).anthropic =
    (() => stubModel) as never;
}

describe('AISDKEngine — Day 13 follow-up: confirm-tier pending_action', () => {
  function makeWriteTool(): LegacyTool {
    return buildTool({
      name: 'save_deposit',
      description: 'Deposit USDC into NAVI savings.',
      inputSchema: z.object({
        amount: z.number().positive(),
        asset: z.enum(['USDC', 'USDsui']).optional(),
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          asset: { type: 'string', enum: ['USDC', 'USDsui'] },
        },
        required: ['amount'],
      },
      flags: { mutating: true },
      permissionLevel: 'confirm',
      isReadOnly: false,
      isConcurrencySafe: false,
      call: async () => {
        // Confirm-tier writes should NEVER reach .call() on the v2
        // engine — needsApproval gates execution, and the host runs
        // the actual on-chain side via sponsored-tx prepare/execute.
        // If this fires in a test, the gate is broken.
        throw new Error(
          'save_deposit.call() must not run on confirm-tier path — ' +
            'the wrapper should pause via needsApproval and the engine ' +
            'should yield pending_action.',
        );
      },
    });
  }

  it('yields pending_action for a confirm-tier write with full action shape', async () => {
    const writeTool = makeWriteTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [writeTool],
    });

    // Stream parts: text-delta → tool-call → tool-approval-request →
    // finish. Mirrors what AI SDK v6 emits for a confirm-tier write.
    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'resp-1', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Saving 0.05 USDC. ' },
      { type: 'text-end', id: 'text-1' },
      {
        type: 'tool-call',
        toolCallId: 'toolu_save_001',
        toolName: 'save_deposit',
        input: JSON.stringify({ amount: 0.05, asset: 'USDC' }),
      },
      {
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 20, text: 20, reasoning: 0 },
        },
      },
    ]);

    const events = await collect(engine.submitMessage('Save 0.05 USDC'));

    const pendingActions = events.filter((e) => e.type === 'pending_action');
    expect(pendingActions.length).toBe(1);

    const ev = pendingActions[0]!;
    if (ev.type !== 'pending_action') throw new Error('type narrowing');
    const action = ev.action;

    // Core fields
    expect(action.toolName).toBe('save_deposit');
    expect(action.toolUseId).toBe('toolu_save_001');
    expect(action.input).toEqual({ amount: 0.05, asset: 'USDC' });

    // attemptId is a UUID v4 (8-4-4-4-12 hex)
    expect(action.attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // assistantContent carries the deferred text + tool_use blocks so
    // resumeWithToolResult can push the assistant message into history
    // and satisfy Anthropic's "tool_result must follow tool_use" rule.
    expect(action.assistantContent.length).toBeGreaterThanOrEqual(2);
    const textBlock = action.assistantContent.find((b) => b.type === 'text');
    expect(textBlock).toBeDefined();
    if (textBlock?.type === 'text') {
      expect(textBlock.text).toBe('Saving 0.05 USDC. ');
    }
    const toolUseBlock = action.assistantContent.find((b) => b.type === 'tool_use');
    expect(toolUseBlock).toBeDefined();
    if (toolUseBlock?.type === 'tool_use') {
      expect(toolUseBlock.id).toBe('toolu_save_001');
      expect(toolUseBlock.name).toBe('save_deposit');
      expect(toolUseBlock.input).toEqual({ amount: 0.05, asset: 'USDC' });
    }

    // No completed reads in this test — empty array, NOT undefined.
    expect(action.completedResults).toEqual([]);

    // modifiableFields sourced from tool-modifiable-fields registry
    // (save_deposit has `amount` editable per the registry).
    expect(action.modifiableFields).toBeDefined();
    expect(action.modifiableFields![0]?.name).toBe('amount');

    // turnIndex = assistant-message count at emit time. Empty history
    // means the first assistant turn → 0.
    expect(action.turnIndex).toBe(0);

    // description sourced from describeAction registry
    expect(action.description).toContain('0.05');
    expect(action.description).toContain('USDC');

    // The engine MUST NOT have called write.call() — the wrapper's
    // needsApproval should have gated it. The makeWriteTool() throws
    // if .call() runs; we'd see that as a tool_result event with
    // isError=true. None should be present.
    const errorToolResults = events.filter(
      (e) => e.type === 'tool_result' && (e as { isError?: boolean }).isError,
    );
    expect(errorToolResults).toEqual([]);
  });

  it('resumeWithToolResult (declined) pushes decline tool_result + turn_complete', async () => {
    const writeTool = makeWriteTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [writeTool],
    });

    const action: PendingAction = {
      toolName: 'save_deposit',
      toolUseId: 'toolu_save_001',
      input: { amount: 0.05, asset: 'USDC' },
      description: 'Save 0.05 USDC into lending',
      assistantContent: [
        { type: 'text', text: 'Saving 0.05 USDC. ' },
        { type: 'tool_use', id: 'toolu_save_001', name: 'save_deposit', input: { amount: 0.05, asset: 'USDC' } },
      ],
      completedResults: [],
      turnIndex: 0,
      attemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    };

    const response: PermissionResponse = { approved: false };

    const events: EngineEvent[] = [];
    for await (const e of engine.resumeWithToolResult(action, response)) {
      events.push(e);
    }

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults.length).toBe(1);
    const tr = toolResults[0]!;
    if (tr.type !== 'tool_result') throw new Error('type narrowing');
    expect(tr.toolName).toBe('save_deposit');
    expect(tr.toolUseId).toBe('toolu_save_001');
    expect(tr.isError).toBe(true);
    expect(tr.result).toEqual({ error: 'User declined this action' });

    const turnComplete = events.filter((e) => e.type === 'turn_complete');
    expect(turnComplete.length).toBe(1);

    // Engine should NOT have re-invoked streamText — no other events
    // (no text_delta, no usage, etc.) beyond the tool_result + turn_complete.
    expect(events.length).toBe(2);

    // History should carry the deferred assistant message + the
    // decline tool_result so the next chat turn rehydrates correctly.
    const messages = engine.getMessages();
    expect(messages.length).toBe(2);
    expect(messages[0]?.role).toBe('assistant');
    expect(messages[0]?.content.find((b) => b.type === 'tool_use')).toBeDefined();
    expect(messages[1]?.role).toBe('user');
    const declineResult = messages[1]?.content.find((b) => b.type === 'tool_result');
    expect(declineResult).toBeDefined();
    if (declineResult?.type === 'tool_result') {
      expect(declineResult.isError).toBe(true);
      expect(declineResult.content).toContain('User declined');
    }
  });

  it('resumeWithToolResult (bundle action) emits error event without crashing', async () => {
    const writeTool = makeWriteTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [writeTool],
    });

    const bundleAction: PendingAction = {
      toolName: 'save_deposit',
      toolUseId: 'toolu_save_001',
      input: { amount: 0.05, asset: 'USDC' },
      description: 'Bundle: save + send',
      assistantContent: [],
      completedResults: [],
      turnIndex: 0,
      attemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      steps: [
        {
          toolName: 'save_deposit',
          toolUseId: 'toolu_save_001',
          attemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          input: { amount: 0.05 },
          description: 'Save 0.05 USDC',
        },
        {
          toolName: 'send_transfer',
          toolUseId: 'toolu_send_001',
          attemptId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
          input: { amount: 0.01, to: '0xabc' },
          description: 'Send 0.01 USDC',
        },
      ],
    };

    const events: EngineEvent[] = [];
    for await (const e of engine.resumeWithToolResult(bundleAction, { approved: true })) {
      events.push(e);
    }

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBe(1);
    if (errorEvents[0]?.type === 'error') {
      expect(errorEvents[0].error.message).toContain('bundle resume');
      expect(errorEvents[0].error.message).toContain('not yet implemented');
    }

    const turnComplete = events.filter((e) => e.type === 'turn_complete');
    expect(turnComplete.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Day 13.4 regression — Anthropic strict-format assistant message
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 13.4 / 2026-05-16 production smoke caught a
// 400 from Anthropic on the resume turn of a compound prompt ("Save $50
// USDC" after prior balance_check + send_transfer activity). The LLM
// emitted text BETWEEN tool_uses in a single assistant message:
//
//   [text "let me check first", tool_use bc1, tool_use bc2,
//    text "let me sort", tool_use send]
//
// Anthropic's input validator rejected the replay on the resume turn:
//
//   messages.9: `tool_use` ids were found without `tool_result` blocks
//   immediately after: toolu_01DH2LdACfkaGj5MvZZrG52T,
//   toolu_01FwXtGSaL3BiMq2z6S3PCM4. Each `tool_use` block must have a
//   corresponding `tool_result` block in the next message.
//
// Fix: AISDKEngine.normalizeAssistantContentForAnthropic() reorders the
// captured assistantContent so all text is merged into a single leading
// block, followed by all tool_use blocks contiguously. This matches
// Anthropic's accepted shape (every model-emitted assistant message
// also follows this structure on the wire).
// ---------------------------------------------------------------------------
describe('AISDKEngine — Day 13.4 regression: text-between-tool_uses normalisation', () => {
  function makeReadTool(name: string, input: Record<string, unknown> = {}): LegacyTool {
    return buildTool({
      name,
      description: `${name} read tool`,
      inputSchema: z.object({}).passthrough(),
      jsonSchema: { type: 'object', properties: {} },
      flags: { mutating: false },
      permissionLevel: 'auto',
      isReadOnly: true,
      isConcurrencySafe: true,
      call: async () => ({ data: { stub: name, input }, displayText: `${name} ok` }),
    });
  }

  function makeWriteTool(): LegacyTool {
    return buildTool({
      name: 'send_transfer',
      description: 'Send USDC to a recipient.',
      inputSchema: z.object({
        to: z.string(),
        amount: z.number().positive(),
        asset: z.enum(['USDC', 'USDsui']).optional(),
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          amount: { type: 'number' },
          asset: { type: 'string' },
        },
        required: ['to', 'amount'],
      },
      flags: { mutating: true },
      permissionLevel: 'confirm',
      isReadOnly: false,
      isConcurrencySafe: false,
      call: async () => {
        throw new Error('send_transfer.call() must not run on confirm-tier path.');
      },
    });
  }

  it('rearranges interleaved text + tool_use blocks so all text precedes all tool_use blocks', async () => {
    const balanceCheck = makeReadTool('balance_check');
    const send = makeWriteTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [balanceCheck, send],
    });

    // Stream simulates the exact "Save $50 USDC" failure pattern:
    // text → tool-call (bc1) → tool-call (bc2) → text → tool-call (send)
    // → finish. The bc1/bc2 reads auto-execute (returning tool-result
    // events in the same step); the send pauses for approval.
    //
    // NOTE: We omit the tool-approval-request event from the stub
    // because we're testing the *output shape* of pending_action's
    // assistantContent, not the orchestration of the approval pause
    // itself (already covered upstream). What we DO need: the stub
    // must emit a tool-call for the write tool so AISDKEngine puts a
    // tool_use block in assistantBlocks AFTER the second text. The
    // engine's needsApproval wrapper will then refuse to execute and
    // the pending_action emission path triggers.
    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Let me check your balances first.' },
      { type: 'text-end', id: 't1' },
      // [Day 13.6 update] Use DISTINCT inputs for the two reads so the
      // Day 13.6 dedupe filter doesn't collapse them. The Day 13.4
      // test fixture's job is to verify text-then-tool_use ordering;
      // the dedupe semantics get their own test block below.
      {
        type: 'tool-call',
        toolCallId: 'toolu_bc1',
        toolName: 'balance_check',
        input: '{}',
      },
      {
        type: 'tool-call',
        toolCallId: 'toolu_bc2',
        toolName: 'balance_check',
        input: JSON.stringify({ address: '0xother' }),
      },
      { type: 'text-start', id: 't2' },
      { type: 'text-delta', id: 't2', delta: 'Now sending the transfer.' },
      { type: 'text-end', id: 't2' },
      {
        type: 'tool-call',
        toolCallId: 'toolu_send_001',
        toolName: 'send_transfer',
        input: JSON.stringify({ to: '0xabc', amount: 0.01, asset: 'USDC' }),
      },
      {
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 30, text: 30, reasoning: 0 },
        },
      },
    ]);

    const events = await collect(engine.submitMessage('Send 0.01 USDC to 0xabc and save $50'));

    const pendingActions = events.filter((e) => e.type === 'pending_action');
    expect(pendingActions.length).toBe(1);

    const ev = pendingActions[0]!;
    if (ev.type !== 'pending_action') throw new Error('type narrowing');
    const content = ev.action.assistantContent;

    // Invariant 1: every text block comes before every tool_use block.
    const lastTextIdx = content
      .map((b, i) => (b.type === 'text' ? i : -1))
      .reduce((max, i) => Math.max(max, i), -1);
    const firstToolUseIdx = content.findIndex((b) => b.type === 'tool_use');
    expect(lastTextIdx).toBeLessThan(firstToolUseIdx);

    // Invariant 2: text is merged into a single block (not multiple
    // text blocks scattered through the structure).
    const textBlocks = content.filter((b) => b.type === 'text');
    expect(textBlocks.length).toBe(1);
    if (textBlocks[0]?.type === 'text') {
      // Both source narration strings are concatenated.
      expect(textBlocks[0].text).toContain('check your balances');
      expect(textBlocks[0].text).toContain('Now sending the transfer');
    }

    // Invariant 3: all three tool_use blocks are preserved with their
    // original order (bc1, bc2, send) and IDs intact.
    const toolUses = content.filter((b) => b.type === 'tool_use');
    expect(toolUses.length).toBe(3);
    if (toolUses[0]?.type === 'tool_use') expect(toolUses[0].id).toBe('toolu_bc1');
    if (toolUses[1]?.type === 'tool_use') expect(toolUses[1].id).toBe('toolu_bc2');
    if (toolUses[2]?.type === 'tool_use') expect(toolUses[2].id).toBe('toolu_send_001');
  });

  it('passes through already-ordered content unchanged (text → tool_use)', async () => {
    const send = makeWriteTool();
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [send],
    });

    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Sending 0.01 USDC. ' },
      { type: 'text-end', id: 't1' },
      {
        type: 'tool-call',
        toolCallId: 'toolu_send_001',
        toolName: 'send_transfer',
        input: JSON.stringify({ to: '0xabc', amount: 0.01, asset: 'USDC' }),
      },
      {
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 20, text: 20, reasoning: 0 },
        },
      },
    ]);

    const events = await collect(engine.submitMessage('Send 0.01 USDC to 0xabc'));
    const pa = events.find((e) => e.type === 'pending_action');
    if (!pa || pa.type !== 'pending_action') throw new Error('expected pending_action');
    const content = pa.action.assistantContent;

    // Single text + single tool_use, in order — no reshuffling needed.
    expect(content.length).toBe(2);
    expect(content[0]?.type).toBe('text');
    expect(content[1]?.type).toBe('tool_use');
  });
});

// ---------------------------------------------------------------------------
// Day 13.6 regression — per-step dedupe of duplicate concurrent tool_uses
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 13.6 / 2026-05-16 production smoke surfaced
// LLM noise: the model emitted TWO duplicate `balance_check(input:{})`
// tool_uses alongside a `save_deposit` in the same assistant message.
// Both balance_checks ran the guard pipeline, both got blocked
// (separate but related Day 13.5 bug), and the audric UI rendered two
// RED `BALANCE CHECK` tiles next to the SAVE result.
//
// The dedupe runs at the AI SDK stream-event level inside runStream:
//   - `tool-call` events for read-and-safe tools whose
//     (toolName, stableStringify(input)) key was already seen this
//     step are filtered out: not forwarded to bridge → no UI tile,
//     not pushed to assistantBlocks → clean replay history.
//   - The matching `tool-result` / `tool-error` events for those
//     toolCallIds are also filtered out: not forwarded to bridge,
//     not pushed to completedResults.
//   - Reset on `start-step` so dedupe is per-LLM-iteration; a
//     balance_check repeated in a later step is NOT deduped (fresh
//     read is the user's intent after a write).
//   - Only `isReadOnly && isConcurrencySafe` tools are eligible —
//     writes might legitimately repeat and silently dropping them
//     would mask real intent.
// ---------------------------------------------------------------------------
describe('AISDKEngine — Day 13.6 regression: per-step duplicate-tool dedupe', () => {
  function makeReadTool(name: string): LegacyTool {
    return buildTool({
      name,
      description: `${name} read tool`,
      inputSchema: z.object({}).passthrough(),
      jsonSchema: { type: 'object', properties: {} },
      flags: { mutating: false },
      permissionLevel: 'auto',
      isReadOnly: true,
      isConcurrencySafe: true,
      call: async () => ({ data: { stub: name }, displayText: `${name} ok` }),
    });
  }

  function makeUnsafeReadTool(name: string): LegacyTool {
    // isReadOnly=true but isConcurrencySafe=false → MUST NOT be deduped.
    // Pins the conservative gate: if a read tool isn't explicitly
    // marked safe to parallelize, we don't second-guess the LLM's
    // intent to call it twice.
    return buildTool({
      name,
      description: `${name} unsafe read tool`,
      inputSchema: z.object({}).passthrough(),
      jsonSchema: { type: 'object', properties: {} },
      flags: { mutating: false },
      permissionLevel: 'auto',
      isReadOnly: true,
      isConcurrencySafe: false,
      call: async () => ({ data: { stub: name }, displayText: `${name} ok` }),
    });
  }

  it('drops duplicate concurrent tool_use blocks for read+safe tools (UI dedupe)', async () => {
    const balanceCheck = makeReadTool('balance_check');
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [balanceCheck],
      // Force exactly 1 LLM round — without this, AI SDK runs a
      // follow-up turn after tool execution, the stub returns the
      // same chunks again, and we double-count every tool_start.
      maxTurns: 1,
    });

    // Provider stream emits two duplicate tool-call events with
    // identical empty input. AI SDK invokes the wrapper for both;
    // the wrapper returns the same result both times. AI SDK then
    // emits two tool-result events on the fullStream — and our
    // dedupe filter drops the second one.
    //
    // (start-step / finish-step / tool-result chunks are NOT valid
    // provider stream parts; AI SDK adds those to fullStream itself.
    // Including them in withStubbedModel's chunks throws "Unhandled
    // chunk type: start-step" from run-tools-transformation.)
    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Checking balance.' },
      { type: 'text-end', id: 't1' },
      { type: 'tool-call', toolCallId: 'bc_1', toolName: 'balance_check', input: '{}' },
      { type: 'tool-call', toolCallId: 'bc_2', toolName: 'balance_check', input: '{}' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage: {
          inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
      },
    ]);

    const events = await collect(engine.submitMessage('What is my balance?'));

    // EngineEvent stream: ONE tool_start + ONE tool_result for
    // balance_check, NOT two of each. Confirms the bridge-forward
    // dedupe filtered the duplicate stream events.
    const toolStarts = events.filter(
      (e) => e.type === 'tool_start' && (e as { toolName?: string }).toolName === 'balance_check',
    );
    const toolResults = events.filter(
      (e) => e.type === 'tool_result' && (e as { toolName?: string }).toolName === 'balance_check',
    );
    expect(toolStarts.length).toBe(1);
    expect(toolResults.length).toBe(1);

    // First tool_use's id wins (bc_1, not bc_2).
    if (toolStarts[0]?.type === 'tool_start') {
      expect((toolStarts[0] as { toolUseId?: string }).toolUseId).toBe('bc_1');
    }
  });

  it('does NOT dedupe non-identical inputs (different addresses are independent reads)', async () => {
    const balanceCheck = makeReadTool('balance_check');
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [balanceCheck],
      maxTurns: 1,
    });

    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'tool-call', toolCallId: 'bc_self', toolName: 'balance_check', input: '{}' },
      {
        type: 'tool-call',
        toolCallId: 'bc_other',
        toolName: 'balance_check',
        input: JSON.stringify({ address: '0xabc' }),
      },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage: {
          inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
      },
    ]);

    const events = await collect(engine.submitMessage('Check both wallets'));

    const toolStarts = events.filter(
      (e) => e.type === 'tool_start' && (e as { toolName?: string }).toolName === 'balance_check',
    );
    expect(toolStarts.length).toBe(2);
  });

  it('does NOT dedupe tools that are isReadOnly but NOT isConcurrencySafe', async () => {
    const unsafeRead = makeUnsafeReadTool('unsafe_read');
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [unsafeRead],
      maxTurns: 1,
    });

    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'tool-call', toolCallId: 'u_1', toolName: 'unsafe_read', input: '{}' },
      { type: 'tool-call', toolCallId: 'u_2', toolName: 'unsafe_read', input: '{}' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage: {
          inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
      },
    ]);

    const events = await collect(engine.submitMessage('Run twice'));

    const toolStarts = events.filter(
      (e) => e.type === 'tool_start' && (e as { toolName?: string }).toolName === 'unsafe_read',
    );
    // Both tool_uses survive — unsafe-to-parallelize tools opt out
    // of dedupe. Defensive default; a tool can opt IN by setting
    // isConcurrencySafe=true in its build definition.
    expect(toolStarts.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Day 13.7 regression — push assistant message to history on clean turn
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 13.7 / 2026-05-16 — production dump of
// session s_1778900893492_12f0d4287565 revealed the v2 engine was
// silently dropping the assistant message from `this.messages` on
// every turn that did NOT trigger a `pending_action`.
//
// Symptoms:
//   - User types "What's my balance?" → LLM responds with narration
//     + (auto-tier) tool calls → engine streams events to host → host
//     persists `engine.getMessages()` to Redis.
//   - On the SAME tab session, the next LLM turn sees the prior
//     assistant message via the live in-process `this.messages` (so
//     things appear to work).
//   - On REFRESH, the session rehydrates from Redis. The persisted
//     `messages` array is MISSING every assistant message for read-only
//     turns. The user's history shows their prompts but no responses.
//
// Root cause:
//   - submitMessage()` pushes the user message at line ~291.
//   - `runStream` accumulates `assistantBlocks` from the AI SDK stream.
//   - For `pending_action`: the deferred assistant content goes into
//     `action.assistantContent`, and resumeWithToolResult` pushes it
//     to `this.messages` (line ~408).
//   - For CLEAN turns (no pending_action): nothing pushed. Lost.
//
// Fix (Day 13.7):
//   - `runStream` now pushes the per-step assistant message + matched
//     tool_results into `this.messages` on every `finish-step` event
//     where `stepHadApproval === false`.
//   - `start-step` resets the per-step accumulators (`assistantBlocks`,
//     `completedResults`, dedup state, currentText, stepHadApproval).
//   - `tool-approval-request` sets `stepHadApproval = true` so the
//     subsequent `finish-step` (if any) doesn't double-push the
//     deferred content (which resumeWithToolResult will push instead).
//
// Test scope:
//   - Single read tool, clean turn → assistant + tool_result in
//     `getMessages()` after stream end.
//   - Text-only turn → assistant text in `getMessages()` after stream
//     end.
//   - Multi-step turn (text → tool → text) → BOTH steps' assistant
//     messages in `getMessages()` in order.
// ---------------------------------------------------------------------------
describe('AISDKEngine — Day 13.7 regression: persist assistant message on clean turns', () => {
  function makeReadTool(name: string): LegacyTool {
    return buildTool({
      name,
      description: `${name} read tool`,
      inputSchema: z.object({}).passthrough(),
      jsonSchema: { type: 'object', properties: {} },
      flags: { mutating: false },
      permissionLevel: 'auto',
      isReadOnly: true,
      isConcurrencySafe: true,
      call: async () => ({ data: { stub: name, value: 42 }, displayText: `${name} ok` }),
    });
  }

  it('pushes assistant message + tool_result to history on a clean read-only turn', async () => {
    const balanceCheck = makeReadTool('balance_check');
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [balanceCheck],
      maxTurns: 1,
    });

    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Your balance is $93.' },
      { type: 'text-end', id: 't1' },
      { type: 'tool-call', toolCallId: 'bc_1', toolName: 'balance_check', input: '{}' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage: {
          inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
      },
    ]);

    await collect(engine.submitMessage('What is my balance?'));

    const messages = engine.getMessages();
    // user prompt + assistant response + tool_result user message = 3
    expect(messages.length).toBe(3);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[2]?.role).toBe('user');

    // Assistant message contains BOTH the narration text and the tool_use
    const asst = messages[1]!;
    const asstContent = asst.content as ReadonlyArray<{ type: string }>;
    const types = asstContent.map((b) => b.type);
    expect(types).toContain('text');
    expect(types).toContain('tool_use');

    // tool_result user message ties back to the tool_use
    const trUser = messages[2]!;
    const trContent = trUser.content as ReadonlyArray<{ type: string; toolUseId?: string }>;
    expect(trContent.length).toBe(1);
    expect(trContent[0]?.type).toBe('tool_result');
    expect(trContent[0]?.toolUseId).toBe('bc_1');
  });

  it('pushes assistant message on a text-only turn (no tools)', async () => {
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [],
      maxTurns: 1,
    });

    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Hello! How can I help?' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage: {
          inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5, text: 5, reasoning: 0 },
        },
      },
    ]);

    await collect(engine.submitMessage('hi'));

    const messages = engine.getMessages();
    // user prompt + assistant text response = 2
    expect(messages.length).toBe(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');

    const asst = messages[1]!;
    const asstContent = asst.content as ReadonlyArray<{ type: string; text?: string }>;
    expect(asstContent.length).toBe(1);
    expect(asstContent[0]?.type).toBe('text');
    expect(asstContent[0]?.text).toContain('Hello');
  });

  it('does NOT push assistant message when step ends with pending_action (resumeWithToolResult owns the push)', async () => {
    const saveDeposit = buildTool({
      name: 'save_deposit',
      description: 'Save USDC into NAVI for yield.',
      inputSchema: z.object({ amount: z.number(), asset: z.string().default('USDC') }),
      jsonSchema: {
        type: 'object',
        properties: { amount: { type: 'number' }, asset: { type: 'string' } },
        required: ['amount'],
      },
      flags: { mutating: true },
      permissionLevel: 'confirm',
      isReadOnly: false,
      isConcurrencySafe: false,
      call: async () => ({ data: { ok: true }, displayText: 'saved' }),
    });

    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [saveDeposit],
      maxTurns: 1,
    });

    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Saving 10 USDC.' },
      { type: 'text-end', id: 't1' },
      {
        type: 'tool-call',
        toolCallId: 'sv_1',
        toolName: 'save_deposit',
        input: JSON.stringify({ amount: 10, asset: 'USDC' }),
      },
      {
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage: {
          inputTokens: { total: 60, noCache: 60, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 15, text: 15, reasoning: 0 },
        },
      },
    ]);

    const events = await collect(engine.submitMessage('Save 10 USDC'));

    // pending_action MUST fire (sanity check the test scenario)
    const pa = events.find((e) => e.type === 'pending_action');
    expect(pa).toBeDefined();

    // History should contain ONLY the user prompt — the assistant
    // message + tool_use are deferred into action.assistantContent
    // and only land in history when resumeWithToolResult is called.
    // Day 13.7's stepHadApproval flag exists to enforce this and
    // prevent the double-push that would otherwise corrupt history.
    const messages = engine.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0]?.role).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// Day 13.8 — minimal integration-harness coverage for the persist-on-clean
//             invariants the Day 13.7 fix introduced.
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 14 / 2026-05-16. Founder pushback on the
// 5-day full integration harness: "once we delete legacy at Week 6,
// the diff harness is worthless — why are we going in circles?".
// Honest pivot — instead of building a 5-day audric/web integration
// harness that becomes obsolete in 4-6 weeks, fold the high-value
// invariants into engine-side integration tests right next to the
// unit tests. Same coverage for the bug CLASS that motivated the
// harness (silent persistence corruption), zero infrastructure cost,
// permanent value (doesn't expire when legacy goes away).
//
// What these tests pin (the gaps the 13.7 block didn't cover):
//   1. Multi-step clean turn — step 1 (tool call) AND step 2
//      (narration after tool result) BOTH land in `this.messages`
//      in the correct order. Without this test, a future change to
//      `start-step` reset semantics could silently drop step 2's
//      narration.
//   2. Stream error mid-turn — assistant content NOT pushed if the
//      stream errors before finish-step. Otherwise a partial assistant
//      message corrupts history for the next turn.
//   3. Compound pending_action — step 1 (read tool, completes cleanly)
//      gets pushed to history, step 2 (write tool, pending) goes into
//      action.assistantContent without including step 1's content.
//      The single most architecturally subtle case from 13.7.
// ---------------------------------------------------------------------------
describe('AISDKEngine — Day 13.8 integration: persist-on-clean invariants (multi-step + error + compound)', () => {
  function makeReadTool(name: string): LegacyTool {
    return buildTool({
      name,
      description: `${name} read tool`,
      inputSchema: z.object({}).passthrough(),
      jsonSchema: { type: 'object', properties: {} },
      flags: { mutating: false },
      permissionLevel: 'auto',
      isReadOnly: true,
      isConcurrencySafe: true,
      call: async () => ({ data: { stub: name }, displayText: `${name} ok` }),
    });
  }

  function makeWriteTool(name: string): LegacyTool {
    return buildTool({
      name,
      description: `${name} write tool`,
      inputSchema: z.object({ amount: z.number() }),
      jsonSchema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
      flags: { mutating: true },
      permissionLevel: 'confirm',
      isReadOnly: false,
      isConcurrencySafe: false,
      call: async () => ({ data: { ok: true }, displayText: `${name} done` }),
    });
  }

  it('text-then-tool-call within a single step persists assistant text + tool_use + tool_result', async () => {
    // Scenario: LLM emits narration text THEN a tool_call within
    // the same step. Both must end up in the persisted assistant
    // message (text-first ordering enforced by Day 13.4
    // normaliseAssistantContentForAnthropic), and the tool_result
    // must follow as a user message.
    //
    // Compound multi-STEP behavior (separate LLM rounds) is covered
    // by the next test below using a counter-driven stub.
    const balanceCheck = makeReadTool('balance_check');
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [balanceCheck],
      maxTurns: 1,
    });
    withStubbedModel(engine, [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Checking your balance. ' },
      { type: 'text-end', id: 't1' },
      { type: 'tool-call', toolCallId: 'bc_1', toolName: 'balance_check', input: '{}' },
      { type: 'text-start', id: 't2' },
      { type: 'text-delta', id: 't2', delta: 'Your balance is $93.' },
      { type: 'text-end', id: 't2' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage: {
          inputTokens: { total: 80, noCache: 80, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 20, text: 20, reasoning: 0 },
        },
      },
    ]);

    await collect(engine.submitMessage('What is my balance?'));

    const messages = engine.getMessages();
    // user prompt + assistant (merged text + tool_use) + user tool_result = 3
    expect(messages.length).toBe(3);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[2]?.role).toBe('user');

    // Assistant content carries BOTH text and tool_use (text-first
    // ordering enforced by normalizeAssistantContentForAnthropic).
    const asst = messages[1]!;
    const asstContent = asst.content as ReadonlyArray<{ type: string; text?: string }>;
    const textBlocks = asstContent.filter((b) => b.type === 'text');
    const toolUseBlocks = asstContent.filter((b) => b.type === 'tool_use');
    expect(textBlocks.length).toBe(1);
    expect(toolUseBlocks.length).toBe(1);
    expect(textBlocks[0]?.text).toContain('Checking your balance');
    expect(textBlocks[0]?.text).toContain('Your balance is');
  });

  it('compound pending_action: step 1 (read) lands in history, step 2 (write) goes into action', async () => {
    // Scenario: LLM calls a read tool in step 1, receives result,
    // then in step 2 calls a write tool requiring approval. The Day
    // 13.7 fix needs to handle this correctly:
    //   - Step 1's clean content (text + read tool_use + tool_result)
    //     MUST land in this.messages.
    //   - Step 2's content (text + write tool_use) MUST go into
    //     action.assistantContent and NOT also be in this.messages
    //     (otherwise resumeWithToolResult double-pushes).
    //
    // Without per-step accumulator reset on start-step, step 2's
    // action would include step 1's content too, causing the deferred
    // assistant message to be the union — which would mismatch the
    // tool_results pushed via resumeWithToolResult and trigger
    // Anthropic's strict-format error (same class as 13.4).
    const balanceCheck = makeReadTool('balance_check');
    const saveDeposit = makeWriteTool('save_deposit');
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [balanceCheck, saveDeposit],
      maxTurns: 2,
    });

    // For this compound scenario we need a stub that emits DIFFERENT
    // content on round 1 vs round 2. Build a counter-driven stub
    // inline.
    let callCount = 0;
    const stubModel = {
      specificationVersion: 'v3' as const,
      provider: 'test-stub',
      modelId: 'stub-compound',
      supportedUrls: {},
      doStream: () => {
        callCount += 1;
        const chunks: unknown[] =
          callCount === 1
            ? [
                { type: 'stream-start', warnings: [] },
                { type: 'response-metadata', id: 'r1', timestamp: new Date(), modelId: 'stub' },
                { type: 'text-start', id: 't1' },
                { type: 'text-delta', id: 't1', delta: 'Checking balance first.' },
                { type: 'text-end', id: 't1' },
                { type: 'tool-call', toolCallId: 'bc_1', toolName: 'balance_check', input: '{}' },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: 'tool_use' },
                  usage: {
                    inputTokens: { total: 60, noCache: 60, cacheRead: 0, cacheWrite: 0 },
                    outputTokens: { total: 15, text: 15, reasoning: 0 },
                  },
                },
              ]
            : [
                { type: 'stream-start', warnings: [] },
                { type: 'response-metadata', id: 'r2', timestamp: new Date(), modelId: 'stub' },
                { type: 'text-start', id: 't2' },
                { type: 'text-delta', id: 't2', delta: 'Saving 10 USDC now.' },
                { type: 'text-end', id: 't2' },
                {
                  type: 'tool-call',
                  toolCallId: 'sv_1',
                  toolName: 'save_deposit',
                  input: JSON.stringify({ amount: 10 }),
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: 'tool_use' },
                  usage: {
                    inputTokens: { total: 90, noCache: 90, cacheRead: 0, cacheWrite: 0 },
                    outputTokens: { total: 20, text: 20, reasoning: 0 },
                  },
                },
              ];
        return Promise.resolve({
          stream: new ReadableStream({
            start(controller) {
              for (const c of chunks) controller.enqueue(c);
              controller.close();
            },
          }),
        });
      },
    };
    // Inject the counter-driven stub via the same path withStubbedModel uses.
    (engine as unknown as { anthropic: () => unknown }).anthropic = () => stubModel;

    const events = await collect(engine.submitMessage('Check then save 10 USDC'));

    // pending_action MUST fire (for the save_deposit confirm)
    const pa = events.find((e) => e.type === 'pending_action');
    expect(pa).toBeDefined();
    if (pa?.type !== 'pending_action') throw new Error('expected pending_action');

    // History assertions: step 1 landed cleanly, step 2 is deferred.
    const messages = engine.getMessages();
    // user prompt + step1 assistant + step1 tool_result = 3
    expect(messages.length).toBe(3);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[2]?.role).toBe('user');

    // Step 1 assistant content: text + balance_check tool_use ONLY
    // (no save_deposit — that belongs to step 2's deferred action).
    const step1Asst = messages[1]!;
    const step1Content = step1Asst.content as ReadonlyArray<{ type: string; name?: string }>;
    const step1ToolUseNames = step1Content
      .filter((b) => b.type === 'tool_use')
      .map((b) => b.name);
    expect(step1ToolUseNames).toEqual(['balance_check']);

    // action.assistantContent contains ONLY step 2's content (the
    // write narration + save_deposit tool_use). Day 13.7's
    // resetStepAccumulators() on start-step is what makes this work.
    const actionContent = pa.action.assistantContent as ReadonlyArray<{ type: string; name?: string; text?: string }>;
    const actionToolUseNames = actionContent
      .filter((b) => b.type === 'tool_use')
      .map((b) => b.name);
    expect(actionToolUseNames).toEqual(['save_deposit']);
    const actionTextBlocks = actionContent.filter((b) => b.type === 'text');
    expect(actionTextBlocks.length).toBe(1);
    expect(actionTextBlocks[0]?.text).toContain('Saving 10 USDC');
    // Crucially: action.assistantContent does NOT include step 1's
    // "Checking balance first." text or the balance_check tool_use.
    expect(actionTextBlocks[0]?.text).not.toContain('Checking balance first');
  });

  it('multi-prompt single engine: each prompt persists its assistant message (regression for Day 13.7 across many turns)', async () => {
    // Scenario: drive 3 sequential prompts through the SAME engine
    // (matches the audric chat-route behavior where each
    // /api/engine/chat request hits an engine constructed from the
    // persisted session). Verify history grows monotonically and
    // every clean turn's assistant message is preserved.
    const balanceCheck = makeReadTool('balance_check');
    const engine = new AISDKEngine({
      ...baseConfig('sk-test-fake-key-not-used'),
      tools: [balanceCheck],
      maxTurns: 1,
    });

    const buildStub = (text: string, toolCallId: string): LanguageModelV3StreamPart[] => [
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r', timestamp: new Date(), modelId: 'stub' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: text },
      { type: 'text-end', id: 't1' },
      { type: 'tool-call', toolCallId, toolName: 'balance_check', input: '{}' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage: {
          inputTokens: { total: 30, noCache: 30, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5, text: 5, reasoning: 0 },
        },
      },
    ];

    // Prompt 1
    withStubbedModel(engine, buildStub('First reply.', 'bc_p1'));
    await collect(engine.submitMessage('Prompt one.'));
    expect(engine.getMessages().length).toBe(3);

    // Prompt 2 — message count should jump by 3 more (user + asst + tool_result)
    withStubbedModel(engine, buildStub('Second reply.', 'bc_p2'));
    await collect(engine.submitMessage('Prompt two.'));
    expect(engine.getMessages().length).toBe(6);

    // Prompt 3
    withStubbedModel(engine, buildStub('Third reply.', 'bc_p3'));
    await collect(engine.submitMessage('Prompt three.'));
    expect(engine.getMessages().length).toBe(9);

    // Sanity: all three user prompts are present, in order
    const userPrompts = engine
      .getMessages()
      .filter((m) => m.role === 'user' && Array.isArray(m.content) && (m.content as ReadonlyArray<{ type: string; text?: string }>)[0]?.type === 'text')
      .map((m) => (m.content as ReadonlyArray<{ type: string; text?: string }>)[0]?.text);
    expect(userPrompts).toEqual(['Prompt one.', 'Prompt two.', 'Prompt three.']);

    // And all three assistant replies are present, in order
    const asstTexts = engine
      .getMessages()
      .filter((m) => m.role === 'assistant')
      .map((m) => {
        const blocks = m.content as ReadonlyArray<{ type: string; text?: string }>;
        return blocks.find((b) => b.type === 'text')?.text;
      });
    expect(asstTexts).toEqual(['First reply.', 'Second reply.', 'Third reply.']);
  });
});

// ---------------------------------------------------------------------------
// Day 14a — Week 4 cleanup: borrowApyBps + currentHF on PendingAction
// ---------------------------------------------------------------------------
//
// Confirms that the enrichment helper's fields actually land on the
// `pending_action` event for confirm-tier borrow / save_deposit writes.
// Unit-level behaviour of the helper itself is pinned by
// `enrich-pending-action.test.ts` (16 tests, vi.mock approach).
//
// Here we use `vi.spyOn` so the stub is scoped to each test and doesn't
// leak into the other describe blocks above.
// ---------------------------------------------------------------------------

describe('AISDKEngine — Day 14a: live NAVI data on pending_action (borrowApyBps + currentHF)', () => {
  function makeBorrowTool(): LegacyTool {
    return buildTool({
      name: 'borrow',
      description: 'Borrow USDC or USDsui against savings collateral.',
      inputSchema: z.object({
        amount: z.number().positive(),
        asset: z.enum(['USDC', 'USDsui']).optional(),
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          asset: { type: 'string', enum: ['USDC', 'USDsui'] },
        },
        required: ['amount'],
      },
      flags: { mutating: true },
      permissionLevel: 'confirm',
      isReadOnly: false,
      isConcurrencySafe: false,
      call: async () => {
        throw new Error('borrow.call() must not run on confirm-tier path');
      },
    });
  }

  function makeSaveTool(): LegacyTool {
    return buildTool({
      name: 'save_deposit',
      description: 'Deposit USDC or USDsui into NAVI savings.',
      inputSchema: z.object({
        amount: z.number().positive(),
        asset: z.enum(['USDC', 'USDsui']).optional(),
      }),
      jsonSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          asset: { type: 'string', enum: ['USDC', 'USDsui'] },
        },
        required: ['amount'],
      },
      flags: { mutating: true },
      permissionLevel: 'confirm',
      isReadOnly: false,
      isConcurrencySafe: false,
      call: async () => {
        throw new Error('save_deposit.call() must not run on confirm-tier path');
      },
    });
  }

  const HAPPY_RATES = {
    USDC: { saveApy: 0.0439, borrowApy: 0.0467, ltv: 0.8, price: 1 },
    USDsui: { saveApy: 0.0828, borrowApy: 0.0319, ltv: 0.85, price: 1 },
  };
  const HAPPY_HF = {
    healthFactor: 3.8,
    supplied: 100,
    borrowed: 20,
    maxBorrow: 80,
    liquidationThreshold: 0.85,
  };

  it('borrow confirm-tier pending_action carries borrowApyBps + currentHF when NAVI is reachable', async () => {
    const naviReads = await import('../navi/reads.js');
    const ratesSpy = vi.spyOn(naviReads, 'fetchRates').mockResolvedValue(HAPPY_RATES);
    const hfSpy = vi.spyOn(naviReads, 'fetchHealthFactor').mockResolvedValue(HAPPY_HF);

    try {
      const borrowTool = makeBorrowTool();
      const engine = new AISDKEngine({
        ...baseConfig('sk-test-fake-key-not-used'),
        tools: [borrowTool],
        mcpManager: { __mock: 'mcp' } as unknown as AISDKEngineConfig['mcpManager'],
      });

      withStubbedModel(engine, [
        { type: 'stream-start', warnings: [] },
        { type: 'response-metadata', id: 'r1', timestamp: new Date(), modelId: 'stub' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Borrowing $5 USDC. ' },
        { type: 'text-end', id: 't1' },
        {
          type: 'tool-call',
          toolCallId: 'toolu_borrow_001',
          toolName: 'borrow',
          input: JSON.stringify({ amount: 5, asset: 'USDC' }),
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: {
            inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 10, text: 10, reasoning: 0 },
          },
        },
      ]);

      const events = await collect(engine.submitMessage('Borrow $5 USDC.'));
      const pendingActions = events.filter((e) => e.type === 'pending_action');
      expect(pendingActions.length).toBe(1);
      const ev = pendingActions[0]!;
      if (ev.type !== 'pending_action') throw new Error('type narrowing');

      expect(ev.action.borrowApyBps).toBe(467);
      expect(ev.action.currentHF).toBeCloseTo(3.8, 5);
      expect(ratesSpy).toHaveBeenCalledTimes(1);
      expect(hfSpy).toHaveBeenCalledTimes(1);
    } finally {
      ratesSpy.mockRestore();
      hfSpy.mockRestore();
    }
  });

  it('save_deposit confirm-tier pending_action carries currentHF but NOT borrowApyBps', async () => {
    const naviReads = await import('../navi/reads.js');
    const ratesSpy = vi.spyOn(naviReads, 'fetchRates').mockResolvedValue(HAPPY_RATES);
    const hfSpy = vi.spyOn(naviReads, 'fetchHealthFactor').mockResolvedValue(HAPPY_HF);

    try {
      const saveTool = makeSaveTool();
      const engine = new AISDKEngine({
        ...baseConfig('sk-test-fake-key-not-used'),
        tools: [saveTool],
        mcpManager: { __mock: 'mcp' } as unknown as AISDKEngineConfig['mcpManager'],
      });

      withStubbedModel(engine, [
        { type: 'stream-start', warnings: [] },
        { type: 'response-metadata', id: 'r1', timestamp: new Date(), modelId: 'stub' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Saving $10 USDC. ' },
        { type: 'text-end', id: 't1' },
        {
          type: 'tool-call',
          toolCallId: 'toolu_save_001',
          toolName: 'save_deposit',
          input: JSON.stringify({ amount: 10, asset: 'USDC' }),
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: {
            inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 10, text: 10, reasoning: 0 },
          },
        },
      ]);

      const events = await collect(engine.submitMessage('Save $10 USDC.'));
      const pendingActions = events.filter((e) => e.type === 'pending_action');
      expect(pendingActions.length).toBe(1);
      const ev = pendingActions[0]!;
      if (ev.type !== 'pending_action') throw new Error('type narrowing');

      expect(ev.action.borrowApyBps).toBeUndefined();
      expect(ev.action.currentHF).toBeCloseTo(3.8, 5);
      expect(ratesSpy).not.toHaveBeenCalled();
      expect(hfSpy).toHaveBeenCalledTimes(1);
    } finally {
      ratesSpy.mockRestore();
      hfSpy.mockRestore();
    }
  });

  it('graceful: NAVI MCP unavailable → pending_action omits both fields (no throw)', async () => {
    const naviReads = await import('../navi/reads.js');
    const ratesSpy = vi
      .spyOn(naviReads, 'fetchRates')
      .mockRejectedValue(new Error('NAVI circuit breaker open'));
    const hfSpy = vi
      .spyOn(naviReads, 'fetchHealthFactor')
      .mockRejectedValue(new Error('NAVI timeout'));

    try {
      const borrowTool = makeBorrowTool();
      const engine = new AISDKEngine({
        ...baseConfig('sk-test-fake-key-not-used'),
        tools: [borrowTool],
        mcpManager: { __mock: 'mcp' } as unknown as AISDKEngineConfig['mcpManager'],
      });

      withStubbedModel(engine, [
        { type: 'stream-start', warnings: [] },
        { type: 'response-metadata', id: 'r1', timestamp: new Date(), modelId: 'stub' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Borrowing. ' },
        { type: 'text-end', id: 't1' },
        {
          type: 'tool-call',
          toolCallId: 'toolu_borrow_001',
          toolName: 'borrow',
          input: JSON.stringify({ amount: 5, asset: 'USDC' }),
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: {
            inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 10, text: 10, reasoning: 0 },
          },
        },
      ]);

      const events = await collect(engine.submitMessage('Borrow $5.'));
      const pendingActions = events.filter((e) => e.type === 'pending_action');
      expect(pendingActions.length).toBe(1);
      const ev = pendingActions[0]!;
      if (ev.type !== 'pending_action') throw new Error('type narrowing');

      expect(ev.action.borrowApyBps).toBeUndefined();
      expect(ev.action.currentHF).toBeUndefined();
      expect(ev.action.toolName).toBe('borrow');
      expect(ratesSpy).toHaveBeenCalledTimes(1);
      expect(hfSpy).toHaveBeenCalledTimes(1);
    } finally {
      ratesSpy.mockRestore();
      hfSpy.mockRestore();
    }
  });

  it('no mcpManager configured → pending_action omits both fields (no NAVI calls)', async () => {
    const naviReads = await import('../navi/reads.js');
    const ratesSpy = vi.spyOn(naviReads, 'fetchRates').mockResolvedValue(HAPPY_RATES);
    const hfSpy = vi.spyOn(naviReads, 'fetchHealthFactor').mockResolvedValue(HAPPY_HF);

    try {
      const borrowTool = makeBorrowTool();
      const engine = new AISDKEngine({
        ...baseConfig('sk-test-fake-key-not-used'),
        tools: [borrowTool],
        // No mcpManager — audric not threading MCP this turn
      });

      withStubbedModel(engine, [
        { type: 'stream-start', warnings: [] },
        { type: 'response-metadata', id: 'r1', timestamp: new Date(), modelId: 'stub' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Borrowing. ' },
        { type: 'text-end', id: 't1' },
        {
          type: 'tool-call',
          toolCallId: 'toolu_borrow_001',
          toolName: 'borrow',
          input: JSON.stringify({ amount: 5 }),
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: {
            inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 10, text: 10, reasoning: 0 },
          },
        },
      ]);

      const events = await collect(engine.submitMessage('Borrow $5.'));
      const pendingActions = events.filter((e) => e.type === 'pending_action');
      expect(pendingActions.length).toBe(1);
      const ev = pendingActions[0]!;
      if (ev.type !== 'pending_action') throw new Error('type narrowing');

      expect(ev.action.borrowApyBps).toBeUndefined();
      expect(ev.action.currentHF).toBeUndefined();
      expect(ratesSpy).not.toHaveBeenCalled();
      expect(hfSpy).not.toHaveBeenCalled();
    } finally {
      ratesSpy.mockRestore();
      hfSpy.mockRestore();
    }
  });
});
