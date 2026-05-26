// `createAgent()` for the MCP server. v4 wallets are plain Bech32 JSON
// (no PIN, no AES, no .session file). This is a pure passthrough to
// `T2000.create({ keyPath })`. Wallet errors propagate verbatim:
//   - WALLET_NOT_FOUND → user runs `t2 init`
//   - WALLET_CORRUPT   → user moves/deletes the file + runs `t2 init`

import { T2000 } from '@t2000/sdk';

export async function createAgent(keyPath?: string): Promise<T2000> {
  return T2000.create({ keyPath });
}
