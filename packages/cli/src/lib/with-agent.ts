// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// Single entry point for every command that needs a live agent. Centralises:
//   - legacy v3.x wallet detection (banner + exit-1)
//   - WALLET_NOT_FOUND translation ("run `t2 init`")
//   - other T2000Error surfaces
//
// Replaces the ~20 boilerplate blocks that each old command had for
// pin-resolve + T2000.create + try/catch.

import process from 'node:process';
import { T2000 } from '@t2000/sdk';
import {
  checkForLegacyWallet,
  formatLegacyWalletBanner,
} from './legacy-wallet-detect.js';

export interface WithAgentOptions {
  keyPath?: string;
  rpcUrl?: string;
}

/**
 * Resolve a live `T2000` agent, or print a clean error and exit 1.
 *
 * Pre-flight order:
 *   1. If wallet path holds a v3.x AES file → print recovery banner + exit 1.
 *   2. Otherwise call `T2000.create({ keyPath, rpcUrl })`.
 *   3. Any T2000Error → print message + exit 1.
 */
export async function withAgent(options: WithAgentOptions = {}): Promise<T2000> {
  try {
    if (await checkForLegacyWallet(options.keyPath)) {
      const path = options.keyPath ?? '~/.t2000/wallet.key';
      process.stderr.write(formatLegacyWalletBanner(path));
      process.exit(1);
    }
    return await T2000.create({
      keyPath: options.keyPath,
      rpcUrl: options.rpcUrl,
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'WALLET_LEGACY_AES') {
      const path = options.keyPath ?? '~/.t2000/wallet.key';
      process.stderr.write(formatLegacyWalletBanner(path));
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Pure variant — does the same pre-flight check but returns a tagged
 * result instead of exiting. Used in tests + by helpers that want to
 * compose error handling themselves.
 */
export type AgentResult =
  | { kind: 'ok'; agent: T2000 }
  | { kind: 'legacy'; banner: string }
  | { kind: 'error'; error: Error };

export async function tryWithAgent(options: WithAgentOptions = {}): Promise<AgentResult> {
  try {
    if (await checkForLegacyWallet(options.keyPath)) {
      const path = options.keyPath ?? '~/.t2000/wallet.key';
      return { kind: 'legacy', banner: formatLegacyWalletBanner(path) };
    }
    const agent = await T2000.create({
      keyPath: options.keyPath,
      rpcUrl: options.rpcUrl,
    });
    return { kind: 'ok', agent };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'WALLET_LEGACY_AES') {
      const path = options.keyPath ?? '~/.t2000/wallet.key';
      return { kind: 'legacy', banner: formatLegacyWalletBanner(path) };
    }
    return { kind: 'error', error: error as Error };
  }
}
