import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { TransactionRecord } from '../types.js';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';

const KNOWN_TARGETS: [RegExp, string][] = [
  [/::mpp_charge::/, 'mpp payment'],
  [/::suilend|::obligation/, 'lending'],
  [/::navi|::incentive_v2/, 'lending'],
  [/::cetus|::pool/, 'swap'],
  [/::deepbook/, 'swap'],
  [/::transfer::public_transfer/, 'send'],
  [/::coin::split/, 'split'],
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

  return txns.data.map((tx) => {
    const gasUsed = tx.effects?.gasUsed;
    const gasCost = gasUsed
      ? (Number(gasUsed.computationCost) +
          Number(gasUsed.storageCost) -
          Number(gasUsed.storageRebate)) /
        1e9
      : undefined;

    const targets = extractMoveCallTargets(tx.transaction);
    const action = classifyAction(targets);

    const { amount, asset, recipient } = extractTransferDetails(
      tx.balanceChanges as BalanceChange[] | undefined,
      address,
    );

    return {
      digest: tx.digest,
      action,
      amount,
      asset,
      recipient,
      timestamp: Number(tx.timestampMs ?? 0),
      gasCost,
    };
  });
}

interface BalanceChange {
  owner: { AddressOwner?: string } | string;
  coinType: string;
  amount: string;
}

function extractTransferDetails(
  changes: BalanceChange[] | undefined,
  sender: string,
): { amount?: number; asset?: string; recipient?: string } {
  if (!changes || changes.length === 0) return {};

  const outflows = changes.filter((c) => {
    const owner = typeof c.owner === 'object' && c.owner.AddressOwner
      ? c.owner.AddressOwner
      : typeof c.owner === 'string' ? c.owner : null;
    return owner === sender && BigInt(c.amount) < 0n;
  });

  const inflows = changes.filter((c) => {
    const owner = typeof c.owner === 'object' && c.owner.AddressOwner
      ? c.owner.AddressOwner
      : typeof c.owner === 'string' ? c.owner : null;
    return owner !== sender && BigInt(c.amount) > 0n;
  });

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
  const recipient = recipientChange
    ? typeof recipientChange.owner === 'object' && recipientChange.owner.AddressOwner
      ? recipientChange.owner.AddressOwner
      : undefined
    : undefined;

  return { amount, asset, recipient };
}

function extractMoveCallTargets(txBlock: unknown): string[] {
  try {
    if (!txBlock || typeof txBlock !== 'object') return [];
    const data = 'data' in txBlock ? (txBlock as Record<string, unknown>).data : undefined;
    if (!data || typeof data !== 'object') return [];
    const inner = 'transaction' in (data as Record<string, unknown>)
      ? (data as Record<string, unknown>).transaction
      : undefined;
    if (!inner || typeof inner !== 'object') return [];
    const commands = 'commands' in (inner as Record<string, unknown>)
      ? (inner as Record<string, unknown>).commands
      : undefined;
    if (!Array.isArray(commands)) return [];
    return commands
      .filter((c: Record<string, unknown>) => c.MoveCall)
      .map((c: Record<string, unknown>) => {
        const mc = c.MoveCall as { package: string; module: string; function: string };
        return `${mc.package}::${mc.module}::${mc.function}`;
      });
  } catch {
    return [];
  }
}

function classifyAction(targets: string[]): string {
  if (targets.length === 0) return 'transaction';
  for (const target of targets) {
    for (const [pattern, label] of KNOWN_TARGETS) {
      if (pattern.test(target)) return label;
    }
  }
  return 'transaction';
}
