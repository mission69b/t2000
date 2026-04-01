# Package Rules

## @t2000/cli (packages/cli)

- Entry: `src/index.ts` → Commander.js
- All command output must match `CLI_UX_SPEC.md`
- Test every command with `--help`, `--dry-run` where applicable
- Scope: `cli` in commit messages

## @t2000/sdk (packages/sdk)

- Entry: `src/index.ts`
- Exports: Agent class, account types, transaction builders
- All public functions need explicit return types
- Scope: `sdk` in commit messages

## @t2000/engine (packages/engine)

- Entry: `src/index.ts`
- Exports: QueryEngine, AnthropicProvider, buildTool, runTools, getDefaultTools, MCP client/server, streaming, sessions, cost tracking
- Build: `tsup` → ESM bundle
- Test: `vitest run` (166 tests, 13 suites)
- All public functions need explicit return types
- Scope: `engine` in commit messages
- Key files:
  - `engine.ts` — QueryEngine class
  - `tool.ts` — buildTool factory
  - `orchestration.ts` — runTools, TxMutex
  - `mcp-client.ts` — McpClientManager
  - `navi-*.ts` — NAVI MCP integration (config, transforms, reads)
  - `tools/*.ts` — built-in financial tools

## @t2000/mcp (packages/mcp)

- Exposes t2000 capabilities as MCP tools for AI clients
- Uses `@modelcontextprotocol/sdk`
- Test with: `claude mcp add --transport stdio t2000 -- npx @t2000/mcp`
- Scope: `mcp` in commit messages

## Publishing

- Bump version in package.json
- Build: `pnpm --filter @t2000/<pkg> build`
- Publish: `npm publish` (or via GitHub Actions `publish.yml`)
- Tag: `git tag v<version>` → `git push --tags`
