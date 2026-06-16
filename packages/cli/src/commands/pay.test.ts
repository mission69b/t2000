// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 3 — 2026-05-26]
// Unit tests for `t2 pay` helpers. The full --estimate / payment paths
// require live network calls; those are smoked in Phase G. These tests
// lock down the pure parser semantics.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { collectHeaders, describeSchemaFields, fetchInputSchema } from './pay.js';

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
    const schema = await fetchInputSchema('https://mpp.t2000.ai/openai/v1/chat/completions', 'POST');
    expect(schema?.properties?.model?.type).toBe('string');
  });

  it('returns null when the doc fetch fails (best-effort)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await fetchInputSchema('https://mpp.t2000.ai/openai/v1/chat/completions', 'POST')).toBeNull();
  });

  it('returns null when the endpoint has no schema in the doc', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ paths: {} }), { status: 200 })));
    expect(await fetchInputSchema('https://mpp.t2000.ai/unknown/path', 'POST')).toBeNull();
  });
});
