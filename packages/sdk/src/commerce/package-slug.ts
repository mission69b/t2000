// Package tier slug convention (S.1115 — SPEC_PACKAGE_TIERS): a package is
// three ordinary service rows `{base}-basic|standard|premium` on the same
// agent — no schema field, every row a normal listing + Hire target.
//
// COPIED (not imported) from audric `apps/console/lib/service-tiers.ts` —
// the SDK cannot depend on `@audric/*`; keep the two in step (the unit
// tests here mirror the console's budget/parse cases).

import { SERVICE_TIERS, type ServiceTier } from './types.js';

/** The API's slug grammar: 2–48 chars of [a-z0-9-], alphanumeric first. */
export const SERVICE_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;

/** Strip leading/trailing dashes in linear time (a `^-+|-+$` regex is
 *  polynomial on dash runs — CodeQL js/polynomial-redos). */
export function trimDashes(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) === 45) start += 1;
  while (end > start && s.charCodeAt(end - 1) === 45) end -= 1;
  return s.slice(start, end);
}

/** The CLI's name → slug rule (lowercase, runs of non-alphanumerics → `-`,
 *  trimmed, 48-char cap). */
export function slugify(name: string): string {
  return trimDashes(name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')).slice(0, 48);
}

// Suffix must be the FINAL segment: `logo-pack-basic` parses,
// `foo-basic-extra` is a loner.
const TIER_SLUG_RE = /^(.+)-(basic|standard|premium)$/;

/** `{base}-standard` is the longest tier slug; slugs cap at 48 chars, so a
 *  package base may be at most 48 - "-standard".length. */
export const MAX_TIER_BASE_LENGTH = 48 - '-standard'.length;

export function parseServiceTierSlug(
  slug: string,
): { base: string; tier: ServiceTier } | null {
  const m = TIER_SLUG_RE.exec(slug);
  if (!m) {
    return null;
  }
  return { base: m[1], tier: m[2] as ServiceTier };
}

/** Truncate a slugified name into a valid package base (trailing dashes
 *  shed so `{base}-basic` never carries `--`). Empty in → empty out —
 *  callers validate. */
export function packageBaseSlug(slugified: string): string {
  const cut = slugified.slice(0, MAX_TIER_BASE_LENGTH);
  let end = cut.length;
  while (end > 0 && cut.charCodeAt(end - 1) === 45) end -= 1;
  return cut.slice(0, end);
}

/** The three tier slugs for a base, Basic → Standard → Premium. */
export function packageTierSlugs(base: string): { tier: ServiceTier; slug: string }[] {
  return SERVICE_TIERS.map((tier) => ({ tier, slug: `${base}-${tier}` }));
}
