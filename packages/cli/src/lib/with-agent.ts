// Single entry point for every command that needs a live agent. Wraps
// `T2000.create({ keyPath, rpcUrl })` with `WALLET_NOT_FOUND` translation
// (prints "run `t2 init`") and other T2000Error surfaces.
//
// Replaces the ~20 boilerplate try/catch blocks that each old command
// had for pin-resolve + T2000.create + error handling.

import { T2000 } from '@t2000/sdk';
import { assertSigningHostAllowed, isAllowUntrustedApi } from './tx-guard.js';

/**
 * Host pin at the wallet door (S.930).
 *
 * `runSponsoredTx` refuses an untrusted host before it signs, but by then a
 * command like `job hire` has already resolved an agent ref and uploaded a
 * spec THROUGH that host. Since no command can sign without loading the
 * wallet, refusing here stops an injected `T2000_API_URL` at the top of every
 * signing path instead of halfway down one.
 *
 * Only the env var is checked here — it is the injected case and is
 * process-global. An operator-typed `--api` is still caught at signing time.
 */
function assertEnvApiHostTrusted(): void {
  const envBase = process.env.T2000_API_URL;
  if (!envBase) {
    return;
  }
  assertSigningHostAllowed(envBase, isAllowUntrustedApi());
}

export interface WithAgentOptions {
  keyPath?: string;
  rpcUrl?: string;
}

/**
 * Resolve a live `T2000` agent. Throws on failure — caller is expected
 * to pass the error through `handleError()` for clean exit-1.
 */
export async function withAgent(options: WithAgentOptions = {}): Promise<T2000> {
  assertEnvApiHostTrusted();
  return T2000.create({
    keyPath: options.keyPath,
    rpcUrl: options.rpcUrl,
  });
}

/**
 * Pure variant — returns a tagged result instead of throwing. Used in
 * tests + by helpers that want to compose error handling themselves.
 */
export type AgentResult =
  | { kind: 'ok'; agent: T2000 }
  | { kind: 'error'; error: Error };

export async function tryWithAgent(options: WithAgentOptions = {}): Promise<AgentResult> {
  try {
    assertEnvApiHostTrusted();
    const agent = await T2000.create({
      keyPath: options.keyPath,
      rpcUrl: options.rpcUrl,
    });
    return { kind: 'ok', agent };
  } catch (error) {
    return { kind: 'error', error: error as Error };
  }
}
