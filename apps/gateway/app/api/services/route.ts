import { getCatalog } from '@/lib/catalog-live';
import { getEndpointSchema } from '@/lib/schemas';
import { NextResponse } from 'next/server';

// ISR, not static: without this the handler prerenders at BUILD time and
// self-listed direct sellers (Redis, post-deploy) would never appear.
export const revalidate = 60;

export async function GET() {
  // Attach each endpoint's request-body JSON schema (param names, types,
  // required fields, descriptions) so callers — Audric, the CLI, any MPP
  // agent — shape the call body from the contract instead of guessing.
  // Single source of truth: lib/schemas.ts (the same map the OpenAPI doc
  // uses). NOT duplicated into services.ts. Endpoints without a registered
  // schema pass through unchanged. The catalog is the merged view:
  // static services ⊕ live self-listed direct sellers (Redis).
  const catalog = await getCatalog();
  const enriched = catalog.map((service) => ({
    ...service,
    endpoints: service.endpoints.map((endpoint) => {
      const schema = getEndpointSchema(service.id, endpoint.path);
      return schema ? { ...endpoint, schema: schema.requestBody } : endpoint;
    }),
  }));

  return NextResponse.json(enriched, {
    headers: {
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
}
