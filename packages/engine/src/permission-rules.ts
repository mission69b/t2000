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
      { operation: 'borrow' as const, autoBelow: 10, confirmBetween: 1000 },
      { operation: 'withdraw' as const, autoBelow: 50, confirmBetween: 1000 },
      { operation: 'swap' as const, autoBelow: 50, confirmBetween: 500 },
      { operation: 'pay' as const, autoBelow: 5, confirmBetween: 100 },
      { operation: 'repay' as const, autoBelow: 100, confirmBetween: 2000 },
    ],
  },
} satisfies Record<string, UserPermissionConfig>;

/**
 * Resolve the permission tier for a given operation + USD value.
 *
 * [v1.4] When `sessionSpendUsd` is supplied and adding the incoming
 * `amountUsd` would push cumulative session spend over
 * `config.autonomousDailyLimit`, an otherwise-`auto` tier is downgraded to
 * `confirm`. This is the runtime guard for the daily autonomous spend cap.
 * Tiers above `auto` are returned unchanged.
 */
export function resolvePermissionTier(
  operation: string,
  amountUsd: number,
  config: UserPermissionConfig,
  sessionSpendUsd?: number,
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
    return 'confirm';
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
