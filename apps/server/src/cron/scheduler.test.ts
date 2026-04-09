import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchNotificationUsers, reportNotifications } from './scheduler.js';

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
  it('fetches all eligible users', async () => {
    const mockUsers = [
      {
        userId: 'u1',
        email: 'alice@example.com',
        walletAddress: '0xaaa',
        allowanceId: null,
        timezoneOffset: -480,
        prefs: { hf_alert: true },
      },
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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const users = await fetchNotificationUsers();
    expect(users).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const users = await fetchNotificationUsers();
    expect(users).toEqual([]);
  });
});

describe('reportNotifications', () => {
  it('posts results to audric internal API', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const results = [
      { job: 'hf_alerts', processed: 5, sent: 2, errors: 0 },
    ];

    await reportNotifications(results);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test.audric.ai/api/internal/notification-log');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.results).toEqual(results);
    expect(body.reportedAt).toBeDefined();
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));
    await expect(reportNotifications([])).resolves.toBeUndefined();
  });
});
