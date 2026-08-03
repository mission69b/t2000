// Digest replay store + settlement report — hoisted OFF the suimpp server
// module (SPEC_T2_X402_MONOREPO §3a lock 2) so this package never touches
// the mppx pay loop. Settle-once enforcement: every settled digest is
// recorded, and a digest that has been seen settles nothing twice.

export interface DigestStore {
  has(digest: string): Promise<boolean>;
  set(digest: string): Promise<void>;
}

/** What a successful settlement reports to the host (ops / activity hooks). */
export interface PaymentReport {
  digest: string;
  sender?: string;
  recipient: string;
  amount: string;
  currency: string;
  network: string;
}

const DEFAULT_TTL_MS = 86_400_000; // 24 hours
const EVICTION_INTERVAL_MS = 3_600_000; // 1 hour

/** Dev/test store — per-process, TTL-evicted. Production sellers supply a
 *  durable DigestStore (Redis, Postgres); replay windows must survive
 *  restarts. */
export class InMemoryDigestStore implements DigestStore {
  private store = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    if (typeof globalThis.setInterval === 'function') {
      const timer = setInterval(() => this.evict(), EVICTION_INTERVAL_MS);
      if (typeof timer === 'object' && 'unref' in timer) timer.unref();
    }
  }

  async has(digest: string): Promise<boolean> {
    const expiresAt = this.store.get(digest);
    if (expiresAt === undefined) return false;
    if (Date.now() > expiresAt) {
      this.store.delete(digest);
      return false;
    }
    return true;
  }

  async set(digest: string): Promise<void> {
    this.store.set(digest, Date.now() + this.ttlMs);
  }

  private evict(): void {
    const now = Date.now();
    for (const [digest, expiresAt] of this.store.entries()) {
      if (now > expiresAt) this.store.delete(digest);
    }
  }
}
