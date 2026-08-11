// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// Unit tests for `t2 pay` helpers. The full --estimate / payment paths
// require live network calls; those are smoked in Phase G. These tests
// lock down the pure parser semantics.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { collectHeaders, describeSchemaFields, fetchInputSchema, runEstimate, truncatePreview } from './pay.js';

describe('collectHeaders', () => {
  it('parses key=value into the accumulator', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('Authorization=Bearer abc', acc);
    expect(next).toEqual({ Authorization: 'Bearer abc' });
  });

  it('trims whitespace around key and value', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('  X-Foo  =  bar baz  ', acc);
    expect(next).toEqual({ 'X-Foo': 'bar baz' });
  });

  it('preserves "=" characters within the value', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('X-Token=a=b=c', acc);
    expect(next).toEqual({ 'X-Token': 'a=b=c' });
  });

  it('accumulates across multiple invocations (repeatable --header flag)', () => {
    let acc: Record<string, string> = {};
    acc = collectHeaders('A=1', acc);
    acc = collectHeaders('B=2', acc);
    expect(acc).toEqual({ A: '1', B: '2' });
  });

  it('ignores a malformed flag with no "=" separator', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('not-a-header', acc);
    expect(next).toEqual({});
  });

  it('ignores a flag with empty key', () => {
    const acc: Record<string, string> = {};
    const next = collectHeaders('=value', acc);
    expect(next).toEqual({});
  });
});

describe('describeSchemaFields (2.13)', () => {
  it('renders required/optional fields with type + description', () => {
    const fields = describeSchemaFields({
      type: 'object',
      required: ['model', 'messages'],
      properties: {
        model: { type: 'string', description: 'Model id' },
        messages: { type: 'array' },
        temperature: { type: 'number' },
      },
    });
    expect(fields).toEqual([
      'model: string — Model id',
      'messages: array',
      'temperature?: number',
    ]);
  });

  it('returns [] for a null or non-object schema', () => {
    expect(describeSchemaFields(null)).toEqual([]);
    expect(describeSchemaFields({ type: 'string' })).toEqual([]);
  });

  it('renders enums', () => {
    const fields = describeSchemaFields({
      type: 'object',
      properties: { size: { enum: ['1024x1024', '512x512'] } },
    });
    expect(fields[0]).toBe('size?: enum(1024x1024|512x512)');
  });
});

describe('fetchInputSchema (2.13)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('extracts the requestBody schema for the URL pathname + method', async () => {
    const doc = {
      paths: {
        '/openai/v1/chat/completions': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { model: { type: 'string' } } } } } },
          },
        },
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(doc), { status: 200 })));
    const schema = await fetchInputSchema('https://paid.example/openai/v1/chat/completions', 'POST');
    expect(schema?.properties?.model?.type).toBe('string');
  });

  it('returns null when the doc fetch fails (best-effort)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await fetchInputSchema('https://paid.example/openai/v1/chat/completions', 'POST')).toBeNull();
  });

  it('returns null when the endpoint has no schema in the doc', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ paths: {} }), { status: 200 })));
    expect(await fetchInputSchema('https://paid.example/unknown/path', 'POST')).toBeNull();
  });
});

describe('truncatePreview (S.1002)', () => {
  it('returns short bodies unchanged', () => {
    expect(truncatePreview('hello')).toBe('hello');
    expect(truncatePreview('a'.repeat(512))).toBe('a'.repeat(512));
  });

  it('truncates long bodies with an honest size note', () => {
    const body = 'x'.repeat(2048);
    const out = truncatePreview(body);
    expect(out).toBe(`${'x'.repeat(512)}… (truncated, 2048 total bytes)`);
  });
});

describe('runEstimate exit contract (S.1002)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws on a 2xx response — "no payment required" must not exit 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>welcome</html>', { status: 200 })));
    await expect(runEstimate('https://example.com/', { method: 'GET', maxPrice: '1.00', header: {} })).rejects.toThrow(
      /exits 0 only for a payable 402/,
    );
  });

  it('throws on 404/dead URLs and truncates the body preview in the JSON payload', async () => {
    const hugeBody = '<html>' + 'z'.repeat(4096) + '</html>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(hugeBody, { status: 404 })));
    const failure = await runEstimate('https://example.com/typo', { method: 'GET', maxPrice: '1.00', header: {} }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(Error);
    const payload = (failure as { toJSON(): Record<string, unknown> }).toJSON();
    expect(payload.ok).toBe(false);
    expect(payload.status).toBe(404);
    expect(payload.estimate).toBeNull();
    const preview = payload.bodyPreview as string;
    expect(preview.length).toBeLessThan(600); // 512 + truncation note, never the 4KB dump
    expect(preview).toContain('total bytes)');
  });

  it('resolves (exit 0 path) on a payable 402 x402 accepts[] challenge', async () => {
    const challenge = {
      x402Version: 1,
      error: 'Payment required',
      accepts: [
        {
          scheme: 'exact',
          network: 'sui:mainnet',
          asset: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
          maxAmountRequired: '10000',
          payTo: '0x' + 'a'.repeat(64),
          resource: 'https://paid.example/search',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input).includes('/search')
          ? new Response(JSON.stringify(challenge), { status: 402 })
          : new Response('nope', { status: 404 }), // best-effort openapi probe
      ),
    );
    await expect(runEstimate('https://paid.example/search', { method: 'GET', maxPrice: '1.00', header: {} })).resolves.toBeUndefined();
  });

  it('still throws on a 402 with no payable accepts[] (header-only)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('payment required', {
            status: 402,
            headers: { 'WWW-Authenticate': 'Payment realm="x", recipient="0xabc"' },
          }),
      ),
    );
    await expect(runEstimate('https://paid.example/hdr', { method: 'GET', maxPrice: '1.00', header: {} })).rejects.toThrow(
      /header-only 402/,
    );
  });
});
