import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { AnthropicProvider } from '../providers/anthropic.js';
import { buildTool } from '../tool.js';
import type { EngineEvent } from '../types.js';

// ---------------------------------------------------------------------------
// SPEC 8 v0.5.1 — slice 8 — multi-block thinking signature continuity
//
// The spec gap fix (v0.2 #1):
//   "Multi-block thinking signature continuity not tested |
//    Mandatory P3.2 acceptance test using real Anthropic API: emit ≥2
//    thinking blocks, round-trip the conversation, verify no signature
//    error. Hard CI gate."
//
// The risk this guards against: when Anthropic streams multi-block
// thinking, each block carries a cryptographic `signature`. If the engine
// drops, mangles, or reorders signatures across turn boundaries (e.g.
// during message rewrite, retry, or cache compaction), Anthropic rejects
// the next turn's request with a signature error. This is invisible in
// unit tests because mock providers don't validate signatures.
//
// Test shape:
//   1. Build an engine with extended thinking enabled (16k budget).
//   2. Provide a single dummy tool — the LLM calls it, then thinks
//      AGAIN before the final text. This is what produces ≥2 thinking
//      blocks in a single submitMessage() call.
//   3. Assert: no `error` events fired; turn_complete reached;
//      ≥2 thinking_done events, each with a unique blockIndex.
//
// Cost per run: ~$0.05–$0.15 (Anthropic Sonnet, ~3-4k thinking tokens).
//
// Gating:
//   - Skipped when ANTHROPIC_API_KEY is unset (default in local + CI
//     without the secret).
//   - In CI: enable by setting `ANTHROPIC_API_KEY` as a repo secret +
//     mapping it into the test job's env.
//   - Locally: `ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @t2000/engine test multi-block-thinking`
//
// If this test ever fails after passing, DO NOT merge until the
// regression is rooted out — signature corruption silently breaks every
// extended-thinking turn under load.
// ---------------------------------------------------------------------------

const HAS_API_KEY = Boolean(process.env.ANTHROPIC_API_KEY);

const dummyTool = buildTool({
  name: 'lookup_demo_value',
  description:
    'Returns a small piece of data the model can reason about. ' +
    'Use this tool exactly once when the user asks you to think through something — ' +
    'we need a tool round-trip to force the model to emit a second thinking block.',
  inputSchema: z.object({
    topic: z.string().describe('Short topic name'),
  }),
  jsonSchema: {
    type: 'object',
    properties: { topic: { type: 'string' } },
    required: ['topic'],
  },
  isReadOnly: true,
  cacheable: false,
  async call(input) {
    return {
      data: {
        topic: input.topic,
        sampleFigure: 0.42,
        note: 'This is dummy data for a thinking-continuity test.',
      },
    };
  },
});

describe.skipIf(!HAS_API_KEY)('multi-block thinking signature continuity (real Anthropic API)', () => {
  it('round-trips ≥2 thinking blocks without signature errors', async () => {
    const provider = new AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      defaultModel: 'claude-sonnet-4-20250514',
      defaultMaxTokens: 4096,
    });

    const engine = new QueryEngine({
      provider,
      tools: [dummyTool],
      systemPrompt:
        "You are a careful assistant. When the user asks you to think through " +
        "something, ALWAYS call lookup_demo_value first with a short topic, then " +
        "consider the returned data carefully before responding. Your final " +
        "response should reference the value you saw.",
      thinking: { type: 'enabled', budgetTokens: 16_000 },
      maxTurns: 3,
      model: 'claude-sonnet-4-20250514',
    });

    const events: EngineEvent[] = [];
    for await (const event of engine.submitMessage(
      'Think through whether 0.42 is a meaningful figure for a hypothetical metric. ' +
        'Pull the demo data first, then reason about it carefully and respond.',
    )) {
      events.push(event);
    }

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents, `unexpected errors: ${JSON.stringify(errorEvents)}`).toHaveLength(0);

    const turnComplete = events.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();

    const thinkingDones = events.filter((e): e is Extract<EngineEvent, { type: 'thinking_done' }> => e.type === 'thinking_done');
    expect(
      thinkingDones.length,
      `expected ≥2 thinking_done events to validate multi-block continuity, got ${thinkingDones.length}`,
    ).toBeGreaterThanOrEqual(2);

    const indices = thinkingDones.map((e) => e.blockIndex);
    expect(new Set(indices).size, 'thinking blockIndex values must be unique').toBe(indices.length);

    const toolStarts = events.filter((e) => e.type === 'tool_start');
    expect(toolStarts.length, 'expected the LLM to call lookup_demo_value at least once').toBeGreaterThan(0);
  }, 90_000);
});

describe('multi-block thinking continuity (gating sentinel)', () => {
  it('runs only when ANTHROPIC_API_KEY is set', () => {
    if (!HAS_API_KEY) {
      console.log(
        '[multi-block-thinking] skipped — set ANTHROPIC_API_KEY env var to enable the real-API regression test',
      );
    }
    expect(true).toBe(true);
  });
});
