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

import { getDecimalsForCoinType, resolveSymbol, SUI_TYPE } from '../token-registry.js';

/**
 * Coarse action bucket — one of `'send' | 'lending' | 'swap' |
 * 'transaction'`. Used by the ACI `action` filter on the
 * `transaction_history` tool. STABLE: downstream queries depend on
 * exactly these values.
 *
 * Order matters: more specific buckets first. Lending patterns precede
 * swap patterns so a NAVI `::swap` helper (if one ever existed) would
 * still bucket as lending.
 */
export const KNOWN_TARGETS: readonly [RegExp, string][] = [
  [/::suilend|::obligation/, 'lending'],
  [/::navi|::lending_core|::incentive_v\d+|::oracle_pro/, 'lending'],
  /**
   * DEX modules — both direct calls and aggregator legs. The Cetus
   * aggregator dispatches through a per-DEX module (e.g.
   * `cetus::swap`, `flowx_amm::swap`, `aftermath::swap`, …) plus
   * router glue functions. We list every DEX module the aggregator
   * supports today so a single-DEX call still classifies cleanly.
   */
  [/::cetus(?:_dlmm)?::|::pool::|::deepbook|::flowx_(?:amm|clmm)::|::kriya_(?:amm|clmm)::|::turbos::|::aftermath::|::afsui::|::bluefin::|::bluemove::|::ferra_(?:clmm|dlmm)::|::haedal_hmm::|::hasui::|::hawal::|::magma::|::momentum::|::obric::|::springsui::|::steamm_cpmm::|::fullsail::|::alphafi::|::volo_swap::/, 'swap'],
  /**
   * Cetus aggregator router glue. These are the swap-context and
   * balance-handling helpers the aggregator emits around per-DEX
   * legs. Without this entry a tx that ONLY had router calls
   * (theoretically possible for setup/cleanup) would slip through;
   * in practice these always coexist with a DEX leg, but the entry
   * is cheap insurance.
   */
  [/::router::(?:new_swap_context(?:_v)?|confirm_swap|transfer_balance|take_balance|transfer_or_destroy_coin)/, 'swap'],
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
 * Last-resort fallback when neither `LABEL_PATTERNS` nor the action
 * bucket produces something useful.
 *
 * Returns the first MoveCall's *module* name (e.g. "navi", "spam") so
 * the card shows something better than the literal word "transaction".
 * When no MoveCall exists, returns 'on-chain'.
 *
 * Note: callers should prefer `classifyLabel` which now layers
 * pattern-match → coarse action → module name (see commentary there).
 */
export function fallbackLabel(targets: string[]): string {
  if (!targets.length) return 'on-chain';
  const first = targets[0];
  const parts = first.split('::');
  if (parts.length >= 2 && parts[1]) return parts[1].toLowerCase();
  return 'on-chain';
}

/**
 * Three-tier label resolution for the transaction history card:
 *   1. Specific keyword match in `LABEL_PATTERNS` ("deposit",
 *      "payment_link", …).
 *   2. Coarse action bucket from `classifyAction` ("swap", "send",
 *      "lending") — prevents leaking opaque internal module names like
 *      "router" (Cetus aggregator) or "cross_swap" (third-party DEX
 *      aggregators) for txs that we already classified as a swap.
 *   3. Module name from the first MoveCall (`fallbackLabel`) — only
 *      used when the action bucket itself is the generic "transaction".
 *
 * Pre-v0.46.2 we skipped tier 2, so swaps showed labels like "router",
 * "cross_swap", "scallop_router", etc. instead of the clean "swap".
 */
export function classifyLabel(targets: string[], commandTypes: string[]): string {
  for (const target of targets) {
    for (const [pattern, label] of LABEL_PATTERNS) {
      if (pattern.test(target)) return label;
    }
  }
  if (commandTypes.includes('TransferObjects') && !commandTypes.includes('MoveCall')) return 'send';
  const action = classifyAction(targets, commandTypes);
  if (action !== 'transaction') return action;
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

/**
 * Direction of the user's net non-gas movement for this transaction.
 *
 *   - `'out'` — the user spent the asset (sends, deposits, repays,
 *     swap-in, payment-link payouts).
 *   - `'in'`  — the user received the asset (withdraws, borrows,
 *     swap-out, claims, deposits credited from another wallet).
 *
 * Used by the `TransactionHistoryCard` to choose the `+`/`−` sign and
 * color. Direction is computed from the actual on-chain balance change
 * — never from the textual label — so opaque action types (`'router'`,
 * `'cross_swap'`, …) still render the correct sign.
 */
export type TxDirection = 'in' | 'out';

export interface ExtractedTransfer {
  amount?: number;
  asset?: string;
  recipient?: string;
  direction?: TxDirection;
}

/**
 * Extracts the principal amount/asset/direction for a transaction
 * from its `balanceChanges`.
 *
 * Algorithm:
 *   1. Restrict to the user's *own* balance changes.
 *   2. Prefer non-SUI changes (gas-only SUI deltas are noise).
 *   3. Pick the change with the largest absolute value — the "principal".
 *   4. If no non-SUI change exists, fall back to the largest SUI change
 *      so pure-SUI transfers (stake/unstake/native send) still render.
 *   5. Direction follows the sign of the principal.
 *   6. Recipient is set only on outflows, by finding a matching inflow
 *      on a *non-user* address with the same coinType.
 *
 * Pre-v0.46.2 this function only inspected outflows, so withdraws,
 * borrows, claims, swap-receives and payment-link receives all
 * rendered with no amount on the rich card (and with a wrong sign,
 * because the card guessed direction from the label string).
 */
export function extractTransferDetails(
  changes: ClassifyBalanceChange[] | undefined,
  sender: string,
): ExtractedTransfer {
  if (!changes || changes.length === 0) return {};

  const userChanges = changes.filter((c) => resolveOwner(c.owner) === sender);
  if (userChanges.length === 0) return {};

  const userNonSui = userChanges.filter((c) => c.coinType !== SUI_TYPE);
  const pool = userNonSui.length > 0 ? userNonSui : userChanges;

  let primary = pool[0];
  let primaryAbs = bigintAbs(BigInt(primary.amount));
  for (let i = 1; i < pool.length; i++) {
    const abs = bigintAbs(BigInt(pool[i].amount));
    if (abs > primaryAbs) {
      primary = pool[i];
      primaryAbs = abs;
    }
  }

  const raw = BigInt(primary.amount);
  if (raw === 0n) return {};

  const decimals = getDecimalsForCoinType(primary.coinType);
  const amount = Number(primaryAbs) / 10 ** decimals;
  const asset = resolveSymbol(primary.coinType);
  const direction: TxDirection = raw < 0n ? 'out' : 'in';

  let recipient: string | undefined;
  if (direction === 'out') {
    const recipientChange = changes.find(
      (c) =>
        resolveOwner(c.owner) !== sender &&
        c.coinType === primary.coinType &&
        BigInt(c.amount) > 0n,
    );
    recipient = recipientChange ? resolveOwner(recipientChange.owner) ?? undefined : undefined;
  }

  return { amount, asset, recipient, direction };
}

function bigintAbs(n: bigint): bigint {
  return n < 0n ? -n : n;
}
