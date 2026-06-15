// Unified spending-limit config store (`~/.t2000/config.json`). Moved here from
// the CLI (`lib/config-store.ts`) + the SDK `SafeguardEnforcer` so ONE gate
// serves CLI + MCP + programmatic writes (closes the H5 gap — R-0 Finding 1).
//
// Node-only (uses `node:fs`) — NOT re-exported from `browser.ts`. The browser
// (Audric) write path skips client-side limits entirely; the server budget
// ledger is the cap there.
//
// Schema (`~/.t2000/config.json`):
//   { "limits": { "perTxUsd": 25, "dailyUsd": 100 },
//     "dailySpend": { "date": "2026-06-15", "usd": 12.5 } }
//
// `daily` is CUMULATIVE across all outbound writes (send + swap + pay) since
// midnight UTC — matches the engine's `autonomousDailyLimit` + the user mental
// model ("$100/day total", not "$100 per send"). Locked S.424.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface LimitsConfig {
  /** Caps any single outbound write (send | swap | pay) by USD value. */
  perTxUsd?: number;
  /** Caps CUMULATIVE outbound spend (all writes) per UTC day, by USD value. */
  dailyUsd?: number;
}

export interface DailySpend {
  /** UTC date `YYYY-MM-DD` the running total applies to. */
  date: string;
  /** USD spent so far on `date`. */
  usd: number;
}

export interface LimitsFile {
  limits?: LimitsConfig;
  dailySpend?: DailySpend;
}

const DEFAULT_CONFIG_DIR = join(homedir(), '.t2000');

export function resolveConfigPath(configDir?: string): string {
  return join(configDir ?? DEFAULT_CONFIG_DIR, 'config.json');
}

/** UTC date `YYYY-MM-DD`. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function readLimitsFile(configDir?: string): LimitsFile {
  const path = resolveConfigPath(configDir);
  try {
    return sanitize(JSON.parse(readFileSync(path, 'utf-8')));
  } catch {
    return {};
  }
}

/**
 * Write the limits + dailySpend keys, PRESERVING any other keys already on
 * disk (a config file may carry unrelated data). Mode 0600.
 */
export function writeLimitsFile(file: LimitsFile, configDir?: string): string {
  const path = resolveConfigPath(configDir);
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    existing = {};
  }
  // Drop the dead v3 SafeguardEnforcer keys if present (maxPerTx/maxDailySend/
  // dailyUsed/dailyResetDate/locked) — they were never read by v4 and are
  // replaced by `limits` + `dailySpend`.
  for (const dead of ['maxPerTx', 'maxDailySend', 'dailyUsed', 'dailyResetDate', 'locked']) {
    delete existing[dead];
  }
  const merged: Record<string, unknown> = { ...existing };
  if (file.limits && (file.limits.perTxUsd !== undefined || file.limits.dailyUsd !== undefined)) {
    merged.limits = file.limits;
  } else {
    delete merged.limits;
  }
  if (file.dailySpend) merged.dailySpend = file.dailySpend;
  else delete merged.dailySpend;

  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
  return path;
}

export function getLimits(configDir?: string): LimitsConfig | undefined {
  return readLimitsFile(configDir).limits;
}

export function hasLimits(configDir?: string): boolean {
  const l = readLimitsFile(configDir).limits;
  return !!l && (l.perTxUsd !== undefined || l.dailyUsd !== undefined);
}

/** Merge-set limits (only provided fields change). Returns the written path. */
export function setLimits(limits: LimitsConfig, configDir?: string): string {
  const file = readLimitsFile(configDir);
  const merged: LimitsConfig = { ...file.limits };
  if (limits.perTxUsd !== undefined) merged.perTxUsd = limits.perTxUsd;
  if (limits.dailyUsd !== undefined) merged.dailyUsd = limits.dailyUsd;
  return writeLimitsFile({ ...file, limits: merged }, configDir);
}

/** Remove all limits (keeps the dailySpend ledger). Returns the written path. */
export function clearLimits(configDir?: string): string {
  const file = readLimitsFile(configDir);
  return writeLimitsFile({ ...file, limits: undefined }, configDir);
}

/** Cumulative USD spent so far today (0 when the ledger is from a prior day). */
export function dailySpentToday(configDir?: string): number {
  const { dailySpend } = readLimitsFile(configDir);
  if (!dailySpend || dailySpend.date !== todayUtc()) return 0;
  return dailySpend.usd;
}

/** Add `usd` to today's running total (resets on UTC date rollover). */
export function recordDailySpend(usd: number, configDir?: string): void {
  if (!Number.isFinite(usd) || usd <= 0) return;
  const file = readLimitsFile(configDir);
  const today = todayUtc();
  const prior = file.dailySpend && file.dailySpend.date === today ? file.dailySpend.usd : 0;
  writeLimitsFile({ ...file, dailySpend: { date: today, usd: prior + usd } }, configDir);
}

function sanitize(raw: unknown): LimitsFile {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: LimitsFile = {};

  if (typeof r.limits === 'object' && r.limits !== null) {
    const l = r.limits as Record<string, unknown>;
    const limits: LimitsConfig = {};
    if (typeof l.perTxUsd === 'number' && l.perTxUsd > 0) limits.perTxUsd = l.perTxUsd;
    // Migrate the legacy `dailySendUsd` (v4 CLI, per-send sub-cap) → `dailyUsd`
    // (cumulative all-writes). New canonical key wins if both are present.
    if (typeof l.dailyUsd === 'number' && l.dailyUsd > 0) limits.dailyUsd = l.dailyUsd;
    else if (typeof l.dailySendUsd === 'number' && l.dailySendUsd > 0) limits.dailyUsd = l.dailySendUsd;
    if (limits.perTxUsd !== undefined || limits.dailyUsd !== undefined) out.limits = limits;
  }

  if (typeof r.dailySpend === 'object' && r.dailySpend !== null) {
    const d = r.dailySpend as Record<string, unknown>;
    if (typeof d.date === 'string' && typeof d.usd === 'number' && d.usd >= 0) {
      out.dailySpend = { date: d.date, usd: d.usd };
    }
  }

  return out;
}
