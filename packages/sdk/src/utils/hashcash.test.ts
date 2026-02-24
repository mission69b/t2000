import { describe, it, expect } from 'vitest';
import { solveHashcash } from './hashcash.js';
import { createHash } from 'node:crypto';

function hasLeadingZeroBits(hash: Buffer, bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  const remainingBits = bits % 8;

  for (let i = 0; i < fullBytes; i++) {
    if (hash[i] !== 0) return false;
  }

  if (remainingBits > 0) {
    const mask = 0xff << (8 - remainingBits);
    if ((hash[fullBytes] & mask) !== 0) return false;
  }

  return true;
}

describe('hashcash', () => {
  it('solves a challenge with 8-bit difficulty', () => {
    const challenge = '1:8:20260219:testresource::abc123:';
    const stamp = solveHashcash(challenge);

    expect(stamp.startsWith(challenge)).toBe(true);

    const hash = createHash('sha256').update(stamp).digest();
    expect(hasLeadingZeroBits(hash, 8)).toBe(true);
  });

  it('solves a challenge with 12-bit difficulty', () => {
    const challenge = '1:12:20260219:testresource::def456:';
    const stamp = solveHashcash(challenge);

    const hash = createHash('sha256').update(stamp).digest();
    expect(hasLeadingZeroBits(hash, 12)).toBe(true);
  });

  it('produces deterministic valid stamps', () => {
    const challenge = '1:8:20260219:agent123::aabbcc:';
    const stamp1 = solveHashcash(challenge);
    const stamp2 = solveHashcash(challenge);

    // Same challenge should produce same stamp (deterministic counter)
    expect(stamp1).toBe(stamp2);
  });
});
