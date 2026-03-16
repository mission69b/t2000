import type { ChatMessage } from './llm/types.js';

const ESTIMATED_TOKENS_PER_CHAR = 0.25;
const MAX_TOKEN_BUDGET = 20_000;
const COMPACTION_THRESHOLD = 0.75;
const MIN_RECENT_PAIRS = 3;

export class ContextManager {
  private history: ChatMessage[] = [];

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  addMessage(message: ChatMessage): void {
    this.history.push(message);
    this.maybeCompact();
  }

  addMessages(messages: ChatMessage[]): void {
    this.history.push(...messages);
    this.maybeCompact();
  }

  clear(): void {
    this.history = [];
  }

  getEstimatedTokens(): number {
    const totalChars = this.history.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars * ESTIMATED_TOKENS_PER_CHAR);
  }

  private maybeCompact(): void {
    const tokens = this.getEstimatedTokens();
    if (tokens < MAX_TOKEN_BUDGET * COMPACTION_THRESHOLD) return;

    // Drop tool call/result pairs first (they're verbose)
    const toolResultIndices = new Set<number>();
    for (let i = 0; i < this.history.length; i++) {
      if (this.history[i].role === 'tool') toolResultIndices.add(i);
      if (this.history[i].role === 'assistant' && this.history[i].toolCalls?.length) {
        toolResultIndices.add(i);
      }
    }

    // Keep the last MIN_RECENT_PAIRS user/assistant exchanges
    const recentPairStart = this.findRecentPairStart();

    const compacted: ChatMessage[] = [];
    for (let i = 0; i < this.history.length; i++) {
      if (i >= recentPairStart) {
        compacted.push(this.history[i]);
      } else if (!toolResultIndices.has(i)) {
        compacted.push(this.history[i]);
      }
    }

    // If still too large, keep only recent pairs
    if (this.estimateTokens(compacted) > MAX_TOKEN_BUDGET * COMPACTION_THRESHOLD) {
      this.history = this.history.slice(recentPairStart);
    } else {
      this.history = compacted;
    }
  }

  private findRecentPairStart(): number {
    let pairsFound = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === 'user') {
        pairsFound++;
        if (pairsFound >= MIN_RECENT_PAIRS) return i;
      }
    }
    return 0;
  }

  private estimateTokens(messages: ChatMessage[]): number {
    return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) * ESTIMATED_TOKENS_PER_CHAR);
  }
}
