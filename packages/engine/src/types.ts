import type { ToolSet } from 'ai';

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
// Pending tool call — accumulated from provider events
// ---------------------------------------------------------------------------

export interface PendingToolCall {
  id: string;
  name: string;
  input: unknown;
}

// ---------------------------------------------------------------------------
// Engine events — RETIRED (S.391 — 2026-06-09)
// ---------------------------------------------------------------------------
//
// The `EngineEvent` union was the wire protocol the runnable
// `AISDKEngine.submitMessage()` loop yielded. The loop + its SSE/checkpoint/
// event-bridge transport were retired (the engine is now a harness LIBRARY,
// not a runnable agent — hosts consume AI SDK `streamText` / `UIMessage`
// chunks directly via the composition primitives). The union had zero live
// consumers and was not part of the public export surface, so it was
// deleted whole. See `SPEC_AUDRIC_CODEBASE_AUDIT.md` §1.2A + §3.
//
// The data shapes the union referenced — `PendingAction`, `StopReason`,
// `HarnessShape`, `EvaluationItem` — live on independently (tools/guards/
// host helpers still use them).

/**
 * [SPEC 8 v0.5.1 B3.2] Adaptive harness shape — driven by `classifyEffort()`,
 * pinned per-turn at turn start. Each shape implies a different
 * `thinking.budget_tokens` cap and soft block limit. See SPEC 8
 * § "Adaptive thresholds: harness shape gate" for the canonical mapping.
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
  /**
   * [D-6.1 / SPEC_SLICE_D_DRAFT.md §7 — 2026-05-18] Forward-compat
   * alias for `attemptId`. Engine stamps `approvalId === attemptId`
   * verbatim at emit time so hosts can read either field
   * interchangeably. Exists to ease a future v0.7c migration if/when
   * Audric (or any host) adopts AI SDK v6's `approvalId` terminology
   * for HITL parts.
   *
   * Optional today because the field is additive; existing hosts that
   * read `attemptId` continue to work unchanged. New code SHOULD read
   * `approvalId` to align with AI SDK conventions, but reading
   * `attemptId` remains supported indefinitely (the two fields are
   * identical by construction at every emission site).
   */
  approvalId?: string;
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
   * returns a coin handle (`withdraw`, `borrow`, `swap_execute`);
   * the consumer at this index MUST be a tool that accepts an input
   * coin (`save_deposit`, `repay_debt`, `send_transfer`, `swap_execute`).
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
  /**
   * [SPEC 20.2 / D-1 (a)] Per-step Cetus route — populated for `swap_execute`
   * steps when a same-turn `swap_quote` matched the step's input. See
   * `PendingAction.cetusRoute` for the full contract.
   */
  cetusRoute?: import('@t2000/sdk').SerializedCetusRoute;
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
   * `apps/web-v2/app/api/chat/route.ts` `updateMany` clause (post-v0.7e
   * Phase 5: resume is inline in /api/chat; the standalone /api/engine/
   * resume route was archived with apps/web).
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
   * [D-6.1 / SPEC_SLICE_D_DRAFT.md §7 — 2026-05-18] Forward-compat
   * alias for `attemptId`. Engine stamps `approvalId === attemptId`
   * verbatim at emit time so hosts can read either field
   * interchangeably. Exists to ease a future v0.7c migration if/when
   * Audric (or any host) adopts AI SDK v6's `approvalId` terminology
   * for HITL parts.
   *
   * **Bundles:** when `steps !== undefined`, the top-level `approvalId`
   * mirrors `steps[0].approvalId` (which itself mirrors
   * `steps[0].attemptId`) — same invariant as `attemptId`'s bundle
   * mirroring rule above.
   *
   * Optional today because the field is additive; existing hosts that
   * read `attemptId` continue to work unchanged. New code SHOULD read
   * `approvalId` to align with AI SDK conventions, but reading
   * `attemptId` remains supported indefinitely (the two fields are
   * identical by construction at every emission site — see Slice D
   * scoping doc for the impedance analysis explaining why we keep
   * BOTH rather than migrating to AI SDK's HITL primitive wholesale).
   */
  approvalId?: string;
  /**
   * [SPEC 20.2 / D-1 (a)] Cetus route captured at `swap_quote` time and
   * threaded through to the prepare-route to skip the ~400-500ms
   * `findSwapRoute()` re-discovery call. Only populated when the same-turn
   * read pipeline included a successful `swap_quote` whose input matches
   * this `pending_action`'s amount/from/to (the engine matches at emission
   * time). Audric's prepare-route validates freshness + coin-type match
   * before using as fast-path; falls back to fresh discovery on any
   * mismatch (D-2 structural verification + D-3 TTL re-validation).
   *
   * Also rendered into the post-write resume system prompt as a
   * `<canonical_route>` block (D-4) so LLM narration grounds against the
   * canonical route — closes S19-F2 (LLM cites stale swap routes).
   *
   * **Bundles:** when present on a `steps[]` entry, the per-step
   * `cetusRoute` takes precedence over the top-level field (which mirrors
   * `steps[0].cetusRoute` for backward compat with pre-bundle hosts).
   */
  cetusRoute?: import('@t2000/sdk').SerializedCetusRoute;
  /**
   * [SPEC 7 v0.4 Layer 2] When set, this `pending_action` represents a
   * multi-write Payment Intent. Single-step bundles are NOT created — the
   * engine emits the legacy single-write shape when N=1. Hosts that haven't
   * been updated read `toolName`/`toolUseId`/`input` (which mirror
   * `steps[0]`); newer hosts iterate `steps`.
   *
   * Bundleable tools (post-S.323): `save_deposit`, `withdraw`, `borrow`,
   * `repay_debt`, `send_transfer`, `swap_execute`, `claim_rewards`.
   * (`volo_stake` / `volo_unstake` were bundleable in v1; engine surface
   * cut in S.277 and full SDK/CLI/MCP removal in S.323.)
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
  /**
   * [SPEC 37 v0.7a Week 4 cleanup — Day 14a / 2026-05-16] Live borrow APY
   * in BASIS POINTS (e.g. `467` = 4.67%) for the asset being borrowed or
   * repaid. Stamped at `pending_action` emit time from the NAVI rates
   * cache (5-min TTL); fetches fresh on cache miss.
   *
   * **Basis-points integer (not decimal fraction)** — matches audric's
   * `APYBlock` primitive `apyBps` prop so V2 components consume the
   * field without conversion.
   *
   * **Populated for:** `borrow`, `repay_debt`.
   * **Undefined when:** NAVI MCP unavailable, asset not present in the
   * rates payload, or tool is not borrow/repay.
   *
   * **Audric V2 contract.** `BorrowPreviewBody` / `RepayPreviewBody`
   * detect this field and render the canonical `APYBlock` primitive
   * instead of the italic "Variable rate — locked at execute time"
   * disclaimer. Falling back to the disclaimer when undefined preserves
   * the existing honest-degradation behaviour.
   *
   * **v2-only (Week 6).** Legacy `QueryEngine` never sets this field;
   * the legacy path is being deleted at Week 6 anyway. Audric's V2
   * components treat the field as opt-in (undefined → render disclaimer).
   */
  borrowApyBps?: number;
  /**
   * [SPEC 37 v0.7a Week 4 cleanup — Day 14a / 2026-05-16, extended
   * Day 14c / 2026-05-16] Current health factor BEFORE the pending
   * write executes. Stamped at `pending_action` emit time from the
   * NAVI health-factor cache (30s TTL); fetches fresh on cache miss.
   *
   * **Populated for:** writes that change HF — `borrow`, `withdraw`,
   * `save_deposit`, `repay_debt`. (Send / swap / pay don't touch HF.)
   *
   * **HF semantics (Day 14c):**
   *   - `number` — finite HF (real debt exists)
   *   - `null` — deliberate ∞ sentinel (no debt = infinitely safe).
   *     Pre-14c the engine omitted the field for the ∞ case, which
   *     made it impossible to distinguish "∞ before borrow" (we want
   *     to show "∞ → 4.5") from "no data" (we hide the row). 14c
   *     splits those by sending `null` for ∞ vs `undefined` for
   *     missing data.
   *   - `undefined` — NAVI MCP unavailable / fetch failed.
   *
   * **Audric V2 contract.** With `projectedHF` shipped (Day 14c)
   * audric renders both as "current → projected" in HFRow / HFGauge.
   * The engine owns the projection formula so audric stays a thin
   * adapter.
   *
   * **v2-only (Week 6).** Same rationale as `borrowApyBps`.
   */
  currentHF?: number | null;
  /**
   * [SPEC 37 v0.7a Week 4 cleanup — Day 14c / 2026-05-16] Projected
   * health factor AFTER the pending write executes. Computed by the
   * engine's `enrichPendingActionWithLiveData` helper using the live
   * `supplied` / `borrowed` / `liquidationThreshold` from the
   * health-factor cache + the write's input amount.
   *
   * **Populated for:** same 4 tools as `currentHF` — `borrow`,
   * `withdraw`, `save_deposit`, `repay_debt`.
   *
   * Same `number | null | undefined` semantics as `currentHF`.
   *
   * **HF formula:**  HF = (supplied × liquidationThreshold) / borrowed.
   * After the action's deltas are applied to supplied / borrowed.
   * Both currently-saveable assets (USDC + USDsui) are stables so the
   * input amount is treated as USD 1:1; non-stable saveable assets
   * (none today) would need a USD price conversion in the projection.
   *
   * **v2-only (Week 6).** Same rationale as `borrowApyBps`.
   */
  projectedHF?: number | null;
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

/**
 * Strongly-typed env contract for engine tools (S.269 item 3 — 2026-05-23).
 *
 * Pre-S.269 this was `Record<string, string>` — any string key, no
 * autocomplete, no typo protection. A typo or missing key from a host
 * silently degraded the tool to its fallback path (e.g. audric/web-v2
 * shipped a payment-link bug for weeks because `AUDRIC_INTERNAL_KEY`
 * wasn't threaded through `ToolContext.env` — the engine read
 * `context.env?.AUDRIC_INTERNAL_KEY` and got `undefined` silently).
 *
 * Every key here MUST stay optional — the type protects against typos,
 * not absence. CLI / MCP hosts threading no env at all stay valid;
 * audric/web-v2 threads all three. Tools that depend on a key still
 * gate on `if (!context.env?.X) return null` and degrade gracefully
 * (or surface a `displayText` explaining the degradation).
 *
 * **Adding a new key:** add the field here with a doc comment, then
 * thread it from every host that needs it. The TS compiler enforces
 * the threading at the host side (assignment to `ToolContext.env`
 * fails if you misspell the key).
 */
export interface ToolContextEnv {
  /** Audric internal API base URL (e.g. `https://audric.ai`).
   *  Read by `receive.ts`, `portfolio-analysis.ts`, `yield-summary.ts`,
   *  `spending.ts`, `activity-summary.ts`, `audric-api.ts`. Hosts:
   *  audric/web-v2 (required for the engine's audric-backed read +
   *  payment-link tools to function). */
  AUDRIC_INTERNAL_API_URL?: string;
  /** Audric internal-API shared key for `x-internal-key` header
   *  authentication. Read by every audric-backed tool above.
   *  Hosts: audric/web-v2 (required; pairs with the URL). */
  AUDRIC_INTERNAL_KEY?: string;
  // [S.391 — 2026-06-09] `BRAVE_API_KEY` removed — it backed the
  // `web_search` tool cut in S.277 (engine 2.18.0). Audric dropped its
  // value-side wiring (env schema + ToolContextEnv spread) in S.277; this
  // removes the now-dead field from the engine type.
  /** MPP gateway base URL — backs `mpp_services` (catalog fetch) and
   *  `mpp_call` (paid endpoint calls). Read by `tools/mpp.ts`. Hosts:
   *  audric/web-v2 (optional; absent → defaults to `https://mpp.t2000.ai`). */
  MPP_GATEWAY_URL?: string;
}

export interface ToolContext {
  agent?: unknown; // T2000 instance — typed loosely to avoid circular dep at type level
  mcpManager?: unknown; // McpClientManager — typed loosely to avoid circular dep
  walletAddress?: string; // User's Sui wallet address (required for MCP reads)
  suiRpcUrl?: string; // Sui JSON-RPC URL for direct chain queries
  serverPositions?: ServerPositionData; // Pre-fetched positions from the server (avoids stale MCP data)
  /** Fresh on-chain position reader — bypasses MCP caching. If provided, read tools prefer this. */
  positionFetcher?: (address: string) => Promise<ServerPositionData>;
  /** Environment variables passed to tools (e.g. API keys not in process.env). See `ToolContextEnv` for the typed key contract. */
  env?: ToolContextEnv;
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
  /**
   * [SPEC_PHASE_7_DRAFT.md / engine v2.7.0] Per-turn memory recall cache.
   * Populated ONCE per turn by the `prepareStep` hook in `v2/engine.ts`
   * at `stepNumber === 0` when `EngineConfig.memoryStore` is configured.
   * Subsequent steps in the same `streamText` call (under multi-step
   * `stopWhen: stepCountIs(maxTurns)`) read from this cache rather than
   * re-recalling — MemWal single-recall p95 is 470-675ms; caching avoids
   * the N × 700ms amplification across multi-tool turns.
   *
   * Mutable ref shape (matches `retryStats` pattern) so the prepareStep
   * hook can populate without rebuilding the entire context.
   *
   * `query` is preserved for debug / telemetry (which user message
   * triggered this recall) and as an idempotency key — if the same query
   * is encountered later in the same turn (rare; would require explicit
   * re-recall logic) it can short-circuit without re-fetching.
   *
   * `null` (not undefined) when `memoryStore` is set but recall hasn't
   * fired yet OR when recall failed and degraded to empty results — the
   * cache slot exists but holds no records. Distinguishes "memory not
   * configured" (undefined) from "memory configured, results empty"
   * (null with `results: []`).
   *
   * Tools consuming this directly (rare today; future skill recipes may
   * inspect it for cross-step continuity) should treat it as read-only.
   */
  memoryCache?: { query: string; results: import('./memory/store.js').MemoryRecord[] } | null;
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
  maxRetries?: number;
  /**
   * [SPEC 7 v0.4 Layer 2] Opt-in: this write tool can participate in a
   * multi-write Payment Intent. When the LLM emits ≥2 `tool_use` blocks
   * in a single assistant turn AND every block resolves to a `confirm`-tier
   * write tool with `bundleable: true`, the engine collapses them into one
   * `pending_action` with `steps[]` instead of yielding N times. Default
   * `false` — silently opt-out. Post-S.323 set: `save_deposit`,
   * `withdraw`, `borrow`, `repay_debt`, `send_transfer`, `swap_execute`,
   * `claim_rewards` (volo_stake / volo_unstake cut from engine in S.277;
   * full SDK/CLI/MCP removal in S.323).
   *
   * **Permanently non-bundleable:** (none today; `save_contact` was
   *  the historical exception, deleted in S.269 item 6 — 2026-05-23.)
   */
  bundleable?: boolean;
}

export type PreflightResult =
  | { valid: true }
  | { valid: false; error: string };

// [P4.1 / v3.0.0 / 2026-05-25] The legacy `Tool` interface (with `.call()`
// + `.name` + `.permissionLevel`) was removed. Every engine tool is now
// a native AI SDK `tool({...})` shaped object. Per-tool metadata that
// used to live here lives in central registries:
//   - permissionLevel / isReadOnly / isConcurrencySafe / cacheable /
//     maxResultSizeChars → `v2/tool-policy.ts` (`TOOL_POLICY`)
//   - flags                                                  → `tool-flags.ts` (`TOOL_FLAGS`)
//   - preflight                                              → attached on the AI SDK
//     execute function as `__t2000_preflight` via `wrapEngineExecute`
// Hosts that need a tool type import `Tool` / `ToolSet` from `'ai'`.

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
  agent?: unknown; // T2000 instance
  mcpManager?: unknown; // McpClientManager for MCP-based reads
  walletAddress?: string; // User's Sui wallet address (required for MCP reads)
  suiRpcUrl?: string; // Sui JSON-RPC URL for direct chain queries (wallet coins, etc.)
  serverPositions?: ServerPositionData; // Pre-fetched positions from the host app
  /** Fresh on-chain position reader — called per tool invocation, bypasses MCP caching. */
  positionFetcher?: (address: string) => Promise<ServerPositionData>;
  /**
   * Tools the engine dispatches. Accepts an AI SDK `ToolSet`
   * (`Record<string, AISDKTool>`) directly — no wrapping or conversion.
   *
   * [P4.1 Phase C — 2026-05-25] Pre-Phase-C this was a legacy `Tool[]`
   * the engine fed through `toAISDKTools`/`wrapLegacyTool`. After every
   * in-tree tool migrated to native AI SDK shape, the conversion layer
   * dropped out and this type became `ToolSet` directly.
   */
  tools?: ToolSet;
  systemPrompt?: SystemPrompt;
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  /** Force tool usage on the first LLM turn (prevents text-only refusals). */
  toolChoice?: ToolChoice;
  thinking?: ThinkingConfig;
  outputConfig?: OutputConfig;
  /** Environment variables forwarded to tool context (API keys, URLs). See `ToolContextEnv` for the typed key contract. */
  env?: ToolContextEnv;
  costTracker?: {
    budgetLimitUsd?: number;
    inputCostPerToken?: number;
    outputCostPerToken?: number;
  };
  /** Guard runner configuration (RE-2.2). Omit to disable guards. */
  guards?: import('./guards.js').GuardConfig;
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
  // [S.391 — 2026-06-09] `streamCheckpointStore`, `resumeStreamId`, and
  // `onStreamResume` REMOVED with the runnable engine-loop retirement. They
  // configured the `EngineEvent`-based live-stream checkpoint/replay that
  // only `AISDKEngine.submitMessage` drove. No host wired them — audric
  // resumes via the Redis-backed `resumable-stream` package over AI SDK
  // `UIMessage` chunks (the engine checkpoint path was the deferred LOCK-4
  // that never shipped). See `SPEC_AUDRIC_CODEBASE_AUDIT.md` §3.
  /**
   * [SPEC_PHASE_7_DRAFT.md / engine v2.7.0] Pluggable memory backend.
   * When set, the engine wires `prepareStep` (currently otherwise unused
   * in v2) to perform ONE memory recall per turn at `stepNumber === 0`
   * and inject the top-K records as a `<memory_recall>` block at layer 2
   * of the F-4 4-layer system-prompt assembly:
   *
   *   1. base `systemPrompt`
   *   2. `<memory_recall>` block (from `memoryStore.recall()` results)
   *   3. skill recipe block (from `skillRecipeBlock` below)
   *   4. user message (from `messages[]`)
   *
   * The recall result is cached in `ToolContext.memoryCache` for the
   * duration of the turn — subsequent steps in the same `streamText`
   * call (under `stopWhen: stepCountIs(maxTurns)`) read the cache; no
   * re-recall fires until the next `submitMessage()`.
   *
   * **Latency.** MemWal single-recall p95 is 470-675ms; session-cached
   * recalls hit in <5ms. The engine NEVER blocks the response stream on
   * `memoryStore.remember()` — that's host-triggered after turn end.
   *
   * **Degradation.** If `recall()` throws, the engine logs a `console.warn`
   * and continues with an empty `<memory_recall>` block — a memory infra
   * outage NEVER prevents a turn from completing.
   *
   * **When undefined** the engine falls back to the legacy static system
   * prompt assembly (pre-v2.7.0 behavior, `system: this.systemPromptString()`
   * passed to `streamText` once at turn start, no `prepareStep` hook).
   *
   * Production wiring: audric injects `MemWalMemoryStore` here once
   * MemWal stabilizes (post-2026-05-29 checkpoint per BENEFITS_SPEC §1810).
   * Testing: engine ships `InMemoryMemoryStore` for unit + integration
   * tests; CLI / MCP / examples leave it undefined.
   */
  memoryStore?: import('./memory/store.js').MemoryStore;
  /**
   * [SPEC_PHASE_7_DRAFT.md / engine v2.7.0] Pre-built skill recipe block
   * — typically the output of `McpPromptAdapter.buildPrepareStepSystemPrefix()`
   * (see `mcp/prompt-adapter.ts`). Engine inserts this at layer 3 of the
   * F-4 order via `prepareStep` when `memoryStore` is set.
   *
   * **Only consumed when `memoryStore` is set** — without `memoryStore`
   * the engine takes the legacy static-system-prompt path.
   *
   * Optional — when undefined, layer 3 is empty.
   */
  skillRecipeBlock?: string;
}

// ---------------------------------------------------------------------------
// Tool choice
// ---------------------------------------------------------------------------
//
// [v3.1.0 — 2026-05-25] Pre-3.1.0 this section also exported `LLMProvider`,
// `ChatParams`, and `ToolDefinition` — the legacy provider abstraction.
// All three were dead code by the time v3.0.0 shipped (v2 engine wraps
// AI SDK's `streamText` directly; no `LLMProvider.chat()` call survived
// the v2 cutover).
//
// [S.391 — 2026-06-09] `ProviderEvent` REMOVED with the runnable engine-loop
// retirement. Its only consumer was the deleted engine's
// `handleProviderEvent`; the engine no longer translates a raw provider
// event stream into `EngineEvent`s (AI SDK's `streamText` is consumed
// directly by hosts via the harness-library primitives). See
// `SPEC_AUDRIC_CODEBASE_AUDIT.md` §1.2A.

export type ToolChoice = 'auto' | 'any' | { type: 'tool'; name: string };
