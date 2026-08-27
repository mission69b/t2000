import { describe, it, expect } from 'vitest';
import { MAX_JOB_USDC, MIN_JOB_USDC } from './job.js';
import {
  buildClaimOpeningTx,
  openingMinSellerLevel,
  preflightCreateOpening,
  type OpeningTerms,
} from './opening.js';
import { TRUST_REQUIREMENTS } from './trust.js';

function terms(overrides: Partial<OpeningTerms> = {}): OpeningTerms {
  return {
    amountUsdc: 5,
    specHash: `0x${'a'.repeat(64)}`,
    openUntilMs: Date.now() + 3_600_000,
    slaMs: 86_400_000,
    reviewWindowMs: 600_000,
    rejectSplitBps: 10_000,
    ...overrides,
  };
}

describe('preflightCreateOpening amount bounds (S.981)', () => {
  it('accepts sane terms', () => {
    expect(preflightCreateOpening(terms()).valid).toBe(true);
  });

  it('rejects a budget under the contract minimum with a human message', () => {
    const pf = preflightCreateOpening(terms({ amountUsdc: MIN_JOB_USDC - 0.000001 }));
    expect(pf.valid).toBe(false);
    expect(pf.error).toContain(`${MIN_JOB_USDC}`);
  });

  it('accepts the exact minimum', () => {
    expect(preflightCreateOpening(terms({ amountUsdc: MIN_JOB_USDC })).valid).toBe(true);
  });

  it('rejects a budget over the cap', () => {
    expect(preflightCreateOpening(terms({ amountUsdc: MAX_JOB_USDC + 1 })).valid).toBe(false);
  });

  // S.1191: openings share the job cap — $100 exactly passes, 100.01 refuses.
  it('cap is exactly $100: accepts 100, refuses 100.01', () => {
    expect(MAX_JOB_USDC).toBe(100);
    expect(preflightCreateOpening(terms({ amountUsdc: 100 })).valid).toBe(true);
    expect(preflightCreateOpening(terms({ amountUsdc: 100.01 })).valid).toBe(false);
  });
});


describe('preflightCreateOpening reject split (S.1019 v5)', () => {
  it('refuses anything but 10000 — open reject is 100% buyer', () => {
    const pf = preflightCreateOpening(terms({ rejectSplitBps: 8000 }));
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/100% buyer.*10000/s);
  });

  it('10000 passes', () => {
    expect(preflightCreateOpening(terms({ rejectSplitBps: 10_000 })).valid).toBe(true);
  });
});

describe('preflightCreateOpening trust requirement (S.1209 — the ONE knob)', () => {
  it('omitted requirement defaults to open and passes', () => {
    expect(preflightCreateOpening(terms()).valid).toBe(true);
  });

  it('accepts the four named requirements', () => {
    for (const trustRequirement of TRUST_REQUIREMENTS) {
      expect(preflightCreateOpening(terms({ trustRequirement })).valid).toBe(true);
    }
  });

  it('refuses unknown requirements with the four names', () => {
    const pf = preflightCreateOpening(
      terms({ trustRequirement: 'proven' as never }),
    );
    expect(pf.valid).toBe(false);
    expect(pf.error).toMatch(/open · established · top · veteran/);
  });

  it('trustRequirement wins over a raw minSellerLevel', () => {
    expect(
      openingMinSellerLevel({ trustRequirement: 'top', minSellerLevel: 2 }),
    ).toBe(3);
    expect(openingMinSellerLevel({ trustRequirement: 'open' })).toBe(0);
    expect(openingMinSellerLevel({ minSellerLevel: 4 })).toBe(4);
    expect(openingMinSellerLevel({})).toBe(0);
  });
});

describe('preflightCreateOpening minSellerLevel (S.1192 — low-level floor)', () => {
  it('accepts 0 (default) through 4', () => {
    for (const minSellerLevel of [0, 1, 2, 3, 4]) {
      expect(preflightCreateOpening(terms({ minSellerLevel })).valid).toBe(true);
    }
    expect(preflightCreateOpening(terms({})).valid).toBe(true);
  });

  it('refuses 5, negatives, and fractions', () => {
    for (const minSellerLevel of [5, -1, 1.5]) {
      const pf = preflightCreateOpening(terms({ minSellerLevel }));
      expect(pf.valid).toBe(false);
      if (!pf.valid) expect(pf.error).toMatch(/minSellerLevel/);
    }
  });
});

describe('buildClaimOpeningTx v2 routing (S.1192)', () => {
  const OPENING_ID = `0x${'a'.repeat(64)}`;
  const REGISTRY_ID = `0x${'b'.repeat(64)}`;
  const SCORE_ID = `0x${'c'.repeat(64)}`;

  function claimTarget(claimPolicy: number): string {
    const tx = buildClaimOpeningTx({
      openingId: OPENING_ID,
      registryId: REGISTRY_ID,
      scoreId: SCORE_ID,
      claimPolicy,
    });
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { module: string; function: string };
    }>;
    expect(calls).toHaveLength(1);
    return `${calls[0].MoveCall.module}::${calls[0].MoveCall.function}`;
  }

  it('policy 0 → claim_v2; policies 1/2 → claim_proven_v2 (never the dead v1 doors)', () => {
    expect(claimTarget(0)).toBe('opening::claim_v2');
    expect(claimTarget(1)).toBe('opening::claim_proven_v2');
    expect(claimTarget(2)).toBe('opening::claim_proven_v2');
  });

  it('refuses a missing scoreId in English (every claim moves the counter)', () => {
    expect(() =>
      buildClaimOpeningTx({
        openingId: OPENING_ID,
        registryId: REGISTRY_ID,
        scoreId: '',
      }),
    ).toThrow(/AgentScore/);
  });
});
