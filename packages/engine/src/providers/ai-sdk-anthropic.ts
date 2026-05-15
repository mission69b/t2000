// ---------------------------------------------------------------------------
// ai-sdk-anthropic.ts — LLMProvider backed by Vercel AI SDK + @ai-sdk/anthropic
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 1 — drop-in replacement for the legacy hand-rolled
// `AnthropicProvider`. Implements the same `LLMProvider` interface and
// yields the same `ProviderEvent` shape, so engine.ts is unchanged.
//
// What's preserved verbatim from the legacy provider (load-bearing):
//
// 1. Retry-before-first-token: if `streamText` throws BEFORE any token has
//    yielded, retry with exponential backoff up to `maxRetries`. Once any
//    event has yielded we propagate (mid-stream retry would corrupt
//    engine state — double-counted tokens, partial messages, etc.). AI
//    SDK's built-in `maxRetries` is disabled (`maxRetries: 0` on the
//    `streamText` call) — we own the semantic.
//
// 2. `external.retry_count` telemetry — same metric name + 3 outcomes
//    (`first_try`, `retried_success`, `exhausted`) as the legacy path,
//    so ops dashboards keep working without a label change.
//
// 3. `parseEvalSummary` on `reasoning-end` (SPEC 8 v0.5.1) → populates
//    `summaryMode` + `evaluationItems` on `thinking_done`.
//
// 4. `parseProactiveMarker` on `text-end` (SPEC 9 v0.1.1) → populates
//    `proactiveMarker` on `text_done`.
//
// 5. Multi-block thinking with rising `blockIndex` — AI SDK uses opaque
//    string ids per reasoning block; we assign monotonic 0-based
//    blockIndex on first sight (mirrors the bridge layer's pattern).
//
// 6. Anthropic signed-thinking signature — read from
//    `event.providerMetadata?.anthropic?.signature` on `reasoning-end`,
//    surfaced on `thinking_done.signature`.
//
// 7. `sanitizeMessages` runs before AI SDK conversion — same orphan-
//    stripping + role-merging the legacy provider applies.
//
// 8. `friendlyErrorMessage` — uses `AI_APICallError.isInstance` where
//    available; falls back to message-string matching for non-AI-SDK
//    errors.
//
// 9. Abort signal forwarding via `streamText({ abortSignal })`.
//
// Why we don't use the bridge layer (event-bridge.ts)
// ---------------------------------------------------
// The bridge produces `EngineEvent` (the high-level engine output type).
// `LLMProvider.chat()` is contracted to yield `ProviderEvent` (the lower-
// level provider output type that engine.ts then translates). Until
// Phase 3 rewrites engine.ts to consume EngineEvent directly, the
// translation here stays at the ProviderEvent layer. The bridge keeps
// running its 41 tests as the Phase 3 prep.
// ---------------------------------------------------------------------------

import { createAnthropic } from '@ai-sdk/anthropic';
import { APICallError, streamText } from 'ai';
import { parseEvalSummary } from '../eval-summary.js';
import { parseProactiveMarker } from '../proactive-marker.js';
import { getTelemetrySink } from '../telemetry.js';
import type {
  ChatParams,
  LLMProvider,
  ProviderEvent,
  StopReason,
} from '../types.js';
import {
  buildAnthropicProviderOptions,
  toAISDKMessages,
  toAISDKSystem,
  toAISDKToolChoice,
  toAISDKTools,
} from './ai-sdk-message-conversion.js';
import { sanitizeMessages } from './message-sanitization.js';
import type { AISDKStreamEvent } from '../bridge/ai-sdk-types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 8000;

export interface AISDKAnthropicProviderConfig {
  apiKey: string;
  defaultModel?: string;
  defaultMaxTokens?: number;
  /** Max retry attempts for retriable errors (overloaded, rate-limited, network). Default 3. */
  maxRetries?: number;
  /**
   * Optional override for the underlying `LanguageModel`. Tests inject a
   * `MockLanguageModelV2` here; production uses the default `anthropic(model)`
   * constructed from the API key. The override is ONLY consulted in `chat()`
   * when no model id is provided in `ChatParams`, matching the Anthropic SDK
   * provider behaviour.
   */
  modelFactory?: (modelId: string) => Parameters<typeof streamText>[0]['model'];
}

export class AISDKAnthropicProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;
  private readonly maxRetries: number;
  private readonly modelFactory: (modelId: string) => Parameters<typeof streamText>[0]['model'];

  constructor(config: AISDKAnthropicProviderConfig) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.defaultMaxTokens = config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.modelFactory = config.modelFactory ?? defaultAnthropicModelFactory(this.apiKey);
  }

  async *chat(params: ChatParams): AsyncGenerator<ProviderEvent> {
    let attempt = 0;
    let success = false;
    try {
      while (true) {
        let yieldedAnything = false;
        const inner = this.streamOnce(params);
        try {
          for (;;) {
            const next = await inner.next();
            if (next.done) {
              success = true;
              return;
            }
            yieldedAnything = true;
            yield next.value;
          }
        } catch (err) {
          try { await inner.return?.(undefined); } catch { /* noop */ }

          if (!yieldedAnything && isRetriableError(err) && attempt < this.maxRetries) {
            attempt++;
            const delayMs = computeBackoffMs(attempt);
            console.warn(
              `[ai-sdk-anthropic] retriable error (attempt ${attempt}/${this.maxRetries}, retrying in ${delayMs}ms): ${rawErrorMessage(err)}`,
            );
            await sleep(delayMs);
            continue;
          }
          throw new Error(friendlyErrorMessage(err));
        }
      }
    } finally {
      // Symmetric with legacy AnthropicProvider — keep the same metric
      // shape (vendor=anthropic, outcome ∈ {first_try | retried_success |
      // exhausted}, attempts) so ops dashboards don't fork.
      const retried = attempt > 0;
      const outcome = !retried
        ? 'first_try'
        : success
          ? 'retried_success'
          : 'exhausted';
      try {
        getTelemetrySink().counter('external.retry_count', {
          vendor: 'anthropic',
          outcome,
          attempts: String(attempt + 1),
        });
      } catch {
        // Telemetry must never break the chat call.
      }
    }
  }

  private async *streamOnce(params: ChatParams): AsyncGenerator<ProviderEvent> {
    const sanitized = sanitizeMessages(params.messages);
    const messages = toAISDKMessages(sanitized);
    const tools = toAISDKTools(params.tools);
    const system = toAISDKSystem(params.systemPrompt);
    const toolChoice = toAISDKToolChoice(params.toolChoice);
    const providerOptions = buildAnthropicProviderOptions(params.thinking, params.outputConfig);

    const modelId = params.model ?? this.defaultModel;

    const result = streamText({
      model: this.modelFactory(modelId),
      messages,
      system,
      ...(Object.keys(tools).length > 0 ? { tools } : {}),
      ...(toolChoice ? { toolChoice } : {}),
      maxOutputTokens: params.maxTokens ?? this.defaultMaxTokens,
      ...(!providerOptions?.anthropic.thinking && params.temperature !== undefined
        ? { temperature: params.temperature }
        : {}),
      // We own retry — disable AI SDK's so the "no retry once tokens
      // yield" semantic stays correct (mid-stream retry would corrupt
      // engine state).
      maxRetries: 0,
      ...(params.signal ? { abortSignal: params.signal } : {}),
      // The Anthropic provider option bag (thinking + outputConfig) is
      // typed as `Record<string, unknown>` on our side because the engine
      // is provider-agnostic. AI SDK requires `JSONObject` here; the
      // values we forward are all JSON-serialisable by construction
      // (validated by the Anthropic provider's own Zod schema downstream).
      ...(providerOptions
        ? { providerOptions: providerOptions as unknown as Record<string, Record<string, unknown>> }
        : {}),
    } as Parameters<typeof streamText>[0]);

    const state = createStreamState();
    for await (const ev of result.fullStream as AsyncIterable<AISDKStreamEvent>) {
      for (const out of translate(ev, state)) yield out;
    }
  }
}

// ---------------------------------------------------------------------------
// Stream translation — TextStreamPart → ProviderEvent
// ---------------------------------------------------------------------------

interface StreamState {
  blockIndexById: Map<string, number>;
  nextReasoningBlockIndex: number;
  reasoningTextById: Map<string, string>;
  reasoningSignatureById: Map<string, string>;
  textBufferById: Map<string, string>;
  /**
   * Cumulative output-token count seen on `start-step` / `finish-step` so
   * we can emit incremental `usage` events per step. Currently we just
   * emit `finish.totalUsage` once at the end (matches the bridge); kept
   * here for future per-step telemetry if needed.
   */
  lastReportedOutputTokens: number;
}

function createStreamState(): StreamState {
  return {
    blockIndexById: new Map(),
    nextReasoningBlockIndex: 0,
    reasoningTextById: new Map(),
    reasoningSignatureById: new Map(),
    textBufferById: new Map(),
    lastReportedOutputTokens: 0,
  };
}

/**
 * Pure synchronous translator from a single AI SDK stream event to zero
 * or more ProviderEvent values. Mutates `state` in place — caller owns
 * the lifetime via `createStreamState()`.
 *
 * Exported for tests; production callers use the `chat()` async generator.
 */
export function translate(event: AISDKStreamEvent, state: StreamState): ProviderEvent[] {
  switch (event.type) {
    case 'start':
    case 'start-step':
    case 'finish-step':
    case 'tool-input-start':
    case 'tool-input-end':
    case 'tool-input-delta':
    case 'source':
    case 'file':
    case 'raw':
    case 'tool-output-denied':
    case 'tool-approval-request':
    case 'tool-result':
    case 'tool-error':
      // tool-result / tool-error are emitted only when AI SDK runs the tool
      // server-side (we never declare an `execute` body). Engine runs tools
      // out-of-band, so these never fire in production. Drop defensively.
      return [];

    case 'text-start': {
      state.textBufferById.set(event.id, '');
      return [];
    }

    case 'text-delta': {
      const buf = state.textBufferById.get(event.id);
      if (buf !== undefined) state.textBufferById.set(event.id, buf + event.text);
      return [{ type: 'text_delta', text: event.text }];
    }

    case 'text-end': {
      const fullText = state.textBufferById.get(event.id) ?? '';
      state.textBufferById.delete(event.id);
      const proactiveMarker = parseProactiveMarker(fullText);
      return [
        proactiveMarker
          ? { type: 'text_done', proactiveMarker }
          : { type: 'text_done' },
      ];
    }

    case 'reasoning-start': {
      state.reasoningTextById.set(event.id, '');
      if (!state.blockIndexById.has(event.id)) {
        state.blockIndexById.set(event.id, state.nextReasoningBlockIndex);
        state.nextReasoningBlockIndex += 1;
      }
      return [];
    }

    case 'reasoning-delta': {
      const blockIndex =
        state.blockIndexById.get(event.id) ?? assignReasoningIndex(state, event.id);
      const accumulated = (state.reasoningTextById.get(event.id) ?? '') + event.text;
      state.reasoningTextById.set(event.id, accumulated);
      // Capture signature opportunistically — AI SDK may surface it on
      // delta events for some providers; the canonical surface is on
      // reasoning-end's providerMetadata.
      const sig = extractAnthropicSignature(event.providerMetadata);
      if (sig) state.reasoningSignatureById.set(event.id, sig);
      return [{ type: 'thinking_delta', text: event.text, blockIndex }];
    }

    case 'reasoning-end': {
      const blockIndex =
        state.blockIndexById.get(event.id) ?? assignReasoningIndex(state, event.id);
      const fullText = state.reasoningTextById.get(event.id) ?? '';
      const signatureFromEnd = extractAnthropicSignature(event.providerMetadata);
      const signature = signatureFromEnd ?? state.reasoningSignatureById.get(event.id) ?? '';
      const redactedData = extractAnthropicRedactedData(event.providerMetadata);
      state.reasoningTextById.delete(event.id);
      state.reasoningSignatureById.delete(event.id);

      // Redacted thinking blocks (safety-flagged content) come back from
      // Anthropic with `providerMetadata.anthropic.redactedData` set and
      // empty text. We must round-trip the redacted payload faithfully —
      // dropping it breaks the next turn's signed-thinking verification.
      // The legacy AnthropicProvider emits `redacted_thinking` (NOT
      // `thinking_done`) for these; mirror that exactly so engine.ts
      // re-pushes them as `redacted_thinking` content blocks.
      if (redactedData !== undefined) {
        return [{ type: 'redacted_thinking', data: redactedData }];
      }

      const evalParse = parseEvalSummary(fullText);
      const ev: ProviderEvent = {
        type: 'thinking_done',
        blockIndex,
        thinking: fullText,
        signature,
        ...(evalParse !== null
          ? { summaryMode: evalParse.summaryMode, evaluationItems: evalParse.evaluationItems }
          : {}),
      };
      return [ev];
    }

    case 'tool-call':
      // v6 tool-call carries the FULL parsed input. Emit tool_use_start
      // (engine no-op but kept for parity with the legacy provider's
      // event sequence) followed by tool_use_done with the input. The
      // engine reads tool_use_done to dispatch.
      return [
        { type: 'tool_use_start', id: event.toolCallId, name: event.toolName },
        { type: 'tool_use_done', id: event.toolCallId, name: event.toolName, input: event.input },
      ];

    case 'finish': {
      const out: ProviderEvent[] = [];
      const usage = toUsageEvent(event.totalUsage);
      if (usage) out.push(usage);
      out.push({ type: 'stop', reason: mapFinishReason(event.finishReason) });
      return out;
    }

    case 'error':
      throw normaliseError(event.error);

    case 'abort':
      throw new Error(
        event.reason
          ? `AI SDK stream aborted: ${event.reason}`
          : 'AI SDK stream aborted',
      );

    default:
      return [];
  }
}

function assignReasoningIndex(state: StreamState, id: string): number {
  const idx = state.nextReasoningBlockIndex;
  state.nextReasoningBlockIndex += 1;
  state.blockIndexById.set(id, idx);
  return idx;
}

function extractAnthropicSignature(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const anthropic = (metadata as Record<string, unknown>).anthropic;
  if (!anthropic || typeof anthropic !== 'object') return undefined;
  const sig = (anthropic as Record<string, unknown>).signature;
  return typeof sig === 'string' ? sig : undefined;
}

/**
 * Extract a redacted-thinking payload from Anthropic provider metadata.
 *
 * @ai-sdk/anthropic v3 surfaces redacted thinking blocks as reasoning
 * parts with `providerOptions.anthropic.redactedData` set and empty
 * text. Returning the raw bytes here lets the caller emit a
 * `redacted_thinking` ProviderEvent that round-trips correctly through
 * engine.ts's conversation history.
 */
function extractAnthropicRedactedData(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const anthropic = (metadata as Record<string, unknown>).anthropic;
  if (!anthropic || typeof anthropic !== 'object') return undefined;
  const data = (anthropic as Record<string, unknown>).redactedData;
  return typeof data === 'string' ? data : undefined;
}

function mapFinishReason(reason: string | undefined): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool-calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'error':
    case 'content-filter':
      return 'error';
    case 'other':
    default:
      return 'end_turn';
  }
}

function toUsageEvent(
  usage: unknown,
): Extract<ProviderEvent, { type: 'usage' }> | null {
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  };
  const inputTokens = u.inputTokens ?? 0;
  const outputTokens = u.outputTokens ?? 0;
  if (inputTokens === 0 && outputTokens === 0 && !u.inputTokenDetails) return null;
  const ev: Extract<ProviderEvent, { type: 'usage' }> = {
    type: 'usage',
    inputTokens,
    outputTokens,
  };
  if (u.inputTokenDetails?.cacheReadTokens !== undefined) {
    ev.cacheReadTokens = u.inputTokenDetails.cacheReadTokens;
  }
  if (u.inputTokenDetails?.cacheWriteTokens !== undefined) {
    ev.cacheWriteTokens = u.inputTokenDetails.cacheWriteTokens;
  }
  return ev;
}

function normaliseError(raw: unknown): Error {
  if (raw instanceof Error) return raw;
  if (typeof raw === 'string') return new Error(raw);
  if (raw && typeof raw === 'object') {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === 'string') return new Error(message);
    try {
      return new Error(JSON.stringify(raw));
    } catch {
      return new Error('AI SDK stream error (non-serialisable)');
    }
  }
  return new Error('AI SDK stream error');
}

// ---------------------------------------------------------------------------
// Default model factory — memoised so multiple chat() calls reuse the same
// `createAnthropic` instance (HTTP keep-alive, internal caches).
// ---------------------------------------------------------------------------

function defaultAnthropicModelFactory(
  apiKey: string,
): (modelId: string) => Parameters<typeof streamText>[0]['model'] {
  const provider = createAnthropic({ apiKey });
  return (modelId: string) => provider(modelId);
}

// ---------------------------------------------------------------------------
// Error classification + retry helpers
// ---------------------------------------------------------------------------

export const _internal = {
  isRetriableError: (err: unknown) => isRetriableError(err),
  friendlyErrorMessage: (err: unknown) => friendlyErrorMessage(err),
  computeBackoffMs: (attempt: number) => computeBackoffMs(attempt),
  translate,
  createStreamState,
};

function isRetriableError(err: unknown): boolean {
  if (!err) return false;

  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    if (status === 529 || status === 408) return true;
    if (status === 502 || status === 503 || status === 504) return true;
    if (status === 429) return true;
    return false;
  }

  const msg = rawErrorMessage(err).toLowerCase();
  if (
    msg.includes('overloaded_error') ||
    msg.includes('"overloaded"') ||
    msg.includes('rate_limit_error') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('network error')
  ) {
    return true;
  }

  return false;
}

function rawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function friendlyErrorMessage(err: unknown): string {
  const msg = rawErrorMessage(err).toLowerCase();
  const isApiCallError = APICallError.isInstance(err);
  const status = isApiCallError ? err.statusCode : undefined;

  if (
    msg.includes('overloaded_error') ||
    msg.includes('"overloaded"') ||
    status === 529
  ) {
    return "Anthropic's servers are over capacity right now. Please try again in 30 seconds.";
  }
  if (msg.includes('rate_limit_error') || status === 429) {
    return 'Too many requests in a short window. Please wait a moment and try again.';
  }
  if (
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('network error')
  ) {
    return "Couldn't reach Anthropic. Check your connection and try again.";
  }
  if (status === 401) {
    return 'Authentication failed. Please check the Anthropic API key configuration.';
  }
  if (status === 400) {
    return 'The request was rejected by Anthropic. This is likely a bug — please retry, and if it persists, contact support.';
  }
  if (status !== undefined && status >= 500) {
    return 'Anthropic returned a server error. Please try again in a moment.';
  }

  return 'Something went wrong. Please try again.';
}

function computeBackoffMs(attempt: number): number {
  const base = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
