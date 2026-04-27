import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFinancialContextSnapshot } from './financialContextSnapshot.js';

/**
 * [v1.4.2 — Day 5 / Spec Item 6] Tests for the thin t2000-side cron
 * shell that triggers the audric internal API. Mirrors the pattern in
 * `scheduler.test.ts`: stub `globalThis.fetch`, assert the call shape
 * (URL + headers), assert the JobResult mapping, and verify the
 * fail-soft branches (HTTP non-2xx, network error). Real fan-out logic
 * is on the audric side; nothing here issues SQL.
 */
const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubEnv('AUDRIC_INTERNAL_URL', 'https://test.audric.ai');
  vi.stubEnv('AUDRIC_INTERNAL_KEY', 'test-internal-key');
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('runFinancialContextSnapshot', () => {
  it('POSTs to the audric internal endpoint with the internal-key header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 12, skipped: 3, errors: 0, total: 15 }),
    });

    await runFinancialContextSnapshot();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://test.audric.ai/api/internal/financial-context-snapshot');
    expect(opts.method).toBe('POST');
    const headers = opts.headers as Record<string, string>;
    expect(headers['x-internal-key']).toBe('test-internal-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('maps the audric response into a JobResult with the new financial-context-snapshot job name', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 12, skipped: 3, errors: 1, total: 15 }),
    });

    const result = await runFinancialContextSnapshot();

    expect(result).toEqual({
      job: 'financial-context-snapshot',
      processed: 15,
      sent: 12,
      errors: 1,
    });
  });

  it('returns errors=1 when the audric endpoint responds non-2xx (does not throw)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    const result = await runFinancialContextSnapshot();

    expect(result).toEqual({
      job: 'financial-context-snapshot',
      processed: 0,
      sent: 0,
      errors: 1,
    });
  });

  it('returns errors=1 on network failure (does not throw)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await runFinancialContextSnapshot();

    expect(result).toEqual({
      job: 'financial-context-snapshot',
      processed: 0,
      sent: 0,
      errors: 1,
    });
  });

  it('falls back to the production audric URL when AUDRIC_INTERNAL_URL is unset', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'test-internal-key');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 0, skipped: 0, errors: 0, total: 0 }),
    });

    await runFinancialContextSnapshot();

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('https://audric.ai/api/internal/financial-context-snapshot');
  });

  it('sends an empty x-internal-key header when AUDRIC_INTERNAL_KEY is unset (caller will reject)', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('AUDRIC_INTERNAL_URL', 'https://test.audric.ai');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 0, skipped: 0, errors: 0, total: 0 }),
    });

    await runFinancialContextSnapshot();

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['x-internal-key']).toBe('');
  });

  it('reports zero counts when the endpoint returns an empty user pool', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 0, skipped: 0, errors: 0, total: 0 }),
    });

    const result = await runFinancialContextSnapshot();
    expect(result).toEqual({
      job: 'financial-context-snapshot',
      processed: 0,
      sent: 0,
      errors: 0,
    });
  });
});
