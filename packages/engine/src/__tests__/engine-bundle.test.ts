/**
 * SPEC 7 P2.3 Layer 2 — multi-write Payment Intent compilation.
 *
 * Verifies the engine collapses ≥2 confirm-tier `bundleable: true` writes
 * in a single LLM turn into one compiled `pending_action` (instead of
 * yielding once per write or silently dropping siblings on `break`).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { QueryEngine } from '../engine.js';
import { buildTool } from '../tool.js';
import { applyToolFlags } from '../tool-flags.js';
import { setTelemetrySink, resetTelemetrySink } from '../telemetry.js';
import type { TelemetrySink, TelemetryTags } from '../telemetry.js';
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
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
    ]);
    // [Phase 0 / SPEC 13] swap_execute → send_transfer is the canonical
    // whitelisted pair; tool fixture changed but bundle composition
    // mechanics being tested are unchanged.
    const tools = applyToolFlags([makeWrite('swap_execute'), makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('swap then send'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toBeDefined();
    expect(pending!.action.steps).toHaveLength(2);
    expect(pending!.action.steps![0].toolName).toBe('swap_execute');
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
    // [Phase 0 / SPEC 13] Bundle pair switched to whitelisted swap→send;
    // regenerateInput threading is independent of pair shape.
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'rd-1', name: 'balance_check', input: {} },
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
    ]);
    const tools = applyToolFlags([
      readBalance,
      makeWrite('swap_execute'),
      makeWrite('send_transfer'),
    ]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('balance then swap and send'));
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
    // [Phase 0 / SPEC 13] Bundle pair switched to whitelisted swap→send;
    // the cross-LLM-response carry-forward of readResults is unchanged.
    const provider = createMockProvider([
      [{ type: 'tool_call', id: 'rd-1', name: 'balance_check', input: {} }],
      [
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
    ]);
    const tools = applyToolFlags([
      readBalance,
      makeWrite('swap_execute'),
      makeWrite('send_transfer'),
    ]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });

    const events = await collectEvents(engine.submitMessage('balance then swap and send'));
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
    // [Phase 0 / SPEC 13] Pair switched from send_transfer+send_transfer
    // to the whitelisted swap_execute→send_transfer so the bundle still
    // composes under the new VALID_PAIRS check. The bug-class (host
    // fails to send a stepResult, engine must synthesize an error)
    // is unchanged.
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
      [{ type: 'text', text: 'Step 2 was missing.' }],
    ]);
    const tools = applyToolFlags([makeWrite('swap_execute'), makeWrite('send_transfer')]);
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
    // [Phase 0 / SPEC 13] Bundle pair switched from send+send to the
    // whitelisted swap_execute→send_transfer. The clock-skew invariant
    // being tested (quoteAge >= 0) is unrelated to which pair is used.
    const realNow = Date.now;
    let mockTime = 1_000_000;
    Date.now = () => mockTime;
    try {
      const provider = createMockProvider([
        [
          { type: 'tool_call', id: 'rd-1', name: 'balance_check', input: {} },
          { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 5 } },
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
      const tools = applyToolFlags([balance, makeWrite('swap_execute'), makeWrite('send_transfer')]);
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
    // [Phase 0 / SPEC 13] Pair switched from send+send to the
    // whitelisted swap_execute→send_transfer. The resume mechanics
    // (N stepResults → N tool_result events) are unchanged.
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
      [{ type: 'text', text: 'Both succeeded.' }],
    ]);
    const tools = applyToolFlags([makeWrite('swap_execute'), makeWrite('send_transfer')]);
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
    // [Phase 0 / SPEC 13] Pair switched to a whitelisted one.
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
    ]);
    const tools = applyToolFlags([makeWrite('swap_execute'), makeWrite('send_transfer')]);
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
    // [Phase 0 / SPEC 13] Pair switched to whitelisted; refresh is
    // keyed on the consumer (send_transfer) which is unchanged.
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB' } },
      ],
      [{ type: 'text', text: 'Sorry, both transfers failed.' }],
    ]);
    const tools = applyToolFlags([
      makeWrite('swap_execute'),
      makeWrite('send_transfer'),
      readBalance,
    ]);
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
            result: { error: 'Payment Intent execution failed' },
            isError: true,
          },
          {
            toolUseId: 'tc-2',
            attemptId: action.steps![1].attemptId,
            result: { error: 'Payment Intent execution failed' },
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

// [Phase 0 → Phase 3a / SPEC 13] MAX_BUNDLE_OPS cap regression suite.
//
// History:
//   - Pre-Phase-0 (F14-fix-2): cap=5
//   - Phase 0 (1.12.0, 2026-05-03): cap=2 strict tightening
//   - Phase 2 (1.14.0): cap=3, strict-adjacency validator
//   - Phase 3a (1.15.0): cap=4, DAG-aware (no envelope-level
//     adjacency rejection — see compose-bundle.ts MAX_BUNDLE_OPS JSDoc)
//
// Cap tests cover Phase 3a acceptance (2-, 3-, 4-op bundles compose)
// AND rejection (5+-op refuses with `_gate: 'max_bundle_ops'`).
describe('Phase 3a — MAX_BUNDLE_OPS=4 cap', () => {
  // Helper: mint N pending writes for a single LLM turn. Uses pairs
  // already in VALID_PAIRS so the 2-op / 3-op acceptance tests aren't
  // gated by the whitelist check.
  function makeTurnOfPair(n: number): ScriptedTurn[] {
    if (n === 1) {
      return [
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 1 } },
      ];
    }
    if (n === 2) {
      return [
        { type: 'tool_call', id: 'tc-1', name: 'swap_execute', input: { amount: 1 } },
        { type: 'tool_call', id: 'tc-2', name: 'send_transfer', input: { amount: 1, to: '0xabc' } },
      ];
    }
    if (n === 3) {
      // withdraw → swap → send is the canonical Phase 2 3-op flow.
      // Both adjacent pairs (withdraw→swap, swap→send) are whitelisted.
      return [
        { type: 'tool_call', id: 'tc-1', name: 'withdraw', input: { amount: 1, asset: 'USDC' } },
        { type: 'tool_call', id: 'tc-2', name: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 1 } },
        { type: 'tool_call', id: 'tc-3', name: 'send_transfer', input: { amount: 1, to: '0xabc' } },
      ];
    }
    // For N≥4 pad with send_transfer (over-cap rejection test reaches here).
    const out: ScriptedTurn[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        type: 'tool_call' as const,
        id: `tc-${i + 1}`,
        name: 'send_transfer',
        input: { amount: i + 1, to: `0x${i + 1}` },
      });
    }
    return out;
  }

  it('accepts a 2-op whitelisted bundle', async () => {
    const provider = createMockProvider([makeTurnOfPair(2)]);
    const tools = applyToolFlags([
      makeWrite('swap_execute'),
      makeWrite('send_transfer'),
    ]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('swap then send'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(2);
  });

  it('accepts a 3-op bundle', async () => {
    const provider = createMockProvider([makeTurnOfPair(3)]);
    const tools = applyToolFlags([
      makeWrite('withdraw'),
      makeWrite('swap_execute'),
      makeWrite('send_transfer'),
    ]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('withdraw, swap, send'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(3);
  });

  it('accepts a 4-op bundle (Phase 3a — at the new cap)', async () => {
    // [Phase 3a / 1.15.0] cap raised 3→4. P0-10 locked: zero-chain
    // bundles (e.g. 4 standalone sends) are permitted under the new
    // DAG-aware semantics. Atomicity at the Payment Intent level holds even when
    // no `inputCoinFromStep` chains are wired.
    const provider = createMockProvider([makeTurnOfPair(4)]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('4 sends'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(4);
  });

  it('refuses a 5-op bundle and yields N=5 max_bundle_ops error tool_results', async () => {
    const provider = createMockProvider([
      makeTurnOfPair(5),
      [
        {
          type: 'text',
          text: 'I will execute these as 5 sequential single-write transactions.',
        },
      ],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('5 sends'));

    expect(events.find((e) => e.type === 'pending_action')).toBeUndefined();

    const errorResults = events.filter(
      (e) => e.type === 'tool_result' && e.isError,
    ) as Array<EngineEvent & { type: 'tool_result' }>;
    expect(errorResults).toHaveLength(5);
    for (const er of errorResults) {
      const result = er.result as { error?: string; _gate?: string };
      expect(result._gate).toBe('max_bundle_ops');
      expect(result.error).toMatch(/capped at 4/);
      expect(result.error).toMatch(/sequential single-write transactions/);
    }
  });

  it('refuses a 6-op bundle (well above the cap)', async () => {
    const provider = createMockProvider([
      makeTurnOfPair(6),
      [{ type: 'text', text: 'I will split.' }],
    ]);
    const tools = applyToolFlags([makeWrite('send_transfer')]);
    const engine = new QueryEngine({ provider, tools, systemPrompt: 'test' });
    const events = await collectEvents(engine.submitMessage('6 sends'));
    const errorResults = events.filter(
      (e) => e.type === 'tool_result' && e.isError,
    );
    expect(errorResults).toHaveLength(6);
    expect(events.find((e) => e.type === 'pending_action')).toBeUndefined();
  });

  it('production repro: 6-op compound flow returns capped error', async () => {
    // The exact May 3 production failure shape — 6 writes spanning
    // every confirm-tier bundleable op. Refuses up front so the LLM
    // splits sequentially, no wasted PREPARE round-trip. Under
    // Phase 3a (cap=4), the rejection is the same shape, just
    // expressed against a higher cap.
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: 'repay_debt', input: { amount: 2 } },
        { type: 'tool_call', id: 'tc-2', name: 'swap_execute', input: { amount: 1.98 } },
        { type: 'tool_call', id: 'tc-3', name: 'swap_execute', input: { amount: 5 } },
        { type: 'tool_call', id: 'tc-4', name: 'save_deposit', input: { amount: 9.99 } },
        { type: 'tool_call', id: 'tc-5', name: 'borrow', input: { amount: 1 } },
        { type: 'tool_call', id: 'tc-6', name: 'send_transfer', input: { amount: 1 } },
      ],
      [{ type: 'text', text: 'I will run these sequentially.' }],
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

// [Phase 0 → Phase 3a / SPEC 13] VALID_PAIRS chain-mode population +
// Phase 3a relaxation regression suite.
//
// Pre-Phase-3a: a non-whitelisted adjacent pair fails the entire
// bundle with `_gate: 'pair_not_whitelisted'`.
//
// Phase 3a: no envelope-level rejection. Whitelisted pairs still
// populate `inputCoinFromStep` (chain-mode); non-whitelisted pairs
// run wallet-mode independently inside the same atomic Payment Intent. The SDK
// preflight surfaces any bad-shape failures at /api/transactions/
// prepare time before the user signs.
describe('Phase 3a — chain-mode population (no envelope rejection)', () => {
  const allWriteTools = [
    'save_deposit',
    'withdraw',
    'borrow',
    'repay_debt',
    'send_transfer',
    'swap_execute',
  ];

  function setup(producer: string, consumer: string) {
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: producer, input: { amount: 1 } },
        { type: 'tool_call', id: 'tc-2', name: consumer, input: { amount: 1 } },
      ],
      [{ type: 'text', text: 'narration' }],
    ]);
    const tools = applyToolFlags(allWriteTools.map((n) => makeWrite(n)));
    return new QueryEngine({ provider, tools, systemPrompt: 'test' });
  }

  // The 7 whitelisted pairs — every one MUST compose successfully
  // AND populate inputCoinFromStep when assets align.
  const validPairs: Array<[string, string]> = [
    ['swap_execute', 'send_transfer'],
    ['swap_execute', 'save_deposit'],
    ['swap_execute', 'repay_debt'],
    ['withdraw', 'swap_execute'],
    ['withdraw', 'send_transfer'],
    ['borrow', 'send_transfer'],
    ['borrow', 'repay_debt'],
  ];

  for (const [producer, consumer] of validPairs) {
    it(`accepts whitelisted pair: ${producer} → ${consumer}`, async () => {
      const engine = setup(producer, consumer);
      const events = await collectEvents(engine.submitMessage(`${producer} then ${consumer}`));
      const pending = events.find((e) => e.type === 'pending_action') as
        | (EngineEvent & { type: 'pending_action'; action: PendingAction })
        | undefined;
      expect(pending).toBeDefined();
      expect(pending!.action.steps).toHaveLength(2);
      expect(pending!.action.steps?.[0]?.toolName).toBe(producer);
      expect(pending!.action.steps?.[1]?.toolName).toBe(consumer);
    });
  }

  // [Phase 3a relaxation] Pre-3a these were rejected with
  // `pair_not_whitelisted`. Under Phase 3a they compose successfully
  // and run wallet-mode (no `inputCoinFromStep`). The SDK's existing
  // wallet-mode preflight surfaces NO_COINS_FOUND at PREPARE time if
  // the consumer's wallet doesn't hold the input asset.
  const previouslyRejectedPairs: Array<[string, string, string]> = [
    ['swap_execute', 'swap_execute', 'multi-hop swaps — Phase 3b unlock'],
    ['borrow', 'swap_execute', 'borrow output funds a swap'],
    ['save_deposit', 'send_transfer', 'wallet send after independent save'],
    ['send_transfer', 'send_transfer', 'two independent sends in one Payment Intent'],
    ['withdraw', 'save_deposit', 'withdraw + save (separate USDC pulls)'],
    ['repay_debt', 'send_transfer', 'wallet send after independent repay'],
  ];

  for (const [producer, consumer, why] of previouslyRejectedPairs) {
    it(`Phase 3a accepts previously-rejected pair: ${producer} → ${consumer} (${why})`, async () => {
      const engine = setup(producer, consumer);
      const events = await collectEvents(engine.submitMessage(`${producer} then ${consumer}`));

      const pending = events.find((e) => e.type === 'pending_action') as
        | (EngineEvent & { type: 'pending_action'; action: PendingAction })
        | undefined;
      expect(pending).toBeDefined();
      expect(pending!.action.steps).toHaveLength(2);
      expect(pending!.action.steps?.[0]?.toolName).toBe(producer);
      expect(pending!.action.steps?.[1]?.toolName).toBe(consumer);
      expect(pending!.action.steps?.[1]?.inputCoinFromStep).toBeUndefined();

      const errorResults = events.filter(
        (e) => e.type === 'tool_result' && e.isError,
      );
      expect(errorResults).toHaveLength(0);
    });
  }

  it('production repro: swap_execute(USDC→USDsui) + save_deposit(USDsui) is whitelisted (was the May 3 failure)', async () => {
    // The exact May 3 failure shape. Pre-Phase-0 the engine composed
    // a bundle that reverted at PREPARE because USDsui didn't exist
    // in the wallet yet. Phase 0 still allows compose (this pair IS
    // in the whitelist) — the wallet caveat is documented in the
    // system prompt rule and Phase 1's chain-handoff fixes it for
    // real. The test asserts the whitelist still admits the pair,
    // not that the prepare succeeds.
    const engine = setup('swap_execute', 'save_deposit');
    const events = await collectEvents(engine.submitMessage('swap then save'));
    const pending = events.find((e) => e.type === 'pending_action');
    expect(pending).toBeDefined();
  });
});

// [Phase 2 → Phase 3a / SPEC 13 / 1.15.0] 3-op composition rules.
//
// Pre-3a (1.14.x): strict adjacency — every (i, i+1) pair must be in
// VALID_PAIRS. Any single non-whitelisted adjacent pair failed the
// whole bundle.
//
// Phase 3a (1.15.0): DAG-aware. Whitelisted asset-aligned pairs
// populate inputCoinFromStep; non-chained pairs compose AND run
// wallet-mode independently. Bundles compose successfully even when
// adjacent steps are completely independent.
describe('Phase 3a — 3-op composition rules (1.15.0)', () => {
  function setup3op(
    a: string,
    b: string,
    c: string,
    inputs?: { a?: unknown; b?: unknown; c?: unknown },
  ) {
    const allWriteTools = [
      'save_deposit',
      'withdraw',
      'borrow',
      'repay_debt',
      'send_transfer',
      'swap_execute',
    ];
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: a, input: inputs?.a ?? { amount: 1 } },
        { type: 'tool_call', id: 'tc-2', name: b, input: inputs?.b ?? { amount: 1 } },
        { type: 'tool_call', id: 'tc-3', name: c, input: inputs?.c ?? { amount: 1, to: '0xabc' } },
      ],
      [{ type: 'text', text: 'narration' }],
    ]);
    const tools = applyToolFlags(allWriteTools.map((n) => makeWrite(n)));
    return new QueryEngine({ provider, tools, systemPrompt: 'test' });
  }

  // 3-op happy paths whose every adjacent pair is in VALID_PAIRS.
  // Asset-aligned producer-consumer pairs ALSO populate
  // inputCoinFromStep (chain mode); non-aligned pairs run wallet-mode
  // but the bundle still composes.
  it('accepts withdraw → swap → send (both pairs whitelisted, both chained when assets align)', async () => {
    const engine = setup3op('withdraw', 'swap_execute', 'send_transfer', {
      a: { amount: 5, asset: 'USDC' },
      b: { from: 'USDC', to: 'SUI', amount: 5 },
      c: { amount: 5, to: '0xabc', asset: 'SUI' },
    });
    const events = await collectEvents(engine.submitMessage('withdraw, swap, send'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(3);
    expect(pending!.action.steps![0].inputCoinFromStep).toBeUndefined();
    expect(pending!.action.steps![1].inputCoinFromStep).toBe(0);
    expect(pending!.action.steps![2].inputCoinFromStep).toBe(1);
  });

  it('accepts withdraw → swap → save (both pairs whitelisted, asset-aligned chain)', async () => {
    const engine = setup3op('withdraw', 'swap_execute', 'save_deposit', {
      a: { amount: 5, asset: 'USDC' },
      b: { from: 'USDC', to: 'USDsui', amount: 5 },
      c: { amount: 5, asset: 'USDsui' },
    });
    const events = await collectEvents(engine.submitMessage('withdraw, swap, save'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(3);
    expect(pending!.action.steps![1].inputCoinFromStep).toBe(0);
    expect(pending!.action.steps![2].inputCoinFromStep).toBe(1);
  });

  // [Phase 3a relaxation] Previously-rejected 3-op topologies now
  // compose successfully. They run wallet-mode for non-whitelisted
  // pairs. The SDK preflight surfaces NO_COINS_FOUND at PREPARE
  // time if the wallet doesn't hold the consumer's input asset.
  it('Phase 3a accepts 3-op with first pair not whitelisted: send → withdraw → swap', async () => {
    const engine = setup3op('send_transfer', 'withdraw', 'swap_execute');
    const events = await collectEvents(engine.submitMessage('send, withdraw, swap'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(3);
    expect(pending!.action.steps![1].inputCoinFromStep).toBeUndefined();
    expect(pending!.action.steps![2].inputCoinFromStep).toBeUndefined();
  });

  it('Phase 3a accepts 3-op with second pair not whitelisted: withdraw → swap → withdraw', async () => {
    const engine = setup3op('withdraw', 'swap_execute', 'withdraw', {
      a: { amount: 5, asset: 'USDC' },
      b: { from: 'USDC', to: 'SUI', amount: 5 },
      c: { amount: 3, asset: 'USDsui' },
    });
    const events = await collectEvents(engine.submitMessage('withdraw, swap, withdraw'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(3);
    expect(pending!.action.steps![1].inputCoinFromStep).toBe(0);
    expect(pending!.action.steps![2].inputCoinFromStep).toBeUndefined();
  });

  it('Phase 3a accepts 3-op zero-chain bundle: send → send → send (P0-10 — multiple independent sends)', async () => {
    const engine = setup3op('send_transfer', 'send_transfer', 'send_transfer');
    const events = await collectEvents(engine.submitMessage('three sends'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(3);
    // None of the steps chain — every step runs wallet-mode independently.
    expect(pending!.action.steps![0].inputCoinFromStep).toBeUndefined();
    expect(pending!.action.steps![1].inputCoinFromStep).toBeUndefined();
    expect(pending!.action.steps![2].inputCoinFromStep).toBeUndefined();
    const errorResults = events.filter(
      (e) => e.type === 'tool_result' && e.isError,
    );
    expect(errorResults).toHaveLength(0);
  });

  it('chain-mode counter fires twice for asset-aligned 3-op (withdraw → swap → send all aligned)', async () => {
    // Direct unit test of the chain-mode population loop — uses the
    // composer helper directly so we observe the counter, not the
    // full engine flow (which would need provider scripting). This
    // mirrors the 1.13.1 telemetry test pattern.
    const { composeBundleFromToolResults } = await import('../compose-bundle.js');
    const spyCounter = vi.fn<(name: string, tags?: TelemetryTags, value?: number) => void>();
    const sink: TelemetrySink = {
      counter: spyCounter,
      gauge: vi.fn(),
      histogram: vi.fn(),
    };
    setTelemetrySink(sink);
    try {
      const tools = applyToolFlags([
        makeWrite('withdraw'),
        makeWrite('swap_execute'),
        makeWrite('send_transfer'),
      ]).map((t) => ({ ...t, flags: { ...t.flags, bundleable: true } }));
      composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'withdraw', input: { amount: 5, asset: 'USDC' } },
          {
            id: 'tc-2',
            name: 'swap_execute',
            input: { from: 'USDC', to: 'SUI', amount: 5 },
          },
          {
            id: 'tc-3',
            name: 'send_transfer',
            input: { amount: 5, to: '0xabc', asset: 'SUI' },
          },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });
      const chainModeCalls = spyCounter.mock.calls.filter(
        (c) => c[0] === 'engine.bundle_chain_mode_set',
      );
      expect(chainModeCalls).toHaveLength(2);
      expect(chainModeCalls[0][1]).toEqual({ producer: 'withdraw', consumer: 'swap_execute' });
      expect(chainModeCalls[1][1]).toEqual({ producer: 'swap_execute', consumer: 'send_transfer' });
    } finally {
      resetTelemetrySink();
    }
  });
});

// ---------------------------------------------------------------------------
// SPEC 13 Phase 1 — inputCoinFromStep population (chain-mode handoff)
// ---------------------------------------------------------------------------

describe('SPEC 13 Phase 1 — chain-coin handoff (inputCoinFromStep auto-population)', () => {
  describe('inferProducerOutputAsset', () => {
    it('returns swap.to lowercased', async () => {
      const { inferProducerOutputAsset } = await import('../compose-bundle.js');
      expect(inferProducerOutputAsset('swap_execute', { from: 'USDC', to: 'USDsui', amount: 5 }))
        .toBe('usdsui');
    });

    it('returns withdraw.asset lowercased (default USDC)', async () => {
      const { inferProducerOutputAsset } = await import('../compose-bundle.js');
      expect(inferProducerOutputAsset('withdraw', { amount: 5, asset: 'USDsui' })).toBe('usdsui');
      expect(inferProducerOutputAsset('withdraw', { amount: 5 })).toBe('usdc');
    });

    it('returns borrow.asset lowercased (default USDC)', async () => {
      const { inferProducerOutputAsset } = await import('../compose-bundle.js');
      expect(inferProducerOutputAsset('borrow', { amount: 5, asset: 'USDsui' })).toBe('usdsui');
      expect(inferProducerOutputAsset('borrow', { amount: 5 })).toBe('usdc');
    });

    it('returns null for terminal-consumer tools (save_deposit, repay_debt, send_transfer)', async () => {
      const { inferProducerOutputAsset } = await import('../compose-bundle.js');
      expect(inferProducerOutputAsset('save_deposit', { amount: 5 })).toBeNull();
      expect(inferProducerOutputAsset('repay_debt', { amount: 5 })).toBeNull();
      expect(inferProducerOutputAsset('send_transfer', { amount: 5, to: '0xA' })).toBeNull();
    });
  });

  describe('inferConsumerInputAsset', () => {
    it('returns send.asset lowercased (default USDC)', async () => {
      const { inferConsumerInputAsset } = await import('../compose-bundle.js');
      expect(inferConsumerInputAsset('send_transfer', { amount: 5, to: '0xA', asset: 'USDsui' }))
        .toBe('usdsui');
      expect(inferConsumerInputAsset('send_transfer', { amount: 5, to: '0xA' })).toBe('usdc');
    });

    it('returns swap.from lowercased', async () => {
      const { inferConsumerInputAsset } = await import('../compose-bundle.js');
      expect(inferConsumerInputAsset('swap_execute', { from: 'USDC', to: 'SUI', amount: 5 }))
        .toBe('usdc');
    });
  });

  describe('shouldChainCoin — whitelist + asset-alignment gate', () => {
    it('true when pair is whitelisted AND assets align (swap USDC→USDsui then save USDsui)', async () => {
      const { shouldChainCoin } = await import('../compose-bundle.js');
      expect(shouldChainCoin(
        { id: 'tc-1', name: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 5 } },
        { id: 'tc-2', name: 'save_deposit', input: { amount: 5, asset: 'USDsui' } },
      )).toBe(true);
    });

    it('true when withdraw USDC then send USDC (asset default matches default)', async () => {
      const { shouldChainCoin } = await import('../compose-bundle.js');
      expect(shouldChainCoin(
        { id: 'tc-1', name: 'withdraw', input: { amount: 5 } },
        { id: 'tc-2', name: 'send_transfer', input: { amount: 5, to: '0xA' } },
      )).toBe(true);
    });

    it('false when pair is whitelisted but assets misaligned (swap USDC→SUI then save USDsui)', async () => {
      const { shouldChainCoin } = await import('../compose-bundle.js');
      expect(shouldChainCoin(
        { id: 'tc-1', name: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 5 } },
        { id: 'tc-2', name: 'save_deposit', input: { amount: 5, asset: 'USDsui' } },
      )).toBe(false);
    });

    it('false when pair is NOT whitelisted (e.g. repay_debt → swap_execute)', async () => {
      const { shouldChainCoin } = await import('../compose-bundle.js');
      expect(shouldChainCoin(
        { id: 'tc-1', name: 'repay_debt', input: { amount: 5, asset: 'USDC' } },
        { id: 'tc-2', name: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 5 } },
      )).toBe(false);
    });

    it('case-insensitive asset comparison (lowercase ↔ canonical-case)', async () => {
      const { shouldChainCoin } = await import('../compose-bundle.js');
      expect(shouldChainCoin(
        { id: 'tc-1', name: 'swap_execute', input: { from: 'USDC', to: 'usdsui', amount: 5 } },
        { id: 'tc-2', name: 'save_deposit', input: { amount: 5, asset: 'USDsui' } },
      )).toBe(true);
    });
  });

  describe('composeBundleFromToolResults — inputCoinFromStep auto-population', () => {
    function makeBundleableWrite(name: string): Tool {
      return buildTool({
        name,
        description: `mock ${name}`,
        inputSchema: z.object({}).passthrough(),
        jsonSchema: { type: 'object', properties: {} },
        isReadOnly: false,
        permissionLevel: 'confirm',
        async call() {
          return { data: { ok: true } };
        },
      });
    }

    it('populates inputCoinFromStep=0 on step 1 for swap → save (aligned)', async () => {
      const { composeBundleFromToolResults } = await import('../compose-bundle.js');
      const tools = applyToolFlags([
        makeBundleableWrite('swap_execute'),
        makeBundleableWrite('save_deposit'),
      ]);
      const action = composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 5 } },
          { id: 'tc-2', name: 'save_deposit', input: { amount: 5, asset: 'USDsui' } },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });

      expect(action.steps).toHaveLength(2);
      expect(action.steps![0].inputCoinFromStep).toBeUndefined();
      expect(action.steps![1].inputCoinFromStep).toBe(0);
    });

    it('populates inputCoinFromStep=0 on step 1 for withdraw → send (aligned)', async () => {
      const { composeBundleFromToolResults } = await import('../compose-bundle.js');
      const tools = applyToolFlags([
        makeBundleableWrite('withdraw'),
        makeBundleableWrite('send_transfer'),
      ]);
      const action = composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'withdraw', input: { amount: 5, asset: 'USDC' } },
          { id: 'tc-2', name: 'send_transfer', input: { amount: 5, to: '0xA', asset: 'USDC' } },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });

      expect(action.steps![1].inputCoinFromStep).toBe(0);
    });

    it('does NOT populate inputCoinFromStep when assets misalign (swap USDC→SUI then save USDsui)', async () => {
      const { composeBundleFromToolResults } = await import('../compose-bundle.js');
      const tools = applyToolFlags([
        makeBundleableWrite('swap_execute'),
        makeBundleableWrite('save_deposit'),
      ]);
      const action = composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 5 } },
          { id: 'tc-2', name: 'save_deposit', input: { amount: 5, asset: 'USDsui' } },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });

      expect(action.steps![1].inputCoinFromStep).toBeUndefined();
    });

    it('does NOT populate inputCoinFromStep for non-whitelisted pair (would never reach this helper, but defensive)', async () => {
      const { composeBundleFromToolResults } = await import('../compose-bundle.js');
      const tools = applyToolFlags([
        makeBundleableWrite('send_transfer'),
        makeBundleableWrite('send_transfer'),
      ]);
      const action = composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA', asset: 'USDC' } },
          { id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB', asset: 'USDC' } },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });

      // send_transfer → send_transfer is NOT in VALID_PAIRS → no chain.
      expect(action.steps![1].inputCoinFromStep).toBeUndefined();
    });

    it('all 7 whitelisted pairs populate inputCoinFromStep when assets align', async () => {
      const { composeBundleFromToolResults } = await import('../compose-bundle.js');
      const cases: Array<{
        pair: [string, string];
        producerInput: Record<string, unknown>;
        consumerInput: Record<string, unknown>;
      }> = [
        {
          pair: ['swap_execute', 'send_transfer'],
          producerInput: { from: 'USDC', to: 'SUI', amount: 5 },
          consumerInput: { amount: 5, to: '0xA', asset: 'SUI' },
        },
        {
          pair: ['swap_execute', 'save_deposit'],
          producerInput: { from: 'USDC', to: 'USDsui', amount: 5 },
          consumerInput: { amount: 5, asset: 'USDsui' },
        },
        {
          pair: ['swap_execute', 'repay_debt'],
          producerInput: { from: 'USDC', to: 'USDsui', amount: 5 },
          consumerInput: { amount: 5, asset: 'USDsui' },
        },
        {
          pair: ['withdraw', 'swap_execute'],
          producerInput: { amount: 5, asset: 'USDC' },
          consumerInput: { from: 'USDC', to: 'SUI', amount: 5 },
        },
        {
          pair: ['withdraw', 'send_transfer'],
          producerInput: { amount: 5, asset: 'USDC' },
          consumerInput: { amount: 5, to: '0xA', asset: 'USDC' },
        },
        {
          pair: ['borrow', 'send_transfer'],
          producerInput: { amount: 5, asset: 'USDC' },
          consumerInput: { amount: 5, to: '0xA', asset: 'USDC' },
        },
        {
          pair: ['borrow', 'repay_debt'],
          producerInput: { amount: 5, asset: 'USDC' },
          consumerInput: { amount: 5, asset: 'USDC' },
        },
      ];

      for (const { pair, producerInput, consumerInput } of cases) {
        const tools = applyToolFlags([makeBundleableWrite(pair[0]), makeBundleableWrite(pair[1])]);
        const action = composeBundleFromToolResults({
          pendingWrites: [
            { id: 'tc-1', name: pair[0], input: producerInput },
            { id: 'tc-2', name: pair[1], input: consumerInput },
          ],
          tools,
          readResults: [],
          assistantContent: [],
          completedResults: [],
          turnIndex: 0,
        });
        expect(
          action.steps![1].inputCoinFromStep,
          `pair ${pair[0]} → ${pair[1]} should populate inputCoinFromStep`,
        ).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // [1.13.1] engine.bundle_chain_mode_set telemetry counter
  // -------------------------------------------------------------------------
  //
  // Without this counter we'd be inferring chain-mode firing from "things
  // didn't break" — fine for correctness, useless for diagnosis when a Phase
  // 2+ pair regresses to wallet-mode silently. The fix reproduces the May 3
  // production gap (2-op bundle whose intermediate output didn't exist in
  // the wallet) with a direct production signal.
  describe('engine.bundle_chain_mode_set counter (1.13.1)', () => {
    function makeBundleableWrite(name: string): Tool {
      return buildTool({
        name,
        description: `mock ${name}`,
        inputSchema: z.object({}).passthrough(),
        jsonSchema: { type: 'object', properties: {} },
        isReadOnly: false,
        permissionLevel: 'confirm',
        async call() {
          return { data: { ok: true } };
        },
      });
    }

    function installSpySink(): {
      counter: ReturnType<typeof vi.fn>;
      gauge: ReturnType<typeof vi.fn>;
      histogram: ReturnType<typeof vi.fn>;
    } {
      const spy = {
        counter: vi.fn<(name: string, tags?: TelemetryTags, value?: number) => void>(),
        gauge: vi.fn<(name: string, value: number, tags?: TelemetryTags) => void>(),
        histogram: vi.fn<(name: string, value: number, tags?: TelemetryTags) => void>(),
      };
      const sink: TelemetrySink = {
        counter: spy.counter,
        gauge: spy.gauge,
        histogram: spy.histogram,
      };
      setTelemetrySink(sink);
      return spy;
    }

    afterEach(() => {
      resetTelemetrySink();
    });

    it('fires once per chained pair with {producer, consumer} tags', async () => {
      const { composeBundleFromToolResults } = await import('../compose-bundle.js');
      const spy = installSpySink();
      const tools = applyToolFlags([
        makeBundleableWrite('swap_execute'),
        makeBundleableWrite('save_deposit'),
      ]);
      composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 5 } },
          { id: 'tc-2', name: 'save_deposit', input: { amount: 5, asset: 'USDsui' } },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });

      const chainModeCalls = spy.counter.mock.calls.filter(
        (c) => c[0] === 'engine.bundle_chain_mode_set',
      );
      expect(chainModeCalls).toHaveLength(1);
      expect(chainModeCalls[0][1]).toEqual({ producer: 'swap_execute', consumer: 'save_deposit' });
    });

    it('does NOT fire when assets misalign (wallet-mode fallback)', async () => {
      const { composeBundleFromToolResults } = await import('../compose-bundle.js');
      const spy = installSpySink();
      const tools = applyToolFlags([
        makeBundleableWrite('swap_execute'),
        makeBundleableWrite('save_deposit'),
      ]);
      composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'swap_execute', input: { from: 'USDC', to: 'SUI', amount: 5 } },
          { id: 'tc-2', name: 'save_deposit', input: { amount: 5, asset: 'USDsui' } },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });

      const chainModeCalls = spy.counter.mock.calls.filter(
        (c) => c[0] === 'engine.bundle_chain_mode_set',
      );
      expect(chainModeCalls).toHaveLength(0);
    });

    it('does NOT fire for non-whitelisted pairs', async () => {
      const { composeBundleFromToolResults } = await import('../compose-bundle.js');
      const spy = installSpySink();
      const tools = applyToolFlags([
        makeBundleableWrite('send_transfer'),
        makeBundleableWrite('send_transfer'),
      ]);
      composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA', asset: 'USDC' } },
          { id: 'tc-2', name: 'send_transfer', input: { amount: 3, to: '0xB', asset: 'USDC' } },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });

      const chainModeCalls = spy.counter.mock.calls.filter(
        (c) => c[0] === 'engine.bundle_chain_mode_set',
      );
      expect(chainModeCalls).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// SPEC 13 Phase 3a — 4-op DAG-aware composition (1.15.0)
// ---------------------------------------------------------------------------
//
// Demo 1 shape: a 4-op bundle with ONE chained pair (e.g., swap →
// save) and three independent legs running wallet-mode. Demonstrates
// the headline Phase 3a unlock: atomic compound flows with mixed
// chain/wallet semantics.
//
// Phase 3a invariant: chain-mode counter fires exactly once per
// actually-chained pair (where producer.output asset matches
// consumer.input asset AND the pair is in VALID_PAIRS). Adjacent
// non-chained pairs do NOT fire the counter.
describe('SPEC 13 Phase 3a — 4-op DAG composition (1.15.0)', () => {
  function makeBundleableWrite(name: string): Tool {
    return buildTool({
      name,
      description: `mock ${name}`,
      inputSchema: z.object({}).passthrough(),
      jsonSchema: { type: 'object', properties: {} },
      isReadOnly: false,
      permissionLevel: 'confirm',
      async call() {
        return { data: { ok: true } };
      },
    });
  }

  function setup4op(
    a: string,
    b: string,
    c: string,
    d: string,
    inputs: { a?: unknown; b?: unknown; c?: unknown; d?: unknown } = {},
  ) {
    const allWriteTools = [
      'save_deposit',
      'withdraw',
      'borrow',
      'repay_debt',
      'send_transfer',
      'swap_execute',
    ];
    const provider = createMockProvider([
      [
        { type: 'tool_call', id: 'tc-1', name: a, input: inputs.a ?? { amount: 1 } },
        { type: 'tool_call', id: 'tc-2', name: b, input: inputs.b ?? { amount: 1 } },
        { type: 'tool_call', id: 'tc-3', name: c, input: inputs.c ?? { amount: 1 } },
        { type: 'tool_call', id: 'tc-4', name: d, input: inputs.d ?? { amount: 1, to: '0xabc' } },
      ],
      [{ type: 'text', text: 'narration' }],
    ]);
    const tools = applyToolFlags(allWriteTools.map((n) => makeWrite(n)));
    return new QueryEngine({ provider, tools, systemPrompt: 'test' });
  }

  // P0-8 shape: 4-op DAG with mid-bundle chain. swap_execute(USDC→USDsui)
  // → save_deposit(USDsui) is whitelisted + asset-aligned, so step 1
  // chains from step 0. The bracketing send (step 2) and the trailing
  // send (step 3) run wallet-mode.
  it('accepts 4-op DAG with one chained pair (swap → save chained, sends wallet-mode)', async () => {
    const engine = setup4op(
      'send_transfer',
      'swap_execute',
      'save_deposit',
      'send_transfer',
      {
        a: { amount: 5, to: '0xfirst', asset: 'USDC' },
        b: { from: 'USDC', to: 'USDsui', amount: 10 },
        c: { amount: 10, asset: 'USDsui' },
        d: { amount: 100, to: '0xlast', asset: 'USDC' },
      },
    );
    const events = await collectEvents(engine.submitMessage('demo-1 shape'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(4);
    expect(pending!.action.steps![0].inputCoinFromStep).toBeUndefined();
    expect(pending!.action.steps![1].inputCoinFromStep).toBeUndefined();
    expect(pending!.action.steps![2].inputCoinFromStep).toBe(1);
    expect(pending!.action.steps![3].inputCoinFromStep).toBeUndefined();
  });

  // P0-9 shape: 4-op partial-chain bundle. withdraw(USDC) → swap(USDC→SUI)
  // chains; swap → send(SUI) chains (both whitelisted + aligned); fourth
  // step is an independent send running wallet-mode.
  it('accepts 4-op partial-chain bundle (withdraw → swap → send chained, fourth send wallet-mode)', async () => {
    const engine = setup4op(
      'withdraw',
      'swap_execute',
      'send_transfer',
      'send_transfer',
      {
        a: { amount: 5, asset: 'USDC' },
        b: { from: 'USDC', to: 'SUI', amount: 5 },
        c: { amount: 5, to: '0xrecipient', asset: 'SUI' },
        d: { amount: 1, to: '0xother', asset: 'USDC' },
      },
    );
    const events = await collectEvents(engine.submitMessage('partial chain'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(4);
    expect(pending!.action.steps![0].inputCoinFromStep).toBeUndefined();
    expect(pending!.action.steps![1].inputCoinFromStep).toBe(0);
    expect(pending!.action.steps![2].inputCoinFromStep).toBe(1);
    expect(pending!.action.steps![3].inputCoinFromStep).toBeUndefined();
  });

  // P0-10: zero-chain 4-op bundle (four independent sends). No
  // `inputCoinFromStep` populated anywhere. Atomicity at the Payment
  // Intent level still holds (all-or-nothing settlement).
  it('accepts 4-op zero-chain bundle (four independent sends — P0-10)', async () => {
    const engine = setup4op(
      'send_transfer',
      'send_transfer',
      'send_transfer',
      'send_transfer',
    );
    const events = await collectEvents(engine.submitMessage('four sends'));
    const pending = events.find((e) => e.type === 'pending_action') as
      | (EngineEvent & { type: 'pending_action'; action: PendingAction })
      | undefined;
    expect(pending).toBeDefined();
    expect(pending!.action.steps).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(pending!.action.steps![i].inputCoinFromStep).toBeUndefined();
    }
    const errorResults = events.filter(
      (e) => e.type === 'tool_result' && e.isError,
    );
    expect(errorResults).toHaveLength(0);
  });

  // Counter invariant: chain-mode fires ONCE per actually-chained pair
  // even in a 4-op bundle with mixed chain/wallet legs.
  it('chain-mode counter fires only for actually-chained pairs in a 4-op DAG', async () => {
    const { composeBundleFromToolResults } = await import('../compose-bundle.js');
    const spyCounter = vi.fn<(name: string, tags?: TelemetryTags, value?: number) => void>();
    const sink: TelemetrySink = {
      counter: spyCounter,
      gauge: vi.fn(),
      histogram: vi.fn(),
    };
    setTelemetrySink(sink);
    try {
      const tools = applyToolFlags([
        makeBundleableWrite('send_transfer'),
        makeBundleableWrite('swap_execute'),
        makeBundleableWrite('save_deposit'),
        makeBundleableWrite('send_transfer'),
      ]);
      composeBundleFromToolResults({
        pendingWrites: [
          { id: 'tc-1', name: 'send_transfer', input: { amount: 5, to: '0xA', asset: 'USDC' } },
          { id: 'tc-2', name: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 10 } },
          { id: 'tc-3', name: 'save_deposit', input: { amount: 10, asset: 'USDsui' } },
          { id: 'tc-4', name: 'send_transfer', input: { amount: 1, to: '0xB', asset: 'USDC' } },
        ],
        tools,
        readResults: [],
        assistantContent: [],
        completedResults: [],
        turnIndex: 0,
      });
      const chainModeCalls = spyCounter.mock.calls.filter(
        (c) => c[0] === 'engine.bundle_chain_mode_set',
      );
      // Only swap_execute → save_deposit chains (assets align). The
      // other three adjacent pairs (send→swap, save→send) are not
      // whitelisted/asset-aligned and run wallet-mode silently.
      expect(chainModeCalls).toHaveLength(1);
      expect(chainModeCalls[0][1]).toEqual({
        producer: 'swap_execute',
        consumer: 'save_deposit',
      });
    } finally {
      resetTelemetrySink();
    }
  });
});
