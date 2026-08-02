// The unified spending-limit gate. ONE enforcer for CLI + MCP + programmatic
// writes — wired into the T2000 write paths (send / swap / pay), so every
// surface that calls those methods inherits the same cap (closes H5).
//
// USD-denominated. `perTxUsd` caps any single write; `dailyUsd` caps the
// CUMULATIVE spend across all writes since UTC midnight (the running total
// lives in the `dailySpend` ledger). `force` bypasses both — the caller owns
// the prompt/consent.

import {
  type LimitsConfig,
  type DailySpend,
  getLimits,
  setLimits,
  clearLimits,
  hasLimits,
  dailySpentToday,
  recordDailySpend,
  todayUtc,
} from './config.js';
import { LimitExceededError, type LimitOperation } from './errors.js';

/**
 * Best-effort USD value for an asset+amount pair, for the limit gate. Stables
 * are 1:1; SUI (and anything else) returns `null` — "unknown, don't gate".
 * The limits are USD-denominated; SUI-USD gating would need a price lookup and
 * is intentionally out of scope (matches the prior CLI behavior).
 */
export function approxUsdValue(asset: string, amount: number): number | null {
  const symbol = asset.toUpperCase();
  if (symbol === 'USDC' || symbol === 'USDSUI') return amount;
  return null;
}

/**
 * Pure gate — no I/O. Returns silently when allowed; throws
 * `LimitExceededError` when blocked.
 */
export function assertLimitConfig(input: {
  limits: LimitsConfig | undefined;
  spentTodayUsd: number;
  operation: LimitOperation;
  amountUsd: number;
  force?: boolean;
}): void {
  if (input.force) return;
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) return;
  const { limits } = input;
  if (!limits) return;

  if (limits.perTxUsd !== undefined && input.amountUsd > limits.perTxUsd) {
    throw new LimitExceededError({
      operation: input.operation,
      limitKind: 'perTxUsd',
      limit: limits.perTxUsd,
      attempted: input.amountUsd,
    });
  }

  if (limits.dailyUsd !== undefined && input.spentTodayUsd + input.amountUsd > limits.dailyUsd) {
    throw new LimitExceededError({
      operation: input.operation,
      limitKind: 'dailyUsd',
      // The cap is total/day; report the cap (attempted is THIS write's USD).
      limit: limits.dailyUsd,
      attempted: input.spentTodayUsd + input.amountUsd,
    });
  }
}

export interface LimitAssertInput {
  operation: LimitOperation;
  /** This write's USD value. Pass 0 / non-positive to skip (e.g. SUI sends). */
  amountUsd: number;
  /** When true, skip the gate. */
  force?: boolean;
}

/**
 * The spending-limit enforcer — reads/writes `~/.t2000/config.json` (or a
 * `configDir` override for tests). Constructed once by the T2000 agent and
 * called around every outbound write; also drives the CLI `t2 limit` commands.
 */
export class LimitEnforcer {
  constructor(private readonly configDir?: string) {}

  /** Throws `LimitExceededError` when the write exceeds an opted-in cap. */
  assert(input: LimitAssertInput): void {
    assertLimitConfig({
      limits: getLimits(this.configDir),
      spentTodayUsd: dailySpentToday(this.configDir),
      operation: input.operation,
      amountUsd: input.amountUsd,
      force: input.force,
    });
  }

  /** Add a settled write's USD value to today's cumulative total. */
  record(amountUsd: number): void {
    recordDailySpend(amountUsd, this.configDir);
  }

  getLimits(): LimitsConfig | undefined {
    return getLimits(this.configDir);
  }

  hasLimits(): boolean {
    return hasLimits(this.configDir);
  }

  setLimits(limits: LimitsConfig): void {
    setLimits(limits, this.configDir);
  }

  clearLimits(): void {
    clearLimits(this.configDir);
  }

  dailySpentToday(): number {
    return dailySpentToday(this.configDir);
  }
}

/**
 * In-memory enforcer for signer-mode agents (`T2000.fromZkLogin` — Passport
 * Connect / hosted MCP). Same gate semantics, ZERO disk I/O: serverless homes
 * are unwritable (Lambda: `ENOENT mkdir '/home/sbx_user…/.t2000'`), which made
 * `record()` after a SETTLED pay/swap fail the whole tool call. Connect spends
 * are gated server-side (`authorizeSpend` per-job/daily/ask-above) — the file
 * limits in `~/.t2000/config.json` remain the keypair-agent (CLI/stdio) gate.
 * Limits start unset (matching a fresh config file); a host that wants
 * client-side caps on top can still `setLimits()` — they live for the
 * process/session only.
 */
export class MemoryLimitEnforcer extends LimitEnforcer {
  private limitsMem: LimitsConfig | undefined;
  private spend: DailySpend = { date: todayUtc(), usd: 0 };

  override assert(input: LimitAssertInput): void {
    assertLimitConfig({
      limits: this.limitsMem,
      spentTodayUsd: this.dailySpentToday(),
      operation: input.operation,
      amountUsd: input.amountUsd,
      force: input.force,
    });
  }

  override record(amountUsd: number): void {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return;
    const today = todayUtc();
    const prior = this.spend.date === today ? this.spend.usd : 0;
    this.spend = { date: today, usd: prior + amountUsd };
  }

  override getLimits(): LimitsConfig | undefined {
    return this.limitsMem;
  }

  override hasLimits(): boolean {
    const l = this.limitsMem;
    return !!l && (l.perTxUsd !== undefined || l.dailyUsd !== undefined);
  }

  override setLimits(limits: LimitsConfig): void {
    const merged: LimitsConfig = { ...this.limitsMem };
    if (limits.perTxUsd !== undefined) merged.perTxUsd = limits.perTxUsd;
    if (limits.dailyUsd !== undefined) merged.dailyUsd = limits.dailyUsd;
    this.limitsMem = merged;
  }

  override clearLimits(): void {
    this.limitsMem = undefined;
  }

  override dailySpentToday(): number {
    return this.spend.date === todayUtc() ? this.spend.usd : 0;
  }
}
