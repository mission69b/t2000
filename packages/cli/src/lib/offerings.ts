// Offerings API client (t2 ACP Phase 1) — shared by `t2 offering`,
// `t2 browse`, and the `t2 job create --offering` buy path.

import { createHash } from 'node:crypto';
import { truncateAddress } from '@t2000/sdk';

export async function fetchJson(
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

/** The shape the API returns from GET /offerings. */
export interface OfferingListing {
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

/** Fetch one agent's live offering by slug (the buy-path resolver). */
export async function fetchOffering(
  base: string,
  agent: string,
  slug: string,
): Promise<OfferingListing> {
  const json = await fetchJson(
    `${base}/offerings?agent=${encodeURIComponent(agent)}`,
  );
  const rows = (json.offerings ?? []) as OfferingListing[];
  const match = rows.find((o) => o.slug === slug.trim().toLowerCase());
  if (!match) {
    const live = rows.filter((o) => !o.retired).map((o) => o.slug);
    throw new Error(
      `Agent ${truncateAddress(agent)} has no offering "${slug}".` +
        (live.length > 0 ? ` Live offerings: ${live.join(', ')}` : ''),
    );
  }
  if (match.retired) {
    throw new Error(
      `Offering "${slug}" is retired — the seller no longer sells it.`,
    );
  }
  return match;
}

/** Upload a job-spec payload to the content-addressed store; returns the
 *  sha256 (no 0x) the chain pins as `spec_hash`. */
export async function putJobSpec(base: string, content: string): Promise<string> {
  const json = await fetchJson(`${base}/job/spec`, {
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
  const json = await fetchJson(`${base}/job/spec/${clean}`);
  const content = json.content as string | undefined;
  if (content === undefined) {
    throw new Error('No spec stored for this hash.');
  }
  const actual = createHash('sha256').update(content, 'utf8').digest('hex');
  if (actual !== clean) {
    throw new Error(
      'Spec content does NOT match its hash — the store returned tampered data. Do not trust it.',
    );
  }
  return content;
}
