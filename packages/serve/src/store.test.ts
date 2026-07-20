import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstashDigestStore } from './store.js';

function mockUpstash(responses: Array<{ result?: unknown; error?: string; status?: number }>) {
  const calls: string[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    calls.push(String(input));
    const next = responses.shift() ?? { result: null };
    return new Response(JSON.stringify({ result: next.result ?? null, error: next.error }), {
      status: next.status ?? 200,
    });
  });
  return { calls, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UpstashDigestStore', () => {
  const store = () => new UpstashDigestStore({ url: 'https://kv.example/', token: 'tok' });

  it('has() returns false for absent keys, true for present', async () => {
    const { calls } = mockUpstash([{ result: null }, { result: '1' }]);
    expect(await store().has('D1')).toBe(false);
    expect(await store().has('D1')).toBe(true);
    expect(calls[0]).toBe('https://kv.example/GET/serve%3Adigest%3AD1');
  });

  it('set() uses SET NX with the 72h TTL and throws on replay', async () => {
    const { calls } = mockUpstash([{ result: 'OK' }, { result: null }]);
    const s = store();
    await s.set('D1');
    expect(calls[0]).toBe(
      `https://kv.example/SET/serve%3Adigest%3AD1/1/EX/${72 * 60 * 60}/NX`,
    );
    await expect(s.set('D1')).rejects.toThrow(/already used/);
  });

  it('surfaces Upstash transport and API errors', async () => {
    mockUpstash([{ status: 500 }, { error: 'WRONGPASS' }]);
    await expect(store().has('D1')).rejects.toThrow(/500/);
    await expect(store().has('D1')).rejects.toThrow(/WRONGPASS/);
  });
});
