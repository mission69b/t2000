/**
 * USD-aware permission resolution for write tools.
 *
 * Replaces the binary auto/confirm/explicit system with dollar-threshold
 * tiers that resolve at runtime based on the transaction value and
 * per-user configuration.
 */

export type PermissionOperation =
  | 'save'
  | 'withdraw'
  | 'send'
  | 'borrow'
  | 'repay'
  | 'swap'
  | 'pay';

export interface PermissionRule {
  operation: PermissionOperation;
  /** Auto-execute if USD amount is below this threshold. */
  autoBelow: number;
  /** Confirm if between autoBelow and this. Explicit for anything above. */
  confirmBetween: number;
}

export interface UserPermissionConfig {
  rules: PermissionRule[];
  /** Fallback auto threshold for operations without a specific rule. */
  globalAutoBelow: number;
  /** Max total USD of autonomous actions per day (safety net). */
  autonomousDailyLimit: number;
}

export const DEFAULT_PERMISSION_CONFIG: UserPermissionConfig = {
  globalAutoBelow: 10,
  autonomousDailyLimit: 200,
  rules: [
    { operation: 'save', autoBelow: 50, confirmBetween: 1000 },
    { operation: 'send', autoBelow: 10, confirmBetween: 200 },
    { operation: 'borrow', autoBelow: 0, confirmBetween: 500 },
    { operation: 'withdraw', autoBelow: 25, confirmBetween: 500 },
    { operation: 'swap', autoBelow: 25, confirmBetween: 300 },
    { operation: 'pay', autoBelow: 1, confirmBetween: 50 },
    { operation: 'repay', autoBelow: 50, confirmBetween: 1000 },
  ],
};

export const PERMISSION_PRESETS = {
  conservative: {
    globalAutoBelow: 5,
    autonomousDailyLimit: 100,
    rules: [
      { operation: 'save' as const, autoBelow: 5, confirmBetween: 100 },
      { operation: 'send' as const, autoBelow: 5, confirmBetween: 100 },
      { operation: 'borrow' as const, autoBelow: 0, confirmBetween: 100 },
      { operation: 'withdraw' as const, autoBelow: 5, confirmBetween: 100 },
      { operation: 'swap' as const, autoBelow: 5, confirmBetween: 100 },
      { operation: 'pay' as const, autoBelow: 1, confirmBetween: 25 },
      { operation: 'repay' as const, autoBelow: 5, confirmBetween: 100 },
    ],
  },
  balanced: DEFAULT_PERMISSION_CONFIG,
  aggressive: {
    globalAutoBelow: 25,
    autonomousDailyLimit: 500,
    rules: [
      { operation: 'save' as const, autoBelow: 100, confirmBetween: 2000 },
      { operation: 'send' as const, autoBelow: 25, confirmBetween: 500 },
      // [F14 / 2026-05-03] Was `autoBelow: 10` — violated the absolute
      // invariant in `.cursor/rules/safeguards-defense-in-depth.mdc`:
      // "borrow always confirms (autoBelow: 0 across every preset) —
      // debt is too consequential to silently take on." A user on the
      // aggressive preset had a 6-op bundle (repay/swap/swap/save/borrow/send)
      // silently auto-execute because step[0]=`repay $2` resolved to
      // `auto` and the host gate only inspected step[0] (Bug A, fixed
      // separately on the audric host). Holding the engine constant to
      // the documented contract here is the second half of defense in
      // depth — locks every preset to `borrow.autoBelow: 0` regardless
      // of host-side bundle iteration.
      { operation: 'borrow' as const, autoBelow: 0, confirmBetween: 1000 },
      { operation: 'withdraw' as const, autoBelow: 50, confirmBetween: 1000 },
      { operation: 'swap' as const, autoBelow: 50, confirmBetween: 500 },
      { operation: 'pay' as const, autoBelow: 5, confirmBetween: 100 },
      { operation: 'repay' as const, autoBelow: 100, confirmBetween: 2000 },
    ],
  },
} satisfies Record<string, UserPermissionConfig>;

/**
 * True when `to` matches a saved contact's address (case-insensitive,
 * normalized). Used by `resolvePermissionTier` to enforce the
 * "first-send to a new raw address always confirms" rule and to keep
 * the engine + client in sync.
 */
export function isKnownContactAddress(
  to: string,
  contacts: ReadonlyArray<{ address: string }>,
): boolean {
  if (!to) return false;
  const normalized = to.trim().toLowerCase();
  return contacts.some((c) => c.address.trim().toLowerCase() === normalized);
}

/**
 * Resolve the permission tier for a given operation + USD value.
 *
 * [v1.4] When `sessionSpendUsd` is supplied and adding the incoming
 * `amountUsd` would push cumulative session spend over
 * `config.autonomousDailyLimit`, an otherwise-`auto` tier is downgraded to
 * `confirm`. This is the runtime guard for the daily autonomous spend cap.
 * Tiers above `auto` are returned unchanged.
 *
 * Send-safety rule: when `operation === 'send'` and the destination
 * address is a raw `0x...` (i.e. NOT one of the user's saved contacts),
 * an otherwise-`auto` tier is downgraded to `confirm` regardless of
 * amount. This bounds the "LLM/user typo silently ships funds" failure
 * mode to a single confirmation per recipient — once saved as a contact,
 * subsequent sends to the same address auto-approve under tier as normal.
 */
export function resolvePermissionTier(
  operation: string,
  amountUsd: number,
  config: UserPermissionConfig,
  sessionSpendUsd?: number,
  sendContext?: {
    to?: string;
    contacts?: ReadonlyArray<{ address: string }>;
  },
): 'auto' | 'confirm' | 'explicit' {
  const rule = config.rules.find((r) => r.operation === operation);
  const autoBelow = rule?.autoBelow ?? config.globalAutoBelow;
  const confirmBetween = rule?.confirmBetween ?? 1000;

  let tier: 'auto' | 'confirm' | 'explicit';
  if (amountUsd < autoBelow) tier = 'auto';
  else if (amountUsd < confirmBetween) tier = 'confirm';
  else tier = 'explicit';

  if (
    tier === 'auto' &&
    typeof sessionSpendUsd === 'number' &&
    sessionSpendUsd + amountUsd > config.autonomousDailyLimit
  ) {
    tier = 'confirm';
  }

  // Send-safety: a *raw* 0x recipient that doesn't match a saved
  // contact forces confirm. Contact names (e.g. `to: "wallet1"`) are
  // already trusted — the user explicitly saved that contact — and get
  // resolved to addresses downstream by `effects.resolveContact`. Without
  // the `0x` guard, a contact-name send was incorrectly demoted to
  // confirm because `isKnownContactAddress("wallet1", contacts)` compares
  // the name against contact *addresses* and returns false.
  if (
    tier === 'auto' &&
    operation === 'send' &&
    sendContext?.to &&
    sendContext.to.startsWith('0x') &&
    !isKnownContactAddress(sendContext.to, sendContext.contacts ?? [])
  ) {
    tier = 'confirm';
  }

  return tier;
}

const TOOL_TO_OPERATION: Record<string, PermissionOperation> = {
  save_deposit: 'save',
  withdraw: 'withdraw',
  send_transfer: 'send',
  borrow: 'borrow',
  repay_debt: 'repay',
  swap_execute: 'swap',
  pay_api: 'pay',
  volo_stake: 'save',
  volo_unstake: 'withdraw',
};

export function toolNameToOperation(toolName: string): PermissionOperation | undefined {
  return TOOL_TO_OPERATION[toolName];
}

/**
 * Resolve the USD value of a tool call from its inputs.
 * USDC-denominated tools return 1:1. Others multiply by the price cache.
 */
export function resolveUsdValue(
  toolName: string,
  input: Record<string, unknown>,
  priceCache: Map<string, number>,
): number {
  switch (toolName) {
    case 'save_deposit':
    case 'withdraw':
    case 'repay_debt':
    case 'borrow':
      return safeNum(input.amount);

    case 'send_transfer': {
      const amount = safeNum(input.amount);
      const asset = String(input.asset ?? 'USDC').toUpperCase();
      if (asset === 'USDC' || asset === 'USDT') return amount;
      return amount * (priceCache.get(asset) ?? 0);
    }

    case 'swap_execute': {
      const amount = safeNum(input.fromAmount);
      const fromAsset = String(input.fromAsset ?? '').toUpperCase();
      if (fromAsset === 'USDC' || fromAsset === 'USDT') return amount;
      return amount * (priceCache.get(fromAsset) ?? 0);
    }

    case 'pay_api':
      return safeNum(input.maxCost ?? input.price);

    case 'volo_stake':
    case 'volo_unstake':
      return safeNum(input.amount) * (priceCache.get('SUI') ?? 0);

    default:
      return 0;
  }
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
