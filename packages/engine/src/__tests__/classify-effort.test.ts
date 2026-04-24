import { describe, it, expect } from 'vitest';
import { classifyEffort } from '../classify-effort.js';
import type { Recipe } from '../recipes/index.js';

const SONNET = 'claude-sonnet-4-6';
const OPUS = 'claude-opus-4-6';

function recipe(name: string, steps: number): Recipe {
  return {
    name,
    description: `${name} test recipe`,
    triggers: [],
    steps: Array.from({ length: steps }, (_, i) => ({
      name: `step${i}`,
      purpose: 'test',
    })),
  } as unknown as Recipe;
}

describe('classifyEffort — post-0.47 routing', () => {
  describe('low-effort (Haiku) routing', () => {
    it('routes pure single-fact lookups to low', () => {
      expect(classifyEffort(SONNET, 'whats my balance', null, 0)).toBe('low');
      expect(classifyEffort(SONNET, 'what is the rate', null, 0)).toBe('low');
      expect(classifyEffort(SONNET, 'check the price', null, 0)).toBe('low');
      expect(classifyEffort(SONNET, 'apy', null, 0)).toBe('low');
      expect(classifyEffort(SONNET, 'hf', null, 0)).toBe('low');
    });

    it('routes idle chitchat to low (no action keywords)', () => {
      expect(classifyEffort(SONNET, 'hello', null, 0)).toBe('low');
      expect(classifyEffort(SONNET, 'thanks', null, 0)).toBe('low');
    });
  });

  describe('CRITICAL — broad-synthesis queries must NOT go to low', () => {
    it('"show me X" queries are not low (Haiku loops on multi-record synthesis)', () => {
      expect(classifyEffort(SONNET, 'show me all transactions', null, 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'show me my history', null, 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'show me everything', null, 0)).not.toBe('low');
    });

    it('"history" / "list" / "all" queries are not low', () => {
      expect(classifyEffort(SONNET, 'transaction history', null, 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'list my positions', null, 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'all my savings', null, 0)).not.toBe('low');
    });

    it('"full report" / "summary" queries are not low', () => {
      expect(classifyEffort(SONNET, 'give me a full report', null, 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'account summary', null, 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'portfolio breakdown', null, 0)).not.toBe('low');
    });
  });

  describe('recipe gating — any recipe means at least medium', () => {
    it('matched recipe with 1 step → medium (not low, even with simple wording)', () => {
      expect(classifyEffort(SONNET, 'balance', recipe('check_balance', 1), 0)).toBe('medium');
    });

    it('matched recipe with 3+ steps → high', () => {
      expect(classifyEffort(SONNET, 'check', recipe('account_report', 7), 0)).toBe('high');
      expect(classifyEffort(SONNET, 'whatever', recipe('multi_step', 5), 0)).toBe('high');
    });

    it('safe_borrow / bulk_mail → high regardless of step count', () => {
      expect(classifyEffort(SONNET, 'borrow', recipe('safe_borrow', 1), 0)).toBe('high');
      expect(classifyEffort(SONNET, 'send', recipe('bulk_mail', 1), 0)).toBe('high');
    });
  });

  describe('write actions in active session → high', () => {
    it('action verbs after prior write → high', () => {
      expect(classifyEffort(SONNET, 'borrow $100', null, 1)).toBe('high');
      expect(classifyEffort(SONNET, 'withdraw 50 USDC', null, 1)).toBe('high');
      expect(classifyEffort(SONNET, 'send to alice', null, 1)).toBe('high');
      expect(classifyEffort(SONNET, 'swap SUI for USDC', null, 2)).toBe('high');
    });

    it('action verbs without prior write → medium (single write, fresh session)', () => {
      expect(classifyEffort(SONNET, 'borrow $100', null, 0)).toBe('medium');
      expect(classifyEffort(SONNET, 'withdraw 50 USDC', null, 0)).toBe('medium');
    });
  });

  describe('opus-4-6 max routing', () => {
    it('rebalance / DCA / close-position → max (opus only)', () => {
      expect(classifyEffort(OPUS, 'rebalance my portfolio', null, 0)).toBe('max');
      expect(classifyEffort(OPUS, 'dca setup for SUI', null, 0)).toBe('max');
      expect(classifyEffort(OPUS, 'close my long position', null, 0)).toBe('max');
    });

    it('rebalance keywords on non-opus model → not max (falls through to medium/high)', () => {
      const result = classifyEffort(SONNET, 'rebalance my portfolio', null, 0);
      expect(result).not.toBe('max');
    });
  });
});
