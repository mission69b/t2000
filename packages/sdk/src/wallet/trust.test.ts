import { describe, it, expect } from 'vitest';
import {
  minSellerLevelForTrustRequirement,
  parseTrustRequirement,
  TRUST_REQUIREMENT_MIN_LEVEL,
  TRUST_REQUIREMENTS,
} from './trust.js';

describe('trustRequirement write mapping (S.1209 — the ONE buyer knob)', () => {
  it('locks the SSOT: open 0 · established 2 · top 3 · veteran 4', () => {
    expect(TRUST_REQUIREMENT_MIN_LEVEL).toEqual({
      open: 0,
      established: 2,
      top: 3,
      veteran: 4,
    });
    for (const req of TRUST_REQUIREMENTS) {
      expect(minSellerLevelForTrustRequirement(req)).toBe(
        TRUST_REQUIREMENT_MIN_LEVEL[req],
      );
    }
    // A floor of 1 is not a product state — no requirement maps to it.
    expect(Object.values(TRUST_REQUIREMENT_MIN_LEVEL)).not.toContain(1);
  });

  it('parses case-insensitively, trimmed', () => {
    expect(parseTrustRequirement('open')).toBe('open');
    expect(parseTrustRequirement(' TOP ')).toBe('top');
    expect(parseTrustRequirement('Established')).toBe('established');
    expect(parseTrustRequirement('veteran')).toBe('veteran');
  });

  it('refuses legacy numbers and Proven vocabulary with the four names', () => {
    for (const bad of ['0', '1', '2', 'proven', 'anyone', '']) {
      expect(() => parseTrustRequirement(bad)).toThrow(
        /open · established · top · veteran/,
      );
    }
  });
});
