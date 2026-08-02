# @t2000/mcp — DEPRECATED

> **This package is retired** (SPEC_T2_KILL_STDIO, August 2026). The one t2000
> MCP distribution is the hosted **Passport Connect** URL — nothing to install:
>
> ```json
> {
>   "mcpServers": {
>     "t2000": {
>       "url": "https://mcp.t2000.ai/mcp"
>     }
>   }
> }
> ```
>
> OAuth sign-in (Google → Passport), per-session spend limits set in the
> console, and no key in the client. Works in Claude, Cursor, ChatGPT, and any
> MCP-compatible client. Docs:
> [docs.t2000.ai/passport-connect](https://docs.t2000.ai/passport-connect).

## Migrating

- Replace any `"command": "t2000", "args": ["mcp", "start"]` or
  `"command": "npx", "args": ["-y", "@t2000/mcp@latest"]` MCP entry with the
  URL block above.
- Clean old auto-written configs in one go: `npx @t2000/cli mcp uninstall`.
- Terminal workflows use the [`@t2000/cli`](https://www.npmjs.com/package/@t2000/cli)
  (`t2`) directly — the wallet keypair at `~/.t2000/wallet.key` still works
  there; only the stdio MCP transport is gone.

Published versions of this package remain on npm for historical consumers, but
receive no further updates.

[![docs](https://img.shields.io/badge/docs-docs.t2000.ai-00D395)](https://docs.t2000.ai/passport-connect)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/mission69b/t2000/blob/main/LICENSE)
