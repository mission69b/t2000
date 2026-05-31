import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (filename: string) => ({ url: `https://blob.test/${filename}` })),
}));

import { isBinaryContentType, normalizeBinaryResponse } from './artifact-store';

afterEach(() => {
  vi.unstubAllEnvs();
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

describe('normalizeBinaryResponse — passthrough', () => {
  it('returns JSON responses untouched', async () => {
    const res = Response.json({ ok: true });
    const out = await normalizeBinaryResponse(res);
    expect(out).toBe(res);
  });

  it('returns text responses untouched', async () => {
    const res = new Response('hello', { headers: { 'content-type': 'text/plain' } });
    const out = await normalizeBinaryResponse(res);
    expect(out).toBe(res);
  });

  it('passes a 402 challenge through even if it claims a binary type', async () => {
    const res = new Response('challenge', {
      status: 402,
      headers: { 'content-type': 'audio/mpeg' },
    });
    const out = await normalizeBinaryResponse(res);
    expect(out).toBe(res);
  });
});

describe('normalizeBinaryResponse — binary hosting', () => {
  it('hosts binary as an artifact + returns JSON { url, contentType, sizeBytes }, preserving Payment-Receipt', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
    const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x01, 0x02]); // fake mp3 frame
    const res = new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', 'Payment-Receipt': 'reference=abc123' },
    });

    const out = await normalizeBinaryResponse(res);
    expect(out.status).toBe(200);
    expect(out.headers.get('content-type')).toBe('application/json');
    // MPP receipt must survive the rewrite.
    expect(out.headers.get('Payment-Receipt')).toBe('reference=abc123');

    const json = (await out.json()) as { url: string; contentType: string; sizeBytes: number };
    expect(json.url).toMatch(/^https:\/\/blob\.test\/mpp-artifacts\//);
    expect(json.url).toMatch(/\.mp3$/);
    expect(json.contentType).toBe('audio/mpeg');
    expect(json.sizeBytes).toBe(bytes.length);
  });

  it('degrades honestly with 503 (not a corrupted body) when no blob backend is configured', async () => {
    // Default test env has no BLOB_READ_WRITE_TOKEN.
    const res = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
    const out = await normalizeBinaryResponse(res);
    expect(out.status).toBe(503);
    expect(out.headers.get('content-type')).toBe('application/json');
    const json = (await out.json()) as { error: string };
    expect(json.error).toMatch(/BLOB_READ_WRITE_TOKEN/);
  });
});
