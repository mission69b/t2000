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
