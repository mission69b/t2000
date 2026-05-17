import { describe, it, expect } from 'vitest';
import { classifyEffort } from '../classify-effort.js';

const SONNET = 'claude-sonnet-4-6';
const OPUS = 'claude-opus-4-6';

describe('classifyEffort — post-Phase-6 routing (recipes-free)', () => {
  describe('low-effort (Haiku) routing', () => {
    it('routes pure single-fact lookups to low', () => {
      expect(classifyEffort(SONNET, 'whats my balance', 0)).toBe('low');
      expect(classifyEffort(SONNET, 'what is the rate', 0)).toBe('low');
      expect(classifyEffort(SONNET, 'check the price', 0)).toBe('low');
      expect(classifyEffort(SONNET, 'apy', 0)).toBe('low');
      expect(classifyEffort(SONNET, 'hf', 0)).toBe('low');
    });

    it('routes idle chitchat to low (no action keywords)', () => {
      expect(classifyEffort(SONNET, 'hello', 0)).toBe('low');
      expect(classifyEffort(SONNET, 'thanks', 0)).toBe('low');
    });
  });

  describe('CRITICAL — broad-synthesis queries must NOT go to low', () => {
    it('"show me X" queries are not low (Haiku loops on multi-record synthesis)', () => {
      expect(classifyEffort(SONNET, 'show me all transactions', 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'show me my history', 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'show me everything', 0)).not.toBe('low');
    });

    it('"history" / "list" / "all" queries are not low', () => {
      expect(classifyEffort(SONNET, 'transaction history', 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'list my positions', 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'all my savings', 0)).not.toBe('low');
    });

    it('"full report" / "summary" queries are not low', () => {
      expect(classifyEffort(SONNET, 'give me a full report', 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'account summary', 0)).not.toBe('low');
      expect(classifyEffort(SONNET, 'portfolio breakdown', 0)).not.toBe('low');
    });
  });

  describe('skill-intent message regex boosts (replaces recipe-name boosts)', () => {
    it('account-report-shape intents → high (was matchedRecipe.steps.length >= 3)', () => {
      expect(classifyEffort(SONNET, 'give me a full report', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'account summary please', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'everything about my account', 0)).toBe('high');
    });

    it('rebalance intent → high on sonnet (was matchedRecipe?.name === "portfolio_rebalance")', () => {
      expect(classifyEffort(SONNET, 'rebalance my portfolio', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'reallocate my holdings', 0)).toBe('high');
    });

    it('emergency-withdraw intent → high on sonnet (was matchedRecipe?.name === "emergency_withdraw")', () => {
      expect(classifyEffort(SONNET, 'withdraw everything', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'emergency withdraw', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'close my position', 0)).toBe('high');
    });

    it('safe-borrow intent → high (was matchedRecipe?.name === "safe_borrow")', () => {
      expect(classifyEffort(SONNET, 'safely borrow $100', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'safe borrow 50 USDC', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'borrow against my savings', 0)).toBe('high');
    });

    it('swap-and-save bundled intent → high (was matchedRecipe?.name === "swap_and_save")', () => {
      expect(classifyEffort(SONNET, 'swap SUI and save', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'swap and save', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'convert SUI then deposit', 0)).toBe('high');
    });

    it('bulk-mail intent → high (was matchedRecipe?.name === "bulk_mail")', () => {
      expect(classifyEffort(SONNET, 'bulk send to 10 addresses', 0)).toBe('high');
      expect(classifyEffort(SONNET, 'bulk mail postcards', 0)).toBe('high');
    });
  });

  describe('write actions in active session → high', () => {
    it('action verbs after prior write → high', () => {
      expect(classifyEffort(SONNET, 'borrow $100', 1)).toBe('high');
      expect(classifyEffort(SONNET, 'withdraw 50 USDC', 1)).toBe('high');
      expect(classifyEffort(SONNET, 'send to alice', 1)).toBe('high');
      expect(classifyEffort(SONNET, 'swap SUI for USDC', 2)).toBe('high');
    });

    it('action verbs without prior write → medium (single write, fresh session)', () => {
      expect(classifyEffort(SONNET, 'borrow $100', 0)).toBe('medium');
      expect(classifyEffort(SONNET, 'withdraw 50 USDC', 0)).toBe('medium');
    });
  });

  describe('opus-4-6 max routing', () => {
    it('rebalance / DCA / close-position → max (opus only)', () => {
      expect(classifyEffort(OPUS, 'rebalance my portfolio', 0)).toBe('max');
      expect(classifyEffort(OPUS, 'dca setup for SUI', 0)).toBe('max');
      expect(classifyEffort(OPUS, 'close my long position', 0)).toBe('max');
    });

    it('rebalance keywords on non-opus model → high (sonnet promotion), not max', () => {
      const result = classifyEffort(SONNET, 'rebalance my portfolio', 0);
      expect(result).toBe('high');
    });
  });
});
