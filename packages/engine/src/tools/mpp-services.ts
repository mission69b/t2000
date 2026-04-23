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
    'Discover available MPP gateway services. Returns service names, descriptions, endpoints with required parameters, and pricing. Pass `query` for keyword search or `category` to filter by category. Calling with NO filters returns a category summary (not the full catalog) — narrow first, then fetch endpoints. Use this BEFORE calling pay_api.',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Filter by keyword (e.g. "postcard", "translate", "weather").'),
    category: z
      .string()
      .optional()
      .describe('Filter by category exactly (e.g. "weather", "image"). See category summary returned when called without filters.'),
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
    },
    required: [],
  },
  isReadOnly: true,
  maxResultSizeChars: 5_000,

  async call(input): Promise<{ data: Record<string, unknown>; displayText: string }> {
    const catalog = await fetchCatalog();

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
            reason: 'MPP catalog has many services — pick a category or supply a query first.',
            suggestedParams: { category: categories[0]?.category ?? 'weather' },
          },
          categories,
          totalServices: catalog.length,
        },
        displayText: `${catalog.length} services across ${categories.length} categories. Re-call with a category or query.`,
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
