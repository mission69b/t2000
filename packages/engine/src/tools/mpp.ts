import { tool } from 'ai';
import { z } from 'zod';
import type { PayOptions, PayResult } from '@t2000/sdk';
import { wrapEngineExecute, buildNeedsApproval } from '../v2/tool-helpers.js';
import type { PreflightResult, ToolContext, ToolResult } from '../types.js';
import { requireAgent } from './utils.js';

// ---------------------------------------------------------------------------
// MPP tools — discover + pay for third-party Services via the gateway.
//
// `mpp_services` is a LIVE catalog fetch (never a hardcoded list — the
// gateway `/api/services` is the single source of truth; new services flow
// in with zero code change). `mpp_call` is a client-delegated write: under
// audric/web-v2 the payment runs in-browser on the zkLogin session key
// (gasless USDC), so the server `call()` body below only runs for agent /
// CLI runtimes where `ctx.agent` is set — same delegation model as every
// other write tool (see engine-tool-development.mdc + safeguards rule).
// ---------------------------------------------------------------------------

const DEFAULT_GATEWAY_URL = 'https://mpp.t2000.ai';
const MAX_SINGLE_CALL_USD = 10;

function gatewayBaseUrl(ctx: ToolContext): string {
  const raw = ctx.env?.MPP_GATEWAY_URL?.trim();
  return raw && raw.length > 0 ? raw.replace(/\/+$/, '') : DEFAULT_GATEWAY_URL;
}

// ---------------------------------------------------------------------------
// mpp_services — discover (read)
// ---------------------------------------------------------------------------

interface ServiceEndpoint {
  method: string;
  path: string;
  description: string;
  price: string;
}

interface CatalogService {
  id: string;
  name: string;
  serviceUrl: string;
  description: string;
  chain: string;
  currency: string;
  categories: string[];
  endpoints: ServiceEndpoint[];
}

const mppServicesInputSchema = z.object({
  category: z
    .string()
    .optional()
    .describe('Optional category filter (e.g. "ai", "data", "media"). Omit to list every Service.'),
});
type MppServicesInput = z.infer<typeof mppServicesInputSchema>;

async function mppServicesCallBody(
  input: MppServicesInput,
  ctx: ToolContext,
): Promise<ToolResult<{ services: CatalogService[] }>> {
  const base = gatewayBaseUrl(ctx);
  const res = await fetch(`${base}/api/services`, { signal: ctx.signal });
  if (!res.ok) {
    throw new Error(`Service catalog fetch failed (${res.status} from ${base}/api/services)`);
  }
  const raw = (await res.json()) as Array<CatalogService & { logo?: string }>;
  const wanted = input.category?.trim().toLowerCase();
  // Drop the UI-only `logo` field to keep the model context lean; never
  // reshape or hardcode the catalog beyond that.
  const services: CatalogService[] = raw
    .filter((s) => !wanted || s.categories?.some((c) => c.toLowerCase() === wanted))
    .map(({ logo: _logo, ...rest }) => rest);

  const count = services.length;
  if (count === 0) {
    return {
      data: { services },
      displayText: `No Services found${wanted ? ` in category "${input.category}"` : ''}.`,
    };
  }
  const names = services.map((s) => s.name).join(', ');
  return {
    data: { services },
    displayText:
      `${count} Service${count === 1 ? '' : 's'} available: ${names}. ` +
      `Each endpoint lists its per-call USDC price; the full call URL is serviceUrl + endpoint.path. ` +
      `Use mpp_call with that URL + the endpoint price.`,
  };
}

export const mppServicesTool = tool({
  description:
    'Discover paid third-party Services (live data, paid search, AI, media, real-world actions like mail) that Audric can call and pay for on the user\u2019s behalf via the MPP gateway. Returns the LIVE catalog: each Service has a `serviceUrl` and `endpoints[]` with `method`, `path`, `description`, and per-call USDC `price`. The full call URL is `serviceUrl + endpoint.path`. Call this FIRST to find the right endpoint and its price before mpp_call.',
  inputSchema: mppServicesInputSchema,
  execute: wrapEngineExecute<MppServicesInput, { services: CatalogService[] }>('mpp_services', {
    call: mppServicesCallBody,
  }),
});

// ---------------------------------------------------------------------------
// mpp_call — call + pay (write, client-delegated)
// ---------------------------------------------------------------------------

const mppCallInputSchema = z.object({
  url: z
    .string()
    .url()
    .describe(
      'Full gateway endpoint URL to call (serviceUrl + endpoint.path from mpp_services, e.g. https://mpp.t2000.ai/openai/v1/chat/completions).',
    ),
  method: z
    .string()
    .optional()
    .describe('HTTP method (default POST). Use the method listed for the chosen endpoint.'),
  body: z
    .string()
    .nullable()
    .describe('JSON request body as a string, or null for GET-style calls with no body.'),
  maxPriceUsd: z
    .number()
    .positive()
    .describe(
      'Maximum USDC you authorize for this single call. Set to the endpoint\u2019s catalog price (a small allowance above it is fine).',
    ),
});
type MppCallInput = z.infer<typeof mppCallInputSchema>;

interface MppCallOutput {
  status: number;
  paid: boolean;
  cost?: number;
  body: unknown;
}

function mppCallPreflight(input: MppCallInput): PreflightResult {
  if (!/^https:\/\//i.test(input.url)) {
    return { valid: false, error: 'mpp_call url must be an https gateway endpoint.' };
  }
  if (!(input.maxPriceUsd > 0)) {
    return { valid: false, error: 'maxPriceUsd must be positive.' };
  }
  if (input.maxPriceUsd > MAX_SINGLE_CALL_USD) {
    return {
      valid: false,
      error: `maxPriceUsd exceeds the $${MAX_SINGLE_CALL_USD} single-call ceiling. Pick a cheaper endpoint or split the work.`,
    };
  }
  return { valid: true };
}

async function mppCallCallBody(
  input: MppCallInput,
  ctx: ToolContext,
): Promise<ToolResult<MppCallOutput>> {
  const agent = requireAgent(ctx);
  const opts: PayOptions = {
    url: input.url,
    method: input.method ?? 'POST',
    body: input.body ?? undefined,
    maxPrice: input.maxPriceUsd,
  };
  const result: PayResult = await agent.pay(opts);
  return {
    data: { status: result.status, paid: result.paid, cost: result.cost, body: result.body },
    displayText: result.paid
      ? `Called the Service (paid ${result.cost != null ? `$${result.cost.toFixed(2)}` : 'a metered fee'} USDC, status ${result.status}).`
      : `Service call returned status ${result.status} (no charge).`,
  };
}

export const mppCallTool = tool({
  description:
    'Call and PAY for a Service endpoint discovered via mpp_services, billed per-call in USDC from the user\u2019s balance. Pass the full endpoint URL (serviceUrl + endpoint.path) and set maxPriceUsd to the endpoint\u2019s catalog price. Payment runs gaslessly on the user\u2019s wallet; under the user\u2019s opt-in budget small calls confirm tap-free, otherwise the user taps to approve. ALWAYS call mpp_services first to get the URL and price.',
  inputSchema: mppCallInputSchema,
  needsApproval: buildNeedsApproval('mpp_call'),
  execute: wrapEngineExecute<MppCallInput, MppCallOutput>('mpp_call', {
    preflight: mppCallPreflight,
    call: mppCallCallBody,
  }),
});
