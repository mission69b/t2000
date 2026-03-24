import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export const runtime = 'nodejs';

const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

const SUI_TYPE = '0x2::sui::SUI';

const KNOWN_TARGETS: [RegExp, string][] = [
  [/::suilend|::obligation/, 'lending'],
  [/::navi|::incentive_v2/, 'lending'],
  [/::cetus|::pool/, 'swap'],
  [/::deepbook/, 'swap'],
  [/::transfer::public_transfer/, 'send'],
];

export interface TxHistoryItem {
  digest: string;
  action: string;
  direction: 'out' | 'in' | 'self';
  amount?: number;
  asset?: string;
  counterparty?: string;
  timestamp: number;
  gasCost?: number;
}

/**
 * GET /api/history?address=0x...&limit=20
 *
 * Returns on-chain transaction history with parsed actions and balance changes.
 * Queries both outgoing (FromAddress) and incoming (ToAddress) transactions.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10), 50);

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const [outgoing, incoming] = await Promise.all([
      client.queryTransactionBlocks({
        filter: { FromAddress: address },
        options: { showEffects: true, showInput: true, showBalanceChanges: true },
        limit,
        order: 'descending',
      }).catch((err) => {
        console.error('[history] FromAddress query failed:', err?.message);
        return { data: [] };
      }),
      client.queryTransactionBlocks({
        filter: { ToAddress: address },
        options: { showEffects: true, showInput: true, showBalanceChanges: true },
        limit: Math.min(limit, 10),
        order: 'descending',
      }).catch((err) => {
        console.error('[history] ToAddress query failed:', err?.message);
        return { data: [] };
      }),
    ]);

    const seen = new Set<string>();
    const allTxns: TxBlock[] = [];

    for (const tx of (outgoing.data ?? [])) {
      seen.add(tx.digest);
      allTxns.push(tx as unknown as TxBlock);
    }
    for (const tx of (incoming.data ?? [])) {
      if (!seen.has(tx.digest)) {
        seen.add(tx.digest);
        allTxns.push(tx as unknown as TxBlock);
      }
    }

    allTxns.sort((a, b) => Number(b.timestampMs ?? 0) - Number(a.timestampMs ?? 0));

    const items: TxHistoryItem[] = allTxns.slice(0, limit).map((tx) => {
      try {
        return parseTx(tx, address);
      } catch (err) {
        console.error('[history] Parse error for', tx.digest, err);
        return {
          digest: tx.digest,
          action: 'transaction',
          direction: 'self' as const,
          timestamp: Number(tx.timestampMs ?? 0),
        };
      }
    });

    return NextResponse.json({ items, network: SUI_NETWORK });
  } catch (err) {
    console.error('[history] Unexpected error:', err);
    return NextResponse.json({ items: [], network: SUI_NETWORK });
  }
}

interface TxBlock {
  digest: string;
  timestampMs?: string;
  transaction?: unknown;
  effects?: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } };
  balanceChanges?: BalanceChange[];
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

function parseTx(tx: TxBlock, address: string): TxHistoryItem {
  const gasUsed = tx.effects?.gasUsed;
  const gasCost = gasUsed
    ? (Number(gasUsed.computationCost) + Number(gasUsed.storageCost) - Number(gasUsed.storageRebate)) / 1e9
    : undefined;

  const changes = tx.balanceChanges ?? [];
  const sender = extractSender(tx.transaction);
  const isUserTx = sender === address;

  const { moveCallTargets, commandTypes } = extractCommands(tx.transaction);
  const action = classifyAction(moveCallTargets, commandTypes);

  const userInflows = changes.filter(
    (c) => resolveOwner(c.owner) === address && BigInt(c.amount) > BigInt(0) && c.coinType !== SUI_TYPE,
  );
  const userOutflows = changes.filter(
    (c) => resolveOwner(c.owner) === address && BigInt(c.amount) < BigInt(0) && c.coinType !== SUI_TYPE,
  );

  let direction: 'out' | 'in' | 'self' = 'self';
  let amount: number | undefined;
  let asset: string | undefined;
  let counterparty: string | undefined;

  if (userOutflows.length > 0 && userInflows.length === 0) {
    direction = 'out';
    const primary = userOutflows.sort((a, b) => Number(BigInt(a.amount) - BigInt(b.amount)))[0];
    const decimals = primary.coinType.includes('::usdc::') ? 6 : 9;
    amount = Math.round(Math.abs(Number(BigInt(primary.amount))) / 10 ** decimals * 100) / 100;
    asset = formatAsset(primary.coinType);
    const recipientChange = changes.find(
      (c) => resolveOwner(c.owner) !== address && c.coinType === primary.coinType && BigInt(c.amount) > BigInt(0),
    );
    counterparty = recipientChange ? resolveOwner(recipientChange.owner) ?? undefined : undefined;
  } else if (userInflows.length > 0 && userOutflows.length === 0) {
    direction = 'in';
    const primary = userInflows.sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount)))[0];
    const decimals = primary.coinType.includes('::usdc::') ? 6 : 9;
    amount = Math.round(Math.abs(Number(BigInt(primary.amount))) / 10 ** decimals * 100) / 100;
    asset = formatAsset(primary.coinType);
    if (!isUserTx && sender) counterparty = sender;
  } else if (userOutflows.length > 0 && userInflows.length > 0) {
    // Both in and out (e.g., swap) — show the outflow
    direction = 'out';
    const primary = userOutflows.sort((a, b) => Number(BigInt(a.amount) - BigInt(b.amount)))[0];
    const decimals = primary.coinType.includes('::usdc::') ? 6 : 9;
    amount = Math.round(Math.abs(Number(BigInt(primary.amount))) / 10 ** decimals * 100) / 100;
    asset = formatAsset(primary.coinType);
  } else {
    // No non-SUI balance changes — check SUI changes
    const suiChanges = changes.filter(
      (c) => resolveOwner(c.owner) === address && c.coinType === SUI_TYPE,
    );
    if (suiChanges.length > 0) {
      const netSui = suiChanges.reduce((s, c) => s + Number(BigInt(c.amount)), 0);
      if (Math.abs(netSui) > 1_000_000) {
        direction = netSui > 0 ? 'in' : 'out';
        amount = Math.round(Math.abs(netSui) / 1e9 * 100) / 100;
        asset = 'SUI';
      }
    }
  }

  const resolvedAction = direction === 'in' && !isUserTx ? 'receive'
    : direction === 'in' && isUserTx ? (action === 'contract' || action === 'transaction' ? 'lending' : action)
    : action;

  return {
    digest: tx.digest,
    action: resolvedAction,
    direction,
    amount,
    asset,
    counterparty,
    timestamp: Number(tx.timestampMs ?? 0),
    gasCost,
  };
}

function formatAsset(coinType: string): string {
  if (coinType === SUI_TYPE) return 'SUI';
  if (coinType.includes('::usdc::')) return 'USDC';
  return coinType.split('::').pop() ?? 'unknown';
}

function extractSender(txBlock: unknown): string | null {
  try {
    if (!txBlock || typeof txBlock !== 'object') return null;
    const data = 'data' in txBlock ? (txBlock as Record<string, unknown>).data : undefined;
    if (!data || typeof data !== 'object') return null;
    return (data as Record<string, unknown>).sender as string ?? null;
  } catch {
    return null;
  }
}

function extractCommands(txBlock: unknown): { moveCallTargets: string[]; commandTypes: string[] } {
  const result = { moveCallTargets: [] as string[], commandTypes: [] as string[] };
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
  if (commandTypes.includes('TransferObjects') && !commandTypes.includes('MoveCall')) return 'send';
  if (commandTypes.includes('MoveCall')) return 'contract';
  return 'transaction';
}
