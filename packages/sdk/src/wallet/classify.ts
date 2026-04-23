/**
 * Shared transaction classifier.
 *
 * Consumed by both the SDK's `parseTxRecord` (production agent path) and
 * the engine's `transaction_history` tool (cold-start RPC path). Keeping
 * a single source of truth here prevents the two paths from drifting —
 * see v1.5.3 regression where the SDK path was emitting `action:
 * 'transaction'` (rendered as "On-chain") while the engine path was
 * already producing fine-grained labels.
 */

import { SUI_TYPE } from '../token-registry.js';

/**
 * Coarse action bucket — one of `'send' | 'lending' | 'swap' |
 * 'transaction'`. Used by the ACI `action` filter on the
 * `transaction_history` tool. STABLE: downstream queries depend on
 * exactly these values.
 */
export const KNOWN_TARGETS: readonly [RegExp, string][] = [
  [/::suilend|::obligation/, 'lending'],
  [/::navi|::lending_core|::incentive_v\d+|::oracle_pro/, 'lending'],
  [/::cetus|::pool/, 'swap'],
  [/::deepbook/, 'swap'],
  [/::transfer::public_transfer/, 'send'],
];

/**
 * Finer-grained display labels — derived from MoveCall function names.
 * The card renders `label ?? action`, so when this map matches we get
 * "Deposit" / "Withdraw" / "Borrow" / "Repay" / "Payment link" instead
 * of the generic "Lending" or "Transaction".
 *
 * Order matters: more specific patterns first. Each entry is
 * (regex, label) where the regex is matched against the
 * fully-qualified MoveCall target `pkg::module::function`.
 */
export const LABEL_PATTERNS: readonly [RegExp, string][] = [
  [/::pay(?:ment_kit|_kit)?::|::create_payment_link|::pay_link/, 'payment_link'],
  [/::create_invoice|::invoice::/, 'invoice'],
  [/::deposit|::supply|::mint_ctokens/, 'deposit'],
  [/::withdraw|::redeem|::redeem_ctokens/, 'withdraw'],
  [/::borrow/, 'borrow'],
  [/::repay/, 'repay'],
  [/::claim_reward|::claim::|::claim_incentive/, 'claim'],
  [/::stake/, 'stake'],
  [/::unstake|::burn::/, 'unstake'],
  [/::liquidate/, 'liquidate'],
];

export interface ClassifyBalanceChange {
  owner: { AddressOwner?: string } | string;
  coinType: string;
  amount: string;
}

function resolveOwner(owner: ClassifyBalanceChange['owner']): string | null {
  if (typeof owner === 'object' && owner.AddressOwner) return owner.AddressOwner;
  if (typeof owner === 'string') return owner;
  return null;
}

export function classifyAction(targets: string[], commandTypes: string[]): string {
  for (const target of targets) {
    for (const [pattern, label] of KNOWN_TARGETS) {
      if (pattern.test(target)) return label;
    }
  }
  if (commandTypes.includes('TransferObjects') && !commandTypes.includes('MoveCall')) return 'send';
  return 'transaction';
}

/**
 * Fallback label when no `LABEL_PATTERNS` match.
 *
 * Returns the first MoveCall's *module* name (e.g. "navi", "cetus",
 * "spam") so the card shows something more useful than the literal
 * word "transaction". When no MoveCall exists, returns 'on-chain'
 * instead — strictly more informative than "transaction".
 */
export function fallbackLabel(targets: string[]): string {
  if (!targets.length) return 'on-chain';
  const first = targets[0];
  const parts = first.split('::');
  if (parts.length >= 2 && parts[1]) return parts[1].toLowerCase();
  return 'on-chain';
}

export function classifyLabel(targets: string[], commandTypes: string[]): string {
  for (const target of targets) {
    for (const [pattern, label] of LABEL_PATTERNS) {
      if (pattern.test(target)) return label;
    }
  }
  if (commandTypes.includes('TransferObjects') && !commandTypes.includes('MoveCall')) return 'send';
  return fallbackLabel(targets);
}

/**
 * Balance-direction tiebreaker for ambiguous lending calls.
 *
 * Many lending modules expose generic entry points (NAVI's bundled
 * flash actions, `lending_core::*::entry_*`, etc.) that don't carry
 * a `deposit`/`withdraw`/`borrow`/`repay` keyword in the function
 * name. When `classifyLabel` falls back to a bare module name like
 * `"lending"` for a known lending tx, infer direction from the user's
 * non-SUI balance change:
 *   - net outflow of the supplied asset → deposit (also covers repay,
 *     but repay-without-keyword is essentially never emitted).
 *   - net inflow of the supplied asset → withdraw (also covers borrow).
 * SUI is excluded so gas-only transactions don't get mislabeled.
 *
 * If `LABEL_PATTERNS` matched a specific keyword, the existing label is
 * returned unchanged.
 */
export function refineLendingLabel(
  currentAction: string,
  currentLabel: string,
  moveCallTargets: string[],
  changes: ClassifyBalanceChange[],
  address: string,
): string {
  if (currentAction !== 'lending') return currentLabel;
  const labelMatchedSpecific = LABEL_PATTERNS.some(([p]) =>
    moveCallTargets.some((t) => p.test(t)),
  );
  if (labelMatchedSpecific) return currentLabel;

  const userNonSuiOutflow = changes.find(
    (c) => resolveOwner(c.owner) === address && c.coinType !== SUI_TYPE && BigInt(c.amount) < 0n,
  );
  if (userNonSuiOutflow) return 'deposit';

  const userNonSuiInflow = changes.find(
    (c) => resolveOwner(c.owner) === address && c.coinType !== SUI_TYPE && BigInt(c.amount) > 0n,
  );
  if (userNonSuiInflow) return 'withdraw';

  return currentLabel;
}

export interface ClassifyResult {
  action: string;
  label: string;
}

export function classifyTransaction(
  moveCallTargets: string[],
  commandTypes: string[],
  balanceChanges: ClassifyBalanceChange[],
  address: string,
): ClassifyResult {
  const action = classifyAction(moveCallTargets, commandTypes);
  const baseLabel = classifyLabel(moveCallTargets, commandTypes);
  const label = refineLendingLabel(action, baseLabel, moveCallTargets, balanceChanges, address);
  return { action, label };
}
