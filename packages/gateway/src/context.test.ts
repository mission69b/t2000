import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from './context.js';

describe('ContextManager', () => {
  let ctx: ContextManager;

  beforeEach(() => {
    ctx = new ContextManager();
  });

  it('starts with empty history', () => {
    expect(ctx.getHistory()).toEqual([]);
    expect(ctx.getEstimatedTokens()).toBe(0);
  });

  it('adds a single message', () => {
    ctx.addMessage({ role: 'user', content: 'hello' });
    expect(ctx.getHistory()).toHaveLength(1);
    expect(ctx.getHistory()[0].content).toBe('hello');
  });

  it('adds multiple messages at once', () => {
    ctx.addMessages([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
    expect(ctx.getHistory()).toHaveLength(2);
  });

  it('returns a copy from getHistory (not a reference)', () => {
    ctx.addMessage({ role: 'user', content: 'test' });
    const history = ctx.getHistory();
    history.push({ role: 'assistant', content: 'injected' });
    expect(ctx.getHistory()).toHaveLength(1);
  });

  it('clears all history', () => {
    ctx.addMessages([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ]);
    ctx.clear();
    expect(ctx.getHistory()).toHaveLength(0);
  });

  it('estimates tokens from character length', () => {
    ctx.addMessage({ role: 'user', content: 'a'.repeat(400) });
    // 400 chars * 0.25 = 100 tokens
    expect(ctx.getEstimatedTokens()).toBe(100);
  });

  it('compacts when approaching token budget', () => {
    // 80k budget * 0.8 threshold = 64k tokens → 256k chars
    // Add enough messages to trigger compaction
    for (let i = 0; i < 50; i++) {
      ctx.addMessage({ role: 'user', content: 'x'.repeat(6000) });
      ctx.addMessage({ role: 'assistant', content: 'y'.repeat(6000) });
    }
    // After compaction, should have fewer messages but still retain recent pairs
    const history = ctx.getHistory();
    expect(history.length).toBeLessThan(100);
    expect(history.length).toBeGreaterThan(0);
    // Last message should still be there
    expect(history[history.length - 1].role).toBe('assistant');
  });

  it('drops tool call/result pairs during compaction before recent messages', () => {
    // Fill up context with tool-heavy messages
    for (let i = 0; i < 40; i++) {
      ctx.addMessage({ role: 'user', content: 'q'.repeat(3000) });
      ctx.addMessage({
        role: 'assistant', content: '',
        toolCalls: [{ id: `tc_${i}`, name: 'test_tool', arguments: {} }],
      });
      ctx.addMessage({ role: 'tool', content: 'r'.repeat(5000), toolCallId: `tc_${i}` });
      ctx.addMessage({ role: 'assistant', content: 'a'.repeat(3000) });
    }

    const history = ctx.getHistory();
    // Recent pairs should still be present
    expect(history.length).toBeGreaterThan(0);
    // If compaction worked, tool messages from early in history should be dropped
    const earlyToolMessages = history.filter((m, i) => m.role === 'tool' && i < history.length / 2);
    const totalToolMessages = history.filter(m => m.role === 'tool');
    expect(totalToolMessages.length).toBeLessThanOrEqual(earlyToolMessages.length + 10);
  });
});
