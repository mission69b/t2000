export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function on Sui RPC 429 errors with exponential backoff + jitter.
 * Non-429 errors are re-thrown immediately.
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
      if (!msg.includes('429') && !msg.includes('Too Many Requests')) throw err;
      if (attempt === maxRetries) break;
      const delayMs = 3000 * 2 ** attempt + Math.random() * 1000;
      console.warn(`[withRetry] 429 — attempt ${attempt + 1}/${maxRetries}, waiting ${(delayMs / 1000).toFixed(1)}s`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
