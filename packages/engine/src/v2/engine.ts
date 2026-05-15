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
  type ModelMessage,
  type ToolSet,
  type StopCondition,
} from 'ai';
import type {
  EngineEvent,
  EngineConfig,
  HarnessShape,
  Message,
  Tool as LegacyTool,
  ToolContext,
} from '../types.js';
import { toAISDKTools } from './tool-wrapper.js';
import { buildToolContext } from './tool-context.js';
import type { InternalContext } from './internal-context.js';
import { bridgeAISDKStream } from './event-translation.js';
import { buildStepFinishHandler, type StepFinishMutableState } from './step-finish.js';
import { createGuardRunnerState, type GuardRunnerState } from '../guards.js';
import { findTool } from '../tool.js';
import { CostTracker, type CostSnapshot } from '../cost.js';

// ---------------------------------------------------------------------------
// AISDKEngine config — subset of legacy EngineConfig that's still needed
// ---------------------------------------------------------------------------
//
// Fields removed vs legacy EngineConfig:
//   - `provider`: hardcoded to @ai-sdk/anthropic (single-provider for now;
//     multi-provider via LLMProvider abstraction is replaced by AI SDK's
//     own provider plug-in pattern when needed).
//   - `mcpManager`: AI SDK has native createMCPClient; MCP tools register
//     into the same `tools` object as native tools.
//
// Fields kept verbatim from legacy EngineConfig:
//   - All the engine-specific config (guards, recipes, permissionConfig,
//     priceCache, contacts, postWriteRefresh, onAutoExecuted, etc.)
// ---------------------------------------------------------------------------
export interface AISDKEngineConfig
  extends Omit<EngineConfig, 'provider' | 'mcpManager'> {
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

    const stream = streamText({
      model: this.anthropic(this.config.model ?? 'claude-sonnet-4-5'),
      tools,
      messages: this.toAISDKMessages(this.messages),
      system: this.systemPromptString(),
      experimental_context: internal,
      stopWhen: stepCountIs(this.config.maxTurns ?? 10) as StopCondition<typeof tools>,
      abortSignal: this.abortController.signal,
      onStepFinish,
      onError: (err) => {
        // Day 3+ may surface this through friendlyErrorMessage helpers.
        console.error('[AISDKEngine] streamText error:', err);
      },
    });

    // Day 3: replace Day 1 minimal translatePart with the R8 bridge —
    // covers every AI SDK event type (tool-call, tool-result, tool-error,
    // reasoning-start/delta/end, finish with totalUsage, abort, error).
    // The bridge owns block-index counters + eval-summary parsing so
    // multi-block thinking + signed signatures flow through unchanged.
    //
    // Day 10-12: tap `usage` events as they pass through so getUsage()
    // returns cumulative token totals across every submitMessage call —
    // mirrors legacy QueryEngine's CostTracker semantics. Events are
    // forwarded unchanged; the tap is read-only.
    for await (const event of bridgeAISDKStream(stream.fullStream)) {
      if (event.type === 'usage') {
        this.costTracker.track(
          event.inputTokens,
          event.outputTokens,
          event.cacheReadTokens,
          event.cacheWriteTokens,
        );
      }
      yield event;
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

  private toAISDKMessages(messages: Message[]): ModelMessage[] {
    // Day 2: full conversion via existing
    // ai-sdk-message-conversion.ts (Phase 1 work). For Day 1
    // stub, only handle text-only messages — enough for the smoke test.
    return messages
      .filter((m): m is Message & { content: Message['content'] } => true)
      .map((m) => {
        const text = Array.isArray(m.content)
          ? m.content
              .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
              .map((b) => b.text)
              .join('')
          : '';
        return { role: m.role, content: text } as ModelMessage;
      })
      .filter((m) => typeof (m as { content: unknown }).content === 'string' && (m as { content: string }).content.length > 0);
  }
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
