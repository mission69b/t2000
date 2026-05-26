// [v4.0 Phase B — 2026-05-26]
// `createAgent()` for the MCP server. Pre-v4 this read a PIN from
// `~/.t2000/.session` or the `T2000_PIN` env var and used it to decrypt
// the AES wallet envelope; v4 wallets are plain Bech32 JSON (per the
// SPEC_AGENT_WALLET_GREENFIELD lock), so the PIN concept is gone.
//
// Legacy v3.x AES wallets at `~/.t2000/wallet.key` throw
// `WALLET_LEGACY_AES` from `T2000.create()` — the MCP server surfaces
// that error verbatim. Users migrate via the CLI's `t2 init --import`
// flow, not from inside MCP.

import { T2000 } from '@t2000/sdk';

export async function createAgent(keyPath?: string): Promise<T2000> {
  return T2000.create({ keyPath });
}
