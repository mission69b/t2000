import { describe, expect, it } from 'vitest';
import { createServe } from './serve.js';

const PAY_TO = '0x' + 'ab'.repeat(32);

const echoSchema = {
  safeParse: (value: unknown) => ({ success: true as const, data: value }),
};

const echoJsonSchema = {
  type: 'object',
  properties: { query: { type: 'string', description: 'What to search for' } },
  required: ['query'],
};

const resultJsonSchema = {
  type: 'object',
  properties: {
    logoSvg: { type: 'string', contentMediaType: 'image/svg+xml' },
    summary: { type: 'string', contentMediaType: 'text/markdown' },
  },
};

function makeServe() {
  const serve = createServe({
    payTo: PAY_TO,
    baseUrl: 'https://api.example.com',
    name: 'Example Search',
    description: 'Web search for agents, paid per call.',
    report: false,
  });
  serve
    .route({ path: 'search', description: 'Search the web' })
    .paid('0.01')
    .body(echoSchema, echoJsonSchema)
    .response(resultJsonSchema)
    .handler(({ body }) => body);
  serve
    .route({ path: 'health' })
    .unprotected()
    .handler(() => ({ ok: true }));
  return serve;
}

describe('openapi.json', () => {
  it('emits the exact shape the catalog ingest grades warning-free', async () => {
    const serve = makeServe();
    const res = serve.openapi()(new Request('https://api.example.com/openapi.json'));
    expect(res.headers.get('content-type')).toContain('application/json');
    const doc = (await res.json()) as {
      openapi: string;
      info: { title: string; description?: string };
      paths: Record<
        string,
        {
          post: {
            'x-payment-info'?: { price: string; currency: string };
            requestBody?: { content: Record<string, { schema: unknown }> };
            responses: Record<string, unknown>;
          };
        }
      >;
    };

    // gradeListing reads: info.title, info.description, flat string price,
    // application/json requestBody schema. All four present = zero warnings.
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Example Search');
    expect(doc.info.description).toBe('Web search for agents, paid per call.');

    const paid = doc.paths['/search'].post;
    expect(paid['x-payment-info']).toEqual({
      pricingMode: 'fixed',
      price: '0.01',
      currency: 'USDC',
      protocols: ['mpp', 'x402'],
      x402: {
        scheme: 'exact',
        network: 'sui:mainnet',
        asset: expect.stringContaining('::usdc::USDC'),
        payTo: PAY_TO,
      },
    });
    expect(paid.requestBody?.content['application/json'].schema).toEqual(echoJsonSchema);
    expect(paid.responses['402']).toBeDefined();
    // The declared deliverable contract rides the 200 response.
    expect(
      (
        paid.responses['200'] as {
          content?: Record<string, { schema: unknown }>;
        }
      ).content?.['application/json'].schema
    ).toEqual(resultJsonSchema);

    // Free routes carry no pricing extension.
    expect(doc.paths['/health'].post['x-payment-info']).toBeUndefined();
  });

  it('falls back to the request origin when baseUrl is unset', async () => {
    const serve = createServe({ payTo: PAY_TO, report: false });
    serve.route({ path: 'a' }).paid('1').handler(() => ({}));
    const res = serve.openapi()(new Request('https://deployed.example/openapi.json'));
    const doc = (await res.json()) as { servers: Array<{ url: string }> };
    expect(doc.servers[0].url).toBe('https://deployed.example');
  });
});

describe('llms.txt', () => {
  it('describes pricing, payment flow, and schemas in plain text', async () => {
    const serve = makeServe();
    const res = serve.llms()(new Request('https://api.example.com/llms.txt'));
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('# Example Search');
    expect(text).toContain('0.01 USDC per call');
    expect(text).toContain('X-PAYMENT');
    expect(text).toContain('t2 pay');
    expect(text).toContain('"query"'); // the JSON schema is inlined
    expect(text).toContain('"logoSvg"'); // the response schema is inlined too
    expect(text).toContain('https://api.example.com/openapi.json');
  });
});

describe('catalog contract — the real @suimpp/discovery validators', () => {
  it('extractEndpoints + validateOpenApi accept the generated doc with zero errors', async () => {
    const { extractEndpoints, validateOpenApi } = await import('@suimpp/discovery');
    const serve = makeServe();
    const res = serve.openapi()(new Request('https://api.example.com/openapi.json'));
    const doc = (await res.json()) as Parameters<typeof extractEndpoints>[0];

    const endpoints = extractEndpoints(doc);
    const paid = endpoints.find((e) => e.path === '/search');
    expect(paid).toBeDefined();
    // The ingest's price parse: flat string `x-payment-info.price`.
    expect(paid?.paymentInfo.price).toBe('0.01');
    expect(paid?.has402Response).toBe(true);
    expect(paid?.hasRequestBody).toBe(true);

    const issues = validateOpenApi(doc, endpoints, 'https://api.example.com');
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('serve.fetch (fetch-runtime adapter)', () => {
  it('dispatches routes and discovery docs from one handler', async () => {
    const serve = makeServe();

    const health = await serve.fetch(
      new Request('https://api.example.com/health', { method: 'GET' }),
    );
    expect(health.status).toBe(200);

    const openapi = await serve.fetch(new Request('https://api.example.com/openapi.json'));
    expect(openapi.status).toBe(200);
    expect(((await openapi.json()) as { openapi: string }).openapi).toBe('3.1.0');

    const llms = await serve.fetch(new Request('https://api.example.com/llms.txt'));
    expect(await llms.text()).toContain('Example Search');

    const missing = await serve.fetch(new Request('https://api.example.com/nope'));
    expect(missing.status).toBe(404);
  });
});
