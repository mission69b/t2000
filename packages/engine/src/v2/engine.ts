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
} from '../types.js';
import { toAISDKTools } from './tool-wrapper.js';
import { buildToolContext } from './tool-context.js';

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

  constructor(config: AISDKEngineConfig) {
    this.config = config;
    this.anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
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
    // experimental_context carries ToolContext (built per turn) into
    // each tool's execute() — same threading as legacy engine's
    // ToolContext plumbing, just routed through AI SDK's native hook.
    const tools = toAISDKTools(this.config.tools ?? []) as ToolSet;
    const ctx = buildToolContext(this.config, {
      signal: this.abortController.signal,
    });

    const stream = streamText({
      model: this.anthropic(this.config.model ?? 'claude-sonnet-4-5'),
      tools,
      messages: this.toAISDKMessages(this.messages),
      system: this.systemPromptString(),
      experimental_context: ctx,
      stopWhen: stepCountIs(this.config.maxTurns ?? 10) as StopCondition<typeof tools>,
      abortSignal: this.abortController.signal,
      onError: (err) => {
        // Day 3 wires this through friendlyErrorMessage helpers.
        console.error('[AISDKEngine] streamText error:', err);
      },
    });

    // Translate AI SDK TextStreamPart → legacy EngineEvent so audric's
    // existing event consumer doesn't break. Day 10-12 may swap audric
    // to consume UIMessageChunk natively, dropping this translation.
    for await (const part of stream.fullStream) {
      const events = this.translatePart(part);
      for (const ev of events) {
        yield ev;
      }
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

  private translatePart(
    part: import('ai').TextStreamPart<ToolSet>,
  ): EngineEvent[] {
    // Day 1 minimal translation. Day 2 expands to cover all event
    // types via the existing R8 bridge (packages/engine/src/bridge/).
    switch (part.type) {
      case 'text-delta':
        return [{ type: 'text_delta', text: part.text }];
      case 'finish':
        return [{ type: 'turn_complete', stopReason: 'end_turn' }];
      case 'error':
        return [
          {
            type: 'error',
            error:
              part.error instanceof Error ? part.error : new Error(String(part.error)),
          },
        ];
      default:
        // Day 2: text-end, reasoning-start/delta/end, tool-call,
        // tool-result, tool-approval-request, finish-step, abort, etc.
        return [];
    }
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
