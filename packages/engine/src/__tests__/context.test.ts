import { describe, it, expect } from 'vitest';
import { estimateTokens, compactMessages } from '../context.js';
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
  it('returns messages unchanged when under budget', () => {
    const messages = [
      textMsg('user', 'Hello'),
      textMsg('assistant', 'Hi there'),
    ];
    const compacted = compactMessages(messages, { maxTokens: 10000 });
    expect(compacted).toEqual(messages);
  });

  it('does not mutate the original array', () => {
    const messages: Message[] = [
      textMsg('user', 'Hello'),
      textMsg('assistant', 'Hi'),
    ];
    const original = JSON.stringify(messages);
    compactMessages(messages, { maxTokens: 1 });
    expect(JSON.stringify(messages)).toBe(original);
  });

  it('summarises long tool_result content in older messages', () => {
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
      // Recent messages (kept intact)
      textMsg('user', 'What about savings?'),
      textMsg('assistant', 'Your savings...'),
      textMsg('user', 'Latest question'),
    ];

    const compacted = compactMessages(messages, {
      maxTokens: 200,
      keepRecentCount: 3,
    });

    // The old tool_result should be summarised
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

  it('drops old messages when summarisation is insufficient', () => {
    const messages: Message[] = [];
    // Add many old messages
    for (let i = 0; i < 20; i++) {
      messages.push(textMsg('user', `Message ${i} ${'x'.repeat(500)}`));
      messages.push(textMsg('assistant', `Response ${i} ${'y'.repeat(500)}`));
    }
    // Add recent messages
    messages.push(textMsg('user', 'Recent question'));
    messages.push(textMsg('assistant', 'Recent answer'));

    const compacted = compactMessages(messages, {
      maxTokens: 500,
      keepRecentCount: 4,
    });

    // Should have fewer messages than the original
    expect(compacted.length).toBeLessThan(messages.length);
    // First message preserved
    const firstBlock = compacted[0].content[0];
    expect(firstBlock.type).toBe('text');
    if (firstBlock.type === 'text') {
      expect(firstBlock.text).toContain('Message 0');
    }
    // Recent messages preserved
    const lastBlock = compacted[compacted.length - 1].content[0];
    expect(lastBlock.type).toBe('text');
    if (lastBlock.type === 'text') {
      expect(lastBlock.text).toBe('Recent answer');
    }
  });

  it('handles empty message array', () => {
    expect(compactMessages([])).toEqual([]);
  });

  it('removes orphaned tool_result blocks after dropping assistant messages', () => {
    const messages: Message[] = [
      textMsg('user', 'Check balance'),
      toolUseMsg('tc-1', 'balance_check', {}),
      toolResultMsg('tc-1', JSON.stringify({ available: 100 })),
      textMsg('assistant', 'Your balance is $100'),
      // pad to push over budget
      textMsg('user', `Question ${'x'.repeat(800)}`),
      textMsg('assistant', `Answer ${'y'.repeat(800)}`),
      // recent
      textMsg('user', 'Latest'),
      textMsg('assistant', 'Reply'),
    ];

    const compacted = compactMessages(messages, {
      maxTokens: 300,
      keepRecentCount: 2,
    });

    // If the assistant tool_use message was dropped, the tool_result should also be gone
    const hasToolResult = compacted.some((m) =>
      m.content.some((b) => b.type === 'tool_result'),
    );
    const hasToolUse = compacted.some((m) =>
      m.content.some((b) => b.type === 'tool_use'),
    );
    // Either both exist or neither
    expect(hasToolResult).toBe(hasToolUse);
  });

  it('removes orphaned tool_use blocks after dropping tool_result messages', () => {
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

    // Force heavy compaction that might separate pairs
    const compacted = compactMessages(messages, {
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

    // Every tool_use should have a matching tool_result and vice versa
    for (const id of allToolUseIds) {
      expect(allToolResultIds.has(id)).toBe(true);
    }
    for (const id of allToolResultIds) {
      expect(allToolUseIds.has(id)).toBe(true);
    }
  });

  it('preserves recent messages even when heavily compacting', () => {
    const messages: Message[] = [
      textMsg('user', 'First'),
      textMsg('assistant', 'First reply'),
      textMsg('user', 'Second'),
      textMsg('assistant', 'Second reply'),
      textMsg('user', 'Third'),
      textMsg('assistant', 'Third reply'),
    ];

    const compacted = compactMessages(messages, {
      maxTokens: 50,
      keepRecentCount: 4,
    });

    // Last 4 messages should be present
    const lastFour = compacted.slice(-4);
    expect(lastFour.map((m) => {
      const b = m.content[0];
      return b.type === 'text' ? b.text : '';
    })).toEqual(['Second', 'Second reply', 'Third', 'Third reply']);
  });
});
