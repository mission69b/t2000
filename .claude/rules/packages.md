# Package Rules

The stack is **7 packages**, always released together at the same version:
`@t2000/{sdk,cli,mcp,id,serve,sui-x402,discovery}` (dialect dir = `packages/x402`; npm name `sui-x402` — `@t2000/x402` is an unpublish tombstone).

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

- **DEPRECATED** (SPEC_T2_KILL_STDIO, 2026-08-02) — the local stdio server is
  retired. The MCP surface is hosted Passport Connect
  (`audric/apps/mcp`, `https://mcp.t2000.ai/mcp`); its tool registry is
  `audric/apps/mcp/lib/tools.ts`. This package stays in the release lockstep
  (frozen, deprecation README) until the next major batches its removal —
  do not add tools here.
- Scope: `mcp`

## @t2000/id (packages/id)

- Agent ID — `agent_id::registry` client. Joined the release lockstep at `5.7.0`.
- Scope: `id`

## @t2000/serve (packages/serve)

- Merchant-side x402 router — wrap any API for agent payments. Joined at `10.1.0`.
- Scope: `serve`

## @t2000/sui-x402 (packages/x402)

- The x402 payment dialect for Sui (scheme `exact`, sign-then-settle gasless
  USDC): requirements builders, header parse/verify/settle, DigestStore.
  Absorbed from `@suimpp/mpp`'s ./x402 surface 2026-08-03 (B1) — **never**
  add the mppx pay loop (Method/Credential/Receipt/WWW-Authenticate) here.
  Wire format (headers, `extra.suimpp` field names) is protocol SSOT — do
  not rebrand it.
- Scope: `x402`

## @t2000/discovery (packages/discovery)

- x402 endpoint probe (accepts[] + WWW-Authenticate) + OpenAPI paid-endpoint
  extract/validate. Absorbed from `@suimpp/discovery@0.2.2` 2026-08-03.
  Zero runtime deps; serve's integration test is the serve↔probe CI gate.
- Scope: `discovery`

## Publishing

**Use `/release`.** The process is mandatory and documented in
`CLAUDE.md § Release process`: trigger `release.yml` via
`gh workflow run release.yml --field bump=<patch|minor|major>`, which bumps all 7
packages, commits, tags, and dispatches `publish.yml`.

**Never** bump versions by hand, push a `vX.Y.Z` tag by hand, or run
`pnpm publish` / `npm publish` locally.

Local build for development only: `pnpm --filter @t2000/<pkg> build`.

## Retired

`@t2000/engine` was deleted from the monorepo 2026-06-14 (S.442) — see
`CLAUDE.md § Critical Rules` #1 for the do-not-reintroduce guard. Historical API
detail: `git log` + `@t2000/engine@4.x` on npm.
