import type { Message, ContentBlock } from './types.js';

// Rough token estimation: ~4 chars per token (conservative for English + JSON)
const CHARS_PER_TOKEN = 4;

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
  /** Number of recent messages to always keep uncompacted. Default 6. */
  keepRecentCount?: number;
  /** System prompt token estimate (subtracted from budget). Default 500. */
  systemPromptTokens?: number;
}

/**
 * Compact a conversation that exceeds the token budget.
 *
 * Strategy:
 * 1. Always preserve the most recent `keepRecentCount` messages (the active context).
 * 2. For older messages, summarise tool_result content to a brief one-liner.
 * 3. If still over budget, drop the oldest messages (keeping the first user message
 *    for context continuity).
 *
 * Returns a new array — does not mutate the input.
 */
export function compactMessages(
  messages: readonly Message[],
  opts: CompactOptions = {},
): Message[] {
  const maxTokens = opts.maxTokens ?? 100_000;
  const keepRecent = opts.keepRecentCount ?? 6;
  const systemTokens = opts.systemPromptTokens ?? 500;
  const budget = maxTokens - systemTokens;

  if (messages.length === 0) return [];

  const mutable = messages.map((m) => ({
    role: m.role,
    content: m.content.map((b) => ({ ...b })),
  })) as Message[];

  // If already under budget, return as-is
  if (estimateTokens(mutable) <= budget) return mutable;

  // Phase 1: summarise tool_result blocks in older messages
  const splitIdx = Math.max(0, mutable.length - keepRecent);

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

  if (estimateTokens(mutable) <= budget) return mutable;

  // Phase 2: drop old messages from the middle, keep first + recent
  const first = mutable[0];
  const recent = mutable.slice(splitIdx);

  // Keep dropping from the start of the old section until under budget
  const oldSection = mutable.slice(1, splitIdx);

  while (oldSection.length > 0 && estimateTokens([first, ...oldSection, ...recent]) > budget) {
    oldSection.shift();
  }

  const compacted = [first, ...oldSection, ...recent];

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
