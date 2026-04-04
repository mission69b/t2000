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
    'Discover available MPP gateway services. Returns service names, descriptions, endpoints with required parameters, and pricing. Use this BEFORE calling pay_api to find the correct URL and body format for any real-world API (weather, search, translation, image generation, email, maps, etc.).',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Filter by keyword (e.g. "postcard", "translate", "weather"). Omit to list all services.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Filter by keyword (e.g. "postcard", "translate", "weather"). Omit to list all.',
      },
    },
    required: [],
  },
  isReadOnly: true,

  async call(input) {
    const catalog = await fetchCatalog();
    const filtered = input.query ? catalog.filter((s) => matchesQuery(s, input.query!)) : catalog;

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

    const summary = input.query
      ? `Found ${services.length} service(s) matching "${input.query}"`
      : `${services.length} services available on MPP gateway`;

    return {
      data: { services, total: services.length },
      displayText: summary,
    };
  },
});
