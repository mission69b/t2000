import type { TransactionRecord } from '../types.js';
import { getSuiGraphQLClient } from '../utils/sui.js';
import {
  classifyTransaction,
  extractAllUserLegs,
  extractTransferDetails,
  type ClassifyBalanceChange,
} from './classify.js';

// ---------------------------------------------------------------------------
// [gRPC migration / S.447 + S.450] Transaction history is the one surface with
// NO gRPC `core.*` equivalent (Stage 0 finding A): list-by-sender +
// per-tx-by-digest live in the GraphQL RPC, not gRPC. Both go through the
// Sui GraphQL endpoint (`getSuiGraphQLClient()`), share one node fragment +
// one mapper, and feed the existing (tested) classifier in `classify.ts`.
//
// LIVE-VERIFIED 2026-06-15 (S.450) against `graphql.mainnet.sui.io` with a
// real sender (send + Cetus swap digests). The live schema differs from the
// older `transactionBlocks` one: the query is `transactions` / `transaction`
// (filter `sentAddress`), the programmable kind is `ProgrammableTransaction`
// (was `ProgrammableTransactionBlock`) with `commands { nodes }` (was
// `transactions`), and a move call is `MoveCallCommand` with a nested
// `function { name module { name package { address } } }` (was a flat
// `MoveCallTransaction { package module functionName }`). GraphQL errors are
// now SURFACED, not swallowed (the old `?? []` hid this schema drift as an
// empty history for a whole session). Schema ref: https://docs.sui.io/references/sui-graphql
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
    ... on ProgrammableTransaction {
      commands {
        nodes {
          __typename
          ... on MoveCallCommand { function { name module { name package { address } } } }
        }
      }
    }
  }
`;

const HISTORY_QUERY = `query History($address: SuiAddress!, $last: Int!) {
  transactions(last: $last, filter: { sentAddress: $address }) {
    nodes {${TX_NODE_FRAGMENT}}
  }
}`;

const TX_BY_DIGEST_QUERY = `query TxByDigest($digest: String!) {
  transaction(digest: $digest) {${TX_NODE_FRAGMENT}}
}`;

/** Minimal shape of a Sui GraphQL transaction node we consume. */
interface GqlTxNode {
  digest?: string;
  effects?: {
    timestamp?: string;
    // Live schema returns gas as numbers; `Number()` in the mapper tolerates both.
    gasEffects?: { gasSummary?: { computationCost?: string | number; storageCost?: string | number; storageRebate?: string | number } };
    balanceChanges?: { nodes?: Array<{ amount?: string; coinType?: { repr?: string }; owner?: { address?: string } }> };
  };
  kind?: {
    __typename?: string;
    commands?: {
      nodes?: Array<{
        __typename?: string;
        function?: { name?: string; module?: { name?: string; package?: { address?: string } } };
      }>;
    };
  };
}

/** GraphQL transport result with the optional `errors` array surfaced. */
interface GqlResult<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

function assertNoGqlErrors(res: GqlResult<unknown>, what: string): void {
  if (res.errors?.length) {
    throw new Error(
      `Sui GraphQL ${what} failed: ${res.errors.map((e) => e.message ?? 'unknown error').join('; ')}`,
    );
  }
}

export async function queryHistory(
  address: string,
  limit = 20,
): Promise<TransactionRecord[]> {
  const gql = getSuiGraphQLClient();
  const res = (await gql.query({ query: HISTORY_QUERY, variables: { address, last: limit } })) as GqlResult<{
    transactions?: { nodes?: GqlTxNode[] };
  }>;
  assertNoGqlErrors(res, 'history query');
  const nodes = res.data?.transactions?.nodes ?? [];
  // GraphQL `last` returns ascending; the legacy JSON-RPC path returned
  // descending (newest first) — reverse to preserve caller expectations.
  return nodes.map((n) => recordFromGqlNode(n, address)).reverse();
}

export async function queryTransaction(
  digest: string,
  senderAddress: string,
): Promise<TransactionRecord | null> {
  const gql = getSuiGraphQLClient();
  const res = (await gql.query({ query: TX_BY_DIGEST_QUERY, variables: { digest } })) as GqlResult<{
    transaction?: GqlTxNode | null;
  }>;
  assertNoGqlErrors(res, 'transaction query');
  const node = res.data?.transaction;
  if (!node) return null; // genuine not-found (distinct from a query error, which throws above)
  return recordFromGqlNode(node, senderAddress);
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
  if (node.kind?.__typename === 'ProgrammableTransaction') {
    for (const cmd of node.kind.commands?.nodes ?? []) {
      if (cmd.__typename === 'MoveCallCommand') {
        commandTypes.push('MoveCall');
        const fn = cmd.function;
        const pkg = fn?.module?.package?.address;
        const mod = fn?.module?.name;
        const name = fn?.name;
        if (pkg && mod && name) {
          moveCallTargets.push(`${pkg}::${mod}::${name}`);
        }
      } else if (cmd.__typename === 'TransferObjectsCommand') {
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
