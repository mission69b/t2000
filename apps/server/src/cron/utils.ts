export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(msg: string): boolean {
  return msg.includes('429')
    || msg.includes('Too Many Requests')
    || msg.includes('not available for consumption')
    || msg.includes('equivocation')
    || msg.includes('object already locked');
}

/**
 * Global concurrency limiter for Sui RPC calls.
 * Prevents thundering herd when multiple cron jobs run in the same process.
 */
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => { this.active++; resolve(); });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export const rpcSemaphore = new Semaphore(5);

/**
 * Retry a function on Sui RPC 429 errors, stale object / lock errors.
 * The `fn` is re-invoked on each retry so callers can rebuild transactions.
 * Non-retryable errors are re-thrown immediately.
 * Backoff: 5s, 10s, 20s, 40s, 80s (5 retries ≈ 155s total wait)
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await rpcSemaphore.run(fn);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRetryable(msg)) throw err;
      if (attempt === maxRetries) break;
      const baseMs = msg.includes('429') || msg.includes('Too Many Requests') ? 5000 : 3000;
      const delayMs = baseMs * 2 ** attempt + Math.random() * 2000;
      const reason = msg.includes('429') ? '429' : msg.includes('locked') ? 'object-lock' : 'stale-object';
      console.warn(`[withRetry] ${reason} — attempt ${attempt + 1}/${maxRetries}, waiting ${(delayMs / 1000).toFixed(1)}s`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
