// [SPEC_AGENTIC_STACK P1 / CLI F6 — 2026-05-25]
// Parser unit tests for `t2000 swap` positional args. Two accepted forms:
//   - `t2000 swap 100 USDC SUI`     → no keyword
//   - `t2000 swap 100 USDC for SUI` → with "for" keyword (case-insensitive)
import { describe, it, expect } from 'vitest';
import { parseSwapArgs } from './swap.js';

describe('parseSwapArgs', () => {
  it('parses three positional args (no keyword)', () => {
    expect(parseSwapArgs('100', 'USDC', 'SUI', undefined)).toEqual({
      amount: 100,
      from: 'USDC',
      to: 'SUI',
    });
  });

  it('parses with "for" keyword between from and to', () => {
    expect(parseSwapArgs('50', 'USDC', 'for', 'SUI')).toEqual({
      amount: 50,
      from: 'USDC',
      to: 'SUI',
    });
  });

  it('treats "for" keyword case-insensitively', () => {
    expect(parseSwapArgs('25', 'USDC', 'FOR', 'SUI')).toEqual({
      amount: 25,
      from: 'USDC',
      to: 'SUI',
    });
    expect(parseSwapArgs('25', 'USDC', 'For', 'SUI')).toEqual({
      amount: 25,
      from: 'USDC',
      to: 'SUI',
    });
  });

  it('accepts decimal amounts', () => {
    expect(parseSwapArgs('0.5', 'SUI', 'USDC', undefined)).toEqual({
      amount: 0.5,
      from: 'SUI',
      to: 'USDC',
    });
  });

  it('throws when amount is not a positive number', () => {
    expect(() => parseSwapArgs('0', 'USDC', 'SUI', undefined)).toThrow(/positive/);
    expect(() => parseSwapArgs('-5', 'USDC', 'SUI', undefined)).toThrow(/positive/);
    expect(() => parseSwapArgs('abc', 'USDC', 'SUI', undefined)).toThrow(/positive/);
  });

  it('throws when "for" keyword is present but `to` is missing', () => {
    expect(() => parseSwapArgs('100', 'USDC', 'for', undefined)).toThrow(/Usage/);
  });
});
