import { T2000Error } from '../errors.js';

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

const RETRYABLE_PATTERNS = [
  'PROTOCOL_UNAVAILABLE',
  'GAS_STATION_UNAVAILABLE',
  'RPC_UNREACHABLE',
  'SPONSOR_UNAVAILABLE',
  'fetch failed',
  'network error',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'socket hang up',
  'Too Many Requests',
  '429',
  '503',
  '502',
];

function isRetryableError(error: unknown): boolean {
  if (error instanceof T2000Error) return error.retryable;

  const msg = error instanceof Error ? error.message : String(error);
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 2000, maxDelayMs = 30_000, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) throw error;
      if (attempt === maxRetries) break;

      const jitter = Math.random() * 500;
      const delay = Math.min(initialDelayMs * 2 ** attempt + jitter, maxDelayMs);
      onRetry?.(attempt + 1, error);
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
