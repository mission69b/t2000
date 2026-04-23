import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { TransactionRecord } from '../types.js';
import {
  classifyTransaction,
  extractTransferDetails,
  type ClassifyBalanceChange,
} from './classify.js';

export async function queryHistory(
  client: SuiJsonRpcClient,
  address: string,
  limit = 20,
): Promise<TransactionRecord[]> {
  const txns = await client.queryTransactionBlocks({
    filter: { FromAddress: address },
    options: { showEffects: true, showInput: true, showBalanceChanges: true },
    limit,
    order: 'descending',
  });

  return txns.data.map((tx) => parseTxRecord(tx as unknown as SuiRpcTxBlock, address));
}

export async function queryTransaction(
  client: SuiJsonRpcClient,
  digest: string,
  senderAddress: string,
): Promise<TransactionRecord | null> {
  try {
    const tx = await client.getTransactionBlock({
      digest,
      options: { showEffects: true, showInput: true, showBalanceChanges: true },
    });
    return parseTxRecord(tx as unknown as SuiRpcTxBlock, senderAddress);
  } catch {
    return null;
  }
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

function parseTxRecord(tx: SuiRpcTxBlock, address: string): TransactionRecord {
  const gasUsed = tx.effects?.gasUsed;
  const gasCost = gasUsed
    ? (Number(gasUsed.computationCost) +
        Number(gasUsed.storageCost) -
        Number(gasUsed.storageRebate)) /
      1e9
    : undefined;

  const { moveCallTargets, commandTypes } = extractCommands(tx.transaction);
  const balanceChanges = tx.balanceChanges ?? [];
  const { amount, asset, recipient, direction } = extractTransferDetails(balanceChanges, address);
  const { action, label } = classifyTransaction(
    moveCallTargets,
    commandTypes,
    balanceChanges,
    address,
  );

  return {
    digest: tx.digest,
    action,
    label,
    amount,
    asset,
    recipient,
    direction,
    timestamp: Number(tx.timestampMs ?? 0),
    gasCost,
  };
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
