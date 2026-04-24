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
    'Discover available MPP gateway services. Returns service names, descriptions, endpoints with required parameters, and pricing. Use BEFORE calling pay_api. Modes: pass `query` for keyword search, `category` to filter by category, or `mode: "full"` to fetch the ENTIRE catalog in one card (for "show me all MPP services" / "full catalog" requests — never enumerate per category in a loop). Calling with no args returns a category summary so you can narrow.',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Filter by keyword (e.g. "postcard", "translate", "weather").'),
    category: z
      .string()
      .optional()
      .describe('Filter by category exactly (e.g. "weather", "image"). See category summary returned when called without filters.'),
    mode: z
      .enum(['summary', 'full'])
      .optional()
      .describe('"full" returns the entire catalog in a single card — use this for "show me all MPP services" / "full catalog" requests instead of looping per category. Default is "summary" (category counts only when no filter is supplied).'),
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
        description: '"full" returns the entire catalog in one card. Use for "show me all" requests.',
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

    // [v0.46.6] Explicit "show me everything" path. The previous
    // "no-args returns category summary + _refine hint" behavior caused
    // the model to interpret "show all MPP services" as an instruction
    // to enumerate every category one by one — discover_services was
    // observed firing 15 times in a single turn. mode:'full' breaks
    // that loop by returning the whole catalog up front.
    if (input.mode === 'full') {
      const services = catalog.map((s) => ({
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
      return {
        data: { services, total: services.length, mode: 'full' },
        displayText: `Full MPP catalog: ${services.length} services.`,
      };
    }

    // [v1.4 ACI] If neither query nor category is supplied, return a
    // category summary rather than the unbounded full catalog. The model
    // then re-calls with a filter, which keeps the context window tight
    // and makes the MPP discovery flow two-step (categorize → drill down).
    if (!input.query && !input.category) {
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
            reason: 'MPP catalog has many services — pick a category, supply a query, or pass mode:"full" to fetch everything.',
            suggestedParams: { category: categories[0]?.category ?? 'weather' },
            allModes: ['summary', 'full'],
          },
          categories,
          totalServices: catalog.length,
        },
        displayText: `${catalog.length} services across ${categories.length} categories. Re-call with a category, query, or mode:"full".`,
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

    const services = filtered.map((s) => ({
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
