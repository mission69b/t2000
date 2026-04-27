import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchNotificationUsers } from './scheduler.js';

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubEnv('AUDRIC_INTERNAL_URL', 'https://test.audric.ai');
  vi.stubEnv('AUDRIC_INTERNAL_KEY', 'test-internal-key');
  globalThis.fetch = mockFetch;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('fetchNotificationUsers', () => {
  it('fetches eligible users with the slimmed payload shape', async () => {
    const mockUsers = [
      { userId: 'u1', walletAddress: '0xaaa' },
      { userId: 'u2', walletAddress: '0xbbb' },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ users: mockUsers }),
    });

    const users = await fetchNotificationUsers();
    expect(users).toEqual(mockUsers);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test.audric.ai/api/internal/notification-users');
    expect(opts.headers['x-internal-key']).toBe('test-internal-key');
  });

  it('returns empty array when API responds 200 with no users field', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const users = await fetchNotificationUsers();
    expect(users).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries transient 5xx and succeeds on a later attempt', async () => {
    const mockUsers = [{ userId: 'u1', walletAddress: '0xaaa' }];

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: mockUsers }) });

    const users = await fetchNotificationUsers();
    expect(users).toEqual(mockUsers);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries on persistent 5xx', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchNotificationUsers()).rejects.toThrow(
      /notification-users fetch failed after 3 attempts: HTTP 500/,
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries on persistent network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(fetchNotificationUsers()).rejects.toThrow(
      /notification-users fetch failed after 3 attempts: ECONNREFUSED/,
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('recovers from a single transient network blip on retry', async () => {
    const mockUsers = [{ userId: 'u1', walletAddress: '0xaaa' }];

    mockFetch
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: mockUsers }) });

    const users = await fetchNotificationUsers();
    expect(users).toEqual(mockUsers);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
