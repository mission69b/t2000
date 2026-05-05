import { z } from 'zod';
import { buildTool } from '../tool.js';

// ---------------------------------------------------------------------------
// update_todo — persistent per-turn todo list (SPEC 8 v0.5.1, P3.2 slice 2)
//
// The LLM calls this tool to declare or update its plan for the current
// turn. Each call replaces the entire list — the tool is idempotent;
// later calls overwrite earlier ones.
//
// The host renders the list as a sticky timeline block during the turn and
// collapses it into "✓ N-step plan completed" once the turn ends. See
// `spec/SPEC_8_INTERACTIVE_HARNESS.md` § "Layer 2 — `update_todo` tool".
//
// ## Why this is a tool and not a system-prompt convention
//
// Tools have typed inputs the LLM can't malform. A free-text "<plan>...
// </plan>" convention would lose its shape under truncation, cache
// invalidation, or model upgrade. Typed input means hosts get a structured
// payload they can render, persist, or replay without parsing prose.
//
// ## Why this is exempt from `maxTurns`
//
// Calling `update_todo` documents work; it doesn't advance work. If the
// LLM fires it 4× during a 5-tool plan, that's 4 of its 10 turns gone to
// narration before any real action. The exemption (in `engine.ts`
// agentLoop) detects iterations where every `tool_use` block was
// `update_todo` and decrements `turns` so the budget stays for actual
// progress. See engine.ts § "[SPEC 8 v0.5.1] update_todo maxTurns
// exemption".
//
// ## Why the tool emits a side-channel `todo_update` event
//
// The host needs to render the persistent todo card the moment the tool
// fires — before the LLM streams its next thought. A regular `tool_result`
// event renders inline-after-the-stream-tool-block; the side channel lets
// the host render directly to the timeline's sticky surface. Pattern
// mirrors the existing `canvas` event (engine.ts ~line 805–816): the tool
// result carries a magic `__todoUpdate: true` flag and the engine emits
// the side-channel event in addition to the normal `tool_result`.
//
// ## Preflight rules (LLM-facing)
//
// - 1–8 items per call (no empty lists; 8 is the spec ceiling)
// - Each label ≤ 80 chars (forces concision; longer text belongs in chat)
// - Exactly 1 `in_progress` item (the user must always know "what's
//   happening now")
// - All `id`s unique (host keys re-renders on id stability)
// - `status` is one of the three known values
//
// Failed preflight returns the rule that broke as `error.error`; the LLM
// re-asks with a corrected payload — same flow as every other write
// tool's preflight.
// ---------------------------------------------------------------------------

const todoStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

const todoItemSchema = z.object({
  id: z
    .string()
    .min(1, 'id must be a non-empty string')
    .max(40, 'id must be ≤40 chars (use a slug, not a sentence)'),
  label: z
    .string()
    .min(1, 'label must be a non-empty string')
    .max(80, 'label must be ≤80 chars (the whole point of this tool is concision)'),
  status: todoStatusSchema,
  // [SPEC 9 v0.1.3 P9.3] Per-item persistence flag — opt this todo item
  // into the long-lived `Goal` row surface. Hosts that wire goal storage
  // (audric) write a Goal row with `content: label`, `status: 'in_progress'`,
  // `sourceSessionId: <currentSession>` when this flag is true. Default
  // false — most turn-scoped items don't survive the turn. Engine is
  // unaware of how/where the host persists; it just passes the flag
  // through on the `todo_update` side-channel event.
  persist: z.boolean().optional(),
});

const inputSchema = z.object({
  items: z
    .array(todoItemSchema)
    .min(1, 'items must contain at least 1 entry')
    .max(8, 'items must contain at most 8 entries (SPEC 8 ceiling)'),
});

export type TodoItem = z.infer<typeof todoItemSchema>;
export type UpdateTodoInput = z.infer<typeof inputSchema>;

export const updateTodoTool = buildTool({
  name: 'update_todo',
  description:
    "Declare or replace your plan for the current turn as a structured todo list. " +
    "Call this when the user's ask is multi-step (≥3 tools, ≥2 reasoning hops) so " +
    "the user can see what you're doing as you do it. Each call replaces the entire " +
    "list — the tool is idempotent. " +
    "\n\nRules: 1–8 items, each label ≤80 chars, exactly 1 item must be `in_progress`. " +
    "Use stable `id`s across calls within the same turn so the UI can track item " +
    "transitions (e.g. `id: 'check-balance'` first as `pending`, later as `completed`). " +
    "\n\nDO NOT call this for single-step asks ('balance', 'rate') — it's wasted " +
    "tokens. DO call it before kicking off long flows where the user benefits from " +
    "seeing the plan unfold ('save my idle USDC' → check balance → check rates → " +
    "compute split → propose). " +
    "\n\nThis call doesn't count against your turn budget — re-narrating the plan " +
    "as items move from pending → in_progress → completed is encouraged. " +
    "\n\n[SPEC 9 v0.1.3] To promote an item into a long-lived goal that survives " +
    "across sessions, set `persist: true` on that item. Reserve this for multi-week " +
    "commitments the user explicitly wants remembered (e.g. \"save $500 by month-end\", " +
    "\"track NAVI USDC APY weekly\"). DO NOT set persist on within-turn steps " +
    "(\"check balance\", \"compute split\") — those vanish when the turn ends, which is " +
    "what you want. Default behaviour (no persist field) is don't-persist.",
  inputSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable identifier across calls within the same turn (e.g. "check-balance"). ≤40 chars.',
            },
            label: {
              type: 'string',
              description: 'What this step is doing, ≤80 chars. Concrete (e.g. "Check USDC rate") not abstract ("Gather data").',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Lifecycle state. Exactly one item must be `in_progress` per call.',
            },
            persist: {
              type: 'boolean',
              description:
                'Set true to promote this item into a long-lived goal that survives across sessions ' +
                '(e.g. "save $500 by month-end"). Default false — only set true when the item ' +
                'represents a multi-week / multi-session commitment, not a within-turn step. ' +
                'When false or omitted, the item lives only for this turn.',
            },
          },
          required: ['id', 'label', 'status'],
        },
      },
    },
    required: ['items'],
  },
  isReadOnly: true,
  // No I/O, just a pass-through that emits a side-channel event. Skip the
  // turn-read cache — every call is intentionally distinct (ids may match
  // but statuses change).
  cacheable: false,
  preflight: (input) => {
    const items = input.items ?? [];
    if (items.length === 0) {
      return { valid: false, error: 'items must contain at least 1 entry' };
    }
    if (items.length > 8) {
      return { valid: false, error: `items must contain at most 8 entries, got ${items.length}` };
    }
    const seenIds = new Set<string>();
    let inProgressCount = 0;
    for (const item of items) {
      if (!item.id || item.id.trim().length === 0) {
        return { valid: false, error: 'every item must have a non-empty id' };
      }
      if (item.id.length > 40) {
        return { valid: false, error: `item id "${item.id.slice(0, 30)}…" exceeds 40 chars` };
      }
      if (seenIds.has(item.id)) {
        return { valid: false, error: `duplicate item id "${item.id}" — ids must be unique within a list` };
      }
      seenIds.add(item.id);
      if (!item.label || item.label.trim().length === 0) {
        return { valid: false, error: `item "${item.id}" has empty label` };
      }
      if (item.label.length > 80) {
        return { valid: false, error: `item "${item.id}" label exceeds 80 chars (got ${item.label.length})` };
      }
      if (item.status === 'in_progress') {
        inProgressCount++;
      }
    }
    if (inProgressCount !== 1) {
      return {
        valid: false,
        error: `exactly 1 item must be in_progress, got ${inProgressCount}`,
      };
    }
    return { valid: true };
  },

  async call(input) {
    return {
      // The `__todoUpdate` flag tells the engine's agent loop to emit a
      // `todo_update` side-channel event (mirrors the `__canvas` magic
      // flag pattern). The LLM still gets a normal `tool_result` keyed
      // to its `tool_use_id` so the Anthropic protocol stays satisfied.
      data: {
        __todoUpdate: true,
        items: input.items,
      },
      displayText: `${input.items.length} step${input.items.length === 1 ? '' : 's'}: ${input.items
        .map((i) => `${i.status === 'completed' ? '✓' : i.status === 'in_progress' ? '→' : '·'} ${i.label}`)
        .join(' / ')}`,
    };
  },
});
