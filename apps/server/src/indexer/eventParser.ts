import type { SuiEvent } from '@mysten/sui/jsonRpc';
import type { ParsedTransaction } from './checkpoint.js';
import { allDescriptors, type ProtocolDescriptor } from '@t2000/sdk/adapters';

const T2000_PACKAGE_ID = process.env.T2000_PACKAGE_ID ?? '0xab92e9f1fe549ad3d6a52924a73181b45791e76120b975138fac9ec9b75db9f3';

const MPP_GATEWAY_TREASURIES = new Set(
  (process.env.MPP_GATEWAY_TREASURIES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
);

/**
 * Protocol detection rules — auto-built from SDK adapter descriptors.
 *
 * To add a new protocol:
 *   1. Create the adapter in packages/sdk/src/adapters/<protocol>.ts
 *   2. Export a `descriptor: ProtocolDescriptor` from that file
 *   3. Add it to `allDescriptors` in packages/sdk/src/adapters/index.ts
 *   4. The indexer picks it up automatically — no changes needed here.
 */

interface PackageRule {
  protocol: string;
  actionMap: Record<string, string>;
}

interface DynamicRule {
  protocol: string;
  actionMap: Record<string, string>;
}

const packageRules: Map<string, PackageRule> = new Map();
const dynamicRules: DynamicRule[] = [];

for (const desc of allDescriptors) {
  if (desc.dynamicPackageId) {
    dynamicRules.push({ protocol: desc.id, actionMap: desc.actionMap });
  } else {
    for (const pkg of desc.packages) {
      packageRules.set(pkg, { protocol: desc.id, actionMap: desc.actionMap });
    }
  }
}

export interface ParsedFeeEvent {
  agentAddress: string;
  operation: string;
  feeAmount: string;
  txDigest: string;
}

export interface ParsedTransfer {
  agentAddress: string;
  action: string;
  protocol: string | null;
  asset: string;
  amount: number;
  txDigest: string;
  timestamp: number;
  gasMethod: string;
}

export function isT2000Event(event: SuiEvent): boolean {
  return event.type.startsWith(T2000_PACKAGE_ID);
}

export function parseFeeEvents(tx: ParsedTransaction): ParsedFeeEvent[] {
  const fees: ParsedFeeEvent[] = [];

  for (const event of tx.events) {
    if (!event.type.includes('FeeCollected')) continue;

    const fields = event.parsedJson as Record<string, unknown> | null;
    if (!fields) continue;

    fees.push({
      agentAddress: String(fields.agent ?? fields.sender ?? tx.sender),
      operation: String(fields.operation ?? 'unknown'),
      feeAmount: String(fields.amount ?? '0'),
      txDigest: tx.digest,
    });
  }

  return fees;
}

function classifyFromMoveCallTargets(targets: string[]): { action: string; protocol: string | null } {
  for (const target of targets) {
    // 1. Check static package rules (exact package ID match)
    for (const [pkgId, rule] of packageRules) {
      if (!target.startsWith(pkgId)) continue;
      const suffix = target.slice(pkgId.length + 2);
      if (rule.actionMap[suffix]) {
        return { action: rule.actionMap[suffix], protocol: rule.protocol };
      }
      return { action: 'unknown', protocol: rule.protocol };
    }

    // 2. Check dynamic rules (module::function match, ignores package ID)
    const parts = target.split('::');
    if (parts.length === 3) {
      const moduleFunc = `${parts[1]}::${parts[2]}`;
      for (const rule of dynamicRules) {
        if (rule.actionMap[moduleFunc]) {
          return { action: rule.actionMap[moduleFunc], protocol: rule.protocol };
        }
      }
    }

    // 3. Cetus aggregator fallback (aggregator SDK uses varying package IDs)
    if (target.includes('aggregator') || target.includes('router')) {
      return { action: 'swap', protocol: 'cetus' };
    }
  }

  return { action: 'unknown', protocol: null };
}

function classifyFromEvents(events: SuiEvent[]): { action: string; protocol: string | null } {
  for (const event of events) {
    const eventType = event.type.toLowerCase();

    if (eventType.includes('sentinel') || eventType.includes('attack')) {
      return { action: 'sentinel_attack', protocol: 'sentinel' };
    }
    if (eventType.includes('deposit') || eventType.includes('save')) {
      return { action: 'save', protocol: null };
    }
    if (eventType.includes('withdraw')) {
      return { action: 'withdraw', protocol: null };
    }
    if (eventType.includes('borrow')) {
      return { action: 'borrow', protocol: null };
    }
    if (eventType.includes('repay')) {
      return { action: 'repay', protocol: null };
    }
    if (eventType.includes('swap')) {
      return { action: 'swap', protocol: null };
    }
  }

  return { action: 'unknown', protocol: null };
}

export function parseTransfers(
  tx: ParsedTransaction,
  knownAgents: Set<string>,
): ParsedTransfer[] {
  const transfers: ParsedTransfer[] = [];

  if (!knownAgents.has(tx.sender)) {
    const involvesAgent = tx.balanceChanges.some((bc) => {
      if ('AddressOwner' in bc.owner) {
        return knownAgents.has(bc.owner.AddressOwner);
      }
      return false;
    });
    if (!involvesAgent) return transfers;
  }

  // Step 1: Infer from balance changes (lowest priority — fallback)
  let action = 'unknown';
  let protocol: string | null = null;
  let amount = 0;
  let asset = 'USDC';
  let agentAddress = tx.sender;

  for (const bc of tx.balanceChanges) {
    const owner = 'AddressOwner' in bc.owner ? bc.owner.AddressOwner : null;
    if (!owner || !knownAgents.has(owner)) continue;

    agentAddress = owner;
    const amt = Number(bc.amount);
    const ct = bc.coinType.toLowerCase();

    if (ct.includes('usdc')) {
      asset = 'USDC';
      amount = Math.abs(amt) / 1e6;
      action = amt > 0 ? 'receive' : 'send';
    } else if (ct.includes('usdt')) {
      asset = 'USDT';
      amount = Math.abs(amt) / 1e6;
      action = amt > 0 ? 'receive' : 'send';
    } else if (ct.includes('sui_usde') || ct.includes('usde')) {
      asset = 'USDe';
      amount = Math.abs(amt) / 1e6;
      action = amt > 0 ? 'receive' : 'send';
    } else if (ct.includes('usdsui')) {
      asset = 'USDsui';
      amount = Math.abs(amt) / 1e6;
      action = amt > 0 ? 'receive' : 'send';
    } else if (ct.includes('sui') || bc.coinType === '0x2::sui::SUI') {
      asset = 'SUI';
      amount = Math.abs(amt) / 1e9;
      if (Math.abs(amt) > 10_000_000) {
        action = amt > 0 ? 'receive' : 'send';
      }
    }
  }

  // Step 2: Detect MPP payments — USDC outflow to a known gateway treasury
  if (MPP_GATEWAY_TREASURIES.size > 0 && (action === 'send' || action === 'unknown')) {
    for (const bc of tx.balanceChanges) {
      const owner = 'AddressOwner' in bc.owner ? bc.owner.AddressOwner : null;
      if (!owner || !MPP_GATEWAY_TREASURIES.has(owner)) continue;
      if (bc.coinType.toLowerCase().includes('usdc') && Number(bc.amount) > 0) {
        action = 'pay';
        protocol = 'mpp';
        break;
      }
    }
  }

  // Step 3: Override with event-based classification (medium priority)
  const eventResult = classifyFromEvents(tx.events);
  if (eventResult.action !== 'unknown') {
    action = eventResult.action;
    protocol = eventResult.protocol;
  }

  // Step 4: Override with Move call target classification (highest priority)
  const moveCallResult = classifyFromMoveCallTargets(tx.moveCallTargets);
  if (moveCallResult.action !== 'unknown') {
    action = moveCallResult.action;
  }
  if (moveCallResult.protocol) {
    protocol = moveCallResult.protocol;
  }

  if (action !== 'unknown' && amount > 0) {
    transfers.push({
      agentAddress,
      action,
      protocol,
      asset,
      amount,
      txDigest: tx.digest,
      timestamp: tx.timestamp,
      gasMethod: 'self-funded',
    });
  }

  return transfers;
}
