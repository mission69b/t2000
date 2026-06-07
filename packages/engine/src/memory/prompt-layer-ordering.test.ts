// ---------------------------------------------------------------------------
// memory/prompt-layer-ordering.test.ts — Phase 7 integration test
// ---------------------------------------------------------------------------
//
// End-to-end verification that when `EngineConfig.memoryStore` is set:
//
//   1. The engine wires `prepareStep` (not the static `system` arg) on
//      its `streamText` call.
//   2. `prepareStep` calls `memoryStore.recall()` exactly ONCE per turn
//      (regardless of how many AI SDK steps fire under `stopWhen`).
//   3. The assembled system prompt presents the 4 layers in F-4 order:
//      base → memory → skill → user_message.
//   4. Recall failures degrade gracefully — the turn completes with an
//      empty `<memory_recall>` block (no throw, no abort).
//
// The verification probes the actual `prompt` argument the AI SDK
// passes to the underlying `LanguageModelV3.doStream()` — this is the
// authoritative source of what the LLM will see, downstream of every
// prepareStep transformation.
//
// **Why not snapshot the entire prompt?** Brittle. We assert the
// ORDER of the named layer markers (the base prompt's first words,
// `<memory_recall>`, the skill block's first words) — drift in any one
// of those marker strings breaks the test loudly, while non-layer copy
// edits stay green.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { simulateReadableStream } from 'ai';
import type { LanguageModelV3StreamPart, LanguageModelV3 } from '@ai-sdk/provider';
import { AISDKEngine, type AISDKEngineConfig } from '../v2/engine.js';
import { InMemoryMemoryStore } from './in-memory-store.js';
import type { EngineEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Stub LanguageModelV3 that CAPTURES the prompt arg on every doStream call
// ---------------------------------------------------------------------------

interface CapturedCall {
  prompt: unknown;
}

function buildCapturingStubModel(
  parts: LanguageModelV3StreamPart[],
  captured: CapturedCall[],
): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'stub-capturing',
    modelId: 'stub-model',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('stub model does not support doGenerate');
    },
    doStream: async (options: { prompt: unknown }) => {
      captured.push({ prompt: options.prompt });
      return {
        stream: simulateReadableStream({ chunks: parts }),
        request: { body: {} },
        response: {
          headers: {},
          id: 'stub',
          timestamp: new Date(),
          modelId: 'stub',
        },
        warnings: [],
      };
    },
  } as unknown as LanguageModelV3;
}

function installStubModel(
  engine: AISDKEngine,
  parts: LanguageModelV3StreamPart[],
  captured: CapturedCall[],
): void {
  const stubModel = buildCapturingStubModel(parts, captured);
  (engine as unknown as { anthropic: (name: string) => LanguageModelV3 }).anthropic = (() =>
    stubModel) as never;
}

/**
 * Extract the system message text from the captured `prompt` arg.
 * AI SDK passes the prompt as `Array<{ role, content }>` where the
 * system message is the first entry with `role: 'system'`.
 */
function extractSystemFromCapturedPrompt(prompt: unknown): string {
  if (!Array.isArray(prompt)) {
    throw new Error('expected prompt to be an array');
  }
  for (const msg of prompt as Array<{ role: string; content: unknown }>) {
    if (msg.role !== 'system') continue;
    // System content can be a string OR an array of text parts.
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter(
          (p): p is { type: 'text'; text: string } =>
            typeof p === 'object' && p !== null && 'text' in p,
        )
        .map((p) => p.text)
        .join('');
    }
  }
  return '';
}

async function collect(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_PROMPT = 'BASE_MARKER you are Audric, a financial agent.';
const SKILL_BLOCK = 'SKILL_MARKER: yield-comparison recipe active.';

function baseEngineConfig(): AISDKEngineConfig {
  return {
    anthropicApiKey: 'sk-test-fake-key-not-used',
    walletAddress: '0x91b88d0e7eaf45e3252a06ad57f6b9c79b1e7f8d3e0a6c1d2b3c4d5e6f7a8b9c',
    model: 'claude-haiku-4-5-20251001',
    maxTurns: 5,
    systemPrompt: BASE_PROMPT,
  };
}

const SIMPLE_TURN_PARTS: LanguageModelV3StreamPart[] = [
  { type: 'stream-start', warnings: [] },
  { type: 'response-metadata', id: 'r1', timestamp: new Date(), modelId: 'stub' },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: 'OK.' },
  { type: 'text-end', id: 't1' },
  {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'end_turn' },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 7 — 4-layer system prompt ordering', () => {
  it('does NOT wire prepareStep when memoryStore is undefined (legacy path preserved)', async () => {
    const engine = new AISDKEngine(baseEngineConfig());
    const captured: CapturedCall[] = [];
    installStubModel(engine, SIMPLE_TURN_PARTS, captured);

    await collect(engine.submitMessage('hi'));

    expect(captured.length).toBe(1);
    const system = extractSystemFromCapturedPrompt(captured[0].prompt);
    // Legacy path: just the base prompt; no F-4 layers.
    expect(system).toBe(BASE_PROMPT);
    expect(system).not.toContain('<memory_recall>');
    expect(system).not.toContain('SKILL_MARKER');
  });

  it('wires prepareStep when memoryStore is set; assembles 4 layers in F-4 order', async () => {
    const store = new InMemoryMemoryStore();
    await store.remember('user prefers USDC over USDsui for savings');
    await store.remember('user holds 100 USDC in NAVI lending pool');

    const engine = new AISDKEngine({
      ...baseEngineConfig(),
      memoryStore: store,
      skillRecipeBlock: SKILL_BLOCK,
    });

    const captured: CapturedCall[] = [];
    installStubModel(engine, SIMPLE_TURN_PARTS, captured);

    await collect(engine.submitMessage('What USDC should I save?'));

    expect(captured.length).toBe(1);
    const system = extractSystemFromCapturedPrompt(captured[0].prompt);

    // Each marker must appear AND in the F-4 order.
    const idxBase = system.indexOf('BASE_MARKER');
    const idxMemory = system.indexOf('<memory_recall>');
    const idxSkill = system.indexOf('SKILL_MARKER');

    expect(idxBase).toBeGreaterThanOrEqual(0);
    expect(idxMemory).toBeGreaterThan(idxBase);
    expect(idxSkill).toBeGreaterThan(idxMemory);

    // Memory block contains a recalled record (bag-of-words mock matched
    // on 'usdc' / 'save'). Pin to the specific text rendered so any drift
    // in the memory-layer formatter fails this test loudly.
    expect(system).toContain('user prefers USDC');
  });

  it('per-turn caching (end-to-end): recall fires ONCE per submitMessage call', async () => {
    const store = new InMemoryMemoryStore();
    await store.remember('user has 100 USDC saved');
    const recallSpy = vi.spyOn(store, 'recall');

    const engine = new AISDKEngine({
      ...baseEngineConfig(),
      memoryStore: store,
      skillRecipeBlock: SKILL_BLOCK,
    });

    const captured: CapturedCall[] = [];
    installStubModel(engine, SIMPLE_TURN_PARTS, captured);

    await collect(engine.submitMessage('show savings'));

    expect(recallSpy).toHaveBeenCalledTimes(1);
    expect(recallSpy).toHaveBeenCalledWith('show savings', { topK: 5 });
  });

  // -------------------------------------------------------------------------
  // Direct unit test of the prepareStep hook — proves the `stepNumber === 0`
  // guard, which the end-to-end test above can't exercise because the stub
  // model is single-step. Without this, removing the `=== 0` check would
  // silently degrade multi-step turns from 1 × recall to N × recall (MemWal
  // p95 470-675ms × N would wedge production turns).
  // -------------------------------------------------------------------------
  describe('buildPrepareStepHook (direct invocation)', () => {
    // Pull the private method out via cast-via-unknown — same pattern
    // the v2 engine tests use for stub-model installation. This is an
    // intentional test seam; the method's behavior is load-bearing for
    // cache semantics across multi-step turns.
    type HookFactory = (
      internal: unknown,
    ) => (opts: {
      stepNumber: number;
      messages: unknown[];
    }) => Promise<{ system: string }>;

    function getHookFactory(engine: AISDKEngine): HookFactory {
      return (engine as unknown as { buildPrepareStepHook: HookFactory })
        .buildPrepareStepHook;
    }

    function makeInternal() {
      // Minimal InternalContext shape — prepareStep only reads/writes
      // `toolContext.memoryCache`, so other fields can be empty stubs.
      return {
        toolContext: { memoryCache: undefined as unknown },
      };
    }

    it('fires recall at stepNumber === 0 and populates memoryCache', async () => {
      const store = new InMemoryMemoryStore();
      await store.remember('seed record');
      const spy = vi.spyOn(store, 'recall');

      const engine = new AISDKEngine({
        ...baseEngineConfig(),
        memoryStore: store,
      });
      const internal = makeInternal();
      const hook = getHookFactory(engine).call(engine, internal);

      const result = await hook({
        stepNumber: 0,
        messages: [{ role: 'user', content: 'first turn' }],
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('first turn', { topK: 5 });
      // memoryCache populated (even if recall returned [], the SLOT is set
      // — distinguishes "not yet recalled" from "recalled, no matches").
      expect(internal.toolContext.memoryCache).toBeDefined();
      // Layer 1 (base) appears in the assembled prompt.
      expect(result.system).toContain('BASE_MARKER');
    });

    it('DOES NOT fire recall at stepNumber > 0 (cache guard)', async () => {
      const store = new InMemoryMemoryStore();
      await store.remember('seed record');
      const spy = vi.spyOn(store, 'recall');

      const engine = new AISDKEngine({
        ...baseEngineConfig(),
        memoryStore: store,
      });
      const internal = makeInternal();
      // Pre-seed the cache as if step 0 already ran — assembler should
      // read from this, not re-recall.
      internal.toolContext.memoryCache = {
        query: 'first turn',
        results: [{ text: 'cached-record', distance: -1, metadata: {} }],
      };
      const hook = getHookFactory(engine).call(engine, internal);

      const result = await hook({
        stepNumber: 1,
        messages: [{ role: 'user', content: 'first turn' }],
      });

      // CRITICAL invariant: no second recall fires on step 1.
      expect(spy).not.toHaveBeenCalled();
      // The cached record is rendered into layer 3 (proves the assembler
      // is reading from the cache, not from a fresh recall).
      expect(result.system).toContain('cached-record');
    });

    it('multi-step turn: 5 prepareStep invocations = 1 recall total', async () => {
      const store = new InMemoryMemoryStore();
      await store.remember('seed record');
      const spy = vi.spyOn(store, 'recall');

      const engine = new AISDKEngine({
        ...baseEngineConfig(),
        memoryStore: store,
      });
      const internal = makeInternal();
      const hook = getHookFactory(engine).call(engine, internal);

      // Simulate 5 sequential prepareStep invocations within one turn —
      // exactly what AI SDK does under stopWhen: stepCountIs(5).
      for (let step = 0; step < 5; step++) {
        await hook({
          stepNumber: step,
          messages: [{ role: 'user', content: 'one query' }],
        });
      }

      // Cache invariant: 1 recall per turn, not N.
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('degradation: recall throws → engine continues with empty <memory_recall> block', async () => {
    const store = new InMemoryMemoryStore();
    vi.spyOn(store, 'recall').mockRejectedValue(new Error('MemWal circuit open'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const engine = new AISDKEngine({
      ...baseEngineConfig(),
      memoryStore: store,
      skillRecipeBlock: SKILL_BLOCK,
    });

    const captured: CapturedCall[] = [];
    installStubModel(engine, SIMPLE_TURN_PARTS, captured);

    // Turn must complete without throwing.
    const events = await collect(engine.submitMessage('hi'));
    expect(events.some((e) => e.type === 'turn_complete')).toBe(true);

    // System prompt must NOT contain the memory wrapper (empty results
    // → empty memory layer → omitted entirely by the filter).
    const system = extractSystemFromCapturedPrompt(captured[0].prompt);
    expect(system).not.toContain('<memory_recall>');

    // Other layers still present.
    expect(system).toContain('BASE_MARKER');
    expect(system).toContain('SKILL_MARKER');

    // Warning was logged (so production telemetry surfaces the outage).
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('memory recall failed'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('empty user message produces empty recall results (mock semantics)', async () => {
    const store = new InMemoryMemoryStore();
    await store.remember('some prior fact');
    const recallSpy = vi.spyOn(store, 'recall');

    const engine = new AISDKEngine({
      ...baseEngineConfig(),
      memoryStore: store,
    });

    const captured: CapturedCall[] = [];
    installStubModel(engine, SIMPLE_TURN_PARTS, captured);

    // Empty user message — recall called with '' which returns [] from
    // the InMemoryMemoryStore mock (matches MemWal-like behavior).
    await collect(engine.submitMessage(''));

    expect(recallSpy).toHaveBeenCalledTimes(1);
    const system = extractSystemFromCapturedPrompt(captured[0].prompt);
    // No memory block when recall returns empty.
    expect(system).not.toContain('<memory_recall>');
  });

  it('skill layer absent when not configured', async () => {
    const store = new InMemoryMemoryStore();
    await store.remember('user prefers USDC');

    const engine = new AISDKEngine({
      ...baseEngineConfig(),
      memoryStore: store,
      // skillRecipeBlock deliberately omitted
    });

    const captured: CapturedCall[] = [];
    installStubModel(engine, SIMPLE_TURN_PARTS, captured);

    await collect(engine.submitMessage('USDC question'));

    const system = extractSystemFromCapturedPrompt(captured[0].prompt);
    expect(system).toContain('BASE_MARKER');
    expect(system).toContain('<memory_recall>');
    expect(system).not.toContain('SKILL_MARKER');

    // Order between the two present layers still holds (base before memory).
    expect(system.indexOf('BASE_MARKER')).toBeLessThan(
      system.indexOf('<memory_recall>'),
    );
  });
});
