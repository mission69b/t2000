# Architecture Rules

## Two-brand strategy

- **t2000** = infrastructure brand (CLI, SDK, MCP, gateway, contracts). Never rename.
- **Audric** = consumer brand (audric.ai website, app, extension). Separate repo.
- **suimpp** = protocol brand (suimpp.dev). Already separate.

The consumer product (Audric) imports `@t2000/engine` and `@t2000/sdk` from npm.

## MCP-first integration

- All DeFi protocol reads go through MCP (NAVI MCP: `https://open-api.naviprotocol.io/api/mcp`)
- All DeFi protocol writes use thin transaction builders (`@mysten/sui` Transaction class)
- Do NOT add new protocol SDK dependencies (`@naviprotocol/lending`, `@suilend/sdk`, `@cetusprotocol/*`)
- When a new protocol releases an MCP server, connect to it — no SDK needed

## Product boundaries

- Savings, Pay, Send, Credit, Receive = the five products
- Invest and Swap are REMOVED — do not re-add
- Gateway is infrastructure behind Pay, not a consumer product

## @t2000/engine (planned)

New package implementing agent engine patterns (from Claude Code analysis):
- QueryEngine: stateful conversation manager, async generator loop
- buildTool(): financial tool factory with permissions + concurrency classification
- runTools(): parallel (read-only) / serial (mutating) orchestration
- MCP client: connect to protocol MCPs
- MCP server: expose financial tools to Claude Desktop, Cursor, etc.

See `spec/CLAUDE_CODE_LEVERAGE.md` for full design.
