import type { Message, ContentBlock } from './types.js';
import { microcompact } from './compact/microcompact.js';

// Rough token estimation: ~4 chars per token (conservative for English + JSON)
const CHARS_PER_TOKEN = 4;

// Default context window for Sonnet 4.6
const DEFAULT_CONTEXT_LIMIT = 200_000;

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** Rough token count for a message array. */
export function estimateTokens(messages: Message[]): number {
  let chars = 0;
  for (const msg of messages) {
    for (const block of msg.content) {
      chars += blockCharCount(block);
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function blockCharCount(block: ContentBlock): number {
  switch (block.type) {
    case 'text':
      return block.text.length;
    case 'thinking':
      return block.thinking.length;
    case 'redacted_thinking':
      return block.data.length;
    case 'tool_use':
      return block.name.length + JSON.stringify(block.input).length;
    case 'tool_result':
      return block.content.length;
  }
}

// ---------------------------------------------------------------------------
// Message compaction
// ---------------------------------------------------------------------------

export interface CompactOptions {
  /** Max token budget for the conversation. Default 100_000. */
  maxTokens?: number;
  /** Number of recent messages to always keep uncompacted. Default 8. */
  keepRecentCount?: number;
  /** System prompt token estimate (subtracted from budget). Default 500. */
  systemPromptTokens?: number;
  /** LLM-based summarizer for old turns. When provided, replaces old turns with a summary. */
  summarizer?: (messages: Message[]) => Promise<string>;
}

// ---------------------------------------------------------------------------
// ContextBudget — tracks cumulative token usage and signals compaction
// ---------------------------------------------------------------------------

export interface ContextBudgetConfig {
  /** Total context window size in tokens. Default 200_000 (Sonnet 4.6). */
  contextLimit?: number;
  /** Trigger compaction at this fraction of contextLimit. Default 0.85. */
  compactThreshold?: number;
  /** Emit a warning at this fraction of contextLimit. Default 0.70. */
  warnThreshold?: number;
}

export class ContextBudget {
  private estimatedTokens = 0;
  private readonly contextLimit: number;
  private readonly compactThreshold: number;
  private readonly warnThreshold: number;

  constructor(config: ContextBudgetConfig = {}) {
    this.contextLimit = config.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    this.compactThreshold = config.compactThreshold ?? 0.85;
    this.warnThreshold = config.warnThreshold ?? 0.70;
  }

  /** Update with actual input_tokens from the API usage event. */
  update(inputTokens: number): void {
    this.estimatedTokens = inputTokens;
  }

  /** True when the session should be compacted (at 85% of context limit). */
  shouldCompact(): boolean {
    return this.estimatedTokens >= this.contextLimit * this.compactThreshold;
  }

  /** True when nearing the limit (at 70% of context limit). */
  shouldWarn(): boolean {
    return this.estimatedTokens >= this.contextLimit * this.warnThreshold;
  }

  /** Current token count. */
  get tokens(): number {
    return this.estimatedTokens;
  }

  /** Remaining tokens before compaction triggers. */
  get remaining(): number {
    return Math.max(0, Math.floor(this.contextLimit * this.compactThreshold) - this.estimatedTokens);
  }

  /** Usage ratio (0..1). */
  get usage(): number {
    return this.estimatedTokens / this.contextLimit;
  }

  reset(): void {
    this.estimatedTokens = 0;
  }
}

/**
 * Compact a conversation that exceeds the token budget.
 *
 * Strategy:
 * 1. Always preserve the most recent `keepRecentCount` messages (the active context).
 * 2. If an LLM `summarizer` is provided, summarize old turns into a brief recap and
 *    replace them with a synthetic summary turn pair.
 * 3. For older messages, summarise tool_result content to a brief one-liner.
 * 4. If still over budget, drop the oldest messages (keeping the first user message
 *    for context continuity).
 *
 * Returns a new array — does not mutate the input.
 */
export async function compactMessages(
  messages: readonly Message[],
  opts: CompactOptions = {},
): Promise<Message[]> {
  const maxTokens = opts.maxTokens ?? 100_000;
  const keepRecent = opts.keepRecentCount ?? 8;
  const systemTokens = opts.systemPromptTokens ?? 500;
  const budget = maxTokens - systemTokens;

  if (messages.length === 0) return [];

  // Phase -1: zero-cost deduplication of identical tool calls
  const deduped = microcompact(messages);

  const mutable = deduped.map((m) => ({
    role: m.role,
    content: m.content.map((b) => ({ ...b })),
  })) as Message[];

  if (estimateTokens(mutable) <= budget) return mutable;

  const splitIdx = Math.max(0, mutable.length - keepRecent);
  const oldMessages = mutable.slice(0, splitIdx);
  const recent = mutable.slice(splitIdx);

  // Phase 0: If summarizer is provided, try LLM-based summarization of old turns
  if (opts.summarizer && oldMessages.length > 0) {
    const strippedOld = stripThinkingBlocks(oldMessages);
    try {
      const summary = await opts.summarizer(strippedOld);
      const summaryMessages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: `[Session summary: ${summary}]` }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Understood. I have the context from our earlier conversation.' }] },
      ];
      const withSummary = [...summaryMessages, ...recent];
      if (estimateTokens(withSummary) <= budget) return sanitizeMessages(withSummary);
    } catch {
      // Summarizer failed — fall through to truncation strategy
    }
  }

  // Phase 1: summarise tool_result blocks in older messages
  for (let i = 0; i < splitIdx; i++) {
    mutable[i].content = mutable[i].content.map((block) => {
      if (block.type === 'tool_result' && block.content.length > 200) {
        return {
          ...block,
          content: truncateToolResult(block.content),
        };
      }
      return block;
    });
  }

  // Strip thinking blocks from old messages (they don't aid context continuity)
  for (let i = 0; i < splitIdx; i++) {
    mutable[i].content = mutable[i].content.filter(
      (b) => b.type !== 'thinking' && b.type !== 'redacted_thinking',
    );
  }

  if (estimateTokens(mutable) <= budget) return mutable;

  // Phase 2: drop old messages from the middle, keep first + recent
  if (splitIdx <= 1) {
    // All messages are recent (or only the first message is "old") — skip middle-drop
    return sanitizeMessages(mutable);
  }

  const first = mutable[0];
  const recentFromMutable = mutable.slice(splitIdx);
  const oldSection = mutable.slice(1, splitIdx);

  while (oldSection.length > 0 && estimateTokens([first, ...oldSection, ...recentFromMutable]) > budget) {
    oldSection.shift();
  }

  const compacted = [first, ...oldSection, ...recentFromMutable];

  // Phase 3: if still over budget (very long recent section), truncate tool results in recent
  if (estimateTokens(compacted) > budget) {
    for (const msg of compacted) {
      msg.content = msg.content.map((block) => {
        if (block.type === 'tool_result' && block.content.length > 100) {
          return { ...block, content: truncateToolResult(block.content) };
        }
        return block;
      });
    }
  }

  return sanitizeMessages(compacted);
}

/**
 * Strip thinking and redacted_thinking blocks from messages.
 * Used before summarization — thinking blocks don't help the summarizer.
 */
function stripThinkingBlocks(messages: Message[]): Message[] {
  return messages.map((m) => ({
    ...m,
    content: m.content.filter(
      (b) => b.type !== 'thinking' && b.type !== 'redacted_thinking',
    ),
  })).filter((m) => m.content.length > 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove orphaned tool_use / tool_result blocks that lost their pair
 * during compaction. Anthropic requires every tool_result to match a
 * preceding tool_use and vice versa.
 */
function sanitizeMessages(messages: Message[]): Message[] {
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === 'tool_use') toolUseIds.add(block.id);
      if (block.type === 'tool_result') toolResultIds.add(block.toolUseId);
    }
  }

  return messages
    .map((msg) => {
      const filtered = msg.content.filter((block) => {
        if (block.type === 'tool_result') return toolUseIds.has(block.toolUseId);
        if (block.type === 'tool_use') return toolResultIds.has(block.id);
        return true;
      });
      if (filtered.length === 0) return null;
      return { ...msg, content: filtered };
    })
    .filter((m): m is Message => m !== null);
}

function truncateToolResult(content: string): string {
  try {
    const parsed = JSON.parse(content);

    if (parsed.error) {
      return JSON.stringify({ error: parsed.error });
    }

    // Keep just the top-level keys with truncated values
    if (typeof parsed === 'object' && parsed !== null) {
      const summary: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' || typeof value === 'boolean') {
          summary[key] = value;
        } else if (typeof value === 'string') {
          summary[key] = value.length > 50 ? value.slice(0, 50) + '…' : value;
        } else if (Array.isArray(value)) {
          summary[key] = `[${value.length} items]`;
        } else {
          summary[key] = '{…}';
        }
      }
      return JSON.stringify(summary);
    }

    return content.slice(0, 100);
  } catch {
    return content.slice(0, 100);
  }
}
