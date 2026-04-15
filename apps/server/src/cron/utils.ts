export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(msg: string): boolean {
  return msg.includes('429')
    || msg.includes('Too Many Requests')
    || msg.includes('not available for consumption')
    || msg.includes('equivocation');
}

/**
 * Retry a function on Sui RPC 429 errors and stale object version errors.
 * The `fn` is re-invoked on each retry so callers can rebuild transactions.
 * Non-retryable errors are re-thrown immediately.
 * Backoff: 3s, 6s, 12s, 24s, 48s (5 retries ≈ 93s total wait)
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRetryable(msg)) throw err;
      if (attempt === maxRetries) break;
      const baseMs = msg.includes('429') ? 3000 : 1500;
      const delayMs = baseMs * 2 ** attempt + Math.random() * 1000;
      const reason = msg.includes('429') ? '429' : 'stale-object';
      console.warn(`[withRetry] ${reason} — attempt ${attempt + 1}/${maxRetries}, waiting ${(delayMs / 1000).toFixed(1)}s`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
