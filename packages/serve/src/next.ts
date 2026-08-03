import type { BuiltRoute } from './types.js';

/**
 * Export a built route the way Next.js App Router needs it.
 *
 * Next dispatches ONLY the methods a route.ts exports — serve's own CORS
 * handling (OPTIONS → 204 with the ACAO headers) never runs if the file
 * exports just `POST`: the browser preflight gets Next's bare 204 with no
 * CORS headers, and every browser buyer (Passport, the store's Try it)
 * fails while CLI/server buyers — who never preflight — work fine. Fetch
 * runtimes mounted via a single handler (`serve.fetch`-style) don't have
 * this hole; it is a Next export contract, not a serve one.
 *
 *   export const { POST, OPTIONS } = asNextRoute(
 *     serve.route({ path: 'haiku' }).paid('0.01').handler(fn),
 *   );
 */
export function asNextRoute(route: BuiltRoute): {
  POST: BuiltRoute;
  OPTIONS: BuiltRoute;
} {
  return { POST: route, OPTIONS: route };
}
