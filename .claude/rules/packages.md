# Package Rules

The stack is **5 packages**, always released together at the same version:
`@t2000/{sdk,cli,mcp,id,serve}`.

## @t2000/sdk (packages/sdk)

- Entry: `src/index.ts`
- Exports: Agent class, account types, transaction builders
- Write surface: **send** (gasless USDC/USDsui) · **swap** (Cetus) · **pay** (x402).
  No DeFi builders — NAVI/lending left the SDK 2026-06-14.
- All public functions need explicit return types
- Scope: `sdk`

## @t2000/cli (packages/cli)

- Entry: `src/index.ts` → Commander.js. Bin: `t2` (primary) + `t2000` (alias).
- A **wallet + payments** surface: `send`, `swap`, `pay`, `balance`, `receive`,
  `history`, `services`, `limit`, `verify`, `connect`, `mcp`, `skills`, `init`.
- Keep output consistent with existing commands; test with `--help` / `--dry-run`.
- Scope: `cli`

## @t2000/mcp (packages/mcp)

- Wraps the **SDK wallet** — a wallet + payments surface, not a DeFi surface.
- Uses `@modelcontextprotocol/sdk`.
- Skill bodies from `t2000-skills/skills/` are baked into the bundle at build time
  and exposed as `skill-<name>` MCP prompts.
- Test with: `claude mcp add --transport stdio t2000 -- npx @t2000/mcp`
- Scope: `mcp`

> Tool counts go stale — read `packages/mcp/src/tools/` for the live list rather
> than quoting a number.

## @t2000/id (packages/id)

- Agent ID — `agent_id::registry` client. Joined the release lockstep at `5.7.0`.
- Scope: `id`

## @t2000/serve (packages/serve)

- Merchant-side x402 router — wrap any API for agent payments. Joined at `10.1.0`.
- Scope: `serve`

## Publishing

**Use `/release`.** The process is mandatory and documented in
`CLAUDE.md § Release process`: trigger `release.yml` via
`gh workflow run release.yml --field bump=<patch|minor|major>`, which bumps all 5
packages, commits, tags, and dispatches `publish.yml`.

**Never** bump versions by hand, push a `vX.Y.Z` tag by hand, or run
`pnpm publish` / `npm publish` locally.

Local build for development only: `pnpm --filter @t2000/<pkg> build`.

## Retired

`@t2000/engine` was deleted from the monorepo 2026-06-14 (S.442) — see
`CLAUDE.md § Engine — RETIRED` for the do-not-reintroduce guard. Historical API
detail: `git log` + `@t2000/engine@4.x` on npm.
