// Packages (S.1115 convention): ONE name, three tiers — `{base}-basic`,
// `{base}-standard`, `{base}-premium` — each an ordinary service row with
// its own price + deliverable. `createPackage` is three sequential upserts
// in tier order with `mode: "create"`, so a slug that is already LIVE on
// this seller fails loud (409) instead of silently replacing a listing.

import type { TransactionSigner } from '../signer.js';
import { invalidInput } from './http.js';
import {
  packageBaseFromName,
  packageBaseSlug,
  packageTierSlugs,
  SERVICE_SLUG_RE,
} from './package-slug.js';
import { upsertService } from './service.js';
import {
  type CreatePackageInput,
  type CreatePackageResult,
  type PackageTierInput,
  SERVICE_TIERS,
  type ServiceTier,
} from './types.js';

/** The three upsert payload inputs for a package, Basic → Premium (pure —
 *  unit-pinned; `createPackage` only adds the signer). */
export function planPackage(input: CreatePackageInput): {
  base: string;
  tiers: { tier: ServiceTier; slug: string; input: Parameters<typeof upsertService>[2] }[];
} {
  const name = input.name.trim();
  if (!name) {
    throw invalidInput('name is required.');
  }
  // S.1171: the base is the UNBOUNDED kebab run through the 39-char tier
  // budget — never a 48-capped slug first (that shipped `…cryptocurrenc-basic`
  // from the console until S.1161). A caller-supplied baseSlug is trusted as
  // given (trimmed + budgeted, not re-kebabed).
  const base = input.baseSlug
    ? packageBaseSlug(input.baseSlug.trim().toLowerCase())
    : packageBaseFromName(name);
  if (!base || !SERVICE_SLUG_RE.test(`${base}-basic`)) {
    throw invalidInput(
      'Could not derive a package slug from the name — pass baseSlug (a-z, 0-9, dashes).',
    );
  }
  const byTier = new Map<ServiceTier, PackageTierInput>();
  for (const t of input.tiers) {
    if (!(SERVICE_TIERS as readonly string[]).includes(t.tier)) {
      throw invalidInput(`Unknown tier "${t.tier}" — use basic, standard, premium.`);
    }
    if (byTier.has(t.tier)) {
      throw invalidInput(`Tier "${t.tier}" given twice.`);
    }
    byTier.set(t.tier, t);
  }
  const missing = SERVICE_TIERS.filter((t) => !byTier.has(t));
  if (missing.length > 0) {
    throw invalidInput(
      `A package needs all three tiers — missing: ${missing.join(', ')}.`,
    );
  }
  return {
    base,
    tiers: packageTierSlugs(base).map(({ tier, slug }) => {
      const t = byTier.get(tier) as PackageTierInput;
      return {
        tier,
        slug,
        input: {
          mode: 'create' as const,
          slug,
          name,
          description: (t.description ?? input.description).trim(),
          priceUsdc: t.priceUsdc,
          slaMinutes: t.slaMinutes ?? input.slaMinutes,
          deliverable: t.deliverable,
          requirements: input.requirements,
          reviewWindowMinutes: t.reviewWindowMinutes ?? input.reviewWindowMinutes,
          rejectSplitBps: t.rejectSplitBps ?? input.rejectSplitBps,
        },
      };
    }),
  };
}

export async function createPackage(
  apiBase: string,
  signer: TransactionSigner,
  input: CreatePackageInput,
): Promise<CreatePackageResult> {
  const plan = planPackage(input);
  const tiers: CreatePackageResult['tiers'] = [];
  for (const t of plan.tiers) {
    // Sequential on purpose: one nonce per signed write, and a collision on
    // any tier stops the set (the API refuses a live slug under mode create).
    await upsertService(apiBase, signer, t.input);
    tiers.push({ tier: t.tier, slug: t.slug, priceUsdc: t.input.priceUsdc });
  }
  return { address: signer.getAddress(), base: plan.base, tiers };
}
