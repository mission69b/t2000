import { describe, expect, it } from 'vitest';
import {
  AGENT_ID_PACKAGE_ID,
  buildConfirmOwnershipTx,
  buildRegisterTx,
  buildSetActiveTx,
  buildSetPendingOwnerTx,
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

  it('set_pending_owner targets set_pending_owner', () => {
    expect(cmds(buildSetPendingOwnerTx('0x1'))).toContain('set_pending_owner');
  });

  it('confirm_ownership targets confirm_ownership', () => {
    expect(cmds(buildConfirmOwnershipTx('0x2'))).toContain('confirm_ownership');
  });

  it('set_active targets set_active', () => {
    expect(cmds(buildSetActiveTx('0x3', false))).toContain('set_active');
  });

  it('register accepts empty registration (all-none)', () => {
    expect(() => buildRegisterTx()).not.toThrow();
  });
});
