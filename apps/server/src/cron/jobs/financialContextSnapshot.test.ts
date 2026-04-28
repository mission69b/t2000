import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFinancialContextSnapshot } from './financialContextSnapshot.js';

/**
 * [PR 3 — scaling spec] Tests for the sharded cron fan-out.
 *
 * The job now fires N parallel POSTs with `?shard=i&total=N`.
 * Tests assert:
 *   - Correct number of calls fired
 *   - Each call carries the right shard index and total
 *   - Aggregation correctly sums all shards
 *   - Single-shard (T2000_FIN_CTX_SHARD_COUNT=1) matches old behavior
 *   - Per-shard errors don't abort other shards (Promise.allSettled)
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

describe('runFinancialContextSnapshot — sharding', () => {
  it('fires T2000_FIN_CTX_SHARD_COUNT=4 parallel POSTs with correct shard params', async () => {
    vi.stubEnv('T2000_FIN_CTX_SHARD_COUNT', '4');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 5, skipped: 1, errors: 0, total: 6 }),
    });

    await runFinancialContextSnapshot();

    expect(mockFetch).toHaveBeenCalledTimes(4);

    const urls = mockFetch.mock.calls.map(([url]: [string]) => url as string);
    expect(urls).toContain('https://test.audric.ai/api/internal/financial-context-snapshot?shard=0&total=4');
    expect(urls).toContain('https://test.audric.ai/api/internal/financial-context-snapshot?shard=1&total=4');
    expect(urls).toContain('https://test.audric.ai/api/internal/financial-context-snapshot?shard=2&total=4');
    expect(urls).toContain('https://test.audric.ai/api/internal/financial-context-snapshot?shard=3&total=4');
  });

  it('aggregates counts from all shards into a single JobResult', async () => {
    vi.stubEnv('T2000_FIN_CTX_SHARD_COUNT', '4');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 10, skipped: 2, errors: 1, total: 12 }),
    });

    const result = await runFinancialContextSnapshot();

    expect(result.job).toBe('financial-context-snapshot');
    expect(result.processed).toBe(48); // 4 shards × 12 total
    expect(result.sent).toBe(40);      // 4 shards × 10 created
    expect(result.errors).toBe(4);     // 4 shards × 1 error
  });

  it('falls back to 8 shards when T2000_FIN_CTX_SHARD_COUNT is unset', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 0, skipped: 0, errors: 0, total: 0 }),
    });

    await runFinancialContextSnapshot();

    expect(mockFetch).toHaveBeenCalledTimes(8);
  });

  it('single-shard (T2000_FIN_CTX_SHARD_COUNT=1) matches original single-POST behavior', async () => {
    vi.stubEnv('T2000_FIN_CTX_SHARD_COUNT', '1');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 12, skipped: 3, errors: 0, total: 15 }),
    });

    const result = await runFinancialContextSnapshot();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://test.audric.ai/api/internal/financial-context-snapshot?shard=0&total=1');
    expect((opts.headers as Record<string, string>)['x-internal-key']).toBe('test-internal-key');
    expect(result.processed).toBe(15);
    expect(result.sent).toBe(12);
    expect(result.errors).toBe(0);
  });

  it('continues processing other shards when one shard returns HTTP non-2xx', async () => {
    vi.stubEnv('T2000_FIN_CTX_SHARD_COUNT', '4');
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ created: 5, skipped: 0, errors: 0, total: 5 }),
      });

    const result = await runFinancialContextSnapshot();

    expect(mockFetch).toHaveBeenCalledTimes(4);
    // Shard 0 failed (errors+=1, rest=0), shards 1-3 succeeded
    expect(result.errors).toBe(1);
    expect(result.sent).toBe(15); // 3 shards × 5 created
    expect(result.processed).toBe(15);
  });

  it('continues processing other shards when one shard throws (network error)', async () => {
    vi.stubEnv('T2000_FIN_CTX_SHARD_COUNT', '4');
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ created: 3, skipped: 0, errors: 0, total: 3 }),
      });

    const result = await runFinancialContextSnapshot();

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result.errors).toBe(1);
    expect(result.sent).toBe(9); // 3 shards × 3 created
  });

  it('uses the production audric URL when AUDRIC_INTERNAL_URL is unset', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('AUDRIC_INTERNAL_KEY', 'test-key');
    vi.stubEnv('T2000_FIN_CTX_SHARD_COUNT', '2');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 0, skipped: 0, errors: 0, total: 0 }),
    });

    await runFinancialContextSnapshot();

    const urls = mockFetch.mock.calls.map(([url]: [string]) => url as string);
    expect(urls[0]).toContain('https://audric.ai/api/internal/financial-context-snapshot');
  });
});
