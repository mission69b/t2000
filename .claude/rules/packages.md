# Package Rules

## @t2000/cli (packages/cli)

- Entry: `src/index.ts` → Commander.js. Bin: `t2` (primary) + `t2000` (alias).
- Post-v4 (S.336) the CLI is a **wallet + payments** surface: `send`, `swap`, `pay`, `balance`, `receive`, `history`, `services`, `limit`, `mcp`, `skills`, `init`. The DeFi commands (`save`/`withdraw`/`borrow`/`repay`/`claim`) and Volo `stake`/`unstake` were removed — the SDK keeps those builders for programmatic use; the CLI does not expose them.
- Keep command output consistent with the existing commands; test with `--help` / `--dry-run` where applicable.
- Scope: `cli` in commit messages

## @t2000/sdk (packages/sdk)

- Entry: `src/index.ts`
- Exports: Agent class, account types, transaction builders
- All public functions need explicit return types
- Scope: `sdk` in commit messages

## @t2000/engine (packages/engine)

- Entry: `src/index.ts`. Verify the public surface against `src/index.ts` exports before documenting — many legacy names are gone (see below).
- Exports: `AISDKEngine`, `getDefaultTools`, `TOOL_POLICY`, MCP client (`McpClientManager`), streaming (`serializeSSE`/`parseSSE`), sessions, cost tracking, memory store, permission resolver.
- **Removed — do NOT cite as exports:** `AISDKAnthropicProvider` (v3.1.0), `buildMcpTools`/`registerEngineTools` (v3.0.0), `defineTool`/`buildTool` (no public tool factory), `TxMutex`/`runTools`/`EarlyToolDispatcher`/`budgetToolResult`/`engineToSSE`.
- Build: `tsup` → ESM bundle. Test: `vitest run`. All public functions need explicit return types. Scope: `engine`.
- Key files:
  - `v2/engine.ts` — `AISDKEngine` (wraps AI SDK v6).
  - `v2/tool-helpers.ts` — `wrapEngineExecute` + `buildNeedsApproval` (how tools are built — AI SDK `tool()` + these helpers; there is no `buildTool`/`defineTool` factory).
  - `v2/tool-policy.ts` — `TOOL_POLICY` registry (read/write + concurrency-safe + permission level + result budgeting).
  - `mcp/client.ts` — `McpClientManager` (backed by `@ai-sdk/mcp`; public API preserved).
  - `navi/` — NAVI MCP integration (`config.ts`, `transforms.ts`, `reads.ts`, `cache.ts`).
  - `tools/*.ts` — built-in financial tools (**26 total: 18 read + 8 write**).

## @t2000/mcp (packages/mcp)

- Post-v4 (S.336) wraps the **SDK wallet** and exposes **9 MCP tools** (5 read + 3 write + 1 limit) — a wallet + payments surface, not the engine's 26 tools and not the legacy 27-tool DeFi MCP.
- Uses `@modelcontextprotocol/sdk`
- Test with: `claude mcp add --transport stdio t2000 -- npx @t2000/mcp`
- Scope: `mcp` in commit messages

## Publishing

- Bump version in package.json
- Build: `pnpm --filter @t2000/<pkg> build`
- Publish: `npm publish` (or via GitHub Actions `publish.yml`)
- Tag: `git tag v<version>` → `git push --tags`
