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

import { describe, it, expect } from 'vitest';
import { AISDKEngine, type AISDKEngineConfig } from './engine.js';
import type { EngineEvent } from '../types.js';

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
