import { describe, it, expect } from 'vitest';
import { budgetToolResult } from '../orchestration.js';
import type { Tool } from '../types.js';

function fakeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'test_tool',
    description: '',
    inputSchema: {} as Tool['inputSchema'],
    jsonSchema: { type: 'object', properties: {} },
    call: async () => ({ data: null }),
    isConcurrencySafe: true,
    isReadOnly: true,
    permissionLevel: 'auto',
    flags: {},
    ...overrides,
  };
}

describe('budgetToolResult', () => {
  it('returns data unchanged when under limit', () => {
    const tool = fakeTool({ maxResultSizeChars: 1000 });
    const data = { balance: 100, asset: 'USDC' };
    expect(budgetToolResult(data, tool)).toEqual(data);
  });

  it('returns data unchanged when no limit set', () => {
    const tool = fakeTool();
    const bigData = { payload: 'x'.repeat(100_000) };
    expect(budgetToolResult(bigData, tool)).toEqual(bigData);
  });

  it('wraps oversized object data in a _truncated envelope (preserves object shape)', () => {
    /**
     * [v1.5.2] Regression guard for the missing-rich-card bug:
     * the legacy fallback returned a raw sliced string for object data,
     * which broke frontend card renderers that destructure tool.result.
     * The envelope keeps the result object-shaped while still carrying
     * the preview + recall hint for the LLM.
     */
    const tool = fakeTool({ maxResultSizeChars: 50 });
    const data = { transactions: Array.from({ length: 100 }, (_, i) => ({ id: i, amount: i * 10 })) };
    const result = budgetToolResult(data, tool);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    const env = result as { _truncated: boolean; _preview: string; _note: string };
    expect(env._truncated).toBe(true);
    expect(env._preview.length).toBeLessThanOrEqual(50);
    expect(env._note).toContain('Truncated');
    expect(env._note).toContain('test_tool');
  });

  it('uses custom summarizeOnTruncate when provided', () => {
    const tool = fakeTool({
      maxResultSizeChars: 20,
      summarizeOnTruncate: (_result, maxChars) => `{"summary":"custom","max":${maxChars}}`,
    });
    const data = { payload: 'x'.repeat(100) };
    const result = budgetToolResult(data, tool);
    expect(result).toEqual({ summary: 'custom', max: 20 });
  });

  it('handles string data with legacy concat (truncated string is fine — nothing to destructure)', () => {
    const tool = fakeTool({ maxResultSizeChars: 10 });
    const data = 'a'.repeat(100);
    const result = budgetToolResult(data, tool);
    expect(typeof result).toBe('string');
    expect(result).toContain('Truncated');
  });

  it('always returns object/string — never null/undefined — for any oversized payload', () => {
    /**
     * [v1.5.2] Frontend safety net: card renderers do
     * `if (typeof data !== 'object') return null` and crash on undefined.
     * The truncation path must never produce a value that fails both
     * checks.
     */
    const tool = fakeTool({ maxResultSizeChars: 5 });
    for (const payload of [
      { a: 1, b: 2 },
      [1, 2, 3],
      'plain string',
      { nested: { deep: { value: 'x'.repeat(1000) } } },
    ]) {
      const result = budgetToolResult(payload, tool);
      expect(result).not.toBeUndefined();
      expect(result).not.toBeNull();
      const t = typeof result;
      expect(t === 'object' || t === 'string').toBe(true);
    }
  });

  it('does not truncate error results (budgetToolResult only sees data)', () => {
    const tool = fakeTool({ maxResultSizeChars: 50 });
    const shortError = { error: 'Not found' };
    expect(budgetToolResult(shortError, tool)).toEqual(shortError);
  });
});
