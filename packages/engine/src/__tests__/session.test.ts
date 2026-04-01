import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySessionStore } from '../session.js';
import type { SessionData } from '../session.js';

function makeSession(id: string, overrides?: Partial<SessionData>): SessionData {
  return {
    id,
    messages: [],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('MemorySessionStore', () => {
  let store: MemorySessionStore;

  beforeEach(() => {
    store = new MemorySessionStore();
  });

  it('stores and retrieves sessions', async () => {
    const session = makeSession('s1');
    await store.set(session);

    const retrieved = await store.get('s1');
    expect(retrieved).toEqual(session);
  });

  it('returns null for missing sessions', async () => {
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  it('returns deep copies (mutations do not affect store)', async () => {
    const session = makeSession('s1', {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
    await store.set(session);

    const retrieved = await store.get('s1');
    retrieved!.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Hi' }] });

    const retrievedAgain = await store.get('s1');
    expect(retrievedAgain!.messages).toHaveLength(1);
  });

  it('deletes sessions', async () => {
    await store.set(makeSession('s1'));
    await store.delete('s1');
    expect(await store.exists('s1')).toBe(false);
  });

  it('checks existence', async () => {
    expect(await store.exists('s1')).toBe(false);
    await store.set(makeSession('s1'));
    expect(await store.exists('s1')).toBe(true);
  });

  it('expires sessions after TTL', async () => {
    const store = new MemorySessionStore({ ttlMs: 50 });
    await store.set(makeSession('s1'));

    expect(await store.get('s1')).not.toBeNull();

    await new Promise((r) => setTimeout(r, 60));

    expect(await store.get('s1')).toBeNull();
    expect(await store.exists('s1')).toBe(false);
  });

  it('overwrites existing sessions', async () => {
    await store.set(makeSession('s1', { createdAt: 100 }));
    await store.set(makeSession('s1', { createdAt: 200 }));

    const retrieved = await store.get('s1');
    expect(retrieved!.createdAt).toBe(200);
  });

  it('tracks size correctly', async () => {
    expect(store.size).toBe(0);
    await store.set(makeSession('s1'));
    await store.set(makeSession('s2'));
    expect(store.size).toBe(2);
    await store.delete('s1');
    expect(store.size).toBe(1);
  });
});
