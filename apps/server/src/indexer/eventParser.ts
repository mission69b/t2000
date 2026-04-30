import type { SuiEvent } from '@mysten/sui/jsonRpc';
import type { ParsedTransaction } from './checkpoint.js';
import { allDescriptors, type ProtocolDescriptor } from '@t2000/sdk/descriptors';

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
  feeAsset: string;
  feeRate: string;
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
}

// Operation → fee rate (matches packages/sdk/src/constants.ts SAVE/BORROW_FEE_BPS
// and the swap overlay rate). Indexer only sees on-chain amounts; the rate is
// derived from the operation type at index time.
const OPERATION_RATES: Record<string, string> = {
  save: '0.001',    // 10 bps
  borrow: '0.0005', // 5 bps
  swap: '0.001',    // 10 bps overlay
  unknown: '0',
};

/**
 * Extract the asset symbol from a Sui coin type string.
 *
 *   0xdba34…::usdc::USDC → "USDC"
 *   0x2::sui::SUI        → "SUI"
 *   0xabc::cert::CERT    → "CERT"
 *
 * Matches the convention used throughout the codebase (token-registry, balance
 * changes, etc.). Stored on `ProtocolFeeLedger.feeAsset` so the stats layer
 * can break fees down by asset and apply the right decimals when converting
 * raw amounts to human values.
 */
function extractAssetSymbol(coinType: string): string {
  const segments = coinType.split('::');
  return segments[segments.length - 1] ?? coinType;
}

/**
 * Detect token transfers to the T2000 overlay-fee wallet inside a transaction
 * and classify each as a save / borrow / swap fee from the tx's moveCall
 * targets.
 *
 * Audric's prepare/route.ts adds fees in two ways:
 *   - save / borrow: `addFeeTransfer` splits a USDC fee from the operation's
 *     coin and transfers it inline. Always USDC.
 *   - swap: Cetus aggregator's `overlayFeeReceiver` takes the fee from the
 *     swap's output coin (default `byAmountIn=true`). Asset varies — e.g.
 *     a USDC→SUI swap pays its fee in SUI, a SUI→USDC swap pays in USDC.
 *
 * We detect ANY positive balance change to `treasuryWallet` (regardless of
 * coin type) and record it with the asset symbol. The stats layer applies
 * the correct decimals via the SDK token registry at display time.
 *
 * @param tx              The parsed transaction
 * @param treasuryWallet  The wallet address that receives all overlay fees
 *                        (matches `T2000_OVERLAY_FEE_WALLET` from the SDK)
 */
export function parseTreasuryFees(
  tx: ParsedTransaction,
  treasuryWallet: string,
): ParsedFeeEvent[] {
  if (!treasuryWallet) return [];
  const treasuryLower = treasuryWallet.toLowerCase();

  const fees: ParsedFeeEvent[] = [];
  const operation = classifyFromMoveCallTargets(tx.moveCallTargets).action;
  const feeRate = OPERATION_RATES[operation] ?? '0';

  for (const change of tx.balanceChanges) {
    const ownerAddr = 'AddressOwner' in change.owner ? change.owner.AddressOwner : null;
    if (!ownerAddr || ownerAddr.toLowerCase() !== treasuryLower) continue;

    const amount = BigInt(change.amount);
    if (amount <= 0n) continue;

    fees.push({
      agentAddress: tx.sender,
      operation,
      feeAmount: amount.toString(),
      feeAsset: extractAssetSymbol(change.coinType),
      feeRate,
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
    });
  }

  return transfers;
}
