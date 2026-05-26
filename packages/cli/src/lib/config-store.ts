// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// Read/write `~/.t2000/config.json` — spending limits only. No PIN, no
// session, no safeguard `locked` flag. Defaults to "no limits set"; the
// `t2 limit set` command is the opt-in path.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface LimitsConfig {
  perTxUsd?: number;
  dailySendUsd?: number;
}

export interface CliConfig {
  limits?: LimitsConfig;
}

const DEFAULT_CONFIG_PATH = '~/.t2000/config.json';

function expandPath(p: string): string {
  if (p.startsWith('~')) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

export async function readConfig(configPath?: string): Promise<CliConfig> {
  const filePath = expandPath(configPath ?? DEFAULT_CONFIG_PATH);
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return sanitizeConfig(parsed);
  } catch {
    return {};
  }
}

export async function writeConfig(config: CliConfig, configPath?: string): Promise<string> {
  const filePath = expandPath(configPath ?? DEFAULT_CONFIG_PATH);
  await mkdir(dirname(filePath), { recursive: true });
  const sanitized = sanitizeConfig(config);
  await writeFile(filePath, JSON.stringify(sanitized, null, 2), { mode: 0o600 });
  return filePath;
}

export async function configExists(configPath?: string): Promise<boolean> {
  const filePath = expandPath(configPath ?? DEFAULT_CONFIG_PATH);
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure mutators — return a new config object, do NOT touch disk. The
 * CLI command layer composes them with `readConfig` / `writeConfig`.
 */
export function setLimits(config: CliConfig, limits: LimitsConfig): CliConfig {
  const merged: LimitsConfig = { ...config.limits };
  if (limits.perTxUsd !== undefined) merged.perTxUsd = limits.perTxUsd;
  if (limits.dailySendUsd !== undefined) merged.dailySendUsd = limits.dailySendUsd;
  return { ...config, limits: merged };
}

export function clearLimits(config: CliConfig): CliConfig {
  const { limits: _, ...rest } = config;
  return rest;
}

export function hasLimits(config: CliConfig): boolean {
  return (
    config.limits !== undefined &&
    (config.limits.perTxUsd !== undefined || config.limits.dailySendUsd !== undefined)
  );
}

function sanitizeConfig(raw: unknown): CliConfig {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: CliConfig = {};

  if (typeof r.limits === 'object' && r.limits !== null) {
    const l = r.limits as Record<string, unknown>;
    const limits: LimitsConfig = {};
    if (typeof l.perTxUsd === 'number' && l.perTxUsd > 0) limits.perTxUsd = l.perTxUsd;
    if (typeof l.dailySendUsd === 'number' && l.dailySendUsd > 0) limits.dailySendUsd = l.dailySendUsd;
    if (limits.perTxUsd !== undefined || limits.dailySendUsd !== undefined) out.limits = limits;
  }

  return out;
}
