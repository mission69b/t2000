import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from './gateway';

function mockResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchWithRetry — 4xx responses are never retried', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns 200 immediately', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const res = await fetchWithRetry('https://api.example.com', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 422 immediately without retrying (the Lob failure mode)', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(422, { message: 'Invalid country code' }),
    );

    const res = await fetchWithRetry('https://api.lob.com/v1/postcards', { method: 'POST' });
    expect(res.status).toBe(422);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const body = await res.json();
    expect(body.message).toBe('Invalid country code');
  });

  it('returns 400 immediately without retrying', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(400, { error: 'bad request' }));

    const res = await fetchWithRetry('https://api.example.com', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('fetchWithRetry — 5xx responses trigger retries', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('retries on 500 and returns 502 after all attempts fail', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(500));

    const res = await fetchWithRetry('https://api.example.com', { method: 'POST' }, 3);
    expect(res.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns 200 after two 500s then success', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(200, { result: 'ok' }));

    const res = await fetchWithRetry('https://api.example.com', { method: 'POST' }, 3);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns 502 on network errors after all retries', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'));

    const res = await fetchWithRetry('https://api.example.com', { method: 'POST' }, 3);
    expect(res.status).toBe(502);

    const body = await res.json();
    expect(body.error).toContain('Upstream service unavailable');
  });
});
