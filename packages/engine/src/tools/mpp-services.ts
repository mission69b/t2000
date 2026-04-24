import { z } from 'zod';
import { buildTool } from '../tool.js';

const MPP_GATEWAY = 'https://mpp.t2000.ai';
const CATALOG_URL = `${MPP_GATEWAY}/api/services`;
const CACHE_TTL = 120_000;

interface GatewayEndpoint {
  method: string;
  path: string;
  description: string;
  price: string;
}

interface GatewayService {
  id: string;
  name: string;
  serviceUrl: string;
  description: string;
  categories: string[];
  endpoints: GatewayEndpoint[];
}

let catalogCache: { data: GatewayService[]; ts: number } | null = null;

async function fetchCatalog(): Promise<GatewayService[]> {
  if (catalogCache && Date.now() - catalogCache.ts < CACHE_TTL) {
    return catalogCache.data;
  }
  const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`MPP catalog fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as GatewayService[];
  catalogCache = { data, ts: Date.now() };
  return data;
}

function renderServices(catalog: GatewayService[]) {
  return catalog.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    categories: s.categories,
    endpoints: s.endpoints.map((e) => ({
      url: `${MPP_GATEWAY}/${s.id}${e.path}`,
      method: e.method,
      description: e.description,
      price: `$${e.price}`,
    })),
  }));
}

function matchesQuery(service: GatewayService, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    service.id.toLowerCase().includes(lower) ||
    service.name.toLowerCase().includes(lower) ||
    service.description.toLowerCase().includes(lower) ||
    service.categories.some((c) => c.toLowerCase().includes(lower)) ||
    service.endpoints.some((e) => e.description.toLowerCase().includes(lower))
  );
}

export const mppServicesTool = buildTool({
  name: 'mpp_services',
  description:
    'Discover available MPP gateway services. Returns service names, descriptions, endpoints with required parameters, and pricing. Use BEFORE calling pay_api. With no args, returns the FULL catalog as a single card (default behavior — covers "show me available MPP services", "what services exist", "show me all MPP services"). Use `query` to keyword-search a specific need ("translate", "weather", "postcard"). Use `category` to filter to one category. Use `mode: "summary"` only if you explicitly want a category-counts overview without the full list.',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Filter by keyword (e.g. "postcard", "translate", "weather"). Returns matching services in one card.'),
    category: z
      .string()
      .optional()
      .describe('Filter by category exactly (e.g. "weather", "image"). Use mode:"summary" first if you need to see the category list.'),
    mode: z
      .enum(['summary', 'full'])
      .optional()
      .describe('"full" (default) returns the entire catalog in one card. "summary" returns category counts only — use this only when the user explicitly asks for a category overview.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Filter by keyword (e.g. "postcard", "translate", "weather").',
      },
      category: {
        type: 'string',
        description: 'Filter by category exactly (e.g. "weather", "image").',
      },
      mode: {
        type: 'string',
        enum: ['summary', 'full'],
        description: '"full" (default) returns the entire catalog in one card. "summary" returns category counts only.',
      },
    },
    required: [],
  },
  isReadOnly: true,
  // [v0.46.6] Bumped to fit the full catalog (~40 services) in one
  // shot when `mode: 'full'` is used. The summarizeOnTruncate path
  // still applies if the catalog ever exceeds the budget.
  maxResultSizeChars: 12_000,

  async call(input): Promise<{ data: Record<string, unknown>; displayText: string }> {
    const catalog = await fetchCatalog();

    // [v0.46.7] Default behavior is now "return the full catalog as a card."
    // Previously no-args returned a `_refine` payload that nudged the model to
    // re-call with a category — but in practice the model often re-called with
    // a category that returned 0 services, leaving an empty card. The full
    // catalog is small (~40 services, ~10KB) and fits comfortably in the
    // result budget, so there's no real cost to making it the default.
    //
    // The "summary" path (category counts only) is still available via the
    // explicit `mode:'summary'` opt-in for the rare case the user really wants
    // a category overview rather than the full list.
    if (input.mode !== 'summary' && !input.query && !input.category) {
      const services = renderServices(catalog);
      return {
        data: { services, total: services.length, mode: 'full' },
        displayText: `Full MPP catalog: ${services.length} services.`,
      };
    }

    if (input.mode === 'summary' && !input.query && !input.category) {
      const counts = new Map<string, number>();
      for (const svc of catalog) {
        for (const cat of svc.categories) {
          counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
      }
      const categories = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, services]) => ({ category, services }));
      return {
        data: {
          _refine: {
            reason: 'Category summary (mode:"summary"). Re-call with a category or omit mode for the full catalog.',
            suggestedParams: { category: categories[0]?.category ?? 'weather' },
            allModes: ['summary', 'full'],
          },
          categories,
          totalServices: catalog.length,
        },
        displayText: `${catalog.length} services across ${categories.length} categories.`,
      };
    }

    let filtered = catalog;
    if (input.category) {
      const cat = input.category.toLowerCase();
      filtered = filtered.filter((s) => s.categories.some((c) => c.toLowerCase() === cat));
    }
    if (input.query) {
      filtered = filtered.filter((s) => matchesQuery(s, input.query!));
    }

    const services = renderServices(filtered);

    const filterDesc = [
      input.query ? `query "${input.query}"` : null,
      input.category ? `category "${input.category}"` : null,
    ].filter(Boolean).join(' + ');
    const summary = `Found ${services.length} service(s) matching ${filterDesc}`;

    return {
      data: { services, total: services.length },
      displayText: summary,
    };
  },
});
