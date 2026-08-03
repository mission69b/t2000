// @t2000/serve — merchant-side x402 router for Sui.
//
// Wrap any API so agents can discover it and pay per call in USDC:
//
//   import { asNextRoute, createServeFromEnv } from '@t2000/serve';
//   const serve = createServeFromEnv();
//   export const { POST, OPTIONS } = asNextRoute(
//     serve
//       .route({ path: 'search' })
//       .paid('0.01')
//       .body(searchSchema)
//       .handler(async ({ body }) => search(body)),
//   );
//
// Next.js dispatches only the methods route.ts EXPORTS — export OPTIONS too
// (asNextRoute does it) or browser buyers fail CORS preflight; serve's own
// CORS handling can't run on a request Next never delivers.
//
// Sign-then-settle (SUIMPP_X402_SCHEME v0.3): the buyer signs a gasless USDC
// payment, THIS package verifies + submits it — the seller never holds a
// private key and never pays gas. The handler runs BEFORE settlement, so a
// failed handler never charges the buyer.

export {
  createServe,
  createServeFromEnv,
  DEFAULT_ACTIVITY_REPORT_URL,
  Serve,
} from './serve.js';
export { asNextRoute } from './next.js';
export { RouteBuilder } from './route.js';
export { buildLlmsTxt, buildOpenApiDocument } from './discovery.js';
export { InMemoryDigestStore, UpstashDigestStore } from './store.js';
export type { DigestStore, UpstashDigestStoreOptions } from './store.js';
export type {
  BuiltRoute,
  HandlerContext,
  HandlerResult,
  RouteMeta,
  ServeConfig,
  ServeNetwork,
  ServeSchema,
} from './types.js';
export { __resetChainCaches, __seedChainInfo } from './chain.js';
