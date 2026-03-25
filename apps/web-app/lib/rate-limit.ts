const windows = new Map<string, number[]>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs * 2;
  for (const [key, timestamps] of windows) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) windows.delete(key);
    else windows.set(key, filtered);
  }
}

/**
 * Sliding-window in-memory rate limiter.
 * Returns { success, remaining, retryAfterMs } for a given key.
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { success: boolean; remaining: number; retryAfterMs?: number } {
  cleanup(windowMs);
  const now = Date.now();
  const cutoff = now - windowMs;

  const timestamps = windows.get(key) ?? [];
  const recent = timestamps.filter((t) => t > cutoff);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    return {
      success: false,
      remaining: 0,
      retryAfterMs: oldest + windowMs - now,
    };
  }

  recent.push(now);
  windows.set(key, recent);

  return {
    success: true,
    remaining: maxRequests - recent.length,
  };
}

export function rateLimitResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again shortly.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}
