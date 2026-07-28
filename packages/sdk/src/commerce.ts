// Commerce API client (t2 ACP) — agent services + the content-addressed
// job-spec store on api.t2000.ai. Shared by `@t2000/cli` (`t2 service` /
// `t2 browse` / `t2 job`) and `@t2000/mcp` (the t2000_service_* / t2000_job_*
// tools) so the tamper-verify logic exists exactly once.
//
// Browser-safe: hashing uses WebCrypto (`crypto.subtle`), available in every
// browser and Node >= 18. No fs, no node:crypto.

import { truncateAddress } from './utils/sui.js';

export const DEFAULT_COMMERCE_API_BASE = 'https://api.t2000.ai/v1';

async function commerceFetchJson(
  url: string,
  init?: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string })?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}

/** The shape the API returns from GET /v1/services. */
export interface ServiceListing {
  agent: string;
  agentName: string | null;
  agentNumericId: number | null;
  slug: string;
  name: string;
  description: string;
  priceUsdc: number;
  slaMinutes: number;
  reviewWindowMinutes: number;
  rejectSplitBps: number;
  requirements: unknown;
  deliverable: string;
  retired: boolean;
}

/** Browse / list agent services — free-text `query` across every agent, or
 *  one agent's full catalog (retired included) via `agent`. */
export async function listServices(
  base: string,
  filter: { agent?: string; query?: string } = {},
): Promise<{ total: number; services: ServiceListing[] }> {
  const params = new URLSearchParams();
  if (filter.agent) params.set('agent', filter.agent);
  if (filter.query) params.set('q', filter.query);
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  const json = await commerceFetchJson(`${base}/services${qs}`);
  const services = (json.services ?? []) as ServiceListing[];
  return { total: (json.total as number | undefined) ?? services.length, services };
}

/** Fetch one agent's live service by slug (the buy-path resolver). */
export async function fetchService(
  base: string,
  agent: string,
  slug: string,
): Promise<ServiceListing> {
  const { services: rows } = await listServices(base, { agent });
  const match = rows.find((o) => o.slug === slug.trim().toLowerCase());
  if (!match) {
    const live = rows.filter((o) => !o.retired).map((o) => o.slug);
    throw new Error(
      `Agent ${truncateAddress(agent)} has no service "${slug}".` +
        (live.length > 0 ? ` Live services: ${live.join(', ')}` : ''),
    );
  }
  if (match.retired) {
    throw new Error(
      `Service "${slug}" is retired — the seller no longer sells it.`,
    );
  }
  return match;
}

/** Field map of an object-shaped listing `requirements` — the object itself,
 *  or its JSON-schema-ish `{ properties: {…} }` wrapper (sellers write both). */
function requirementFieldMap(listing: Record<string, unknown>): Record<string, unknown> {
  const props = listing.properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    return props as Record<string, unknown>;
  }
  return listing;
}

function requirementHint(value: unknown): string {
  if (typeof value === 'string') return value;
  // JSON-schema-ish field: prefer the human description over raw JSON.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const desc = (value as Record<string, unknown>).description;
    if (typeof desc === 'string' && desc.trim().length > 0) return desc;
  }
  return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The buyer-requirements gate (SPEC_ACP_JOB_SPEC_V1 §4.1) — ONE implementation
 * shared by `t2 job hire`, MCP `t2000_job_hire`, and the console's
 * hire-prepare, so a hire can never fund with an unusable brief.
 *
 *   1. Listing has no `requirements` → the buyer may omit (anything passes).
 *   2. String listing → any NON-object payload whose `String(v).trim()` is
 *      non-empty (scalars fine; objects rejected — the seller asked for text).
 *   3. Object listing (or `{ properties: {…} }`) → payload must be an object
 *      and EVERY listing key present + trim-non-empty. EXTRA buyer keys are
 *      allowed (forward-compatible; never required).
 *
 * Fails closed with the missing keys + the seller's own hints echoed, so an
 * agent can self-correct without a human reading the listing.
 */
export function assertBuyerRequirements(
  listingRequirements: unknown,
  buyerPayload: unknown,
): void {
  if (listingRequirements == null) {
    return; // rule 1 — nothing asked, nothing checked
  }

  if (isPlainObject(listingRequirements)) {
    const fields = requirementFieldMap(listingRequirements);
    // JSON-Schema-shaped listings ({ properties, required: [...] }) mark a
    // SUBSET as required — the rest are optional and must not block a hire
    // (live #80-class listings do exactly this). Plain field maps without a
    // `required` array require every key.
    const requiredRaw = listingRequirements.required;
    const keys =
      isPlainObject(listingRequirements.properties) &&
      Array.isArray(requiredRaw) &&
      requiredRaw.every((k) => typeof k === 'string')
        ? (requiredRaw as string[])
        : Object.keys(fields);
    if (keys.length === 0) {
      return; // nothing (required) asked
    }
    if (!isPlainObject(buyerPayload)) {
      throw new Error(
        `This service needs a JSON requirements object with: ${keys.join(', ')}. ` +
          `The seller asks for: ${JSON.stringify(fields)}`,
      );
    }
    const missing = keys.filter(
      (key) => String(buyerPayload[key] ?? '').trim().length === 0,
    );
    if (missing.length > 0) {
      const hints = missing
        .map((key) => `${key} — ${requirementHint(fields[key])}`)
        .join('; ');
      throw new Error(
        `Missing required field(s): ${missing.join(', ')}. The seller asks for: ${hints}`,
      );
    }
    return;
  }

  // Rule 2 — string (or any other free-form) listing: the seller asked for
  // text, so an object payload is a shape mismatch, not a fill.
  const hint = requirementHint(listingRequirements);
  if (typeof buyerPayload === 'object' && buyerPayload !== null) {
    throw new Error(
      `This service expects free-text requirements, not JSON. The seller asks for: ${hint}`,
    );
  }
  if (String(buyerPayload ?? '').trim().length === 0) {
    throw new Error(
      `This service needs requirements. The seller asks for: ${hint}`,
    );
  }
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Upload a job-spec payload to the content-addressed store; returns the
 *  sha256 (no 0x) the chain pins as `spec_hash`. */
export async function putJobSpec(base: string, content: string): Promise<string> {
  const json = await commerceFetchJson(`${base}/job/spec`, {
    method: 'POST',
    body: { content },
  });
  const hash = json.hash as string | undefined;
  if (!hash) {
    throw new Error('Failed to store the job spec.');
  }
  return hash;
}

/** Fetch a job-spec payload by hash and VERIFY it (sha256(content) == hash —
 *  the store is untrusted; the chain hash is the authority). */
export async function getJobSpec(base: string, hash: string): Promise<string> {
  const clean = hash.trim().toLowerCase().replace(/^0x/, '');
  const json = await commerceFetchJson(`${base}/job/spec/${clean}`);
  const content = json.content as string | undefined;
  if (content === undefined) {
    throw new Error('No spec stored for this hash.');
  }
  const actual = await sha256Hex(content);
  if (actual !== clean) {
    throw new Error(
      'Spec content does NOT match its hash — the store returned tampered data. Do not trust it.',
    );
  }
  return content;
}
