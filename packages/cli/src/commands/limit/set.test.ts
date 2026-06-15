// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// Parser tests for `t2 limit set` flag handling.

import { describe, it, expect } from 'vitest';
import { parseLimitSetArgs } from './set.js';

describe('parseLimitSetArgs', () => {
  it('parses --per-tx', () => {
    expect(parseLimitSetArgs({ perTx: '50' })).toEqual({ perTxUsd: 50 });
  });

  it('parses --daily', () => {
    expect(parseLimitSetArgs({ daily: '100' })).toEqual({ dailyUsd: 100 });
  });

  it('parses both flags', () => {
    expect(parseLimitSetArgs({ perTx: '50', daily: '100' })).toEqual({
      perTxUsd: 50,
      dailyUsd: 100,
    });
  });

  it('accepts decimal values', () => {
    expect(parseLimitSetArgs({ perTx: '12.50' })).toEqual({ perTxUsd: 12.5 });
  });

  it('errors when neither flag is set', () => {
    expect(() => parseLimitSetArgs({})).toThrow(/at least one flag/);
  });

  it('rejects zero', () => {
    expect(() => parseLimitSetArgs({ perTx: '0' })).toThrow(/positive number/);
  });

  it('rejects negative', () => {
    expect(() => parseLimitSetArgs({ daily: '-5' })).toThrow(/positive number/);
  });

  it('rejects non-numeric', () => {
    expect(() => parseLimitSetArgs({ perTx: 'abc' })).toThrow(/positive number/);
  });

  it('error message mentions the flag name', () => {
    expect(() => parseLimitSetArgs({ perTx: 'oops' })).toThrow(/--per-tx/);
    expect(() => parseLimitSetArgs({ daily: 'oops' })).toThrow(/--daily/);
  });
});
