import { describe, expect, it } from 'vitest';
import {
  AGENT_ID_PACKAGE_ID,
  buildRegisterTx,
  buildSetActiveTx,
  buildUpdateTx,
} from './index.js';

const cmds = (tx: ReturnType<typeof buildRegisterTx>) =>
  JSON.stringify(tx.getData().commands);

describe('@t2000/id builders', () => {
  it('register → one MoveCall to agent_id::registry::register', () => {
    const j = cmds(
      buildRegisterTx({ mcpEndpoint: 'https://bot.example', paymentMethods: ['x402'] })
    );
    expect(j).toContain('register');
    expect(j).toContain(AGENT_ID_PACKAGE_ID);
  });

  it('update targets update', () => {
    expect(cmds(buildUpdateTx({ did: 'did:key:z6Mk' }))).toContain('update');
  });

  it('set_active targets set_active', () => {
    expect(cmds(buildSetActiveTx('0x3', false))).toContain('set_active');
  });

  it('register accepts empty registration (all-none)', () => {
    expect(() => buildRegisterTx()).not.toThrow();
  });

  // Ownership builders left the package in S.1032 — the registry mutators
  // always abort since v2, so there is nothing to build. This pin keeps the
  // surface from quietly returning.
  it('exports no ownership builders (S.1032)', async () => {
    const mod = await import('./index.js');
    expect(Object.keys(mod).filter((k) => /[Oo]wner/.test(k))).toEqual([]);
  });
});

// S.1049 — MAINNET trust anchors: literals, never env-influenced. The
// builder ids may follow AGENT_ID_PACKAGE_ID env for testnet/dev; the
// MAINNET_* pair must not move, because signature-time verification (the
// CLI intent guard) checks prepared bytes against THEM.
describe('MAINNET trust anchors (S.1049)', () => {
  it('are the pinned mainnet literals', async () => {
    const mod = await import('./index.js');
    expect(mod.MAINNET_AGENT_ID_PACKAGE_ID).toBe(
      '0xe94a8b8f14104b75ee4c7e359289da78698fbfffdd0e5e3e9cb7d250887df7a7',
    );
    expect(mod.MAINNET_AGENT_ID_REGISTRY_ID).toBe(
      '0xf41683aa9f4c121f34e4082c35180b0efdbd6d5293e3c88b1bcfa45ddf5c4119',
    );
  });

  it('a poisoned env moves the BUILDER id, never the MAINNET literal', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    process.env.AGENT_ID_PACKAGE_ID = `0x${'e'.repeat(64)}`;
    try {
      const fresh = await import('./index.js');
      expect(fresh.AGENT_ID_PACKAGE_ID).toBe(`0x${'e'.repeat(64)}`);
      expect(fresh.MAINNET_AGENT_ID_PACKAGE_ID).toBe(
        '0xe94a8b8f14104b75ee4c7e359289da78698fbfffdd0e5e3e9cb7d250887df7a7',
      );
    } finally {
      delete process.env.AGENT_ID_PACKAGE_ID;
      vi.resetModules();
    }
  });
});
