import type { Message } from './types.js';
import type { CostSnapshot } from './cost.js';

// ---------------------------------------------------------------------------
// Session data
// ---------------------------------------------------------------------------

export interface SessionData {
  id: string;
  messages: Message[];
  usage: CostSnapshot;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Session store interface — implement for different backends
// ---------------------------------------------------------------------------

export interface SessionStore {
  /** Load a session by ID. Returns null if not found or expired. */
  get(sessionId: string): Promise<SessionData | null>;

  /** Save or update a session. */
  set(session: SessionData): Promise<void>;

  /** Delete a session. */
  delete(sessionId: string): Promise<void>;

  /** Check if a session exists. */
  exists(sessionId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// MemorySessionStore — for development and testing
// ---------------------------------------------------------------------------

export class MemorySessionStore implements SessionStore {
  private store = new Map<string, { data: SessionData; expiresAt: number }>();
  private readonly ttlMs: number;

  constructor(opts?: { ttlMs?: number }) {
    this.ttlMs = opts?.ttlMs ?? 24 * 60 * 60 * 1000; // 24h default
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const entry = this.store.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionId);
      return null;
    }
    return structuredClone(entry.data);
  }

  async set(session: SessionData): Promise<void> {
    this.store.set(session.id, {
      data: structuredClone(session),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    const entry = this.store.get(sessionId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionId);
      return false;
    }
    return true;
  }

  /** For testing: number of active (non-expired) sessions. */
  get size(): number {
    this.evictExpired();
    return this.store.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(id);
    }
  }
}
