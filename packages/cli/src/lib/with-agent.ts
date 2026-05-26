// Single entry point for every command that needs a live agent. Wraps
// `T2000.create({ keyPath, rpcUrl })` with `WALLET_NOT_FOUND` translation
// (prints "run `t2 init`") and other T2000Error surfaces.
//
// Replaces the ~20 boilerplate try/catch blocks that each old command
// had for pin-resolve + T2000.create + error handling.

import { T2000 } from '@t2000/sdk';

export interface WithAgentOptions {
  keyPath?: string;
  rpcUrl?: string;
}

/**
 * Resolve a live `T2000` agent. Throws on failure — caller is expected
 * to pass the error through `handleError()` for clean exit-1.
 */
export async function withAgent(options: WithAgentOptions = {}): Promise<T2000> {
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
    const agent = await T2000.create({
      keyPath: options.keyPath,
      rpcUrl: options.rpcUrl,
    });
    return { kind: 'ok', agent };
  } catch (error) {
    return { kind: 'error', error: error as Error };
  }
}
