import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transformOpenAiImageGenerationsResponse } from './openai-image-blob-normalize';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}));

import { put } from '@vercel/blob';

describe('transformOpenAiImageGenerationsResponse', () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    vi.mocked(put).mockResolvedValue({
      url: 'https://blob.example.com/mpp-openai/out.png',
    } as Awaited<ReturnType<typeof put>>);
  });

  afterEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    vi.clearAllMocks();
  });

  it('rewrites b64_json entries to Blob urls and drops b64_json', async () => {
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const upstream = new Response(
      JSON.stringify({
        created: 1,
        data: [{ b64_json: tinyPngBase64, revised_prompt: 'a robot' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

    const out = await transformOpenAiImageGenerationsResponse(upstream);
    expect(out.status).toBe(200);
    const body = await out.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].url).toBe('https://blob.example.com/mpp-openai/out.png');
    expect(body.data[0].revised_prompt).toBe('a robot');
    expect(body.data[0].b64_json).toBeUndefined();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('passes through when data already has url', async () => {
    const upstream = new Response(
      JSON.stringify({
        data: [{ url: 'https://cdn.example.com/a.png' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

    const out = await transformOpenAiImageGenerationsResponse(upstream);
    expect(out.status).toBe(200);
    const body = await out.json();
    expect(body.data[0].url).toBe('https://cdn.example.com/a.png');
    expect(put).not.toHaveBeenCalled();
  });

  it('returns 503 when token missing', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const upstream = new Response(
      JSON.stringify({ data: [{ b64_json: 'abcd' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

    const out = await transformOpenAiImageGenerationsResponse(upstream);
    expect(out.status).toBe(503);
    expect(put).not.toHaveBeenCalled();
  });
});
