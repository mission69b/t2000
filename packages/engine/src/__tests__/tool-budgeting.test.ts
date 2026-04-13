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

  it('truncates data with hint when over limit', () => {
    const tool = fakeTool({ maxResultSizeChars: 50 });
    const data = { transactions: Array.from({ length: 100 }, (_, i) => ({ id: i, amount: i * 10 })) };
    const result = budgetToolResult(data, tool);
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeLessThan(JSON.stringify(data).length);
    expect(result).toContain('Truncated');
    expect(result).toContain('test_tool');
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

  it('handles string data', () => {
    const tool = fakeTool({ maxResultSizeChars: 10 });
    const data = 'a'.repeat(100);
    const result = budgetToolResult(data, tool);
    expect(typeof result).toBe('string');
    expect(result).toContain('Truncated');
  });

  it('does not truncate error results (budgetToolResult only sees data)', () => {
    const tool = fakeTool({ maxResultSizeChars: 50 });
    const shortError = { error: 'Not found' };
    expect(budgetToolResult(shortError, tool)).toEqual(shortError);
  });
});
