# Loop state - orphan + doc-staleness sweep

> The memory for the orphan-sweep loop (`.cursor/rules/orphan-sweep.mdc`). Lives in the t2000 repo (public) so the CI loop can read AND write it (the loop branch carries the update). Read at start, write before finishing. The agent forgets; this file does not.
>
> **Scope:** the CI loop (`.github/workflows/orphan-sweep-loop.yml`) sweeps **t2000 only** (CI checks out one repo). The private `spec/` doc-staleness sweep (tracker/roadmap/handoff) is done by an occasional **local** full-workspace run (`agent -p --force` from the workspace root that has `spec/` mounted) or by hand.

## Last run

2026-06-15 (run #3, CI maker) — swept NAVI/engine comment orphans from S.444-S.450 cutover: removed dead `@naviprotocol/lending` Dependabot ignore, updated stale tsup bundle rationale comments (CLI/MCP), refreshed SDK suins/suins-leaf header comments + `token-data-architecture.mdc` + `.cursor/rules/README.md` engine rows. Gate green after `@t2000/sdk` build (fresh checkout has no `dist/` — CI publish job builds first; the loop workflow should ensure this).

## Removed-symbol patterns being watched (regression guards)

Removed in the S.444-S.450 cutover; must NOT reappear in live t2000 code. Mirror this list in `scripts/loops/orphan-sweep-gate.sh` `STALE_PATTERNS`; extend both when a new removal lands.

- `@t2000/engine` (package retired/deleted S.442) - only the published `@t2000/engine@4.4.0` on npm + intentional historical mentions are allowed.
- `src/adapters/` + `from '...adapters'` (NAVI adapter framework, S.444).
- `@naviprotocol/lending`, `@pythnetwork/pyth-sui-js` (deps removed S.444/S.448).
- `protocolFee` / `addFeeTransfer` / `calculateFee` (fee helper removed; swap fees use the Cetus overlay).
- `ContactManager` / `contactName` (contacts removed S.449 - resolveRecipient is hex|SuiNS only).
- `createSuiClient` (dead JSON-RPC factory removed at the gRPC flip).
- `isTier1`/`isTier2`/`isSupported`/`getTier` + `tier` field (token tiers removed S.449).
- `SAVEABLE_ASSETS`, `OPERATION_ASSETS.save/borrow/withdraw/repay` (DeFi op config removed).
- `gasReserve` / `.total` on BalanceResponse (reshaped to `sui {amount,usdValue}` / `totalUsd`, S.449).
- `transactionBlocks(` / `transactionBlock(` GraphQL queries (old schema; live is `transactions`/`transaction`, S.450).
- `bpsToPercent` / `BPS_DENOMINATOR` (dead fee-math util removed S.449).

## Lessons learned (write here, not in chat)

- 2026-06-15 (run #3): comment-only orphans survive deletion longest — grep `packages/engine` in `.ts` file headers and `.mdc` rule tables, not just imports/deps. The stale-scan still surfaces `@t2000/engine` in `suins.ts` as an intentional historical mention ("promoted from the deleted engine"); that's fine.
- 2026-06-15: a removal's CI footprint is separate from publish CI - the "Adapter Compliance" job in `.github/workflows/ci.yml` failed every push for ~6 commits while `publish.yml` (own CI) stayed green. Always grep `.github/workflows/` for the removed dir/symbol.
- 2026-06-15: the SDK GraphQL history bug hid behind `?? []` (swallowed the schema-validation error as empty history). Lesson: surface errors, never `?? []` a network result.
- 2026-06-15: `pnpm lint` (turbo, all) fails on `@t2000/docs` (mintlify, node 25 + network) - the gate lints code packages only (sdk/cli/mcp/ui), matching CI.
- 2026-06-15: CLI `program.integration.test.ts` is timing-flaky + load-correlated (fails under the gate's CPU load, passes standalone). The gate runs CLI UNIT tests only (`vitest run --exclude '**/*.integration.test.ts'`); CI + the weekly `gateway-e2e` are the authoritative integration gates.
- 2026-06-15 (run #2): branch push succeeded but the PR-API call was rejected - `mission69b` is an ORG that disallows "Actions create/approve PRs" (409, can't override at repo level). Fix: the workflow now PUSHES the gate-green branch + prints a one-click PR link instead of calling the PR API (needs only `contents:write`). Upgrade path to auto-draft-PR = enable the org setting (see orphan-sweep.mdc). Lesson: prefer the lowest-permission mechanism that works under existing policy over flipping an org-wide security setting for one loop.
- 2026-06-15 (run #1): the maker edited `.github/workflows/release-ui.yml` → `create-pull-request` push was REJECTED ("refusing to allow a GitHub App to create or update workflow ... without `workflows` permission"). The default `GITHUB_TOKEN` cannot push workflow-file changes — by design. Fix: workflows are now a hard-no for the maker + a deterministic "strip workflow edits" step runs before the gate. Lesson: the agent + gate worked; the only failure was infra-permission on a file it shouldn't touch.
- 2026-06-15: **harness = GitHub Actions + Cursor CLI** (not the `@cursor/sdk` library - it pulls puppeteer + sqlite3 and the native sqlite3 binding has no build for node 25). The CLI is a standalone binary; CI runs node 22 where everything works. Pin node via `.nvmrc`.

## Open items / candidates (investigate next run)

- **HUMAN TASK (loop won't touch workflows):** `.github/workflows/security.yml` lines 38–41 still reference `@naviprotocol/lending` / `@pythnetwork/pyth-sui-js` in a comment ("dropping @naviprotocol/lending — a separate cleanup. Until…") — reconcile now that the dep is gone.
- **HUMAN TASK (loop won't touch workflows):** run #1's maker tried to edit `.github/workflows/release-ui.yml` — investigate whether it has a stale ref (the loop is now barred from editing `.github/workflows/*`, so this must be done by hand).
- **HUMAN TASK (gate infra):** fresh checkout gate fails typecheck/tests until `pnpm --filter @t2000/sdk build` — confirm the orphan-sweep-loop workflow builds SDK before the gate (publish CI already does).
- **KNOWN-DEFERRED (NOT orphans — leave them):**
  - `apps/docs/agent-engine.mdx` + `apps/docs/README.md` — intentional **retired** deprecation stubs (clearly labeled; `@t2000/engine@4.x` stays on npm for frozen legacy Audric).
  - `apps/web` (the `t2000.ai` marketing site) still markets `@t2000/engine` as a product - `app/data/t2k.ts`, `components/engine/EngineHero.tsx` + `EngineCloser.tsx`, `components/site/ProductStrip.tsx`, `home/Showcase.tsx` + `Pricing.tsx`, `docs/page.tsx`, `TabbedTerminal.tsx`, `sdk/SdkHeroCode.tsx`. Stale (engine retired S.442) BUT intentionally deferred to the ONE launch-batch site rewrite (`spec/active/SITE_REPOSITIONING_BRIEF.md` §2c + §3 Pass 1). Do NOT clean piecemeal. The stale scan will keep surfacing it; expected until the rewrite.

## Harness

- **CI (primary):** `.github/workflows/orphan-sweep-loop.yml` - Cursor CLI in print mode (`agent -p --force`), edits only; the workflow runs the gate (deterministic checker), then pushes `loop/orphan-sweep` + prints a one-click PR link in the run summary (the org disallows Actions opening PRs via API — see lesson below). `workflow_dispatch` first; `schedule` enabled after manual runs are trusted. Needs the `CURSOR_API_KEY` repo secret.
- **Local (both-repos, occasional):** `agent -p --force "<orphan-sweep prompt>"` from the workspace root that contains `spec/` - the only way to also sweep the private spec docs. Review + commit by hand.

## Stop conditions

- Gate green (`scripts/loops/orphan-sweep-gate.sh` exits 0) -> the workflow pushes `loop/orphan-sweep` + prints a PR link. A human reviews the diff, opens + merges (the approval gate). Phase 2: add a cheap-model verifier sub-agent before the push.
