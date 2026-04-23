import { describe, it, expect } from 'vitest';
import { transactionHistoryTool } from '../tools/history.js';
import { budgetToolResult } from '../orchestration.js';

/**
 * [v1.5.2] Regression suite for the missing-rich-card bug:
 * before this fix, `transaction_history` results > 8KB hit the generic
 * truncation fallback in `budgetToolResult`, which returned a sliced
 * string. The frontend `transaction_history` card renderer then saw
 * `typeof data !== 'object'` and bailed, so the rich card never rendered.
 *
 * The custom `summarizeOnTruncate` keeps the result object-shaped by
 * progressively halving the `transactions` array until the serialized
 * payload fits the byte budget, then stamps `_truncated: true` and
 * `_originalCount` so the LLM knows to recall with `limit` if needed.
 */
describe('transaction_history summarizeOnTruncate', () => {
  function makeFakeTxs(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      digest: `0x${'a'.repeat(60)}${i}`,
      action: i % 2 === 0 ? 'send' : 'lending',
      amount: i + 1,
      asset: 'USDC',
      recipient: `0x${'b'.repeat(60)}`,
      timestamp: 1_700_000_000_000 + i * 1000,
      gasCost: 0.001,
    }));
  }

  it('produces valid JSON-parseable output that stays object-shaped', () => {
    const original = { transactions: makeFakeTxs(50), count: 50, date: null, action: null, lookbackDays: 30 };
    const serialized = JSON.stringify(original);
    expect(serialized.length).toBeGreaterThan(8000);

    const summarizer = transactionHistoryTool.summarizeOnTruncate!;
    const result = summarizer(serialized, 8_000);

    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(typeof parsed).toBe('object');
    expect(Array.isArray(parsed.transactions)).toBe(true);
    expect(parsed._truncated).toBe(true);
    expect(parsed._originalCount).toBe(50);
    expect(result.length).toBeLessThanOrEqual(8_000);
  });

  it('preserves at least one transaction in the result', () => {
    const original = { transactions: makeFakeTxs(100), count: 100 };
    const summarizer = transactionHistoryTool.summarizeOnTruncate!;
    const result = summarizer(JSON.stringify(original), 1_000);
    const parsed = JSON.parse(result);
    expect(parsed.transactions.length).toBeGreaterThan(0);
  });

  it('returns a valid stub when input JSON itself is malformed', () => {
    const summarizer = transactionHistoryTool.summarizeOnTruncate!;
    const result = summarizer('{not valid json', 8_000);
    const parsed = JSON.parse(result);
    expect(parsed.transactions).toEqual([]);
    expect(parsed._truncated).toBe(true);
  });

  it('end-to-end through budgetToolResult: result stays object-shaped', () => {
    const original = { transactions: makeFakeTxs(50), count: 50, date: null, action: null };
    const result = budgetToolResult(original, transactionHistoryTool);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    const obj = result as { transactions: unknown[]; _truncated?: boolean };
    expect(Array.isArray(obj.transactions)).toBe(true);
    expect(obj._truncated).toBe(true);
  });

  it('end-to-end: small payloads pass through untouched (no envelope)', () => {
    const original = { transactions: makeFakeTxs(2), count: 2 };
    const result = budgetToolResult(original, transactionHistoryTool);
    expect(result).toEqual(original);
  });
});
