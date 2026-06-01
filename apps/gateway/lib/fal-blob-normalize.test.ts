import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (filename: string) => ({ url: `https://blob.test/${filename}` })),
}));

import { rehostFalMediaResponse } from './fal-blob-normalize';

const realFetch = globalThis.fetch;

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function falJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('rehostFalMediaResponse — re-hosts fal-CDN assets to the artifact store', () => {
  beforeEach(() => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
  });

  it('rewrites an image URL (flux shape) to a blob URL, preserving shape', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await rehostFalMediaResponse(
      falJson({ images: [{ url: 'https://v3b.fal.media/files/abc/out.jpg', width: 768 }] }),
    );
    const json = (await out.json()) as { images: { url: string; width: number }[] };

    expect(fetchMock).toHaveBeenCalledWith('https://v3b.fal.media/files/abc/out.jpg');
    expect(json.images[0].url).toMatch(/^https:\/\/blob\.test\/mpp-artifacts\//);
    expect(json.images[0].url).toMatch(/\.jpg$/);
    expect(json.images[0].width).toBe(768); // sibling fields untouched
  });

  it('rewrites a nested audio URL (stable-audio shape)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0xff, 0xfb]), { headers: { 'content-type': 'audio/wav' } }),
    ) as unknown as typeof fetch;

    const out = await rehostFalMediaResponse(
      falJson({ audio_file: { url: 'https://v3b.fal.media/files/x/out.wav', file_size: 5300000 } }),
    );
    const json = (await out.json()) as { audio_file: { url: string } };

    expect(json.audio_file.url).toMatch(/^https:\/\/blob\.test\/mpp-artifacts\/.*\.wav$/);
  });

  it('de-dupes repeated URLs into a single fetch + upload', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const url = 'https://fal.media/files/dup/out.png';

    await rehostFalMediaResponse(falJson({ a: url, b: url, nested: { c: url } }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for text-only responses (whisper) — no fetch, body unchanged', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await rehostFalMediaResponse(falJson({ text: 'hello world, no urls here' }));
    const json = (await out.json()) as { text: string };

    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.text).toBe('hello world, no urls here');
  });

  it('leaves the original fal URL on upstream fetch failure (never breaks a paid response)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;

    const out = await rehostFalMediaResponse(
      falJson({ images: [{ url: 'https://v3b.fal.media/files/x/out.jpg' }] }),
    );
    const json = (await out.json()) as { images: { url: string }[] };

    expect(json.images[0].url).toBe('https://v3b.fal.media/files/x/out.jpg');
  });
});

describe('rehostFalMediaResponse — degrades without a blob backend', () => {
  it('returns the original fal URLs untouched when BLOB_READ_WRITE_TOKEN is unset', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await rehostFalMediaResponse(
      falJson({ images: [{ url: 'https://v3b.fal.media/files/x/out.jpg' }] }),
    );
    const json = (await out.json()) as { images: { url: string }[] };

    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.images[0].url).toBe('https://v3b.fal.media/files/x/out.jpg');
  });
});
