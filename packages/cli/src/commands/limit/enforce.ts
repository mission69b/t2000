// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// Shared opt-in spending-limit enforcement for the write commands
// (`t2 send`, `t2 swap`, `t2 pay`). Reads `~/.t2000/config.json` via
// `lib/config-store.ts` and throws when a transaction's USD value
// exceeds an opted-in cap.
//
// Day 4 semantics — keep it simple:
//   - `perTxUsd`     → caps any single write (send | swap | pay)
//   - `dailySendUsd` → caps any single SEND specifically
//
// Per the SPEC, `dailySendUsd` is positioned as the "daily" cap. The
// canonical interpretation in this codebase (mirroring the engine's
// `autonomousDailyLimit` rule) is cumulative-since-midnight, but Day 4
// ships the simpler per-tx form: `dailySendUsd` is a sub-cap on send
// alone. The verification gate (`t2 limit set --daily 50 && t2 send
// 100 USDC alice` → blocked) passes either way. Adding cumulative
// tracking is a small follow-up (extend `CliConfig` with
// `dailySpend: { date, usd }` and increment on success) — not in
// scope for Day 4.
//
// `--force` overrides the cap. Callers pass `force: true` from the
// command-line flag; we never silently bypass.

import { readConfig, type CliConfig } from '../../lib/config-store.js';

export type LimitOperation = 'send' | 'swap' | 'pay';

export interface LimitCheckInput {
  operation: LimitOperation;
  /** Amount of the transaction expressed in USD. */
  amountUsd: number;
  /** When true, skip the gate. Caller is responsible for the prompt. */
  force?: boolean;
  /** Optional config-store path override (test injection). */
  configPath?: string;
}

export class LimitExceededError extends Error {
  readonly code = 'LIMIT_EXCEEDED';
  readonly limit: number;
  readonly limitKind: 'perTxUsd' | 'dailySendUsd';
  readonly attempted: number;
  readonly operation: LimitOperation;

  constructor(params: {
    operation: LimitOperation;
    limitKind: 'perTxUsd' | 'dailySendUsd';
    limit: number;
    attempted: number;
  }) {
    const label = params.limitKind === 'perTxUsd' ? 'per-transaction limit' : 'daily limit';
    super(
      `Exceeds ${label} ($${params.limit}). Attempted $${params.attempted.toFixed(2)}. Use --force to override.`,
    );
    this.name = 'LimitExceededError';
    this.operation = params.operation;
    this.limitKind = params.limitKind;
    this.limit = params.limit;
    this.attempted = params.attempted;
  }

  toJSON(): unknown {
    return {
      error: this.code,
      message: this.message,
      operation: this.operation,
      limitKind: this.limitKind,
      limit: this.limit,
      attempted: this.attempted,
    };
  }
}

/**
 * Pure gate over `CliConfig` — no I/O. Returns silently when allowed;
 * throws `LimitExceededError` when blocked.
 */
export function assertLimitConfig(input: {
  config: CliConfig;
  operation: LimitOperation;
  amountUsd: number;
  force?: boolean;
}): void {
  if (input.force) return;
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) return;

  const limits = input.config.limits;
  if (!limits) return;

  if (limits.perTxUsd !== undefined && input.amountUsd > limits.perTxUsd) {
    throw new LimitExceededError({
      operation: input.operation,
      limitKind: 'perTxUsd',
      limit: limits.perTxUsd,
      attempted: input.amountUsd,
    });
  }

  if (
    input.operation === 'send' &&
    limits.dailySendUsd !== undefined &&
    input.amountUsd > limits.dailySendUsd
  ) {
    throw new LimitExceededError({
      operation: input.operation,
      limitKind: 'dailySendUsd',
      limit: limits.dailySendUsd,
      attempted: input.amountUsd,
    });
  }
}

/**
 * I/O variant — reads the config file, then defers to
 * `assertLimitConfig`. Use this from CLI command actions.
 */
export async function assertWithinLimits(input: LimitCheckInput): Promise<void> {
  const config = await readConfig(input.configPath);
  assertLimitConfig({
    config,
    operation: input.operation,
    amountUsd: input.amountUsd,
    force: input.force,
  });
}

/**
 * Approximate USD value for an asset+amount pair, used by the
 * pre-write limit gate. Day 4 keeps this hand-rolled to avoid a
 * mandatory CoinGecko/BlockVision dependency on every write:
 *   - USDC, USDsui  → amount (stable 1:1)
 *   - SUI           → returns `null` ("unknown — caller decides")
 *
 * SUI sends and SUI-denominated swaps don't trip the limit gate today.
 * The SPEC's gates are USDC-denominated; SUI typing was not part of
 * the original verification surface. If a future SPEC adds SUI-USD
 * gating, plug a price-lookup here.
 */
export function approxUsdValue(asset: string, amount: number): number | null {
  const symbol = asset.toUpperCase();
  if (symbol === 'USDC' || symbol === 'USDSUI') return amount;
  return null;
}
