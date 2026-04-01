import { Redis } from '@upstash/redis';
import type { SessionStore, SessionData } from '@t2000/engine';

const DEFAULT_TTL_SEC = 24 * 60 * 60; // 24 hours

export class UpstashSessionStore implements SessionStore {
  private readonly redis: Redis;
  private readonly ttlSec: number;
  private readonly prefix: string;

  constructor(opts?: { redis?: Redis; ttlSec?: number; prefix?: string }) {
    this.redis = opts?.redis ?? Redis.fromEnv();
    this.ttlSec = opts?.ttlSec ?? DEFAULT_TTL_SEC;
    this.prefix = opts?.prefix ?? 'session:';
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const data = await this.redis.get<SessionData>(this.key(sessionId));
    return data ?? null;
  }

  async set(session: SessionData): Promise<void> {
    await this.redis.set(this.key(session.id), session, { ex: this.ttlSec });
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

  async exists(sessionId: string): Promise<boolean> {
    const result = await this.redis.exists(this.key(sessionId));
    return result === 1;
  }

  async listByUser(address: string, limit = 20): Promise<string[]> {
    const indexKey = `user_sessions:${address}`;
    const sessionIds = await this.redis.lrange(indexKey, 0, limit - 1);
    return sessionIds as string[];
  }

  async addToUserIndex(address: string, sessionId: string): Promise<void> {
    const indexKey = `user_sessions:${address}`;
    await this.redis.lpush(indexKey, sessionId);
    await this.redis.ltrim(indexKey, 0, 49);
    await this.redis.expire(indexKey, this.ttlSec);
  }
}
