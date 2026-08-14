import { bcs } from '@mysten/sui/bcs';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { deriveDynamicFieldID } from '@mysten/sui/utils';

/**
 * @t2000/id — client for the `agent_id::registry` Move package (Agent ID
 * Phase B). These builders construct UNSIGNED transactions calling the on-chain
 * registry; the caller signs (always the AGENT's keypair — every mutator is
 * agent-signed since S.1032) and may sponsor gas (the agent is the sender,
 * so `sender == agent` auth holds; a SUI-funded t2000 account co-signs gas).
 *
 * Passport↔agent OWNERSHIP left the product (S.1032, 2026-08-13): the
 * link/confirm/renounce builders are gone, and the on-chain mutators
 * always abort (`EOwnershipDeprecated`) once the Registry is migrated.
 * Historical `owner`/`pending_owner` record fields remain on-chain, inert.
 *
 * Deployed on Sui mainnet 2026-06-29. Override via env for testnet/dev.
 */

/** MAINNET trust anchor (S.1049 — the S.930 escrow pattern): the published
 *  `agent_id` package id as a LITERAL, never `process.env`. Signature-time
 *  verification (the CLI intent guard's allowlist) imports THIS — reading
 *  the env-aware constant below would let an attacker who controls the
 *  environment supply both the transaction and the yardstick.
 *
 *  Pin the LATEST upgrade id ONLY (the S.1019 rule; event/type anchors stay
 *  on the original package `0x7669be20…be9a45e9`, which remains callable for
 *  its own functions). LATEST = the S.1032 v2 upgrade (2026-08-13, ownership
 *  deprecated; Registry migrated to version 2 — upgrade digest 7ZUiRi48…,
 *  migrate digest 97sNqgt9…). The previous id `0x78d36506…d15451` now aborts
 *  EWrongVersion on every mutator. */
export const MAINNET_AGENT_ID_PACKAGE_ID =
  '0xe94a8b8f14104b75ee4c7e359289da78698fbfffdd0e5e3e9cb7d250887df7a7';

/** MAINNET trust anchor: the shared `Registry` object id (same rule —
 *  literal, never env). */
export const MAINNET_AGENT_ID_REGISTRY_ID =
  '0xf41683aa9f4c121f34e4082c35180b0efdbd6d5293e3c88b1bcfa45ddf5c4119';

/** BUILDER id — env-overridable for testnet/dev. NOT a trust anchor:
 *  transaction BUILDERS may read it so a dev chain works, but guards and
 *  allowlists must use MAINNET_AGENT_ID_PACKAGE_ID (S.1049). */
export const AGENT_ID_PACKAGE_ID =
  process.env.AGENT_ID_PACKAGE_ID ?? MAINNET_AGENT_ID_PACKAGE_ID;

/** BUILDER id — env-overridable for testnet/dev; same not-a-trust-anchor
 *  rule as AGENT_ID_PACKAGE_ID. */
export const AGENT_ID_REGISTRY_ID =
  process.env.AGENT_ID_REGISTRY_ID ?? MAINNET_AGENT_ID_REGISTRY_ID;

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

// Ownership builders (buildSetPendingOwnerTx / buildConfirmOwnershipTx /
// buildRenounceOwnershipTx) were REMOVED in S.1032 — the on-chain mutators
// always abort since registry v2. There is no ownership surface to build for.

/** An agent's on-chain registry record (registry Table dynamic field),
 *  field names as stored by the Move package. */
export interface OnChainAgentRecord {
  agent: string;
  mcp_endpoint?: string | null;
  payment_methods?: string[] | null;
  did?: string | null;
  metadata_uri?: string | null;
}

/**
 * Read one agent's registry record. Returns `null` when the address is not
 * registered. gRPC only (JSON-RPC is deactivated July 31, 2026).
 *
 * Callers that already hold a `SuiGrpcClient` should pass it; otherwise a
 * mainnet client is constructed per call.
 */
export async function getAgentRecord(
  address: string,
  opts: { client?: SuiGrpcClient; network?: 'mainnet' | 'testnet' } = {},
): Promise<OnChainAgentRecord | null> {
  const network = opts.network ?? 'mainnet';
  const client =
    opts.client ??
    new SuiGrpcClient({
      baseUrl:
        network === 'testnet'
          ? 'https://fullnode.testnet.sui.io'
          : 'https://fullnode.mainnet.sui.io',
      network,
    });
  const reg = await client.core.getObject({
    objectId: AGENT_ID_REGISTRY_ID,
    include: { json: true },
  });
  const tableId = (reg.object?.json as { agents?: { id?: string } } | undefined)
    ?.agents?.id;
  if (!tableId) return null;
  const fieldId = deriveDynamicFieldID(
    tableId,
    'address',
    bcs.Address.serialize(address).toBytes(),
  );
  try {
    const obj = await client.core.getObject({
      objectId: fieldId,
      include: { json: true },
    });
    const rec = (obj.object?.json as { value?: OnChainAgentRecord } | undefined)
      ?.value;
    return rec?.agent ? rec : null;
  } catch {
    // Field object absent → not registered.
    return null;
  }
}

/** Toggle an agent's active flag (signer must be the agent itself —
 *  agent-only since registry v2 / S.1032). */
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
