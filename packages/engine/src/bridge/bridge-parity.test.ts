// ---------------------------------------------------------------------------
// bridge-parity.test.ts — structural parity contract test
// ---------------------------------------------------------------------------
//
// Day 20e — codifies the Day 20c finding:
//
//   > "Bridge translators must mirror EVERY side-channel event the legacy
//   >  engine emits. The Phase 1 bridge implementation focused on
//   >  `tool_result` parity and silently dropped `canvas` + `todo_update`.
//   >  There's no test that catches 'engine yields N events but bridge
//   >  yields M < N' for the same input — only per-event correctness tests."
//
// The structural contract: every variant of `EngineEvent` in `types.ts` MUST
// be classified as either:
//
//   • BRIDGE_EMITS — the bridge `translate()` is the producer; if the legacy
//     `QueryEngine` emits it from inside the LLM stream, the bridge MUST too.
//   • OUTER_ENGINE_EMITS — emitted by code OUTSIDE the LLM stream
//     (orchestration, pre-flight, post-write-refresh, host-driven). Bridge
//     correctly does NOT translate; outer engine code emits directly.
//
// Why this matters
// ----------------
// Without this gate, the "bridge dropped a side-channel event" bug class
// recurs every time a new `EngineEvent` variant lands. The recurrence cost
// is HIGH: bugs only surface via founder smoke + persisted-session inspection
// (cf. Day 20c discovery path), not via unit tests. By forcing every new
// variant through this gate, contributors MUST decide upfront which side
// owns it — and if they pick BRIDGE_EMITS they MUST add a fixture test in
// `event-bridge.test.ts` proving the bridge actually emits it.
//
// What this test does
// -------------------
// 1. Asserts the union of (BRIDGE_EMITS ∪ OUTER_ENGINE_EMITS) covers every
//    `EngineEvent['type']` literal — no orphan variants.
// 2. Asserts BRIDGE_EMITS and OUTER_ENGINE_EMITS are disjoint.
// 3. For every type in BRIDGE_EMITS, asserts `translate()` returns at least
//    one event of that type for a synthetic input that should produce it.
//    This is the "bridge actually wired it up" gate.
//
// What this test does NOT do
// --------------------------
// - Does NOT replace per-event correctness tests in `event-bridge.test.ts`.
//   Those tests verify the SHAPE of each emitted event. This test verifies
//   the EXISTENCE of an emit path. Both are needed.
// - Does NOT test outer engine emit paths. Those live in `engine.test.ts`
//   and similar.
// - Does NOT verify field-level shape parity (e.g. "legacy `tool_result`
//   carries `source: 'llm'`; bridge does too"). Per-event tests own that.
//
// How to extend
// -------------
// Adding a new `EngineEvent` variant: edit `types.ts`, run this test, see
// it fail with "uncategorised variant: 'X'". Add `'X'` to either
// BRIDGE_EMITS or OUTER_ENGINE_EMITS. If BRIDGE_EMITS, also:
//   a) Add a `translate()` arm in `event-bridge.ts` that emits the variant.
//   b) Add a fixture test in `event-bridge.test.ts` verifying the emit
//      under a realistic AI SDK stream event.
//   c) Add a smoke fixture to the BRIDGE_EMIT_FIXTURES map below so this
//      file's third assertion exercises the path.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { translate, createBridgeState } from './event-bridge.js';
import type { AISDKStreamEvent } from './ai-sdk-types.js';
import type { EngineEvent } from '../types.js';

// ---------------------------------------------------------------------------
// The contract — every `EngineEvent['type']` literal lives in one of these
// two sets. If you add a new variant to `types.ts` and don't update this
// file, the union-coverage assertion below fails with a clear message.
// ---------------------------------------------------------------------------

/**
 * Variants the bridge translator owns. Each one MUST have:
 *  (a) a corresponding `translate()` arm in `event-bridge.ts`
 *  (b) a fixture in `BRIDGE_EMIT_FIXTURES` below
 *  (c) a per-event correctness test in `event-bridge.test.ts`
 */
const BRIDGE_EMITS = new Set<EngineEvent['type']>([
  'thinking_delta',
  'thinking_done',
  'text_delta',
  'tool_start',
  'tool_result',
  'canvas',
  'todo_update',
  'usage',
  'turn_complete',
  'error',
]);

/**
 * Variants emitted by code OUTSIDE the LLM stream loop. The bridge must
 * NOT translate these. Each entry is paired with a short justification.
 */
const OUTER_ENGINE_EMITS = new Set<EngineEvent['type']>([
  // Engine orchestration: `runAgentLoop` emits this after the permission
  // gate fires (post-stream, post-tool-call). Bridge runs INSIDE the stream
  // and cannot know whether a tool needs `confirm` vs `auto` — that
  // decision lives in `resolvePermissionTier` and `runGuards`, both outer.
  'pending_action',
  // Side-channel input form. Emitted by the engine when a tool's preflight
  // returns `needsInput`. The bridge is stateless; the engine owns the
  // pending state map keyed by `inputId`.
  'pending_input',
  // Tool-side progress events. Tools call `context.progress?.(msg, pct)`
  // from inside their `call` impl; engine queues + yields. Bridge never
  // sees these because they don't flow through the AI SDK stream.
  'tool_progress',
  // Mid-turn context-window compaction signal. Emitted by `agentLoop`
  // when `compactMessages` fires. Not part of the LLM stream.
  'compaction',
  // Final-text proactive marker (`<proactive>BODY</proactive>`). Engine
  // parses the marker AFTER the text-stream finishes, applies session
  // cooldown, then emits. Bridge doesn't know about the cooldown.
  'proactive_text',
  // One-shot per-turn shape declaration. Emitted at `submitMessage` start
  // by the outer engine before `agentLoop` begins.
  'harness_shape',
  // SPEC 21 transition choreography. Hosts wrap their EngineEvent
  // iteration with `withStreamState` — outer SSE plumbing, never the
  // LLM stream. (Pre-v2.2.0 the deleted `engineToSSE` adapter applied
  // this wrapper by default.)
  'stream_state',
]);

// ---------------------------------------------------------------------------
// Synthetic AI SDK input fixtures — minimal events that prove each
// BRIDGE_EMITS variant has a wired translate() arm. Per-event SHAPE
// correctness lives in event-bridge.test.ts; this test only verifies that
// `translate()` produces at least one event of the expected type.
// ---------------------------------------------------------------------------

type FixtureBuilder = () => { input: AISDKStreamEvent; expectedType: EngineEvent['type'] };

const BRIDGE_EMIT_FIXTURES: Record<
  Exclude<EngineEvent['type'], never>,
  FixtureBuilder | null
> = {
  // Bridge-owned: each has a fixture that exercises the translate() arm.
  thinking_delta: () => ({
    input: { type: 'reasoning-delta', id: 'r1', text: 'thinking…' } as AISDKStreamEvent,
    expectedType: 'thinking_delta',
  }),
  thinking_done: () => ({
    input: { type: 'reasoning-end', id: 'r1' } as AISDKStreamEvent,
    expectedType: 'thinking_done',
  }),
  text_delta: () => ({
    input: { type: 'text-delta', id: 't1', text: 'hello' } as AISDKStreamEvent,
    expectedType: 'text_delta',
  }),
  tool_start: () => ({
    input: {
      type: 'tool-call',
      toolName: 'balance_check',
      toolCallId: 'tc1',
      input: {},
    } as AISDKStreamEvent,
    expectedType: 'tool_start',
  }),
  tool_result: () => ({
    input: {
      type: 'tool-result',
      toolName: 'balance_check',
      toolCallId: 'tc1',
      input: {},
      output: { totalUsd: 100 },
    } as AISDKStreamEvent,
    expectedType: 'tool_result',
  }),
  canvas: () => ({
    input: {
      type: 'tool-result',
      toolName: 'render_canvas',
      toolCallId: 'tc-canvas',
      input: {},
      output: {
        __canvas: true,
        template: 'portfolio_timeline',
        title: 'Net Worth Over Time',
        templateData: { address: '0xabc' },
      },
    } as AISDKStreamEvent,
    expectedType: 'canvas',
  }),
  todo_update: () => ({
    input: {
      type: 'tool-result',
      toolName: 'update_todo',
      toolCallId: 'tc-todo',
      input: {},
      output: {
        __todoUpdate: true,
        items: [{ id: '1', content: 'task', status: 'pending' }],
      },
    } as AISDKStreamEvent,
    expectedType: 'todo_update',
  }),
  usage: () => ({
    input: {
      type: 'finish',
      finishReason: 'stop',
      totalUsage: { inputTokens: 100, outputTokens: 50 },
    } as AISDKStreamEvent,
    expectedType: 'usage',
  }),
  turn_complete: () => ({
    input: { type: 'finish', finishReason: 'stop' } as AISDKStreamEvent,
    expectedType: 'turn_complete',
  }),
  error: () => ({
    input: { type: 'error', error: new Error('boom') } as AISDKStreamEvent,
    expectedType: 'error',
  }),

  // Outer-engine-owned: no fixture, marked null. The union-coverage
  // assertion uses these entries to prove the variant is acknowledged.
  pending_action: null,
  pending_input: null,
  tool_progress: null,
  compaction: null,
  proactive_text: null,
  harness_shape: null,
  stream_state: null,
};

// ---------------------------------------------------------------------------
// The actual tests
// ---------------------------------------------------------------------------

describe('bridge-parity — structural contract', () => {
  it('every EngineEvent variant is classified as BRIDGE_EMITS or OUTER_ENGINE_EMITS', () => {
    // This assertion fails when someone adds a new EngineEvent variant to
    // types.ts and forgets to update the contract above. The fix is to
    // decide which side owns the new variant and add it to the matching
    // set + provide a fixture (BRIDGE_EMITS) or a comment (OUTER_ENGINE_EMITS).
    //
    // We derive the full set of variants from BRIDGE_EMIT_FIXTURES keys
    // (which is typed as `Record<EngineEvent['type'], ...>`, so TypeScript
    // enforces exhaustiveness at compile time). If a new variant lands
    // without an entry here, this file fails to TYPECHECK — TypeScript is
    // the first gate, this runtime check is the safety net.
    const allVariants = Object.keys(BRIDGE_EMIT_FIXTURES) as EngineEvent['type'][];
    const classified = new Set([...BRIDGE_EMITS, ...OUTER_ENGINE_EMITS]);

    const uncategorized = allVariants.filter((v) => !classified.has(v));
    expect(
      uncategorized,
      `Uncategorised EngineEvent variants: ${uncategorized.join(', ')}. Add each to either BRIDGE_EMITS or OUTER_ENGINE_EMITS in bridge-parity.test.ts.`,
    ).toEqual([]);
  });

  it('BRIDGE_EMITS and OUTER_ENGINE_EMITS are disjoint', () => {
    const overlap = [...BRIDGE_EMITS].filter((v) => OUTER_ENGINE_EMITS.has(v));
    expect(
      overlap,
      `Variants in both BRIDGE_EMITS and OUTER_ENGINE_EMITS: ${overlap.join(', ')}. Each variant has exactly one owner.`,
    ).toEqual([]);
  });

  it('BRIDGE_EMIT_FIXTURES has a builder for every BRIDGE_EMITS variant (and only those)', () => {
    const fixturesPresent = (Object.entries(BRIDGE_EMIT_FIXTURES) as Array<
      [EngineEvent['type'], FixtureBuilder | null]
    >)
      .filter(([, builder]) => builder !== null)
      .map(([variant]) => variant);
    const fixtureSet = new Set(fixturesPresent);

    const missing = [...BRIDGE_EMITS].filter((v) => !fixtureSet.has(v));
    expect(
      missing,
      `BRIDGE_EMITS variants without a fixture: ${missing.join(', ')}. Add a fixture builder to BRIDGE_EMIT_FIXTURES.`,
    ).toEqual([]);

    const extra = [...fixtureSet].filter((v) => !BRIDGE_EMITS.has(v));
    expect(
      extra,
      `Fixtures for variants not in BRIDGE_EMITS: ${extra.join(', ')}. Either remove the fixture or move the variant.`,
    ).toEqual([]);
  });
});

describe('bridge-parity — every BRIDGE_EMITS variant has a wired translate() arm', () => {
  for (const variant of BRIDGE_EMITS) {
    it(`translate() emits a "${variant}" event for the BRIDGE_EMIT_FIXTURES['${variant}'] input`, () => {
      const builder = BRIDGE_EMIT_FIXTURES[variant];
      if (builder === null) {
        throw new Error(`No fixture for BRIDGE_EMITS variant '${variant}' — bridge-parity contract violation`);
      }
      const { input, expectedType } = builder();
      const state = createBridgeState();
      const out = translate(input, state);
      const types = out.map((e) => e.type);
      expect(
        types,
        `translate() produced ${JSON.stringify(types)} for input ${input.type}, expected at least one "${expectedType}" event. Either fix the translate() arm or update the fixture.`,
      ).toContain(expectedType);
    });
  }
});
