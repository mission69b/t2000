// ---------------------------------------------------------------------------
// v2/engine.ts — AISDKEngine: thin wrapper around Vercel AI SDK streamText
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2-4 (consolidated rewrite, 2026-05-15).
//
// This is the v0.7a end-state engine. Replaces the legacy `QueryEngine`
// (~21,800 LoC of custom orchestration) with a thin wrapper around AI
// SDK v6's `streamText` + native `tool()` factory. Engine-specific
// concerns (USD permissions, 14 guards, postWriteRefresh, financial
// context, recipes) compose around AI SDK primitives:
//
//   - Tool dispatch       → streamText (native)
//   - Parallel reads      → streamText (native)
//   - Confirm-tier writes → tool's needsApproval callback (HITL)
//   - 14 domain guards    → prepareStep callback
//   - postWriteRefresh    → onStepFinish callback
//   - Per-request context → experimental_context (typed cast on read)
//   - Cost tracking       → step.usage on every step
//   - Provider abstraction → @ai-sdk/anthropic directly (no LLMProvider)
//   - SSE serialisation   → createUIMessageStream when audric is ready;
//                           legacy EngineEvent shim during transition
//
// Day 1 scope (this file)
// -----------------------
// Scaffolding only:
//   - Class skeleton with the same constructor + submitMessage shape as
//     legacy QueryEngine (so audric's engine-factory.ts swaps with one
//     line: `new QueryEngine(...)` → `new AISDKEngine(...)`).
//   - Working streamText call wired to @ai-sdk/anthropic.
//   - experimental_context plumbing for ToolContext.
//   - prepareStep + onStepFinish hooks STUBBED (return empty / no-op)
//     — Day 2-3 fills them with the guard pipeline + post-write refresh.
//   - One smoke test that runs a single read-tool turn end-to-end.
//
// What this file does NOT do yet:
//   - Tool migration (all 35 tools still use legacy buildTool — Day 4-9
//     migrates them to the AI SDK tool() shape with wrappers).
//   - Guard pipeline composition (Day 2 work).
//   - USD-aware needsApproval wiring (Day 3 work).
//   - postWriteRefresh injection (Day 3 work).
//   - Audric stream consumer compatibility shim (Day 10-12 work).
//
// Behind the USE_AI_SDK_NATIVE_ENGINE feature flag — audric chooses at
// engine factory time which class to instantiate. Legacy QueryEngine
// stays exported and unchanged so production traffic is untouched
// during the rewrite.
// ---------------------------------------------------------------------------

import { createAnthropic } from '@ai-sdk/anthropic';
import {
  streamText,
  stepCountIs,
  type ToolSet,
  type StopCondition,
} from 'ai';
import type {
  ContentBlock,
  EngineEvent,
  EngineConfig,
  HarnessShape,
  Message,
  PendingAction,
  PermissionResponse,
  Tool as LegacyTool,
  ToolContext,
} from '../types.js';
import { toAISDKTools } from './tool-wrapper.js';
import { buildToolContext } from './tool-context.js';
import { enrichPendingActionWithLiveData } from './enrich-pending-action.js';
import type { InternalContext } from './internal-context.js';
import { translate, createBridgeState } from '../bridge/event-bridge.js';
import { buildStepFinishHandler, type StepFinishMutableState } from './step-finish.js';
import { createGuardRunnerState, type GuardRunnerState } from '../guards.js';
import { findTool } from '../tool.js';
import { CostTracker, type CostSnapshot } from '../cost.js';
import { describeAction } from '../describe-action.js';
import { getModifiableFields } from '../tools/tool-modifiable-fields.js';
import { toAISDKMessages } from '../providers/ai-sdk-message-conversion.js';
import { getToolPolicy } from './tool-policy.js';

// ---------------------------------------------------------------------------
// AISDKEngine config — subset of legacy EngineConfig that's still needed
// ---------------------------------------------------------------------------
//
// Fields removed vs legacy EngineConfig:
//   - `provider`: hardcoded to @ai-sdk/anthropic (single-provider for now;
//     multi-provider via LLMProvider abstraction is replaced by AI SDK's
//     own provider plug-in pattern when needed).
//
// Fields kept verbatim from legacy EngineConfig:
//   - `mcpManager`: kept (Day 13 fix). The long-term plan is to register
//     MCP tools via AI SDK's native `createMCPClient` so they live in
//     the same `tools` object, but until each tool is migrated
//     (rates_info, savings_info, health_check, etc., all consume
//     `context.mcpManager.callTool()`), the manager has to be threaded
//     through `ToolContext`. Removing it broke ~5 NAVI-MCP tools in
//     the local smoke (`rates_info: NAVI lending data is currently
//     unavailable`). Drop-in compatibility > clean architecture for
//     this soak window.
//   - All the engine-specific config (guards, recipes, permissionConfig,
//     priceCache, contacts, postWriteRefresh, onAutoExecuted, etc.)
// ---------------------------------------------------------------------------
export interface AISDKEngineConfig extends Omit<EngineConfig, 'provider'> {
  /**
   * Anthropic API key. Direct dependency on @ai-sdk/anthropic; no
   * provider abstraction layer.
   */
  anthropicApiKey: string;
}

// ---------------------------------------------------------------------------
// AISDKEngine class
// ---------------------------------------------------------------------------
export class AISDKEngine {
  private readonly config: AISDKEngineConfig;
  private readonly anthropic: ReturnType<typeof createAnthropic>;
  private messages: Message[] = [];
  private abortController: AbortController | null = null;

  // Day 3: per-session guard state + sessionSpend mirror. Both live as
  // long as the engine instance — survive across `submitMessage` calls
  // so trackers (balance freshness, retry counts) keep accumulating.
  private readonly guardState: GuardRunnerState;
  private readonly stepFinishMutable: StepFinishMutableState;

  // Day 10-12 (SPEC 37 v0.7a Phase 2 cutover-prep): cumulative usage
  // across every submitMessage call on this engine instance. Audric's
  // chat / resume / resume-with-input / regenerate routes all read
  // `engine.getUsage()` at turn close to bill the user + write
  // SessionUsage rows. Mirrors legacy QueryEngine's CostTracker so
  // both engines honour the same `getUsage()` contract.
  //
  // Pricing defaults to the Sonnet rates baked into CostTracker; the
  // chat route already overrides per-model pricing via `costRatesForModel`
  // when computing TurnMetrics.estimatedCostUsd, so the snapshot's
  // estimatedCostUsd is treated as a fallback only. Token counts (the
  // load-bearing field for billing) are model-agnostic and accurate.
  private readonly costTracker: CostTracker;

  constructor(config: AISDKEngineConfig) {
    this.config = config;
    this.anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
    this.guardState = createGuardRunnerState();
    this.stepFinishMutable = {
      sessionSpendUsdLocal: config.sessionSpendUsd ?? 0,
    };
    this.costTracker = new CostTracker(config.costTracker);
  }

  /**
   * Load conversation history. Same signature as legacy
   * QueryEngine.loadMessages() so audric's session-store rehydrate
   * path is unchanged.
   */
  loadMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  /**
   * Get current conversation history. Audric reads this to persist
   * session state.
   */
  getMessages(): readonly Message[] {
    return this.messages;
  }

  /**
   * Cancel the current turn. Forwards to streamText's abortSignal.
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Read-only access to the engine's tool registry. Mirrors
   * `QueryEngine.getTools()` — audric's fast-path bundle composer
   * (`tryConsumeFastPathBundle`) calls this so it can rebuild a
   * `pending_action` payload with `modifiableFields` / `canRegenerate`
   * without re-importing the tool list.
   *
   * SPEC 37 v0.7a Phase 2 Day 10-12 — drop-in compatibility shim.
   */
  getTools(): readonly LegacyTool[] {
    return this.config.tools ?? [];
  }

  /**
   * Snapshot of cumulative usage across every `submitMessage` call.
   * Mirrors `QueryEngine.getUsage()`. Audric's chat / resume /
   * resume-with-input / regenerate routes all read this at turn close
   * to bill the user.
   *
   * Token counts are sourced from the bridge's `usage` event (which
   * normalises AI SDK v6's nested `inputTokenDetails` /
   * `outputTokenDetails` shape into the flat legacy contract). The
   * route already overrides `estimatedCostUsd` via per-model
   * `costRatesForModel`, so the snapshot's estimate is a
   * Sonnet-default fallback — token totals are the load-bearing field.
   *
   * SPEC 37 v0.7a Phase 2 Day 10-12 — drop-in compatibility shim.
   */
  getUsage(): CostSnapshot {
    return this.costTracker.getSnapshot();
  }

  /**
   * Run a registered read-only tool out-of-band, bypassing the LLM.
   * Mirrors `QueryEngine.invokeReadTool()`. Audric's chat route uses
   * this for intent-driven pre-dispatch — when the user asks "what's
   * my balance?" the route deterministically runs `balance_check`
   * before the LLM round-trip and stamps the result into history so
   * the LLM cites real numbers.
   *
   * Throws when the tool isn't registered, isn't read-only, or fails
   * input validation. Tool execution errors are returned as
   * `{ data, isError: true }` for the caller to handle (typically:
   * skip the synthetic-prefetch injection so the LLM falls back to
   * its normal flow).
   *
   * v0.7a end-state simplifications vs legacy QueryEngine:
   *   - No intra-turn TurnReadCache. AI SDK doesn't share a turn
   *     concept with the legacy engine; in-turn dedup will land via
   *     a v2-native cache layer (Day 25-28 cleanup).
   *   - No MCP tool dispatch path. v2 MCP support routes through AI
   *     SDK's native `createMCPClient`, not the legacy McpClientManager.
   *   - Builds `ToolContext` via the same `buildToolContext` helper
   *     that backs in-stream tool execution, so an out-of-band call
   *     sees the same priceCache / blockvisionApiKey / portfolioCache
   *     as the LLM-driven path.
   *
   * SPEC 37 v0.7a Phase 2 Day 10-12 — drop-in compatibility shim.
   */
  async invokeReadTool(
    toolName: string,
    input: unknown,
    options: { signal?: AbortSignal } = {},
  ): Promise<{ data: unknown; isError: boolean }> {
    const tool = findTool(this.config.tools ?? [], toolName);
    if (!tool) {
      throw new Error(`invokeReadTool: tool not found: ${toolName}`);
    }
    if (!tool.isReadOnly) {
      throw new Error(
        `invokeReadTool: tool is not read-only: ${toolName} (write tools must go through the permission gate)`,
      );
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(
        `invokeReadTool: invalid input for ${toolName}: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const signal = options.signal ?? new AbortController().signal;
    const context: ToolContext = buildToolContext(this.config, { signal });

    try {
      const result = await tool.call(parsed.data, context);
      return { data: result.data, isError: false };
    } catch (err) {
      return {
        data: { error: err instanceof Error ? err.message : 'Tool execution failed' },
        isError: true,
      };
    }
  }

  /**
   * Submit a user message and stream the resulting EngineEvent sequence.
   * Same signature as legacy QueryEngine.submitMessage().
   *
   * Day 1 implementation: minimal — just streamText round-trip with
   * legacy tools wrapped via toAISDKTools(). Translates AI SDK
   * TextStreamPart events to legacy EngineEvent so audric's stream
   * consumer is unchanged.
   *
   * Day 2-3 will add: prepareStep guard pipeline, needsApproval USD
   * wrapper, onStepFinish post-write-refresh.
   */
  async *submitMessage(
    prompt: string,
    options?: {
      harnessShape?: HarnessShape;
      harnessRationale?: string;
    },
  ): AsyncGenerator<EngineEvent> {
    // Push user message into history first (matches legacy semantics
    // — failures during streamText still leave the user message in
    // history so the next turn sees it).
    this.messages.push({
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    });

    // Emit harness_shape upfront if provided — same as legacy.
    if (options?.harnessShape) {
      yield {
        type: 'harness_shape',
        shape: options.harnessShape,
        rationale: options.harnessRationale ?? options.harnessShape,
      };
    }

    this.abortController = new AbortController();

    // Day 2: wrap legacy tools into AI SDK ToolSet via the bridge.
    // Day 3: build InternalContext (ToolContext + engine-internal state)
    // and thread it through experimental_context. The wrapper extracts
    // .toolContext for legacy.call; needsApproval extracts .toolContext
    // + .contacts; onStepFinish reads .guardState + .config.
    const tools = toAISDKTools(this.config.tools ?? []) as ToolSet;
    const toolContext = buildToolContext(this.config, {
      signal: this.abortController.signal,
    });
    // Mirror the local sessionSpend back into ToolContext so the next
    // needsApproval call sees the running total without a host round-trip.
    toolContext.sessionSpendUsd = this.stepFinishMutable.sessionSpendUsdLocal;

    const internal: InternalContext = {
      toolContext,
      guardState: this.guardState,
      guardConfig: this.config.guards,
      contacts: this.config.contacts ?? [],
      walletAddress: this.config.walletAddress,
      config: {
        onAutoExecuted: this.config.onAutoExecuted,
        onGuardFired: this.config.onGuardFired,
        postWriteRefresh: this.config.postWriteRefresh,
        permissionConfig: this.config.permissionConfig,
        priceCache: this.config.priceCache,
      },
      getMessages: () => this.messages,
    };

    const onStepFinish = buildStepFinishHandler(
      this.config.tools ?? [],
      internal,
      this.stepFinishMutable,
    );

    yield* this.runStream(tools, internal, onStepFinish);
  }

  /**
   * Resume a paused turn after the host (audric) executed the approved
   * write tool out-of-band (sponsored-tx prepare/execute path) or the
   * user declined.
   *
   * Mirrors `QueryEngine.resumeWithToolResult()` so audric's resume
   * route call site is unchanged.
   *
   * Flow:
   *   1. Reconstruct the deferred turn into history:
   *      - Push the assistant message that was held back during
   *        pending_action emission (`action.assistantContent`).
   *      - Push a user message containing `action.completedResults`
   *        (any read tool results from the same step) PLUS the new
   *        `tool_result` block carrying the host's executionResult
   *        (or "user declined" error).
   *   2. Yield a `tool_result` event so audric's UI can render the
   *      per-step outcome row in the PermissionCard.
   *   3. If declined → yield `turn_complete` and return (no narration).
   *   4. If approved → re-invoke streamText to narrate the receipt.
   *      The post-write refresh tool_results land via onStepFinish
   *      injection (when configured), so narration cites fresh
   *      authoritative numbers instead of pre-write balances.
   *
   * SPEC 37 v0.7a Phase 2 Day 13 follow-up — added to fix the
   * confirm-tier write blocker caught in production smoke. The audric
   * `/api/engine/resume` route calls `engine.resumeWithToolResult(...)`
   * unconditionally; without this method AISDKEngine instances crash
   * with "engine.resumeWithToolResult is not a function" on every
   * confirm flow.
   *
   * Bundle support (action.steps !== undefined) is deferred to
   * Day 14+ — first-cut handles single-write only, which covers the
   * 95% case. Bundle resume returns an error-yielding generator until
   * implemented (audric falls back to legacy QueryEngine for bundle
   * sessions until then; the wallet-allowlist gate makes this a
   * non-issue for soak).
   */
  async *resumeWithToolResult(
    action: PendingAction,
    response: PermissionResponse,
  ): AsyncGenerator<EngineEvent> {
    if (Array.isArray(action.steps) && action.steps.length > 0) {
      yield {
        type: 'error',
        error: new Error(
          'AISDKEngine.resumeWithToolResult: bundle resume (action.steps !== undefined) ' +
            'not yet implemented. Defer to legacy QueryEngine for bundle sessions until ' +
            'Day 14+ adds bundle handling. The audric host can route bundles to legacy by ' +
            'pinning the session to the QueryEngine path during the migration window.',
        ),
      };
      yield { type: 'turn_complete', stopReason: 'error' };
      return;
    }

    this.abortController = new AbortController();

    // Push the deferred assistant message (text + tool_use blocks) into
    // history. Without this, the next streamText call sees no record of
    // the tool_use that the user just confirmed and fails Anthropic's
    // "every tool_result must follow a tool_use" invariant.
    if (action.assistantContent && action.assistantContent.length > 0) {
      this.messages.push({
        role: 'assistant',
        content: action.assistantContent as ContentBlock[],
      });
    }

    // Build the user message that satisfies the deferred tool_use:
    //   - completedResults: any read tools from the same step that
    //     completed before pending_action fired.
    //   - the write tool's result, or a "user declined" error.
    const writeResultBlock: ContentBlock = response.approved
      ? {
          type: 'tool_result',
          toolUseId: action.toolUseId,
          content: JSON.stringify(response.executionResult ?? { success: true }),
          isError: false,
        }
      : {
          type: 'tool_result',
          toolUseId: action.toolUseId,
          content: JSON.stringify({ error: 'User declined this action' }),
          isError: true,
        };

    const allResults: ContentBlock[] = [
      ...(action.completedResults ?? []).map((r) => ({
        type: 'tool_result' as const,
        toolUseId: r.toolUseId,
        content: r.content,
        isError: r.isError,
      })),
      writeResultBlock,
    ];

    this.messages.push({ role: 'user', content: allResults });

    // Surface the per-step outcome to the host UI before any LLM
    // narration so the PermissionCard renders the success/error row
    // immediately on confirm, not after the narration arrives.
    yield {
      type: 'tool_result',
      toolName: action.toolName,
      toolUseId: action.toolUseId,
      result: response.approved
        ? response.executionResult ?? { success: true }
        : { error: 'User declined this action' },
      isError: !response.approved,
      source: 'llm',
    };

    if (!response.approved) {
      yield { type: 'turn_complete', stopReason: 'end_turn' };
      return;
    }

    // Approved → re-invoke streamText to narrate. Same tool/context/
    // guard wiring as submitMessage so post-write refresh + chained
    // tools (rare on resume but possible) flow through the same path.
    const tools = toAISDKTools(this.config.tools ?? []) as ToolSet;
    const toolContext = buildToolContext(this.config, {
      signal: this.abortController.signal,
    });
    toolContext.sessionSpendUsd = this.stepFinishMutable.sessionSpendUsdLocal;

    const internal: InternalContext = {
      toolContext,
      guardState: this.guardState,
      guardConfig: this.config.guards,
      contacts: this.config.contacts ?? [],
      walletAddress: this.config.walletAddress,
      config: {
        onAutoExecuted: this.config.onAutoExecuted,
        onGuardFired: this.config.onGuardFired,
        postWriteRefresh: this.config.postWriteRefresh,
        permissionConfig: this.config.permissionConfig,
        priceCache: this.config.priceCache,
      },
      getMessages: () => this.messages,
    };

    const onStepFinish = buildStepFinishHandler(
      this.config.tools ?? [],
      internal,
      this.stepFinishMutable,
    );

    yield* this.runStream(tools, internal, onStepFinish);
  }

  /**
   * Shared stream-runner used by submitMessage + resumeWithToolResult.
   *
   * Iterates `streamText().fullStream` per-event, runs the bridge's
   * stateless `translate()` for EngineEvent emission, AND tracks the
   * extra state required to assemble a `pending_action` event when AI
   * SDK pauses on `tool-approval-request`.
   *
   * State tracked on top of the bridge:
   *   - `currentText`: text-delta accumulator → flushed to a `text`
   *     ContentBlock on the next tool-call (or stream end).
   *   - `assistantBlocks`: `text` + `tool_use` ContentBlocks
   *     accumulated this step → carried into PendingAction.assistantContent
   *     so the engine can replay the deferred assistant message into
   *     history on resume (satisfies Anthropic's tool_result-follows-
   *     tool_use invariant).
   *   - `toolCallCache`: maps toolCallId → {name, input}. Needed
   *     because `tool-approval-request` only carries
   *     `{approvalId, toolCallId}` — name + input come from the
   *     earlier `tool-call` event in the same step.
   *   - `completedResults`: tool_result blocks from auto-approved
   *     reads in the same step → carried into
   *     PendingAction.completedResults so the resume turn can replay
   *     the FULL turn (every tool_use must have a matching tool_result
   *     in the next user message; without this, the chained
   *     read+write turn would orphan the read's tool_use).
   *
   * SPEC 37 v0.7a Phase 2 Day 13 follow-up.
   */
  private async *runStream(
    tools: ToolSet,
    internal: InternalContext,
    onStepFinish: ReturnType<typeof buildStepFinishHandler>,
  ): AsyncGenerator<EngineEvent> {
    const stream = streamText({
      model: this.anthropic(this.config.model ?? 'claude-sonnet-4-5'),
      tools,
      messages: toAISDKMessages(this.messages),
      system: this.systemPromptString(),
      experimental_context: internal,
      stopWhen: stepCountIs(this.config.maxTurns ?? 10) as StopCondition<typeof tools>,
      abortSignal: this.abortController?.signal,
      onStepFinish,
      onError: (err) => {
        console.error('[AISDKEngine] streamText error:', err);
      },
    });

    const bridgeState = createBridgeState();
    const toolCallCache = new Map<string, { name: string; input: unknown }>();
    let assistantBlocks: ContentBlock[] = [];
    let completedResults: Array<{ toolUseId: string; content: string; isError: boolean }> = [];
    let currentText = '';

    const flushCurrentText = () => {
      if (currentText.length > 0) {
        assistantBlocks.push({ type: 'text', text: currentText });
        currentText = '';
      }
    };

    let pendingApprovalToolCallId: string | null = null;

    // [SPEC 37 v0.7a Phase 2 Day 13.7 / 2026-05-16] Per-step flag that
    // suppresses the push-to-history at `finish-step` when the step
    // ended with a tool-approval-request. Without this, the deferred
    // assistant content would be persisted TWICE: once at finish-step
    // (here) and again at resumeWithToolResult (via action.assistantContent).
    let stepHadApproval = false;

    /**
     * [Day 13.7] Push the accumulated assistant message + tool_results
     * from the current step into `this.messages`. Called on every
     * `finish-step` event for clean steps (no pending approval). This
     * was the bug behind the v1.34.0–1.34.6 silent data-loss for
     * read-only turns: AI SDK runs the LLM, the engine streams events
     * out to the host, but the host's `engine.getMessages()` round-trip
     * returned a copy of `this.messages` that NEVER had the assistant
     * message appended. Confirm-tier writes worked by luck because
     * `resumeWithToolResult` does the push. Read-only turns and
     * writes that auto-executed silently dropped the assistant
     * response from session history → invisible until page refresh.
     *
     * The legacy QueryEngine pushes assistant messages in MANY places
     * (engine.ts:2274 — clean turn with all auto-approved tools;
     * engine.ts:1571, 1582 — early-results / aborted paths; etc.).
     * Day 13.7 mirrors the clean-turn path; we don't yet need the
     * aborted/early-results variants because v2's AI SDK runtime
     * surfaces those as ordinary errors that don't pretend to commit
     * an assistant turn.
     */
    const pushStepToHistory = () => {
      flushCurrentText();
      if (assistantBlocks.length === 0) return;
      this.messages.push({
        role: 'assistant',
        content: normalizeAssistantContentForAnthropic(assistantBlocks),
      });
      if (completedResults.length > 0) {
        this.messages.push({
          role: 'user',
          content: completedResults.map((r) => ({
            type: 'tool_result' as const,
            toolUseId: r.toolUseId,
            content: r.content,
            isError: r.isError,
          })),
        });
      }
    };

    /**
     * [Day 13.7] Reset per-step accumulators so a multi-step stream's
     * second step starts with a clean slate. AI SDK fires
     * `start-step` between steps; without this reset, step 2's
     * assistant message would include step 1's text + tool_use
     * blocks, leading to duplicate persistence + a corrupt history
     * shape on `pending_action`.
     */
    const resetStepAccumulators = () => {
      assistantBlocks = [];
      completedResults = [];
      currentText = '';
      stepHadApproval = false;
      dedupKeyToOriginalCallId.clear();
      dedupedToolCallIds.clear();
    };

    // [SPEC 37 v0.7a Phase 2 Day 13.6 / 2026-05-16] Per-step dedupe of
    // identical concurrent tool_use blocks. The LLM occasionally emits
    // duplicate parallel tool calls (e.g. `balance_check(input:{})` ×2
    // alongside a `save_deposit`) under thinking-mode + parallel
    // tool-calling. Production smoke (sessions s_1778897667420…)
    // showed this surfacing as two RED `BALANCE CHECK` tiles next to
    // a single SAVE result.
    //
    // Dedupe rules (deliberately conservative):
    //   - ONLY for tools where `isReadOnly && isConcurrencySafe`. Writes
    //     might legitimately repeat (e.g. user wants to send twice);
    //     deduping them would silently drop a real intent. The strict
    //     read-and-safe gate matches the legacy EarlyToolDispatcher's
    //     "safe to parallelize" criterion.
    //   - PER-STEP, not per-stream. AI SDK v6 emits `start-step` /
    //     `finish-step` around each LLM iteration; we reset both maps
    //     at the start of each step. This way: balance_check called
    //     in step 1 → balance_check called again in step 2 (e.g.
    //     after a write) is NOT deduped — a fresh read is the user's
    //     intent.
    //   - Dedup key = `${toolName}::${stableJsonStringify(input)}`.
    //     Stable stringify so `{a:1,b:2}` and `{b:2,a:1}` collide.
    //
    // What gets dropped for duplicates:
    //   - The duplicate `tool-call` event is NOT forwarded to the
    //     bridge → no second `tool_start` EngineEvent → no second UI
    //     tile.
    //   - The duplicate is NOT pushed into `assistantBlocks` → the
    //     deferred assistant message replayed on resume contains only
    //     one `tool_use` per logical operation (also satisfies the
    //     Anthropic strict-format rule we fixed in 13.4 by the
    //     simpler path of not generating a duplicate at all).
    //   - The matching `tool-result` / `tool-error` event is NOT
    //     forwarded to the bridge → no second `tool_result` EngineEvent.
    //   - The matching tool result is NOT pushed into
    //     `completedResults` → the resume turn's user message stays
    //     consistent with the assistant message's tool_use count.
    //
    // What is NOT prevented:
    //   - AI SDK still calls the wrapper's `execute()` for the
    //     duplicate — the wrapper runs the guard pipeline + tool.call
    //     for both. A future optimisation (Day 13.7+) can add a
    //     per-step Promise cache in the wrapper to skip the duplicate
    //     work; today we accept the small cost since duplicates are
    //     rare and the user-facing fix is the bridge filter above.
    const dedupKeyToOriginalCallId = new Map<string, string>();
    const dedupedToolCallIds = new Set<string>();

    /**
     * Deterministic JSON stringify with sorted keys. Two inputs with
     * the same keys+values produce the same string regardless of key
     * order or insertion order. Cheaper than a deep-equal hash for
     * typical tool inputs (small flat objects).
     */
    const stableStringify = (v: unknown): string => {
      if (v === null || typeof v !== 'object') return JSON.stringify(v);
      if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
      const keys = Object.keys(v as Record<string, unknown>).sort();
      return `{${keys
        .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
        .join(',')}}`;
    };

    /** Look up the legacy tool to check isReadOnly + isConcurrencySafe. */
    const isSafeToDedupTool = (name: string): boolean => {
      const t = findTool(this.config.tools ?? [], name);
      return !!(t?.isReadOnly && t?.isConcurrencySafe);
    };

    for await (const event of stream.fullStream) {
      // State tracking — done BEFORE translation so the per-event
      // accumulators see every event (translate() may drop some).
      switch (event.type) {
        case 'start-step':
          // [Day 13.6 + 13.7] Reset per-step dedup state AND
          // assistant-block accumulators. See the dedup state +
          // pushStepToHistory comments above for the full rationale.
          resetStepAccumulators();
          break;
        case 'finish-step':
          // [Day 13.7] Persist the just-finished step's assistant
          // content + tool_results into history. Skipped when the
          // step ended with a tool-approval-request — that case
          // captures the content into `action.assistantContent`
          // and persists via resumeWithToolResult on the host
          // round-trip.
          if (!stepHadApproval) pushStepToHistory();
          break;
        case 'text-delta':
          currentText += event.text;
          break;
        case 'tool-call': {
          // Dedup check: skip duplicate concurrent tool_uses for
          // read-and-safe tools. See the comment block above for the
          // full rationale + criteria.
          if (isSafeToDedupTool(event.toolName)) {
            const key = `${event.toolName}::${stableStringify(event.input)}`;
            const existing = dedupKeyToOriginalCallId.get(key);
            if (existing) {
              // Mark this toolCallId as deduped so the matching
              // tool-result/tool-error event below is also dropped.
              // Crucially: do NOT push to assistantBlocks, do NOT
              // forward to bridge — `continue` the outer loop.
              dedupedToolCallIds.add(event.toolCallId);
              continue;
            }
            dedupKeyToOriginalCallId.set(key, event.toolCallId);
          }
          flushCurrentText();
          toolCallCache.set(event.toolCallId, {
            name: event.toolName,
            input: event.input,
          });
          assistantBlocks.push({
            type: 'tool_use',
            id: event.toolCallId,
            name: event.toolName,
            input: event.input,
          });
          break;
        }
        case 'tool-result': {
          // Dedup gate: drop the result event for any deduped
          // toolCallId. Skip both the completedResults push AND the
          // bridge forward by continuing the outer loop.
          if (dedupedToolCallIds.has(event.toolCallId)) continue;
          // Auto-approved reads complete with a tool-result event in
          // the same step. Capture into completedResults so a later
          // pending_action in this step can replay the read's
          // tool_result alongside the write's tool_result on resume.
          completedResults.push({
            toolUseId: event.toolCallId,
            content: typeof event.output === 'string' ? event.output : JSON.stringify(event.output),
            isError: false,
          });
          break;
        }
        case 'tool-error': {
          if (dedupedToolCallIds.has(event.toolCallId)) continue;
          // Read tool error in the same step — still need a tool_result
          // for resume's history-replay invariant.
          completedResults.push({
            toolUseId: event.toolCallId,
            content: typeof event.error === 'string' ? event.error : JSON.stringify(event.error),
            isError: true,
          });
          break;
        }
        case 'tool-approval-request':
          // AI SDK v6's `ToolApprovalRequestOutput` carries
          // `toolCall: TypedToolCall<TOOLS>` (not `toolCallId`
          // directly). The toolCall object has `.toolCallId` +
          // `.toolName` + `.input` — the same fields the prior
          // `tool-call` event surfaced. We could read directly from
          // event.toolCall, but the toolCallCache is still valuable
          // because the cached input is the parsed/validated shape
          // that flowed through `tool-call`'s schema validation,
          // whereas event.toolCall.input is the raw model emission.
          // For PendingAction.input (which audric persists + replays
          // verbatim) the validated shape is correct.
          flushCurrentText();
          pendingApprovalToolCallId = event.toolCall.toolCallId;
          // [Day 13.7] Mark this step so the subsequent finish-step
          // doesn't push the deferred assistant content into history
          // (that's resumeWithToolResult's job — it gets the write
          // tool's result to pair with the deferred tool_use).
          stepHadApproval = true;
          break;
        default:
          break;
      }

      // Translate via the bridge → forward EngineEvents as legacy.
      // tool-approval-request returns [] from translate by design;
      // we emit pending_action ourselves below.
      for (const out of translate(event, bridgeState)) {
        if (out.type === 'usage') {
          this.costTracker.track(
            out.inputTokens,
            out.outputTokens,
            out.cacheReadTokens,
            out.cacheWriteTokens,
          );
        }
        yield out;
      }
    }

    // Stream complete. If we hit a tool-approval-request, build the
    // PendingAction and emit. The bridge already yielded turn_complete
    // (or finish events that translate to it); pending_action goes
    // BEFORE turn_complete in legacy QueryEngine, but emitting after
    // is acceptable because audric's chat route processes both
    // unconditionally before closing the SSE stream.
    if (pendingApprovalToolCallId) {
      const cached = toolCallCache.get(pendingApprovalToolCallId);
      const tool = cached ? findTool(this.config.tools ?? [], cached.name) : undefined;

      if (!cached || !tool) {
        // Defensive fallback — emit an error event so audric can
        // surface a friendly retry prompt instead of a silent stall.
        yield {
          type: 'error',
          error: new Error(
            `AISDKEngine: tool-approval-request fired for unknown toolCallId=${pendingApprovalToolCallId} ` +
              `(cached=${!!cached}, tool=${cached?.name ?? 'unresolved'}). This indicates a bug in the ` +
              `tool-call cache or a tool-name mismatch between the LLM emission and the registered tool set.`,
          ),
        };
        return;
      }

      // Sanity check: only confirm-tier writes should ever hit the
      // approval gate. If we got here for an auto/explicit tool, the
      // tool policy registry is out of sync with the wrapper's
      // needsApproval wiring. Surface as error so the drift is
      // visible in TurnMetrics instead of silently fabricating a
      // confirm card for a non-write.
      const policy = getToolPolicy(tool.name);
      if (policy.permissionLevel === 'auto') {
        yield {
          type: 'error',
          error: new Error(
            `AISDKEngine: tool-approval-request fired for auto-tier tool '${tool.name}'. ` +
              `Tool policy registry drift — check tool-policy.ts.`,
          ),
        };
        return;
      }

      const turnIndex = this.messages.filter((m) => m.role === 'assistant').length;
      const attemptId = crypto.randomUUID();
      const modifiableFields = getModifiableFields(tool.name);

      // [SPEC 37 v0.7a Week 4 cleanup — Day 14a / 2026-05-16] Stamp live
      // NAVI data (borrowApyBps for borrow/repay, currentHF for borrow/
      // withdraw/save/repay) so audric's V2 preview bodies render
      // APYBlock + HFGauge primitives instead of the pre-Week-4 italic
      // disclaimer + missing HF row. Fail-soft: if NAVI MCP is
      // unavailable or the cache lookup errors, the helper returns `{}`
      // and the V2 component falls back to honest degradation.
      const liveData = await enrichPendingActionWithLiveData(
        tool.name,
        cached.input,
        internal.toolContext,
      );

      const action: PendingAction = {
        toolName: tool.name,
        toolUseId: pendingApprovalToolCallId,
        input: cached.input,
        description: describeAction(tool, {
          id: pendingApprovalToolCallId,
          name: tool.name,
          input: cached.input,
        }),
        assistantContent: normalizeAssistantContentForAnthropic(assistantBlocks),
        completedResults,
        ...(modifiableFields && modifiableFields.length > 0 ? { modifiableFields } : {}),
        turnIndex,
        attemptId,
        ...(liveData.borrowApyBps !== undefined ? { borrowApyBps: liveData.borrowApyBps } : {}),
        ...(liveData.currentHF !== undefined ? { currentHF: liveData.currentHF } : {}),
        // [Day 14c] projectedHF — render alongside currentHF as
        // "current → projected" so user sees the HF delta before
        // approving.
        ...(liveData.projectedHF !== undefined ? { projectedHF: liveData.projectedHF } : {}),
      };

      yield { type: 'pending_action', action };
    }
  }

  // -------------------------------------------------------------------
  // Day 2 helpers — tool dispatch + context threading via AI SDK natives
  // (Day 3 adds: prepareStep guard pipeline, onStepFinish post-write
  // refresh, real EngineEvent translation via the bridge layer)
  // -------------------------------------------------------------------

  private systemPromptString(): string | undefined {
    const sp = this.config.systemPrompt;
    if (!sp) return undefined;
    if (typeof sp === 'string') return sp;
    // SystemBlock[] → joined string. Cache hints dropped during
    // join — AI SDK v3 handles cache breakpoints automatically.
    if (Array.isArray(sp)) {
      return sp.map((b) => b.text).join('\n\n');
    }
    return undefined;
  }

}

// ---------------------------------------------------------------------------
// Anthropic strict-format normaliser for deferred assistant content
// ---------------------------------------------------------------------------
//
// [SPEC 37 v0.7a Phase 2 Day 13.4 / 2026-05-16] Production smoke caught a
// 400 error from Anthropic on the *resume* turn for compound prompts where
// the LLM emitted text BETWEEN tool_uses in a single assistant message
// (e.g. "Save $50 USDC" → [text "let me check", tool_use bc1, tool_use bc2,
// text "let me sort", tool_use send]). The send approval card rendered
// correctly; on tap-confirm, the resume's streamText call replayed the
// deferred assistant content verbatim and Anthropic rejected:
//
//   messages.9: `tool_use` ids were found without `tool_result` blocks
//   immediately after: toolu_01DH2LdACfkaGj5MvZZrG52T,
//   toolu_01FwXtGSaL3BiMq2z6S3PCM4. Each `tool_use` block must have a
//   corresponding `tool_result` block in the next message.
//
// Root cause: Anthropic's input validator does not accept text blocks
// INTERSPERSED between tool_use blocks in an assistant message, even
// though Anthropic models CAN output that pattern. The validator wants
// all tool_use blocks to be contiguous (and the immediately-following
// user message to start with tool_result blocks for all of them).
//
// This is a well-known AI SDK + Anthropic gotcha — see vercel/ai issue
// #8516. The recommended client-side fix is to normalise the assistant
// content into Anthropic's accepted shape:
//
//   - all text blocks merged into a single leading text block
//   - all tool_use blocks after the text, preserving their original order
//   - thinking / redacted_thinking blocks preserved BEFORE text (the
//     extended-thinking blocks must precede everything else for the
//     signed-thinking round-trip to validate)
//
// Lossy? The middle text block is concatenated into the leading text
// rather than displayed AFTER bc1/bc2 in the chat narration. The
// user-visible chat still shows the original assistant message via the
// host's UI rendering (the host writes the raw LLM output to the
// timeline before resume); only the *replayed* history sent to the
// Anthropic API is rearranged. The model never sees the merged form on
// the wire — it sees the same content blocks in a structurally valid
// order.
//
// Why not split into multiple assistant messages? Anthropic accepts
// CONSECUTIVE assistant messages, but the conversion would force every
// tool_use into its own assistant + tool_result pair on the wire (the
// v4 pattern). That's a heavier change with broader test surface, and
// the simpler reorder is sufficient — every failure observed in
// production fits the "text between tool_uses" shape.
// ---------------------------------------------------------------------------
function normalizeAssistantContentForAnthropic(
  blocks: readonly ContentBlock[],
): ContentBlock[] {
  // Fast path: no tool_use blocks → no rearrangement needed.
  const hasToolUse = blocks.some((b) => b.type === 'tool_use');
  if (!hasToolUse) return [...blocks];

  // Fast path: no text blocks → already valid (just tool_uses, possibly
  // with thinking). No rearrangement needed.
  const hasText = blocks.some((b) => b.type === 'text');
  if (!hasText) return [...blocks];

  const thinkingBlocks: ContentBlock[] = [];
  const textParts: string[] = [];
  const toolUseBlocks: ContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'thinking' || block.type === 'redacted_thinking') {
      thinkingBlocks.push(block);
    } else if (block.type === 'text') {
      // Drop empty text blocks (Anthropic rejects them too). Filter on
      // trimmed length so whitespace-only narration ("\n\n") doesn't
      // survive the merge.
      if (block.text.trim().length > 0) textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolUseBlocks.push(block);
    } else {
      // Unknown future block type → preserve in the leading position
      // alongside thinking. Keeps the normaliser forward-compatible
      // when new ContentBlock variants land (e.g. citations).
      thinkingBlocks.push(block);
    }
  }

  // Fast path: nothing got reordered (text was already before all
  // tool_uses) → return the original to preserve referential identity
  // for caller-side equality checks.
  const wasAlreadyOrdered =
    blocks.findIndex((b) => b.type === 'tool_use') >
    blocks.map((b) => b.type).lastIndexOf('text');
  if (wasAlreadyOrdered) return [...blocks];

  const out: ContentBlock[] = [...thinkingBlocks];
  if (textParts.length > 0) {
    out.push({ type: 'text', text: textParts.join('\n\n') });
  }
  out.push(...toolUseBlocks);

  return out;
}

// ---------------------------------------------------------------------------
// Re-export AI SDK tool() factory for downstream usage
// ---------------------------------------------------------------------------
//
// Tools migrate from `buildTool({...})` to `tool({...})` via this
// re-export. Day 4-9 migration replaces every `import { buildTool }
// from '../tool.js'` with `import { tool } from '../v2/index.js'`.
// ---------------------------------------------------------------------------
export { tool } from 'ai';

// Legacy Tool type re-export for compat during migration. Day 9 swaps
// audric-side imports to AI SDK's `Tool` type from `ai` directly.
export type { LegacyTool };
