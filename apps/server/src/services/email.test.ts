import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail, sendBatchEmails } from './email.js';

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key-123');
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('sendEmail', () => {
  it('sends a single email via Resend', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-001' }),
    });

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result).toBe('email-001');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({
      to: 'user@example.com',
      subject: 'Test',
    });
    expect(opts.headers.Authorization).toBe('Bearer test-key-123');
  });

  it('returns null on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result).toBeNull();
  });

  it('returns null if RESEND_API_KEY is not set', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('includes tags when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-002' }),
    });

    await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
      tags: [{ name: 'category', value: 'hf_alert' }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tags).toEqual([{ name: 'category', value: 'hf_alert' }]);
  });
});

describe('sendBatchEmails', () => {
  it('sends batch via Resend batch API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'b1' }, { id: 'b2' }] }),
    });

    const result = await sendBatchEmails([
      { to: 'a@example.com', subject: 'A', html: '<p>A</p>' },
      { to: 'b@example.com', subject: 'B', html: '<p>B</p>' },
    ]);

    expect(result).toBe(2);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails/batch');
  });

  it('returns 0 for empty list', async () => {
    const result = await sendBatchEmails([]);
    expect(result).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('chunks messages larger than 100', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: `user${i}@example.com`,
      subject: `Subject ${i}`,
      html: `<p>${i}</p>`,
    }));

    const result = await sendBatchEmails(messages);
    expect(result).toBe(150);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstBatch = JSON.parse(mockFetch.mock.calls[0][1].body);
    const secondBatch = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(firstBatch).toHaveLength(100);
    expect(secondBatch).toHaveLength(50);
  });

  it('handles partial batch failure', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'error' });

    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: `user${i}@example.com`,
      subject: `Subject ${i}`,
      html: `<p>${i}</p>`,
    }));

    const result = await sendBatchEmails(messages);
    expect(result).toBe(100); // first batch succeeded, second failed
  });
});
