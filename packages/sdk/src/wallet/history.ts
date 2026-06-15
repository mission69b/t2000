import type { TransactionRecord } from '../types.js';
import { getSuiGraphQLClient } from '../utils/sui.js';
import {
  classifyTransaction,
  extractAllUserLegs,
  extractTransferDetails,
  type ClassifyBalanceChange,
} from './classify.js';

// ---------------------------------------------------------------------------
// [gRPC migration / S.447] Transaction history is the one surface with NO
// gRPC `core.*` equivalent (Stage 0 finding A): list-by-sender +
// per-tx-by-digest live in the GraphQL RPC, not gRPC. Both go through the
// Sui GraphQL endpoint (`getSuiGraphQLClient()`), share one node fragment +
// one mapper, and feed the existing (tested) classifier in `classify.ts`.
//
// ⚠️ LIVE-VERIFY GATE: the GraphQL query string below is grounded in the
// Sui GraphQL beta schema but was NOT runtime-smoked from the build env
// (no egress to Sui RPC). It MUST pass a live smoke against
// `sui-mainnet.mystenlabs.com/graphql` (a real sender address) alongside
// the mainnet money-path verify BEFORE the transport flip ships. The
// mapper + classifier ARE unit-tested (history.test.ts) against a mocked
// node shape — only the on-the-wire field names need the live check.
// Schema ref: https://docs.sui.io/references/sui-graphql
// ---------------------------------------------------------------------------

const TX_NODE_FRAGMENT = `
  digest
  effects {
    timestamp
    gasEffects { gasSummary { computationCost storageCost storageRebate } }
    balanceChanges { nodes { amount coinType { repr } owner { address } } }
  }
  kind {
    __typename
    ... on ProgrammableTransactionBlock {
      transactions {
        nodes { __typename ... on MoveCallTransaction { package module functionName } }
      }
    }
  }
`;

const HISTORY_QUERY = `query History($address: SuiAddress!, $last: Int!) {
  transactionBlocks(last: $last, filter: { sentAddress: $address }) {
    nodes {${TX_NODE_FRAGMENT}}
  }
}`;

const TX_BY_DIGEST_QUERY = `query TxByDigest($digest: String!) {
  transactionBlock(digest: $digest) {${TX_NODE_FRAGMENT}}
}`;

/** Minimal shape of a Sui GraphQL transactionBlock node we consume. */
interface GqlTxNode {
  digest?: string;
  effects?: {
    timestamp?: string;
    gasEffects?: { gasSummary?: { computationCost?: string; storageCost?: string; storageRebate?: string } };
    balanceChanges?: { nodes?: Array<{ amount?: string; coinType?: { repr?: string }; owner?: { address?: string } }> };
  };
  kind?: {
    __typename?: string;
    transactions?: { nodes?: Array<{ __typename?: string; package?: string; module?: string; functionName?: string }> };
  };
}

export async function queryHistory(
  address: string,
  limit = 20,
): Promise<TransactionRecord[]> {
  const gql = getSuiGraphQLClient();
  const res = await gql.query({ query: HISTORY_QUERY, variables: { address, last: limit } });
  const nodes = (res.data as { transactionBlocks?: { nodes?: GqlTxNode[] } } | undefined)
    ?.transactionBlocks?.nodes ?? [];
  // GraphQL `last` returns ascending; the legacy JSON-RPC path returned
  // descending (newest first) — reverse to preserve caller expectations.
  return nodes.map((n) => recordFromGqlNode(n, address)).reverse();
}

export async function queryTransaction(
  digest: string,
  senderAddress: string,
): Promise<TransactionRecord | null> {
  try {
    const gql = getSuiGraphQLClient();
    const res = await gql.query({ query: TX_BY_DIGEST_QUERY, variables: { digest } });
    const node = (res.data as { transactionBlock?: GqlTxNode } | undefined)?.transactionBlock;
    if (!node) return null;
    return recordFromGqlNode(node, senderAddress);
  } catch {
    return null;
  }
}

/**
 * Map a Sui GraphQL transactionBlock node → the primitives the shared
 * classifier consumes, then build the record. Isolated so the legacy
 * JSON-RPC `parseTxRecord` (back-compat, below) and this GraphQL path
 * converge on one classification routine.
 */
function recordFromGqlNode(node: GqlTxNode, address: string): TransactionRecord {
  const gs = node.effects?.gasEffects?.gasSummary;
  const gasCost = gs
    ? (Number(gs.computationCost ?? 0) + Number(gs.storageCost ?? 0) - Number(gs.storageRebate ?? 0)) / 1e9
    : undefined;

  const balanceChanges: ClassifyBalanceChange[] = (node.effects?.balanceChanges?.nodes ?? [])
    .filter((b) => b.coinType?.repr && b.amount != null)
    .map((b) => ({ coinType: b.coinType!.repr!, amount: String(b.amount), owner: b.owner?.address ?? '' }));

  const moveCallTargets: string[] = [];
  const commandTypes: string[] = [];
  if (node.kind?.__typename === 'ProgrammableTransactionBlock') {
    for (const cmd of node.kind.transactions?.nodes ?? []) {
      if (cmd.__typename === 'MoveCallTransaction') {
        commandTypes.push('MoveCall');
        if (cmd.package && cmd.module && cmd.functionName) {
          moveCallTargets.push(`${cmd.package}::${cmd.module}::${cmd.functionName}`);
        }
      } else if (cmd.__typename === 'TransferObjectsTransaction') {
        commandTypes.push('TransferObjects');
      }
    }
  }

  // GraphQL effects.timestamp is an ISO datetime; the record wants ms.
  const ts = node.effects?.timestamp ? Date.parse(node.effects.timestamp) : 0;

  return buildRecord({
    digest: node.digest ?? '',
    moveCallTargets,
    commandTypes,
    balanceChanges,
    timestampMs: Number.isFinite(ts) ? ts : 0,
    gasCost,
    address,
  });
}

/** Shared record builder — classification + leg/transfer extraction. */
function buildRecord(args: {
  digest: string;
  moveCallTargets: string[];
  commandTypes: string[];
  balanceChanges: ClassifyBalanceChange[];
  timestampMs: number;
  gasCost: number | undefined;
  address: string;
}): TransactionRecord {
  const { digest, moveCallTargets, commandTypes, balanceChanges, timestampMs, gasCost, address } = args;
  const legs = extractAllUserLegs(balanceChanges, address);
  const { amount, asset, recipient, direction } = extractTransferDetails(balanceChanges, address);
  const { action, label } = classifyTransaction(moveCallTargets, commandTypes, balanceChanges, address);
  return { digest, action, label, legs, amount, asset, recipient, direction, timestamp: timestampMs, gasCost };
}

/**
 * Shape of a transaction block as returned by `suix_queryTransactionBlocks`
 * with `showEffects | showInput | showBalanceChanges` enabled. Exported so
 * downstream consumers (audric dashboard `/api/history`, `/api/activity`,
 * etc.) can type their RPC calls without redeclaring the structure.
 */
export interface SuiRpcTxBlock {
  digest: string;
  timestampMs?: string;
  transaction?: unknown;
  effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } };
  balanceChanges?: ClassifyBalanceChange[];
}

/**
 * Convert a single Sui RPC transaction block to a {@link TransactionRecord}
 * using the canonical (shared) classifier and balance-change extractor.
 *
 * This is the single source of truth for transaction parsing across the
 * agent-tool path AND the dashboard-API path. Use it instead of writing
 * a bespoke parser per surface.
 *
 * @param tx      Raw RPC tx block (must include `effects`, `input`, `balanceChanges`).
 * @param address Wallet address whose perspective we're parsing from.
 */
export function parseSuiRpcTx(tx: SuiRpcTxBlock, address: string): TransactionRecord {
  return parseTxRecord(tx, address);
}

/**
 * Extract the sender (signer) address from a raw RPC tx block.
 * Returns `null` if the block shape is unexpected.
 */
export function extractTxSender(txBlock: unknown): string | null {
  try {
    if (!txBlock || typeof txBlock !== 'object') return null;
    const data = 'data' in txBlock ? (txBlock as Record<string, unknown>).data : undefined;
    if (!data || typeof data !== 'object') return null;
    return ((data as Record<string, unknown>).sender as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract MoveCall targets (`<pkg>::<module>::<function>`) and the
 * sequence of programmable-transaction command types (e.g. `MoveCall`,
 * `TransferObjects`) from a raw RPC tx block. Tolerates both the
 * legacy `inner.transactions` field and the newer `inner.commands`
 * field.
 */
export function extractTxCommands(txBlock: unknown): {
  moveCallTargets: string[];
  commandTypes: string[];
} {
  return extractCommands(txBlock);
}

// [back-compat] Legacy JSON-RPC-shape parser. The live history path is now
// GraphQL (above); this stays for external consumers that already hold a
// JSON-RPC tx block (e.g. via `parseSuiRpcTx`). Routes through `buildRecord`
// so classification is identical to the GraphQL path.
function parseTxRecord(tx: SuiRpcTxBlock, address: string): TransactionRecord {
  const gasUsed = tx.effects?.gasUsed;
  const gasCost = gasUsed
    ? (Number(gasUsed.computationCost) +
        Number(gasUsed.storageCost) -
        Number(gasUsed.storageRebate)) /
      1e9
    : undefined;

  const { moveCallTargets, commandTypes } = extractCommands(tx.transaction);
  return buildRecord({
    digest: tx.digest,
    moveCallTargets,
    commandTypes,
    balanceChanges: tx.balanceChanges ?? [],
    timestampMs: Number(tx.timestampMs ?? 0),
    gasCost,
    address,
  });
}

interface CommandInfo {
  moveCallTargets: string[];
  commandTypes: string[];
}

function extractCommands(txBlock: unknown): CommandInfo {
  const result: CommandInfo = { moveCallTargets: [], commandTypes: [] };
  try {
    if (!txBlock || typeof txBlock !== 'object') return result;
    const data = 'data' in txBlock ? (txBlock as Record<string, unknown>).data : undefined;
    if (!data || typeof data !== 'object') return result;
    const inner = 'transaction' in (data as Record<string, unknown>)
      ? (data as Record<string, unknown>).transaction
      : undefined;
    if (!inner || typeof inner !== 'object') return result;
    const commands = 'commands' in (inner as Record<string, unknown>)
      ? (inner as Record<string, unknown>).commands
      : 'transactions' in (inner as Record<string, unknown>)
        ? (inner as Record<string, unknown>).transactions
        : undefined;
    if (!Array.isArray(commands)) return result;

    for (const cmd of commands as Record<string, unknown>[]) {
      if (cmd.MoveCall) {
        const mc = cmd.MoveCall as { package: string; module: string; function: string };
        result.moveCallTargets.push(`${mc.package}::${mc.module}::${mc.function}`);
        result.commandTypes.push('MoveCall');
      } else if (cmd.TransferObjects) {
        result.commandTypes.push('TransferObjects');
      }
    }
  } catch { /* best effort */ }
  return result;
}
