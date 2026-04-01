import { describe, it, expect } from 'vitest';
import { parseIntent } from './intent-parser';

describe('parseIntent', () => {
  describe('simple commands', () => {
    it('parses help (exact only)', () => {
      expect(parseIntent('help')).toEqual({ action: 'help' });
      expect(parseIntent('what can you do')).toEqual({ action: 'help' });
      expect(parseIntent('what can I do')).toEqual({ action: 'help' });
    });

    it('does NOT match "help me..." — falls through to LLM', () => {
      expect(parseIntent('help me send an email')).toBeNull();
      expect(parseIntent('help me search for flights')).toBeNull();
      expect(parseIntent('help me find some flights')).toBeNull();
    });

    it('parses address', () => {
      expect(parseIntent('my address')).toEqual({ action: 'address' });
      expect(parseIntent('address')).toEqual({ action: 'address' });
      expect(parseIntent('wallet address')).toEqual({ action: 'address' });
    });

    it('parses balance', () => {
      expect(parseIntent('balance')).toEqual({ action: 'balance' });
      expect(parseIntent('how much')).toEqual({ action: 'balance' });
    });

    it('parses report', () => {
      expect(parseIntent('report')).toEqual({ action: 'report' });
      expect(parseIntent('financial report')).toEqual({ action: 'report' });
      expect(parseIntent('summary')).toEqual({ action: 'report' });
    });

    it('parses history', () => {
      expect(parseIntent('history')).toEqual({ action: 'history' });
      expect(parseIntent('transactions')).toEqual({ action: 'history' });
      expect(parseIntent('recent')).toEqual({ action: 'history' });
    });

    it('parses rates', () => {
      expect(parseIntent('rates')).toEqual({ action: 'rates' });
      expect(parseIntent('interest rates')).toEqual({ action: 'rates' });
      expect(parseIntent('apy')).toEqual({ action: 'rates' });
    });

    it('parses claim rewards', () => {
      expect(parseIntent('claim')).toEqual({ action: 'claim-rewards' });
      expect(parseIntent('claim rewards')).toEqual({ action: 'claim-rewards' });
    });
  });

  describe('save', () => {
    it('parses "save $500"', () => {
      expect(parseIntent('save $500')).toEqual({ action: 'save', amount: 500 });
    });

    it('parses "save 100"', () => {
      expect(parseIntent('save 100')).toEqual({ action: 'save', amount: 100 });
    });

    it('parses "deposit 200"', () => {
      expect(parseIntent('deposit 200')).toEqual({ action: 'save', amount: 200 });
    });

    it('parses "save $1,500.50"', () => {
      expect(parseIntent('save $1,500.50')).toEqual({ action: 'save', amount: 1500.50 });
    });
  });

  describe('withdraw', () => {
    it('parses "withdraw $200"', () => {
      expect(parseIntent('withdraw $200')).toEqual({ action: 'withdraw', amount: 200 });
    });

    it('parses "withdraw all"', () => {
      expect(parseIntent('withdraw all')).toEqual({ action: 'withdraw', amount: -1 });
    });
  });

  describe('borrow', () => {
    it('parses "borrow $100"', () => {
      expect(parseIntent('borrow $100')).toEqual({ action: 'borrow', amount: 100 });
    });
  });

  describe('repay', () => {
    it('parses "repay $50"', () => {
      expect(parseIntent('repay $50')).toEqual({ action: 'repay', amount: 50 });
    });

    it('parses "pay back 75"', () => {
      expect(parseIntent('pay back 75')).toEqual({ action: 'repay', amount: 75 });
    });
  });

  describe('send', () => {
    it('parses "send $50 to alice"', () => {
      expect(parseIntent('send $50 to alice')).toEqual({ action: 'send', amount: 50, to: 'alice' });
    });

    it('parses "send 100 to 0x1234"', () => {
      expect(parseIntent('send 100 to 0x1234')).toEqual({ action: 'send', amount: 100, to: '0x1234' });
    });

    it('parses "send alice $50"', () => {
      expect(parseIntent('send alice $50')).toEqual({ action: 'send', amount: 50, to: 'alice' });
    });
  });

  describe('removed intents fall through to null', () => {
    it('swap returns null', () => {
      expect(parseIntent('swap $50 to SUI')).toBeNull();
    });

    it('buy returns null', () => {
      expect(parseIntent('buy $200 BTC')).toBeNull();
    });

    it('sell returns null', () => {
      expect(parseIntent('sell 0.001 BTC')).toBeNull();
    });

    it('invest returns null', () => {
      expect(parseIntent('invest $100 in SUI')).toBeNull();
    });

    it('rebalance returns null', () => {
      expect(parseIntent('rebalance my savings')).toBeNull();
      expect(parseIntent('rebalance to NAVI')).toBeNull();
    });
  });

  describe('preamble stripping', () => {
    it('parses "can you save 4"', () => {
      expect(parseIntent('can you save 4')).toEqual({ action: 'save', amount: 4 });
    });

    it('parses "could you withdraw all"', () => {
      expect(parseIntent('could you withdraw all')).toEqual({ action: 'withdraw', amount: -1 });
    });

    it('parses "pls send $50 to alice"', () => {
      expect(parseIntent('pls send $50 to alice')).toEqual({ action: 'send', amount: 50, to: 'alice' });
    });
  });

  describe('LLM fallback', () => {
    it('returns null for unrecognized input', () => {
      expect(parseIntent('what should I do with $500?')).toBeNull();
    });

    it('returns null for complex queries', () => {
      expect(parseIntent('compare my earnings this month vs last')).toBeNull();
    });

    it('returns null for general conversation', () => {
      expect(parseIntent('hello there')).toBeNull();
    });
  });
});
