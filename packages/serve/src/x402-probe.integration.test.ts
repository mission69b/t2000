import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createX402Requirements, USDC, X402_VERSION } from '@t2000/x402';

// The B1 CI gate (SPEC_T2_X402_MONOREPO): a serve-shaped 402 — the exact
// x402Version + accepts[] envelope respond402 emits, built with the REAL
// @t2000/x402 requirements builder — must probe clean with the REAL
// @t2000/discovery. One implementation on each side; if either half drifts
// (field names, scheme, network prefix, amount units), this test is the
// tripwire, replacing the cross-repo skew class that motivated the absorb.

const PAY_TO =
  '0x7a8e9b2c4d6f1a3b5c7d9e0f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c0d2e4f6a8b';
const CHAIN = '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const resource = `${baseUrl}${req.url}`;
    const requirements = createX402Requirements({
      challengeId: crypto.randomUUID(),
      amount: '0.05',
      currency: USDC,
      recipient: PAY_TO,
      resource,
      network: 'mainnet',
      chain: CHAIN,
      currentEpoch: 100,
    });
    res.writeHead(402, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        x402Version: X402_VERSION,
        error: 'Payment required.',
        accepts: [requirements],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('server did not bind');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
});

describe('serve 402 ↔ discovery probe (integration)', () => {
  it('probes a serve-shaped accepts[] envelope clean', async () => {
    const { probe } = await import('@t2000/discovery');
    const result = await probe(`${baseUrl}/paid/brief`);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(402);
    expect(result.hasSuiPayment).toBe(true);
    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
    expect(result.recipient).toBe(PAY_TO);
    // accepts[] carries raw 6dp units; probe normalizes known USDC back to
    // the decimal amount — the cross-dialect contract that lagged at 0.2.1.
    expect(result.amount).toBe('0.05');
  });
});
