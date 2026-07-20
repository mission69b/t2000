import type { DigestStore } from '@suimpp/mpp/server';
import type { Currency } from '@suimpp/mpp/server';
import {
  createX402Requirements,
  encodeX402Response,
  isX402EscrowHeader,
  parseX402Header,
  settleX402Payment,
  verifyX402Payment,
  X402_PAYMENT_HEADER,
  X402_PAYMENT_RESPONSE_HEADER,
  X402_VERSION,
  type X402SettleResponse,
} from '@suimpp/mpp/x402';
import { getChainInfo, getGrpcClient } from './chain.js';
import type {
  BuiltRoute,
  HandlerContext,
  HandlerResult,
  ServeNetwork,
  ServeSchema,
  StandardSchemaLike,
} from './types.js';

// ---------------------------------------------------------------------------
// The paid-request lifecycle (SPEC_T2000_SERVE §3 — sign-then-settle,
// handler-then-settle):
//
//   no X-PAYMENT            → 402 with the accepts[] envelope (never a charge;
//                             the catalog probe and every discovery tool read
//                             this, so it fires BEFORE body validation)
//   X-PAYMENT present:
//     1. parse + STRUCTURAL verify (right amount/recipient/nonce — no RPC)
//     2. challenge-once check (a signed payload is single-use)
//     3. validate the body — invalid → 422, payment NEVER submitted
//        (the JMPR paid-422 class is impossible: the buyer keeps their money)
//     4. run the handler — throws → 500, payment NEVER submitted
//     5. settle (submit the buyer-signed gasless bytes; digest-once inside)
//     6. consume the challenge, attach the X-PAYMENT-RESPONSE receipt
//
// Money only moves at step 5, after the seller has already produced the
// result. A forged payload can waste seller compute (signature authority is
// the chain at settle time), never buyer money.
// ---------------------------------------------------------------------------

export interface RouteRuntime {
  payTo: string;
  network: ServeNetwork;
  currency: Currency;
  store: DigestStore;
  baseUrl?: string;
  rpcUrl?: string;
  report: boolean;
}

export interface RouteOptions {
  path: string;
  description?: string;
}

const MPP_REPORT_URL = 'https://mpp.t2000.ai/api/mpp/report';
const REPORT_TIMEOUT_MS = 2_000;

/** Listing cap on mpp.t2000.ai (catalog-ingest price-cap gate). */
const CATALOG_PRICE_CAP_USDC = 5;

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': `content-type, ${X402_PAYMENT_HEADER}`,
  'access-control-expose-headers': `${X402_PAYMENT_RESPONSE_HEADER}, WWW-Authenticate`,
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    }),
  );
}

function isStandardSchema(schema: ServeSchema): schema is StandardSchemaLike {
  return typeof schema === 'object' && schema !== null && '~standard' in schema;
}

async function validateBody(
  schema: ServeSchema,
  value: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  if (isStandardSchema(schema)) {
    const result = await schema['~standard'].validate(value);
    if (result.issues) {
      // Name the failing field — bare "Invalid input" ×N gives a paying
      // buyer's agent nothing to self-correct with.
      const message = result.issues
        .map((i) => {
          const path = (i.path ?? [])
            .map((seg) => (typeof seg === 'object' ? String(seg.key) : String(seg)))
            .join('.');
          return path ? `${path}: ${i.message}` : i.message;
        })
        .join('; ');
      return { ok: false, message };
    }
    return { ok: true, data: result.value };
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    return { ok: false, message: result.error.message ?? 'invalid body' };
  }
  return { ok: true, data: result.data };
}

/** Positive decimal USDC string, max 6dp (atomic precision). */
function assertValidPrice(price: string, path: string): void {
  if (!/^\d+(\.\d{1,6})?$/.test(price) || Number(price) <= 0) {
    throw new Error(
      `[serve] Route "${path}": price must be a positive decimal USDC string with up to 6 decimals, got "${price}"`,
    );
  }
  if (Number(price) > CATALOG_PRICE_CAP_USDC) {
    console.warn(
      `[serve] Route "${path}": price ${price} USDC is above the ${CATALOG_PRICE_CAP_USDC} USDC listing cap — ` +
        'the route works, but it will not list on mpp.t2000.ai. Job-class work belongs in `t2 service create` (escrow).',
    );
  }
}

export class RouteBuilder<TBody = undefined> {
  private priceUsdc?: string;
  private bodySchema?: ServeSchema;
  private inputSchema?: Record<string, unknown>;
  private outputSchema?: Record<string, unknown>;
  private isFree = false;

  constructor(
    private readonly runtime: RouteRuntime,
    private readonly options: RouteOptions,
    private readonly register: (route: BuiltRoute) => void,
  ) {}

  /** Charge this many USDC per call (human units, e.g. "0.01"). */
  paid(priceUsdc: string): this {
    assertValidPrice(priceUsdc, this.options.path);
    this.priceUsdc = priceUsdc;
    this.isFree = false;
    return this;
  }

  /** Serve without payment (health checks, previews, docs). */
  unprotected(): this {
    this.isFree = true;
    this.priceUsdc = undefined;
    return this;
  }

  /**
   * Validate the JSON request body. zod v4 / valibot / arktype / anything
   * Standard-Schema, or anything with a zod-style safeParse.
   *
   * Pass the JSON Schema as the second argument to publish it in
   * /openapi.json + /llms.txt (zod v4: `z.toJSONSchema(schema)`) — buyers'
   * agents build request bodies from it, and the catalog grades listings
   * without one.
   */
  body<T>(schema: ServeSchema<T>, jsonSchema?: Record<string, unknown>): RouteBuilder<T> {
    this.bodySchema = schema;
    this.inputSchema = jsonSchema;
    return this as unknown as RouteBuilder<T>;
  }

  /**
   * Declare the 200 response's JSON Schema (zod v4: `z.toJSONSchema(schema)`).
   * Published in /openapi.json + /llms.txt so buyer agents know what they're
   * buying and buyer UIs can render the deliverable by TYPE instead of
   * sniffing it — annotate with `contentMediaType` (e.g. "image/svg+xml",
   * "text/markdown") and `format: "color"` where they apply. Declaration
   * only; responses are never validated at runtime.
   */
  response(jsonSchema: Record<string, unknown>): this {
    this.outputSchema = jsonSchema;
    return this;
  }

  handler(fn: (ctx: HandlerContext<TBody>) => HandlerResult | Promise<HandlerResult>): BuiltRoute {
    if (!this.isFree && !this.priceUsdc) {
      throw new Error(
        `[serve] Route "${this.options.path}": call .paid('<usdc>') or .unprotected() before .handler()`,
      );
    }
    const runtime = this.runtime;
    const { path, description } = this.options;
    const priceUsdc = this.priceUsdc;
    const bodySchema = this.bodySchema;

    const route = (async (req: Request): Promise<Response> => {
      if (req.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }));
      }

      // Read + parse the body once, up front. A missing/empty body on a
      // schema-less route is fine; JSON parse failures only matter when a
      // paid request must be validated (the unpaid 402 fires regardless).
      let parsedBody: unknown;
      let bodyParseError: string | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const text = await req.text();
        if (text.trim().length > 0) {
          try {
            parsedBody = JSON.parse(text);
          } catch {
            bodyParseError = 'request body is not valid JSON';
          }
        }
      }

      const resource = (runtime.baseUrl ?? new URL(req.url).origin).replace(/\/$/, '') + `/${path}`;

      const runHandler = async (payer?: string): Promise<Response> => {
        let validated: unknown = parsedBody;
        if (bodySchema) {
          // `paid: false` is machine-readable charge honesty — a 422 fires
          // BEFORE settlement, so the buyer always keeps their money.
          if (bodyParseError) {
            return json(422, { error: bodyParseError, paid: false });
          }
          const result = await validateBody(bodySchema, parsedBody ?? {});
          if (!result.ok) {
            return json(422, { error: result.message, paid: false });
          }
          validated = result.data;
        }
        const out = await fn({ body: validated as TBody, req, payer });
        if (out instanceof Response) return withCors(out);
        return json(200, out);
      };

      // Free route — no payment machinery at all.
      if (!priceUsdc) {
        try {
          return await runHandler();
        } catch (err) {
          console.error(`[serve] Route "${path}" handler failed:`, err);
          return json(500, { error: 'internal error' });
        }
      }

      const paymentHeader = req.headers.get(X402_PAYMENT_HEADER);

      // Unpaid → 402 with the accepts[] envelope. This fires before body
      // validation on purpose: the catalog probe (and every discovery tool)
      // POSTs `{}` and must see the challenge, and an unpaid request can
      // never be charged, so there is nothing to protect yet.
      if (!paymentHeader) {
        return await respond402(runtime, { resource, priceUsdc });
      }

      if (isX402EscrowHeader(paymentHeader)) {
        return await respond402(runtime, {
          resource,
          priceUsdc,
          error:
            'this endpoint sells instant per-call work (settle-then-serve), not escrow jobs — retry with a signed x402 payment',
        });
      }

      // 1. Parse + structural verify — right terms, right recipient, right
      //    nonce. No RPC, no state. Wrong-terms payloads never reach the
      //    handler.
      let payment: ReturnType<typeof parseX402Header>;
      try {
        payment = parseX402Header(paymentHeader);
        verifyX402Payment({
          payment,
          expected: {
            challengeId: payment.payload.challengeId,
            amount: priceUsdc,
            currency: runtime.currency,
            recipient: runtime.payTo,
            network: runtime.network,
          },
        });
      } catch (err) {
        return await respond402(runtime, {
          resource,
          priceUsdc,
          error: `invalid payment: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      // 2. Challenge-once — a signed payload is single-use even before it
      //    settles (the settled digest is separately consumed inside
      //    settleX402Payment, digest-once).
      const challengeKey = `challenge:${payment.payload.challengeId}`;
      if (await runtime.store.has(challengeKey)) {
        return await respond402(runtime, {
          resource,
          priceUsdc,
          error: 'payment challenge already used — sign a fresh payment',
        });
      }

      // 3 + 4. Validate, then compute the result. Any failure here returns
      // WITHOUT settling — the buyer-signed bytes are never submitted.
      let served: Response;
      try {
        served = await runHandler(payment.payload.senderAddress);
      } catch (err) {
        console.error(`[serve] Route "${path}" handler failed (payment NOT settled):`, err);
        return json(500, { error: 'internal error — you were not charged' });
      }
      if (served.status >= 400) return served; // 422 etc. — not charged

      // 5. Settle — submit the buyer-signed gasless bytes, confirm the
      // on-chain balance change, record the digest (digest-once).
      let settle: X402SettleResponse;
      try {
        settle = await settleX402Payment({
          payment,
          client: getGrpcClient(runtime.network, runtime.rpcUrl),
          store: runtime.store,
          expected: {
            challengeId: payment.payload.challengeId,
            amount: priceUsdc,
            currency: runtime.currency,
            recipient: runtime.payTo,
            network: runtime.network,
          },
        });
      } catch (err) {
        return await respond402(runtime, {
          resource,
          priceUsdc,
          error: `settlement failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      // 6. Consume the challenge + attach the receipt.
      try {
        await runtime.store.set(challengeKey);
      } catch {
        // Digest-once already holds; challenge-once is defense in depth.
      }

      if (runtime.report) {
        reportPayment(settle.transaction, resource);
      }

      const headers = new Headers(served.headers);
      headers.set(X402_PAYMENT_RESPONSE_HEADER, encodeX402Response(settle));
      return new Response(served.body, { status: served.status, headers });
    }) as BuiltRoute;

    route.meta = {
      path,
      priceUsdc,
      description,
      bodySchema,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
    };
    this.register(route);
    return route;
  }
}

async function respond402(
  runtime: RouteRuntime,
  args: { resource: string; priceUsdc: string; error?: string },
): Promise<Response> {
  try {
    const { chain, epoch } = await getChainInfo(runtime.network, runtime.rpcUrl);
    const requirements = createX402Requirements({
      challengeId: crypto.randomUUID(),
      amount: args.priceUsdc,
      currency: runtime.currency,
      recipient: runtime.payTo,
      resource: args.resource,
      network: runtime.network,
      chain,
      currentEpoch: epoch,
    });
    return json(402, {
      x402Version: X402_VERSION,
      error: args.error ?? 'Payment required',
      accepts: [requirements],
    });
  } catch (err) {
    // Chain info unreachable — a 402 without the envelope is unpayable, so
    // be honest about the outage instead of serving a dead challenge.
    console.error('[serve] failed to build 402 challenge:', err);
    return json(503, { error: 'payment challenge temporarily unavailable' });
  }
}

/**
 * Best-effort activity-feed report (mpp.t2000.ai). The gateway verifies the
 * digest on-chain before recording anything, so this carries no trusted
 * data — a lost or duplicate report is harmless.
 */
function reportPayment(digest: string, url: string): void {
  void fetch(MPP_REPORT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ digest, url }),
    signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
  }).catch(() => {});
}
