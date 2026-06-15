/**
 * x402 / MPP gateway smoke tests — real x402 payments against the live
 * `mpp.t2000.ai` gateway on Sui mainnet (gRPC). Captures the full pay matrix
 * that used to live as ad-hoc `node -e` one-liners.
 *
 * Run with:  SMOKE=1 E2E_TEST_PRIVATE_KEY=suiprivkey1... pnpm --filter @t2000/sdk test
 *
 * Requires a funded test wallet holding a little USDC (each paid call settles
 * ~$0.02 USDC, gasless — no SUI needed for the payment itself). The gateway
 * dual-serves, so the SDK always takes the x402 dialect (`dialect: 'x402'`).
 *
 * The OTHER surfaces of the same rail are smoked manually (they need a TTY /
 * a different runtime) — captured here so the whole matrix lives in one place:
 *
 *   # CLI — real payment (installed `t2`, x402 via the SDK):
 *   t2 pay https://mpp.t2000.ai/openai/v1/chat/completions \
 *     --data '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
 *
 *   # CLI — price preview, NO key / NO payment (reads the x402 accepts[] envelope):
 *   t2 pay https://mpp.t2000.ai/openai/v1/chat/completions \
 *     --data '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}' --estimate
 *
 *   # MCP — the t2000_pay tool routes through the same SDK pay() path.
 *
 * Property coverage matrix (the x402 guarantees proven in S.414) — what each
 * is verified BY, so we don't duplicate gateway/protocol tests in the client:
 *
 *   | Property                                   | Verified by                          | Here? |
 *   |--------------------------------------------|--------------------------------------|-------|
 *   | x402 settle on mainnet (digest)            | this pay smoke + gateway e2e (S.414) | YES   |
 *   | on-chain-verifiable (settle digest)        | receipt.reference assert (below)     | YES   |
 *   | offline-signable, no RPC round-trip        | @suimpp/mpp/x402 unit tests          | no*   |
 *   | replay-protected (ValidDuring nonce +      | gateway x402-dialect.ts +            | no    |
 *   |   challenge-once + digest-once)            |   @suimpp/mpp tests                  |       |
 *   | settle-then-serve / no-charge-on-failure   | gateway; AUTOMATED refund = Phase 2  | no**  |
 *
 *   *  the SDK pay() does ONE balance read (address-balance check) then signs
 *      offline; the pure offline-sign property lives in the protocol package.
 *   ** H9 is settle-then-serve + MANUAL refund today (S.412 `refund_due`);
 *      automated refund-on-upstream-failure is Phase 2 item 2.6. An assertion
 *      of "zero charge on failure" would be premature until 2.6 ships.
 */
import { describe, it, expect, beforeAll } from 'vitest';

const SMOKE = !!process.env.SMOKE;
const PRIVATE_KEY = process.env.E2E_TEST_PRIVATE_KEY;

const GATEWAY = 'https://mpp.t2000.ai';
const PAID_ENDPOINT = `${GATEWAY}/openai/v1/chat/completions`;
const OPEN_ENDPOINT = `${GATEWAY}/.well-known/x402`; // discovery manifest — no 402

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let T2000Class: any;

beforeAll(async () => {
  if (!SMOKE) return;
  const sdk = await import('../t2000.js');
  T2000Class = sdk.T2000;
});

describe.skipIf(!SMOKE || !PRIVATE_KEY)('Smoke: x402 pay (real mainnet payment)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let agent: any;
  beforeAll(() => {
    agent = T2000Class.fromPrivateKey(PRIVATE_KEY!);
  });

  it('pays an x402 endpoint via the sign-then-settle dialect', async () => {
    const r = await agent.pay({
      url: PAID_ENDPOINT,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'say hi in 3 words' }] }),
      maxPrice: 0.1,
    });

    expect(r.status).toBe(200);
    expect(r.paid).toBe(true);
    expect(r.dialect).toBe('x402'); // NOT the legacy digest dialect
    expect(r.cost).toBeGreaterThan(0); // the 402 challenge price (~$0.02)
    expect(r.cost).toBeLessThanOrEqual(0.1); // never above the maxPrice ceiling
    expect(typeof r.gasCostSui).toBe('number'); // gasless (0) or a tiny coin→AB migration
    expect(r.receipt?.reference).toBeTruthy(); // the on-chain settle digest
  });

  it('reports not-paid for an open (non-402) endpoint', async () => {
    const r = await agent.pay({ url: OPEN_ENDPOINT, method: 'GET', maxPrice: 0.1 });
    expect(r.paid).toBe(false);
    expect(r.cost).toBeUndefined();
    expect(r.receipt).toBeUndefined();
  });
});

describe.skipIf(!SMOKE)('Smoke: x402 estimate (read-only, no payment, no key)', () => {
  it('reads the x402 accepts[] envelope off a 402 without signing', async () => {
    // Mirrors `t2 pay --estimate`: probe the paid endpoint, parse the x402
    // envelope, never pay. No key needed for the request itself.
    const res = await fetch(PAID_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as {
      accepts?: Array<{ scheme: string; network: string; asset: string; maxAmountRequired: string; payTo: string }>;
    };
    const req = body.accepts?.find((a) => a.scheme === 'exact' && a.network === 'sui:mainnet');
    expect(req).toBeDefined();
    expect(req!.asset).toMatch(/::usdc::USDC$/i);
    expect(BigInt(req!.maxAmountRequired)).toBeGreaterThan(0n);
    expect(req!.payTo).toMatch(/^0x[0-9a-f]+$/i);
  });
});
