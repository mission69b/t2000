import { describe, expect, it } from 'vitest';
import {
  MAX_SLUG_LENGTH,
  MAX_TIER_BASE_LENGTH,
  packageBaseFromName,
  packageBaseSlug,
  packageTierSlugs,
  parseServiceTierSlug,
  SERVICE_SLUG_RE,
  slugify,
  slugifyLoner,
  slugifyUnbounded,
} from './package-slug.js';

// S.1158 — COPIED from audric `apps/console/lib/service-tiers.ts`; these
// cases mirror the console's own tests so the two cannot drift silently.

describe('package slug math (parity with console service-tiers)', () => {
  it('parse — final segment only, empty base rejected', () => {
    expect(parseServiceTierSlug('logo-pack-basic')).toEqual({ base: 'logo-pack', tier: 'basic' });
    expect(parseServiceTierSlug('x-premium')).toEqual({ base: 'x', tier: 'premium' });
    expect(parseServiceTierSlug('foo-basic-extra')).toBeNull();
    expect(parseServiceTierSlug('basic')).toBeNull();
    expect(parseServiceTierSlug('-basic')).toBeNull();
    expect(parseServiceTierSlug('plain-service')).toBeNull();
  });

  it('base budget keeps {base}-standard within the 48-char slug cap', () => {
    // 48 - '-standard'.length — the console's own value (the spec's "38" was
    // off by one; parity with audric service-tiers.ts is the lock).
    expect(MAX_TIER_BASE_LENGTH).toBe(39);
    const base = packageBaseSlug('x'.repeat(80));
    expect(base).toHaveLength(MAX_TIER_BASE_LENGTH);
    expect(`${base}-standard`.length).toBeLessThanOrEqual(48);
    expect(packageBaseSlug(`${'y'.repeat(MAX_TIER_BASE_LENGTH - 1)}--tail`).endsWith('-')).toBe(false);
  });

  it('slugify matches the CLI rule and every tier slug passes the API grammar', () => {
    expect(slugify('  Sui Market Report!! ')).toBe('sui-market-report');
    expect(slugify('---')).toBe('');
    expect(slugify('a')).toBe('a');
    expect(packageBaseSlug('---')).toBe('');
    const base = packageBaseSlug(slugify('Brand kit — logos, colours & type, the full identity system'));
    for (const { slug } of packageTierSlugs(base)) {
      expect(slug).toMatch(SERVICE_SLUG_RE);
    }
    expect(packageTierSlugs('brand-kit').map((t) => t.slug)).toEqual([
      'brand-kit-basic',
      'brand-kit-standard',
      'brand-kit-premium',
    ]);
  });
});

// S.1171 — parity with console `service-slug.ts` (S.1161): a long package
// name must go UNBOUNDED kebab → tier-base budget. The old path (48-cap,
// THEN budget) cut the name twice and shipped `…cryptocurrenc-basic`.
describe('package base from a long name (S.1171 — console parity)', () => {
  const LONG =
    'Deep-dive research report on any cryptocurrency token, with on-chain data and sources';

  it('slugify stays the 48-cap loner rule; slugifyUnbounded has no cap', () => {
    expect(slugify('  Sui Market Report!! ')).toBe('sui-market-report');
    expect(slugify(LONG)).toHaveLength(MAX_SLUG_LENGTH);
    expect(slugifyLoner(LONG)).toBe(slugify(LONG));
    expect(slugifyUnbounded(LONG).length).toBeGreaterThan(MAX_SLUG_LENGTH);
    expect(slugifyUnbounded('---')).toBe('');
  });

  it('packageBaseFromName: base ≤ 39, every tier slug ≤ 48 with its suffix intact — the console\'s exact base', () => {
    const base = packageBaseFromName(LONG);
    // The console (apps/console/lib/service-slug.ts) yields this for the
    // same name — pinned literally so the two cannot drift.
    expect(base).toBe('deep-dive-research-report-on-any-crypto');
    expect(base.length).toBeLessThanOrEqual(MAX_TIER_BASE_LENGTH);
    for (const { tier, slug } of packageTierSlugs(base)) {
      expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
      expect(slug).toMatch(SERVICE_SLUG_RE);
      expect(slug.endsWith(`-${tier}`)).toBe(true);
    }
  });

  it('the old order (48-cap first) is never shorter-or-equal by accident — the budget runs once', () => {
    const old = packageBaseSlug(slugify(LONG));
    const fixed = packageBaseFromName(LONG);
    // Both land within budget, but the fixed base is computed ONCE from the
    // unbounded kebab; the old path could lose up to 9 extra chars.
    expect(fixed.length).toBeGreaterThanOrEqual(old.length);
    expect(packageBaseFromName('Market report')).toBe('market-report');
  });
});
