# Package Rules

## @t2000/cli (packages/cli)

- Entry: `src/index.ts` → Commander.js. Bin: `t2` (primary) + `t2000` (alias).
- Post-v4 (S.336) the CLI is a **wallet + payments** surface: `send`, `swap`, `pay`, `balance`, `receive`, `history`, `services`, `limit`, `mcp`, `skills`, `init`. The DeFi commands (`save`/`withdraw`/`borrow`/`repay`/`claim`) and Volo `stake`/`unstake` were removed. **NAVI / DeFi has since left `@t2000/sdk` entirely (2026-06-14)** — the SDK write surface is now send (gasless USDC/USDsui), swap (Cetus), pay (x402); there are no DeFi builders to expose.
- Keep command output consistent with the existing commands; test with `--help` / `--dry-run` where applicable.
- Scope: `cli` in commit messages

## @t2000/sdk (packages/sdk)

- Entry: `src/index.ts`
- Exports: Agent class, account types, transaction builders
- All public functions need explicit return types
- Scope: `sdk` in commit messages

## @t2000/engine (packages/engine) — RETIRED

> **⚠️ HISTORICAL (2026-06-14):** `@t2000/engine` was retired and **deleted** from the monorepo. There is no `packages/engine` here anymore and no future engine releases. The already-published `@t2000/engine@4.x` remains on npm for the frozen legacy Audric app. New work composes the Vercel AI SDK directly over `@t2000/sdk`. The detail below is kept for lineage only and no longer describes anything in this repo.
>
> Former exports / key files (historical): `AISDKEngine`, `getDefaultTools`, `TOOL_POLICY`, `McpClientManager`, sessions, cost tracking, memory store, permission resolver; `v2/*`, `mcp/client.ts`, `navi/`, `tools/*.ts` (26 tools: 18 read + 8 write).

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
