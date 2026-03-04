import type { SuiEvent } from '@mysten/sui/client';
import type { ParsedTransaction } from './checkpoint.js';

const T2000_PACKAGE_ID = process.env.T2000_PACKAGE_ID ?? '0xab92e9f1fe549ad3d6a52924a73181b45791e76120b975138fac9ec9b75db9f3';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export interface ParsedFeeEvent {
  agentAddress: string;
  operation: string;
  feeAmount: string;
  txDigest: string;
}

export interface ParsedTransfer {
  agentAddress: string;
  action: string;
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

export function parseTransfers(
  tx: ParsedTransaction,
  knownAgents: Set<string>,
): ParsedTransfer[] {
  const transfers: ParsedTransfer[] = [];

  if (!knownAgents.has(tx.sender)) {
    // Check if any balance change involves a known agent
    const involvesAgent = tx.balanceChanges.some((bc) => {
      if ('AddressOwner' in bc.owner) {
        return knownAgents.has(bc.owner.AddressOwner);
      }
      return false;
    });
    if (!involvesAgent) return transfers;
  }

  // Infer action from balance changes
  let action = 'unknown';
  let amount = 0;
  let asset = 'USDC';
  let agentAddress = tx.sender;

  for (const bc of tx.balanceChanges) {
    const owner = 'AddressOwner' in bc.owner ? bc.owner.AddressOwner : null;
    if (!owner || !knownAgents.has(owner)) continue;

    agentAddress = owner;
    const amt = Number(bc.amount);

    if (bc.coinType.includes('usdc') || bc.coinType.includes('USDC')) {
      asset = 'USDC';
      amount = Math.abs(amt) / 1e6;
      action = amt > 0 ? 'receive' : 'send';
    } else if (bc.coinType.includes('SUI') || bc.coinType === '0x2::sui::SUI') {
      asset = 'SUI';
      amount = Math.abs(amt) / 1e9;
      if (Math.abs(amt) > 10_000_000) {
        action = amt > 0 ? 'receive' : 'send';
      }
    }
  }

  // Check events for more specific actions
  for (const event of tx.events) {
    const eventType = event.type.toLowerCase();
    if (eventType.includes('deposit') || eventType.includes('save')) action = 'save';
    else if (eventType.includes('withdraw')) action = 'withdraw';
    else if (eventType.includes('borrow')) action = 'borrow';
    else if (eventType.includes('repay')) action = 'repay';
    else if (eventType.includes('swap')) action = 'swap';
  }

  if (action !== 'unknown' && amount > 0) {
    transfers.push({
      agentAddress,
      action,
      asset,
      amount,
      txDigest: tx.digest,
      timestamp: tx.timestamp,
      gasMethod: 'self-funded',
    });
  }

  return transfers;
}
