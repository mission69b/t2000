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

  describe('buy', () => {
    it('parses "buy $200 BTC"', () => {
      expect(parseIntent('buy $200 BTC')).toEqual({ action: 'swap', from: 'USDC', to: 'BTC', amount: 200 });
    });

    it('parses "buy SUI $100"', () => {
      expect(parseIntent('buy SUI $100')).toEqual({ action: 'swap', from: 'USDC', to: 'SUI', amount: 100 });
    });

    it('parses "invest $100 in SUI" as buy', () => {
      expect(parseIntent('invest $100 in SUI')).toEqual({ action: 'swap', from: 'USDC', to: 'SUI', amount: 100 });
    });

    it('parses "invest 500 in ethereum" as buy', () => {
      expect(parseIntent('invest 500 in ethereum')).toEqual({ action: 'swap', from: 'USDC', to: 'ETH', amount: 500 });
    });
  });

  describe('sell', () => {
    it('parses "sell 0.001 BTC"', () => {
      expect(parseIntent('sell 0.001 BTC')).toEqual({ action: 'swap', from: 'BTC', to: 'USDC', amount: 0.001 });
    });

    it('parses "sell $50 ETH"', () => {
      expect(parseIntent('sell $50 ETH')).toEqual({ action: 'swap', from: 'ETH', to: 'USDC', amount: 50 });
    });
  });

  describe('swap', () => {
    it('parses "swap $50 to SUI" (assumes from USDC)', () => {
      expect(parseIntent('swap $50 to SUI')).toEqual({ action: 'swap', from: 'USDC', to: 'SUI', amount: 50 });
    });

    it('parses "exchange 100 for ETH" (assumes from USDC)', () => {
      expect(parseIntent('exchange 100 for ETH')).toEqual({ action: 'swap', from: 'USDC', to: 'ETH', amount: 100 });
    });

    it('parses "swap 50 SUI to ETH"', () => {
      expect(parseIntent('swap 50 SUI to ETH')).toEqual({ action: 'swap', from: 'SUI', to: 'ETH', amount: 50 });
    });

    it('parses "trade 10 USDC for BTC"', () => {
      expect(parseIntent('trade 10 USDC for BTC')).toEqual({ action: 'swap', from: 'USDC', to: 'BTC', amount: 10 });
    });
  });

  describe('swap all', () => {
    it('parses "swap all USDe to USDC"', () => {
      expect(parseIntent('swap all USDe to USDC')).toEqual({ action: 'swap', from: 'USDe', to: 'USDC', amount: -1 });
    });

    it('parses "Swap all USDe to USDC" (case-insensitive)', () => {
      expect(parseIntent('Swap all USDe to USDC')).toEqual({ action: 'swap', from: 'USDe', to: 'USDC', amount: -1 });
    });

    it('parses "convert all ETH to USDC"', () => {
      expect(parseIntent('convert all ETH to USDC')).toEqual({ action: 'swap', from: 'ETH', to: 'USDC', amount: -1 });
    });

    it('parses "sell all BTC"', () => {
      expect(parseIntent('sell all BTC')).toEqual({ action: 'swap', from: 'BTC', to: 'USDC', amount: -1 });
    });

    it('parses "sell all USDe"', () => {
      expect(parseIntent('sell all USDe')).toEqual({ action: 'swap', from: 'USDe', to: 'USDC', amount: -1 });
    });
  });

  describe('swap with unified terminology', () => {
    it('parses "swap to BTC" without amount as swap intent', () => {
      expect(parseIntent('swap $100 to BTC')).toEqual({ action: 'swap', from: 'USDC', to: 'BTC', amount: 100 });
    });

    it('parses "trade 50 USDT for SUI" as swap intent', () => {
      expect(parseIntent('trade 50 USDT for SUI')).toEqual({ action: 'swap', from: 'USDT', to: 'SUI', amount: 50 });
    });

    it('parses "buy $100 GOLD"', () => {
      expect(parseIntent('buy $100 GOLD')).toEqual({ action: 'swap', from: 'USDC', to: 'GOLD', amount: 100 });
    });

    it('parses "sell 0.5 ETH" (fractional token amount)', () => {
      expect(parseIntent('sell 0.5 ETH')).toEqual({ action: 'swap', from: 'ETH', to: 'USDC', amount: 0.5 });
    });

    it('still parses "invest" as backward-compatible swap', () => {
      expect(parseIntent('invest $200 in BTC')).toEqual({ action: 'swap', from: 'USDC', to: 'BTC', amount: 200 });
    });
  });

  describe('preamble stripping', () => {
    it('parses "can you save 4"', () => {
      expect(parseIntent('can you save 4')).toEqual({ action: 'save', amount: 4 });
    });

    it('parses "could you withdraw all"', () => {
      expect(parseIntent('could you withdraw all')).toEqual({ action: 'withdraw', amount: -1 });
    });

    it('parses "please swap all USDe to USDC"', () => {
      expect(parseIntent('please swap all USDe to USDC')).toEqual({ action: 'swap', from: 'USDe', to: 'USDC', amount: -1 });
    });

    it('parses "i want to buy $100 BTC"', () => {
      expect(parseIntent('i want to buy $100 BTC')).toEqual({ action: 'swap', from: 'USDC', to: 'BTC', amount: 100 });
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
