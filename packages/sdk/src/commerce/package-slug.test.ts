import { describe, expect, it } from 'vitest';
import {
  MAX_TIER_BASE_LENGTH,
  packageBaseSlug,
  packageTierSlugs,
  parseServiceTierSlug,
  SERVICE_SLUG_RE,
  slugify,
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
