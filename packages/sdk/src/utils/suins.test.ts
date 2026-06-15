/**
 * [S.279 / CLI-CONTACTS-CLEANUP — 2026-05-23] Focused SDK-side smoke
 * test for the SuiNS utilities in `@t2000/sdk`. Confirms exports are wired
 * correctly and the synchronous helpers behave.
 *
 * Async lookups (`resolveSuinsViaRpc`, `normalizeAddressInput`) are not
 * covered here — they need RPC mocks and are exercised in higher-level tests.
 */

import { describe, expect, it } from 'vitest';
import {
  InvalidAddressError,
  SuinsNotRegisteredError,
  SuinsRpcError,
  SUI_ADDRESS_REGEX,
  SUI_ADDRESS_STRICT_REGEX,
  SUINS_NAME_REGEX,
  looksLikeSuiNs,
} from './suins.js';

describe('utils/suins — SDK exports (S.279)', () => {
  describe('SUI_ADDRESS_REGEX', () => {
    it('matches a full-length 0x address', () => {
      expect(SUI_ADDRESS_REGEX.test('0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62')).toBe(true);
    });

    it('matches uppercase hex', () => {
      expect(SUI_ADDRESS_REGEX.test('0xABCDEF123')).toBe(true);
    });

    it('matches short 0x address (loose lower bound)', () => {
      expect(SUI_ADDRESS_REGEX.test('0x1')).toBe(true);
    });

    it('rejects bare hex without 0x', () => {
      expect(SUI_ADDRESS_REGEX.test('40cdfd49d252c798')).toBe(false);
    });

    it('rejects SuiNS names', () => {
      expect(SUI_ADDRESS_REGEX.test('alex.sui')).toBe(false);
    });
  });

  describe('SUI_ADDRESS_STRICT_REGEX', () => {
    it('matches a full 64-hex address', () => {
      expect(SUI_ADDRESS_STRICT_REGEX.test('0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62')).toBe(true);
    });

    it('rejects short addresses', () => {
      expect(SUI_ADDRESS_STRICT_REGEX.test('0x1')).toBe(false);
    });
  });

  describe('SUINS_NAME_REGEX', () => {
    it('matches simple .sui names', () => {
      expect(SUINS_NAME_REGEX.test('alex.sui')).toBe(true);
    });

    it('matches nested .sui labels', () => {
      expect(SUINS_NAME_REGEX.test('team.alex.sui')).toBe(true);
    });

    it('matches names with hyphens + digits', () => {
      expect(SUINS_NAME_REGEX.test('my-wallet-1.sui')).toBe(true);
    });

    it('rejects uppercase (caller must lowercase first)', () => {
      expect(SUINS_NAME_REGEX.test('Alex.sui')).toBe(false);
    });

    it('rejects names without .sui suffix', () => {
      expect(SUINS_NAME_REGEX.test('alex')).toBe(false);
    });

    it('rejects 0x addresses', () => {
      expect(SUINS_NAME_REGEX.test('0x40cdfd49')).toBe(false);
    });
  });

  describe('looksLikeSuiNs', () => {
    it('returns true for well-formed SuiNS names', () => {
      expect(looksLikeSuiNs('alex.sui')).toBe(true);
      expect(looksLikeSuiNs('team.alex.sui')).toBe(true);
    });

    it('lowercases + trims before matching', () => {
      expect(looksLikeSuiNs('  Alex.SUI  ')).toBe(true);
    });

    it('returns false for 0x addresses', () => {
      expect(looksLikeSuiNs('0x40cdfd49')).toBe(false);
    });

    it('returns false for contact aliases', () => {
      expect(looksLikeSuiNs('tom')).toBe(false);
      expect(looksLikeSuiNs('my_wallet')).toBe(false);
    });

    it('returns false for empty / whitespace', () => {
      expect(looksLikeSuiNs('')).toBe(false);
      expect(looksLikeSuiNs('   ')).toBe(false);
    });
  });

  describe('Error classes', () => {
    it('InvalidAddressError carries the raw input + sets name', () => {
      const err = new InvalidAddressError('not-an-address');
      expect(err.name).toBe('InvalidAddressError');
      expect(err.raw).toBe('not-an-address');
      expect(err.message).toContain('not-an-address');
      expect(err.message).toContain('alex.sui');
    });

    it('SuinsNotRegisteredError carries the name', () => {
      const err = new SuinsNotRegisteredError('nonexistent.sui');
      expect(err.name).toBe('SuinsNotRegisteredError');
      expect(err.name_).toBe('nonexistent.sui');
      expect(err.message).toContain('nonexistent.sui');
    });

    it('SuinsRpcError carries the name + detail', () => {
      const err = new SuinsRpcError('alex.sui', 'HTTP 503');
      expect(err.name).toBe('SuinsRpcError');
      expect(err.name_).toBe('alex.sui');
      expect(err.message).toContain('HTTP 503');
    });
  });
});
