import { describe, it, expect } from 'vitest';
import { parseSendArgs } from './send.js';

describe('parseSendArgs', () => {
  it('parses simple amount + address', () => {
    const result = parseSendArgs(['100', '0xabc123']);
    expect(result).toEqual({ amount: 100, asset: 'USDC', recipient: '0xabc123' });
  });

  it('parses amount with "to" keyword', () => {
    const result = parseSendArgs(['50', 'to', '0xdef456']);
    expect(result).toEqual({ amount: 50, asset: 'USDC', recipient: '0xdef456' });
  });

  it('parses amount with "To" keyword (case-insensitive)', () => {
    const result = parseSendArgs(['50', 'To', '0xdef456']);
    expect(result).toEqual({ amount: 50, asset: 'USDC', recipient: '0xdef456' });
  });

  it('parses amount + explicit asset + address', () => {
    const result = parseSendArgs(['10', 'SUI', '0xaddr']);
    expect(result).toEqual({ amount: 10, asset: 'SUI', recipient: '0xaddr' });
  });

  it('parses amount + USDT + address', () => {
    const result = parseSendArgs(['25', 'USDT', '0xfoo']);
    expect(result).toEqual({ amount: 25, asset: 'USDT', recipient: '0xfoo' });
  });

  it('parses amount + asset + "to" + address', () => {
    const result = parseSendArgs(['100', 'USDC', 'to', '0xbar']);
    expect(result).toEqual({ amount: 100, asset: 'USDC', recipient: '0xbar' });
  });

  it('defaults to USDC for unknown middle token', () => {
    const result = parseSendArgs(['50', 'alice']);
    expect(result).toEqual({ amount: 50, asset: 'USDC', recipient: 'alice' });
  });

  it('treats contact name as recipient', () => {
    const result = parseSendArgs(['10', 'Mom']);
    expect(result).toEqual({ amount: 10, asset: 'USDC', recipient: 'Mom' });
  });

  it('throws on single argument', () => {
    expect(() => parseSendArgs(['100'])).toThrow('Usage');
  });

  it('throws on empty array', () => {
    expect(() => parseSendArgs([])).toThrow('Usage');
  });
});
