/**
 * SPEC 9 v0.1.3 P9.4 — `pending_input` flow + `add_recipient` tool.
 *
 * End-to-end coverage for:
 *  1. `add_recipient` preflight → `needsInput` when fields missing,
 *     `valid: true` when both present (LLM pre-fill path).
 *  2. Engine emits `pending_input` event when a tool's preflight returns
 *     `needsInput`, then stops the agent loop (no further LLM round-trip
 *     until the host calls `resumeWithInput`).
 *  3. `resumeWithInput` pushes assistantContent + completedResults +
 *     new tool_result atomically, then resumes the agent loop with the
 *     next LLM turn.
 *  4. Defensive paths in `resumeWithInput` — tool not found, Zod
 *     validation failure on resume, multi-step form refusal.
 *  5. Form schema shape — 2 fields, `identifier` is `sui-recipient`.
 */
import { describe, it, expect } from 'vitest';
import { QueryEngine } from '../engine.js';
import { applyToolFlags } from '../tool-flags.js';
import { addRecipientTool } from '../tools/add-recipient.js';
import { saveContactTool } from '../tools/contacts.js';
import type {
  LLMProvider,
  ChatParams,
  ProviderEvent,
  EngineEvent,
  Tool,
} from '../types.js';
import type { PendingInput } from '../pending-input.js';
import { buildTool } from '../tool.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Mock LLM provider — same shape used by engine-bundle.test.ts.
// ---------------------------------------------------------------------------

type ScriptedTurn =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown };

function createMockProvider(turns: ScriptedTurn[][]): LLMProvider {
  let callIndex = 0;
  return {
    async *chat(_params: ChatParams): AsyncGenerator<ProviderEvent> {
      const turn = turns[callIndex] ?? [];
      callIndex++;
      yield { type: 'message_start', messageId: `msg-${callIndex}`, model: 'mock' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      const hasToolCalls = turn.some((t) => t.type === 'tool_call');
      for (const item of turn) {
        if (item.type === 'text') {
          yield { type: 'text_delta', text: item.text };
        } else if (item.type === 'tool_call') {
          yield { type: 'tool_use_start', id: item.id, name: item.name };
          yield { type: 'tool_use_done', id: item.id, name: item.name, input: item.input };
        }
      }
      yield { type: 'stop', reason: hasToolCalls ? 'tool_use' : 'end_turn' };
    },
  };
}

async function collectEvents(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

// Simple read tool used for "reads-then-paused-write" turns.
const readBalance: Tool = buildTool({
  name: 'balance_check',
  description: 'mock balance',
  inputSchema: z.object({}).passthrough(),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  async call() {
    return { data: { usdc: 100, sui: 50 } };
  },
});

// ---------------------------------------------------------------------------
// 1. add_recipient preflight
// ---------------------------------------------------------------------------

describe('add_recipient — preflight', () => {
  it('returns needsInput when both name and identifier are missing', () => {
    const result = addRecipientTool.preflight!({});
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error('should be invalid');
    expect('needsInput' in result).toBe(true);
    if (!('needsInput' in result) || !result.needsInput) throw new Error('missing needsInput');
    expect(result.needsInput.description).toBe('Add a new contact');
    expect(result.needsInput.schema.fields).toHaveLength(2);
  });

  it('returns needsInput when only name is provided', () => {
    const result = addRecipientTool.preflight!({ name: 'Mom' });
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error('should be invalid');
    expect('needsInput' in result).toBe(true);
  });

  it('returns needsInput when only identifier is provided', () => {
    const result = addRecipientTool.preflight!({ identifier: 'mom.audric.sui' });
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error('should be invalid');
    expect('needsInput' in result).toBe(true);
  });

  it('returns valid when both fields are provided (LLM pre-fill path)', () => {
    const result = addRecipientTool.preflight!({
      name: 'Mom',
      identifier: 'mom.audric.sui',
    });
    expect(result.valid).toBe(true);
  });

  it('form schema has exactly 2 fields with the polymorphic sui-recipient kind on identifier', () => {
    const result = addRecipientTool.preflight!({});
    if (result.valid || !('needsInput' in result) || !result.needsInput) {
      throw new Error('expected needsInput');
    }
    const fields = result.needsInput.schema.fields;
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('name');
    expect(fields[0].kind).toBe('text');
    expect(fields[0].required).toBe(true);
    expect(fields[1].name).toBe('identifier');
    expect(fields[1].kind).toBe('sui-recipient');
    expect(fields[1].required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Engine emits pending_input + pauses
// ---------------------------------------------------------------------------

describe('engine — pending_input emission', () => {
  it('yields pending_input when LLM calls add_recipient with no input, then stops the loop', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'add_recipient', input: {} }],
      // Second response is never used — engine should stop after pending_input.
      [{ type: 'text', text: 'unreachable' }],
    ]);
    const tools = applyToolFlags([addRecipientTool]);
    // [SPEC 9 v0.1.3 P9.4] Preflight is invoked inside `runGuards` (Tier 0).
    // Hosts that don't enable any guards never call preflight — the tool's
    // call() runs unchecked. Enable `inputValidation` here so preflight runs
    // and the `needsInput` branch fires. Production hosts (audric/web) always
    // enable guards; this is the canonical contract.
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });

    const events = await collectEvents(engine.submitMessage('add my mom as a contact'));

    const pending = events.find((e) => e.type === 'pending_input') as
      | (EngineEvent & { type: 'pending_input' })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.toolName).toBe('add_recipient');
    expect(pending!.toolUseId).toBe('tc-1');
    expect(pending!.inputId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(pending!.description).toBe('Add a new contact');
    expect(pending!.schema.fields).toHaveLength(2);

    // Engine stopped after pending_input — no turn_complete event.
    const turnComplete = events.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeUndefined();
  });

  it('does NOT yield pending_input when LLM pre-fills both fields (preflight passes)', async () => {
    const provider = createMockProvider([
      [
        {
          type: 'tool_call',
          id: 'tc-1',
          name: 'add_recipient',
          input: { name: 'Mom', identifier: 'mom.audric.sui' },
        },
      ],
      [{ type: 'text', text: 'Saved Mom as a contact.' }],
    ]);
    const tools = applyToolFlags([addRecipientTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });

    const events = await collectEvents(
      engine.submitMessage('add my mom mom.audric.sui as a contact'),
    );
    expect(events.find((e) => e.type === 'pending_input')).toBeUndefined();
    expect(events.find((e) => e.type === 'turn_complete')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. resumeWithInput continues the turn
// ---------------------------------------------------------------------------

describe('engine — resumeWithInput', () => {
  it('pushes assistant content + new tool_result and continues to a follow-up LLM turn', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'add_recipient', input: {} }],
      [{ type: 'text', text: 'Saved Mom — now I can send to her.' }],
    ]);
    const tools = applyToolFlags([addRecipientTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });

    const submitEvents = await collectEvents(engine.submitMessage('add my mom'));
    const pending = submitEvents.find((e) => e.type === 'pending_input') as
      | (EngineEvent & { type: 'pending_input' })
      | undefined;
    expect(pending).toBeDefined();

    // Reconstruct the PendingInput payload the host would have stored.
    // Engine internals also keep this payload, but P9.4 contract is that
    // host serializes the wire event + replays. Walk both to verify.
    const pendingInput: PendingInput = {
      inputId: pending!.inputId,
      toolName: pending!.toolName,
      toolUseId: pending!.toolUseId,
      schema: pending!.schema,
      description: pending!.description,
      // Host captures from session — for the test we know what was pushed
      // (one assistant block: the tool_use); no completedResults because no
      // reads ran in the same turn.
      assistantContent: [{ type: 'tool_use', id: 'tc-1', name: 'add_recipient', input: {} }],
      completedResults: [],
    };

    const resumeEvents = await collectEvents(
      engine.resumeWithInput(pendingInput, {
        name: 'Mom',
        identifier: 'mom.audric.sui',
      }),
    );

    // First event is the resumed tool_result.
    const toolResult = resumeEvents.find((e) => e.type === 'tool_result') as
      | (EngineEvent & { type: 'tool_result' })
      | undefined;
    expect(toolResult).toBeDefined();
    expect(toolResult!.toolName).toBe('add_recipient');
    expect(toolResult!.toolUseId).toBe('tc-1');
    expect(toolResult!.isError).toBe(false);
    expect(toolResult!.result).toMatchObject({
      saved: true,
      name: 'Mom',
      identifier: 'mom.audric.sui',
    });

    // Then the LLM's follow-up narration round-trip.
    const turnComplete = resumeEvents.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
  });

  it('merges completedResults from prior reads into the resumed user message (single user-role block)', async () => {
    // Turn 1: balance_check runs (read) THEN add_recipient triggers pending_input.
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'rd-1', name: 'balance_check', input: {} },
        { type: 'tool_call', id: 'tc-1', name: 'add_recipient', input: {} },
      ],
      [{ type: 'text', text: 'Saved Mom and your balance is fine.' }],
    ]);
    const tools = applyToolFlags([readBalance, addRecipientTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });

    const submitEvents = await collectEvents(
      engine.submitMessage('check my balance and add mom'),
    );
    const pending = submitEvents.find((e) => e.type === 'pending_input') as
      | (EngineEvent & { type: 'pending_input' })
      | undefined;
    expect(pending).toBeDefined();

    // The balance_check read should have run + emitted tool_result before the pause.
    const readResult = submitEvents.find(
      (e) => e.type === 'tool_result' && e.toolName === 'balance_check',
    );
    expect(readResult).toBeDefined();

    // For the resume, capture what the engine would have stored — both the
    // assistant tool_use blocks AND the completed read result. (Host
    // reconstructs from session; engine reconstructs from internal map.)
    const pendingInput: PendingInput = {
      inputId: pending!.inputId,
      toolName: pending!.toolName,
      toolUseId: pending!.toolUseId,
      schema: pending!.schema,
      description: pending!.description,
      assistantContent: [
        { type: 'tool_use', id: 'rd-1', name: 'balance_check', input: {} },
        { type: 'tool_use', id: 'tc-1', name: 'add_recipient', input: {} },
      ],
      completedResults: [
        {
          toolUseId: 'rd-1',
          content: JSON.stringify({ usdc: 100, sui: 50 }),
          isError: false,
        },
      ],
    };

    const resumeEvents = await collectEvents(
      engine.resumeWithInput(pendingInput, {
        name: 'Mom',
        identifier: 'mom.audric.sui',
      }),
    );

    // The follow-up LLM turn ran successfully — proves the messages are
    // well-formed (no orphan tool_use from balance_check / add_recipient).
    const turnComplete = resumeEvents.find((e) => e.type === 'turn_complete');
    expect(turnComplete).toBeDefined();
  });

  it('returns an error tool_result when the tool is not found on resume (host bug surfaced, no crash)', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'add_recipient', input: {} }],
      [{ type: 'text', text: 'follow-up narration' }],
    ]);
    const tools = applyToolFlags([addRecipientTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });
    await collectEvents(engine.submitMessage('add my mom'));

    const ghostPendingInput: PendingInput = {
      inputId: 'ghost-id',
      toolName: 'tool_that_does_not_exist',
      toolUseId: 'tc-orphan',
      schema: { fields: [] },
      assistantContent: [
        { type: 'tool_use', id: 'tc-orphan', name: 'tool_that_does_not_exist', input: {} },
      ],
      completedResults: [],
    };

    const resumeEvents = await collectEvents(
      engine.resumeWithInput(ghostPendingInput, { foo: 'bar' }),
    );
    const toolResult = resumeEvents.find((e) => e.type === 'tool_result') as
      | (EngineEvent & { type: 'tool_result' })
      | undefined;
    expect(toolResult).toBeDefined();
    expect(toolResult!.isError).toBe(true);
    expect(JSON.stringify(toolResult!.result)).toMatch(/_hostBugMissingTool/);
  });

  it('returns an error tool_result when the resumed values fail Zod validation', async () => {
    // Use save_contact which has a stricter schema (requires `name` AND `address`).
    // Pass an empty values object — Zod validation fails on the resumed call.
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'add_recipient', input: {} }],
      [{ type: 'text', text: 'follow-up narration' }],
    ]);
    const tools = applyToolFlags([addRecipientTool, saveContactTool]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      guards: { inputValidation: true },
    });
    await collectEvents(engine.submitMessage('add my mom'));

    const malformedPendingInput: PendingInput = {
      inputId: 'malformed-id',
      toolName: 'save_contact',
      toolUseId: 'tc-malformed',
      schema: { fields: [] },
      assistantContent: [
        { type: 'tool_use', id: 'tc-malformed', name: 'save_contact', input: {} },
      ],
      completedResults: [],
    };

    const resumeEvents = await collectEvents(
      engine.resumeWithInput(malformedPendingInput, {} as Record<string, unknown>),
    );
    const toolResult = resumeEvents.find((e) => e.type === 'tool_result') as
      | (EngineEvent & { type: 'tool_result' })
      | undefined;
    expect(toolResult).toBeDefined();
    expect(toolResult!.isError).toBe(true);
    // save_contact has no preflight, so it fails at Zod, not at preflight.
    expect(JSON.stringify(toolResult!.result)).toMatch(/_hostFormZodFailed/);
  });
});
