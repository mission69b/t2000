import { Transaction } from '@mysten/sui/transactions';

/**
 * @t2000/id — client for the `agent_id::registry` Move package (Agent ID
 * Phase B). These builders construct UNSIGNED transactions calling the on-chain
 * registry; the caller signs (the agent's keypair for register/update/active;
 * the proposed owner for confirm) and may sponsor gas (the agent is the sender,
 * so `sender == agent` auth holds; a SUI-funded t2000 account co-signs gas).
 *
 * Deployed on Sui mainnet 2026-06-29. Override via env for testnet/dev.
 */

/** The published `agent_id` package id. */
export const AGENT_ID_PACKAGE_ID =
  process.env.AGENT_ID_PACKAGE_ID ??
  '0x7669be207f9ac28a34d2cbd45dcfdade11e6fd503ad24e687c180931be9a45e9';

/** The shared `Registry` object id. */
export const AGENT_ID_REGISTRY_ID =
  process.env.AGENT_ID_REGISTRY_ID ??
  '0xf41683aa9f4c121f34e4082c35180b0efdbd6d5293e3c88b1bcfa45ddf5c4119';

const CLOCK_ID = '0x6';
const MODULE = 'registry';

/** The mutable registration payload. `update` is full-replace — supply the
 *  complete desired state (omitted fields clear on-chain). */
export interface AgentRegistration {
  mcpEndpoint?: string | null;
  paymentMethods?: string[];
  did?: string | null;
  metadataUri?: string | null;
}

function registrationArgs(tx: Transaction, reg: AgentRegistration) {
  return [
    tx.object(AGENT_ID_REGISTRY_ID),
    tx.pure.option('string', reg.mcpEndpoint ?? null),
    tx.pure.vector('string', reg.paymentMethods ?? []),
    tx.pure.option('string', reg.did ?? null),
    tx.pure.option('string', reg.metadataUri ?? null),
    tx.object(CLOCK_ID),
  ];
}

/** Register the SIGNER as an agent (self-sovereign: `sender == agent`). */
export function buildRegisterTx(reg: AgentRegistration = {}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_ID_PACKAGE_ID}::${MODULE}::register`,
    arguments: registrationArgs(tx, reg),
  });
  return tx;
}

/** Update the signer's record (full-replace). */
export function buildUpdateTx(reg: AgentRegistration = {}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_ID_PACKAGE_ID}::${MODULE}::update`,
    arguments: registrationArgs(tx, reg),
  });
  return tx;
}

/** The agent (signer) proposes an owner; nothing binds until the owner confirms. */
export function buildSetPendingOwnerTx(owner: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_ID_PACKAGE_ID}::${MODULE}::set_pending_owner`,
    arguments: [
      tx.object(AGENT_ID_REGISTRY_ID),
      tx.pure.address(owner),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** The proposed owner (signer) confirms ownership of `agent`. */
export function buildConfirmOwnershipTx(agent: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_ID_PACKAGE_ID}::${MODULE}::confirm_ownership`,
    arguments: [
      tx.object(AGENT_ID_REGISTRY_ID),
      tx.pure.address(agent),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/** Toggle an agent's active flag (signer must be the agent or its owner). */
export function buildSetActiveTx(agent: string, active: boolean): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_ID_PACKAGE_ID}::${MODULE}::set_active`,
    arguments: [
      tx.object(AGENT_ID_REGISTRY_ID),
      tx.pure.address(agent),
      tx.pure.bool(active),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}
