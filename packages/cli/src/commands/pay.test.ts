// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// Unit tests for `t2 pay` helpers. The full --estimate / payment paths
// require live network calls; those are smoked in Phase G. These tests
// lock down the pure parser semantics.

import { describe, it, expect } from 'vitest';
import { collectHeaders } from './pay.js';

describe('collectHeaders', () => {
  it('parses key=value into the accumulator', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('Authorization=Bearer abc', acc);
    expect(next).toEqual({ Authorization: 'Bearer abc' });
  });

  it('trims whitespace around key and value', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('  X-Foo  =  bar baz  ', acc);
    expect(next).toEqual({ 'X-Foo': 'bar baz' });
  });

  it('preserves "=" characters within the value', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('X-Token=a=b=c', acc);
    expect(next).toEqual({ 'X-Token': 'a=b=c' });
  });

  it('accumulates across multiple invocations (repeatable --header flag)', () => {
    let acc: Record<string, string> = {};
    acc = collectHeaders('A=1', acc);
    acc = collectHeaders('B=2', acc);
    expect(acc).toEqual({ A: '1', B: '2' });
  });

  it('ignores a malformed flag with no "=" separator', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('not-a-header', acc);
    expect(next).toEqual({});
  });

  it('ignores a flag with empty key', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('=value', acc);
    expect(next).toEqual({});
  });
});
