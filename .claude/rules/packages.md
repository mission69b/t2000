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
- Exports: AISDKEngine, AISDKAnthropicProvider, defineTool, getDefaultTools, MCP client/server, streaming, sessions, cost tracking
- Build: `tsup` → ESM bundle
- Test: `vitest run`
- All public functions need explicit return types
- Scope: `engine` in commit messages
- Key files:
  - `v2/engine.ts` — AISDKEngine class (wraps AI SDK v6 `streamText`)
  - `v2/define-tool.ts` — defineTool factory (replaces deleted `buildTool` from 1.38.0)
  - `v2/tool-policy.ts` — TOOL_POLICY registry (isReadOnly + isConcurrencySafe + permissionLevel)
  - `providers/ai-sdk-anthropic.ts` — AISDKAnthropicProvider (replaces deleted `AnthropicProvider` from v2.0.0)
  - `orchestration.ts` — legacy `runTools` + `TxMutex` (still exported for back-compat with non-AISDKEngine callers; v2 engine doesn't use them)
  - `mcp-client.ts` — McpClientManager (internally backed by `@ai-sdk/mcp` since v2.1.0; public API preserved)
  - `navi-*.ts` — NAVI MCP integration (config, transforms, reads)
  - `tools/*.ts` — built-in financial tools (37 total: 25 read + 12 write)

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
