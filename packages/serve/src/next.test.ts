import { describe, expect, it } from 'vitest';
import { asNextRoute } from './next.js';
import { createServe } from './serve.js';
import { InMemoryDigestStore } from './store.js';

const PAY_TO = '0x' + 'ab'.repeat(32);

describe('asNextRoute', () => {
  const serve = createServe({
    payTo: PAY_TO,
    network: 'mainnet',
    store: new InMemoryDigestStore(),
  });
  const route = serve
    .route({ path: 'haiku' })
    .paid('0.01')
    .handler(() => ({ ok: true }));

  it('OPTIONS export IS the POST export — one handler, both methods', () => {
    const exports = asNextRoute(route);
    expect(exports.POST).toBe(route);
    expect(exports.OPTIONS).toBe(route);
  });

  it('the OPTIONS export answers a preflight with CORS headers', async () => {
    const { OPTIONS } = asNextRoute(route);
    const res = await OPTIONS(
      new Request('https://seller.example/haiku', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers')).toContain(
      'X-PAYMENT',
    );
  });
});
