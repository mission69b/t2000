import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Messages — provider-agnostic conversation format
// ---------------------------------------------------------------------------

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    };

export interface Message {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

// ---------------------------------------------------------------------------
// Engine events — yielded by QueryEngine.submitMessage()
// ---------------------------------------------------------------------------

export type EngineEvent =
  /**
   * [SPEC 8 v0.5.1] `blockIndex` identifies which thinking block this delta
   * belongs to. Anthropic streams multi-block thinking with rising indices
   * across each turn (block 0, 1, 2, ...). Hosts use this to render
   * chronologically interleaved thinking accordions instead of flattening
   * every delta into one string. Backwards-compatible: older hosts that
   * ignore the field still see deltas in emission order.
   */
  | { type: 'thinking_delta'; text: string; blockIndex: number }
  /**
   * [SPEC 8 v0.5.1] When the thinking block contained a parseable
   * `<eval_summary>...</eval_summary>` marker, `summaryMode` flips true
   * and `evaluationItems` carries the structured rows. Hosts render the
   * `HowIEvaluatedBlock` ("✦ HOW I EVALUATED THIS") trust card from
   * these fields. Both undefined when the block had no marker (every
   * read-only and most write turns).
   */
  | {
      type: 'thinking_done';
      blockIndex: number;
      signature?: string;
      summaryMode?: boolean;
      evaluationItems?: import('./eval-summary.js').EvaluationItem[];
    }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | {
      type: 'tool_result';
      toolName: string;
      toolUseId: string;
      result: unknown;
      isError: boolean;
      /**
       * [v1.4 Item 4] True when the tool was executed by `EarlyToolDispatcher`
       * (read tools dispatched concurrently before the LLM yields). Hosts
       * record this in `TurnMetrics.toolsCalled[].wasEarlyDispatched`.
       */
      wasEarlyDispatched?: boolean;
      /**
       * [v1.4 Item 4] True when this result was synthesized from a previous
       * identical tool call by `microcompact` deduplication, instead of
       * actually re-running the tool.
       */
      resultDeduped?: boolean;
      /**
       * [v1.5] True when this result was produced by the engine's
       * post-write refresh mechanism (see `EngineConfig.postWriteRefresh`).
       * The engine auto-runs configured read tools immediately after a
       * successful write so the LLM narrates from fresh on-chain state
       * instead of inferring from a stale snapshot. Hosts should render
       * these like any other tool result; the flag is for analytics and
       * UI affordances (e.g. a subtle "auto-refreshed" badge).
       */
      wasPostWriteRefresh?: boolean;
      /**
       * [SPEC 8 v0.5.1 B3.2] Number of HTTP attempts the tool made before
       * succeeding (or returning the final result). Surfaced when the tool
       * went through one or more retries inside its retry wrapper
       * (`fetchBlockVisionWithRetry` and equivalents). Set ONLY when N > 1
       * — a successful first try leaves the field undefined to avoid
       * header noise in the host's `ToolBlockView`. Hosts render
       * "TOOL · attempt N · 1.4s" subtitle when present, hidden otherwise.
       *
       * Plumbing: engine sets a per-tool `retryStats: { attemptCount: 1 }`
       * counter on `ToolContext`; the BlockVision retry wrapper increments
       * it on every retry attempt; the engine reads it back after the tool
       * returns and surfaces here when > 1. Tools that don't use a retry
       * wrapper never emit a value.
       */
      attemptCount?: number;
    }
  | {
      type: 'pending_action';
      action: PendingAction;
    }
  | { type: 'turn_complete'; stopReason: StopReason }
  | {
      type: 'usage';
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }
  | { type: 'error'; error: Error }
  | {
      /** Emitted when a tool result carries a canvas payload (__canvas: true). */
      type: 'canvas';
      template: string;
      data: unknown;
      title: string;
      toolUseId: string;
    }
  /**
   * [v1.4 Item 4] Emitted exactly once per agent turn when context-window
   * compaction fires. Hosts (e.g. audric `TurnMetricsCollector`) flip a
   * boolean for the `TurnMetrics.compactionTriggered` column. Carries no
   * payload — `compactMessages` stays a pure function.
   */
  | { type: 'compaction' }
  /**
   * [SPEC 8 v0.5.1] Side-channel event paired to every `update_todo` tool
   * call. Hosts render the persistent todo card from this event (NOT from
   * the tool_result — see `tools/update-todo.ts` § "side-channel" for
   * rationale). Carries the full items array so the host can
   * unconditionally replace its rendered list (the tool is idempotent —
   * each call replaces the previous state). `toolUseId` lets the host
   * key the render cell to the originating tool call.
   */
  | { type: 'todo_update'; items: TodoItem[]; toolUseId: string }
  /**
   * [SPEC 8 v0.5.1] Mid-execution progress signal from a long-running tool
   * (Cetus swap_execute 2-5s, protocol_deep_dive 3-8s, portfolio_analysis
   * 1-2s). Tools opt in by calling `context.progress?.(msg, pct?)` from
   * inside their `call` implementation. Hosts render the message + bar
   * inside the corresponding tool block's spinner — kills the dead-air
   * static-spinner UX that's the explicit SPEC 8 v0.3 fix target.
   *
   * Engine wiring (queue-and-yield in the dispatcher) lands with the
   * Cetus integration in a follow-on slice. SPEC 8 v0.5.1 reserves the
   * event type now so hosts can pre-wire the renderer.
   *
   * `pct` is 0–100 when the tool can express progress quantitatively,
   * undefined otherwise (free-text status only).
   */
  | { type: 'tool_progress'; toolUseId: string; toolName: string; message: string; pct?: number }
  /**
   * [SPEC 8 v0.5.1, D2] Inline-form structured input event reserved for
   * SPEC 9 v0.1.2 (`pending_input` form primitive). The engine does NOT
   * emit this event under SPEC 8 — the type is reserved so legacy hosts
   * can add a no-op handler now and avoid crashing when SPEC 9 ships
   * `pending_input` emission. See SPEC 8 § "v0.5 cross-spec coupling
   * fixes" — gap D2 — for the forward-compat rationale.
   */
  | {
      type: 'pending_input';
      /** Form schema (shape locked in SPEC 9 v0.1.2; engine treats it opaquely). */
      schema: unknown;
      /** Engine round-trip identifier — host posts the answer back keyed on this. */
      inputId: string;
      /** Optional human-readable prompt the LLM wants the host to display above the form. */
      prompt?: string;
    }
  /**
   * [SPEC 8 v0.5.1 B3.2] One-shot per-turn declaration of which adaptive
   * harness shape this turn is running under. Emitted at the start of
   * `submitMessage` BEFORE `agentLoop` begins (not on `resumeWithToolResult`
   * — resume is a continuation of the same turn, not a new shape decision).
   *
   * Derived from `classifyEffort()` on the host side: `low → 'lean'`,
   * `medium → 'standard'`, `high → 'rich'`, `max → 'max'`. Hosts use it
   * to (a) pre-allocate UI affordances (todo surface for `rich+`),
   * (b) stamp `TurnMetrics.harnessShape` for dashboard segmentation,
   * and (c) gate optional features (e.g. forbid `update_todo` rendering
   * on `lean` even if a misbehaving LLM emits one).
   *
   * If absent, hosts MUST default to `'legacy'` for telemetry purposes
   * (existing engines that don't emit this event are pre-SPEC-8). The
   * engine emits it ONLY when the host passes `harnessShape` into
   * `submitMessage` options; hosts that don't classify won't see this
   * event.
   */
  | {
      type: 'harness_shape';
      shape: HarnessShape;
      /**
       * 1-line human-readable explanation of why this shape was picked.
       * Examples: "matched recipe portfolio_rebalance → max",
       * "session has prior writes + 'borrow' keyword → rich",
       * "single-fact lookup → lean". Forwarded into telemetry verbatim.
       */
      rationale: string;
    };

/**
 * [SPEC 8 v0.5.1 B3.2] Adaptive harness shape — driven by `classifyEffort()`,
 * pinned per-turn at turn start. Each shape implies a different
 * `thinking.budget_tokens` cap, soft block limit, and `update_todo`
 * permission. See SPEC 8 § "Adaptive thresholds: harness shape gate"
 * for the canonical mapping.
 */
export type HarnessShape = 'lean' | 'standard' | 'rich' | 'max';

/**
 * [SPEC 8 v0.5.1 B3.2] Maps the engine's `ThinkingEffort` to the host-facing
 * harness shape. Single source of truth for the `low → lean`, `medium →
 * standard`, `high → rich`, `max → max` mapping. Exported so hosts (and
 * tests) get the mapping for free without re-implementing it.
 */
export function harnessShapeForEffort(effort: ThinkingEffort): HarnessShape {
  switch (effort) {
    case 'low':
      return 'lean';
    case 'medium':
      return 'standard';
    case 'high':
      return 'rich';
    case 'max':
      return 'max';
  }
}

/**
 * [SPEC 8 v0.5.1] One row in an `update_todo` payload. Mirrored from
 * `packages/engine/src/tools/update-todo.ts`. Kept here so hosts that
 * consume `EngineEvent` don't need to depend on the tool module.
 */
export interface TodoItem {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'max_turns' | 'error';

/**
 * [v1.4 Item 6] Describes a single input field on a `PendingAction` that
 * the host UI may let the user modify before approving. Carried on the
 * `pending_action` event so clients can render editable controls without
 * hard-coding per-tool field metadata. See
 * `packages/engine/src/tools/tool-modifiable-fields.ts` for the registry.
 */
export interface PendingActionModifiableField {
  /** Input key on the `PendingAction.input` object (e.g. "amount", "to"). */
  name: string;
  /**
   * UI hint for which control to render.
   *  - `amount` — numeric input; UI shows a "~Max" hint when balance is known.
   *  - `address` — Sui address input with paste/scan affordance.
   */
  kind: 'amount' | 'address';
  /** Optional asset symbol (e.g. "USDC", "SUI", "vSUI") for amount fields. */
  asset?: string;
}

/**
 * [SPEC 7 v0.4 Layer 2] One step inside a multi-write Payment Intent
 * `PendingAction`. Single-write actions never carry `steps[]`; the
 * legacy `toolName`/`toolUseId`/`input`/`attemptId` fields cover them.
 */
export interface PendingActionStep {
  toolName: string;
  toolUseId: string;
  /**
   * Per-step UUID v4 stamped at emit time. Hosts write one
   * `TurnMetrics` row per step keyed on this id; the resume route's
   * `updateMany({ where: { attemptId } })` extends trivially to the
   * per-step shape (loop `stepResults`, update each row).
   */
  attemptId: string;
  input: unknown;
  /** Per-step user-facing summary (rendered in the PermissionCard). */
  description: string;
  /** Optional modifiable fields for THIS step (rare in v1; sourced from `tool-modifiable-fields.ts`). */
  modifiableFields?: PendingActionModifiableField[];
  /**
   * [SPEC 13 Phase 1] Index of an earlier step whose output coin handle
   * is consumed as THIS step's input coin. When set, the host's
   * `composeTx({ steps })` call must thread `priorOutputs[N]` into this
   * step's appender as `inputCoin` (chain mode), skipping the wallet
   * pre-fetch path. The producer at index `N` MUST be a tool that
   * returns a coin handle (`withdraw`, `borrow`, `swap_execute`,
   * `volo_stake`, `volo_unstake`); the consumer at this index MUST be
   * a tool that accepts an input coin (`save_deposit`, `repay_debt`,
   * `send_transfer`, `swap_execute`, `volo_stake`, `volo_unstake`).
   *
   * Populated by `composeBundleFromToolResults` for whitelisted
   * producer→consumer pairs (see `compose-bundle.ts` `VALID_PAIRS`).
   * Hosts that don't yet honour this field fall back to wallet-mode
   * coin fetching at execute time — which is exactly the pre-Phase-1
   * behaviour and remains correct for the 7 Phase 0 whitelisted pairs
   * because every producer in those pairs leaves its output in the
   * user's wallet via a terminal `tx.transferObjects([coin], sender)`.
   *
   * Pre-condition (validated by `composeTx` at execute time):
   *   `inputCoinFromStep < currentStepIndex` (forward-only references).
   */
  inputCoinFromStep?: number;
}

/**
 * Serializable description of a write tool that needs user approval.
 * Stored in the session so the client can act on it in a separate request.
 */
export interface PendingAction {
  toolName: string;
  toolUseId: string;
  input: unknown;
  description: string;
  /** Full assistant message content from the LLM turn that triggered this action. */
  assistantContent: ContentBlock[];
  /** Results from auto-approved tools in the same LLM turn (e.g. balance_check). */
  completedResults?: Array<{ toolUseId: string; content: string; isError: boolean }>;
  /** Guard injections (hints/warnings) from pre-execution checks. */
  guardInjections?: Array<{ _gate: string; _hint?: string; _warning?: string }>;
  /**
   * [v1.4 Item 6] Fields the host UI may let the user modify before
   * approving. Sourced from `tool-modifiable-fields.ts`. Absent (or
   * empty) means the action is approve-or-deny only.
   */
  modifiableFields?: PendingActionModifiableField[];
  /**
   * [v1.4 Item 6] Monotonic turn index (assistant message count) at the
   * point this pending action was emitted. Hosts use it to update the
   * matching `TurnMetrics` row when the action resolves — see
   * `apps/web/app/api/engine/resume/route.ts` `updateMany` clause.
   */
  turnIndex: number;
  /**
   * [v1.4.2 — Day 3 / Spec Item 3] Per-yield random identifier (UUID v4)
   * stamped at the moment the engine emits this `pending_action`. Hosts
   * persist it on the `TurnMetrics` row at chat-time and key the resume
   * route's `updateMany` on it instead of `(sessionId, turnIndex)` — that
   * pair is ambiguous when the same turn yields a second pending action
   * (e.g. user edits → re-yield) or when a backfill leaves multiple rows
   * matching the pair, which is exactly the false-resolution bug Item 3
   * exists to kill. Also survives session persistence so the resume call
   * can read it back from the rehydrated `PendingAction`.
   *
   * **Bundles:** when `steps !== undefined` (multi-write Payment Intent),
   * the top-level `attemptId` mirrors `steps[0].attemptId` per SPEC 7
   * § Layer 2 line 463 ("`steps[0]` mirrors the top-level
   * toolName/toolUseId/input/attemptId for hosts that haven't been
   * updated"). Pre-bundle hosts that key TurnMetrics rows on top-level
   * `attemptId` collide cleanly with the bundle-aware host's step-0 row.
   * Bundle-aware hosts iterate `steps[]` and write N TurnMetrics rows
   * (one per step `attemptId`); the resume route's
   * `updateMany({ where: { attemptId } })` keys still work because the
   * route loops `stepResults` and updates each per-step row.
   */
  attemptId: string;
  /**
   * [SPEC 7 v0.4 Layer 2] When set, this `pending_action` represents a
   * multi-write Payment Intent. Single-step bundles are NOT created — the
   * engine emits the legacy single-write shape when N=1. Hosts that haven't
   * been updated read `toolName`/`toolUseId`/`input` (which mirror
   * `steps[0]`); newer hosts iterate `steps`.
   *
   * Bundleable tools (v1): `save_deposit`, `withdraw`, `borrow`,
   * `repay_debt`, `send_transfer`, `swap_execute`, `claim_rewards`,
   * `volo_stake`, `volo_unstake`. Non-bundleable: `pay_api`
   * (HTTPS coupling), `save_contact` (Postgres only).
   */
  steps?: PendingActionStep[];
  /**
   * [SPEC 7 v0.3 Quote-Refresh] Milliseconds since the upstream read tools
   * that fed this action's composition completed. Engine stamps at emit
   * time using `Date.now() - min(tool_result.timestamp)` across the listed
   * `regenerateInput.toolUseIds`. Host renders as a "QUOTE Ns OLD" badge in
   * the PermissionCard header.
   *
   * **[SPEC 15 v0.7 follow-up — 2026-05-04]** Now also stamped on
   * single-write confirm-tier `pending_action`s when same-turn
   * regeneratable reads contributed (e.g. a confirm-tier
   * `swap_execute` whose Cetus quote is referenced via the prior
   * `swap_quote` read). Pre-v0.7 this was bundle-only.
   */
  quoteAge?: number;
  /**
   * [SPEC 7 v0.3 Quote-Refresh] True when the action was composed from
   * re-runnable read tools (`swap_quote`, `rates_info`, `balance_check`,
   * `portfolio_analysis`). False when amounts came from user-provided
   * inputs that don't depend on upstream quotes.
   *
   * **[SPEC 15 v0.7 follow-up — 2026-05-04]** Now populated for
   * single-write confirm-tier actions too — pre-v0.7 single-writes
   * always emitted `false` because the regenerate path was N≥2 only.
   * Closing that gap surfaced the Refresh-quote affordance for the
   * single-write confirm-tier scenario (e.g. $50 swap_execute).
   */
  canRegenerate?: boolean;
  /**
   * [SPEC 7 v0.3 Quote-Refresh] Engine-internal payload listing which
   * upstream read `tool_use` ids to re-fire when the user taps REGENERATE.
   * Host echoes this back via `POST /api/engine/regenerate`; engine re-runs
   * each tool with the same input (no LLM call), rebuilds the action, and
   * emits a fresh `pending_action` with a fresh `attemptId`.
   *
   * **[SPEC 15 v0.7 follow-up — 2026-05-04]** Populated for both
   * bundle (N≥2) and single-write (N=1) shapes; the engine's
   * `regenerateBundle()` rebuild branches on `action.steps?.length`
   * to pick the right composition path.
   */
  regenerateInput?: {
    toolUseIds: string[];
  };
}

/**
 * Response from the client when resolving a pending action.
 * - `approved: false` → tool is declined, LLM is told "user declined"
 * - `approved: true` with `executionResult` → engine uses the client-provided result
 *   (single-write path)
 * - `approved: true` with `stepResults` → engine pushes one `tool_result`
 *   block per step into the conversation (bundle path)
 */
export interface PermissionResponse {
  approved: boolean;
  /** Single-write (legacy) execution result. Ignored when `stepResults` is set. */
  executionResult?: unknown;
  /**
   * [SPEC 7 v0.4 Layer 2] Per-step results for a bundle resume. One entry
   * per step in the original `PendingAction.steps`, in the same order.
   * Each carries the step's `toolUseId` + `attemptId` so the host's resume
   * route can update the matching `TurnMetrics` row.
   *
   * **Atomic semantics:** Payment Intent execution is atomic at the Sui layer. If the
   * host detects a bundle-level failure, it should populate every entry
   * with `isError: true` carrying the same error message (so the LLM
   * narrates the failure once, not N times).
   */
  stepResults?: Array<{
    toolUseId: string;
    attemptId: string;
    result: unknown;
    isError: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export type PermissionLevel = 'auto' | 'confirm' | 'explicit';

export interface ToolResult<T = unknown> {
  data: T;
  displayText?: string;
}

export interface ToolContext {
  agent?: unknown; // T2000 instance — typed loosely to avoid circular dep at type level
  mcpManager?: unknown; // McpClientManager — typed loosely to avoid circular dep
  walletAddress?: string; // User's Sui wallet address (required for MCP reads)
  suiRpcUrl?: string; // Sui JSON-RPC URL for direct chain queries
  serverPositions?: ServerPositionData; // Pre-fetched positions from the server (avoids stale MCP data)
  /** Fresh on-chain position reader — bypasses MCP caching. If provided, read tools prefer this. */
  positionFetcher?: (address: string) => Promise<ServerPositionData>;
  /** Environment variables passed to tools (e.g. API keys not in process.env) */
  env?: Record<string, string>;
  signal?: AbortSignal;
  /** Token symbol → USD price map for USD-aware permission resolution (B.4). */
  priceCache?: Map<string, number>;
  /** Per-user permission config for USD-threshold write tool gating (B.4). */
  permissionConfig?: import('./permission-rules.js').UserPermissionConfig;
  /**
   * [v1.4] Cumulative USD already auto-executed in the current session.
   * Used by `resolvePermissionTier` to enforce `autonomousDailyLimit` —
   * downgrades `auto` to `confirm` when adding the incoming tool's USD
   * value would exceed the limit. Optional; omitted = unbounded.
   */
  sessionSpendUsd?: number;
  /**
   * [v1.4 BlockVision] Server-only BlockVision Indexer API key. Threaded
   * through from the host (`audric/apps/web` reads
   * `process.env.BLOCKVISION_API_KEY`). Forwarded to
   * `fetchAddressPortfolio` / `fetchTokenPrices` in `blockvision-prices.ts`.
   * When undefined / empty the price feed degrades to Sui RPC + the
   * hardcoded stable allow-list — wallets still render but non-stable
   * USD values are reported as `null`.
   */
  blockvisionApiKey?: string;
  /**
   * [v1.4 BlockVision] Per-request memoization of the BlockVision portfolio
   * response. Keyed by Sui address. Multiple read tools (`balance_check`,
   * `portfolio_analysis`) inside the same chat turn re-hit the same address;
   * sharing this Map across them avoids a second 200–500ms BlockVision RTT.
   * The `blockvision-prices` module also has its own TTL cache, so this is
   * primarily a fast-path optimisation rather than a correctness primitive.
   */
  portfolioCache?: Map<string, import('./blockvision-prices.js').AddressPortfolio>;
  /**
   * [SPEC 8 v0.5.1 B3.2] Per-tool-invocation HTTP attempt counter. The
   * engine's tool dispatcher attaches a fresh `{ attemptCount: 1 }` to
   * the context before calling each tool; retry wrappers
   * (`fetchBlockVisionWithRetry` and equivalents) bump
   * `retryStats.attemptCount` on every retry beyond the first attempt;
   * the dispatcher reads the final value back and surfaces it on the
   * `tool_result` event (only when > 1). Tools that don't use a retry
   * wrapper never observe a non-default value.
   *
   * The mutable-ref shape is deliberate — it lets retry wrappers deep
   * in the call stack record state without changing every caller's
   * return type.
   */
  retryStats?: { attemptCount: number };
}

export interface ServerPositionData {
  savings: number;
  borrows: number;
  savingsRate: number;
  healthFactor: number | null;
  maxBorrow: number;
  pendingRewards: number;
  supplies: Array<{ asset: string; amount: number; amountUsd: number; apy: number; protocol: string }>;
  borrows_detail: Array<{ asset: string; amount: number; amountUsd: number; apy: number; protocol: string }>;
}

export interface ToolJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolFlags {
  mutating?: boolean;
  requiresBalance?: boolean;
  affectsHealth?: boolean;
  irreversible?: boolean;
  producesArtifact?: boolean;
  costAware?: boolean;
  maxRetries?: number;
  /**
   * [SPEC 7 v0.4 Layer 2] Opt-in: this write tool can participate in a
   * multi-write Payment Intent. When the LLM emits ≥2 `tool_use` blocks
   * in a single assistant turn AND every block resolves to a `confirm`-tier
   * write tool with `bundleable: true`, the engine collapses them into one
   * `pending_action` with `steps[]` instead of yielding N times. Default
   * `false` — silently opt-out. v1 set: `save_deposit`, `withdraw`,
   * `borrow`, `repay_debt`, `send_transfer`, `swap_execute`,
   * `claim_rewards`, `volo_stake`, `volo_unstake`.
   *
   * **Permanently non-bundleable:**
   *  - `pay_api` — recipient/amount/currency aren't known at LLM intent
   *    time (gateway 402 challenge resolves them at route time, after a
   *    network round-trip the engine has no knowledge of). Payment Intent
   *    cannot be composed at compose time.
   *  - `save_contact` — Postgres-only, no on-chain effect.
   */
  bundleable?: boolean;
}

export type PreflightResult =
  | { valid: true }
  | { valid: false; error: string };

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  jsonSchema: ToolJsonSchema;
  call(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
  isConcurrencySafe: boolean;
  isReadOnly: boolean;
  permissionLevel: PermissionLevel;
  flags: ToolFlags;
  preflight?: (input: unknown) => PreflightResult;
  /** Max chars for the serialized tool result. Truncated with a re-call hint when exceeded. */
  maxResultSizeChars?: number;
  /** Custom truncation strategy. Falls back to generic slice + hint when omitted. */
  summarizeOnTruncate?: (result: string, maxChars: number) => string;
  /**
   * [v1.5.1] Whether `microcompact` may dedupe this tool's results across
   * multiple calls with identical input. Default `true` — most tools are
   * effectively pure within a session (price lookups, protocol info,
   * yield pools). Set to `false` for tools whose result depends on
   * mutable on-chain state and therefore changes after writes
   * (`balance_check`, `savings_info`, `health_check`,
   * `transaction_history`). Non-cacheable tools are excluded from the
   * `seen` map entirely, so neither this call nor any later call with
   * the same input gets replaced with a "[Same result …]" back-reference.
   */
  cacheable?: boolean;
}

// ---------------------------------------------------------------------------
// Thinking configuration (Anthropic extended thinking / adaptive)
// ---------------------------------------------------------------------------

export type ThinkingEffort = 'low' | 'medium' | 'high' | 'max';

export type ThinkingConfig =
  | { type: 'disabled' }
  | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
  | { type: 'enabled'; budgetTokens: number; display?: 'summarized' | 'omitted' };

export interface OutputConfig {
  effort?: ThinkingEffort;
}

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export type SystemPrompt = string | SystemBlock[];

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

export interface EngineConfig {
  provider: LLMProvider;
  agent?: unknown; // T2000 instance
  mcpManager?: unknown; // McpClientManager for MCP-based reads
  walletAddress?: string; // User's Sui wallet address (required for MCP reads)
  suiRpcUrl?: string; // Sui JSON-RPC URL for direct chain queries (wallet coins, etc.)
  serverPositions?: ServerPositionData; // Pre-fetched positions from the host app
  /** Fresh on-chain position reader — called per tool invocation, bypasses MCP caching. */
  positionFetcher?: (address: string) => Promise<ServerPositionData>;
  tools?: Tool[];
  systemPrompt?: SystemPrompt;
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  /** Force tool usage on the first LLM turn (prevents text-only refusals). */
  toolChoice?: ToolChoice;
  thinking?: ThinkingConfig;
  outputConfig?: OutputConfig;
  /** Environment variables forwarded to tool context (API keys, URLs). */
  env?: Record<string, string>;
  costTracker?: {
    budgetLimitUsd?: number;
    inputCostPerToken?: number;
    outputCostPerToken?: number;
  };
  /** Guard runner configuration (RE-2.2). Omit to disable guards. */
  guards?: import('./guards.js').GuardConfig;
  /** Recipe registry for multi-step workflow guidance (RE-3.1). */
  recipes?: import('./recipes/index.js').RecipeRegistry;
  /** Context budget tracking configuration (RE-3.3). */
  contextBudget?: import('./context.js').ContextBudgetConfig;
  /** LLM-based summarizer for context compaction (RE-3.3). */
  contextSummarizer?: (messages: import('./types.js').Message[]) => Promise<string>;
  /** Token symbol → USD price map for USD-aware permission resolution (B.4). */
  priceCache?: Map<string, number>;
  /** Per-user permission config for USD-threshold write tool gating (B.4). */
  permissionConfig?: import('./permission-rules.js').UserPermissionConfig;
  /**
   * Saved contacts for the current user. Used by `guardAddressSource`
   * (a saved contact's address is considered a trusted source for
   * `send_transfer.to`) and by `permission-rules.resolvePermissionTier`
   * (sends to non-contact addresses always require confirmation,
   * regardless of amount). Hosts SHOULD also surface these in the
   * dynamic system prompt block so the LLM can resolve "send to <name>".
   */
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  /**
   * [v1.4] Cumulative USD already auto-executed in the current session.
   * Forwarded to `ToolContext` and consulted by `resolvePermissionTier` to
   * enforce `autonomousDailyLimit`.
   */
  sessionSpendUsd?: number;
  /**
   * [v1.4 BlockVision] Server-only BlockVision Indexer API key. Forwarded
   * verbatim into `ToolContext.blockvisionApiKey` for read tools that hit
   * `api.blockvision.org` (`balance_check`, `portfolio_analysis`,
   * `token_prices`). When omitted, those tools degrade gracefully to a
   * Sui-RPC + hardcoded-stable fallback — see `blockvision-prices.ts`.
   */
  blockvisionApiKey?: string;
  /**
   * [v1.4 BlockVision] Per-request portfolio cache shared across read
   * tools in the same chat turn. Forwarded into `ToolContext.portfolioCache`.
   */
  portfolioCache?: Map<string, import('./blockvision-prices.js').AddressPortfolio>;
  /**
   * [v1.4] Fired after a write tool successfully auto-executes (no
   * confirmation required). Hosts use this to persist cumulative spend in
   * Redis and (post-v1.4 BlockVision swap) invalidate cross-session caches
   * keyed by the user's wallet address. Errors are caught — the tool
   * result is never blocked by a failure here.
   *
   * The `walletAddress` field is populated from the engine's
   * `config.walletAddress`; it's absent only on unauthenticated engines
   * (which never auto-execute a real write).
   */
  onAutoExecuted?: (info: {
    toolName: string;
    usdValue: number;
    walletAddress?: string;
  }) => void | Promise<void>;
  /**
   * [v1.11 F2] Trust signal from the host: the system prompt already
   * embeds a fresh financial-context snapshot covering balance + HF as
   * of `balanceAt` (Unix ms). Pre-seeds the guard runner so the
   * "Balance has not been checked this session" / "Health factor has
   * not been checked this session" hints DON'T fire on the first turn.
   *
   * Pre-v1.11 the guards started cold every chat: the LLM saw the
   * `<financial_context>` block in the system prompt (with balances +
   * HF baked in) but the BalanceTracker still reported `hasEverRead()`
   * = false, so every first-turn write got pinged with a redundant
   * "call balance_check first" hint. Audric's UC1/UC2/UC3 P2.6 runs
   * showed the noise verbatim ("Balance not checked this session"
   * appeared on every first-turn permission card).
   *
   * Why a host-supplied seed (vs. engine sniffing the system prompt):
   * the engine doesn't own the prompt format. Audric builds
   * `<financial_context>` from `UserFinancialContext`; another host
   * may not (Audric CLI, server-signed automations). Having the host
   * pass an explicit seed keeps the engine prompt-agnostic.
   *
   * Stale snapshots (>30min old): still seed. The LLM can judge
   * whether to call `balance_check` for a fresh value based on the
   * snapshot timestamp surfaced inside the financial-context block;
   * the guard's job is to prevent unprompted writes against
   * unknown-state, NOT to enforce a freshness SLA.
   */
  financialContextSeed?: {
    /** Unix ms timestamp of the snapshot. Any non-zero value seeds `lastBalanceAt`. */
    balanceAt?: number;
    /**
     * Health factor at snapshot time. Pass `null` if the user has no
     * debt (HF undefined / Infinity in audric — render the snapshot
     * row as "no debt" and don't seed). Pass a number to skip the
     * "Health factor has not been checked this session" hint on
     * first-turn write.
     */
    healthFactor?: number | null;
  };
  /**
   * [v1.4 Item 4] Per-guard observation hook. Forwarded to `runGuards`
   * and fired once per non-`pass` verdict so hosts can record guard
   * behaviour in `TurnMetrics.guardsFired` without re-implementing the
   * verdict→action mapping. Errors thrown by the host are caught.
   */
  onGuardFired?: (guard: import('./guards.js').GuardMetric) => void;
  /**
   * [v1.5] Map of write tool name → list of read tool names whose state
   * the write invalidates. After a successful write resumes via
   * `resumeWithToolResult`, the engine auto-runs each configured read
   * tool with empty input, pushes synthetic `tool_use` + `tool_result`
   * messages into the conversation, and yields `tool_result` events
   * with `wasPostWriteRefresh: true` BEFORE handing control back to the
   * LLM for narration.
   *
   * Why: writes change on-chain state. Without a fresh read, the LLM
   * narrates from the pre-write snapshot and frequently invents balance
   * totals. Auto-injecting fresh reads makes the hallucination class
   * physically impossible — the model has authoritative ground truth in
   * its context before generating the post-write sentence.
   *
   * Constraints:
   *  - Refresh tools MUST be `isReadOnly` and `isConcurrencySafe`.
   *  - Refresh runs only when the write succeeded (executionResult is
   *    not `{ success: false }`); failed writes leave state unchanged
   *    and refreshing would be misleading.
   *  - Tools are invoked with empty input; refresh tools should accept
   *    an empty object schema (e.g. `balance_check`, `savings_info`).
   *  - Errors during refresh are non-fatal — a tool_result with
   *    `isError: true` is still pushed so the LLM knows refresh failed.
   *
   * Example:
   * ```
   * {
   *   save_deposit: ['balance_check', 'savings_info'],
   *   send_transfer: ['balance_check'],
   *   borrow: ['balance_check', 'savings_info', 'health_check'],
   * }
   * ```
   *
   * Omit (undefined / empty map) to disable post-write refresh entirely.
   */
  postWriteRefresh?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// LLM Provider interface (re-exported from providers/types for convenience)
// ---------------------------------------------------------------------------

export interface LLMProvider {
  chat(params: ChatParams): AsyncGenerator<ProviderEvent>;
}

export type ToolChoice = 'auto' | 'any' | { type: 'tool'; name: string };

export interface ChatParams {
  messages: Message[];
  systemPrompt: SystemPrompt;
  tools: ToolDefinition[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  toolChoice?: ToolChoice;
  thinking?: ThinkingConfig;
  outputConfig?: OutputConfig;
  signal?: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolJsonSchema;
}

export type ProviderEvent =
  | { type: 'thinking_delta'; text: string; blockIndex: number }
  | {
      type: 'thinking_done';
      blockIndex: number;
      thinking: string;
      signature: string;
      // [SPEC 8 v0.5.1] populated by the provider when a parseable
      // <eval_summary> marker was found in the thinking text.
      summaryMode?: boolean;
      evaluationItems?: import('./eval-summary.js').EvaluationItem[];
    }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; id: string; partialJson: string }
  | { type: 'tool_use_done'; id: string; name: string; input: unknown }
  | {
      type: 'message_start';
      messageId: string;
      model: string;
    }
  | {
      type: 'usage';
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }
  | { type: 'stop'; reason: StopReason };
