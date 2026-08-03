import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { InMemoryDigestStore, USDC, USDC_TESTNET, type Currency } from '@t2000/sui-x402';
import { buildLlmsTxt, buildOpenApiDocument } from './discovery.js';
import { RouteBuilder, type RouteOptions, type RouteRuntime } from './route.js';
import { UpstashDigestStore } from './store.js';
import type { BuiltRoute, ServeConfig, ServeNetwork } from './types.js';

/** The t2000.ai attributed-activity report endpoint — ONE canonical string
 *  (matches the sdk's DEFAULT_ACTIVITY_REPORT_URL; tests assert equality). */
export const DEFAULT_ACTIVITY_REPORT_URL = 'https://t2000.ai/api/activity/x402';

/** Explicit opt-out tokens for T2000_ACTIVITY_REPORT_URL (case-insensitive). */
const REPORT_OPT_OUT = new Set(['false', '0', 'off', 'none']);

export class Serve {
  private readonly runtime: RouteRuntime;
  /** Every route built through this instance, keyed by path (discovery). */
  readonly routes = new Map<string, BuiltRoute>();

  readonly payTo: string;
  readonly network: ServeNetwork;
  readonly name?: string;
  readonly description?: string;
  readonly baseUrl?: string;
  /** Where settled payments are reported (B2) — undefined = no report. */
  readonly activityReportUrl?: string;

  constructor(config: ServeConfig) {
    if (!config.payTo || !isValidSuiAddress(config.payTo)) {
      throw new Error(
        `[serve] payTo must be a valid Sui address (the wallet your payments settle to), got "${config.payTo}"`,
      );
    }
    this.payTo = normalizeSuiAddress(config.payTo);
    this.network = config.network ?? 'mainnet';
    this.name = config.name;
    this.description = config.description;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '');
    this.activityReportUrl = config.activityReportUrl;

    const currency: Currency = this.network === 'testnet' ? USDC_TESTNET : USDC;
    this.runtime = {
      payTo: this.payTo,
      network: this.network,
      currency,
      store: config.store ?? new InMemoryDigestStore(),
      baseUrl: this.baseUrl,
      rpcUrl: config.rpcUrl,
      activityReportUrl: this.activityReportUrl,
    };
  }

  /** Start building a route. Chain `.paid()` / `.body()` / `.handler()`. */
  route(options: RouteOptions): RouteBuilder {
    const path = options.path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!path) throw new Error('[serve] route path must be non-empty');
    return new RouteBuilder({ ...this.runtime }, { ...options, path }, (route) => {
      this.routes.set(path, route);
    });
  }

  /**
   * Discovery: GET handler for /openapi.json. OpenAPI 3.1 with the
   * `x-payment-info` pricing extension on every paid operation — the shape
   * x402 tooling (and any catalog built on it) indexes.
   *
   *   export const GET = serve.openapi();   // app/openapi.json/route.ts
   */
  openapi(): (req: Request) => Response {
    return (req: Request) =>
      new Response(JSON.stringify(buildOpenApiDocument(this, new URL(req.url).origin), null, 2), {
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
  }

  /**
   * Discovery: GET handler for /llms.txt — plain-text guidance agents read
   * to understand what the API sells, what it costs, and how to pay.
   *
   *   export const GET = serve.llms();      // app/llms.txt/route.ts
   */
  llms(): (req: Request) => Response {
    return (req: Request) =>
      new Response(buildLlmsTxt(this, new URL(req.url).origin), {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
      });
  }

  /**
   * One fetch handler for the whole app — routes + discovery docs. For
   * fetch-native runtimes (Bun.serve, Deno.serve, Hono, Cloudflare Workers):
   *
   *   Bun.serve({ fetch: serve.fetch });
   *   app.all('*', (c) => serve.fetch(c.req.raw));   // Hono
   *
   * Next.js apps can skip this and export route handlers directly.
   */
  readonly fetch = async (req: Request): Promise<Response> => {
    const pathname = new URL(req.url).pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    if (pathname === 'openapi.json') return this.openapi()(req);
    if (pathname === 'llms.txt') return this.llms()(req);
    const route = this.routes.get(pathname);
    if (route) return route(req);
    return new Response(
      JSON.stringify({ error: 'not found', discovery: ['/openapi.json', '/llms.txt'] }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );
  };

  /**
   * The command that sells this API as an x402 Service on your Agent ID,
   * once it is deployed. Listing is a separate, explicit step: the endpoint
   * is live-probed (it must answer 402 with a Sui challenge that pays YOUR
   * wallet) and then recorded on-chain, sponsored and gasless.
   *
   * This used to emit curls against the hosted mpp.t2000.ai catalog. That
   * proxy mall was purged 2026-08-01 (SPEC_T2_CLEANUP_USDC_ONLY) — there is
   * no central catalog to submit to. Your Agent ID IS the listing, and
   * buyers find it with `t2 services`.
   */
  catalogSubmitCommand(deployedUrl?: string): string {
    const base = (deployedUrl ?? this.baseUrl ?? 'https://<your-deployed-app>').replace(/\/$/, '');
    const paidPaths = [...this.routes.values()].filter((r) => r.meta.priceUsdc);
    const example = paidPaths[0]?.meta.path ?? '<route>';
    return [
      '# Sell it as an x402 Service on your Agent ID (live-probed, gasless):',
      `npx @t2000/cli agent sell ${base}/${example}`,
      '# Buyers then find it with `t2 services` and pay per call with `t2 pay`.',
    ].join('\n');
  }
}

export function createServe(config: ServeConfig): Serve {
  return new Serve(config);
}

/**
 * Build a Serve from environment variables — the template-app path where
 * config lives in the host's env UI, not code.
 *
 *   T2000_PAY_TO      required — the seller's Sui address
 *   T2000_NETWORK     optional — 'mainnet' (default) | 'testnet'
 *   T2000_BASE_URL    optional — public URL of the deployed app
 *   T2000_NAME        optional — service name for discovery docs
 *   T2000_DESCRIPTION optional — one-liner for discovery docs
 *   T2000_ACTIVITY_REPORT_URL
 *                     optional — where settled payments are reported
 *                     (fire-and-forget x402.paid after each successful settle;
 *                     chain-verified server-side, never affects buyer
 *                     responses). DEFAULT-ON for FromEnv: unset →
 *                     https://t2000.ai/api/activity/x402 so new sellers appear
 *                     on the t2000.ai activity tape. Opt out with
 *                     `false` | `0` | `off` | `none` (case-insensitive), or
 *                     set a custom URL. (`new Serve({...})` without
 *                     activityReportUrl stays silent — only FromEnv defaults.)
 *   KV_REST_API_URL / KV_REST_API_TOKEN
 *                     optional — enables the durable Upstash replay store
 *                     (REQUIRED in serverless production; without it replay
 *                     state is per-instance memory)
 *
 * Empty strings are treated as unset (the Vercel empty-env bug class).
 */
export function createServeFromEnv(env: Record<string, string | undefined> = process.env): Serve {
  const read = (key: string): string | undefined => {
    const v = env[key]?.trim();
    return v && v.length > 0 ? v : undefined;
  };

  const payTo = read('T2000_PAY_TO');
  if (!payTo) {
    throw new Error(
      '[serve] T2000_PAY_TO is not set (or is empty). Set it to the Sui address your payments should settle to — `t2 address` prints yours.',
    );
  }

  const network = read('T2000_NETWORK');
  if (network && network !== 'mainnet' && network !== 'testnet') {
    throw new Error(`[serve] T2000_NETWORK must be 'mainnet' or 'testnet', got "${network}"`);
  }

  const kvUrl = read('KV_REST_API_URL');
  const kvToken = read('KV_REST_API_TOKEN');
  const store =
    kvUrl && kvToken ? new UpstashDigestStore({ url: kvUrl, token: kvToken }) : undefined;

  if (!store) {
    console.warn(
      '[serve] No KV_REST_API_URL/KV_REST_API_TOKEN — using the in-memory replay store. ' +
        'Fine for a single long-lived process; on serverless hosts set both so replay protection is durable.',
    );
  }

  return new Serve({
    payTo,
    network: (network as ServeNetwork | undefined) ?? 'mainnet',
    baseUrl: read('T2000_BASE_URL'),
    name: read('T2000_NAME'),
    description: read('T2000_DESCRIPTION'),
    activityReportUrl: resolveReportUrlFromEnv(read('T2000_ACTIVITY_REPORT_URL')),
    store,
  });
}

/** FromEnv activity-report resolution (B2 default-on): unset/empty →
 *  the t2000.ai default; an explicit opt-out token → undefined (silent);
 *  anything else is the seller's custom report URL. */
function resolveReportUrlFromEnv(raw: string | undefined): string | undefined {
  if (raw === undefined) return DEFAULT_ACTIVITY_REPORT_URL;
  if (REPORT_OPT_OUT.has(raw.toLowerCase())) return undefined;
  return raw;
}
