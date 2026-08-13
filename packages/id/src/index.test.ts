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
