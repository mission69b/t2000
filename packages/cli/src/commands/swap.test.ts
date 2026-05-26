// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// Parser tests for `t2 swap <amount> <from> <to>` v4 surface. The legacy
// "for" filler keyword is gone — greenfield syntax is strictly
// 3-positional. The `--quote` flag is exercised at the command level
// (orchestration), not in the pure parser.

import { describe, it, expect } from 'vitest';
import { parseSwapArgs } from './swap.js';

describe('parseSwapArgs (v4)', () => {
  describe('happy path', () => {
    it('parses three positional args', () => {
      expect(parseSwapArgs('100', 'USDC', 'SUI')).toEqual({
        amount: 100,
        from: 'USDC',
        to: 'SUI',
      });
    });

    it('accepts decimal amounts', () => {
      expect(parseSwapArgs('0.5', 'SUI', 'USDC')).toEqual({
        amount: 0.5,
        from: 'SUI',
        to: 'USDC',
      });
    });

    it('preserves case in token symbols (USDsui is mixed-case)', () => {
      expect(parseSwapArgs('10', 'USDC', 'USDsui')).toEqual({
        amount: 10,
        from: 'USDC',
        to: 'USDsui',
      });
    });
  });

  describe('amount validation', () => {
    it('rejects zero amount', () => {
      expect(() => parseSwapArgs('0', 'USDC', 'SUI')).toThrow(/positive/);
    });

    it('rejects negative amount', () => {
      expect(() => parseSwapArgs('-5', 'USDC', 'SUI')).toThrow(/positive/);
    });

    it('rejects non-numeric amount', () => {
      expect(() => parseSwapArgs('abc', 'USDC', 'SUI')).toThrow(/positive/);
    });
  });

  describe('positional arg validation', () => {
    it('errors when `from` is missing', () => {
      expect(() => parseSwapArgs('100', undefined, 'SUI')).toThrow(/Usage/);
    });

    it('errors when `to` is missing', () => {
      expect(() => parseSwapArgs('100', 'USDC', undefined)).toThrow(/Usage/);
    });

    it('error hints at --quote flag for previewing', () => {
      expect(() => parseSwapArgs('100', 'USDC', undefined)).toThrow(/--quote/);
    });
  });
});
