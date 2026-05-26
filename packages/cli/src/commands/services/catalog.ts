// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// Shared MPP-catalog fetcher used by `t2 services search` and
// `t2 services inspect`. Mirrors the same `Service` shape the gateway
// returns from `https://mpp.t2000.ai/api/services` (the apps/gateway
// route at `apps/gateway/app/api/services/route.ts`).
//
// Kept on the CLI side intentionally — the SDK doesn't need this and
// the engine has its own `t2000_services` MCP tool. Wiring it through
// the SDK would force every downstream consumer to ship a gateway
// dependency.

export interface CatalogEndpoint {
  method: string;
  path: string;
  description: string;
  price: string;
}

export interface CatalogService {
  id: string;
  name: string;
  serviceUrl: string;
  description: string;
  chain: string;
  currency: string;
  categories: string[];
  logo: string;
  endpoints: CatalogEndpoint[];
}

const DEFAULT_GATEWAY_URL = 'https://mpp.t2000.ai';

/**
 * Resolve the gateway base URL. `T2000_GATEWAY_URL` env override lets
 * developers point the CLI at a local gateway during testing without
 * code changes.
 */
export function getGatewayUrl(override?: string): string {
  if (override) return stripTrailingSlash(override);
  const fromEnv = process.env.T2000_GATEWAY_URL;
  if (fromEnv && fromEnv.trim().length > 0) return stripTrailingSlash(fromEnv.trim());
  return DEFAULT_GATEWAY_URL;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export async function fetchCatalog(options?: {
  gatewayUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<CatalogService[]> {
  const base = getGatewayUrl(options?.gatewayUrl);
  const fetchFn = options?.fetchImpl ?? fetch;
  const res = await fetchFn(`${base}/api/services`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Service catalog fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Service catalog response was not an array.');
  }
  return data as CatalogService[];
}

/**
 * Pure case-insensitive substring filter over a catalog. Returns
 * services whose name, description, category list, OR any endpoint
 * description matches the query.
 */
export function filterCatalog(catalog: CatalogService[], query: string): CatalogService[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return catalog;
  return catalog.filter((svc) => {
    if (svc.name.toLowerCase().includes(q)) return true;
    if (svc.description.toLowerCase().includes(q)) return true;
    if (svc.id.toLowerCase().includes(q)) return true;
    if (svc.categories.some((c) => c.toLowerCase().includes(q))) return true;
    if (svc.endpoints.some((ep) => ep.description.toLowerCase().includes(q))) return true;
    if (svc.endpoints.some((ep) => ep.path.toLowerCase().includes(q))) return true;
    return false;
  });
}

/**
 * Locate a catalog entry by URL. Matches both service-base URLs
 * (`https://mpp.t2000.ai/openai`) and full endpoint URLs
 * (`https://mpp.t2000.ai/openai/v1/chat/completions`). When an
 * endpoint matches, the returned `endpoint` field points at the
 * specific entry.
 */
export function findByUrl(
  catalog: CatalogService[],
  url: string,
): { service: CatalogService; endpoint?: CatalogEndpoint } | null {
  const normalized = stripTrailingSlash(url.trim());
  for (const svc of catalog) {
    const svcBase = stripTrailingSlash(svc.serviceUrl);
    if (normalized === svcBase) {
      return { service: svc };
    }
    if (normalized.startsWith(`${svcBase}/`)) {
      const suffix = normalized.slice(svcBase.length); // includes leading "/"
      const endpoint = svc.endpoints.find((ep) => ep.path === suffix);
      return endpoint ? { service: svc, endpoint } : { service: svc };
    }
  }
  return null;
}
