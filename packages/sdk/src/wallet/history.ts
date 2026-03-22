import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { TransactionRecord } from '../types.js';

const SUI_TYPE = '0x2::sui::SUI';

const KNOWN_TARGETS: [RegExp, string][] = [
  [/::suilend|::obligation/, 'lending'],
  [/::navi|::incentive_v2/, 'lending'],
  [/::cetus|::pool/, 'swap'],
  [/::deepbook/, 'swap'],
  [/::transfer::public_transfer/, 'send'],
];

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

  return txns.data.map((tx) => parseTxRecord(tx as unknown as TxBlock, address));
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
    return parseTxRecord(tx as unknown as TxBlock, senderAddress);
  } catch {
    return null;
  }
}

interface TxBlock {
  digest: string;
  timestampMs?: string;
  transaction?: unknown;
  effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } };
  balanceChanges?: BalanceChange[];
}

function parseTxRecord(tx: TxBlock, address: string): TransactionRecord {
  const gasUsed = tx.effects?.gasUsed;
  const gasCost = gasUsed
    ? (Number(gasUsed.computationCost) +
        Number(gasUsed.storageCost) -
        Number(gasUsed.storageRebate)) /
      1e9
    : undefined;

  const { moveCallTargets, commandTypes } = extractCommands(tx.transaction);
  const { amount, asset, recipient } = extractTransferDetails(tx.balanceChanges, address);
  const action = classifyAction(moveCallTargets, commandTypes);

  return {
    digest: tx.digest,
    action,
    amount,
    asset,
    recipient,
    timestamp: Number(tx.timestampMs ?? 0),
    gasCost,
  };
}

interface BalanceChange {
  owner: { AddressOwner?: string } | string;
  coinType: string;
  amount: string;
}

function resolveOwner(owner: BalanceChange['owner']): string | null {
  if (typeof owner === 'object' && owner.AddressOwner) return owner.AddressOwner;
  if (typeof owner === 'string') return owner;
  return null;
}

function extractTransferDetails(
  changes: BalanceChange[] | undefined,
  sender: string,
): { amount?: number; asset?: string; recipient?: string } {
  if (!changes || changes.length === 0) return {};

  const outflows = changes.filter((c) => resolveOwner(c.owner) === sender && BigInt(c.amount) < 0n);
  const inflows = changes.filter((c) => resolveOwner(c.owner) !== sender && BigInt(c.amount) > 0n);

  const primaryOutflow = outflows
    .filter((c) => c.coinType !== SUI_TYPE)
    .sort((a, b) => Number(BigInt(a.amount) - BigInt(b.amount)))[0]
    ?? outflows[0];

  if (!primaryOutflow) return {};

  const coinType = primaryOutflow.coinType;
  const decimals = coinType.includes('::usdc::') ? 6 : 9;
  const amount = Math.abs(Number(BigInt(primaryOutflow.amount))) / 10 ** decimals;
  const asset = coinType === SUI_TYPE ? 'SUI' : coinType.includes('::usdc::') ? 'USDC' : coinType.split('::').pop() ?? 'unknown';

  const recipientChange = inflows.find((c) => c.coinType === coinType);
  const recipient = recipientChange ? resolveOwner(recipientChange.owner) ?? undefined : undefined;

  return { amount, asset, recipient };
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

function classifyAction(targets: string[], commandTypes: string[]): string {
  for (const target of targets) {
    for (const [pattern, label] of KNOWN_TARGETS) {
      if (pattern.test(target)) return label;
    }
  }

  const hasTransfer = commandTypes.includes('TransferObjects');
  const hasMoveCall = commandTypes.includes('MoveCall');

  if (hasTransfer && !hasMoveCall) return 'send';
  if (hasMoveCall) return 'transaction';

  return 'transaction';
}
