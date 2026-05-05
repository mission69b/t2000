/**
 * SPEC 9 v0.1.3 P9.5 — Canonical eval (scripted-provider edition)
 *
 * One file, three use cases. Each use case is the canonical scenario the
 * spec promised v0.1.1 would deliver. Scripted providers stand in for
 * Haiku and Sonnet: we drive the engine through the EXACT event sequence
 * a real LLM would produce when behaving correctly. Real-LLM verification
 * (does Haiku actually emit `<proactive>` markers? Does Sonnet actually
 * call `add_recipient` on unknown contacts?) lives in
 * `spec/runbooks/RUNBOOK_spec9_p95_eval.md` — manual smoke after P9.6
 * deploys engine v1.18.0 to audric/web.
 *
 * The contract this file enforces: when a model behaves correctly, the
 * engine wires every R3/R4/R6 gate the spec promised. If a future engine
 * change quietly breaks a gate, this file is the regression net.
 *
 * Use-case map
 * ────────────
 *  UC1 — Idle-balance proactive nudge with same-session cooldown (R3)
 *        Turn 1: LLM emits <proactive type=idle_balance subjectKey=USDC>
 *        Turn 2: same marker — engine flags suppressed:true
 *  UC2 — Persistent goal flag on update_todo (R4 host gate verified
 *        separately in audric/apps/web/lib/engine/__tests__/financial-
 *        context-block.test.ts; this file pins the engine-side contract
 *        the host depends on)
 *  UC3 — LLM-initiated add-contact via inline form (R6)
 *        Turn 1: LLM calls add_recipient with empty input → engine emits
 *                pending_input with kind:'sui-recipient' on identifier
 *        Resume: host echoes back values → engine resumes and calls the
 *                tool → LLM narrates "Saved Mom"
 *
 * Gate cross-reference (mirrors SPEC 9 v0.1.3 § Suggested sequencing P9.5)
 * ────────────────────────────────────────────────────────────────────────
 *  R3 (per-session cooldown)         → UC1 expectations 2.a + 2.b
 *  R4 (lean-shape teaching gate)     → UC2 host-side test (referenced)
 *  R5 (no dismiss_goal engine tool)  → UC2 expectation 1.b (registry check)
 *  R6 (kind:'sui-recipient')         → UC3 expectation 1.b
 */
import { describe, it, expect } from 'vitest';
import { QueryEngine } from '../engine.js';
import { applyToolFlags } from '../tool-flags.js';
import { addRecipientTool } from '../tools/add-recipient.js';
import { updateTodoTool } from '../tools/update-todo.js';
import { READ_TOOLS, WRITE_TOOLS } from '../tools/index.js';
import type {
  ChatParams,
  EngineEvent,
  LLMProvider,
  ProviderEvent,
} from '../types.js';
import type { ProactiveMarker } from '../proactive-marker.js';
import type { PendingInput } from '../pending-input.js';

// ---------------------------------------------------------------------------
// Mock provider — supports text, proactive markers, and tool calls in one
// turn shape. Mirrors the patterns in proactive-text-cooldown.test.ts +
// pending-input.test.ts; consolidated here so the canonical eval is
// self-contained.
// ---------------------------------------------------------------------------

type ScriptedAction =
  | { type: 'text'; text: string; proactiveMarker?: ProactiveMarker }
  | { type: 'tool_call'; id: string; name: string; input: unknown };

function createMockProvider(turns: ScriptedAction[][]): LLMProvider {
  let callIndex = 0;
  return {
    async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
      const turn = turns[callIndex] ?? [];
      callIndex++;
      yield { type: 'message_start', messageId: `msg-${callIndex}`, model: 'mock' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      const hasToolCalls = turn.some((t) => t.type === 'tool_call');
      let textBuffer = '';
      let pendingMarker: ProactiveMarker | undefined;
      for (const item of turn) {
        if (item.type === 'text') {
          if (item.text) {
            yield { type: 'text_delta', text: item.text };
            textBuffer += item.text;
          }
          if (item.proactiveMarker) pendingMarker = item.proactiveMarker;
        } else {
          if (textBuffer) {
            yield {
              type: 'text_done',
              ...(pendingMarker ? { proactiveMarker: pendingMarker } : {}),
            };
            textBuffer = '';
            pendingMarker = undefined;
          }
          yield { type: 'tool_use_start', id: item.id, name: item.name };
          yield { type: 'tool_use_done', id: item.id, name: item.name, input: item.input };
        }
      }
      if (textBuffer) {
        yield {
          type: 'text_done',
          ...(pendingMarker ? { proactiveMarker: pendingMarker } : {}),
        };
      }
      yield { type: 'stop', reason: hasToolCalls ? 'tool_use' : 'end_turn' };
    },
  };
}

async function collectEvents(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

// ===========================================================================
// UC1 — Idle-balance proactive nudge with same-session cooldown (R3)
// ===========================================================================

describe('SPEC 9 P9.5 · UC1 — proactive nudge same-session cooldown (R3)', () => {
  // Canonical narration the LLM would produce on each turn. Verbatim
  // matches the system-prompt teaching pattern from P9.2.
  const CANONICAL_BODY =
    'You have $120 idle USDC sitting in your wallet — saving it would earn ~$5/mo at the current 4.5% NAVI APY.';
  const MARKER: ProactiveMarker = {
    proactiveType: 'idle_balance',
    subjectKey: 'USDC',
    body: CANONICAL_BODY,
    markerCount: 1,
  };

  it('1.a — first sighting in a session yields proactive_text with suppressed:false', async () => {
    const provider = createMockProvider([
      [
        {
          type: 'text',
          text: `<proactive type="idle_balance" subjectKey="USDC">${CANONICAL_BODY}</proactive>`,
          proactiveMarker: MARKER,
        },
      ],
    ]);
    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('what is my balance?'));

    const proactive = events.find((e) => e.type === 'proactive_text');
    expect(proactive).toBeDefined();
    if (proactive?.type !== 'proactive_text') throw new Error('narrowing');
    expect(proactive.suppressed).toBe(false);
    expect(proactive.proactiveType).toBe('idle_balance');
    expect(proactive.subjectKey).toBe('USDC');
    expect(proactive.body).toBe(CANONICAL_BODY);
  });

  it('1.b — second sighting of the same (type, subjectKey) within the same engine yields suppressed:true', async () => {
    const provider = createMockProvider([
      [
        {
          type: 'text',
          text: `<proactive type="idle_balance" subjectKey="USDC">${CANONICAL_BODY}</proactive>`,
          proactiveMarker: MARKER,
        },
      ],
      [
        {
          type: 'text',
          text: `<proactive type="idle_balance" subjectKey="USDC">${CANONICAL_BODY}</proactive>`,
          proactiveMarker: MARKER,
        },
      ],
    ]);
    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'test' });

    const turn1 = await collectEvents(engine.submitMessage('balance?'));
    const turn2 = await collectEvents(engine.submitMessage('check again'));

    const p1 = turn1.find((e) => e.type === 'proactive_text');
    const p2 = turn2.find((e) => e.type === 'proactive_text');

    if (p1?.type !== 'proactive_text' || p2?.type !== 'proactive_text') {
      throw new Error('expected proactive_text on both turns');
    }
    expect(p1.suppressed).toBe(false);
    expect(p2.suppressed).toBe(true);
  });

  it('1.c — cooldown is per-(type,subjectKey) — different subjectKey re-fires (canonical SUI nudge after USDC nudge)', async () => {
    const provider = createMockProvider([
      [
        {
          type: 'text',
          text: '<proactive type="idle_balance" subjectKey="USDC">USDC body.</proactive>',
          proactiveMarker: { ...MARKER, body: 'USDC body.' },
        },
      ],
      [
        {
          type: 'text',
          text: '<proactive type="idle_balance" subjectKey="SUI">SUI body.</proactive>',
          proactiveMarker: {
            proactiveType: 'idle_balance',
            subjectKey: 'SUI',
            body: 'SUI body.',
            markerCount: 1,
          },
        },
      ],
    ]);
    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'test' });
    const turn1 = await collectEvents(engine.submitMessage('first'));
    const turn2 = await collectEvents(engine.submitMessage('second'));
    const p1 = turn1.find((e) => e.type === 'proactive_text');
    const p2 = turn2.find((e) => e.type === 'proactive_text');
    expect(p1?.type === 'proactive_text' && p1.suppressed).toBe(false);
    expect(p2?.type === 'proactive_text' && p2.suppressed).toBe(false);
  });

  it('1.d — fresh QueryEngine instance with replayed history rehydrates the cooldown set (audric request-scoped pattern)', async () => {
    // [P9.2 review fix] audric builds a fresh QueryEngine per HTTP request.
    // The cooldown Set must seed from prior assistant blocks so the second
    // turn of a session that already emitted the marker reports
    // suppressed:true. Without this, every audric turn resets to "first
    // sighting" and the lockup re-fires on every page reload.
    const provider = createMockProvider([
      [
        {
          type: 'text',
          text: `<proactive type="idle_balance" subjectKey="USDC">${CANONICAL_BODY}</proactive>`,
          proactiveMarker: MARKER,
        },
      ],
    ]);
    const engine = new QueryEngine({ provider, tools: [], systemPrompt: 'test' });
    engine.loadMessages([
      { role: 'user', content: [{ type: 'text', text: 'earlier user message' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `<proactive type="idle_balance" subjectKey="USDC">${CANONICAL_BODY}</proactive>`,
          },
        ],
      },
    ]);
    const events = await collectEvents(engine.submitMessage('check again'));
    const proactive = events.find((e) => e.type === 'proactive_text');
    expect(proactive?.type === 'proactive_text' && proactive.suppressed).toBe(true);
  });
});

// ===========================================================================
// UC2 — Persistent goal flag on update_todo (R4 + R5)
// ===========================================================================

describe('SPEC 9 P9.5 · UC2 — persistent goal via update_todo persist:true (R4 + R5)', () => {
  it('2.a — update_todo emits a todo_update event whose payload carries persist:true on the goal item', async () => {
    // Canonical scenario: user says "remember I want to save $500 by
    // month-end." LLM plans the turn with update_todo, marking the
    // long-lived goal item with persist:true. Audric's chat route picks
    // up persist:true items and writes them to the Goal table — that
    // host wiring is regression-tested in
    // audric/apps/web/lib/engine/__tests__/handle-persistent-todos.test.ts.
    const provider = createMockProvider([
      [
        {
          type: 'tool_call',
          id: 'tu-1',
          name: 'update_todo',
          input: {
            items: [
              {
                id: 'g1',
                label: 'Save $500 by month-end',
                status: 'in_progress',
                persist: true,
              },
              {
                id: 'g2',
                label: 'Check current USDC rate',
                status: 'pending',
              },
            ],
          },
        },
      ],
      [{ type: 'text', text: 'Got it — tracking your $500 goal.' }],
    ]);
    const tools = applyToolFlags([updateTodoTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });

    const events = await collectEvents(
      engine.submitMessage('remember I want to save $500 by month-end'),
    );

    const todoUpdate = events.find((e) => e.type === 'todo_update');
    expect(todoUpdate).toBeDefined();
    if (todoUpdate?.type !== 'todo_update') throw new Error('narrowing');
    expect(todoUpdate.items).toHaveLength(2);

    const goalItem = todoUpdate.items.find((i) => i.id === 'g1');
    const turnItem = todoUpdate.items.find((i) => i.id === 'g2');
    expect(goalItem?.persist).toBe(true);
    // Within-turn step never carries persist:true — keeps the host's
    // Goal-table writer from spuriously persisting working steps.
    expect(turnItem?.persist).toBeUndefined();
  });

  it('2.b — R5 contract: dismiss_goal is NOT in the engine tool registry (host-only API)', () => {
    // [SPEC 9 v0.1.3 R5] Sidebar dismissal is a host-side API
    // (POST /api/goals/dismiss); the engine never sees a dismiss_goal
    // tool. If a future change accidentally re-adds it to READ_TOOLS or
    // WRITE_TOOLS, this assertion catches it before review.
    const allToolNames = [
      ...READ_TOOLS.map((t) => t.name),
      ...WRITE_TOOLS.map((t) => t.name),
    ];
    expect(allToolNames).not.toContain('dismiss_goal');
    expect(allToolNames).not.toContain('complete_goal');
  });

  it('2.c — R4 host-gate is verified in audric — pin the engine-side contract the host depends on', () => {
    // The engine's responsibility: emit todo_update events with the
    // persist flag intact. The host's responsibility (audric):
    //   (a) write persist:true items to the Goal table
    //   (b) build a <financial_context> system-prompt block that
    //       OMITS <open_goals> when goal count = 0
    //   (c) gate the goal-promotion teaching addendum on harnessShape
    //       being rich/max
    //
    // (a)+(b)+(c) regression-tested in:
    //   audric/apps/web/lib/engine/__tests__/handle-persistent-todos.test.ts
    //   audric/apps/web/lib/engine/__tests__/financial-context-block.test.ts
    //
    // This stub assertion documents the engine→host handoff contract:
    // the persist field IS on the engine's TodoItem schema, and the
    // engine emits it through todo_update untouched.
    const todoSchema = updateTodoTool.inputSchema;
    const parsed = todoSchema.safeParse({
      items: [{ id: '1', label: 'goal', status: 'in_progress', persist: true }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0].persist).toBe(true);
    }
  });
});

// ===========================================================================
// UC3 — LLM-initiated add-contact via inline form (R6)
// ===========================================================================

describe('SPEC 9 P9.5 · UC3 — LLM-initiated add-contact via inline form (R6)', () => {
  it('3.a — LLM calls add_recipient with empty input → engine emits pending_input with kind:sui-recipient (R6)', async () => {
    // Canonical scenario: user types "send $10 to Mom" but Mom isn't in
    // contacts yet. LLM, per system-prompt teaching, calls add_recipient
    // with empty input to capture the contact via inline form.
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'add_recipient', input: {} }],
      [{ type: 'text', text: 'unreachable — engine pauses before this turn' }],
    ]);
    const tools = applyToolFlags([addRecipientTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });

    const events = await collectEvents(
      engine.submitMessage('send $10 to my mum'),
    );

    const pending = events.find((e) => e.type === 'pending_input');
    expect(pending).toBeDefined();
    if (pending?.type !== 'pending_input') throw new Error('narrowing');

    expect(pending.toolName).toBe('add_recipient');
    expect(pending.toolUseId).toBe('tc-1');
    expect(pending.inputId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(pending.description).toBe('Add a new contact');

    // R6 — polymorphic identifier kind is sui-recipient (renamed from
    // 'address' pre-v0.1.3-lock). Server-side resolves Audric handle /
    // SuiNS / 0x via normalizeAddressInput.
    expect(pending.schema.fields).toHaveLength(2);
    const nameField = pending.schema.fields.find((f) => f.name === 'name');
    const idField = pending.schema.fields.find((f) => f.name === 'identifier');
    expect(nameField?.kind).toBe('text');
    expect(nameField?.required).toBe(true);
    expect(idField?.kind).toBe('sui-recipient');
    expect(idField?.required).toBe(true);

    // Round-trip fields ride on the wire so stateless hosts (audric)
    // can persist + echo back on resume.
    expect(Array.isArray(pending.assistantContent)).toBe(true);
    expect(pending.assistantContent.length).toBeGreaterThan(0);
    expect(Array.isArray(pending.completedResults)).toBe(true);

    // Engine paused — no turn_complete on the same submitMessage call.
    expect(events.find((e) => e.type === 'turn_complete')).toBeUndefined();
  });

  it('3.b — host echoes pending_input back via resumeWithInput → tool runs → LLM narrates next turn', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'add_recipient', input: {} }],
      [{ type: 'text', text: 'Saved Mom as a contact — want to send the $10 now?' }],
    ]);
    const tools = applyToolFlags([addRecipientTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });

    const submitEvents = await collectEvents(
      engine.submitMessage('send $10 to my mum'),
    );
    const pending = submitEvents.find((e) => e.type === 'pending_input');
    if (pending?.type !== 'pending_input') throw new Error('expected pending_input');

    // Reconstruct the wire payload exactly as audric's
    // /api/engine/resume-with-input route would echo back.
    const pendingInput: PendingInput = {
      inputId: pending.inputId,
      toolName: pending.toolName,
      toolUseId: pending.toolUseId,
      schema: pending.schema,
      description: pending.description,
      assistantContent: pending.assistantContent,
      completedResults: pending.completedResults,
    };

    const resumeEvents = await collectEvents(
      engine.resumeWithInput(pendingInput, {
        name: 'Mom',
        identifier: 'mom.audric.sui',
      }),
    );

    const toolResult = resumeEvents.find((e) => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    if (toolResult?.type !== 'tool_result') throw new Error('narrowing');
    expect(toolResult.toolName).toBe('add_recipient');
    expect(toolResult.toolUseId).toBe('tc-1');
    expect(toolResult.isError).toBe(false);

    const turnComplete = resumeEvents.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
  });

  it('3.c — LLM pre-fills both fields → engine bypasses pending_input (no form needed)', async () => {
    // Canonical scenario: user says "save mom (mom.audric.sui) as a
    // contact" — the LLM has both fields, calls add_recipient directly,
    // engine skips the form and runs the tool. The form path is for
    // INCOMPLETE input only.
    const provider = createMockProvider([
      [
        {
          type: 'tool_call',
          id: 'tc-1',
          name: 'add_recipient',
          input: { name: 'Mom', identifier: 'mom.audric.sui' },
        },
      ],
      [{ type: 'text', text: 'Saved Mom.' }],
    ]);
    const tools = applyToolFlags([addRecipientTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });

    const events = await collectEvents(
      engine.submitMessage('save mom mom.audric.sui as a contact'),
    );

    expect(events.find((e) => e.type === 'pending_input')).toBeUndefined();
    expect(events.find((e) => e.type === 'turn_complete')).toBeDefined();
  });
});

// ===========================================================================
// Acceptance summary — run last to print a one-line sanity check.
// ===========================================================================

describe('SPEC 9 P9.5 · acceptance summary', () => {
  it('all three canonical use cases are runnable in this file', () => {
    // Trivial assertion that the test file itself loaded correctly.
    // The real signal is whether all tests above passed; this is just
    // a marker for grep-friendly reporting in the artifact JSON.
    expect(true).toBe(true);
  });
});
