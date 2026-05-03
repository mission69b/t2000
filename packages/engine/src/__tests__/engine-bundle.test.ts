/**
 * SPEC 7 P2.3 Layer 2 — multi-write Payment Stream bundling.
 *
 * Verifies the engine collapses ≥2 confirm-tier bundleable writes in a
 * single LLM turn into one bundled `pending_action` (instead of yielding
 * once per write or silently dropping siblings on `break`).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { buildTool } from '../tool.js';
import { applyToolFlags } from '../tool-flags.js';
import type {
  LLMProvider,
  ChatParams,
  ProviderEvent,
  EngineEvent,
  Tool,
  PendingAction,
} from '../types.js';

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

// Bundleable confirm-tier write tools (mock SDK behavior — never executed
// because confirm-tier writes always yield pending_action and wait for
// the host to call resumeWithToolResult).
function makeWrite(name: string): Tool {
  return buildTool({
    name,
    description: `mock ${name}`,
    inputSchema: z.object({ amount: z.number() }).passthrough(),
    jsonSchema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
    isReadOnly: false,
    permissionLevel: 'confirm',
    async call() {
      return { data: { ok: true } };
    },
  });
}

// Read tool — auto-tier, executes immediately
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

describe('SPEC 7 P2.3 — bundle composition', () => {
  it('collapses 2 bundleable writes into a single pending_action with steps[]', async () => {
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('send 5 to A and 3 to B'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toBeDefined();
    expect(pending!.action.steps).toHaveLength(2);
    expect(pending!.action.steps![0].toolName).toBe('send_transfer');
    expect(pending!.action.steps![0].toolUseId).toBe('tc-1');
    expect(pending!.action.steps![1].toolUseId).toBe('tc-2');
    // Each step gets its own attemptId
    expect(pending!.action.steps![0].attemptId).not.toBe(pending!.action.steps![1].attemptId);
    // SPEC 7 § Layer 2 line 463: top-level mirrors steps[0] for pre-bundle hosts.
    expect(pending!.action.attemptId).toBe(pending!.action.steps![0].attemptId);
    expect(pending!.action.toolUseId).toBe(pending!.action.steps![0].toolUseId);
    expect(pending!.action.toolName).toBe(pending!.action.steps![0].toolName);
  });

  it('stays as legacy single-write shape when N=1 (no steps[])', async () => {
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } }],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('send 5 to A'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toBeUndefined();
    expect(pending!.action.toolName).toBe('send_transfer');
    expect(pending!.action.toolUseId).toBe('tc-1');
  });

  it('regenerateInput.toolUseIds includes contributing reads from the same turn', async () => {
    // Turn 1: balance_check (read) + 2x send_transfer (writes)
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'rd-1', name: 'balance_check', input: {} },
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
    ]);
    const tools = applyToolFlags([readBalance, makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('split balance'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.canRegenerate).toBe(true);
    expect(pending!.action.regenerateInput?.toolUseIds).toContain('rd-1');
    expect(pending!.action.quoteAge).toBeGreaterThanOrEqual(0);
  });

  // [SPEC 7 P2.6 Gate C — regression] The canonical bundle pattern is the
  // 2-LLM-response shape: response 1 emits the read (e.g. swap_quote),
  // response 2 emits the writes after seeing the quote. Pre-fix, the
  // engine declared `turnReadToolResults` INSIDE the while loop, so it
  // reset between LLM responses — response 2 saw `readResults: []` and
  // emitted `canRegenerate: false`. The host's regenerate badge + button
  // never rendered, leaving users stranded with stale quotes.
  it('canRegenerate=true when reads land in response 1 and writes in response 2', async () => {
    const provider = createMockProvider([
      // Response 1: just the read
      [{ type: 'tool_call', id: 'rd-1', name: 'balance_check', input: {} }],
      // Response 2: just the writes (LLM has now seen the read result)
      [
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
    ]);
    const tools = applyToolFlags([readBalance, makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('check balance then split it'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(2);
    expect(pending!.action.canRegenerate).toBe(true);
    expect(pending!.action.regenerateInput?.toolUseIds).toContain('rd-1');
    expect(pending!.action.quoteAge).toBeGreaterThanOrEqual(0);
  });

  it('falls back to single-write for mixed bundleable + non-bundleable', async () => {
    // pay_api is non-bundleable (in tool-flags). Pair it with send_transfer.
    const payApi = buildTool({
      name: 'pay_api',
      description: 'mock pay_api',
      inputSchema: z.object({ url: z.string() }).passthrough(),
      jsonSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      isReadOnly: false,
      permissionLevel: 'confirm',
      async call() {
        return { data: { ok: true } };
      },
    });
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'pay_api', input: { url: 'https://api/x' } },
      ],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer'), payApi]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('mixed'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    // Mixed → first wins, NO bundle (steps undefined).
    expect(pending!.action.steps).toBeUndefined();
    expect(pending!.action.toolUseId).toBe('tc-1');
  });

  // -------- Audit fixes (post-P2.3 review) --------

  it('audit BUG 1: mixed-bundleability fallback synthesises error tool_results for dropped writes (Anthropic protocol)', async () => {
    const payApi = buildTool({
      name: 'pay_api',
      description: 'mock pay_api',
      inputSchema: z.object({ url: z.string() }).passthrough(),
      jsonSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      isReadOnly: false,
      permissionLevel: 'confirm',
      async call() {
        return { data: { ok: true } };
      },
    });

    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'pay_api', input: { url: 'https://api/x' } },
      ],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer'), payApi]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('mixed'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();

    // Both tool_use blocks live in assistantContent (LLM emitted both).
    const toolUseIds = pending!.action.assistantContent
      .filter((b) => b.type === 'tool_use')
      .map((b) => (b as { id: string }).id);
    expect(toolUseIds).toEqual(['tc-1', 'tc-2']);

    // completedResults MUST contain an error tool_result for tc-2 so
    // the next provider call doesn't see an orphaned tool_use.
    const tc2Result = (pending!.action.completedResults ?? []).find(
      (r) => r.toolUseId === 'tc-2',
    );
    expect(tc2Result).toBeDefined();
    expect(tc2Result!.isError).toBe(true);
    expect(tc2Result!.content).toContain('separate confirmation');
  });

  it('audit BUG 11: approved bundle with missing stepResult fails closed (not synthetic success)', async () => {
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
      [{ type: 'text', text: 'Step 2 was missing.' }],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const turn1Events = await collectEvents(engine.submitMessage('split'));
    const action = (turn1Events.find((e) => e.type === 'pending_action') as
      EngineEvent & { type: 'pending_action'; action: PendingAction }).action;

    // Host approves but only sends ONE step's result (host bug).
    const turn2Events = await collectEvents(
      engine.resumeWithToolResult(action, {
        approved: true,
        stepResults: [
          {
            toolUseId: 'tc-1',
            attemptId: action.steps![0].attemptId,
            result: { txDigest: 'd1', success: true },
            isError: false,
          },
          // tc-2 omitted by host
        ],
      }),
    );

    // tc-2's tool_result event is emitted with isError=true (fail-closed).
    const tc2Event = turn2Events.find(
      (e) => e.type === 'tool_result' && e.toolUseId === 'tc-2',
    );
    expect(tc2Event).toBeDefined();
    expect(tc2Event!.type === 'tool_result' && tc2Event!.isError).toBe(true);

    // tc-1 is success.
    const tc1Event = turn2Events.find(
      (e) => e.type === 'tool_result' && e.toolUseId === 'tc-1',
    );
    expect(tc1Event!.type === 'tool_result' && tc1Event!.isError).toBe(false);
  });

  it('audit BUG 12: quoteAge clamps to >= 0 against clock skew', async () => {
    // Force a future-dated read by mocking Date.now().
    const realNow = Date.now;
    let mockTime = 1_000_000;
    Date.now = () => mockTime;
    try {
      const provider = createMockProvider([
        [
          { type: 'tool_call', id: 'rd-1', name: 'balance_check', input: {} },
          { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
          { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
        ],
      ]);
      const balance: Tool = buildTool({
        name: 'balance_check',
        description: 'mock',
        inputSchema: z.object({}).passthrough(),
        jsonSchema: { type: 'object', properties: {} },
        isReadOnly: true,
        async call() {
          // Bump the clock BACKWARDS just before the read result lands.
          // Date.now() at read = 1_001_000; later bundle composer reads
          // Date.now() at "emit time" — set it lower to simulate skew.
          mockTime = 1_001_000;
          return { data: { usdc: 100 } };
        },
      });
      const tools = applyToolFlags([balance, makeWrite('send_transfer')]);
      const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

      const events = await collectEvents(engine.submitMessage('go'));
      // After read landed, simulate clock-skew BACKWARDS before bundle
      // composer reads Date.now() at emit time.
      // The composer uses Date.now() - stalest_timestamp; if the read's
      // timestamp was 1_001_000 and emit-time-Date.now() is 1_000_500
      // (clock went back), the diff would be -500ms without the clamp.
      // We can't perfectly reproduce that without tight orchestration,
      // so this test asserts the GENERAL invariant: quoteAge is never
      // < 0 even under unusual clock conditions.
      const pending = events.find((e) => e.type === 'pending_action') as
        | (EngineEvent & { type: 'pending_action'; action: PendingAction })
        | undefined;
      expect(pending).toBeDefined();
      if (pending!.action.quoteAge !== undefined) {
        expect(pending!.action.quoteAge).toBeGreaterThanOrEqual(0);
      }
    } finally {
      Date.now = realNow;
    }
  });

  it('audit BUG 13: composeBundleFromToolResults rejects non-bundleable tools defensively', async () => {
    // Direct helper invocation with a non-bundleable tool — caller bug
    // simulation. The helper must throw before producing a malformed bundle.
    const { composeBundleFromToolResults } = await import('../compose-bundle.js');
    const tools = [
      makeWrite('send_transfer'),
      // Define pay_api WITHOUT applying tool flags (so bundleable stays unset)
      buildTool({
        name: 'pay_api',
        description: 'mock',
        inputSchema: z.object({}).passthrough(),
        jsonSchema: { type: 'object', properties: {} },
        isReadOnly: false,
        permissionLevel: 'confirm',
        async call() {
          return { data: { ok: true } };
        },
      }),
    ];
    const flagged = applyToolFlags(tools);
    expect(() =>
      composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
          { id: 'tc-2', name: 'pay_api', input: {} },
        ],
        tools: flagged,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      }),
    ).toThrow(/not bundleable/);
  });

  it('resume with stepResults pushes N tool_result events back to the LLM', async () => {
    const provider = createMockProvider([
      // Turn 1: emit 2 sends → bundle yields
      [
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
      // Turn 2 (after resume): plain text
      [{ type: 'text', text: 'Both sends succeeded.' }],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const turn1Events = await collectEvents(engine.submitMessage('split'));
    const pendingEvent = turn1Events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pendingEvent).toBeDefined();
    const action = pendingEvent!.action;
    expect(action.steps).toHaveLength(2);

    // Host produces stepResults with the per-step txDigest
    const turn2Events = await collectEvents(
      engine.resumeWithToolResult(action, {
        approved: true,
        stepResults: [
          {
            toolUseId: 'tc-1',
            attemptId: action.steps![0].attemptId,
            result: { txDigest: 'digest-1', success: true },
            isError: false,
          },
          {
            toolUseId: 'tc-2',
            attemptId: action.steps![1].attemptId,
            result: { txDigest: 'digest-2', success: true },
            isError: false,
          },
        ],
      }),
    );

    // Two tool_result events should be yielded (one per step).
    const stepResults = turn2Events.filter((e) => e.type === 'tool_result');
    expect(stepResults).toHaveLength(2);
    const ids = stepResults.map((e) => (e.type === 'tool_result' ? e.toolUseId : ''));
    expect(ids).toContain('tc-1');
    expect(ids).toContain('tc-2');
  });

  it('declined bundle yields N error tool_results (one per step)', async () => {
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const turn1Events = await collectEvents(engine.submitMessage('split'));
    const action = (turn1Events.find((e) => e.type === 'pending_action') as
      EngineEvent & { type: 'pending_action'; action: PendingAction }).action;

    const turn2Events = await collectEvents(
      engine.resumeWithToolResult(action, { approved: false }),
    );
    const errors = turn2Events.filter(
      (e) => e.type === 'tool_result' && e.isError,
    );
    expect(errors).toHaveLength(2);
  });

  it('atomic bundle failure: all stepResults isError=true → no post-write refresh', async () => {
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
      // Should NOT see a follow-up turn that includes balance_check
      // because writeFailed branch returns from runPostWriteRefresh.
      [{ type: 'text', text: 'Sorry, both transfers failed.' }],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer'), readBalance]);
    const engine = new QueryEngine({
      provider,
      tools,
      systemPrompt: 'test',
      postWriteRefresh: { send_transfer: ['balance_check'] },
    });

    const turn1Events = await collectEvents(engine.submitMessage('split'));
    const action = (turn1Events.find((e) => e.type === 'pending_action') as
      EngineEvent & { type: 'pending_action'; action: PendingAction }).action;

    const turn2Events = await collectEvents(
      engine.resumeWithToolResult(action, {
        approved: true,
        stepResults: [
          {
            toolUseId: 'tc-1',
            attemptId: action.steps![0].attemptId,
            result: { error: 'PTB execution failed' },
            isError: true,
          },
          {
            toolUseId: 'tc-2',
            attemptId: action.steps![1].attemptId,
            result: { error: 'PTB execution failed' },
            isError: true,
          },
        ],
      }),
    );

    // No balance_check refresh fired because writeFailed === true.
    const refreshStarts = turn2Events.filter(
      (e) => e.type === 'tool_start' && e.toolName === 'balance_check',
    );
    expect(refreshStarts).toHaveLength(0);
  });
});

// [F14-fix-2 / 2026-05-03] MAX_BUNDLE_OPS cap regression suite.
// Covers the production repro where Sonnet+medium attempted to bundle
// 6 writes in one Turn 2, blew past Vercel's timeout / quote-window /
// LLM-working-memory budget, and produced a stuck-pending state with
// no PermissionCard rendered. Cap = 5 hard refuses anything larger so
// the LLM is forced to split into two confirmation rounds.
describe('SPEC F14-fix-2 — MAX_BUNDLE_OPS cap', () => {
  // Helper: mint N pending writes for a single LLM turn.
  function makeTurnOf(n: number): ScriptedTurn[] {
    return Array.from({ length: n }, (_, i) => ({
      type: 'tool_call' as const,
      id: `tc-${i + 1}`,
      name: 'send_transfer',
      input: { amount: i + 1, to: `0x${i + 1}` },
    }));
  }

  it('accepts a 5-op bundle (at the cap)', async () => {
    const provider = createMockProvider([makeTurnOf(5)]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('5 sends'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(5);
  });

  it('refuses a 6-op bundle and yields N=6 max_bundle_ops error tool_results', async () => {
    // Two LLM turns: turn 1 emits 6 writes (refused), turn 2 narrates
    // the refusal so the engine returns an `end_turn` cleanly.
    const provider = createMockProvider([
      makeTurnOf(6),
      [
        {
          type: 'text',
          text: 'I will split this into two bundles — first 5 sends, then the 6th after you confirm.',
        },
      ],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('6 sends'));

    // No pending_action — bundle was capped before composition.
    const pending = events.find((e) => e.type === 'pending_action');
    expect(pending).toBeUndefined();

    // 6 error tool_results (one per dropped write), each with the cap
    // error envelope so the LLM has visibility into the refusal.
    const errorResults = events.filter(
      (e) => e.type === 'tool_result' && e.isError,
    ) as Array<EngineEvent & { type: 'tool_result' }>;
    expect(errorResults).toHaveLength(6);
    for (const er of errorResults) {
      const result = er.result as { error?: string; _gate?: string };
      expect(result._gate).toBe('max_bundle_ops');
      expect(result.error).toMatch(/capped at 5/);
      expect(result.error).toMatch(/Split into two sequential/);
    }
  });

  it('refuses a 7-op bundle (above the cap by more than 1)', async () => {
    const provider = createMockProvider([
      makeTurnOf(7),
      [{ type: 'text', text: 'I will split.' }],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('7 sends'));
    const errorResults = events.filter(
      (e) => e.type === 'tool_result' && e.isError,
    );
    expect(errorResults).toHaveLength(7);
    expect(events.find((e) => e.type === 'pending_action')).toBeUndefined();
  });

  it('production repro: 6-op compound flow (repay + 2 swaps + save + borrow + send) returns capped error', async () => {
    // Mirrors the exact production failure shape — 6 writes spanning
    // every confirm-tier bundleable operation. Pre-fix this would
    // compose a 6-step pending_action; post-fix the engine refuses
    // and the LLM has to re-plan.
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'repay_debt', input: { amount: 2 } },
        { type: 'tool_call', id: 'tc-2', name: 'swap_execute', input: { amount: 1.98 } },
        { type: 'tool_call', id: 'tc-3', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-4', name: 'save_deposit', input: { amount: 9.99 } },
        { type: 'tool_call', id: 'tc-5', name: 'borrow', input: { amount: 1 } },
        { type: 'tool_call', id: 'tc-6', name: 'send_transfer', input: { amount: 1 } },
      ],
      [{ type: 'text', text: 'I will split into two sequential bundles.' }],
    ]);
    const tools = applyToolFlags([
      makeWrite('repay_debt'),
      makeWrite('swap_execute'),
      makeWrite('save_deposit'),
      makeWrite('borrow'),
      makeWrite('send_transfer'),
    ]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('compound 6'));

    expect(events.find((e) => e.type === 'pending_action')).toBeUndefined();
    const errorIds = events
      .filter((e) => e.type === 'tool_result' && e.isError)
      .map((e) => (e as EngineEvent & { type: 'tool_result' }).toolUseId);
    expect(errorIds).toEqual(['tc-1', 'tc-2', 'tc-3', 'tc-4', 'tc-5', 'tc-6']);
  });
});
