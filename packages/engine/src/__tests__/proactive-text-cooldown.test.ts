import { describe, it, expect } from 'vitest';
import { QueryEngine } from '../engine.js';
import type {
  LLMProvider,
  ChatParams,
  ProviderEvent,
  EngineEvent,
} from '../types.js';
import type { ProactiveMarker } from '../proactive-marker.js';

// ---------------------------------------------------------------------------
// SPEC 9 v0.1.1 P9.2 — proactive_text cooldown integration test
//
// Verifies the wiring: provider emits `text_done` with a parsed
// `proactiveMarker` → engine consults its per-session cooldown Set →
// emits the public `proactive_text` event with `suppressed: false` on
// first sighting, `suppressed: true` on every later sighting of the
// same `(proactiveType, subjectKey)` tuple within the same engine
// instance.
//
// Important: the cooldown Set lives on the QueryEngine instance, so
// it persists ACROSS submitMessage calls within the same instance
// (one engine = one session). A different engine instance starts
// with a clean set — that's the per-session boundary.
// ---------------------------------------------------------------------------

interface ScriptedTurn {
  text: string;
  proactiveMarker?: ProactiveMarker;
}

function createMockProvider(turns: ScriptedTurn[]): LLMProvider {
  let callIndex = 0;
  return {
    async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
      const turn = turns[callIndex] ?? { text: '' };
      callIndex++;
      yield {
        type: 'message_start',
        messageId: `msg-${callIndex}`,
        model: 'mock-model',
      };
      yield { type: 'usage', inputTokens: 50, outputTokens: 25 };
      yield { type: 'text_delta', text: turn.text };
      yield {
        type: 'text_done',
        ...(turn.proactiveMarker ? { proactiveMarker: turn.proactiveMarker } : {}),
      };
      yield { type: 'stop', reason: 'end_turn' };
    },
  };
}

async function collectEvents(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('proactive_text cooldown integration', () => {
  it('emits proactive_text with suppressed:false on first sighting', async () => {
    const provider = createMockProvider([
      {
        text: '<proactive type="idle_balance" subjectKey="USDC">You have idle USDC.</proactive>',
        proactiveMarker: {
          proactiveType: 'idle_balance',
          subjectKey: 'USDC',
          body: 'You have idle USDC.',
          markerCount: 1,
        },
      },
    ]);

    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'Test' });
    const events = await collectEvents(engine.submitMessage('Hi'));

    const proactive = events.find((e) => e.type === 'proactive_text');
    expect(proactive).toBeDefined();
    if (proactive?.type === 'proactive_text') {
      expect(proactive.suppressed).toBe(false);
      expect(proactive.proactiveType).toBe('idle_balance');
      expect(proactive.subjectKey).toBe('USDC');
      expect(proactive.body).toBe('You have idle USDC.');
      expect(proactive.markerCount).toBe(1);
    }
  });

  it('suppresses the second sighting of the same (type, subjectKey) within one engine instance', async () => {
    const marker: ProactiveMarker = {
      proactiveType: 'idle_balance',
      subjectKey: 'USDC',
      body: 'Same insight, second turn.',
      markerCount: 1,
    };
    const provider = createMockProvider([
      {
        text: '<proactive type="idle_balance" subjectKey="USDC">Cold turn.</proactive>',
        proactiveMarker: { ...marker, body: 'Cold turn.' },
      },
      {
        text: '<proactive type="idle_balance" subjectKey="USDC">Same insight, second turn.</proactive>',
        proactiveMarker: marker,
      },
    ]);

    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'Test' });

    const turn1 = await collectEvents(engine.submitMessage('First'));
    const proactive1 = turn1.find((e) => e.type === 'proactive_text');
    expect(proactive1?.type === 'proactive_text' && proactive1.suppressed).toBe(false);

    const turn2 = await collectEvents(engine.submitMessage('Second'));
    const proactive2 = turn2.find((e) => e.type === 'proactive_text');
    expect(proactive2?.type === 'proactive_text' && proactive2.suppressed).toBe(true);
  });

  it('does NOT suppress a different subjectKey under the same proactiveType', async () => {
    const provider = createMockProvider([
      {
        text: 'Insight on USDC.',
        proactiveMarker: {
          proactiveType: 'idle_balance',
          subjectKey: 'USDC',
          body: 'USDC body.',
          markerCount: 1,
        },
      },
      {
        text: 'Insight on SUI.',
        proactiveMarker: {
          proactiveType: 'idle_balance',
          subjectKey: 'SUI',
          body: 'SUI body.',
          markerCount: 1,
        },
      },
    ]);

    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'Test' });
    const turn1 = await collectEvents(engine.submitMessage('First'));
    const turn2 = await collectEvents(engine.submitMessage('Second'));

    const p1 = turn1.find((e) => e.type === 'proactive_text');
    const p2 = turn2.find((e) => e.type === 'proactive_text');
    expect(p1?.type === 'proactive_text' && p1.suppressed).toBe(false);
    expect(p2?.type === 'proactive_text' && p2.suppressed).toBe(false);
  });

  it('does NOT suppress the same subjectKey under a DIFFERENT proactiveType', async () => {
    const provider = createMockProvider([
      {
        text: 'idle_balance for USDC.',
        proactiveMarker: {
          proactiveType: 'idle_balance',
          subjectKey: 'USDC',
          body: 'idle.',
          markerCount: 1,
        },
      },
      {
        text: 'apy_drift for USDC.',
        proactiveMarker: {
          proactiveType: 'apy_drift',
          subjectKey: 'USDC',
          body: 'rate moved.',
          markerCount: 1,
        },
      },
    ]);

    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'Test' });
    const turn1 = await collectEvents(engine.submitMessage('First'));
    const turn2 = await collectEvents(engine.submitMessage('Second'));
    const p1 = turn1.find((e) => e.type === 'proactive_text');
    const p2 = turn2.find((e) => e.type === 'proactive_text');
    expect(p1?.type === 'proactive_text' && p1.suppressed).toBe(false);
    expect(p2?.type === 'proactive_text' && p2.suppressed).toBe(false);
  });

  it('emits no proactive_text event when the provider sends text_done without a marker', async () => {
    const provider = createMockProvider([{ text: 'Just answering the question.' }]);
    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'Test' });
    const events = await collectEvents(engine.submitMessage('Hi'));
    expect(events.find((e) => e.type === 'proactive_text')).toBeUndefined();
  });

  it('rehydrates the cooldown from prior assistant blocks loaded via loadMessages', async () => {
    // [SPEC 9 v0.1.1 P9.2 / R3] Hosts that build a fresh QueryEngine per
    // HTTP request (audric does this) replay history through `loadMessages`.
    // The engine must seed its in-memory cooldown from the loaded blocks
    // so the second turn of a session that previously emitted a marker
    // reports `suppressed: true` even though the engine instance is new.
    const provider = createMockProvider([
      {
        text: '<proactive type="idle_balance" subjectKey="USDC">Same insight, second engine instance.</proactive>',
        proactiveMarker: {
          proactiveType: 'idle_balance',
          subjectKey: 'USDC',
          body: 'Same insight, second engine instance.',
          markerCount: 1,
        },
      },
    ]);
    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'Test' });
    engine.loadMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hi' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: '<proactive type="idle_balance" subjectKey="USDC">First sighting, prior session.</proactive>',
          },
        ],
      },
    ]);

    const events = await collectEvents(engine.submitMessage('Second'));
    const proactive = events.find((e) => e.type === 'proactive_text');
    expect(proactive?.type === 'proactive_text' && proactive.suppressed).toBe(true);
  });

  it('rehydrate ignores user-message proactive markers (only assistant emits count)', async () => {
    // A user might paste a transcript that mentions <proactive ...>; the
    // cooldown rehydrate must NOT seed from user content because the user
    // never authored an emission.
    const provider = createMockProvider([
      {
        text: 'first emission',
        proactiveMarker: {
          proactiveType: 'idle_balance',
          subjectKey: 'USDC',
          body: 'first emission',
          markerCount: 1,
        },
      },
    ]);
    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'Test' });
    engine.loadMessages([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'paste: <proactive type="idle_balance" subjectKey="USDC">old transcript</proactive>',
          },
        ],
      },
    ]);

    const events = await collectEvents(engine.submitMessage('go'));
    const proactive = events.find((e) => e.type === 'proactive_text');
    expect(proactive?.type === 'proactive_text' && proactive.suppressed).toBe(false);
  });

  it('cooldown is per-engine-instance — fresh engine starts cold', async () => {
    const marker: ProactiveMarker = {
      proactiveType: 'goal_progress',
      subjectKey: 'save-500-by-may',
      body: '$120 to go.',
      markerCount: 1,
    };

    const e1 = new QueryEngine({
      provider: createMockProvider([{ text: 'first', proactiveMarker: marker }]),
      tools: [],
      systemPrompt: 'Test',
    });
    const t1 = await collectEvents(e1.submitMessage('Hi'));
    const p1 = t1.find((e) => e.type === 'proactive_text');
    expect(p1?.type === 'proactive_text' && p1.suppressed).toBe(false);

    // Fresh engine = fresh session = fresh cooldown.
    const e2 = new QueryEngine({
      provider: createMockProvider([{ text: 'first-of-second-session', proactiveMarker: marker }]),
      tools: [],
      systemPrompt: 'Test',
    });
    const t2 = await collectEvents(e2.submitMessage('Hi'));
    const p2 = t2.find((e) => e.type === 'proactive_text');
    expect(p2?.type === 'proactive_text' && p2.suppressed).toBe(false);
  });

  it('forwards markerCount > 1 to the host (LLM violation signal)', async () => {
    const provider = createMockProvider([
      {
        text: 'two markers in one turn',
        proactiveMarker: {
          proactiveType: 'hf_warning',
          subjectKey: '1.45',
          body: 'first marker body.',
          markerCount: 2,
        },
      },
    ]);
    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'Test' });
    const events = await collectEvents(engine.submitMessage('Hi'));
    const proactive = events.find((e) => e.type === 'proactive_text');
    if (proactive?.type === 'proactive_text') {
      expect(proactive.markerCount).toBe(2);
    }
  });
});
