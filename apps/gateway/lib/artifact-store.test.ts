import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (filename: string) => ({ url: `https://blob.test/${filename}` })),
}));

import { isBinaryContentType, normalizeResponse } from './artifact-store';

const realFetch = globalThis.fetch;

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('isBinaryContentType', () => {
  it('is true for media/document binary types', () => {
    expect(isBinaryContentType('audio/mpeg')).toBe(true);
    expect(isBinaryContentType('audio/mpeg; charset=binary')).toBe(true);
    expect(isBinaryContentType('image/png')).toBe(true);
    expect(isBinaryContentType('application/pdf')).toBe(true);
    expect(isBinaryContentType('application/octet-stream')).toBe(true);
    expect(isBinaryContentType('video/mp4')).toBe(true);
  });

  it('is false for text/JSON and missing types', () => {
    expect(isBinaryContentType('application/json')).toBe(false);
    expect(isBinaryContentType('text/plain')).toBe(false);
    expect(isBinaryContentType('text/html; charset=utf-8')).toBe(false);
    expect(isBinaryContentType(null)).toBe(false);
    expect(isBinaryContentType(undefined)).toBe(false);
  });
});

describe('normalizeResponse — passthrough', () => {
  it('returns plain JSON responses untouched (no blob backend → same object)', async () => {
    const res = Response.json({ ok: true });
    const out = await normalizeResponse(res);
    expect(out).toBe(res);
  });

  it('returns text responses untouched', async () => {
    const res = new Response('hello', { headers: { 'content-type': 'text/plain' } });
    const out = await normalizeResponse(res);
    expect(out).toBe(res);
  });

  it('passes a 402 challenge through even if it claims a binary type', async () => {
    const res = new Response('challenge', {
      status: 402,
      headers: { 'content-type': 'audio/mpeg' },
    });
    const out = await normalizeResponse(res);
    expect(out).toBe(res);
  });

  it('passes a non-OK JSON error body through untouched (no rehost on 4xx/5xx)', async () => {
    // Regression: an upstream error (e.g. OpenAI model_not_found 404) must reach
    // the caller verbatim — never run rehost I/O on it (intermittent throw → 500).
    const res = Response.json(
      { error: { message: 'model not found', code: 'model_not_found' } },
      { status: 404 },
    );
    const out = await normalizeResponse(res);
    expect(out).toBe(res);
  });
});

describe('normalizeResponse — binary hosting (shape #1)', () => {
  it('hosts binary as an artifact + returns JSON { url, contentType, sizeBytes }, preserving Payment-Receipt', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x01, 0x02]); // fake mp3 frame
    const res = new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', 'Payment-Receipt': 'reference=abc123' },
    });

    const out = await normalizeResponse(res);
    expect(out.status).toBe(200);
    expect(out.headers.get('content-type')).toBe('application/json');
    expect(out.headers.get('Payment-Receipt')).toBe('reference=abc123');

    const json = (await out.json()) as { url: string; contentType: string; sizeBytes: number };
    expect(json.url).toMatch(/^https:\/\/blob\.test\/mpp-artifacts\//);
    expect(json.url).toMatch(/\.mp3$/);
    expect(json.contentType).toBe('audio/mpeg');
    expect(json.sizeBytes).toBe(bytes.length);
  });

  it('degrades honestly with 503 (not a corrupted body) when no blob backend is configured', async () => {
    const res = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
    const out = await normalizeResponse(res);
    expect(out.status).toBe(503);
    expect(out.headers.get('content-type')).toBe('application/json');
    const json = (await out.json()) as { error: string };
    expect(json.error).toMatch(/BLOB_READ_WRITE_TOKEN/);
  });
});

describe('normalizeResponse — provider asset URL re-hosting (shape #2)', () => {
  it('re-hosts a provider-CDN URL (flux shape) to a blob URL, preserving shape + Payment-Receipt', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = Response.json(
      { images: [{ url: 'https://v3b.fal.media/files/abc/out.jpg', width: 768 }] },
      { headers: { 'Payment-Receipt': 'reference=xyz' } },
    );
    const out = await normalizeResponse(res);
    const json = (await out.json()) as { images: { url: string; width: number }[] };

    expect(fetchMock).toHaveBeenCalledWith('https://v3b.fal.media/files/abc/out.jpg');
    expect(json.images[0].url).toMatch(/^https:\/\/blob\.test\/mpp-artifacts\/.*\.jpg$/);
    expect(json.images[0].width).toBe(768); // sibling fields untouched
    expect(out.headers.get('Payment-Receipt')).toBe('reference=xyz'); // receipt survives
  });

  it('re-hosts a nested audio URL (stable-audio shape)', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0xff, 0xfb]), { headers: { 'content-type': 'audio/wav' } }),
    ) as unknown as typeof fetch;

    const res = Response.json({ audio_file: { url: 'https://v3b.fal.media/files/x/out.wav' } });
    const out = await normalizeResponse(res);
    const json = (await out.json()) as { audio_file: { url: string } };

    expect(json.audio_file.url).toMatch(/^https:\/\/blob\.test\/mpp-artifacts\/.*\.wav$/);
  });

  it('infers .wav from the source URL when the CDN serves a generic octet-stream type', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0xff, 0xfb]), { headers: { 'content-type': 'application/octet-stream' } }),
    ) as unknown as typeof fetch;

    const res = Response.json({ audio_file: { url: 'https://v3b.fal.media/files/x/out.wav' } });
    const out = await normalizeResponse(res);
    const json = (await out.json()) as { audio_file: { url: string } };

    expect(json.audio_file.url).toMatch(/\.wav$/); // not .bin
  });

  it('maps non-standard audio MIME variants (audio/x-wav) to .wav', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0xff, 0xfb]), { headers: { 'content-type': 'audio/x-wav' } }),
    ) as unknown as typeof fetch;

    const res = Response.json({ audio: 'https://v3b.fal.media/files/x/clip' });
    const out = await normalizeResponse(res);
    const json = (await out.json()) as { audio: string };

    expect(json.audio).toMatch(/\.wav$/);
  });

  it('de-dupes repeated URLs into a single fetch + upload', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const url = 'https://fal.media/files/dup/out.png';

    await normalizeResponse(Response.json({ a: url, b: url, nested: { c: url } }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never re-hosts arbitrary third-party URLs (research-tool citations pass through)', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = Response.json({
      results: [
        { title: 'A paper', url: 'https://arxiv.org/abs/2605.12345' },
        { title: 'A news story', url: 'https://example.com/story' },
      ],
    });
    const out = await normalizeResponse(res);
    const json = (await out.json()) as { results: { url: string }[] };

    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.results[0].url).toBe('https://arxiv.org/abs/2605.12345');
    expect(json.results[1].url).toBe('https://example.com/story');
  });

  it('leaves the original provider URL on upstream fetch failure (never breaks a paid response)', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;

    const res = Response.json({ images: [{ url: 'https://v3b.fal.media/files/x/out.jpg' }] });
    const out = await normalizeResponse(res);
    const json = (await out.json()) as { images: { url: string }[] };

    expect(json.images[0].url).toBe('https://v3b.fal.media/files/x/out.jpg');
  });

  it('leaves provider URLs untouched when no blob backend is configured (degrade, not fail)', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = Response.json({ images: [{ url: 'https://v3b.fal.media/files/x/out.jpg' }] });
    const out = await normalizeResponse(res);
    const json = (await out.json()) as { images: { url: string }[] };

    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.images[0].url).toBe('https://v3b.fal.media/files/x/out.jpg');
  });
});
