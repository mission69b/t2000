import { Redis } from '@upstash/redis';
import type { DigestStore } from '@suimpp/mpp/server';
import { env } from '@/lib/env';

const DEFAULT_TTL_SECONDS = 86_400; // 24 hours
const PREFIX = 'mpp:digest:';

export class UpstashDigestStore implements DigestStore {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: Redis,
    ttlMs = DEFAULT_TTL_SECONDS * 1000,
  ) {
    this.ttlSeconds = Math.ceil(ttlMs / 1000);
  }

  async has(digest: string): Promise<boolean> {
    const val = await this.redis.get(PREFIX + digest);
    return val !== null;
  }

  async set(digest: string): Promise<void> {
    const result = await this.redis.set(PREFIX + digest, '1', {
      ex: this.ttlSeconds,
      nx: true,
    });
    if (result === null) {
      throw new Error(`Digest already used: ${digest}`);
    }
  }
}

let _store: UpstashDigestStore | undefined;

export function getDigestStore(): UpstashDigestStore {
  if (!_store) {
    const redis = new Redis({
      url: env.KV_REST_API_URL!,
      token: env.KV_REST_API_TOKEN!,
    });
    _store = new UpstashDigestStore(redis);
  }
  return _store;
}

// [S.413 — x402 replay-window fix] x402 payments are chain-valid for the
// whole `ValidDuring` window: [minEpoch, minEpoch+1] ≈ up to ~48h on
// mainnet (24h epochs). Sui treats resubmission of an executed transaction
// idempotently, so if the digest/challenge keys expire BEFORE the window
// closes, a replayed `X-PAYMENT` would re-settle "successfully" and serve
// again on a single payment. 72h > max window + drift. The legacy dialect
// keeps the 24h store — its replay cap is the 5-minute HMAC-bound
// challenge expiry (see `MPP_CHALLENGE_SECRET`), not the TTL.
const X402_TTL_MS = 72 * 60 * 60 * 1000;

let _x402Store: UpstashDigestStore | undefined;

export function getX402DigestStore(): UpstashDigestStore {
  if (!_x402Store) {
    const redis = new Redis({
      url: env.KV_REST_API_URL!,
      token: env.KV_REST_API_TOKEN!,
    });
    _x402Store = new UpstashDigestStore(redis, X402_TTL_MS);
  }
  return _x402Store;
}
