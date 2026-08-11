// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// `t2 pay <url> [options]` — v4 Agent Wallet surface.
//
// Contract changes vs. the pre-pivot legacy command:
//   - PIN flow removed. Uses `withAgent` from `lib/with-agent.ts`.
//   - Adds `--estimate` flag: issues the request WITHOUT a payment
//     header, reads the x402 `accepts[]` envelope from the 402 body,
//     prints price + asset + recipient + resource, and exits 0 without
//     paying. SPEC verification gate ("t2 pay <url> --estimate" → prints
//     price + service info, returns exit 0 without executing).
//     x402-only (SUIMPP_X402_SCHEME): sellers advertise the x402 envelope
//     on every 402; the legacy mppx challenge parser was retired here.
//   - Surfaces the SDK's gasless badge (`gasCostSui === 0`) — when a
//     payment hits the Sui gasless stablecoin allowlist, the receipt
//     renders `gasless ⚡` instead of a SUI cost.
//
// `--data` + `--method` + `--header` + `--max-price` semantics
// preserved from the legacy command.

import type { Command } from 'commander';
import pc from 'picocolors';
import {
  printSuccess,
  printBlank,
  printJson,
  printInfo,
  printKeyValue,
  printLine,
  isJsonMode,
  handleError,
} from '../output.js';
import { withAgent } from '../lib/with-agent.js';

interface PayOptions {
  key?: string;
  method: string;
  data?: string;
  header: Record<string, string>;
  maxPrice: string;
  estimate?: boolean;
  force?: boolean;
}

export function registerPay(program: Command) {
  program
    .command('pay <url>')
    .description('Pay an x402 Service (USDC on Sui) — the seller\'s own endpoint')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .option('--method <method>', 'HTTP method (GET, POST, PUT)', 'GET')
    .option('--data <json>', 'Request body for POST/PUT (auto-promotes --method to POST)')
    .option('--header <key=value>', 'Additional HTTP header (repeatable)', collectHeaders, {})
    .option('--max-price <amount>', 'Max USDC price to auto-approve', '1.00')
    .option(
      '--estimate',
      'Preview the price + service info (no signing, no payment). Exits 0 ONLY if the service answers a payable 402 x402 challenge; any other response (including 2xx "no payment required") exits 1.',
    )
    .option('--force', 'Override spending limits for this call (see `t2 limit`)')
    .addHelpText(
      'after',
      `
Examples:
  $ t2 pay https://api.example.com/data
                                       Pay for a GET endpoint
  $ t2 pay https://api.example.com/run --data '{"prompt":"hi"}'
                                       POST with JSON body (auto-promotes --method)
  $ t2 pay https://api.example.com/data --estimate
                                       Show price + service info without paying
  $ t2 pay https://api.example.com/data --max-price 0.50
                                       Cap auto-approve at $0.50
`,
    )
    .action(async (url: string, opts: PayOptions) => {
      try {
        if (opts.estimate) {
          await runEstimate(url, opts);
          return;
        }

        const maxPrice = parseFloat(opts.maxPrice);
        if (Number.isNaN(maxPrice) || maxPrice <= 0) {
          throw new Error(`Invalid --max-price: "${opts.maxPrice}". Must be a positive number.`);
        }

        const agent = await withAgent({ keyPath: opts.key });

        const startTime = Date.now();
        const method = opts.data && opts.method === 'GET' ? 'POST' : opts.method;

        if (!isJsonMode()) {
          printBlank();
          printInfo(`→ ${method} ${url}`);
        }

        const result = await agent.pay({
          url,
          method,
          headers: opts.header,
          body: opts.data,
          maxPrice,
          force: opts.force,
        });

        const elapsed = Date.now() - startTime;

        if (isJsonMode()) {
          printJson({
            status: result.status,
            url,
            elapsed,
            paid: result.paid,
            cost: result.cost,
            gasCostSui: result.gasCostSui,
            gasless: result.gasCostSui === 0,
            receipt: result.receipt,
            body: result.body,
          });
          return;
        }

        if (result.paid && result.receipt) {
          const gasNote =
            typeof result.gasCostSui === 'number'
              ? result.gasCostSui === 0
                ? pc.green(' · gasless ⚡')
                : pc.dim(` · gas: ${result.gasCostSui.toFixed(6)} SUI`)
              : '';
          printSuccess(`Paid via ${result.dialect ?? 'x402'} (tx: ${result.receipt.reference.slice(0, 10)}…)${gasNote}`);
        }
        printInfo(`← ${result.status} OK  ${pc.dim(`[${elapsed}ms]`)}`);

        printBlank();
        if (typeof result.body === 'string') {
          console.log(result.body);
        } else {
          console.log(JSON.stringify(result.body, null, 2));
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}

/** Cap on body previews for non-402 estimate responses — operators piping
 *  `--estimate` must never get a multi-KB HTML dump on stdout (S.1002). */
const ESTIMATE_PREVIEW_MAX = 512;

/** Truncate a response body for display: full text under the cap, else the
 *  first `max` chars + an honest truncation note with the real size. */
export function truncatePreview(body: string, max = ESTIMATE_PREVIEW_MAX): string {
  if (body.length <= max) {
    return body;
  }
  return `${body.slice(0, max)}… (truncated, ${body.length} total bytes)`;
}

/** Estimate failure that exits 1 with ONE structured JSON object in --json
 *  mode (handleError prefers toJSON) and a short reason line otherwise. */
class EstimateFailure extends Error {
  constructor(
    message: string,
    private readonly payload: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'EstimateFailure';
  }
  toJSON(): Record<string, unknown> {
    return this.payload;
  }
}

/**
 * `--estimate` path. Issues the request with no Payment header, expects a
 * 402, parses the x402 `accepts[]` body envelope — the primary dialect
 * (the WWW-Authenticate header is belt-and-suspenders only; S.880) — and
 * prints the relevant fields. Exit contract (S.1002, founder-locked):
 * 0 ONLY when the response proves a payable 402 x402 challenge. Any other
 * status — including 2xx "no payment required" — throws, because operators
 * script estimate as "may I pay this URL"; friendly copy, non-zero exit.
 */
export async function runEstimate(url: string, opts: PayOptions): Promise<void> {
  const method = opts.data && opts.method === 'GET' ? 'POST' : opts.method;
  const canHaveBody = method !== 'GET' && method !== 'HEAD';

  if (!isJsonMode()) {
    printBlank();
    printInfo(`→ ${method} ${url}  ${pc.dim('(estimate — no payment)')}`);
  }

  // Mirror the SDK's paid path: default content-type when the body is JSON,
  // or strict servers (FastAPI) 422 the probe before the 402 ever fires.
  let headers = opts.header;
  if (canHaveBody && opts.data && !Object.keys(headers ?? {}).some((k) => k.toLowerCase() === 'content-type')) {
    try {
      JSON.parse(opts.data);
      headers = { ...(headers ?? {}), 'content-type': 'application/json' };
    } catch {
      // not JSON — leave headers alone
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: canHaveBody ? opts.data : undefined,
  });

  if (response.status !== 402) {
    // Not a payment challenge — the endpoint is open (2xx), dead, or
    // erroring. Surface the status + a TRUNCATED preview, then fail:
    // exit 0 here would let "estimate before pay" scripts treat mistyped
    // or dead URLs as verified payable services (S.1002).
    const body = await response.text().catch(() => '');
    const preview = truncatePreview(body);
    const open = response.status >= 200 && response.status < 300;
    const note = open
      ? `Endpoint responded ${response.status} without a 402 challenge — no payment required.`
      : `Endpoint responded ${response.status} (not a 402 payment challenge).`;
    if (!isJsonMode()) {
      if (open) {
        printInfo(`No payment required (status ${response.status}).`);
      } else {
        printInfo(`Status ${response.status} — not a 402 payment challenge.`);
      }
      if (preview) {
        printBlank();
        console.log(preview);
        printBlank();
      }
    }
    throw new EstimateFailure(
      `${note} --estimate exits 0 only for a payable 402 x402 challenge.`,
      {
        url,
        method,
        status: response.status,
        ok: false,
        estimate: null,
        note,
        ...(preview ? { bodyPreview: preview } : {}),
      },
    );
  }

  // Read the x402 `accepts[]` envelope from the 402 body — the ONE dialect
  // (SUIMPP_X402_SCHEME; the MPP WWW-Authenticate header dialect was removed
  // from the stack 2026-08-03, S.880). Header-only 402s report as unpayable.
  interface X402Accept {
    scheme?: string;
    network?: string;
    asset?: string;
    maxAmountRequired?: string;
    payTo?: string;
    resource?: string;
    maxTimeoutSeconds?: number;
  }
  let accepts: X402Accept[] = [];
  try {
    const body = (await response.json()) as { accepts?: X402Accept[] };
    accepts = body.accepts ?? [];
  } catch {
    accepts = [];
  }
  const req = accepts.find((a) => a.scheme === 'exact' && a.network?.startsWith('sui:')) ?? accepts[0];
  const dialect = 'x402';
  if (!req) {
    // Mirror sdk.pay()'s fail-closed: a header-only MPP 402 is unpayable
    // (that dialect charged before the seller proved it could deliver).
    const headerOnly = /(^|,)\s*Payment[\s,]/i.test(`${response.headers.get('www-authenticate') ?? ''},`);
    throw new Error(
      headerOnly
        ? 'Service answered a header-only 402 (WWW-Authenticate: Payment) with no x402 ' +
          'accepts[] envelope. The MPP header dialect is no longer supported — the seller ' +
          'must offer x402 (e.g. @t2000/serve emits it). Nothing this CLI can pay.'
        : 'Service returned 402 but advertised no x402 requirement (accepts[]). ' +
          'Nothing this CLI can pay.',
    );
  }

  const amountRaw = req.maxAmountRequired;
  const asset = req.asset ?? 'unknown';
  const recipient = req.payTo ?? 'unknown';

  // Convert USDC raw units (6-decimal) to a USD display value when the asset
  // type ends in `::usdc::USDC` — best-effort, falls back to raw otherwise.
  const looksLikeUsdc = /::usdc::USDC/i.test(asset);
  const display =
    amountRaw && looksLikeUsdc
      ? `$${(Number(amountRaw) / 1_000_000).toFixed(4)} USDC`
      : amountRaw ?? 'unknown';

  // [2.13] Probe the input schema WITHOUT paying — from the gateway's OpenAPI
  // doc (which carries per-endpoint requestBody schemas). Best-effort: a missing
  // schema or an unreachable doc never fails the estimate.
  const inputSchema = await fetchInputSchema(url, method);

  if (isJsonMode()) {
    printJson({
      url,
      method,
      status: 402,
      estimate: {
        dialect,
        scheme: req.scheme,
        network: req.network,
        resource: req.resource,
        maxTimeoutSeconds: req.maxTimeoutSeconds,
        amount: amountRaw,
        amountDisplay: display,
        asset,
        recipient,
        inputSchema,
      },
    });
    return;
  }

  printBlank();
  printSuccess(`Service requires payment (${dialect} ${req.scheme ?? 'exact'} on ${req.network ?? 'sui'})`);
  printKeyValue('Price', pc.green(display));
  printKeyValue('Asset', asset);
  printKeyValue('Recipient', recipient);
  if (req.resource) {
    printKeyValue('Resource', req.resource);
  }
  const fields = describeSchemaFields(inputSchema);
  if (fields.length > 0) {
    printBlank();
    printInfo('Input (request body):');
    for (const f of fields) {
      printLine('  ' + pc.dim(f));
    }
  }
  printBlank();
  printInfo(`Run without --estimate to pay and execute.`);
  printBlank();
}

export function collectHeaders(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const [key, ...rest] = value.split('=');
  if (key && rest.length > 0) {
    previous[key.trim()] = rest.join('=').trim();
  }
  return previous;
}

interface JsonSchema {
  type?: string;
  description?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
}

/**
 * [2.13] Fetch the endpoint's input (requestBody) schema from the gateway's
 * OpenAPI doc — the only place per-endpoint schemas live. The OpenAPI path key
 * is `/${service.id}${endpoint.path}`, which equals the pay URL's pathname, so
 * the lookup is a direct match. Best-effort: returns `null` on any failure.
 */
export async function fetchInputSchema(url: string, method: string): Promise<JsonSchema | null> {
  try {
    const u = new URL(url);
    const res = await fetch(`${u.origin}/openapi.json`);
    if (!res.ok) return null;
    const doc = (await res.json()) as {
      paths?: Record<string, Record<string, { requestBody?: { content?: Record<string, { schema?: JsonSchema }> } }>>;
    };
    const op = doc.paths?.[u.pathname]?.[method.toLowerCase()];
    return op?.requestBody?.content?.['application/json']?.schema ?? null;
  } catch {
    return null;
  }
}

/** Render an object schema's top-level fields as `name[?]: type — description` lines. */
export function describeSchemaFields(schema: JsonSchema | null): string[] {
  if (!schema || schema.type !== 'object' || !schema.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]) => {
    const type = prop.type ?? (prop.enum ? `enum(${prop.enum.join('|')})` : 'any');
    const opt = required.has(name) ? '' : '?';
    const desc = prop.description ? ` — ${prop.description}` : '';
    return `${name}${opt}: ${type}${desc}`;
  });
}
