// ---------------------------------------------------------------------------
// ai-sdk-message-conversion.ts — engine types → AI SDK v6 types
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 1. Pure converters from the engine's provider-agnostic
// shape to the AI SDK v6 ModelMessage / ToolSet / providerOptions surface.
//
// The reverse direction (TextStreamPart → ProviderEvent) lives in
// `ai-sdk-anthropic.ts` because it is provider-specific and stateful
// (block-index counters, accumulating reasoning text for the eval-summary
// parser).
//
// What needs translating
// ----------------------
// 1. `Message[]` (engine) → `ModelMessage[]` (AI SDK)
//    The engine packs tool_use + tool_result blocks INSIDE assistant /
//    user messages (Anthropic-shape). AI SDK v6 splits tool results out
//    into a separate `tool` role message. We split on conversion.
//    Reasoning blocks (with signature) become `ReasoningPart` with the
//    Anthropic signature in providerOptions.
//
// 2. `SystemPrompt` (string | SystemBlock[]) → `string`
//    AI SDK accepts a top-level `system` string. Cache-control blocks
//    are passed through via providerOptions per the Anthropic provider's
//    convention; for a top-level string system prompt we concatenate
//    the cache-able blocks and rely on the Anthropic provider to apply
//    cache breakpoints automatically (it has heuristics for this since
//    @ai-sdk/anthropic v3).
//
// 3. `ToolDefinition[]` (engine) → `ToolSet` (AI SDK)
//    Engine uses JSON-Schema-style `input_schema`; AI SDK uses
//    `inputSchema` via `jsonSchema()`. The tool body is left without
//    `execute` because the engine runs tools out-of-band via the
//    permission gate / EarlyToolDispatcher — the SDK never executes
//    on our behalf.
//
// 4. `ThinkingConfig` (engine) → providerOptions.anthropic.thinking
//    Three shapes: disabled (omit entirely), enabled (with budgetTokens),
//    adaptive (with optional display).
//
// 5. `OutputConfig` (engine) → providerOptions.anthropic.outputConfig
//    The `effort` field is forwarded; @ai-sdk/anthropic v3 accepts it
//    as a top-level provider option per the Anthropic message API.
//
// 6. `ToolChoice` (engine) → ToolChoice<TOOLS>
//    'auto' | 'any' | { type: 'tool', name } → AI SDK's union shape.
// ---------------------------------------------------------------------------

import {
  jsonSchema,
  tool,
  type AssistantModelMessage,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import type {
  ContentBlock,
  Message,
  OutputConfig,
  SystemPrompt,
  ThinkingConfig,
  ToolChoice as EngineToolChoice,
  ToolDefinition,
} from '../types.js';

type AssistantPart =
  | { type: 'text'; text: string }
  | {
      type: 'reasoning';
      text: string;
      providerOptions?: Record<string, Record<string, unknown>>;
    }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown };

type UserPart = { type: 'text'; text: string };

/**
 * Convert engine Message[] → AI SDK ModelMessage[].
 *
 * Splitting rule: every engine `user` message that contains tool_result
 * blocks is split into (optional) a `tool` message carrying the results
 * + (optional) a `user` message carrying the remaining text/blocks. This
 * matches AI SDK v6's expectation that tool results live in a dedicated
 * tool-role message right after the assistant message that issued the
 * tool calls.
 */
export function toAISDKMessages(messages: Message[]): ModelMessage[] {
  const out: ModelMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const parts: AssistantPart[] = msg.content
        .map((block) => assistantBlockToPart(block))
        .filter((p): p is AssistantPart => p !== null);
      if (parts.length === 0) continue;
      // The discriminated-union narrowing in TS picks the widest content
      // arm (UserContent) without an explicit role-pinned message; we type
      // the literal as AssistantModelMessage so the assistant-only
      // `reasoning` and `tool-call` parts are accepted.
      const assistantMsg: AssistantModelMessage = {
        role: 'assistant',
        content: parts as AssistantModelMessage['content'],
      };
      out.push(assistantMsg);
      continue;
    }

    const toolResults = msg.content.filter(
      (b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result',
    );
    const userParts: UserPart[] = msg.content
      .filter((b) => b.type !== 'tool_result')
      .map((block) => userBlockToPart(block))
      .filter((p): p is UserPart => p !== null);

    if (toolResults.length > 0) {
      out.push({
        role: 'tool',
        content: toolResults.map((r) => ({
          type: 'tool-result' as const,
          toolCallId: r.toolUseId,
          // The engine doesn't track tool name on tool_result blocks (the
          // post-write resume builds them from PendingActionStep.toolName
          // when needed). AI SDK requires `toolName` so we emit empty —
          // the Anthropic provider tolerates this; the matching tool_use
          // earlier in the conversation carries the canonical name.
          toolName: '',
          output: r.isError
            ? { type: 'error-text' as const, value: r.content }
            : { type: 'text' as const, value: r.content },
        })),
      });
    }

    if (userParts.length > 0) {
      out.push({ role: 'user', content: userParts });
    }
  }

  return out;
}

function assistantBlockToPart(block: ContentBlock): AssistantPart | null {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'thinking':
      return {
        type: 'reasoning',
        text: block.thinking,
        ...(block.signature
          ? { providerOptions: { anthropic: { signature: block.signature } } }
          : {}),
      };
    case 'redacted_thinking':
      // AI SDK's ReasoningPart doesn't have a first-class redacted variant;
      // we forward the data as a reasoning part with provider metadata so
      // the Anthropic provider re-emits the redacted_thinking block on
      // round-trip. Empty text avoids leaking the redacted bytes.
      return {
        type: 'reasoning',
        text: '',
        providerOptions: { anthropic: { redactedData: block.data } },
      };
    case 'tool_use':
      return { type: 'tool-call', toolCallId: block.id, toolName: block.name, input: block.input };
    case 'tool_result':
      // Belongs in a tool message, not an assistant message — caller
      // (toAISDKMessages) handles that split. Returning null drops it
      // here defensively.
      return null;
  }
}

function userBlockToPart(block: ContentBlock): UserPart | null {
  if (block.type === 'text') return { type: 'text', text: block.text };
  // Anything else in a user message is unexpected from the engine path
  // (tool_result was already split out; thinking/tool_use never live in
  // user messages). Drop defensively rather than throw — the engine
  // should never produce these.
  return null;
}

/**
 * Convert engine SystemPrompt to a single string. Cache-control hints in
 * SystemBlock[] are dropped at this layer — @ai-sdk/anthropic v3 applies
 * its own cache breakpoint heuristics (every text block over a threshold
 * gets cached). For finer-grained control we'd need to push the cache
 * markers through providerOptions, which @ai-sdk/anthropic v3 does NOT
 * yet expose on system messages. Tracked in v0.7b follow-up.
 */
export function toAISDKSystem(prompt: SystemPrompt): string {
  if (typeof prompt === 'string') return prompt;
  return prompt.map((b) => b.text).join('\n\n');
}

/**
 * Convert engine ToolDefinition[] → AI SDK ToolSet. The engine runs tools
 * out-of-band via the permission gate, so each AI SDK tool is declared
 * with no `execute` body — `streamText` will emit a `tool-call` event
 * carrying the parsed input, which the engine's `handleProviderEvent`
 * routes into the existing dispatch path.
 */
export function toAISDKTools(tools: ToolDefinition[]): ToolSet {
  const set: ToolSet = {};
  for (const def of tools) {
    set[def.name] = tool({
      description: def.description,
      // jsonSchema() expects JSONSchema7 from @ai-sdk/provider. Our
      // engine ToolJsonSchema is structurally compatible (object schemas
      // with `type`/`properties`/`required`); the cast bypasses the
      // strict index-signature check on `properties`.
      inputSchema: jsonSchema(def.input_schema as unknown as Parameters<typeof jsonSchema>[0]),
    });
  }
  return set;
}

/**
 * Convert engine ToolChoice → AI SDK ToolChoice<TOOLS>. AI SDK uses a
 * different shape for tool-name choices.
 */
export function toAISDKToolChoice(
  choice: EngineToolChoice | undefined,
): 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string } | undefined {
  if (!choice) return undefined;
  if (choice === 'auto') return 'auto';
  if (choice === 'any') return 'required';
  if (typeof choice === 'object' && choice.type === 'tool') {
    return { type: 'tool', toolName: choice.name };
  }
  return undefined;
}

/**
 * Build the providerOptions.anthropic bag from engine ThinkingConfig +
 * OutputConfig. Returns undefined when there's nothing to forward (so
 * we don't litter the request with empty keys).
 */
export function buildAnthropicProviderOptions(
  thinking?: ThinkingConfig,
  outputConfig?: OutputConfig,
): { anthropic: Record<string, unknown> } | undefined {
  const anthropic: Record<string, unknown> = {};

  if (thinking && thinking.type !== 'disabled') {
    if (thinking.type === 'adaptive') {
      anthropic.thinking = {
        type: 'adaptive',
        ...(thinking.display ? { display: thinking.display } : {}),
      };
    } else {
      anthropic.thinking = {
        type: 'enabled',
        budgetTokens: thinking.budgetTokens,
        ...(thinking.display ? { display: thinking.display } : {}),
      };
    }
  }

  if (outputConfig?.effort) {
    anthropic.outputConfig = { effort: outputConfig.effort };
  }

  if (Object.keys(anthropic).length === 0) return undefined;
  return { anthropic };
}
