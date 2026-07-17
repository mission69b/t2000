// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// Parser tests for `t2 send <amount> <asset> <recipient>` v4 surface.
// Locks in the SPEC's "asset required, no USDC default" rule + the
// constrained whitelist (USDC / USDsui / SUI).

import { describe, it, expect } from 'vitest';
import { parseSendArgs } from './send.js';

describe('parseSendArgs (v4)', () => {
  describe('happy path', () => {
    it('parses USDC + hex recipient', () => {
      expect(parseSendArgs(['5', 'USDC', '0xabc123'])).toEqual({
        amount: 5,
        asset: 'USDC',
        recipient: '0xabc123',
      });
    });

    it('parses USDsui + SuiNS recipient', () => {
      expect(parseSendArgs(['10', 'USDsui', 'alice.sui'])).toEqual({
        amount: 10,
        asset: 'USDsui',
        recipient: 'alice.sui',
      });
    });

    it('parses SUI + SuiNS subname recipient (parser passes it through; SDK resolves)', () => {
      expect(parseSendArgs(['0.5', 'SUI', 'alice.audric.sui'])).toEqual({
        amount: 0.5,
        asset: 'SUI',
        recipient: 'alice.audric.sui',
      });
    });

    it('tolerates the "to" filler word between asset and recipient', () => {
      expect(parseSendArgs(['5', 'USDC', 'to', '0xabc'])).toEqual({
        amount: 5,
        asset: 'USDC',
        recipient: '0xabc',
      });
    });

    it('is case-insensitive on asset (lowercase)', () => {
      expect(parseSendArgs(['5', 'usdc', '0xabc'])).toEqual({
        amount: 5,
        asset: 'USDC',
        recipient: '0xabc',
      });
    });

    it('is case-insensitive on asset (USDSUI uppercase)', () => {
      expect(parseSendArgs(['5', 'USDSUI', '0xabc'])).toEqual({
        amount: 5,
        asset: 'USDsui',
        recipient: '0xabc',
      });
    });
  });

  describe('asset required (no implicit USDC default)', () => {
    it('errors when asset is omitted (bare amount + recipient)', () => {
      expect(() => parseSendArgs(['5', 'alice.sui'])).toThrow(/Missing required <asset>/);
    });

    it('error mentions the example invocation with USDC', () => {
      expect(() => parseSendArgs(['5', 'alice.sui'])).toThrow(/t2 send 5 USDC alice\.sui/);
    });

    it('errors when only the amount is given', () => {
      expect(() => parseSendArgs(['5'])).toThrow(/Usage/);
    });

    it('errors on empty args', () => {
      expect(() => parseSendArgs([])).toThrow(/Usage/);
    });
  });

  describe('asset whitelist (USDC | USDsui | SUI)', () => {
    it('rejects USDT with a swap hint', () => {
      expect(() => parseSendArgs(['5', 'USDT', '0xabc'])).toThrow(/Unsupported asset/);
      expect(() => parseSendArgs(['5', 'USDT', '0xabc'])).toThrow(/Swap to USDC or USDsui first/);
    });

    it('rejects USDY (one of the Sui-allowlisted stables we do NOT track)', () => {
      expect(() => parseSendArgs(['5', 'USDY', '0xabc'])).toThrow(/Unsupported asset/);
    });

    it('rejects USDe', () => {
      expect(() => parseSendArgs(['5', 'USDe', '0xabc'])).toThrow(/Unsupported asset/);
    });

    it('rejects GOLD (XAUM)', () => {
      expect(() => parseSendArgs(['5', 'GOLD', '0xabc'])).toThrow(/Unsupported asset/);
    });

    it('rejects WAL', () => {
      expect(() => parseSendArgs(['5', 'WAL', '0xabc'])).toThrow(/Unsupported asset/);
    });

    it('rejects a bogus symbol', () => {
      expect(() => parseSendArgs(['5', 'XYZ', '0xabc'])).toThrow(/Unsupported asset/);
    });
  });

  describe('amount validation', () => {
    it('rejects zero amount', () => {
      expect(() => parseSendArgs(['0', 'USDC', '0xabc'])).toThrow(/positive/);
    });

    it('rejects negative amount', () => {
      expect(() => parseSendArgs(['-5', 'USDC', '0xabc'])).toThrow(/positive/);
    });

    it('rejects non-numeric amount', () => {
      expect(() => parseSendArgs(['abc', 'USDC', '0xabc'])).toThrow(/positive/);
    });
  });
});
