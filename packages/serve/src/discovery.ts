import { USDC, USDC_TESTNET } from '@suimpp/mpp/server';
import type { Serve } from './serve.js';

// ---------------------------------------------------------------------------
// Discovery docs — /openapi.json + /llms.txt.
//
// The shapes here are graded by the catalog's ingest (apps/gateway/lib/
// catalog-ingest.ts `gradeListing`): a warning-free listing needs info.title,
// a one-paragraph info.description, a flat string `x-payment-info.price` per
// paid operation, and an application/json requestBody schema with typed
// properties. Everything serve can derive is emitted automatically; the JSON
// request schema comes from the route's `inputSchema` (zod v4 users:
// `z.toJSONSchema(schema)`).
// ---------------------------------------------------------------------------

export function buildOpenApiDocument(serve: Serve, origin?: string): Record<string, unknown> {
  const base = serve.baseUrl ?? origin;
  const paths: Record<string, unknown> = {};

  for (const route of serve.routes.values()) {
    const { path, priceUsdc, description, inputSchema } = route.meta;
    const operation: Record<string, unknown> = {
      operationId: path.replace(/[^a-zA-Z0-9]+/g, '_'),
      summary: description ?? path,
      responses: {
        '200': { description: 'Success' },
        ...(priceUsdc
          ? {
              '402': {
                description:
                  'Payment required — the body carries an x402 accepts[] envelope (scheme "exact", network sui). Sign it and retry with the X-PAYMENT header.',
              },
            }
          : {}),
        '422': { description: 'Invalid request body — never charged' },
      },
    };
    if (priceUsdc) {
      // Same shape the gateway's own /openapi.json emits: 'mpp' is the
      // protocol family, 'x402' the dialect; the x402 block mirrors the
      // static half of the live accepts[] entry (dynamic fields ride the 402).
      operation['x-payment-info'] = {
        pricingMode: 'fixed',
        price: priceUsdc,
        currency: 'USDC',
        protocols: ['mpp', 'x402'],
        x402: {
          scheme: 'exact',
          network: `sui:${serve.network}`,
          asset: (serve.network === 'testnet' ? USDC_TESTNET : USDC).type,
          payTo: serve.payTo,
        },
      };
    }
    if (inputSchema) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: inputSchema } },
      };
    }
    paths[`/${path}`] = { post: operation };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: serve.name ?? 'Paid API',
      version: '1.0.0',
      description:
        serve.description ??
        'Agent-payable API. Every paid endpoint answers 402 with an x402 accepts[] envelope; payment settles in USDC on Sui.',
    },
    ...(base ? { servers: [{ url: base }] } : {}),
    paths,
  };
}

export function buildLlmsTxt(serve: Serve, origin?: string): string {
  const base = serve.baseUrl ?? origin ?? '';
  const lines: string[] = [];
  lines.push(`# ${serve.name ?? 'Paid API'}`);
  lines.push('');
  if (serve.description) {
    lines.push(serve.description);
    lines.push('');
  }
  lines.push('## How to pay');
  lines.push('');
  lines.push(
    'Endpoints below are paid per call in USDC on Sui (x402). An unpaid request returns',
    'HTTP 402 with an `accepts[]` envelope; sign it and retry with the `X-PAYMENT` header.',
    'Invalid input returns 422 before any payment is taken. A failed call is never charged.',
    '',
    'Easiest client: `npm i -g @t2000/cli` then `t2 pay <url> --data \'{...}\'`,',
    'or the t2000 MCP server (`t2000_pay`), or `@t2000/sdk` `pay()`.',
    '',
  );
  lines.push('## Endpoints');
  lines.push('');
  for (const route of serve.routes.values()) {
    const { path, priceUsdc, description, inputSchema } = route.meta;
    const price = priceUsdc ? `${priceUsdc} USDC per call` : 'free';
    lines.push(`### POST ${base}/${path} — ${price}`);
    if (description) lines.push(description);
    if (inputSchema) {
      lines.push('Request body (JSON Schema):');
      lines.push('```json');
      lines.push(JSON.stringify(inputSchema, null, 2));
      lines.push('```');
    }
    lines.push('');
  }
  lines.push(`Discovery: ${base}/openapi.json`);
  return lines.join('\n');
}
