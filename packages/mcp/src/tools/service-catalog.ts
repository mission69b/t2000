// [SPEC_AGENT_PAYMENTS_X402 item 2.4] Catalog-driven capability tools.
//
// At MCP startup we fetch the live gateway catalog (`/api/services`) and
// register one `t2000_<category>` tool per category (ai, search, data, media,
// commerce, …) — the discoverability surface every x402 gateway exposes. The
// catalog is read at RUNTIME (not baked at build time) so a new gateway
// service shows up on the next server start with zero package release; if the
// fetch fails the server degrades to the generic `t2000_pay` + `t2000_services`
// (no category tools, never a hard error).
//
// The fetch + grouping live here as pure, testable functions; the actual
// `server.tool(...)` registration (which shares the write mutex + pay handler)
// stays in `write.ts`.

const CATALOG_URL =
  (process.env.T2000_GATEWAY_URL ?? 'https://mpp.t2000.ai').replace(/\/+$/, '') + '/api/services';
const FETCH_TIMEOUT_MS = 2500;

export interface CatalogEndpoint {
  method: string;
  path: string;
  description?: string;
  price?: string;
}

export interface CatalogService {
  id: string;
  name: string;
  serviceUrl: string;
  categories?: string[];
  endpoints?: CatalogEndpoint[];
}

export interface CategoryToolSpec {
  /** Bare category, e.g. `ai`. */
  category: string;
  /** MCP tool name, e.g. `t2000_ai`. */
  toolName: string;
  /** Total endpoints across services tagged with this category. */
  endpointCount: number;
  /** Up to N `METHOD url ($price)` example lines for the tool description. */
  examples: string[];
}

/**
 * Fetch the gateway service catalog. Returns `null` on any failure (timeout,
 * non-200, non-array) so the caller degrades to the generic tools.
 */
export async function fetchServiceCatalog(timeoutMs = FETCH_TIMEOUT_MS): Promise<CatalogService[] | null> {
  // Opt-out (tests / airgapped / deterministic tool list): skip the fetch so
  // only the static tools register.
  if (process.env.T2000_MCP_DISABLE_CATEGORY_TOOLS === '1') return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(CATALOG_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data as CatalogService[]) : null;
  } catch {
    return null;
  }
}

/**
 * Group catalog endpoints by category into one tool spec per category.
 * Categories that aren't a clean `[a-z0-9]+` token (invalid MCP tool-name
 * fragment) are skipped. Deterministic order (alphabetical).
 */
export function deriveCategoryTools(services: CatalogService[], maxExamples = 3): CategoryToolSpec[] {
  const map = new Map<string, { count: number; examples: string[] }>();
  for (const svc of services) {
    const base = (svc.serviceUrl ?? '').replace(/\/+$/, '');
    for (const rawCat of svc.categories ?? []) {
      const cat = rawCat.toLowerCase();
      const entry = map.get(cat) ?? { count: 0, examples: [] };
      for (const ep of svc.endpoints ?? []) {
        entry.count++;
        if (entry.examples.length < maxExamples) {
          const price = ep.price ? ` ($${ep.price})` : '';
          entry.examples.push(`${ep.method} ${base}${ep.path}${price}`);
        }
      }
      map.set(cat, entry);
    }
  }
  return [...map.entries()]
    .filter(([cat]) => /^[a-z0-9]+$/.test(cat))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, info]) => ({
      category,
      toolName: `t2000_${category}`,
      endpointCount: info.count,
      examples: info.examples,
    }));
}
