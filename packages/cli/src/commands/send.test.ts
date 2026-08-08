// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// Parser tests for `t2 send <amount> <asset> <recipient>`.
// Locks in the "asset required, no USDC default" rule + [S.957] the
// widened surface: any resolvable coin type (registry symbol or full
// 0x…::module::TYPE) parses; unresolvable symbols still hard-fail.

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

  describe('any resolvable asset (S.957)', () => {
    it('parses a registry alt symbol (MANIFEST) — no more "swap first"', () => {
      expect(parseSendArgs(['10', 'MANIFEST', '0xabc'])).toEqual({
        amount: 10,
        asset: 'MANIFEST',
        recipient: '0xabc',
      });
    });

    it('parses previously-rejected registry assets (USDT / WAL / GOLD)', () => {
      for (const asset of ['USDT', 'WAL', 'GOLD']) {
        expect(parseSendArgs(['5', asset, '0xabc']).asset).toBe(asset);
      }
    });

    it('parses a full coin type verbatim', () => {
      const full =
        '0xc466c28d87b3d5cd34f3d5c088751532d71a38d93a8aae4551dd56272cfb4355::manifest::MANIFEST';
      expect(parseSendArgs(['10', full, '0xabc'])).toEqual({
        amount: 10,
        asset: full,
        recipient: '0xabc',
      });
    });

    it('still rejects an unresolvable bogus symbol', () => {
      expect(() => parseSendArgs(['5', 'FOOBAR_NOT_A_TOKEN', '0xabc'])).toThrow(/Unknown asset/);
      expect(() => parseSendArgs(['5', 'XYZ', '0xabc'])).toThrow(/Unknown asset/);
    });

    it('rejects a malformed :: type', () => {
      expect(() => parseSendArgs(['5', '0xnot::a', '0xabc'])).toThrow(/Unknown asset/);
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
