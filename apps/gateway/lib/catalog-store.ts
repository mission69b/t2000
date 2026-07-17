// [SPEC_CATALOG_SELF_LISTING] Redis-backed dynamic catalog entries — the
// permissionless direct-seller half of the catalog. Static `lib/services.ts`
// stays the SSOT for proxied services + any hand-curated rows; dynamic
// entries are written by /api/catalog/submit after the machine gates pass
// and merged in via `getCatalog()` (lib/catalog-live.ts).
//
// One entry per Agent ID (mirrors the one-listing-per-agent profile rule).
// Lifecycle: live → suspended (N consecutive re-probe failures; auto-recovers
// when the probe passes) → delisted (admin lever; terminal until cleared).
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import type { Service } from './services';

const ENTRY_PREFIX = 'mpp:catalog:entry:';
const INDEX_KEY = 'mpp:catalog:index';

export type CatalogEntryState = 'live' | 'suspended' | 'delisted';

export interface DynamicCatalogEntry {
  /** Full catalog row (always `direct: true` with a pinned `payTo`). */
  service: Service;
  /** The seller's Agent ID wallet — the entry key; the 402 must pay it. */
  agentAddress: string;
  /** The on-chain mcpEndpoint at listing time — what the re-probe hits. */
  probeUrl: string;
  state: CatalogEntryState;
  /** Consecutive re-probe failures (reset to 0 on a passing probe). */
  failCount: number;
  submittedAt: string;
  updatedAt: string;
  lastProbeAt?: string;
  lastProbeIssues?: string[];
}

let _redis: Redis | undefined;

function redis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: env.KV_REST_API_URL!,
      token: env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}

/** Test seam — inject a fake Redis. */
export function setCatalogRedis(client: Redis | undefined): void {
  _redis = client;
}

export async function getEntry(agentAddress: string): Promise<DynamicCatalogEntry | null> {
  return await redis().get<DynamicCatalogEntry>(ENTRY_PREFIX + agentAddress);
}

export async function putEntry(entry: DynamicCatalogEntry): Promise<void> {
  await redis().set(ENTRY_PREFIX + entry.agentAddress, entry);
  await redis().sadd(INDEX_KEY, entry.agentAddress);
}

export async function removeEntry(agentAddress: string): Promise<void> {
  await redis().del(ENTRY_PREFIX + agentAddress);
  await redis().srem(INDEX_KEY, agentAddress);
}

export async function listEntries(): Promise<DynamicCatalogEntry[]> {
  const addresses = await redis().smembers(INDEX_KEY);
  if (addresses.length === 0) return [];
  const keys = addresses.map((a) => ENTRY_PREFIX + a);
  const rows = await redis().mget<(DynamicCatalogEntry | null)[]>(...keys);
  return rows.filter((r): r is DynamicCatalogEntry => r !== null);
}

/** The rows the public catalog surfaces merge in. */
export async function listLiveServices(): Promise<Service[]> {
  const entries = await listEntries();
  return entries.filter((e) => e.state === 'live').map((e) => e.service);
}
