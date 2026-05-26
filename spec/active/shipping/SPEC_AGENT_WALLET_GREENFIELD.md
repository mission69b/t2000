# SPEC — Agent Wallet Greenfield Pivot

> **Status:** 🟢 ACTIVE — Phase A DONE 2026-05-26 (S.328-S.335; 8/8 mainnet smokes); Phase B DONE 2026-05-26 (S.336 + S.339; Phase B audit S.340 clean); Simplification cut DONE 2026-05-26 (S.337); `--import` restored 2026-05-26 (S.338); Phase C DONE 2026-05-26 (S.340 — `t2` bin alongside `t2000`); Phase D DONE 2026-05-26 (S.341 — 3 package READMEs rewritten v3→v4 + `apps/web` Vercel redeploy smoke-passed: `/.well-known/agent-skills/index.json` serves 8 v4 skills, `/skills/[slug]` 22/22 smoke clean — all 8 v4 slugs 200, all 14 deleted v3 slugs 404); Phase E DONE 2026-05-26 (S.342 — 4 SPECs archived to `spec/archive/v4-greenfield/`, 4 actionable stale refs in `packages/sdk/src/{contacts.ts,contacts.test.ts,t2000.ts}` cleaned, 3 package.json descriptions+keywords refreshed v3→v4, T2000_RPC_URL + T2000_GRPC_URL env wiring verified at source + live binary; 3-package verify gate green: 889/889 tests); Phase F DONE 2026-05-26 (S.343 — `apps/docs/` Mintlify project scaffolded with flat 5-page nav per locked decision 9: `index.mdx` Quickstart + `agent-wallet.mdx` + `agent-payments.mdx` + `agent-sdk.mdx` + `agent-engine.mdx`. All 4 SPEC verification gates pass: install ≤0 clicks (inline on home); MCP setup, skills inventory, gateway catalog ≤1 click each via CardGroup. Structural smoke: docs.json valid JSON, 5/5 nav pages resolve to files, all internal /agent-* cross-page + anchor links resolve. `pnpm install` clean — `mintlify@4.2.577` installed; only React peer warnings (non-blocking). `mintlify validate` live build deferred: monorepo Node 25 incompatible with Mintlify LTS requirement — documented in `apps/docs/README.md`; Mintlify hosted CI will run it on first deploy). Next: Phase G (publish `@t2000/{sdk,cli,mcp}@4.0.0` + bump engine version-locked) + founder-side Mintlify project creation + CNAME `developers.t2000.ai`.
> **Detailed plan:** [`.cursor/plans/agentic_wallet_pivot_spec_111d2729.plan.md`](../../../.cursor/plans/agentic_wallet_pivot_spec_111d2729.plan.md) — the full ~9-10 day execution plan with file paths, code snippets, and verification gates
> **Successor to:** `SPEC_AGENTIC_STACK.md` (Phase 5 absorbed). Phases 1-4 of that SPEC are still shipped + valid; only the marketing/README sweep folds into this pivot's Phase D
> **Trigger:** Founder review of `agents.circle.com` + `circlefin/skills` + `circlefin/cli` (2026-05-26) — *"the cli is doing TOO MUCH... rip all defi capabilities out... only make it a agentic wallet with payments (mpp) and ability to send, receive... circle docs i shared in the previous prompt was also to review it just incase you missed something with the pivot spec... we should also remove the pin from cli... we have safeguards i think remove them also to simplify the onboarding... full rewrite might be better and really strip out everything and only keep what we actually need."*
> **Bundle release:** `@t2000/{sdk,cli,mcp}@4.0.0` major. **Engine 4.0.0 is version-locked, no breaking changes** — engine surface unchanged. The major bump is coordinated only.

---

## What this SPEC is

A coordinated rewrite of the CLI + adjacent surfaces around one focused product story: **an Agent Wallet that sends, receives, swaps, and pays MPP services.** No DeFi (save/withdraw/borrow/repay/yields/positions/rebalance — all out). No PIN. No default safeguards. Stablecoins are first-class (USDC + USDsui both supported, neither defaulted). Sui's new gasless stablecoin transfer (`0x2::balance::send_funds`) is plumbed through `t2 send` + `t2 pay` so zero-SUI agents can transact. Brand restructures to a 4-sub-product family under **AFI (Agentic Finance Infrastructure)**: Agent Wallet / Agent Payments / Agent SDK / Agent Engine.

The full design (file-by-file scope, verification gates, locked decisions, rejected paths) lives in the plan document at `.cursor/plans/agentic_wallet_pivot_spec_111d2729.plan.md`. This SPEC is the canonical pointer + tracker.

---

## Locked decisions (from plan-mode design 2026-05-26)

1. **Greenfield CLI rewrite** (not a strip). `packages/cli/src/` rebuilt from scratch around 9 command groups. UX inspired by Circle's `@circle-fin/cli` (`wallet` / `send` / `receive` / `swap` / `pay` / `services` / `limit` / `mcp` / `skills` + singletons `init` / `export` / `balance` / `version`). No banking metaphor.
2. **`t2` is the canonical binary name** (alongside `t2000` as alias for back-compat). Help text + all 15 SKILL.md bash blocks use `t2 <verb>`. Brand/repo/url names stay `t2000`.
3. **PIN removed entirely.** New wallets are plain Bech32 JSON files with `0o600` perms (matches Sui CLI). **Revised 2026-05-26 (S.337 + S.338):** the legacy-wallet *detection* apparatus is gone — v3 AES files at the default path throw a generic `WALLET_CORRUPT` error directing the user to move/delete the file. `t2 init --import [secret]` IS supported (restored in S.338) as a clean Bech32 import primitive — interactive hidden-input prompt when invoked without a value, direct flag when invoked with one (with a shell-history warning). The `--import` flow is NOT a v3-AES decrypt path — users with v3 wallets need to export from the legacy v3 binary first, then paste the Bech32 secret into v4. Same secret → same address, so funds carry over.
4. **Default safeguards removed.** `t2 init` ships with no spending limits + prints a warning footer ("No spending limits set. Run `t2 limit set --daily 100` to add them."). The `t2 limit` command group is the opt-in path.
5. **Stablecoin neutrality.** SDK `OPERATION_ASSETS.send` constrained to `['USDC', 'USDsui', 'SUI']`. `t2 send` requires an explicit asset flag — there is NO USDC default. The other 5 Sui-native gasless stables (USDT, USDY, BUIDL, FDUSD, agUSD per `docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers`) are deferred — explicit founder decision to keep the CLI surface narrow and add them via a follow-up SPEC when there's user demand.
6. **gRPC for `send` + `pay` only.** `SuiGrpcClient` plumbed through `packages/sdk/src/utils/sui.ts` (new `getSuiGrpcClient()` cached singleton alongside `getSuiClient()`). Used in `packages/sdk/src/wallet/send.ts` for the `0x2::balance::send_funds()` Move call that enables gasless transfers. Reads stay on `SuiJsonRpcClient` (the audric/web-v2 host already pins on it; full migration is its own SPEC, calendar-driven by Mysten's July 2026 JSON-RPC deactivation deadline).
7. **MPP recipe skills DELETED.** All 4 `mpp-*` skills shipped in S.326 are removed. Founder Path A decision (2026-05-26) — they're "marketing material disguised as skills." Unique operational guidance folds into a new "Advanced patterns" section on `t2000-pay`. Marketing site cards handle discovery + virality.
8. **Brand: AFI umbrella, 4 sub-products.** `t2000 AFI Inc` legal entity registers as `Agentic Finance Infrastructure Inc`. Consumer-facing copy uses the full word "Agent" (not "Agentic") for sub-products: **Agent Wallet** (`@t2000/cli` + `@t2000/mcp` + `t2000-skills` unified) / **Agent Payments** (`mpp.t2000.ai` + `suimpp.dev` + x402) / **Agent SDK** (`@t2000/sdk`) / **Agent Engine** (`@t2000/engine`). MCP + Skills are NOT separate brands — they're integration surfaces of Agent Wallet, mirrored on the docs site as anchor links on the Agent Wallet page.
9. **Mintlify nav is flat (5 top-level items).** Quickstart + Agent Wallet + Agent Payments + Agent SDK + Agent Engine. No sub-tree expansion. Every key destination (install, MCP setup, skills inventory, gateway catalog) ≤1 click from home. Mirrors Circle's `developers.circle.com/agent-stack` flat structure.
10. **`t2000-skills/README.md` rewritten Circle-style.** Skills inventory + MCP setup unified on one page (matches `circlefin/skills` README pattern). Replaces the current split between README + the `t2000-mcp` SKILL.

---

## Phases (~9-10 days)

| Phase | What | Effort | Status |
|---|---|---|---|
| **A** | CLI greenfield rewrite + gRPC/gasless | ~3-4d (took 6 sessions / ~14h) | ✅ **DONE 2026-05-26** (S.328-S.335; 8/8 mainnet smokes) |
| **B** | Skills + MCP cross-package consistency sweep | ~1.5-2d | ✅ **DONE 2026-05-26** (S.336 + S.339; audit S.340 clean) |
| **C** | Binary rename `t2` alongside `t2000` | ~0.5d | ✅ **DONE 2026-05-26** (S.340 — dual-bin `{t2,t2000}` in `packages/cli/package.json`; argv basename audit clean; 2 new integration tests assert both bins point at same dist entry; live npm-install-g smoke confirmed both resolve identical output) |
| **D** | Brand + repo health sweep (absorbs Phase 5 of `SPEC_AGENTIC_STACK`) | ~1d | ✅ **DONE 2026-05-26** (S.341 — `packages/{cli,sdk,mcp}/README.md` rewritten v3→v4 + `apps/web` Vercel redeploy. Live manifest at `t2000.ai/.well-known/agent-skills/index.json` regenerated 2026-05-26T05:27:53Z, serves 8 v4 skills. 22/22 per-slug smoke pass: all 8 v4 slugs `200`, all 14 deleted v3 slugs `404`.) |
| **E** | Test + spec cleanup + RPC invariant verification | ~0.5d | ✅ **DONE 2026-05-26** (S.342 — 4 SPECs archived to new `spec/archive/v4-greenfield/` (3 v3-smokes + SPEC_AGENTIC_STACK Phase-5-absorbed); 4 actionable stale CLI-command refs in `packages/sdk/src/{contacts.ts,contacts.test.ts,t2000.ts}` cleaned (`t2000 contacts add`, `t2000 save`, `t2000 fund` → SuiNS/generic guidance); 3 package.json descriptions + keywords refreshed v3→v4 (`@t2000/cli` drops `defi`+`navi`, adds `gasless`+`mcp`+`usdsui`; `@t2000/sdk` re-narrates around gasless+swap+programmatic-NAVI; `@t2000/mcp` 29→9 tools + 15→8 prompts + adds Windsurf); T2000_RPC_URL + T2000_GRPC_URL env wiring verified at source (`resolveRpcUrl`/`resolveGrpcUrl` URL-keyed caches in `packages/sdk/src/utils/sui.ts`) + live binary smoke (bogus URL produced `fetch failed` confirming env honored); 3-package verify gate green: SDK 612/612 + MCP 64/64 + CLI 213/213 = 889/889 tests, typecheck clean, lint 0 errors.) |
| **F** | `developers.t2000.ai` via Mintlify | ~1d | ✅ **DONE 2026-05-26** (S.343 — new `apps/docs/` workspace member with `docs.json` flat 5-page nav (locked decision 9 honored: Quickstart + Agent Wallet + Agent Payments + Agent SDK + Agent Engine, no sub-tree expansion); each `.mdx` curated from its canonical source README — `index.mdx` from `t2000-skills/README.md` quickstart, `agent-wallet.mdx` from `packages/cli/README.md` + `packages/mcp/README.md` + `t2000-skills/README.md`, `agent-payments.mdx` from `apps/gateway/README.md` + `packages/cli/README.md`, `agent-sdk.mdx` from `packages/sdk/README.md`, `agent-engine.mdx` from `packages/engine/README.md` + CLAUDE.md 4-system Audric Intelligence narrative; `docs/REPO_LAYOUT.md` updated with `apps/docs/` row + Mintlify path convention. All 4 SPEC verification gates pass: install ≤0 clicks (inline on `index.mdx`), MCP setup + skills inventory ≤1 click via `/agent-wallet#mcp-integration` / `#skills` anchor, gateway catalog ≤1 click via `/agent-payments#services`. Structural smoke clean: JSON valid, 5/5 nav pages resolve to files, all internal /agent-* cross-page + anchor links resolve. Mintlify CLI live validate deferred: monorepo Node 25 incompatible with Mintlify LTS-only requirement — documented in `apps/docs/README.md` with `nvm use 22` workaround; founder will run `mintlify validate` once before connecting Mintlify dashboard + CNAME `developers.t2000.ai`.) |
| **G** | Verify + release `@t2000/*@4.0.0` | ~0.5d | pending |

**Critical path:** A → B → C → D → E → F → G. Phase B is gated on Phase A landing (skill bash blocks reference the new command surface). Phase F is gated on Phase D (Mintlify pulls from the rewritten READMEs).

**See the plan file for the detailed per-phase task list.**

---

## What's NOT in scope (deferred follow-ups)

| Item | Lives in | Trigger |
|---|---|---|
| Remote MCP at `mcp.t2000.ai` + zkLogin auth | [`SPEC_REMOTE_MCP_AND_ZKLOGIN.md`](../SPEC_REMOTE_MCP_AND_ZKLOGIN.md) | Founder triage post-pivot. Audric's zkLogin wallet + a CLI zkLogin wallet would be two separate Sui addresses — UX fragmentation needs a design pass before shipping. |
| Marketing site (`t2000.ai`) redesign around the new brand | [`SPEC_MARKETING_SITE_REDESIGN.md`](../SPEC_MARKETING_SITE_REDESIGN.md) | After Phase G ships. Mintlify (`developers.t2000.ai`) is the developer-facing surface; the marketing site is the consumer-facing surface. Separate concern. |
| Full SDK gRPC migration (read path too) | [`SPEC_FULL_GRPC_MIGRATION.md`](../SPEC_FULL_GRPC_MIGRATION.md) | **Calendar-driven** — Mysten deactivates JSON-RPC July 2026. Open immediately post-pivot; staggered audric host migration to follow. |
| The other 5 Sui gasless stables (USDT/USDY/BUIDL/FDUSD/agUSD) | new follow-up SPEC when user demand surfaces | Concrete user request OR a partner integration that needs one of them. |
| Homepage prompts panel (6-card "with USDC, agents can..." à la `agents.circle.com`) | already deferred in plan | Founder lock after Phase G — feeds into the marketing site redesign. |

---

## What's BROKEN by this SPEC (the 4.0.0 major-bump justification)

| Surface | Before | After | Migration |
|---|---|---|---|
| `t2000 save / withdraw / borrow / repay / yields / positions / rebalance` | commands exist | **DELETED** | Use audric.ai for DeFi. CLI is wallet + payments only. |
| `t2000 init` with PIN prompt | PIN-encrypted AES wallet | Plain Bech32 JSON wallet, `0o600` perms | Legacy v3.x users (post-S.338): export the secret from the legacy v3 binary (`t2000 export`), move/delete `~/.t2000/wallet.key`, then `t2 init --import` and paste the secret. Same secret → same address. |
| `t2000 init` with default safeguards | daily/weekly/monthly limits prompted | No limits, warning footer printed | Opt-in via `t2 limit set` |
| `t2000 send 5 USDC alice.sui` | works, defaults to USDC if asset omitted | works, **errors if asset omitted** | `t2 send 5 USDC alice.sui` (explicit) |
| `t2000 send 5 USDY alice.sui` | works for any registered token | **errors — unsupported asset** | Only USDC / USDsui / SUI for now |
| `t2000 wallet holdings` | command name | `t2 wallet balance` (Circle convention) + `t2 balance` top-level | rename, alias kept short-term |
| `t2000 wallet fund` | command exists | replaced by top-level `t2 receive` | `t2 receive` prints address + QR |
| `t2000-save / t2000-withdraw / t2000-borrow / t2000-repay / t2000-yields / t2000-rebalance / t2000-receive (old) / t2000-engine` skills | 8 skills | **DELETED** | Skills 21 → 16 (deletes 8, adds `t2000-services` + new `t2000-receive`) |
| `mpp-image-gen / mpp-gpt4o / mpp-transcription / mpp-index` skills | 4 skills (shipped S.326) | **DELETED** | Patterns folded into `t2000-pay` "Advanced patterns" section |

---

## Verification (Phase G)

| Smoke | Expected |
|---|---|
| `t2 init` then `t2 balance` | wallet creates, balance shows USD totals via SuiNS RPC + SuiJsonRpcClient |
| `t2 send 5 USDC alice.sui` (zero-SUI wallet) | gasless succeeds — Sui RPC `sponsorTransaction` accepts the `0x2::balance::send_funds` Move call |
| `t2 send 5 alice.sui` | errors with `--asset required` |
| `t2 send 5 USDY alice.sui` | errors with `unsupported asset` |
| `t2 receive` | prints address + QR code (ANSI) |
| `t2 borrow 10` | errors with `unknown command 'borrow'` |
| `t2 init --import` | interactive hidden-input prompt accepts a Bech32 key + creates the wallet file (restored in S.338) |
| 4-package typecheck + test + build | all clean (~75 tests in `packages/cli`) |
| `developers.t2000.ai` smoke | install ≤1 click from home; MCP setup ≤1 click; skills inventory ≤1 click; gateway catalog ≤1 click |

---

## Tracker

| Phase | Tracker entry | Status |
|---|---|---|
| Planning | S.327 | ✅ done 2026-05-26 (this SPEC + 3 deferred follow-up stubs) |
| A | S.328-S.335 | ✅ **DONE 2026-05-26** — 6 sessions / ~14h / ~700 LoC net / 8/8 mainnet smokes / 0 regressions |
| B | S.336 + S.337 + S.338 + S.339 + S.340 (audit) | ✅ **DONE 2026-05-26** (S.336 — MCP + skills sweep; S.337 — legacy-wallet *detection* removed; S.338 — `--import` restored as clean Bech32 primitive; S.339 — `t2000-skills/README.md` Circle-style rewrite; S.340 — Phase B audit + 4 polish items bundled into Phase C). Optional MPP absorption / cross-client render verification deferred to a future slice. |
| C | S.340 | ✅ **DONE 2026-05-26** (`t2` bin shipped alongside `t2000`; tests + smoke green). |
| D | S.341 | ✅ **DONE 2026-05-26** (S.341 — code: `packages/{cli,sdk,mcp}/README.md` rewritten v3→v4 Circle-style; SDK 612/612 + MCP 64/64 + CLI 213/213 + 3-package typecheck all green; 24 cited SDK exports + 3 env vars + LICENSE + 4 NPM badge targets all verified. Redeploy: `git push origin main` triggered Vercel auto-rebake of `apps/web`; live manifest regenerated 2026-05-26T05:27:53Z with 8 v4 skills; per-slug smoke 22/22 clean — all 8 v4 slugs serve 200, all 14 deleted v3 slugs `404`. Total elapsed Phase A→D: ~16h across 14 sessions; ~1052 LoC net.) |
| E | S.342 | ✅ **DONE 2026-05-26** (S.342 — spec cleanup: 4 SPECs archived to new `spec/archive/v4-greenfield/` (`SPEC_CLI_v3_SMOKE.md` + `SPEC_MCP_v3_SMOKE.md` + `SPEC_SDK_v3_SMOKE.md` + `SPEC_AGENTIC_STACK.md`); SPEC_INVENTORY_SSOT refreshed (shipping 8→4). Test cleanup: 4 actionable stale CLI-command references in user-facing SDK strings cleaned — `packages/sdk/src/contacts.ts:122` (`t2000 contacts add` hint dropped; v3 CLI command deleted in S.332) + `packages/sdk/src/contacts.test.ts:189` (assertion flipped to `.not.toContain` for the dropped hint) + `packages/sdk/src/t2000.ts:698` (`fund()` jsdoc refreshed — `t2000 fund` CLI surface gone, `t2 receive` is v4 path) + `packages/sdk/src/t2000.ts:1107` (`No collateral` error generic-ised — dropped `t2000 save` CLI suggestion since `save` is programmatic-only in v4). Engine-side `defillama_*` historical comments left intact (intentional history per `engineering-principles.mdc`). Package.json sweep: 3 packages refreshed — `@t2000/cli` description re-narrates (drops "guided setup" false claim) + keywords drop `defi`+`navi`, add `gasless`+`mcp`+`usdsui`; `@t2000/sdk` description switches "Agentic" → "Agent" + re-narrates around gasless+swap+programmatic-NAVI, keywords add `gasless`+`cetus`+`usdsui`+`zklogin`; `@t2000/mcp` description 29→9 tools + 15→8 prompts + "Agentic" → "Agent" + adds Windsurf, keywords drop `bank` (weird), add `wallet`+`windsurf`. Engine left unchanged (already accurate post-S.277). RPC invariant: source-level verified `resolveRpcUrl()` + `resolveGrpcUrl()` in `packages/sdk/src/utils/sui.ts` honor `T2000_RPC_URL` / `T2000_GRPC_URL` env vars (explicit arg > env > default precedence, URL-keyed Map caches); 22 unit tests in `sui.test.ts` cover env handling; live binary smoke (`T2000_RPC_URL=https://does-not-exist.invalid.url.example.com t2 balance --key /tmp/...`) produced `TypeError: fetch failed` confirming env-honored end-to-end. Verify gate: SDK 612/612 + MCP 64/64 + CLI 213/213 = 889/889 tests, 3-package typecheck clean, lint 0 errors (26 pre-existing MCP `any` warnings unchanged).) |
| F | pending | |
| G | pending — bumps `@t2000/{sdk,cli,mcp}@4.0.0`; engine 4.0.0 version-locked, no break | |

### Phase A progress (per the plan's Day 1-6 breakdown) — ALL DONE

| Day | Scope | S.# | Status |
|---|---|---|---|
| 1 | CLI scaffold (`lib/{legacy-wallet-detect,config-store,with-agent,prompts}.ts`), wallet group, top-level commands; SDK keyManager v2 plain Bech32 (drops AES). | S.328 | ✅ |
| 2 | SDK gRPC/gasless rewrite — `wallet/send.ts` uses `SuiGrpcClient` + `0x2::balance::send_funds()`; `OPERATION_ASSETS.send` → `['USDC', 'USDsui', 'SUI']`. | S.329 | ✅ |
| 3 | New CLI `send` + `swap` + `pay` commands. Asset required. Zero-SUI gasless. | S.330 | ✅ |
| 4 | New CLI `services/` + `limit/` groups + opt-in spending caps + `--force` override. | S.331 | ✅ |
| 5 | New CLI `mcp/` + `skills/` folder groups; bulk DELETE of 19 legacy commands + their tests; `history.ts` migrated to `withAgent`. | S.332 | ✅ |
| 6 code | Integration smokes (+69 tests against `dist/index.js`); help-text polish; mainnet smoke runbook. | S.333 | ✅ |
| 6 audit | 3 bug fixes: MCP entry bin reversion (`t2` → `t2000` — bin doesn't exist until Phase C); `T2000_RPC_URL` + `T2000_GRPC_URL` env vars wired; package.json description refreshed. | S.334 | ✅ |
| 6 mainnet | **8 of 8 critical mainnet smokes PASSED on real Sui mainnet wallet** (zero-SUI gasless USDC + USDsui sends, Cetus swap, SUI standard-gas send, MPP pay end-to-end, limit enforcement with `--force` override). Production v3 wallet untouched throughout. | S.335 | ✅ |

---

## Cross-references

- Detailed plan: [`.cursor/plans/agentic_wallet_pivot_spec_111d2729.plan.md`](../../../.cursor/plans/agentic_wallet_pivot_spec_111d2729.plan.md)
- Predecessor SPEC: [`SPEC_AGENTIC_STACK.md`](SPEC_AGENTIC_STACK.md) (Phase 5 absorbed here)
- Predecessor audit docs (now context, not active): [`spec/active/CLI_ARCH_REVIEW_2026-05-25.md`](../CLI_ARCH_REVIEW_2026-05-25.md), [`spec/active/SDK_ARCH_REVIEW_2026-05-25.md`](../SDK_ARCH_REVIEW_2026-05-25.md)
- Deferred follow-ups: [`SPEC_REMOTE_MCP_AND_ZKLOGIN.md`](../SPEC_REMOTE_MCP_AND_ZKLOGIN.md), [`SPEC_MARKETING_SITE_REDESIGN.md`](../SPEC_MARKETING_SITE_REDESIGN.md), [`SPEC_FULL_GRPC_MIGRATION.md`](../SPEC_FULL_GRPC_MIGRATION.md)
- Sui gasless stablecoin transfer reference: `https://docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers`
- Circle reference patterns: `https://github.com/circlefin/skills` + `https://github.com/circlefin/cli` + `https://developers.circle.com/agent-stack`
