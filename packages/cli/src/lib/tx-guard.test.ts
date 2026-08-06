import { Transaction } from '@mysten/sui/transactions';
import {
  MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
  MAINNET_A2A_ESCROW_PACKAGE_ID,
} from '@t2000/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSponsoredTx } from './agent-register.js';
import {
  assertSigningHostAllowed,
  assertTxMatchesIntent,
  IntentMismatchError,
  isDefaultApiHost,
  setAllowUntrustedApi,
  UntrustedHostError,
} from './tx-guard.js';

// The wallet must never produce a signature over bytes it did not verify.
// Every test here is really the same assertion: on any doubt, `signTransaction`
// is NOT called.

const EVIL_PACKAGE = `0x${'e'.repeat(64)}`;

async function buildTxB64(target: string): Promise<string> {
  const tx = new Transaction();
  tx.setSender(`0x${'1'.repeat(64)}`);
  tx.setGasPrice(1000);
  tx.setGasBudget(10_000_000);
  tx.setGasPayment([
    {
      objectId: `0x${'2'.repeat(64)}`,
      version: '1',
      digest: '11111111111111111111111111111111',
    },
  ]);
  tx.moveCall({ target, arguments: [] });
  return Buffer.from(await tx.build()).toString('base64');
}

beforeEach(() => setAllowUntrustedApi(false));
afterEach(() => {
  setAllowUntrustedApi(false);
  vi.unstubAllGlobals();
});

describe('A — API host pin', () => {
  it('accepts the canonical host', () => {
    expect(isDefaultApiHost('https://api.t2000.ai/v1')).toBe(true);
    expect(() =>
      assertSigningHostAllowed('https://api.t2000.ai/v1/job/prepare', false),
    ).not.toThrow();
  });

  it('refuses a hijacked T2000_API_URL without the flag', () => {
    expect(() =>
      assertSigningHostAllowed('https://evil.example/v1/job/prepare', false),
    ).toThrow(UntrustedHostError);
  });

  it('names the host and the escape hatch, and says to suspect an attack', () => {
    try {
      assertSigningHostAllowed('https://evil.example/v1', false);
      expect.unreachable('should have refused');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('evil.example');
      expect(msg).toContain('--allow-untrusted-api');
      expect(msg).toContain('treat this as an attack');
    }
  });

  it('allows a non-default host once the operator opts in', () => {
    expect(() =>
      assertSigningHostAllowed('http://localhost:3000/v1', true),
    ).not.toThrow();
  });
});

describe('A — the pin fires before the command body, not mid-flight', () => {
  // Regression: the first cut only pinned inside runSponsoredTx, so `job hire`
  // resolved an agent ref and uploaded a spec THROUGH the hijacked host before
  // refusing to sign. Verified end-to-end against the built binary; this pins
  // the ordering contract the fix relies on.
  it('an injected T2000_API_URL is refusable with nothing but the env var', () => {
    vi.stubEnv('T2000_API_URL', 'https://evil.example/v1');
    expect(() =>
      assertSigningHostAllowed(process.env.T2000_API_URL ?? '', false),
    ).toThrow(UntrustedHostError);
    vi.unstubAllEnvs();
  });
});

describe('B — intent assert', () => {
  it('signs a create that really is escrow::create', async () => {
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
    );
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).not.toThrow();
  });

  it('refuses a call into a package we do not publish', async () => {
    const b64 = await buildTxB64(`${EVIL_PACKAGE}::escrow::create`);
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      IntentMismatchError,
    );
  });

  it('is NOT spoofable by overriding A2A_ESCROW_PACKAGE_ID', async () => {
    // The attacker's whole play: supply the transaction AND the yardstick.
    // The allowlist is built from MAINNET literals, so this changes nothing.
    vi.stubEnv('A2A_ESCROW_PACKAGE_ID', EVIL_PACKAGE);
    const b64 = await buildTxB64(`${EVIL_PACKAGE}::escrow::create`);
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      IntentMismatchError,
    );
    vi.unstubAllEnvs();
  });

  it('refuses a function the verb never calls (deliver bytes under a create intent)', async () => {
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::release`,
    );
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      /should call escrow::create/,
    );
  });

  it('refuses a module swap', async () => {
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_PACKAGE_ID}::opening::claim`,
    );
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      IntentMismatchError,
    );
  });

  it('refuses the right package with the wrong verb (package is pinned per action)', async () => {
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::claim`,
    );
    // A real t2000 package, a real function — but not what `create` calls.
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      /targets package/,
    );
  });

  it('accepts the open-board verbs against the opening package', async () => {
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::claim`,
    );
    expect(() =>
      assertTxMatchesIntent(b64, { action: 'open-claim' }),
    ).not.toThrow();
  });

  it('fails closed on an unknown verb', () => {
    expect(() => assertTxMatchesIntent('', { action: 'drain' })).toThrow(
      /not a verb this wallet knows how to verify/,
    );
  });

  it('fails closed on undecodable bytes', () => {
    expect(() =>
      assertTxMatchesIntent('bm90LWEtdHJhbnNhY3Rpb24=', { action: 'create' }),
    ).toThrow(/could not decode/);
  });
});

// S.930.1 — the first map was transcribed from the API's action strings
// instead of the SDK builders, so it named two functions that do not exist on
// mainnet and refused two real happy paths. These cases pin the map to the
// builders; if a Move upgrade renames a target, they fail here rather than in
// someone's terminal.
describe('B — the map matches the SDK builders, verb for verb', () => {
  const REAL_TARGETS: [string, string][] = [
    ['create', `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`],
    ['deliver', `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::deliver`],
    ['release', `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::release`],
    ['reject', `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::reject`],
    ['refund', `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::refund`],
    // buildDeclineJobTx: OPENING package, `escrow` module — looks like a typo,
    // isn't. `decline` shipped in the v3 upgrade.
    ['decline', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::escrow::decline`],
    [
      'open-create',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::create_open`,
    ],
    ['open-claim', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::claim`],
    [
      'open-cancel',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::cancel_open`,
    ],
    [
      'open-refund',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::refund_unclaimed`,
    ],
  ];

  for (const [action, target] of REAL_TARGETS) {
    it(`signs ${action} → ${target.split('::').slice(1).join('::')}`, async () => {
      const b64 = await buildTxB64(target);
      expect(() => assertTxMatchesIntent(b64, { action })).not.toThrow();
    });
  }

  // The exact names the broken map expected. Neither exists on mainnet.
  const PHANTOMS: [string, string][] = [
    [
      'open-cancel',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::cancel`,
    ],
    [
      'decline',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::decline`,
    ],
    [
      'open-create',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::create`,
    ],
    [
      'open-refund',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::refund`,
    ],
  ];

  for (const [action, target] of PHANTOMS) {
    it(`refuses the phantom ${target.split('::').slice(1).join('::')} under ${action}`, async () => {
      const b64 = await buildTxB64(target);
      expect(() => assertTxMatchesIntent(b64, { action })).toThrow(
        IntentMismatchError,
      );
    });
  }
});

describe('the funnel never signs what it refused', () => {
  function mockPrepare(txBytes: string) {
    return vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes('prepare')
          ? { nonce: 'n1', txBytes }
          : { digest: '0xdead' },
    }));
  }

  it('does not call signTransaction when the package is wrong', async () => {
    const b64 = await buildTxB64(`${EVIL_PACKAGE}::escrow::create`);
    vi.stubGlobal('fetch', mockPrepare(b64));
    const signTransaction = vi.fn();

    await expect(
      runSponsoredTx({
        keypair: { signTransaction },
        actor: `0x${'1'.repeat(64)}`,
        prepareUrl: 'https://api.t2000.ai/v1/job/prepare',
        prepareBody: {},
        submitUrl: 'https://api.t2000.ai/v1/job/submit',
        intent: { action: 'create' },
      }),
    ).rejects.toThrow(IntentMismatchError);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('refuses an evil host BEFORE the prepare request is even made', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const signTransaction = vi.fn();

    await expect(
      runSponsoredTx({
        keypair: { signTransaction },
        actor: `0x${'1'.repeat(64)}`,
        prepareUrl: 'https://evil.example/v1/job/prepare',
        prepareBody: {},
        submitUrl: 'https://evil.example/v1/job/submit',
        intent: { action: 'create' },
      }),
    ).rejects.toThrow(UntrustedHostError);
    // The wallet address never left the machine.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('signs the happy path', async () => {
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
    );
    vi.stubGlobal('fetch', mockPrepare(b64));
    const signTransaction = vi.fn(async () => ({ signature: 'sig' }));

    await expect(
      runSponsoredTx({
        keypair: { signTransaction },
        actor: `0x${'1'.repeat(64)}`,
        prepareUrl: 'https://api.t2000.ai/v1/job/prepare',
        prepareBody: {},
        submitUrl: 'https://api.t2000.ai/v1/job/submit',
        intent: { action: 'create', amountUsdc: 5 },
      }),
    ).resolves.toEqual({ digest: '0xdead' });
    expect(signTransaction).toHaveBeenCalledTimes(1);
  });
});
