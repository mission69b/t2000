export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function on Sui RPC 429 errors with exponential backoff + jitter.
 * Non-429 errors are re-thrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('429') && !msg.includes('Too Many Requests')) throw err;
      if (attempt === maxRetries) break;
      await sleep(2000 * 2 ** attempt + Math.random() * 500);
    }
  }
  throw lastError;
}
