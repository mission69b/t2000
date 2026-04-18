import { Hono } from 'hono';

const charge = new Hono();

// [SIMPLIFICATION DAY 3] Allowance billing removed.
// Audric no longer charges per session against an on-chain allowance.
// The endpoint is preserved so any in-flight Audric clients calling
// `chargeSession()` get a deterministic 410 Gone instead of timing out.
// Day 8: delete this route entirely along with `buildDeductAllowanceTx`
// from the SDK and the server-side admin executor wiring it depended on.
charge.post('/api/internal/charge', (c) => {
  return c.json(
    {
      error: 'gone',
      message:
        'Per-session allowance charging has been removed. Audric is now usage-billed centrally.',
    },
    410,
  );
});

export { charge };
