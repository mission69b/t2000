import { Transaction } from '@mysten/sui/transactions';
import { MAINNET_AGENT_ID_PACKAGE_ID } from '@t2000/id';
import {
  MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
  MAINNET_A2A_ESCROW_PACKAGE_ID,
} from '@t2000/sdk';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const SENDER = `0x${'1'.repeat(64)}`;

function baseTx(): Transaction {
  const tx = new Transaction();
  tx.setSender(SENDER);
  tx.setGasPrice(1000);
  tx.setGasBudget(10_000_000);
  tx.setGasPayment([
    {
      objectId: `0x${'2'.repeat(64)}`,
      version: '1',
      digest: '11111111111111111111111111111111',
    },
  ]);
  return tx;
}

async function buildTxB64(target: string): Promise<string> {
  const tx = baseTx();
  tx.moveCall({ target, arguments: [] });
  return Buffer.from(await tx.build()).toString('base64');
}

/** Multi-call fixture — same offline build as `buildTxB64`, caller adds the
 *  commands. Mirrors the shape `coinWithBalance` resolves to on a real
 *  address-balance-funded create (S.980). */
async function buildMultiTxB64(
  add: (tx: Transaction) => void,
): Promise<string> {
  const tx = baseTx();
  add(tx);
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

  it('refuses the right package with the wrong verb (module is pinned per action)', async () => {
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::claim`,
    );
    // A real t2000 package, a real function — but not what `create` calls.
    // Since S.981 the latest id is in create's package FAMILY, so the refusal
    // lands on the module pin instead of the package pin — still a refusal.
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      /should call escrow/,
    );
  });

  // S.981: the S.981+ SDK emits escrow verbs at the LATEST package id (the
  // version-gated path); the pre-S.981 server SDK emits the original. Both
  // are mainnet publishes of OUR package — the guard accepts the family, and
  // version safety is the chain's job (stale id → EWrongVersion abort).
  it('signs escrow verbs at either family id (original and latest)', async () => {
    for (const pkg of [
      MAINNET_A2A_ESCROW_PACKAGE_ID,
      MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID,
    ]) {
      const b64 = await buildTxB64(`${pkg}::escrow::create`);
      expect(() =>
        assertTxMatchesIntent(b64, { action: 'create' }),
      ).not.toThrow();
    }
  });

  it('the family does NOT extend to opening verbs at the original id', async () => {
    // opening never existed in the original package — a tx claiming it does
    // is not ours.
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_PACKAGE_ID}::opening::claim_v2`,
    );
    expect(() => assertTxMatchesIntent(b64, { action: 'open-claim' })).toThrow(
      /targets package/,
    );
  });

  it('accepts the open-board verbs against the opening package', async () => {
    const b64 = await buildTxB64(
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::claim_v2`,
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
    // S.1192: release settles through reputation::release_v2 (active
    // counter rides the money); create_empty_score is its precursor too.
    ['release', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::release_v2`],
    [
      'release',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::create_empty_score`,
    ],
    // S.1063: reject/refund settle through reputation (outcome counters);
    // create_empty_score is the allowlisted precursor on both actions.
    ['reject', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::reject_v2`],
    [
      'reject',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::reject_v2_agent_buyer`,
    ],
    [
      'reject',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::create_empty_score`,
    ],
    ['refund', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::refund_v2`],
    [
      'refund',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::create_empty_score`,
    ],
    // buildDeclineJobTx: OPENING package, `escrow` module — looks like a typo,
    // isn't. `decline` shipped in the v3 upgrade.
    ['decline', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::escrow::decline`],
    [
      'open-create',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::create_open_v2`,
    ],
    ['open-claim', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::claim_v2`],
    // S.1192: Proven openings claim via claim_proven_v2; the scoreless
    // claimer's precursor rides the same action cross-module. Buyer review
    // stars land on-chain via the reputation module (both entries — the
    // first review a seller ever gets lazily creates their AgentScore).
    [
      'open-claim',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::claim_proven_v2`,
    ],
    [
      'open-claim',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::create_empty_score`,
    ],
    [
      'job-review',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::submit_review`,
    ],
    [
      'job-review',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::submit_first_review`,
    ],
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
    // S.1054 phantoms: a review can never ride the escrow module, and a
    // plain claim action must not smuggle a different module's function.
    [
      'job-review',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::escrow::submit_review`,
    ],
    [
      'job-review',
      `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::reputation::create_score_board`,
    ],
    // S.1063 phantoms: the deprecated escrow settle doors must be refused
    // under their old actions (live path is reputation::*_v2).
    ['reject', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::escrow::reject`],
    ['refund', `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::escrow::refund`],
    ['reject', `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::reject`],
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

// S.980 — the S.930 check was written against pure single-MoveCall fixtures,
// but a real funded create sources its USDC through `coinWithBalance`
// (packages/sdk/src/wallet/coinSelection.ts), which prepends/appends `0x2`
// framework calls: redeem_funds from the sender's address balance before the
// escrow call, send_funds returning the remainder to the sender after it. The
// old "every call === expected" loop refused every such PTB — any wallet whose
// USDC sat in address balance (i.e. received gaslessly) could not hire at all.
describe('B — framework coin prelude around a funded create (S.980)', () => {
  it('signs the founder-bug shape: redeem_funds then escrow::create', async () => {
    const b64 = await buildMultiTxB64((tx) => {
      tx.moveCall({ target: '0x2::coin::redeem_funds', arguments: [] });
      tx.moveCall({
        target: `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
        arguments: [],
      });
    });
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).not.toThrow();
  });

  it('signs the full resolver shape: redeem_funds, create, send_funds(remainder → sender)', async () => {
    const b64 = await buildMultiTxB64((tx) => {
      const [coin] = tx.moveCall({
        target: '0x2::coin::redeem_funds',
        arguments: [],
      });
      tx.moveCall({
        target: `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
        arguments: [],
      });
      tx.moveCall({
        target: '0x2::coin::send_funds',
        arguments: [coin, tx.pure.address(SENDER)],
      });
    });
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).not.toThrow();
  });

  it('signs open-create with the same prelude (opening funds from AB too)', async () => {
    const b64 = await buildMultiTxB64((tx) => {
      tx.moveCall({ target: '0x2::coin::redeem_funds', arguments: [] });
      tx.moveCall({
        target: `${MAINNET_A2A_ESCROW_OPENING_PACKAGE_ID}::opening::create_open_v2`,
        arguments: [],
      });
    });
    expect(() =>
      assertTxMatchesIntent(b64, { action: 'open-create' }),
    ).not.toThrow();
  });

  it('refuses a prelude-only PTB that never calls the escrow', async () => {
    // redeem_funds + send_funds with no create is a signature over nothing
    // the user asked for.
    const b64 = await buildMultiTxB64((tx) => {
      tx.moveCall({ target: '0x2::coin::redeem_funds', arguments: [] });
    });
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      /never does/,
    );
  });

  it('refuses create followed by a call into an evil package', async () => {
    const b64 = await buildMultiTxB64((tx) => {
      tx.moveCall({
        target: `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
        arguments: [],
      });
      tx.moveCall({ target: `${EVIL_PACKAGE}::escrow::create`, arguments: [] });
    });
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      /targets package/,
    );
  });

  it('refuses send_funds to anyone but the sender — that is a drain, not a remainder', async () => {
    const thirdParty = `0x${'d'.repeat(64)}`;
    const b64 = await buildMultiTxB64((tx) => {
      const [coin] = tx.moveCall({
        target: '0x2::coin::redeem_funds',
        arguments: [],
      });
      tx.moveCall({
        target: `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
        arguments: [],
      });
      tx.moveCall({
        target: '0x2::coin::send_funds',
        arguments: [coin, tx.pure.address(thirdParty)],
      });
    });
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      IntentMismatchError,
    );
  });

  it('refuses a 0x2 call outside the allowlist (framework != carte blanche)', async () => {
    const b64 = await buildMultiTxB64((tx) => {
      tx.moveCall({
        target: `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
        arguments: [],
      });
      tx.moveCall({
        target: '0x2::transfer::public_transfer',
        arguments: [],
      });
    });
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).toThrow(
      IntentMismatchError,
    );
  });

  it('accepts the balance-module prelude variants the resolver can emit', async () => {
    const b64 = await buildMultiTxB64((tx) => {
      tx.moveCall({ target: '0x2::balance::redeem_funds', arguments: [] });
      tx.moveCall({ target: '0x2::coin::into_balance', arguments: [] });
      tx.moveCall({
        target: `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
        arguments: [],
      });
      tx.moveCall({ target: '0x2::coin::destroy_zero', arguments: [] });
    });
    expect(() => assertTxMatchesIntent(b64, { action: 'create' })).not.toThrow();
  });
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

// ── S.1049 — Agent ID verbs join the Move-target allowlist ─────────────────
// `register` used to be a HOST_PINNED_ONLY carve-out that returned before
// any package/module/function check — the wallet signed host-prepared
// registry bytes blind. Now register/update/set-active verify against the
// MAINNET agent_id literal, and the carve-out set is gone entirely.

describe('B — Agent ID registry verbs (S.1049)', () => {
  const REGISTRY = async (fn: string) =>
    buildTxB64(`${MAINNET_AGENT_ID_PACKAGE_ID}::registry::${fn}`);

  it('register allows the mainnet registry::register', async () => {
    expect(() =>
      assertTxMatchesIntent(awaited.register, { action: 'register' }),
    ).not.toThrow();
  });

  it('update allows registry::update; set-active allows registry::set_active', async () => {
    expect(() =>
      assertTxMatchesIntent(awaited.update, { action: 'update' }),
    ).not.toThrow();
    expect(() =>
      assertTxMatchesIntent(awaited.setActive, { action: 'set-active' }),
    ).not.toThrow();
  });

  it('register refuses the wrong function, module, and package', async () => {
    expect(() =>
      assertTxMatchesIntent(awaited.setActive, { action: 'register' }),
    ).toThrow(IntentMismatchError);
    const escrowCreate = await buildTxB64(
      `${MAINNET_A2A_ESCROW_PACKAGE_ID}::escrow::create`,
    );
    expect(() =>
      assertTxMatchesIntent(escrowCreate, { action: 'register' }),
    ).toThrow(IntentMismatchError);
    const evil = await buildTxB64(`${EVIL_PACKAGE}::registry::register`);
    expect(() =>
      assertTxMatchesIntent(evil, { action: 'register' }),
    ).toThrow(IntentMismatchError);
  });

  it('a poisoned AGENT_ID_PACKAGE_ID env cannot widen the allowlist', async () => {
    // The guard pins the MAINNET literal at import time; the env-aware
    // builder constant is deliberately not consulted. Re-evaluate both
    // modules under a poisoned env and prove the fresh guard still refuses
    // the poisoned package and still accepts mainnet.
    vi.resetModules();
    process.env.AGENT_ID_PACKAGE_ID = EVIL_PACKAGE;
    try {
      const freshGuard = await import('./tx-guard.js');
      const evil = await buildTxB64(`${EVIL_PACKAGE}::registry::register`);
      expect(() =>
        freshGuard.assertTxMatchesIntent(evil, { action: 'register' }),
      ).toThrow(freshGuard.IntentMismatchError);
      expect(() =>
        freshGuard.assertTxMatchesIntent(awaited.register, {
          action: 'register',
        }),
      ).not.toThrow();
    } finally {
      delete process.env.AGENT_ID_PACKAGE_ID;
      vi.resetModules();
    }
  });

  it('link / confirm are unknown verbs now — refused, not silently host-pinned', async () => {
    for (const action of ['link', 'confirm']) {
      expect(() =>
        assertTxMatchesIntent(awaited.register, { action }),
      ).toThrow(/not a verb this wallet knows how to verify/);
    }
  });

  // Built once — Transaction.build() is async and `it` bodies above want
  // sync assertion shapes for the poisoned-env re-import.
  const awaited: { register: string; update: string; setActive: string } = {
    register: '',
    update: '',
    setActive: '',
  };
  beforeAll(async () => {
    awaited.register = await REGISTRY('register');
    awaited.update = await REGISTRY('update');
    awaited.setActive = await REGISTRY('set_active');
  });
});
