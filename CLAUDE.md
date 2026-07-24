# CLAUDE.md

> This file is loaded every turn. It is the highest-leverage configuration for any AI assistant working on this codebase.

---

## Architecture — The Big Picture

### Three brands, three repos

```
t2000 (this repo)    → Infrastructure: CLI, SDK, MCP, gateway, contracts
audric (separate)    → Consumer product: audric.ai website, app, Chrome extension
suimpp (separate)    → Protocol: suimpp.dev, @suimpp/mpp, @suimpp/discovery
```

### This repo structure

```
t2000/
├── apps/gateway     ← MPP API gateway (mpp.t2000.ai, every major AI + data API)
├── apps/docs        ← Mintlify developer docs (developers.t2000.ai)
├── apps/web         ← t2000.ai marketing website
├── apps/verify      ← verify.t2000.ai — public confidential-receipt explorer + verify hub (Sui anchor feed + paste-to-verify; added 2026-07-01)
├── packages/cli     ← @t2000/cli (npm)
├── packages/sdk     ← @t2000/sdk (npm)
├── packages/mcp     ← @t2000/mcp (npm)   # (@t2000/engine RETIRED + deleted 2026-06-14)
├── packages/id      ← @t2000/id (npm)    ← Agent ID — agent_id::registry client (added 2026-06-29)
├── packages/serve   ← @t2000/serve (npm) ← Merchant-side x402 router — wrap any API for agent payments (added 2026-07-20; stack is 5 packages)
├── packages/store   ← @t2000/store (PLANNED, H1 — Agent Store: commerce engine, Move+Seal+Walrus)
├── packages/models  ← @t2000/models (PLANNED, H2 — Agent Models: OpenAI-compatible gateway to self-hosted Qwen + resold frontier)
├── t2000-skills/    ← Agent skill definitions
└── PRODUCT_ROADMAP.md ← Whole-product master roadmap (t2000 + Audric)
```

### Two brand layers

**t2000** = infra. Names the underlying capabilities (SDK, CLI, MCP, x402 gateway, contracts). Used in technical docs, package names, READMEs, dev-facing surfaces. (The `@t2000/engine` harness package was retired 2026-06-14.)

**Audric** = consumer. The product a user touches at audric.ai.

#### Audric v3 — the current product (the canon)

> **Private, decentralized AI — truly yours.** A multi-model AI agent with a non-custodial zkLogin (Google) wallet, live at audric.ai. Clean-fork of the Vercel chatbot template (`audric/apps/web-v3`).

- **Models** — open/uncensored (Kimi, DeepSeek, Grok, GPT-OSS) + frontier (Claude, GPT-5.x, Gemini); **Auto** routing picks the model + reasoning effort + step budget per turn.
- **Agent** — live web search, image generation, visible cited multi-step research, curated paid Recipes (x402, paid in USDC).
- **Passport (wallet)** — non-custodial zkLogin wallet; send USDC + USDsui, free/instant/gasless; tap-to-confirm on every write; sponsored gas.
- **Privacy** — zero data retention, encrypted private chats & files, decentralized memory on Walrus (opt-in, deletable).

**What changed from v2 (2026-06-14):** DeFi (NAVI save/borrow) removed and `@t2000/engine` retired — v3 composes the AI SDK directly over `@t2000/sdk` (on **AI SDK 7** as of 2026-06-25). The SDK write surface is now **send · swap (Cetus) · pay (x402)**.

For Audric product detail, see **`audric/CLAUDE.md`** + **`SPEC_AUDRIC_V3.md`** (the canon). The legacy v2 app (engine + NAVI) was **deleted from the audric repo 2026-07-24** — do not reintroduce its concepts. Published `@t2000/engine@4.x` remains on npm for historical consumers only.

### DeFi integration — REMOVED from t2000 (2026-06-14, S.444)

> **NAVI/DeFi was removed from `@t2000/sdk`** (save/withdraw/borrow/repay/claim/harvest builders + the `@naviprotocol/lending` dep + the lending-adapter framework all deleted). The SDK's write surface is now **send (gasless USDC/USDsui) · swap (Cetus) · pay (x402)**. The historical approach was: NAVI MCP for reads + thin `@mysten/sui` tx builders for writes; **do NOT re-import** `@naviprotocol/lending` / `@suilend/sdk` if DeFi is ever reintroduced — use MCP reads + thin builders. (`@t2000/engine@4.x` on npm is historical only — the audric web-v2 consumer was deleted 2026-07-24.)

**Exception:** `@cetusprotocol/aggregator-sdk` is allowed for swap execution — multi-DEX routing across 20+ DEXs cannot be feasibly replaced by thin tx builders. All usage is isolated to `packages/sdk/src/protocols/cetus-swap.ts`.

---

## Critical Rules

1. **DeFi (lending / yield / Invest) was removed (2026-06-14, S.444).** Don't reintroduce `save` / `borrow` / Invest into the SDK — see the "DeFi integration — REMOVED" note above + `SPEC_AUDRIC_V3.md`.
2. **Never import protocol SDKs for new features** (except `@cetusprotocol/aggregator-sdk` for swap routing). Use MCP / thin `@mysten/sui` tx builders instead.
3. **Never rename @t2000/* packages.** t2000 is the infra brand. Audric is the consumer brand.
4. **Never fork claude-code.** Study patterns, reimplement in `@t2000/sdk` or the host agent loop.
5. **Always check `developers.t2000.ai`** before writing documentation or marketing copy. Mintlify is the live docs SSOT (auto-deployed from `apps/docs/`) — covers product naming, CLI surface, SDK API, MCP tools. For code-level truth (fees, decimals, allowed-asset lists, error codes), read `packages/sdk/src/constants.ts` + `packages/sdk/src/token-registry.ts` directly.
6. **Always use `token-registry.ts`** for token metadata (`COIN_REGISTRY`, `resolveTokenType`, `getDecimalsForCoinType`, `resolveSymbol`, the `*_TYPE` constants). Never hardcode decimals or coin types. (There is no token "tier" gate — USDC is the settlement stable; everything else is holdable/swappable.)
7. **Never read `process.env.X` directly in any app or package WITH ≥1 REQUIRED env var.** Apps that depend on a required env var MUST validate their env contract at boot via a Zod schema and expose values through a typed `env` proxy. Direct `process.env` reads bypass the gate that catches the empty-string-in-Vercel bug class. The canonical template is `audric/apps/web-v3/lib/env.ts` — schema + `instrumentation.ts` boot-time validation (audric enforces the no-raw-`process.env` convention via Biome/ultracite + code review, not an ESLint rule). The only exemption is `process.env.NODE_ENV` (a build-time constant). New env vars: add to the schema first, then read via `env.X`. See the lessons-learned entry in `audric-build-tracker.md` (S.20 / April 2026 BlockVision incident).<br>**Carve-out (S.227, 2026-05-21):** Apps with ZERO required env vars (e.g. `t2000/apps/web` — static marketing site with 3 optional Sui-address overrides) may validate inline at the read site instead of installing a full Zod gate. The bug class the rule prevents (REQUIRED var silently degrading) doesn't exist when there's nothing required to degrade. If such an app ever adds its first required var, ship the gate at that point.
8. **Fees are an Audric concern, not a t2000 concern.** As of `@t2000/sdk@1.1.0` (B5 v2, 2026-04-30), the SDK + CLI are fee-free by design — **with one carve-out: the `t2000::a2a_escrow` protocol fee (2026-07-18, v9.9.x).** Escrowed-job settlement carries a 5% fee (raised from 2.5% on 2026-07-19 via AdminCap `set_fee_bps`) enforced by the Move contract itself on the seller-bound payout (bps locked into the Job at funding; refunds fee-free; receiver = t2000-revenue, rotatable via AdminCap). That fee lives on-chain, not in the SDK/CLI code paths — send/swap/pay remain fee-free. Audric is the only fee owner: it passes `overlayFeeReceiver: T2000_OVERLAY_FEE_WALLET` for Cetus swaps (the Cetus aggregator takes the overlay fee from swap output and transfers it to the wallet). The deprecated `t2000::treasury::collect_fee` Move call + `addCollectFeeToTx` helper were removed; the `addFeeTransfer`/`protocolFee` helper (only ever used for the now-removed save/borrow fees) was deleted with the DeFi surface. New consumer apps that want non-swap fees split + transfer to a wallet inside the same PTB; the indexer detects USDC inflows and writes `ProtocolFeeLedger` rows. See S.43 in `audric-build-tracker.md`.
9. **Push back** if a task violates simplicity or adds unnecessary complexity.

---

## Engineering Discipline

> Mirrored verbatim in `.cursor/rules/engineering-discipline.mdc` (Cursor doesn't read
> this file) — keep the two in sync. Depth: `.claude/skills/t2000-engineering/SKILL.md`.

**Trace before you fix.** Trace the ACTUAL execution path (user action → route →
handler → SDK → chain → response → UI) and confirm which code actually runs before
changing anything. Most multi-iteration fixes are one-iteration fixes that started
in the wrong layer.

**Verifiable goals, always.** Convert every task into a goal with a runnable check.
State multi-step plans as `step → verify:` pairs. Never say "done" without running
the verify step; never "should be fine" without re-reading the diff.

**Single source of truth.** If data exists somewhere, import it. Never copy a token
map, decimal, coin type, or config into a second file. Before hardcoding any list,
ask whether someone will have to hand-update it later — if yes, the approach is wrong.

**Fix at the root.** If a fix needs 3+ places or several attempts, the architecture
is wrong. Find the single point of failure.

**Simplicity first, surgically applied.** Minimum code that solves the problem;
nothing speculative. No abstractions for single-use code — and none whose *shape* is
shared but whose *logic* isn't. Touch only what the request requires; match existing
style; mention unrelated dead code rather than deleting it.

**Remove completely — no orphans.** When you delete a feature, sweep every layer in
the same pass: source, types, error codes, tests, deps, patches, docs, rules, CI,
export barrels, empty dirs. Dead remnants of your own removal are in scope; "keep it
just in case" is not.

**Run the product algorithm in order.** (1) Make the requirements less dumb —
requirements are guilty until proven innocent. (2) Delete the part or step; if you
aren't adding back ≥10%, you didn't delete enough. (3) Optimize what survived.
(4) Accelerate. (5) Automate last. Default to deletion; name the fork rather than
silently picking a constrained path.

**Machines AND humans.** Every surface must work for an autonomous agent *and* a
person. If a design serves only one, it's half-built.

---

## Claude Code setup

Claude Code is the **Build lane** (`.cursor/rules/spend-lanes.mdc`) and `.claude/`
is the canonical agent context. Migrated 2026-07-24 from `.cursor/rules/`, which
Claude Code cannot read — those files are now pointers, not content.

| Layer | Path | Loaded |
|---|---|---|
| Always-on | `CLAUDE.md` | every turn |
| Rule depth | `.claude/skills/*/SKILL.md` | on task match |
| Package notes | `.claude/rules/*.md` | as project instructions |
| Rituals | `.claude/commands/*.md` | on `/command` |

**Skills** (each auto-loads when its description matches the task — don't read them
speculatively):

| Skill | Covers |
|---|---|
| `t2000-engineering` | Trace-before-fix, verifiable goals, simplicity, complete removal, product algorithm, ESLint flat-config trap, test-file convention |
| `t2000-env-gate` | The Zod boot-validation pattern behind Critical Rule 7 |
| `t2000-financial-amounts` | Floor-never-round, per-token precision, the canonical token registry |
| `t2000-sui-platform` | Address Balances (SIP-58) concurrency + gasless-transfer eligibility gotchas |
| `t2000-design-system` | Copy-in tokens, per-app shadcn, house near-black theme |
| `t2000-confidential-verify` | GPU-TEE inference: anchor-every, Redis receipts, trust-boundary honesty |

**Vendored Sui skills** (10 of 20 from `MystenLabs/skills`, installed 2026-07-24 —
`accessing-data` · `sui-sdks` · `ptbs` · `sui-object-model` · `sui-move` ·
`modern-move-syntax` · `move-unit-testing` · `naming-conventions` ·
`composable-move-functions` · `sui-publish`). Copied in, not symlinked, so they're
committed and version-stable. Deliberately **not** installed: CLI setup/install,
project scaffolding, frontend-apps, walrus-sites, sui-overview — irrelevant here and
each one costs routing context.

They agree with our constraints rather than fighting them — `accessing-data` leads
with *"absolutely no JSON-RPC for new code"* and `sui-sdks` teaches
`SuiGrpcClient` / `client.core.*`, matching § Sui Integration. `sui-sdks` also notes
that every `@mysten/*` package ships `docs/llms-index.md` into `node_modules`,
version-matched to what's installed — prefer that over any doc link.

```bash
npx skills add MystenLabs/skills -s <name> -a claude-code --copy -y
```

Re-run per skill to update. Eval fixtures (`evals/`, `grading.json`) are stripped on
install — they're the upstream authors' CI, not consumer content.

**Commands:** `/release <bump>` · `/ship <feature>` · `/tracker <title>` · `/next`

**`/improve`** (shadcn/improve) is installed **globally**, not in this repo — a
periodic nine-category auditor (correctness, security, perf, tests, debt, deps, DX,
docs, features). It never edits source; it writes plans to `plans/`, which is
gitignored here.

> **`/improve` proposes; `HANDOFF_NEXT_AGENT.md` decides.** Its `plans/` output is
> working material, never a second backlog — triage findings into the handoff table,
> then delete the plan file. Two ranked backlogs that can disagree is the exact drift
> class this setup exists to prevent.

**Editing rules:** change the `.claude/` file. The only deliberate duplication is
the Engineering Discipline block above ↔ `.cursor/rules/engineering-discipline.mdc`.

Ten engine-era rules were **deleted** 2026-07-24 (they described the retired engine,
BlockVision, removed DeFi, and metrics tables absent from this repo). Recover any of
them with `git log --all -- .cursor/rules/<name>.mdc` — don't reintroduce them.

---

## Repo Layout

Read `REPO_LAYOUT.md` once at session start for "where does X go?"

**Short version:**
- **Root** = `README` / `LICENSE` / `CLAUDE.md` / `ARCHITECTURE.md` / `SECURITY.md` + tooling config + founder-local trackers (`audric-build-tracker.md`, `PRODUCT_ROADMAP.md`, `HANDOFF_NEXT_AGENT.md`) + `.smoke-*` tooling. Strict allowlist — any other file at root violates the rule. The trackers are gitignored **symlinks into `spec/`** (their real files live in the private `t2000-internal` repo — see below).
- **`docs/`** — public-facing docs (tracked)
- **`spec/`** — internal SPECs, references, runbooks, archive, **plus** `PRODUCT_ROADMAP.md`, `audric-build-tracker.md`, both repos' `HANDOFF_NEXT_AGENT.md` (under `handoffs/`), and engineer onboarding (`team-docs/`). **Gitignored in the public repo — the real content lives in the private `mission69b/t2000-internal` repo, mounted at `spec/`** (the founder's quick-start message has the clone steps; full onboarding is at `spec/team-docs/ONBOARDING.md` once cloned). The public repo never sees any of this; nothing in `spec/` is part of the published surface.

## Key Documents

> Docs marked **(local-only)** / **(gitignored)** are not in this public repo — they live in the private `mission69b/t2000-internal` repo, mounted at `spec/` (clone steps are in the founder's quick-start message; full onboarding at `spec/team-docs/ONBOARDING.md`). The root paths below resolve via gitignored symlinks once that repo is cloned into `spec/`.

| Document | What it covers | Read before |
|----------|---------------|-------------|
| `PRODUCT.md` | **The product map SSOT** — 2 products (Private Inference · x402 gateway), one customer + one path each; wallet/Agent ID = substrate, not products; `t2 agent onboard` deprecated | Any product/positioning/onboarding work |
| [`developers.t2000.ai`](https://developers.t2000.ai) | Live docs SSOT — product naming, CLI surface, SDK API, MCP tools (Mintlify, auto-deployed from `apps/docs/`) | Documentation or marketing |
| `ARCHITECTURE.md` | Current-state technical map — the two rails' request lifecycles, wallet/gas/limits, Agent ID, MCP/skills, auth, data stores, CI (rewritten 2026-07-13) | API or integration work |
| `REPO_LAYOUT.md` | Public layout SSOT — root allowlist + where docs go | Every session start |
| `PRODUCT_ROADMAP.md` (local-only) | Whole-product master roadmap — 5 Audric products + t2000 infra + the 3 strategic threads (Store, Agent Models, Agent Deploy) + revenue model (gitignored) | Feature planning |
| `HANDOFF_NEXT_AGENT.md` (t2000 + `audric/`, local-only) | **Forward-backlog SSOT.** The `audric/HANDOFF_NEXT_AGENT.md` "Active backlog" table is canonical for product / agent-ownable tasks (ranked, with effort + notes) + founder ops; the t2000 one covers the infra forward window + cross-repo cleanup and defers the audric backlog to it. | Picking the next task; planning |
| `audric-build-tracker.md` (local-only) | Reverse-chronological **execution log** — one `S.N` entry per shipped slice, newest on top (gitignored). This is the audit trail, **NOT** a forward backlog. To get the next SPEC number, read the latest `S.N` at the top of the file and increment. | Status checks; before assigning the next `S.N` |
| `spec/**` (local-only, gitignored) | Internal SPECs, harness contracts, locked-decision references, operational runbooks — full tree available on the maintainer's machine; not part of the public repo | When the rule/agent context cites a specific SPEC by name |
| `.claude/skills/*/SKILL.md` | **The rule depth** — 6 skills, auto-loaded when the task matches (see § Claude Code setup) | Claude routes these itself |
| `audric/apps/web-v3/lib/env.ts` | Canonical Zod env-validation template | Adding env vars, copying the pattern |
| `audric/.cursor/rules/audric-transaction-flow.mdc` | Sponsored tx vs SDK direct (lives in audric repo) | Audric transaction/receipt bugs |

---

## Monorepo Tooling

- **Package manager:** pnpm (v10.6.2, pinned via `packageManager`)
- **Build orchestration:** Turbo (`turbo build`, `dev`, `lint`, `typecheck`)
- **Workspaces:** `packages/*` and `apps/*` (defined in `pnpm-workspace.yaml`)

### Common commands

```bash
pnpm dev                    # Start all dev servers
pnpm build                  # Build all packages
pnpm lint                   # Lint all packages
pnpm typecheck              # TypeScript check all packages
pnpm --filter @t2000/cli build   # Build specific package
pnpm --filter gateway dev        # Dev specific app
```

### Release process (npm publish)

> **MANDATORY — always use this process. Never manually bump versions, push tags, or run `npm publish` locally.**

#### Step 1 — Trigger the Release workflow (one command)

> **Prerequisite:** `release.yml` requires a `RELEASE_TOKEN` secret in GitHub repo settings — a Personal Access Token with `contents: write` and branch protection bypass rights. Without it, the workflow's push to main will fail. If the secret is not configured, use the manual fallback below.

```bash
gh workflow run release.yml --field bump=patch   # patch | minor | major
```

**Manual fallback (if RELEASE_TOKEN not set):**
```bash
cd /Users/funkii/dev/t2000
npm --prefix packages/sdk version X.Y.Z --no-git-tag-version
npm --prefix packages/cli version X.Y.Z --no-git-tag-version
npm --prefix packages/mcp version X.Y.Z --no-git-tag-version
npm --prefix packages/id version X.Y.Z --no-git-tag-version
npm --prefix packages/serve version X.Y.Z --no-git-tag-version
git add packages/*/package.json
git commit -m "📦 build: vX.Y.Z"
git push origin main
git tag -a vX.Y.Z -m "vX.Y.Z — description"
git push origin vX.Y.Z
# publish.yml triggers automatically from the tag push
```

This runs `.github/workflows/release.yml`, which:
1. Bumps all 5 package versions together (`sdk`, `cli`, `mcp`, `id`, `serve`) to the same version
2. Commits `📦 build: vX.Y.Z` to main
3. Creates and pushes the `vX.Y.Z` annotated tag
4. Explicitly triggers `.github/workflows/publish.yml` via `workflow_dispatch`

#### Step 2 — Publish pipeline runs automatically

`.github/workflows/publish.yml` (triggered by Step 1):
1. **CI** — lint + typecheck + test + build all packages
2. **Publish** — `pnpm publish` for each of the 5 packages (`continue-on-error: true` — safe if version already exists)
3. **GitHub Release** — `gh release create vX.Y.Z --generate-notes`
4. **Discord** — posts release notification to `#releases` channel

#### Step 3 — Update audric (downstream)

```bash
# In audric repo after npm publish completes:
cd /Users/funkii/dev/audric/apps/web-v3
pnpm add @t2000/sdk@latest
cd /Users/funkii/dev/audric
git add -A && git commit -m "📦 build(web): bump @t2000/sdk to vX.Y.Z" && git push
# Vercel auto-deploys on push to main
```

#### When to bump what

| Change | Bump |
|--------|------|
| New tool, method, or command | `minor` |
| Bug fix, type fix, test fix | `patch` |
| Breaking API change | `major` |

> **⚠️ Majors are rare — default down (founder, 2026-07-15).** The 5.x→6→7→8 climb happened in ~a week and looked bad. `major` is ONLY for changes that break code an external consumer could actually have written against the published API. Internal refactors, removals of unshipped/unused surface, and doc/catalog changes are `minor` at most. When several breaking removals are queued, **batch them into one major** — never ship majors back-to-back. When in doubt, `patch`.

#### ⚠️ What NOT to do

- **Never** run `npm --prefix packages/X version Y` manually before pushing a tag
- **Never** push a `vX.Y.Z` tag by hand — let the release workflow do it
- **Never** run `pnpm publish` locally
- **Never** push multiple tags in the same session to fix failures — fix the code and re-run the workflow

**Key details:**
- All 5 packages (`sdk`, `cli`, `mcp`, `id`, `serve`) are always at the same version number (`@t2000/id` joined the lockstep at `5.7.0`, 2026-06-29; `@t2000/serve` at `10.1.0`, 2026-07-20) — no drift. (`@t2000/engine` retired 2026-06-14; its last published version is `4.x` on npm — historical only; the audric web-v2 consumer was deleted 2026-07-24.)
- `continue-on-error: true` on publish steps — idempotent if a version already exists
- `workflow_dispatch` on `publish.yml` serves as a manual fallback if needed

---

## Engine (`@t2000/engine`) — RETIRED (2026-06-14, S.442)

> **The `@t2000/engine` package was retired and DELETED from the monorepo.** Nothing in the monorepo imported it; it was a harness library whose only runtime consumer was Audric web-v2 (itself deleted 2026-07-24). Audric v3 composes the AI SDK (`Experimental_Agent`) directly over `@t2000/sdk` — the transaction-safety guards are agent-loop guards that live in the v3 host, not the SDK (the published `@t2000/engine@4.x` on npm remains for historical pin only). **The package stack is now 5: `@t2000/{sdk,cli,mcp,id,serve}`**. Engine removed from the release/CI workflows. Do not add a new engine package — host apps compose the AI SDK over the SDK directly. (Historical engine API + tool/guard catalogue: `git log` + `@t2000/engine@4.x` on npm.)

---

## Sui Integration

### Package imports (`@mysten/sui@2.x`) — gRPC ONLY

> **Sui JSON-RPC is deactivated July 31, 2026 (mainnet) — never write new JSON-RPC.** All reads/writes
> go through `SuiGrpcClient` (SPEC_STORE_V2 §8b is the standing constraint; the gateway's
> eslint bans `jsonrpc` bodies). `SuiJsonRpcClient` / `@mysten/sui/jsonRpc` are legacy —
> do not import them.

```ts
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { MIST_PER_SUI, SUI_DECIMALS, isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

const client = new SuiGrpcClient({ baseUrl: 'https://fullnode.mainnet.sui.io', network: 'mainnet' });
// High-level reads: client.core.getTransaction / getObject / getChainIdentifier …
// Field-masked reads: client.ledgerService.getTransaction({ digest, readMask: { paths: [...] } })
```

### Notes

- `pnpm.overrides` in root `package.json` forces `@mysten/sui@^2.6.0`

### Transaction patterns

- Use `Transaction` class for all on-chain operations
- Split coins: `tx.splitCoins(tx.gas, [amount])`
- Always transfer created objects to user
- `tx.object()` for shared objects, `tx.pure.type()` for primitives
- Simulate before signing, validate addresses with `isValidSuiAddress()`

### Constants

- `MIST_PER_SUI`: `1_000_000_000n`
- `MIN_DEPOSIT`: `1_000_000n` (1 USDC, 6 decimals)
- `BPS_DENOMINATOR`: `10_000n`
- `CLOCK_ID`: `'0x6'`
- USDC: `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`

---

## TypeScript Conventions

- Strict mode, avoid `any` — use `unknown` + type guards
- Components: `PascalCase.tsx`, named exports, destructured props
- Hooks: `useCamelCase`, return objects for multiple values
- Props: `interface FooProps`, types for unions/utilities
- Booleans: `is`, `has`, `should`, `can` prefix
- Event handlers: `handleEventName` or `onEventName` prop

---

## Next.js (apps/web)

- App Router: `layout.tsx` for shared UI, `loading.tsx` for Suspense, `error.tsx` for boundaries
- Server Components by default, `'use client'` only when needed
- Route groups `(name)` for organization without URL impact
- `generateMetadata` for dynamic page metadata

---

## Styling

See the `t2000-design-system` skill for the full model. In short:

- **Shared VALUES via copy-in, not a dependency.** `design-tokens/tokens.css` (pure CSS vars — Geist palette + semantic `--bg`/`--fg`/`--border` + radii/spacing/fonts) is the SSOT; each app copies it in and owns it. House look is the **seamless near-black** dark theme; per-app accent via `--t2k-accent`.
- **Components: shadcn primitives owned per-app** (`components/ui/`), used where interaction/a11y justifies. Marketing/utility pages (t2000.ai, mpp, verify, suimpp) are largely raw JSX + tokens — don't force shadcn onto them. Only **audric web-v3** is a full shadcn app (and keeps its own theme).
- **`@t2000/ui` was removed from the monorepo** (2026-07-01) — `web` + `gateway` now own their token + marketing-chrome CSS locally (`app/styles/*.css`). `suimpp.dev` (separate repo) still consumes the published npm version until it migrates. Don't reintroduce a shared UI/token package.
- Group utilities: layout → spacing → sizing → colors → effects; `cn()` for conditional classes; Geist font everywhere.

---

## Git Commits

```
emoji type(scope): subject
```

| Type | Emoji |
|------|-------|
| feat | ✨ |
| fix | 🐛 |
| docs | 📝 |
| style | 🎨 |
| refactor | ♻️ |
| perf | ⚡ |
| test | ✅ |
| build | 📦 |
| chore | 🔧 |

- Subject lowercase, ALWAYS use emoji
- Do NOT add "Generated with Claude"
- Scopes: `sdk`, `mcp`, `cli`, `web`, `gateway`, `contracts`

---

## Security

- Validate amounts before transaction building
- Validate addresses with `isValidSuiAddress()` before use
- Simulate transactions before signing
- Show confirmation modals for high-value actions
- Fetch fresh data before critical transactions

---

## Links

| Resource | URL |
|----------|-----|
| t2000 (infra) | `t2000.ai` |
| Audric (consumer) | `audric.ai` |
| suimpp (protocol) | `suimpp.dev` |
| MPP Gateway | `mpp.t2000.ai` |
| Verify (confidential explorer) | `verify.t2000.ai` |
| GitHub | `github.com/mission69b/t2000` |
| npm CLI | `npmjs.com/package/@t2000/cli` |

---

## Ship Checklist

When shipping a feature, update these files:

- [ ] SDK implementation + tests (`packages/sdk/src/`)
- [ ] CLI command + tests (`packages/cli/src/commands/`)
- [ ] MCP tool/prompt + tests (`packages/mcp/src/`)
- [ ] Agent Skill (`t2000-skills/skills/`)
- [ ] Mintlify docs (`apps/docs/*.mdx`) — auto-deploys to `developers.t2000.ai`
- [ ] Root README (`README.md`)
- [ ] Package READMEs (`packages/*/README.md`)
- [ ] Version bump + build all packages
- [ ] **Feature/benefit capture** — append the slice's feature + proof point to `SITE_REPOSITIONING_BRIEF.md` §6 (positioning SSOT), and land the `developers.t2000.ai` factual delta when the dev-facing contract changed (CLI/SDK/MCP surface, version, or behavior)

**Docs cadence (two tiers, not "dump as you go"):**
- **Per-slice** — keep `developers.t2000.ai` *factually correct* only (version, command surface, behavior like limits-on / no-charge-on-failure). Cheap; prevents the staleness class.
- **Per-PHASE** — a dedicated structured-docs task: turn the phase's shipped specs into a cohesive, **story-driven product + technical section** (features → benefits → how it works), NOT a textbook manual. The marketing-site positioning rewrite batches at launch via `SITE_REPOSITIONING_BRIEF.md`.
- **Catalog tables come from live truth, never from memory.** Any docs table that enumerates services/models/tools/skills MUST be written against the live source — `mpp.t2000.ai/api/services` (gateway catalog), `api.t2000.ai/v1/models` (model catalog), `packages/mcp/src/tools/` (MCP tools), `t2000-skills/skills/` (skills), CLI source for defaults. Hand-written "should exist" lists are how the 2026-07-02 agent-payments fiction (Bing/Kagi/Midjourney/BlockVision — none on the rail) shipped; cross-check before writing, and prefer linking the live endpoint over duplicating it.
