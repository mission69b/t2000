// Seller-onboarding types (S.1158 — SPEC_HEADLESS_SELL_STACK §3). The
// wire shapes mirror the api.t2000.ai routes 1:1 so a CLI / Connect / host
// app can pass them through unchanged.

import type { TransactionSigner } from '../signer.js';

export interface CommerceClientOptions {
  /** The seller's signer — a keypair (`KeypairSigner`) or zkLogin Passport. */
  signer: TransactionSigner;
  /** API base (default `https://api.t2000.ai/v1`). Callers pointing at a
   *  custom host must pin it themselves — see `setSponsoredTxGuard`. */
  apiBase?: string;
}

/** The directory categories `/v1/agent/profile` accepts — the server is the
 *  authority and rejects off-enum values; this mirror fails fast locally. */
export const AGENT_CATEGORIES = [
  'ai-models',
  'data-feeds',
  'finance',
  'research',
  'dev-tools',
  'creative',
  'travel',
  'comms',
  'other',
] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

export interface RegisterResult {
  address: string;
  /** True when the address was already an Agent ID — nothing was signed. */
  alreadyRegistered: boolean;
  /** The register tx digest (absent when already registered). */
  digest?: string;
}

/** POST /v1/agent/profile — every field optional; omitted = untouched. */
export interface ProfileUpdateInput {
  /** Display name (≤60 chars). */
  name?: string;
  /** https image URL. */
  imageUrl?: string;
  /** Short description (≤500 chars). */
  description?: string;
  category?: AgentCategory | string;
  website?: string;
  twitter?: string;
  github?: string;
}

/** The public profile row (GET /v1/agents/:address) — the fields a seller
 *  flow reads back. Extra server fields pass through untouched. */
export interface AgentProfile {
  address: string;
  name?: string | null;
  numericId?: number | null;
  category?: string | null;
  active?: boolean;
  [key: string]: unknown;
}

/** POST /v1/agent/service action "upsert" — a FULL upsert (omitted
 *  optionals take the server defaults: review 1440 min, split 8000 bps). */
export interface ServiceUpsertInput {
  /** 2–48 chars of [a-z0-9-]; derive one with `slugify`. */
  slug: string;
  /** ≤80 chars. */
  name: string;
  /** ≤2000 chars. */
  description: string;
  /** Fixed price in USDC — within the escrow job bounds. */
  priceUsdc: number;
  /** Delivery window once hired (minutes). */
  slaMinutes: number;
  /** What the buyer receives (≤1000 chars). */
  deliverable: string;
  /** REQUIRED by the API: the questions buyers answer at hire — free text,
   *  or an object of field names → hints. */
  requirements: string | Record<string, unknown>;
  reviewWindowMinutes?: number;
  rejectSplitBps?: number;
  /** "create" refuses a LIVE slug (409) — the safe default for new
   *  listings; "update" (the API default) overwrites. */
  mode?: 'create' | 'update';
  /** Gallery (S.1114) — omitted keeps the live set; [] clears it. */
  examples?: unknown[];
}

export interface ServiceWriteResult {
  address: string;
  slug: string;
  /** The API's response body, verbatim. */
  response: Record<string, unknown>;
}

export const SERVICE_TIERS = ['basic', 'standard', 'premium'] as const;
export type ServiceTier = (typeof SERVICE_TIERS)[number];

/** One tier of a package — price + deliverable are the tier's own; the
 *  rest defaults to the package-level values. */
export interface PackageTierInput {
  tier: ServiceTier;
  priceUsdc: number;
  deliverable: string;
  slaMinutes?: number;
  description?: string;
  reviewWindowMinutes?: number;
  rejectSplitBps?: number;
}

export interface CreatePackageInput {
  /** The package name — every tier carries it; the tier lives in the slug. */
  name: string;
  description: string;
  requirements: string | Record<string, unknown>;
  /** Default delivery window for tiers that don't set their own. */
  slaMinutes: number;
  /** All three tiers, in any order; each tier at most once. */
  tiers: PackageTierInput[];
  /** Override the derived base slug (`packageBaseSlug(slugify(name))`). */
  baseSlug?: string;
  reviewWindowMinutes?: number;
  rejectSplitBps?: number;
}

export interface CreatePackageResult {
  address: string;
  base: string;
  tiers: { tier: ServiceTier; slug: string; priceUsdc: number }[];
}

export interface EndpointIssue {
  code?: string;
  message?: string;
}

export interface EndpointRoute {
  method?: string;
  path?: string;
  url?: string;
  priceUsdc?: string | null;
  summary?: string | null;
  probeOk?: boolean;
  issues?: EndpointIssue[];
}

export interface EndpointListing {
  address: string;
  /** The primary paid URL (null after a remove). */
  endpoint: string | null;
  listed: boolean;
  probe: {
    ok?: boolean;
    amount?: string | null;
    currency?: string | null;
    issues?: EndpointIssue[];
  } | null;
  origin: string | null;
  primary: { path?: string; url?: string } | null;
  routes: EndpointRoute[];
  digest?: string;
}

/** `/v1/agents/resolve` — `#93` · `93` · `@handle` · `name.sui` · `0x…`. */
export interface AgentRef {
  address: string;
  numericId?: number | null;
  name?: string;
}
