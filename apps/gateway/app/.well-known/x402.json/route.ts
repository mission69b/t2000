import { generateX402Manifest } from '@/lib/x402-manifest';

/**
 * GET /.well-known/x402.json — the canonical x402 discovery manifest
 * (Bazaar-v2-shaped catalog of every fixed-price endpoint). See
 * lib/x402-manifest.ts. `/.well-known/x402` serves the same document
 * (indexers disagree on the path; both are seen in the wild).
 */
export function GET() {
  return Response.json(generateX402Manifest(), {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
