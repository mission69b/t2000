// Package tier slug convention (S.1115 — SPEC_PACKAGE_TIERS): a package is
// three ordinary service rows `{base}-basic|standard|premium` on the same
// agent — no schema field, every row a normal listing + Hire target.
//
// COPIED (not imported) from audric `apps/console/lib/service-tiers.ts` +
// `service-slug.ts` (S.1161) — the SDK cannot depend on `@audric/*`; keep
// the two in step (the unit tests here mirror the console's cases).
//
// ORDER MATTERS (S.1171, the console's S.1161 lesson):
//   loner    → slugifyUnbounded(name).slice(0, 48)        = slugify / slugifyLoner
//   package  → packageBaseSlug(slugifyUnbounded(name))    = packageBaseFromName
// Capping at 48 BEFORE the 39-char tier-base budget cut long names twice and
// shipped mangled tier slugs (`…cryptocurrenc-basic`). Never do that.

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

/** The API's slug cap (SERVICE_SLUG_RE: 2–48 chars). */
export const MAX_SLUG_LENGTH = 48;

/** Lowercase kebab, edge dashes trimmed, NO length cap — the input to BOTH
 *  budgets below. */
export function slugifyUnbounded(name: string): string {
  return trimDashes(name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'));
}

/** Single-listing (loner) slug — the full 48-char budget. */
export function slugifyLoner(name: string): string {
  return slugifyUnbounded(name).slice(0, MAX_SLUG_LENGTH);
}

/** The CLI's name → slug rule for LONERS (`t2 service create`): lowercase,
 *  runs of non-alphanumerics → `-`, trimmed, 48-char cap. Loner-only — a
 *  package base must come from `packageBaseFromName`, never from this. */
export function slugify(name: string): string {
  return slugifyLoner(name);
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

/** Package base from a display name — unbounded kebab, THEN the tier-base
 *  budget (trailing dashes shed), so every `{base}-{tier}` is a valid slug
 *  with its suffix intact. Mirrors console `packageBaseFromName`. */
export function packageBaseFromName(name: string): string {
  return packageBaseSlug(slugifyUnbounded(name));
}

/** The three tier slugs for a base, Basic → Standard → Premium. */
export function packageTierSlugs(base: string): { tier: ServiceTier; slug: string }[] {
  return SERVICE_TIERS.map((tier) => ({ tier, slug: `${base}-${tier}` }));
}
