/**
 * SPEC 7 P2.4b — Quote-Refresh ReviewCard / regenerateBundle tests.
 *
 * Verifies the engine-side regenerate helper:
 *  - Re-fires regeneratable upstream reads via `engine.invokeReadTool`.
 *  - Stamps fresh per-step `attemptId`s on the rebuilt bundle.
 *  - Carries `quoteAge` close to 0 after a successful regenerate.
 *  - Emits one `tool_start` + one `tool_result` per re-fired read in
 *    `timelineEvents`.
 *  - Mutates `engine.getMessages()` so the LLM sees the fresh reads on
 *    resume (verified by the appended assistant + user pair).
 *  - Fails-safe with the right `reason` for malformed inputs.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { buildTool } from '../tool.js';
import { applyToolFlags } from '../tool-flags.js';
import { regenerateBundle } from '../regenerate.js';
import type {
  LLMProvider,
  ChatParams,
  ProviderEvent,
  Tool,
  PendingAction,
  Message,
} from '../types.js';

// Provider stub — regenerate never calls the LLM, so this can be a no-op
// generator that yields nothing. The QueryEngine constructor still needs
// SOME provider; we never invoke `chat`.
function createNoOpProvider(): LLMProvider {
  return {
    async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
      // No events emitted — regenerate must never trigger this path.
    },
  };
}

// Read tool whose return value flips between two snapshots so we can
// verify regenerate ACTUALLY re-runs (rather than returning a cached
// stale result). Each call increments `callCount`.
function makeFlippingRead(name: string): { tool: Tool; callCount: () => number; reset: () => void } {
  let calls = 0;
  return {
    tool: buildTool({
      name,
      description: `mock ${name}`,
      inputSchema: z.object({}).passthrough(),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: true,
      async call() {
        calls += 1;
        return {
          data: {
            // Different payload each call so the regenerate result is
            // distinguishable from the original read.
            snapshot: `call-${calls}`,
            ts: Date.now(),
          },
        };
      },
    }),
    callCount: () => calls,
    reset: () => {
      calls = 0;
    },
  };
}

// Bundleable confirm-tier write tool (matches the engine's bundleable
// allow-list: `swap_execute`, `save_deposit`, etc.). Never actually
// executes during regenerate — confirm-tier writes only run when the
// host approves a pending_action.
function makeBundleableWrite(name: string): Tool {
  return buildTool({
    name,
    description: `mock ${name}`,
    inputSchema: z.object({ amount: z.number() }).passthrough(),
    jsonSchema: {
      type: 'object',
      properties: { amount: { type: 'number' } },
      required: ['amount'],
    },
    isReadOnly: false,
    permissionLevel: 'confirm',
    async call() {
      return { data: { ok: true } };
    },
  });
}

// Build the prior message history that a real session would carry into
// regenerate: the assistant message that emitted the read tool_use blocks
// + the user reply with their tool_result blocks. The bundled
// pending_action's `regenerateInput.toolUseIds` references these ids.
function buildPriorReadHistory(
  reads: Array<{ id: string; name: string; result: unknown }>,
): Message[] {
  return [
    {
      role: 'user',
      content: [{ type: 'text', text: 'swap and save my USDC' }],
    },
    {
      role: 'assistant',
      content: reads.map((r) => ({
        type: 'tool_use' as const,
        id: r.id,
        name: r.name,
        input: {},
      })),
    },
    {
      role: 'user',
      content: reads.map((r) => ({
        type: 'tool_result' as const,
        toolUseId: r.id,
        content: JSON.stringify(r.result),
      })),
    },
  ];
}

// Hand-craft the bundled pending_action a real session would have
// persisted. Mirrors what `composeBundleFromToolResults` produces — same
// fields, just stamped explicitly so tests can assert on what changed
// after regenerate.
function buildBundledAction(opts: {
  regenerateToolUseIds: string[];
  steps: Array<{ toolName: string; toolUseId: string; input: unknown }>;
  quoteAge?: number;
}): PendingAction {
  const stepsWithAttempt = opts.steps.map((s) => ({
    ...s,
    attemptId: `original-${s.toolUseId}`,
    description: `${s.toolName} step`,
  }));
  return {
    toolName: stepsWithAttempt[0].toolName,
    toolUseId: stepsWithAttempt[0].toolUseId,
    input: stepsWithAttempt[0].input,
    description: 'Multi-write bundle',
    assistantContent: opts.steps.map((s) => ({
      type: 'tool_use' as const,
      id: s.toolUseId,
      name: s.toolName,
      input: s.input,
    })),
    completedResults: [],
    turnIndex: 1,
    attemptId: stepsWithAttempt[0].attemptId,
    steps: stepsWithAttempt,
    canRegenerate: true,
    regenerateInput: { toolUseIds: opts.regenerateToolUseIds },
    quoteAge: opts.quoteAge ?? 47_000,
  };
}

describe('SPEC 7 P2.4b — regenerateBundle', () => {
  it('re-fires regeneratable reads and rebuilds the bundle with fresh attemptIds', async () => {
    const swapQuote = makeFlippingRead('swap_quote');
    const ratesInfo = makeFlippingRead('rates_info');
    const tools = applyToolFlags([
      swapQuote.tool,
      ratesInfo.tool,
      makeBundleableWrite('swap_execute'),
      makeBundleableWrite('save_deposit'),
    ]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });

    // Seed history: prior assistant turn ran swap_quote + rates_info.
    engine.loadMessages(
      buildPriorReadHistory([
        { id: 'read-swap-1', name: 'swap_quote', result: { snapshot: 'call-pre' } },
        { id: 'read-rates-1', name: 'rates_info', result: { snapshot: 'call-pre' } },
      ]),
    );

    const action = buildBundledAction({
      regenerateToolUseIds: ['read-swap-1', 'read-rates-1'],
      steps: [
        { toolName: 'swap_execute', toolUseId: 'write-swap-1', input: { amount: 100 } },
        { toolName: 'save_deposit', toolUseId: 'write-save-1', input: { amount: 90 } },
      ],
      quoteAge: 47_000,
    });

    const result = await regenerateBundle(engine, action);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Each read fired once.
    expect(swapQuote.callCount()).toBe(1);
    expect(ratesInfo.callCount()).toBe(1);

    // Fresh bundle: same writes, same toolUseIds, but new attemptIds.
    expect(result.newPendingAction.steps).toHaveLength(2);
    expect(result.newPendingAction.steps![0].toolName).toBe('swap_execute');
    expect(result.newPendingAction.steps![0].toolUseId).toBe('write-swap-1');
    expect(result.newPendingAction.steps![0].attemptId).not.toBe(
      'original-write-swap-1',
    );
    expect(result.newPendingAction.steps![1].toolUseId).toBe('write-save-1');
    expect(result.newPendingAction.steps![1].attemptId).not.toBe(
      'original-write-save-1',
    );

    // SPEC 7 § Layer 2 line 463 invariant — top-level mirrors steps[0].
    expect(result.newPendingAction.attemptId).toBe(
      result.newPendingAction.steps![0].attemptId,
    );

    // canRegenerate stays true; quoteAge is fresh (~0ms — clamped at >= 0).
    expect(result.newPendingAction.canRegenerate).toBe(true);
    expect(result.newPendingAction.quoteAge).toBeDefined();
    expect(result.newPendingAction.quoteAge!).toBeLessThan(2_000);

    // regenerateInput now references the NEW (regenerated) tool_use ids.
    const newRegenIds = result.newPendingAction.regenerateInput?.toolUseIds ?? [];
    expect(newRegenIds).toHaveLength(2);
    expect(newRegenIds.every((id) => id.startsWith('regen_'))).toBe(true);

    // timelineEvents: one tool_start + one tool_result per re-fired read.
    expect(result.timelineEvents).toHaveLength(4);
    expect(result.timelineEvents[0].type).toBe('tool_start');
    expect(result.timelineEvents[0].toolName).toBe('swap_quote');
    expect(result.timelineEvents[1].type).toBe('tool_result');
    expect(result.timelineEvents[1].toolName).toBe('swap_quote');
    expect(result.timelineEvents[2].type).toBe('tool_start');
    expect(result.timelineEvents[2].toolName).toBe('rates_info');
    expect(result.timelineEvents[3].type).toBe('tool_result');
    expect(result.timelineEvents[3].toolName).toBe('rates_info');

    // Engine messages mutated: prior history (3 msgs) + 1 synth assistant
    // + 1 synth user = 5.
    expect(engine.getMessages()).toHaveLength(5);
    const synthAssistant = engine.getMessages()[3];
    expect(synthAssistant.role).toBe('assistant');
    const synthUser = engine.getMessages()[4];
    expect(synthUser.role).toBe('user');
    // Synth user message carries fresh tool_result blocks for the
    // regenerated tool_use ids — i.e. the LLM will see updated data on
    // resume.
    expect(
      (synthUser.content as Array<{ type: string; toolUseId: string }>).every(
        (b) => b.type === 'tool_result' && b.toolUseId.startsWith('regen_'),
      ),
    ).toBe(true);
  });

  // [SPEC 15 v0.7 follow-up — single-write regenerate, 2026-05-04]
  // Pre-v0.7 this test asserted that single-write actions short-
  // circuited with `pending_action_not_found`. v0.7 lifts that gate
  // and makes regenerate work for any action carrying
  // `canRegenerate=true` + non-empty `regenerateInput`. A single-
  // write action that DOESN'T carry those fields (e.g. a write whose
  // input came from user-typed values, not an upstream read) still
  // bails — but now correctly via `cannot_regenerate` rather than
  // `pending_action_not_found`.
  it('returns cannot_regenerate for single-write actions WITHOUT canRegenerate=true', async () => {
    const tools = applyToolFlags([makeBundleableWrite('swap_execute')]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });
    const singleWriteAction: PendingAction = {
      toolName: 'swap_execute',
      toolUseId: 'tc-1',
      input: { amount: 10 },
      description: 'swap',
      assistantContent: [],
      turnIndex: 1,
      attemptId: 'attempt-1',
      // No `steps`, no `canRegenerate` → not refreshable by intent.
    };
    const result = await regenerateBundle(engine, singleWriteAction);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('cannot_regenerate');
  });

  // [SPEC 15 v0.7 follow-up — single-write regenerate, 2026-05-04]
  // Positive path for single-write actions: a confirm-tier
  // `swap_execute` whose composition referenced a same-turn
  // `swap_quote` carries `canRegenerate=true` + non-empty
  // `regenerateInput`. Regenerate re-fires the upstream read, mints
  // a fresh `attemptId` (per SPEC 1), keeps the same `toolUseId`
  // (so resume's tool_use→tool_result pairing stays intact), and
  // preserves the action's input verbatim — only the freshness
  // metadata changes.
  it('re-fires regeneratable reads and rebuilds a single-write action with a fresh attemptId', async () => {
    const swapQuote = makeFlippingRead('swap_quote');
    const tools = applyToolFlags([
      swapQuote.tool,
      makeBundleableWrite('swap_execute'),
    ]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });

    engine.loadMessages(
      buildPriorReadHistory([
        { id: 'read-swap-1', name: 'swap_quote', result: { snapshot: 'call-pre' } },
      ]),
    );

    const singleWriteAction: PendingAction = {
      toolName: 'swap_execute',
      toolUseId: 'write-swap-1',
      input: { amount: 50, from: 'USDC', to: 'SUI' },
      description: 'Swap 50 USDC → SUI',
      assistantContent: [
        {
          type: 'tool_use',
          id: 'write-swap-1',
          name: 'swap_execute',
          input: { amount: 50, from: 'USDC', to: 'SUI' },
        },
      ],
      completedResults: [],
      turnIndex: 1,
      attemptId: 'original-write-swap-1',
      canRegenerate: true,
      regenerateInput: { toolUseIds: ['read-swap-1'] },
      quoteAge: 47_000,
      // No `steps` — single-write shape.
    };

    const result = await regenerateBundle(engine, singleWriteAction);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(swapQuote.callCount()).toBe(1);

    // Single-write rebuild — no `steps` populated.
    expect(result.newPendingAction.steps).toBeUndefined();

    // Same write, same toolUseId, same input — only attemptId is fresh.
    expect(result.newPendingAction.toolName).toBe('swap_execute');
    expect(result.newPendingAction.toolUseId).toBe('write-swap-1');
    expect(result.newPendingAction.input).toEqual({
      amount: 50,
      from: 'USDC',
      to: 'SUI',
    });
    expect(result.newPendingAction.attemptId).not.toBe('original-write-swap-1');

    // Freshness metadata recomputed off the new read timestamp.
    expect(result.newPendingAction.canRegenerate).toBe(true);
    expect(result.newPendingAction.quoteAge).toBeDefined();
    expect(result.newPendingAction.quoteAge!).toBeLessThan(2_000);

    const newRegenIds = result.newPendingAction.regenerateInput?.toolUseIds ?? [];
    expect(newRegenIds).toHaveLength(1);
    expect(newRegenIds[0].startsWith('regen_')).toBe(true);

    // timelineEvents: one tool_start + one tool_result for the
    // single re-fired read.
    expect(result.timelineEvents).toHaveLength(2);
    expect(result.timelineEvents[0].type).toBe('tool_start');
    expect(result.timelineEvents[0].toolName).toBe('swap_quote');
    expect(result.timelineEvents[1].type).toBe('tool_result');
  });

  it('returns cannot_regenerate when canRegenerate=false', async () => {
    const tools = applyToolFlags([
      makeBundleableWrite('swap_execute'),
      makeBundleableWrite('save_deposit'),
    ]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });
    const action = buildBundledAction({
      regenerateToolUseIds: [],
      steps: [
        { toolName: 'swap_execute', toolUseId: 'w-1', input: { amount: 1 } },
        { toolName: 'save_deposit', toolUseId: 'w-2', input: { amount: 1 } },
      ],
    });
    action.canRegenerate = false;

    const result = await regenerateBundle(engine, action);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('cannot_regenerate');
  });

  it('returns cannot_regenerate when regenerateInput.toolUseIds is empty', async () => {
    const tools = applyToolFlags([
      makeBundleableWrite('swap_execute'),
      makeBundleableWrite('save_deposit'),
    ]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });
    const action = buildBundledAction({
      regenerateToolUseIds: [],
      steps: [
        { toolName: 'swap_execute', toolUseId: 'w-1', input: { amount: 1 } },
        { toolName: 'save_deposit', toolUseId: 'w-2', input: { amount: 1 } },
      ],
    });
    // canRegenerate stays true but toolUseIds is empty — the second
    // validation gate kicks in.
    action.regenerateInput = { toolUseIds: [] };

    const result = await regenerateBundle(engine, action);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('cannot_regenerate');
  });

  it('returns engine_error when an original tool_use id is missing from history', async () => {
    const tools = applyToolFlags([
      makeBundleableWrite('swap_execute'),
      makeBundleableWrite('save_deposit'),
    ]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });
    // History deliberately empty — `regenerateInput.toolUseIds` references
    // ids that don't exist.
    engine.loadMessages([]);
    const action = buildBundledAction({
      regenerateToolUseIds: ['ghost-1'],
      steps: [
        { toolName: 'swap_execute', toolUseId: 'w-1', input: { amount: 1 } },
        { toolName: 'save_deposit', toolUseId: 'w-2', input: { amount: 1 } },
      ],
    });

    const result = await regenerateBundle(engine, action);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('engine_error');
    expect(result.message).toMatch(/not found/);
  });

  it('returns engine_error and surfaces the failure when a re-execution throws', async () => {
    const failingRead = buildTool({
      name: 'swap_quote',
      description: 'failing',
      inputSchema: z.object({}).passthrough(),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: true,
      async call() {
        throw new Error('Cetus 503');
      },
    });
    const tools = applyToolFlags([
      failingRead,
      makeBundleableWrite('swap_execute'),
      makeBundleableWrite('save_deposit'),
    ]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });
    engine.loadMessages(
      buildPriorReadHistory([
        { id: 'read-swap-1', name: 'swap_quote', result: { snapshot: 'pre' } },
      ]),
    );
    const action = buildBundledAction({
      regenerateToolUseIds: ['read-swap-1'],
      steps: [
        { toolName: 'swap_execute', toolUseId: 'w-1', input: { amount: 1 } },
        { toolName: 'save_deposit', toolUseId: 'w-2', input: { amount: 1 } },
      ],
    });

    const result = await regenerateBundle(engine, action);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe('engine_error');
    expect(result.message).toMatch(/swap_quote/);
  });

  it('skips non-regeneratable read tool_use_ids without failing', async () => {
    // `swap_execute` is in the regenerateInput set (a host-bug or stale
    // toolUseId) but it's not in REGENERATABLE_READ_TOOLS — should be
    // silently skipped, not fail the whole regenerate.
    const swapQuote = makeFlippingRead('swap_quote');
    const tools = applyToolFlags([
      swapQuote.tool,
      makeBundleableWrite('swap_execute'),
      makeBundleableWrite('save_deposit'),
    ]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });
    engine.loadMessages([
      ...buildPriorReadHistory([
        { id: 'read-swap-1', name: 'swap_quote', result: { snapshot: 'pre' } },
      ]),
      // Bonus assistant message with a write tool_use that shouldn't be
      // re-fired.
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'write-bogus-1',
            name: 'swap_execute',
            input: {},
          },
        ],
      },
    ]);
    const action = buildBundledAction({
      regenerateToolUseIds: ['read-swap-1', 'write-bogus-1'],
      steps: [
        { toolName: 'swap_execute', toolUseId: 'w-1', input: { amount: 1 } },
        { toolName: 'save_deposit', toolUseId: 'w-2', input: { amount: 1 } },
      ],
    });

    const result = await regenerateBundle(engine, action);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Only the regeneratable read fired.
    expect(swapQuote.callCount()).toBe(1);
    expect(result.timelineEvents).toHaveLength(2);
  });

  it('uses engine.invokeReadTool to re-run reads (verified via direct mock)', async () => {
    const swapQuote = makeFlippingRead('swap_quote');
    const tools = applyToolFlags([
      swapQuote.tool,
      makeBundleableWrite('swap_execute'),
      makeBundleableWrite('save_deposit'),
    ]);
    const engine = new QueryEngine({
      provider: createNoOpProvider(),
      tools,
      systemPrompt: 'test',
    });
    const invokeSpy = vi.spyOn(engine, 'invokeReadTool');
    engine.loadMessages(
      buildPriorReadHistory([
        { id: 'read-swap-1', name: 'swap_quote', result: { snapshot: 'pre' } },
      ]),
    );
    const action = buildBundledAction({
      regenerateToolUseIds: ['read-swap-1'],
      steps: [
        { toolName: 'swap_execute', toolUseId: 'w-1', input: { amount: 1 } },
        { toolName: 'save_deposit', toolUseId: 'w-2', input: { amount: 1 } },
      ],
    });
    const result = await regenerateBundle(engine, action);
    expect(result.success).toBe(true);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy).toHaveBeenCalledWith('swap_quote', {});
    invokeSpy.mockRestore();
  });
});
