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
// context) compose around AI SDK primitives:
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
//   - Tool migration (all 37 tools still use legacy buildTool — Day 4-9
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
  type SystemModelMessage,
  type LanguageModel,
  type TelemetrySettings,
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
import {
  buildPrepareStepSystem,
  buildSystemForStream as buildSystemForStreamHelper,
} from './system-prompt-cache.js';
import { buildAnthropicProviderOptions } from '../providers/ai-sdk-message-conversion.js';
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
import {
  buildCanonicalRouteText,
  isExecutionResultFailure,
} from './canonical-route.js';
import { stripPseudoThinking } from '../strip-pseudo-thinking.js';
import { validateHistory } from './validate-history.js';
import {
  clearPortfolioCacheFor,
  clearDefiCacheFor,
} from '../blockvision-prices.js';
import {
  detectInFlightTool,
  type StreamResumeOutcome,
} from '../stream-checkpoint.js';
// [SPEC_PHASE_7_DRAFT.md / v2.7.0] Memory layer — prepareStep injects a
// `<memory_recall>` block at layer 3 of the F-4 5-layer system prompt.
import { buildMemoryBlock } from '../memory/build-memory-block.js';
import { extractLatestUserMessage } from '../memory/extract-user-message.js';

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
//   - All the engine-specific config (guards, permissionConfig,
//     priceCache, contacts, postWriteRefresh, onAutoExecuted, etc.)
// ---------------------------------------------------------------------------
export interface AISDKEngineConfig extends Omit<EngineConfig, 'provider'> {
  /**
   * Anthropic API key — required when `modelInstance` is NOT set. When
   * `modelInstance` is provided (e.g. a `gateway('anthropic/claude-...')`
   * wrapped model from web-v2 per SPEC v0.7c D-6 Day 2c), this field
   * is ignored and the engine never calls `createAnthropic`.
   */
  anthropicApiKey?: string;

  /**
   * [SPEC v0.7c Day 2c / D-6 AI Gateway lock] Pre-built `LanguageModel`
   * to use verbatim instead of the engine's internal
   * `createAnthropic({ apiKey })` path. Lets hosts inject:
   *  - A `gateway('anthropic/claude-sonnet-4-5')` wrapped model for
   *    multi-provider failover + Vercel-native observability (web-v2).
   *  - A `wrapLanguageModel({ model, middleware })` for the future
   *    SPEC v0.7c D-17 Phase 5.5 middleware adoption.
   *  - A mocked `MockLanguageModelV3` for engine integration tests.
   *
   * When set, the engine uses this verbatim and ignores both
   * `anthropicApiKey` AND `config.model` (the legacy string model id —
   * the injected `LanguageModel` is fully self-describing). When
   * absent, falls back to `createAnthropic({apiKey})` + `this.anthropic(config.model ?? 'claude-sonnet-4-5')`
   * (the pre-2.8.0 behavior — backward compatible).
   *
   * Accepts the AI SDK v6 `LanguageModel` union (string id |
   * LanguageModelV3 | LanguageModelV2) so callers can pass either a
   * pre-built provider instance OR a raw global-provider model id
   * (`'anthropic/claude-sonnet-4-5'`) when the AI SDK's global
   * provider auto-resolution covers their case.
   */
  modelInstance?: LanguageModel;

  /**
   * [SPEC v0.7c Day 2c / D-18 telemetry lock] AI SDK v6
   * `experimental_telemetry` settings forwarded into `streamText`.
   * Hosts pass `{ isEnabled: true, functionId: 'audric-chat',
   * metadata: { sessionId, userId } }` to emit OpenTelemetry spans
   * that the Vercel AI Gateway dashboard consumes automatically.
   *
   * When absent, telemetry is disabled (AI SDK v6 default while
   * experimental).
   */
  experimentalTelemetry?: TelemetrySettings;

  /**
   * [SPEC v0.7c Day 2c++ / D-6 AI Gateway audit] Vercel AI Gateway
   * provider options forwarded into `streamText` as
   * `providerOptions.gateway`. Use this to:
   *  - `caching: 'auto'` — let the gateway auto-inject `cache_control`
   *    breakpoints on providers that require them (Anthropic, MiniMax).
   *    Critical: without this, Anthropic prompt caching is silently
   *    OFF when the engine system prompt is a plain string (web-v2's
   *    Day 2b minimal-prompt case). The gateway places the breakpoint
   *    at the end of static content per Vercel docs.
   *  - `order: ['anthropic', 'bedrock']` — provider failover order.
   *  - `only: ['anthropic']` — provider allow-list.
   *  - `sort: 'cost' | 'ttft' | 'tps'` — rank providers by metric.
   *  - `disallowPromptTraining: true` — request providers don't train.
   *  - `zeroDataRetention: true` — ZDR-only providers.
   *  - `hipaaCompliant: true` — HIPAA-compliant routing.
   *  - `byok: {...}` — per-request bring-your-own-key credentials.
   *
   * Only meaningful when `modelInstance` is a `gateway(...)` call (or
   * a global-provider model id string that AI SDK resolves through
   * the default gateway). Direct-Anthropic callers ignore this.
   *
   * Type kept local + permissive: `@ai-sdk/gateway` v3.0.114's
   * `GatewayProviderOptions` type lacks the `caching` field even
   * though Vercel docs document it (the gateway server accepts it
   * regardless). We type the documented surface verbatim; hosts cast
   * if they need vendor extensions.
   */
  gatewayProviderOptions?: AISDKEngineGatewayProviderOptions;
}

/**
 * Local subset of Vercel AI Gateway provider options that the engine
 * forwards into `streamText.providerOptions.gateway`. See the
 * `gatewayProviderOptions` JSDoc on `AISDKEngineConfig` for the full
 * meaning of each field. Kept local so the engine doesn't need a
 * direct dep on `@ai-sdk/gateway` (it's transitively available via
 * `ai`'s re-exports).
 */
export interface AISDKEngineGatewayProviderOptions {
  caching?: 'auto';
  order?: string[];
  only?: string[];
  sort?: 'cost' | 'ttft' | 'tps';
  disallowPromptTraining?: boolean;
  zeroDataRetention?: boolean;
  hipaaCompliant?: boolean;
  byok?: Record<string, Record<string, unknown>[]>;
  user?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// AISDKEngine class
// ---------------------------------------------------------------------------
export class AISDKEngine {
  private readonly config: AISDKEngineConfig;
  /**
   * Internal Anthropic provider — instantiated only when `modelInstance`
   * is NOT injected (the pre-2.8.0 code path). When the host injects
   * a pre-built `LanguageModel` (e.g. gateway-wrapped), this stays
   * null and the engine never calls `createAnthropic`.
   */
  private readonly anthropic: ReturnType<typeof createAnthropic> | null;
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
    // [SPEC v0.7c Day 2c] When the host injects a pre-built `LanguageModel`
    // (e.g. gateway-wrapped), skip the internal Anthropic provider
    // entirely — `anthropicApiKey` becomes optional. When neither is
    // set, fail loudly at construct time (vs silent undefined at first
    // turn) so misconfig surfaces in the same boot phase as env-gate
    // failures.
    if (config.modelInstance === undefined) {
      if (!config.anthropicApiKey) {
        throw new Error(
          '[AISDKEngine] Either `modelInstance` (pre-built LanguageModel) or `anthropicApiKey` must be provided.',
        );
      }
      this.anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
    } else {
      this.anthropic = null;
    }
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
      /**
       * [v2.5.0 5e-4] Optional abort signal. When set, threaded to
       * `checkpointStore.replay(streamId, { signal })` so the store
       * can short-circuit pulling remaining events from the backend
       * once the host signals "consumer is gone, stop spending."
       * Aborting MID-REPLAY exits cleanly (no `EngineEvent.error`
       * emitted) and fires `onStreamResume({ outcome: 'clean' })`
       * with `eventsReplayed` reflecting only what was yielded
       * before the abort.
       */
      signal?: AbortSignal;
    },
  ): AsyncGenerator<EngineEvent> {
    // [SPEC 37 v0.7a Phase 5 Slice C / v2.2.0] Validate checkpoint config
    // BEFORE we mutate history. `resumeStreamId` without a store is a
    // host bug (no way to fulfil the contract); fail loudly.
    if (this.config.resumeStreamId && !this.config.streamCheckpointStore) {
      throw new Error(
        '[AISDKEngine] resumeStreamId set without streamCheckpointStore — checkpoint store is required for resume',
      );
    }

    // [Slice C] On a resume call, replay the checkpointed events first
    // and check for an in-flight tool. If we find one, we emit an error
    // and STOP — Path B per the spec (Path A silent re-execution is
    // deferred to v2.3.0+). The replay is the ENTIRE response — no
    // second LLM pass, no live continuation (per S.151). When a
    // terminal is missing (replay was captured mid-event) we synthesise
    // `turn_complete` so the host state machine doesn't hang.
    const checkpointStore = this.config.streamCheckpointStore;
    const resumeStreamId = this.config.resumeStreamId;
    if (resumeStreamId && checkpointStore) {
      // [v2.5.0 5e-3] All four resume terminal paths fire the
      // `onStreamResume` callback exactly once before returning.
      // Helper centralises the try/catch so a misbehaving subscriber
      // can't tank the resume.
      const reportOutcome = (outcome: StreamResumeOutcome): void => {
        const cb = this.config.onStreamResume;
        if (!cb) return;
        try {
          cb(outcome);
        } catch (err) {
          console.error('[AISDKEngine] onStreamResume callback threw (non-fatal):', err);
        }
      };

      const replayed: EngineEvent[] = [];
      try {
        for await (const ev of checkpointStore.replay(resumeStreamId, {
          signal: options?.signal,
        })) {
          replayed.push(ev);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        yield { type: 'error', error };
        reportOutcome({ outcome: 'replay_error', streamId: resumeStreamId, error });
        return;
      }

      // Empty replay = no checkpoint found (expired / never written /
      // wrong id). Surface as an error so the host knows to start a
      // fresh turn rather than silently producing a half-stream.
      if (replayed.length === 0) {
        yield {
          type: 'error',
          error: new Error(
            `[AISDKEngine] resumeStreamId '${resumeStreamId}' has no checkpoint (expired or unknown)`,
          ),
        };
        reportOutcome({ outcome: 'empty', streamId: resumeStreamId });
        return;
      }

      const dangling = detectInFlightTool(replayed);
      if (dangling) {
        // Replay everything we have so the UI shows what already happened,
        // then emit a clear error and stop. Host re-prompts the user.
        for (const ev of replayed) yield ev;
        yield {
          type: 'error',
          error: new Error(
            `[AISDKEngine] cannot resume mid-tool: '${dangling.toolName}' was in-flight when the stream dropped — please retry the request`,
          ),
        };
        reportOutcome({
          outcome: 'mid_tool',
          streamId: resumeStreamId,
          eventsReplayed: replayed.length,
          toolUseId: dangling.toolUseId,
          toolName: dangling.toolName,
        });
        return;
      }

      // Clean checkpoint: replay all events to the new client, then
      // clear the checkpoint (the host kept the events; we don't need
      // to retain them past this point). We do NOT continue into the
      // live LLM stream — the original stream emitted `turn_complete`
      // before our `clear`, so a fully-replayed log is by construction
      // a completed turn. (If it wasn't, `detectInFlightTool` would
      // have caught it OR the missing `turn_complete` would have left
      // the host expecting more — handled below by emitting one.)
      for (const ev of replayed) yield ev;
      void checkpointStore.clear(resumeStreamId).catch((err) => {
        console.error('[AISDKEngine] checkpoint clear failed (non-fatal):', err);
      });

      // Defensive: ensure the host always sees a terminal event. If the
      // original stream was cut between the last `tool_result` and the
      // `turn_complete`, the replay above won't contain it; synthesise
      // one so the host's stream-consumer state machine doesn't hang.
      const hasTerminal = replayed.some(
        (ev) => ev.type === 'turn_complete' || ev.type === 'pending_action',
      );
      if (!hasTerminal) {
        yield { type: 'turn_complete', stopReason: 'end_turn' };
        reportOutcome({
          outcome: 'synthesized_terminal',
          streamId: resumeStreamId,
          eventsReplayed: replayed.length,
        });
      } else {
        reportOutcome({
          outcome: 'clean',
          streamId: resumeStreamId,
          eventsReplayed: replayed.length,
        });
      }
      return;
    }

    // Push user message into history first (matches legacy semantics
    // — failures during streamText still leave the user message in
    // history so the next turn sees it).
    this.messages.push({
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    });

    // [Slice C] If a checkpoint store is configured (but we're not
    // resuming), generate a fresh streamId and emit `stream_started`
    // as the very first event so the host can persist the id before
    // anything else streams.
    const streamId =
      checkpointStore && !resumeStreamId
        ? this.generateStreamId()
        : null;
    if (streamId) {
      yield { type: 'stream_started', streamId };
      // Fire-and-forget append per Decision 5 — the live stream NEVER
      // stalls on store I/O.
      void checkpointStore!
        .append(streamId, { type: 'stream_started', streamId })
        .catch((err) => {
          console.error(
            '[AISDKEngine] checkpoint append failed (non-fatal, stream not resumable):',
            err,
          );
        });
    }

    // Emit harness_shape upfront if provided — same as legacy.
    if (options?.harnessShape) {
      const ev: EngineEvent = {
        type: 'harness_shape',
        shape: options.harnessShape,
        rationale: options.harnessRationale ?? options.harnessShape,
      };
      yield ev;
      if (streamId) {
        void checkpointStore!.append(streamId, ev).catch(() => {
          // Already logged on the first failure above; further failures
          // for the same stream stay silent to avoid log spam.
        });
      }
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

    // [Slice C] When checkpointing, intercept every yielded event from
    // runStream and fire-and-forget append to the store. On turn_complete
    // (terminal for a non-paused turn) we clear the checkpoint — the
    // turn finished cleanly and the host won't need to resume it.
    // pending_action does NOT clear: the host's resume route uses the
    // separate `resumeWithToolResult` path keyed on `attemptId`, but
    // a page reload BETWEEN pending_action emission and user-confirm
    // should still let the user see the confirm card on reconnect.
    if (streamId && checkpointStore) {
      for await (const ev of this.runStream(tools, internal, onStepFinish)) {
        yield ev;
        void checkpointStore.append(streamId, ev).catch(() => {
          // Already logged above on first failure for this stream.
        });
        if (ev.type === 'turn_complete') {
          void checkpointStore.clear(streamId).catch((err) => {
            console.error(
              '[AISDKEngine] checkpoint clear failed on turn_complete (non-fatal):',
              err,
            );
          });
        }
      }
      return;
    }

    yield* this.runStream(tools, internal, onStepFinish);
  }

  /**
   * [Slice C] Generate a fresh streamId. Uses `crypto.randomUUID()` when
   * available (Node ≥19, all browsers, edge runtime); falls back to a
   * timestamp+random hybrid for ancient environments. Engine-owned per
   * Decision 4 of the Slice C spec — guarantees uniqueness across hosts
   * without requiring hosts to wire up their own UUID source.
   */
  private generateStreamId(): string {
    const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
    return `stream_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
  async *resumeWithInput(
    _pendingInput: unknown,
    _values: Record<string, unknown>,
  ): AsyncGenerator<EngineEvent> {
    // [v2.0.1 — 2026-05-17] Stub for the pending_input flow.
    //
    // AISDKEngine does not yet support `needsInput` preflight verdicts +
    // the resulting `pending_input` -> `resumeWithInput` round-trip.
    // The legacy `QueryEngine` implemented this; `AISDKEngine` does not.
    //
    // Today, the ONLY built-in tool that produces `pending_input` is
    // `add_recipient` (opt-in via host — exported as
    // `addRecipientTool` from `@t2000/engine`). Audric gates exposure
    // behind `NEXT_PUBLIC_HARNESS_V9`. When that flag is unset (the
    // default) no tool ever produces `pending_input` and this method
    // is never reached.
    //
    // We surface this gap as a clear engine error rather than a silent
    // type cast in the host, so any future host that ships pending_input
    // gets a precise diagnostic instead of a runtime crash deeper in
    // the stream pipeline.
    //
    // Removal plan: implement properly in a follow-up release once the
    // first host needs the feature.
    yield {
      type: 'error',
      error: new Error(
        'AISDKEngine.resumeWithInput: pending_input flow is not yet ' +
          'implemented in v2.x. The only built-in tool that produces ' +
          'pending_input is `add_recipient` (opt-in). Hosts that need this ' +
          'feature should pin to engine v1.38.5 until pending_input lands in ' +
          'a future v2.x release. See packages/engine/src/v2/engine.ts.',
      ),
    };
    yield { type: 'turn_complete', stopReason: 'error' };
  }

  async *resumeWithToolResult(
    action: PendingAction,
    response: PermissionResponse,
  ): AsyncGenerator<EngineEvent> {
    this.abortController = new AbortController();

    // [v2.0.4 / 2026-05-17] Bundle resume support.
    //
    // Pre-v2.0.4, this method short-circuited with an error for any
    // action carrying `steps`. Audric's production "swap N SUI then save
    // it" Payment Intent flow tripped this every time: the tx executed
    // on-chain successfully (host's `/api/transactions/execute` returned
    // a digest), the host called back into `/api/engine/resume` with
    // `stepResults`, and the engine crashed before narrating. The user
    // saw "ALL SUCCEEDED" alongside the error banner and no post-bundle
    // balance refresh.
    //
    // Ported from the deleted QueryEngine.resumeWithToolResult (commit
    // f87d7329). Bundle path differs from single-write in 3 places:
    //   1. Build N writeResultBlocks (one per step) instead of 1.
    //   2. Optionally append a <canonical_route> text block when any
    //      swap_execute leg succeeded (SPEC 20.2 D-4) so narration
    //      grounds on the actual on-chain route, not a stale prior quote.
    //   3. Yield N tool_result events so the host PermissionCard renders
    //      one outcome row per leg.
    //
    // Atomic-failure semantics: Payment Intent execution is atomic at the
    // Sui layer. When audric detects a bundle-level failure (sponsor
    // reverts, dry-run fails, on-chain abort), it populates every
    // stepResults entry with `isError: true` carrying the same error
    // message. This impl honors that — failed legs get error
    // tool_result blocks, and the canonical_route block is suppressed
    // for ANY failed swap leg (so the LLM doesn't narrate a successful
    // route on a reverted bundle).
    const isBundle =
      Array.isArray(action.steps) && action.steps.length > 0;

    // Push the deferred assistant message (text + tool_use blocks) into
    // history. Without this, the next streamText call sees no record of
    // the tool_use that the user just confirmed and fails Anthropic's
    // "every tool_result must follow a tool_use" invariant.
    if (action.assistantContent && action.assistantContent.length > 0) {
      this.messages.push({
        role: 'assistant',
        content: stripPseudoThinking(
          action.assistantContent as ContentBlock[],
        ),
      });
    }

    // Build the write tool_result blocks: N for bundles, 1 for single-write.
    const writeResultBlocks: ContentBlock[] = [];
    if (isBundle) {
      const steps = action.steps!;
      const stepResults = response.stepResults ?? [];
      const resultByToolUseId = new Map(
        stepResults.map((r) => [r.toolUseId, r]),
      );

      for (const step of steps) {
        if (response.approved) {
          const stepResult = resultByToolUseId.get(step.toolUseId);
          if (stepResult) {
            writeResultBlocks.push({
              type: 'tool_result',
              toolUseId: step.toolUseId,
              content: JSON.stringify(stepResult.result),
              isError: stepResult.isError,
            });
          } else {
            // Host approved the bundle but didn't supply this step's
            // result. Fail closed — treat as an error so the LLM
            // narrates "this step's outcome is unknown" instead of
            // fake-success. Payment Intent execution is atomic at the
            // Sui layer, so an approved+missing-result is a host bug;
            // surfacing it as an error is safer than locking the user
            // into a bad state.
            writeResultBlocks.push({
              type: 'tool_result',
              toolUseId: step.toolUseId,
              content: JSON.stringify({
                error:
                  "Host omitted this step's execution result. Treating " +
                  'as failure — actual on-chain state is unknown. Re-check ' +
                  'wallet via balance_check before re-attempting.',
                _hostBugMissingStepResult: true,
              }),
              isError: true,
            });
          }
        } else {
          writeResultBlocks.push({
            type: 'tool_result',
            toolUseId: step.toolUseId,
            content: JSON.stringify({ error: 'User declined this action' }),
            isError: true,
          });
        }
      }
    } else {
      writeResultBlocks.push(
        response.approved
          ? {
              type: 'tool_result',
              toolUseId: action.toolUseId,
              content: JSON.stringify(
                response.executionResult ?? { success: true },
              ),
              isError: false,
            }
          : {
              type: 'tool_result',
              toolUseId: action.toolUseId,
              content: JSON.stringify({ error: 'User declined this action' }),
              isError: true,
            },
      );
    }

    const allResults: ContentBlock[] = [
      ...(action.completedResults ?? []).map((r) => ({
        type: 'tool_result' as const,
        toolUseId: r.toolUseId,
        content: r.content,
        isError: r.isError,
      })),
      ...writeResultBlocks,
    ];

    // [SPEC 20.2 D-4] Append <canonical_route> text block when any
    // swap_execute leg succeeded, gating per-leg success so a reverted
    // bundle doesn't trick the LLM into narrating a successful route.
    const canonicalRouteText = response.approved
      ? buildCanonicalRouteText(action, response)
      : null;
    if (canonicalRouteText) {
      allResults.push({ type: 'text', text: canonicalRouteText });
    }

    this.messages.push({ role: 'user', content: allResults });

    // Yield per-step outcome events before any LLM narration so the
    // PermissionCard renders success/error rows immediately on confirm,
    // not after the narration arrives.
    if (isBundle) {
      const steps = action.steps!;
      const stepResults = response.stepResults ?? [];
      const resultByToolUseId = new Map(
        stepResults.map((r) => [r.toolUseId, r]),
      );
      for (const step of steps) {
        const stepResult = resultByToolUseId.get(step.toolUseId);
        let eventResult: unknown;
        let eventIsError: boolean;
        if (!response.approved) {
          eventResult = { error: 'User declined this action' };
          eventIsError = true;
        } else if (stepResult) {
          eventResult = stepResult.result;
          eventIsError = stepResult.isError;
        } else {
          eventResult = {
            error: "Host omitted this step's execution result.",
            _hostBugMissingStepResult: true,
          };
          eventIsError = true;
        }
        yield {
          type: 'tool_result',
          toolName: step.toolName,
          toolUseId: step.toolUseId,
          result: eventResult,
          isError: eventIsError,
          source: 'llm',
        };
      }
    } else {
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
    }

    if (!response.approved) {
      yield { type: 'turn_complete', stopReason: 'end_turn' };
      return;
    }

    // [v2.0.4 / 2026-05-17] Wallet + DeFi cache invalidation on the
    // confirm-tier resume path.
    //
    // SELF-REVIEW finding: v2.0.2 added cache invalidation in
    // `step-finish.ts` for write tools, but step-finish only fires when
    // the LLM dispatches a tool through the AI SDK wrapper. On
    // confirm-tier resumes (the common path for save / borrow / swap /
    // withdraw / repay), the write NEVER re-runs through the wrapper —
    // the host executed it via the sponsored-tx flow and posts the
    // result back via resumeWithToolResult. So step-finish never fires
    // for that case and the BlockVision 60s cache stays stale for the
    // next balance_check.
    //
    // Production smoke (prior session, 2026-05-17) reproduced this
    // exactly: user withdrew 9 USDC successfully, then asked to save $6
    // USDC, and balance_check returned "$0.31 USDC" — the pre-withdraw
    // cached value. The v2.0.2 fix was wired but never executed.
    //
    // Fix: invalidate the BV portfolio + DeFi caches HERE, right before
    // narration, whenever any write leg succeeded. Bundle path includes
    // any successful step; single-write path is success-only because
    // `response.approved && !isExecutionResultFailure(executionResult)`.
    //
    // Fire-and-forget Promise — engine never blocks waiting on the
    // cache store. Errors are swallowed (cache invalidation is best-
    // effort; the next read just hits stale data, which is the bug
    // we're trying to fix anyway).
    if (this.config.walletAddress) {
      const anyWriteSucceeded = isBundle
        ? (response.stepResults ?? []).some((sr) => !sr.isError)
        : !isExecutionResultFailure(response.executionResult);
      if (anyWriteSucceeded) {
        const address = this.config.walletAddress;
        Promise.resolve()
          .then(() =>
            Promise.all([
              clearPortfolioCacheFor(address),
              clearDefiCacheFor(address),
            ]),
          )
          .catch((err) => {
            console.warn(
              '[v2/resumeWithToolResult] post-write cache invalidation failed:',
              err,
            );
          });
      }
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
    // [v2.0.5 / 2026-05-17] validateHistory runs immediately before every
    // streamText call as a SAFETY NET against orphaned tool_use /
    // tool_result blocks. v2.0.0 deleted this from QueryEngine without
    // porting; production session s_1778993279816_47a9814c835d
    // (audric, "swap 2 SUI then save" fast-path bundle) hit Anthropic's
    // strict-shape rejection on every turn after the bundle resumed,
    // because audric's fast-path dispatch loads a synthetic
    // assistant(text-only) message that the engine's resume then pushes
    // tool_result blocks against — orphaning them by Anthropic's
    // "tool_result must follow matching tool_use" contract.
    //
    // validateHistory is the single point of defense — no corrupt
    // messages reach the API regardless of how they got into the
    // session. Recovery: as soon as v2.0.5 deploys, every poisoned
    // session self-heals on its next turn because the orphaned blocks
    // are stripped before the API call.
    //
    // The host (audric) is still responsible for not introducing
    // corruption in the first place — v2.0.5 SHIPS WITH the audric
    // fast-path-bundle synth-tool_use fix so chat-time history is
    // valid by construction. validateHistory is the safety net for
    // any future host bug of this class.
    const validatedMessages = validateHistory(this.messages);

    // [SPEC_PHASE_7_DRAFT.md / v2.7.0] Branch on `memoryStore` config:
    // - When SET, prepareStep owns the system prompt (F-4 5-layer assembly:
    //   base → financial_context → memory → skill). We DO NOT pass static
    //   `system` because prepareStep's return value sets it fresh each step.
    // - When UNSET (legacy path, all CLI / MCP / pre-Phase-7 audric), the
    //   static `system: this.systemPromptString()` carries the prompt
    //   unchanged. Hosts that haven't opted into memory keep their
    //   pre-v2.7.0 wire shape — single system string, no per-step hook.
    //
    // The branch is binary by design: mixing static system + prepareStep
    // would let two sources race for layer 1 / 4, defeating F-4 ordering
    // guarantees. Hosts pick one assembly strategy and stay there.
    const useMemoryPath = this.config.memoryStore !== undefined;

    // [F-13 / 2026-05-18] Convert engine ThinkingConfig + OutputConfig →
    // Anthropic provider options so Anthropic's extended-thinking + signed-
    // thinking + effort-mode features actually fire. Phase 0 O-2 smoke
    // (BENEFITS_SPEC_v07c §"Day 0e") confirmed `thinkingHead=""` across
    // every production turn despite `thinking: { type: 'adaptive' }` in
    // config — root cause was the v2 engine never reading these config
    // fields and never calling `buildAnthropicProviderOptions`. The legacy
    // v1 `AISDKAnthropicProvider` did this at `ai-sdk-anthropic.ts:173`;
    // the v0.7a drain dropped the call entirely. Production has been
    // running without extended thinking since the v0.7a cutover.
    //
    // The cast mirrors the legacy v1 pattern — our internal helper returns
    // `{ anthropic: Record<string, unknown> } | undefined`, which is
    // structurally compatible with AI SDK's `ProviderOptions` shape but
    // TS can't prove it without the cast.
    const anthropicProviderOptions = buildAnthropicProviderOptions(
      this.config.thinking,
      this.config.outputConfig,
    );

    // [SPEC v0.7c Day 2c / D-6] Prefer the host-injected `modelInstance`
    // (e.g. `gateway('anthropic/claude-sonnet-4-5')` from web-v2) over
    // the internal Anthropic provider. When `modelInstance` is set,
    // `this.anthropic` is null and `config.model` (the legacy string
    // model id) is ignored — the injected model is fully self-describing.
    const resolvedModel: LanguageModel =
      this.config.modelInstance !== undefined
        ? this.config.modelInstance
        : // anthropic is non-null here per the constructor invariant
          // (modelInstance undefined → anthropic created or throws).
          (this.anthropic as ReturnType<typeof createAnthropic>)(
            this.config.model ?? 'claude-sonnet-4-5',
          );

    const stream = streamText({
      model: resolvedModel,
      tools,
      messages: toAISDKMessages(validatedMessages),
      // [SPEC v0.7c Day 2c / D-18] Forward host-supplied OTel telemetry
      // settings. Vercel AI Gateway dashboard consumes the resulting
      // spans automatically when the model is gateway-routed.
      ...(this.config.experimentalTelemetry !== undefined
        ? { experimental_telemetry: this.config.experimentalTelemetry }
        : {}),
      // [F-12 / 2026-05-18] buildSystemForStream() preserves cache_control
      // markers (legacy systemPromptString() flattened them away). The
      // memory path's prepareStep is responsible for its own assembly.
      ...(useMemoryPath
        ? { prepareStep: this.buildPrepareStepHook(internal) }
        : { system: this.buildSystemForStream() }),
      // [F-13] Spread Anthropic providerOptions only when present —
      // streamText accepts `providerOptions?: ProviderOptions`.
      // `buildAnthropicProviderOptions` returns the loose internal shape
      // `{ anthropic: Record<string, unknown> }` which is JSON-compatible
      // at runtime but doesn't satisfy AI SDK v6's stricter `JSONObject`-
      // indexed `ProviderOptions` type. The double-cast via `unknown`
      // bridges this without pulling in `@ai-sdk/provider-utils` as a
      // direct dep (the type isn't re-exported from `ai` v6).
      //
      // [v2.9.0 / SPEC v0.7c Day 2c++] Merge in `providerOptions.gateway`
      // from `config.gatewayProviderOptions` when present (Vercel AI
      // Gateway settings like `caching: 'auto'`, `order`, `sort`).
      ...(() => {
        const merged: Record<string, unknown> = {};
        if (anthropicProviderOptions) {
          merged.anthropic = anthropicProviderOptions.anthropic;
        }
        if (this.config.gatewayProviderOptions) {
          merged.gateway = this.config.gatewayProviderOptions;
        }
        return Object.keys(merged).length > 0
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { providerOptions: merged as unknown as any }
          : {};
      })(),
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
      const modifiableFields = getModifiableFields(tool.name, cached.input);

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
        // [D-6.1 / SPEC_SLICE_D_DRAFT.md §7 — 2026-05-18] Forward-compat
        // alias; mirrors `attemptId` 1:1 at emit time so hosts that read
        // either field interchangeably are unaffected by future Audric
        // migration to AI SDK v6's `approvalId` HITL terminology.
        approvalId: attemptId,
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

  /**
   * Legacy helper — returns the system prompt as a flattened string.
   *
   * RETAINED for back-compat with code paths that haven't migrated to the
   * typed `buildSystemForStream()` path (no in-tree callers as of F-12, but
   * external consumers may exist). Prefer `buildSystemForStream()` for any
   * code path that flows into `streamText({ system })` — see F-12.
   */
  private systemPromptString(): string | undefined {
    const sp = this.config.systemPrompt;
    if (!sp) return undefined;
    if (typeof sp === 'string') return sp;
    if (Array.isArray(sp)) {
      return sp.map((b) => b.text).join('\n\n');
    }
    return undefined;
  }

  /**
   * [F-12 / 2026-05-18] Build the `system` argument for `streamText()` while
   * **preserving Anthropic prompt-cache markers**. Delegates to the pure
   * helper in `./system-prompt-cache.ts` (which is unit-tested in
   * `./system-prompt-cache.test.ts`). See that module's header for the full
   * rationale + Anthropic cache semantics.
   */
  private buildSystemForStream(): string | SystemModelMessage[] | undefined {
    return buildSystemForStreamHelper(this.config.systemPrompt);
  }

  /**
   * [SPEC_PHASE_7_DRAFT.md / v2.7.0] Build the `prepareStep` callback for
   * `streamText`. Returns a closure that:
   *
   *   1. Fires `memoryStore.recall()` ONCE per turn at `stepNumber === 0`,
   *      caches the result on `internal.toolContext.memoryCache` for
   *      subsequent steps in the same `streamText` call (multi-step turns
   *      under `stopWhen: stepCountIs(maxTurns)` would otherwise re-recall
   *      N times — MemWal p95 470-675ms per call, so the cache is
   *      load-bearing for turn latency).
   *
   *   2. Assembles the system prompt in F-4 order from named config
   *      segments + the cached memory results:
   *
   *        1. base — `systemPromptString()` (config.systemPrompt)
   *        2. financial — `config.financialContextBlock`
   *        3. memory — `<memory_recall>` from this turn's recall
   *        4. skill — `config.skillRecipeBlock`
   *
   *      Empty segments are skipped via `.filter((l) => l.length > 0)`.
   *
   *   3. Degrades gracefully on recall failure — logs a `console.warn`,
   *      populates `memoryCache` with `{ query, results: [] }` so layer 3
   *      becomes empty (no `<memory_recall>` block), and lets the turn
   *      proceed. A memory infra outage NEVER prevents a turn.
   *
   * Only called when `this.config.memoryStore` is set — `runStream`
   * branches on the config and passes static `system` for legacy hosts.
   */
  private buildPrepareStepHook(internal: InternalContext) {
    return async ({
      stepNumber,
      messages,
    }: {
      stepNumber: number;
      messages: import('ai').ModelMessage[];
    }): Promise<{ system: string | SystemModelMessage[] }> => {
      const memoryStore = this.config.memoryStore;
      if (memoryStore && stepNumber === 0) {
        const userMessage = extractLatestUserMessage(messages);
        try {
          const records = await memoryStore.recall(userMessage, { topK: 5 });
          internal.toolContext.memoryCache = { query: userMessage, results: records };
        } catch (err) {
          // Honest degradation — log + empty cache so the turn proceeds
          // with no `<memory_recall>` block. Mirrors the same "infra
          // outage doesn't wedge the user" contract as the BlockVision
          // sticky-positive cache and NAVI MCP fallback paths.
          console.warn('[AISDKEngine] memory recall failed; continuing without:', err);
          internal.toolContext.memoryCache = { query: userMessage, results: [] };
        }
      }

      // [F-12 / 2026-05-18] Compose layers via `buildPrepareStepSystem`
      // (pure helper in `./system-prompt-cache.ts`). Preserves cache_control
      // markers when the base systemPrompt is typed SystemBlock[]; falls
      // back to the legacy joined-string path when it's a plain string.
      const baseSystem = this.buildSystemForStream();
      const volatileLayers = [
        this.config.financialContextBlock ?? '',
        buildMemoryBlock(internal.toolContext.memoryCache?.results ?? []),
        this.config.skillRecipeBlock ?? '',
      ];
      return { system: buildPrepareStepSystem(baseSystem, volatileLayers) };
    };
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
