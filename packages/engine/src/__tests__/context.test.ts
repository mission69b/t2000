import { describe, it, expect } from 'vitest';
import { estimateTokens, compactMessages, ContextBudget } from '../context.js';
import type { Message } from '../types.js';

function textMsg(role: 'user' | 'assistant', text: string): Message {
  return { role, content: [{ type: 'text', text }] };
}

function toolUseMsg(id: string, name: string, input: unknown): Message {
  return { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] };
}

function toolResultMsg(toolUseId: string, content: string): Message {
  return { role: 'user', content: [{ type: 'tool_result', toolUseId, content, isError: false }] };
}

describe('estimateTokens', () => {
  it('estimates tokens from text length', () => {
    const messages = [textMsg('user', 'Hello world')]; // 11 chars → ~3 tokens
    const tokens = estimateTokens(messages);
    expect(tokens).toBe(3);
  });

  it('estimates tokens for tool results', () => {
    const content = JSON.stringify({ balance: 100, savings: 50 }); // ~32 chars
    const messages = [toolResultMsg('tc-1', content)];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it('returns 0 for empty messages', () => {
    expect(estimateTokens([])).toBe(0);
  });
});

describe('compactMessages', () => {
  it('returns messages unchanged when under budget', async () => {
    const messages = [
      textMsg('user', 'Hello'),
      textMsg('assistant', 'Hi there'),
    ];
    const compacted = await compactMessages(messages, { maxTokens: 10000 });
    expect(compacted).toEqual(messages);
  });

  it('does not mutate the original array', async () => {
    const messages: Message[] = [
      textMsg('user', 'Hello'),
      textMsg('assistant', 'Hi'),
    ];
    const original = JSON.stringify(messages);
    await compactMessages(messages, { maxTokens: 1 });
    expect(JSON.stringify(messages)).toBe(original);
  });

  it('summarises long tool_result content in older messages', async () => {
    const longResult = JSON.stringify({
      positions: Array.from({ length: 50 }, (_, i) => ({
        protocol: 'navi',
        asset: 'USDC',
        amount: i * 100,
        apy: 0.05,
      })),
      total: 5000,
    });

    const messages: Message[] = [
      textMsg('user', 'Check positions'),
      toolResultMsg('tc-1', longResult),
      textMsg('assistant', 'Here are your positions...'),
      textMsg('user', 'What about savings?'),
      textMsg('assistant', 'Your savings...'),
      textMsg('user', 'Latest question'),
    ];

    const compacted = await compactMessages(messages, {
      maxTokens: 200,
      keepRecentCount: 3,
    });

    const toolResult = compacted.find((m) =>
      m.content.some((b) => b.type === 'tool_result'),
    );
    if (toolResult) {
      const block = toolResult.content.find((b) => b.type === 'tool_result');
      if (block?.type === 'tool_result') {
        expect(block.content.length).toBeLessThan(longResult.length);
      }
    }
  });

  it('drops old messages when summarisation is insufficient', async () => {
    const messages: Message[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(textMsg('user', `Message ${i} ${'x'.repeat(500)}`));
      messages.push(textMsg('assistant', `Response ${i} ${'y'.repeat(500)}`));
    }
    messages.push(textMsg('user', 'Recent question'));
    messages.push(textMsg('assistant', 'Recent answer'));

    const compacted = await compactMessages(messages, {
      maxTokens: 500,
      keepRecentCount: 4,
    });

    expect(compacted.length).toBeLessThan(messages.length);
    const firstBlock = compacted[0].content[0];
    expect(firstBlock.type).toBe('text');
    if (firstBlock.type === 'text') {
      expect(firstBlock.text).toContain('Message 0');
    }
    const lastBlock = compacted[compacted.length - 1].content[0];
    expect(lastBlock.type).toBe('text');
    if (lastBlock.type === 'text') {
      expect(lastBlock.text).toBe('Recent answer');
    }
  });

  it('handles empty message array', async () => {
    expect(await compactMessages([])).toEqual([]);
  });

  it('removes orphaned tool_result blocks after dropping assistant messages', async () => {
    const messages: Message[] = [
      textMsg('user', 'Check balance'),
      toolUseMsg('tc-1', 'balance_check', {}),
      toolResultMsg('tc-1', JSON.stringify({ available: 100 })),
      textMsg('assistant', 'Your balance is $100'),
      textMsg('user', `Question ${'x'.repeat(800)}`),
      textMsg('assistant', `Answer ${'y'.repeat(800)}`),
      textMsg('user', 'Latest'),
      textMsg('assistant', 'Reply'),
    ];

    const compacted = await compactMessages(messages, {
      maxTokens: 300,
      keepRecentCount: 2,
    });

    const hasToolResult = compacted.some((m) =>
      m.content.some((b) => b.type === 'tool_result'),
    );
    const hasToolUse = compacted.some((m) =>
      m.content.some((b) => b.type === 'tool_use'),
    );
    expect(hasToolResult).toBe(hasToolUse);
  });

  it('removes orphaned tool_use blocks after dropping tool_result messages', async () => {
    const messages: Message[] = [
      textMsg('user', 'Do something'),
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check' },
          { type: 'tool_use', id: 'tc-1', name: 'balance_check', input: {} },
        ],
      },
      toolResultMsg('tc-1', JSON.stringify({ available: 50 })),
      textMsg('assistant', 'Done'),
    ];

    const compacted = await compactMessages(messages, {
      maxTokens: 30,
      keepRecentCount: 1,
    });

    const allToolUseIds = new Set<string>();
    const allToolResultIds = new Set<string>();
    for (const msg of compacted) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') allToolUseIds.add(block.id);
        if (block.type === 'tool_result') allToolResultIds.add(block.toolUseId);
      }
    }

    for (const id of allToolUseIds) {
      expect(allToolResultIds.has(id)).toBe(true);
    }
    for (const id of allToolResultIds) {
      expect(allToolUseIds.has(id)).toBe(true);
    }
  });

  it('preserves recent messages even when heavily compacting', async () => {
    const messages: Message[] = [
      textMsg('user', 'First'),
      textMsg('assistant', 'First reply'),
      textMsg('user', 'Second'),
      textMsg('assistant', 'Second reply'),
      textMsg('user', 'Third'),
      textMsg('assistant', 'Third reply'),
    ];

    const compacted = await compactMessages(messages, {
      maxTokens: 50,
      keepRecentCount: 4,
    });

    const lastFour = compacted.slice(-4);
    expect(lastFour.map((m) => {
      const b = m.content[0];
      return b.type === 'text' ? b.text : '';
    })).toEqual(['Second', 'Second reply', 'Third', 'Third reply']);
  });

  it('uses LLM summarizer when provided', async () => {
    const messages: Message[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(textMsg('user', `Message ${i} ${'x'.repeat(500)}`));
      messages.push(textMsg('assistant', `Response ${i} ${'y'.repeat(500)}`));
    }
    messages.push(textMsg('user', 'Recent question'));
    messages.push(textMsg('assistant', 'Recent answer'));

    const summarizer = async () => 'User discussed their balance and savings over 20 turns.';

    const compacted = await compactMessages(messages, {
      maxTokens: 5000,
      keepRecentCount: 2,
      summarizer,
    });

    const firstBlock = compacted[0].content[0];
    expect(firstBlock.type).toBe('text');
    if (firstBlock.type === 'text') {
      expect(firstBlock.text).toContain('Session summary');
    }
    // Summary pair + 2 recent = 4 messages total
    expect(compacted.length).toBe(4);
  });

  it('falls back to truncation when summarizer throws', async () => {
    const messages: Message[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(textMsg('user', `Message ${i} ${'x'.repeat(500)}`));
      messages.push(textMsg('assistant', `Response ${i} ${'y'.repeat(500)}`));
    }
    messages.push(textMsg('user', 'Recent question'));
    messages.push(textMsg('assistant', 'Recent answer'));

    const summarizer = async () => { throw new Error('LLM unavailable'); };

    const compacted = await compactMessages(messages, {
      maxTokens: 500,
      keepRecentCount: 4,
      summarizer,
    });

    expect(compacted.length).toBeLessThan(messages.length);
    expect(compacted.length).toBeGreaterThan(0);
  });
});

describe('ContextBudget', () => {
  it('tracks token usage', () => {
    const budget = new ContextBudget({ contextLimit: 1000 });
    expect(budget.tokens).toBe(0);
    budget.update(500);
    expect(budget.tokens).toBe(500);
  });

  it('signals compaction at 85% threshold', () => {
    const budget = new ContextBudget({ contextLimit: 1000 });
    budget.update(849);
    expect(budget.shouldCompact()).toBe(false);
    budget.update(850);
    expect(budget.shouldCompact()).toBe(true);
  });

  it('signals warning at 70% threshold', () => {
    const budget = new ContextBudget({ contextLimit: 1000 });
    budget.update(699);
    expect(budget.shouldWarn()).toBe(false);
    budget.update(700);
    expect(budget.shouldWarn()).toBe(true);
  });

  it('reports remaining tokens', () => {
    const budget = new ContextBudget({ contextLimit: 1000 });
    budget.update(500);
    expect(budget.remaining).toBe(350); // 850 - 500
  });

  it('reports usage ratio', () => {
    const budget = new ContextBudget({ contextLimit: 1000 });
    budget.update(500);
    expect(budget.usage).toBe(0.5);
  });

  it('resets', () => {
    const budget = new ContextBudget({ contextLimit: 1000 });
    budget.update(500);
    budget.reset();
    expect(budget.tokens).toBe(0);
    expect(budget.shouldCompact()).toBe(false);
  });

  it('uses custom thresholds', () => {
    const budget = new ContextBudget({
      contextLimit: 1000,
      compactThreshold: 0.5,
      warnThreshold: 0.3,
    });
    budget.update(300);
    expect(budget.shouldWarn()).toBe(true);
    expect(budget.shouldCompact()).toBe(false);
    budget.update(500);
    expect(budget.shouldCompact()).toBe(true);
  });
});
