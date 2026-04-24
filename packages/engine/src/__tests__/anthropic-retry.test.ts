import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { _internal } from '../providers/anthropic.js';

const { isRetriableError, friendlyErrorMessage, computeBackoffMs } = _internal;

// The SDK's `Headers` type is its own class (not the global Fetch Headers).
// In tests we don't care about the headers value — only the status — so we
// pass an empty headers-like through `any` to keep the test ergonomics clean.
function apiError(status: number, body: { type: string; message: string }) {
  return new Anthropic.APIError(
    status,
    body,
    body.message,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any,
  );
}

describe('AnthropicProvider retry classification', () => {
  describe('isRetriableError', () => {
    it('retries Anthropic 529 overloaded errors', () => {
      expect(
        isRetriableError(
          apiError(529, { type: 'overloaded_error', message: 'Overloaded' }),
        ),
      ).toBe(true);
    });

    it('retries Anthropic 429 rate-limit errors', () => {
      expect(
        isRetriableError(
          apiError(429, { type: 'rate_limit_error', message: 'Rate limited' }),
        ),
      ).toBe(true);
    });

    it('retries 5xx server errors', () => {
      for (const status of [502, 503, 504]) {
        expect(
          isRetriableError(
            apiError(status, { type: 'api_error', message: 'transient' }),
          ),
        ).toBe(true);
      }
    });

    it('retries when error message contains overloaded JSON shape', () => {
      // This is what the Anthropic streaming SDK actually surfaces in
      // production: an Error whose .message is the raw SSE error payload.
      const err = new Error(
        '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      );
      expect(isRetriableError(err)).toBe(true);
    });

    it('retries common transient network errors', () => {
      expect(isRetriableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetriableError(new Error('socket hang up'))).toBe(true);
      expect(isRetriableError(new Error('fetch failed'))).toBe(true);
      expect(isRetriableError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('does NOT retry 4xx client errors (except 408/429)', () => {
      for (const status of [400, 401, 403, 404]) {
        expect(
          isRetriableError(
            apiError(status, {
              type: 'invalid_request_error',
              message: 'bad request',
            }),
          ),
        ).toBe(false);
      }
    });

    it('does NOT retry plain unknown errors', () => {
      expect(isRetriableError(new Error('something exploded'))).toBe(false);
      expect(isRetriableError(null)).toBe(false);
      expect(isRetriableError(undefined)).toBe(false);
    });
  });

  describe('friendlyErrorMessage', () => {
    it('produces a clean string for overloaded errors — never raw JSON', () => {
      const err = new Error(
        '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      );
      const msg = friendlyErrorMessage(err);
      expect(msg).not.toContain('{');
      expect(msg).not.toContain('overloaded_error');
      expect(msg.toLowerCase()).toContain('over capacity');
    });

    it('produces a clean string for rate-limit errors', () => {
      const err = apiError(429, {
        type: 'rate_limit_error',
        message: 'Rate limited',
      });
      expect(friendlyErrorMessage(err).toLowerCase()).toContain(
        'too many requests',
      );
    });

    it('produces a clean string for network errors', () => {
      const msg = friendlyErrorMessage(new Error('ECONNRESET'));
      expect(msg.toLowerCase()).toContain("couldn't reach anthropic");
    });

    it('produces a clean string for auth errors', () => {
      const err = apiError(401, {
        type: 'authentication_error',
        message: 'bad key',
      });
      expect(friendlyErrorMessage(err).toLowerCase()).toContain(
        'authentication failed',
      );
    });

    it('falls back to a generic message for unknown errors', () => {
      expect(friendlyErrorMessage(new Error('???'))).toBe(
        'Something went wrong. Please try again.',
      );
    });
  });

  describe('computeBackoffMs', () => {
    it('grows exponentially with jitter', () => {
      // attempt=1 → 1000-1250ms, attempt=2 → 2000-2250ms, attempt=3 → 4000-4250ms
      const a1 = computeBackoffMs(1);
      const a2 = computeBackoffMs(2);
      const a3 = computeBackoffMs(3);
      expect(a1).toBeGreaterThanOrEqual(1000);
      expect(a1).toBeLessThan(1300);
      expect(a2).toBeGreaterThanOrEqual(2000);
      expect(a2).toBeLessThan(2300);
      expect(a3).toBeGreaterThanOrEqual(4000);
      expect(a3).toBeLessThan(4300);
    });

    it('caps at the configured maximum', () => {
      // attempt=10 would be 1000 * 2^9 = 512000ms — must be clamped.
      const big = computeBackoffMs(10);
      expect(big).toBeLessThan(8500);
    });
  });
});
