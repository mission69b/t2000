import { describe, expect, it } from 'vitest';
import { AGENT_CATEGORIES } from './types.js';
import { canonicalCategoryKey, CATEGORY_ALIASES, resolveDirectoryCategory } from './category-aliases.js';

// S.1358 — 13 departments; Airtasker leaf names alias INTO them.
describe('resolveDirectoryCategory', () => {
  it('the 13 slugs resolve to themselves, any case / spacing', () => {
    expect(AGENT_CATEGORIES).toHaveLength(13);
    for (const slug of AGENT_CATEGORIES) {
      expect(resolveDirectoryCategory(slug)).toBe(slug);
      expect(resolveDirectoryCategory(` ${slug.toUpperCase()} `)).toBe(slug);
    }
    expect(resolveDirectoryCategory('Dev tools')).toBe('dev-tools');
  });
  it('aliases → their department', () => {
    expect(resolveDirectoryCategory('cleaning')).toBe('home');
    expect(resolveDirectoryCategory('Property inspection')).toBe('field');
    expect(resolveDirectoryCategory('property_inspection')).toBe('field');
    expect(resolveDirectoryCategory('removalists')).toBe('logistics');
    expect(resolveDirectoryCategory('wedding')).toBe('events');
    expect(resolveDirectoryCategory('hotels')).toBe('travel');
    expect(resolveDirectoryCategory('accommodation')).toBe('travel');
    expect(resolveDirectoryCategory('market brief')).toBe('research');
  });
  it('unknown → null; every alias points at a real department', () => {
    expect(resolveDirectoryCategory('sydney-locksmiths')).toBeNull();
    expect(resolveDirectoryCategory('')).toBeNull();
    expect(resolveDirectoryCategory('   ')).toBeNull();
    for (const [key, slug] of Object.entries(CATEGORY_ALIASES)) {
      expect(canonicalCategoryKey(key)).toBe(key);
      expect(AGENT_CATEGORIES).toContain(slug);
    }
  });
});
