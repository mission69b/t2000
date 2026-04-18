import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchNotificationUsers } from './scheduler.js';

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

  it('returns empty array on API failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const users = await fetchNotificationUsers();
    expect(users).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const users = await fetchNotificationUsers();
    expect(users).toEqual([]);
  });

  it('returns empty array when API responds with no users field', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const users = await fetchNotificationUsers();
    expect(users).toEqual([]);
  });
});
