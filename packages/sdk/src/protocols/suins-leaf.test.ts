import { describe, it, expect, vi } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';

import {
  AUDRIC_PARENT_NAME,
  AUDRIC_PARENT_NFT_ID,
  buildAddLeafTx,
  buildRevokeLeafTx,
  fullHandle,
  validateLabel,
} from './suins-leaf.js';

const VALID_TARGET = '0x4e1271b48a4c2dc4d18edcaa9b0a40fe70eb20ed16dad7c81df4a3f0c3e8480f';

const createLeafSubName = vi.fn();
const removeLeafSubName = vi.fn();

vi.mock('@mysten/suins', () => ({
  SuinsTransaction: vi.fn().mockImplementation(() => ({
    createLeafSubName,
    removeLeafSubName,
  })),
}));

const fakeSuinsClient = {} as Parameters<typeof buildAddLeafTx>[0];

describe('suins-leaf', () => {
  describe('constants', () => {
    it('parent name is audric.sui', () => {
      expect(AUDRIC_PARENT_NAME).toBe('audric.sui');
    });

    it('parent NFT ID is the canonical mainnet object', () => {
      expect(AUDRIC_PARENT_NFT_ID).toBe(
        '0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198',
      );
    });
  });

  describe('validateLabel', () => {
    it.each([
      ['alice', true],
      ['abc', true],
      ['a-b-c', true],
      ['user1', true],
      ['team-2026', true],
      ['x'.repeat(63), true],
    ])('accepts valid label "%s"', (label, _) => {
      expect(validateLabel(label).valid).toBe(true);
    });

    it.each([
      ['ab', 'too short (2 chars)'],
      ['', 'empty string'],
      ['x'.repeat(64), 'too long (64 chars)'],
      ['Alice', 'uppercase'],
      ['ALICE', 'all uppercase'],
      ['alice_bob', 'underscore'],
      ['alice.bob', 'dot in label'],
      ['-alice', 'leading hyphen'],
      ['alice-', 'trailing hyphen'],
      ['ali--ce', 'consecutive hyphens'],
      ['alice bob', 'space'],
      ['ali!ce', 'special char'],
      ['ali😀ce', 'emoji'],
    ])('rejects invalid label "%s" (%s)', (label, _reason) => {
      const result = validateLabel(label);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeTruthy();
      }
    });

    it('rejects non-string input', () => {
      expect(validateLabel(123).valid).toBe(false);
      expect(validateLabel(null).valid).toBe(false);
      expect(validateLabel(undefined).valid).toBe(false);
      expect(validateLabel({}).valid).toBe(false);
    });
  });

  describe('fullHandle', () => {
    it('appends the parent name', () => {
      expect(fullHandle('alice')).toBe('alice.audric.sui');
    });

    it('does not validate the label (callers must validateLabel first if needed)', () => {
      expect(fullHandle('Alice')).toBe('Alice.audric.sui');
    });
  });

  describe('buildAddLeafTx', () => {
    it('returns a Transaction', () => {
      createLeafSubName.mockClear();
      const tx = buildAddLeafTx(fakeSuinsClient, {
        label: 'alice',
        targetAddress: VALID_TARGET,
      });
      expect(tx).toBeInstanceOf(Transaction);
    });

    it('passes the full <label>.audric.sui name to createLeafSubName', () => {
      createLeafSubName.mockClear();
      buildAddLeafTx(fakeSuinsClient, { label: 'alice', targetAddress: VALID_TARGET });
      expect(createLeafSubName).toHaveBeenCalledWith({
        parentNft: AUDRIC_PARENT_NFT_ID,
        name: 'alice.audric.sui',
        targetAddress: VALID_TARGET,
      });
    });

    it('throws on invalid label', () => {
      expect(() =>
        buildAddLeafTx(fakeSuinsClient, { label: 'ab', targetAddress: VALID_TARGET }),
      ).toThrow(/invalid label "ab"/);
    });

    it('throws on malformed targetAddress', () => {
      expect(() =>
        buildAddLeafTx(fakeSuinsClient, { label: 'alice', targetAddress: 'not-an-address' }),
      ).toThrow(/invalid targetAddress/);
    });

    it('throws on non-string targetAddress', () => {
      expect(() =>
        buildAddLeafTx(fakeSuinsClient, {
          label: 'alice',
          targetAddress: 123 as unknown as string,
        }),
      ).toThrow(/invalid targetAddress/);
    });
  });

  describe('buildRevokeLeafTx', () => {
    it('returns a Transaction', () => {
      removeLeafSubName.mockClear();
      const tx = buildRevokeLeafTx(fakeSuinsClient, { label: 'alice' });
      expect(tx).toBeInstanceOf(Transaction);
    });

    it('passes the full <label>.audric.sui name to removeLeafSubName', () => {
      removeLeafSubName.mockClear();
      buildRevokeLeafTx(fakeSuinsClient, { label: 'alice' });
      expect(removeLeafSubName).toHaveBeenCalledWith({
        parentNft: AUDRIC_PARENT_NFT_ID,
        name: 'alice.audric.sui',
      });
    });

    it('throws on invalid label', () => {
      expect(() => buildRevokeLeafTx(fakeSuinsClient, { label: 'AB' })).toThrow(
        /invalid label "AB"/,
      );
    });
  });
});
