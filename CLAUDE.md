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
├── packages/cli     ← @t2000/cli (npm)
├── packages/sdk     ← @t2000/sdk (npm)
├── packages/mcp     ← @t2000/mcp (npm)   # (@t2000/engine RETIRED + deleted 2026-06-14 — stack is 3 packages)
├── packages/store   ← @t2000/store (PLANNED, H1 — Agent Store: commerce engine, Move+Seal+Walrus)
├── packages/models  ← @t2000/models (PLANNED, H2 — Agent Models: OpenAI-compatible gateway to self-hosted Qwen + resold frontier)
├── t2000-skills/    ← Agent skill definitions
└── PRODUCT_ROADMAP.md ← Whole-product master roadmap (t2000 + Audric)
```

### Two brand layers

**t2000** = infra. Names the underlying capabilities (SDK, CLI, MCP, x402 gateway, contracts). Used in technical docs, package names, READMEs, dev-facing surfaces. (The `@t2000/engine` harness package was retired 2026-06-14.)

**Audric** = consumer. Names the surfaces a user touches. Always one of exactly **five products** (post-S.18 reframe): **Audric Passport, Audric Intelligence, Audric Finance, Audric Pay, Audric Store**. (S.17's 4-product cut overloaded Intelligence as both "moat" and "home for every financial verb." S.18 splits Finance back out — it's the home for save / borrow / swap / charts. Send + Receive collapse into Pay.)

#### The five products

| Audric product | What it is | t2000 layer |
|---|---|---|
| 🪪 **Audric Passport** | The trust layer. Identity (zkLogin via Google), non-custodial wallet on Sui, tap-to-confirm consent on every write, sponsored gas. Wraps every other product. | `@t2000/sdk` (wallet, signing) + Enoki (zkLogin, gas sponsorship) + `@mysten/sui` |
| 🧠 **Audric Intelligence** | The brain (the moat). Four systems orchestrate every money decision — Agent Harness (26 tools), Reasoning Engine (12 guards), Memory (MemWal), AdviceLog. Picks the tool, clears the guards, remembers what it told you. Engineering-facing brand; users experience it as "Audric just understood me." (v0.7d Phase 6 Block A — 2026-05-21 — collapsed former "Silent Profile" + "Chain Memory" into a single MemWal-backed "Memory" system. S.245 — 2026-05-22 — deleted `pay_api` + `mpp_services` tools per V07E_D_QUESTION_AUDITS D-2 reframe; 37 → 35. S.269 — 2026-05-23 — deleted `save_contact` (dead) + V07E_INVOICE_DEPRECATION deleted 3 invoice tools; 35 → 31. S.277 — 2026-05-23 — "Earns Its Keep" audit cut Volo trio + `web_search` + `protocol_deep_dive` + 2 dead guards; 31 → 26 tools, 14 → 12 guards. S.391 — 2026-06-09 — the runnable `AISDKEngine` loop retired; the engine is now a harness library the host composes.) | `@t2000/engine` (harness library — tools + reasoning + guards) + `@t2000/mcp` (skills exposed as MCP prompts) + `@mysten-incubation/memwal` (vector memory) |
| 💰 **Audric Finance** | Manage your money on Sui. Save (NAVI lend, 3–8% APY on USDC or USDsui — strategic exception added in v0.51.0), Credit (NAVI borrow USDC or USDsui against savings, health factor visible at all times — repay must use the same asset as the borrow), Swap (Cetus aggregator, best-route across 20+ DEXs, 0.1% fee), Charts (interactive yield / health / portfolio visualizations rendered from chat). Every write taps to confirm via Passport. | `@t2000/sdk` NAVI lending/borrowing builders + `cetus-swap.ts` + `@t2000/engine` chart canvas templates |
| 💸 **Audric Pay** | Move money. Free, global, instant on Sui. Send USDC to anyone, receive via payment links / QR. No bank, no borders, no fees. (Invoicing is covered by payment links — set the label/memo to encode invoice context. Invoice as a distinct product retired in V07E_INVOICE_DEPRECATION / S.269 item 7, 2026-05-23.) | `@t2000/sdk` Sui tx builders (direct USDC transfers, payment-link contract) |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username`. Generate AI music, art, ebooks, list them, sell in USDC. 92% to creator. **Coming soon (Phase 5).** | `@t2000/sdk` + Walrus storage + payment links (built on Audric Pay primitives) |

#### Audric Passport — the trust layer (4 pillars)

> **Your passport to a new kind of finance.**

Every Audric action runs through Passport. It's the wallet itself.

| Pillar | Meaning |
|---|---|
| 🪪 **Identity** | Sign in with Google. Your Passport is a cryptographic wallet, created in 3 seconds. No seed phrase. Yours forever. (zkLogin + Enoki) |
| ✋ **You decide** | Audric never moves money on its own. Every Finance and Pay action — save, send, swap, borrow — waits on your tap-to-confirm. |
| 🔐 **Sponsored gas** | We pay the network fees so you don't need SUI to transact. Your USDC stays your USDC. (Enoki sponsorship) |
| ⛓️ **Yours** | Non-custodial. We cannot move your money. Every transaction is on Sui mainnet, verifiable by anyone, forever. |

#### Audric Intelligence — the 5-system moat (the differentiator)

> **Not a chatbot. A financial agent.** Five systems work together to understand your money, reason about decisions, and get smarter over time. Every action still waits on your Passport tap-to-confirm.

| System | What it does | Implementation |
|---|---|---|
| 🎛️ **Agent Harness** | 26 tools, one agent. The toolset + composition primitives that orchestrate Finance ops (save, swap, borrow, repay, charts), Pay ops (send, receive), and read tools (balances, DeFi positions, analytics) inside a single conversation. Parallel reads; serial writes via the AI SDK step model + `needsApproval` round-trip. | `@t2000/engine` harness primitives + 26 tools (18 read / 8 write) |
| ⚡ **Reasoning Engine** | Thinks before it acts. Adaptive thinking effort per turn, complexity classifier, 14 safety guards (12 pre-execution + 2 post-execution hints) across 3 priority tiers (Safety > Financial > UX), preflight input validation, prompt caching. Multi-step orchestration ("rebalance my portfolio", "safe borrow", "swap and save") lives in **skills** — markdown playbooks in `t2000-skills/skills/*/SKILL.md`, baked into `@t2000/mcp` at build time and exposed to Cursor / Claude Desktop as MCP prompts. The engine no longer ships a YAML recipe runtime (deleted v0.7a Phase 6, May 2026); skill content guides the LLM, the engine just runs the tools the LLM picks. | `classify-effort.ts`, `guards.ts`, `t2000-skills/skills/`, extended thinking always-on |
| 🧠 **Memory (MemWal)** | Knows your finances. `@mysten-incubation/memwal` vector memory holds long-term facts about preferences, goals, risk tolerance, on-chain patterns. `prepareStep` recalls top-K facts each turn → `<memory_recall>` system-prompt block; `onFinish` calls `memwal.analyze()` to extract new facts post-turn. Used silently to calibrate answers — never surfaced as nudges. (Audric retired its daily `UserFinancialContext` snapshot + cron in S.375 (2026-06-07), and the engine's now-unused `financialContextBlock` prompt layer was removed in S.376 — the agent orients via fresh tool calls. v0.7d Phase 6 Block A absorbed the former "Silent Profile" + "Chain Memory" systems into this one.) | `@mysten-incubation/memwal` SDK + `memwal-prepare-step.ts` + `memwal-write-callback.ts` |
| 📓 **AdviceLog** | Remembers what it told you. Every recommendation is logged so the agent doesn't contradict itself across sessions. | `AdviceLog` Prisma model + `record_advice` audric-side tool + `buildAdviceContext()` (last 30 days hydrated each turn) |

**Naming rules (binding):**

1. **Five products, no more, no less.** Passport, Intelligence, Finance, Pay, Store. If something doesn't fit one of them, it's either an operation inside one (lowercase verb) or it's infra (use a t2000 name).
2. **Operation → product mapping (binding):**
   - **save, swap, borrow, repay, withdraw, charts (yield/health/portfolio viz)** → Audric Finance
   - **send, receive, payment-link, QR** → Audric Pay (invoicing folded into payment links — see V07E_INVOICE_DEPRECATION / S.269 item 7)
   - **profile inference, memory extraction, chain-fact classification, advice logging, guard runs, skill orchestration, complexity classification** → Audric Intelligence (silent — never user-facing as a verb)
   - **sign-in, wallet creation, tap-to-confirm, sponsored gas** → Audric Passport
   - **listing, pay-to-unlock, Walrus upload, creator payout** → Audric Store
3. **MPP gateway returns under Audric Store (post-S.245).** The legacy `pay_api` + `mpp_services` engine tools were deleted 2026-05-22 (V07E_D_QUESTION_AUDITS D-2 reframe). Paid third-party APIs (image gen, transcription, TTS, GPT-4o, PDF, mail) return as Commerce primitives in the upcoming Audric Store SPEC — clean-slate redesign, not a port of the legacy 3-leg apps/web flow. Until then, Audric declines those requests honestly ("Image generation isn't available today — coming back as part of Audric Store. I can't give a date yet."). Audric Pay still means money transfer between users; Audric Store will own paid-API commerce.
4. **Audric Receive is not a product** — it's the receive-half of *Audric Pay*.
5. **Audric Intelligence has 4 named systems** — Agent Harness, Reasoning Engine, Memory (MemWal), AdviceLog. Always reference by these names. They are the moat. (v0.7d Phase 6 Block A — 2026-05-21 — reduced from 5 to 4 by absorbing former "Silent Profile" + "Chain Memory" into a single MemWal-backed "Memory" system. Pre-Block A docs still mention 5; the canonical is 4.)
6. **Operations** stay lowercase verbs. The capitalised noun forms (Save, Send, Swap, Credit, Receive, Charts) are UI chip labels — they live inside Finance or Pay.
7. **Engine system prompts** reference the five product names but should not invent additional ones.
8. **Marketing copy** leads with the operation ("save USDC", "send USDC"), invokes the product name only when grouping multiple operations or contrasting with another product.
9. **Invest is REMOVED.** Do not add it back. Savings (an Audric Finance operation on USDC into NAVI) covers yield.
10. **Audric Finance is back (S.18).** S.17 retired it; S.18 brought it back as the home for save/swap/borrow/repay/charts because "Intelligence" was overloaded. Don't try to re-retire it without re-reading the S.18 entry in `audric-build-tracker.md`.

The canonical reference for these five products is the top of `PRODUCT_ROADMAP.md`.

> **⚠️ [2026-06-14] Audric is being rebuilt as v3 — the product description above is the FROZEN legacy v2.** Audric v3 (`SPEC_AUDRIC_V3.md`, the canon) is a clean-fork "private, decentralized AI" rebuild: **DeFi removed**, `@t2000/engine` **retired** (v3 composes the AI SDK over `@t2000/sdk` directly), positioning = "Private, decentralized AI — truly yours". The Finance/Intelligence rows below describe what web-v2 (engine@4.x) still does until v3 replaces it. Don't treat the engine/NAVI/tool-count details as live infra truth — see `SPEC_AUDRIC_V3.md`.

### DeFi integration — REMOVED from t2000 (2026-06-14, S.444)

> **NAVI/DeFi was removed from `@t2000/sdk`** (save/withdraw/borrow/repay/claim/harvest builders + the `@naviprotocol/lending` dep + the lending-adapter framework all deleted). The SDK's write surface is now **send (gasless USDC/USDsui) · swap (Cetus) · pay (x402)**. Frozen audric/web-v2 keeps DeFi via the published `@t2000/*@4.x`. The historical approach was: NAVI MCP for reads + thin `@mysten/sui` tx builders for writes; **do NOT re-import** `@naviprotocol/lending` / `@suilend/sdk` if DeFi is ever reintroduced — use MCP reads + thin builders.

**Exception:** `@cetusprotocol/aggregator-sdk` is allowed for swap execution — multi-DEX routing across 20+ DEXs cannot be feasibly replaced by thin tx builders. All usage is isolated to `packages/sdk/src/protocols/cetus-swap.ts`.

---

## Critical Rules

1. **Never add Invest as a product.** Savings (under Audric Finance) covers yield.
2. **Never import protocol SDKs for new features** (except `@cetusprotocol/aggregator-sdk` for swap routing). Use MCP for reads, thin tx builders for writes.
3. **Never rename @t2000/* packages.** t2000 is the infra brand. Audric is the consumer brand.
4. **Never fork claude-code.** Study patterns, reimplement in `@t2000/sdk` or the host agent loop.
5. **Always check `developers.t2000.ai`** before writing documentation or marketing copy. Mintlify is the live docs SSOT (auto-deployed from `apps/docs/`) — covers product naming, CLI surface, SDK API, MCP tools. For code-level truth (fees, decimals, allowed-asset lists, error codes), read `packages/sdk/src/constants.ts` + `packages/sdk/src/token-registry.ts` directly.
6. **Always use `token-registry.ts`** for token metadata (`COIN_REGISTRY`, `resolveTokenType`, `getDecimalsForCoinType`, `resolveSymbol`, the `*_TYPE` constants). Never hardcode decimals or coin types. (There is no token "tier" gate — USDC is the settlement stable; everything else is holdable/swappable.)
7. **Never read `process.env.X` directly in any app or package WITH ≥1 REQUIRED env var.** Apps that depend on a required env var MUST validate their env contract at boot via a Zod schema and expose values through a typed `env` proxy. Direct `process.env` reads bypass the gate that catches the empty-string-in-Vercel bug class. The canonical template is `audric/apps/web-v2/lib/env.ts` — schema + `instrumentation.ts` boot-time validation (audric enforces the no-raw-`process.env` convention via Biome/ultracite + code review, not an ESLint rule). The only exemption is `process.env.NODE_ENV` (a build-time constant). New env vars: add to the schema first, then read via `env.X`. See the lessons-learned entry in `audric-build-tracker.md` (S.20 / April 2026 BlockVision incident).<br>**Carve-out (S.227, 2026-05-21):** Apps with ZERO required env vars (e.g. `t2000/apps/web` — static marketing site with 3 optional Sui-address overrides) may validate inline at the read site instead of installing a full Zod gate. The bug class the rule prevents (REQUIRED var silently degrading) doesn't exist when there's nothing required to degrade. If such an app ever adds its first required var, ship the gate at that point.
8. **Fees are an Audric concern, not a t2000 concern.** As of `@t2000/sdk@1.1.0` (B5 v2, 2026-04-30), the SDK + CLI are fee-free by design. Audric is the only fee owner: it passes `overlayFeeReceiver: T2000_OVERLAY_FEE_WALLET` for Cetus swaps (the Cetus aggregator takes the overlay fee from swap output and transfers it to the wallet). The deprecated `t2000::treasury::collect_fee` Move call + `addCollectFeeToTx` helper were removed; the `addFeeTransfer`/`protocolFee` helper (only ever used for the now-removed save/borrow fees) was deleted with the DeFi surface. New consumer apps that want non-swap fees split + transfer to a wallet inside the same PTB; the indexer detects USDC inflows and writes `ProtocolFeeLedger` rows. See S.43 in `audric-build-tracker.md`.
9. **Push back** if a task violates simplicity or adds unnecessary complexity.

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
| [`developers.t2000.ai`](https://developers.t2000.ai) | Live docs SSOT — product naming, CLI surface, SDK API, MCP tools (Mintlify, auto-deployed from `apps/docs/`) | Documentation or marketing |
| `ARCHITECTURE.md` | Payment reporting, server registration flows | API or integration work |
| `REPO_LAYOUT.md` | Public layout SSOT — root allowlist + where docs go | Every session start |
| `PRODUCT_ROADMAP.md` (local-only) | Whole-product master roadmap — 5 Audric products + t2000 infra + the 3 strategic threads (Store, Agent Models, Agent Deploy) + revenue model (gitignored) | Feature planning |
| `HANDOFF_NEXT_AGENT.md` (t2000 + `audric/`, local-only) | **Forward-backlog SSOT.** The `audric/HANDOFF_NEXT_AGENT.md` "Active backlog" table is canonical for product / agent-ownable tasks (ranked, with effort + notes) + founder ops; the t2000 one covers the infra forward window + cross-repo cleanup and defers the audric backlog to it. | Picking the next task; planning |
| `audric-build-tracker.md` (local-only) | Reverse-chronological **execution log** — one `S.N` entry per shipped slice, newest on top (gitignored). This is the audit trail, **NOT** a forward backlog. To get the next SPEC number, read the latest `S.N` at the top of the file and increment. | Status checks; before assigning the next `S.N` |
| `spec/**` (local-only, gitignored) | Internal SPECs, harness contracts, locked-decision references, operational runbooks — full tree available on the maintainer's machine; not part of the public repo | When the rule/agent context cites a specific SPEC by name |
| `.cursor/rules/engineering-principles.mdc` | Scalability, single source of truth, trace-before-fix | **Every task** |
| `.cursor/rules/single-source-of-truth.mdc` | Canonical fetchers + ESLint enforcement | Portfolio/wallet/positions reads |
| `.cursor/rules/agent-harness-spec.mdc` | **HISTORICAL** — engine↔host contract (engine retired 2026-06-14) | Rationale only — no live engine |
| `.cursor/rules/blockvision-resilience.mdc` | **HISTORICAL** — BlockVision left t2000 with the engine | Rationale only — audric/web-v2 (frozen) keeps it |
| `.cursor/rules/token-data-architecture.mdc` | Canonical token data sources | Adding tokens, fixing decimal/display bugs |
| `.cursor/rules/env-validation-gate.mdc` | The S.25 lesson — every env var goes through Zod schema | Adding env vars / wiring a new app |
| `audric/apps/web-v2/lib/env.ts` | Canonical Zod env-validation template (audric/apps/web archived in v0.7e Phase 5 / S.253, 2026-05-22) | Adding env vars, copying the pattern |
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
git add packages/*/package.json
git commit -m "📦 build: vX.Y.Z"
git push origin main
git tag -a vX.Y.Z -m "vX.Y.Z — description"
git push origin vX.Y.Z
# publish.yml triggers automatically from the tag push
```

This runs `.github/workflows/release.yml`, which:
1. Bumps all 3 package versions together (`sdk`, `cli`, `mcp`) to the same version
2. Commits `📦 build: vX.Y.Z` to main
3. Creates and pushes the `vX.Y.Z` annotated tag
4. Explicitly triggers `.github/workflows/publish.yml` via `workflow_dispatch`

#### Step 2 — Publish pipeline runs automatically

`.github/workflows/publish.yml` (triggered by Step 1):
1. **CI** — lint + typecheck + test + build all packages
2. **Publish** — `pnpm publish` for each of the 3 packages (`continue-on-error: true` — safe if version already exists)
3. **GitHub Release** — `gh release create vX.Y.Z --generate-notes`
4. **Discord** — posts release notification to `#releases` channel

#### Step 3 — Update audric (downstream)

```bash
# In audric repo after npm publish completes:
cd /Users/funkii/dev/audric/apps/web
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

#### ⚠️ What NOT to do

- **Never** run `npm --prefix packages/X version Y` manually before pushing a tag
- **Never** push a `vX.Y.Z` tag by hand — let the release workflow do it
- **Never** run `pnpm publish` locally
- **Never** push multiple tags in the same session to fix failures — fix the code and re-run the workflow

**Key details:**
- All 3 packages (`sdk`, `cli`, `mcp`) are always at the same version number (currently `4.x`) — no drift. (`@t2000/engine` retired 2026-06-14; its last published version is `4.x`, frozen on npm for legacy audric/web-v2.)
- `continue-on-error: true` on publish steps — idempotent if a version already exists
- `workflow_dispatch` on `publish.yml` serves as a manual fallback if needed

---

## Engine (`@t2000/engine`) — RETIRED (2026-06-14, S.442)

> **The `@t2000/engine` package was retired and DELETED from the monorepo.** Nothing in the monorepo imported it; it was a harness library whose only runtime consumer was Audric. Audric v3 composes the AI SDK (`Experimental_Agent`) directly over `@t2000/sdk` — the transaction-safety guards are agent-loop guards that live in the v3 host, not the SDK (the published `@t2000/engine@4.x` on npm still carries the old guard logic for the frozen legacy audric/web-v2). **The package stack is now 3: `@t2000/{sdk,cli,mcp}`.** Removed from the release/CI workflows. Do not add a new engine package — host apps compose the AI SDK over the SDK directly. (Historical engine API + tool/guard catalogue: `git log` + `@t2000/engine@4.x` on npm.)

---

## Sui Integration

### Package imports (`@mysten/sui@2.x`)

```ts
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { MIST_PER_SUI, SUI_DECIMALS, isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
```

### v2 migration notes

- `SuiClient` → `SuiJsonRpcClient` (from `@mysten/sui/jsonRpc`)
- `getFullnodeUrl` → `getJsonRpcFullnodeUrl`
- Constructor: `new SuiJsonRpcClient({ url, network: 'mainnet' })`
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

- **Current apps:** Tailwind + shadcn/ui (dark theme)
- **Audric (new):** Agentic Design System — white/black, New York Large + Geist + Departure Mono
- Group utilities: layout → spacing → sizing → colors → effects
- `cn()` for conditional classes, shadcn components from `@/components/ui`

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
- Scopes: `sdk`, `mcp`, `cli`, `web`, `gateway`, `engine`, `contracts`

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
| GitHub | `github.com/mission69b/t2000` |
| npm CLI | `npmjs.com/package/@t2000/cli` |
| NAVI MCP | `open-api.naviprotocol.io/api/mcp` |

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
