# CLAUDE.md

> This file is loaded every turn. It is the highest-leverage configuration for any AI assistant working on this codebase.

---

## Architecture — The Big Picture

### Three brands, three repos

```
t2000 (this repo)    → Infrastructure: CLI, SDK, MCP, engine, gateway, contracts
audric (separate)    → Consumer product: audric.ai website, app, Chrome extension
suimpp (separate)    → Protocol: suimpp.dev, @suimpp/mpp, @suimpp/discovery
```

### This repo structure

```
t2000/
├── apps/gateway     ← MPP API gateway (mpp.t2000.ai, 40+ services, 88 endpoints)
├── apps/docs        ← Mintlify developer docs (developers.t2000.ai)
├── apps/web         ← t2000.ai marketing website
├── packages/cli     ← @t2000/cli (npm)
├── packages/sdk     ← @t2000/sdk (npm)
├── packages/engine  ← @t2000/engine (agent engine — AISDKEngine, tools, MCP)
├── packages/mcp     ← @t2000/mcp (npm)
├── t2000-skills/    ← Agent skill definitions
└── audric-roadmap.md ← Product roadmap + build tracker
```

### Two brand layers

**t2000** = infra. Names the underlying capabilities (engine, SDK, MCP, MPP gateway, contracts). Used in technical docs, package names, READMEs, dev-facing surfaces.

**Audric** = consumer. Names the surfaces a user touches. Always one of exactly **five products** (post-S.18 reframe): **Audric Passport, Audric Intelligence, Audric Finance, Audric Pay, Audric Store**. (S.17's 4-product cut overloaded Intelligence as both "moat" and "home for every financial verb." S.18 splits Finance back out — it's the home for save / borrow / swap / charts. Send + Receive collapse into Pay.)

#### The five products

| Audric product | What it is | t2000 layer |
|---|---|---|
| 🪪 **Audric Passport** | The trust layer. Identity (zkLogin via Google), non-custodial wallet on Sui, tap-to-confirm consent on every write, sponsored gas. Wraps every other product. | `@t2000/sdk` (wallet, signing) + Enoki (zkLogin, gas sponsorship) + `@mysten/sui` |
| 🧠 **Audric Intelligence** | The brain (the moat). Four systems orchestrate every money decision — Agent Harness (26 tools), Reasoning Engine (12 guards), Memory (MemWal), AdviceLog. Picks the tool, clears the guards, remembers what it told you. Engineering-facing brand; users experience it as "Audric just understood me." (v0.7d Phase 6 Block A — 2026-05-21 — collapsed former "Silent Profile" + "Chain Memory" into a single MemWal-backed "Memory" system. S.245 — 2026-05-22 — deleted `pay_api` + `mpp_services` tools per V07E_D_QUESTION_AUDITS D-2 reframe; 37 → 35. S.269 — 2026-05-23 — deleted `save_contact` (dead) + V07E_INVOICE_DEPRECATION deleted 3 invoice tools; 35 → 31. S.277 — 2026-05-23 — "Earns Its Keep" audit cut Volo trio + `web_search` + `protocol_deep_dive` + 2 dead guards; 31 → 26 tools, 14 → 12 guards.) | `@t2000/engine` (AISDKEngine + tools + reasoning + guards) + `@t2000/mcp` (skills exposed as MCP prompts) + `@mysten-incubation/memwal` (vector memory) |
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
| 🎛️ **Agent Harness** | 26 tools, one agent. The runtime that orchestrates Finance ops (save, swap, borrow, repay, charts), Pay ops (send, receive), and read tools (balances, DeFi positions, analytics) inside a single conversation. Parallel reads, serial writes under a transaction mutex. | `@t2000/engine` `AISDKEngine` + 26 tools (18 read / 8 write) |
| ⚡ **Reasoning Engine** | Thinks before it acts. Adaptive thinking effort per turn, complexity classifier, 14 safety guards (12 pre-execution + 2 post-execution hints) across 3 priority tiers (Safety > Financial > UX), preflight input validation, prompt caching. Multi-step orchestration ("rebalance my portfolio", "safe borrow", "swap and save") lives in **skills** — markdown playbooks in `t2000-skills/skills/*/SKILL.md`, baked into `@t2000/mcp` at build time and exposed to Cursor / Claude Desktop as MCP prompts. The engine no longer ships a YAML recipe runtime (deleted v0.7a Phase 6, May 2026); skill content guides the LLM, the engine just runs the tools the LLM picks. | `classify-effort.ts`, `guards.ts`, `t2000-skills/skills/`, extended thinking always-on |
| 🧠 **Memory (MemWal)** | Knows your finances. `@mysten-incubation/memwal` vector memory holds long-term facts about preferences, goals, risk tolerance, on-chain patterns. `prepareStep` recalls top-K facts each turn → `<memory_recall>` system-prompt block; `onFinish` calls `memwal.analyze()` to extract new facts post-turn. Plus a short-term daily `<financial_context>` block (savings/wallet/debt/HF/APY/recent activity) from `UserFinancialContext` Prisma model — fresh state, not inferred preferences. Both used silently to calibrate answers — never surfaced as nudges. (v0.7d Phase 6 Block A absorbed the former "Silent Profile" + "Chain Memory" systems into this one.) | `@mysten-incubation/memwal` SDK + `memwal-prepare-step.ts` + `memwal-write-callback.ts` + `UserFinancialContext` Prisma model + 02:00 UTC `financial-context-snapshot` cron + `buildFinancialContextBlock()` |
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

The canonical reference for these five products is the top of `audric-roadmap.md`.

### MCP-first DeFi integration

NAVI MCP (`https://open-api.naviprotocol.io/api/mcp`) handles all read operations. Writes use thin transaction builders via `@mysten/sui`. No protocol SDK dependencies needed.

**Do NOT import** `@naviprotocol/lending` or `@suilend/sdk` in new code. Use MCP for reads, direct Sui `Transaction` building for writes.

**Exception:** `@cetusprotocol/aggregator-sdk` is allowed for swap execution — multi-DEX routing across 20+ DEXs cannot be feasibly replaced by thin tx builders. All usage is isolated to `packages/sdk/src/protocols/cetus-swap.ts`.

---

## Critical Rules

1. **Never add Invest as a product.** Savings (under Audric Finance) covers yield.
2. **Never import protocol SDKs for new features** (except `@cetusprotocol/aggregator-sdk` for swap routing). Use MCP for reads, thin tx builders for writes.
3. **Never rename @t2000/* packages.** t2000 is the infra brand. Audric is the consumer brand.
4. **Never fork claude-code.** Study patterns, reimplement in @t2000/engine.
5. **Always check `developers.t2000.ai`** before writing documentation or marketing copy. Mintlify is the live docs SSOT (auto-deployed from `apps/docs/`) — covers product naming, CLI surface, SDK API, MCP tools. For code-level truth (fees, decimals, allowed-asset lists, error codes), read `packages/sdk/src/constants.ts` + `packages/sdk/src/token-registry.ts` directly.
6. **Always use `token-registry.ts`** for token metadata (tiers, `COIN_REGISTRY`, `isTier1` / `isTier2` / `isSupported` / `getTier`). Never hardcode decimals or coin types.
7. **Never read `process.env.X` directly in any app or package WITH ≥1 REQUIRED env var.** Apps that depend on a required env var MUST validate their env contract at boot via a Zod schema and expose values through a typed `env` proxy. Direct `process.env` reads bypass the gate that catches the empty-string-in-Vercel bug class. The canonical template is `audric/apps/web-v2/lib/env.ts` — schema + `instrumentation.ts` boot-time validation (audric enforces the no-raw-`process.env` convention via Biome/ultracite + code review, not an ESLint rule). The only exemption is `process.env.NODE_ENV` (a build-time constant). New env vars: add to the schema first, then read via `env.X`. See the lessons-learned entry in `audric-build-tracker.md` (S.20 / April 2026 BlockVision incident).<br>**Carve-out (S.227, 2026-05-21):** Apps with ZERO required env vars (e.g. `t2000/apps/web` — static marketing site with 3 optional Sui-address overrides) may validate inline at the read site instead of installing a full Zod gate. The bug class the rule prevents (REQUIRED var silently degrading) doesn't exist when there's nothing required to degrade. If such an app ever adds its first required var, ship the gate at that point.
8. **Fees are an Audric concern, not a t2000 concern.** As of `@t2000/sdk@1.1.0` (B5 v2, 2026-04-30), the SDK + CLI are fee-free by design. Audric is the only fee owner: `audric/apps/web-v2/app/api/transactions/prepare/route.ts` calls `addFeeTransfer(tx, coin, FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount)` inline for save/borrow and passes `overlayFeeReceiver: T2000_OVERLAY_FEE_WALLET` for Cetus swaps. The deprecated `t2000::treasury::collect_fee` Move call and `addCollectFeeToTx` helper were removed. New consumer apps that want to charge fees follow the same pattern (split + transfer to wallet inside the same PTB; the indexer detects USDC inflows to the wallet and writes `ProtocolFeeLedger` rows). See S.43 in `audric-build-tracker.md`.
9. **Push back** if a task violates simplicity or adds unnecessary complexity.

---

## Repo Layout

Read `REPO_LAYOUT.md` once at session start for "where does X go?"

**Short version:**
- **Root** = `README` / `LICENSE` / `CLAUDE.md` / `ARCHITECTURE.md` / `SECURITY.md` + tooling config + founder-local trackers (`audric-build-tracker.md`, `audric-roadmap.md`, `HANDOFF_NEXT_AGENT.md`) + `.smoke-*` tooling. Strict allowlist — any other file at root violates the rule.
- **`docs/`** — public-facing docs (tracked)
- **`spec/`** — internal SPECs, references, runbooks, archive. **Entire tree is local-only / gitignored** (the public repo never sees SPEC content). Active in-flight SPECs, locked design decisions, harness contracts, runbooks all live here for the maintainers; nothing in `spec/` is part of the published surface.

## Key Documents

| Document | What it covers | Read before |
|----------|---------------|-------------|
| [`developers.t2000.ai`](https://developers.t2000.ai) | Live docs SSOT — product naming, CLI surface, SDK API, MCP tools (Mintlify, auto-deployed from `apps/docs/`) | Documentation or marketing |
| `ARCHITECTURE.md` | Payment reporting, server registration flows | API or integration work |
| `REPO_LAYOUT.md` | Public layout SSOT — root allowlist + where docs go | Every session start |
| `audric-roadmap.md` (local-only) | Product roadmap, feature specs, revenue model (gitignored) | Feature planning |
| `HANDOFF_NEXT_AGENT.md` (t2000 + `audric/`, local-only) | **Forward-backlog SSOT.** The `audric/HANDOFF_NEXT_AGENT.md` "Active backlog" table is canonical for product / agent-ownable tasks (ranked, with effort + notes) + founder ops; the t2000 one covers the infra forward window + cross-repo cleanup and defers the audric backlog to it. | Picking the next task; planning |
| `audric-build-tracker.md` (local-only) | Reverse-chronological **execution log** — one `S.N` entry per shipped slice, newest on top (gitignored). This is the audit trail, **NOT** a forward backlog. To get the next SPEC number, read the latest `S.N` at the top of the file and increment. | Status checks; before assigning the next `S.N` |
| `spec/**` (local-only, gitignored) | Internal SPECs, harness contracts, locked-decision references, operational runbooks — full tree available on the maintainer's machine; not part of the public repo | When the rule/agent context cites a specific SPEC by name |
| `.cursor/rules/engineering-principles.mdc` | Scalability, single source of truth, trace-before-fix | **Every task** |
| `.cursor/rules/single-source-of-truth.mdc` | Canonical fetchers + ESLint enforcement | Portfolio/wallet/positions reads |
| `.cursor/rules/agent-harness-spec.mdc` | Spec 1 + Spec 2 contracts | Engine/resume route changes |
| `.cursor/rules/blockvision-resilience.mdc` | Retry + circuit breaker + sticky-positive cache rules | BlockVision integration changes |
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

### Engine commands

```bash
pnpm --filter @t2000/engine build      # Build (tsup → ESM)
pnpm --filter @t2000/engine test       # Run tests (vitest)
pnpm --filter @t2000/engine typecheck  # TypeScript strict check
pnpm --filter @t2000/engine lint       # ESLint
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
npm --prefix packages/engine version X.Y.Z --no-git-tag-version
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
1. Bumps all 4 package versions together (`sdk`, `engine`, `cli`, `mcp`) to the same version
2. Commits `📦 build: vX.Y.Z` to main
3. Creates and pushes the `vX.Y.Z` annotated tag
4. Explicitly triggers `.github/workflows/publish.yml` via `workflow_dispatch`

#### Step 2 — Publish pipeline runs automatically

`.github/workflows/publish.yml` (triggered by Step 1):
1. **CI** — lint + typecheck + test + build all packages
2. **Publish** — `pnpm publish` for each of the 4 packages (`continue-on-error: true` — safe if version already exists)
3. **GitHub Release** — `gh release create vX.Y.Z --generate-notes`
4. **Discord** — posts release notification to `#releases` channel

#### Step 3 — Update audric (downstream)

```bash
# In audric repo after npm publish completes:
cd /Users/funkii/dev/audric/apps/web
pnpm add @t2000/sdk@latest @t2000/engine@latest
cd /Users/funkii/dev/audric
git add -A && git commit -m "📦 build(web): bump @t2000/sdk + @t2000/engine to vX.Y.Z" && git push
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
- All 4 packages are always at the same version number (currently `4.x`) — no drift
- `continue-on-error: true` on publish steps — idempotent if a version already exists
- `workflow_dispatch` on `publish.yml` serves as a manual fallback if needed

---

## Engine (`@t2000/engine`)

Powers **Audric** — the conversational finance agent. Wraps `@t2000/sdk` in an LLM-driven loop.

### Import patterns

> **Removed exports (do NOT import — verified against `packages/engine/src/index.ts`):** `AISDKAnthropicProvider` (removed v3.1.0), `buildMcpTools` + `registerEngineTools` (removed v3.0.0 — the MCP server now wraps the SDK wallet, not engine tools), `defineTool` / `toolsToDefinitions` / `findTool` / `buildTool` (no public tool-factory export — engine tools are defined inside the package with the AI SDK `tool()` factory), and the legacy QueryEngine helpers `TxMutex` / `runTools` / `EarlyToolDispatcher` / `budgetToolResult` / `engineToSSE`. The v2 `AISDKEngine` serialises writes structurally (AI SDK step model + `needsApproval` round-trip) and dispatches read-only `isConcurrencySafe` tools mid-stream natively — no separate dispatcher.

```ts
// Core
import { AISDKEngine, getDefaultTools } from '@t2000/engine';
import { TOOL_POLICY, getToolPolicy } from '@t2000/engine';

// Streaming + sessions
import { serializeSSE, parseSSE } from '@t2000/engine';
import { MemorySessionStore } from '@t2000/engine';

// [v2.2.0 / SPEC 37 v0.7a Phase 5 Slice C] Stream checkpoint store —
// wire `EngineConfig.streamCheckpointStore` for page-reload / cold-start
// resume of the LIVE stream. Engine emits `stream_started` first
// (carries the engine-generated streamId), appends every event
// fire-and-forget, and replays the checkpoint when host passes the
// id back as `EngineConfig.resumeStreamId`. In-flight tool on resume
// is Path B (error + re-prompt). CLI / MCP / tests use the in-memory
// default; multi-instance hosts (audric on Vercel) inject Upstash.
import { InMemoryStreamCheckpointStore } from '@t2000/engine';
import type { StreamCheckpointStore } from '@t2000/engine';

// [v2.7.0 / SPEC_PHASE_7_DRAFT.md] Memory layer — wire
// `EngineConfig.memoryStore` and the engine assembles the system prompt
// in F-4 5-layer order via `prepareStep`:
// 1. base systemPrompt → 2. financialContextBlock → 3. <memory_recall>
// (top-K MemoryStore.recall(latestUserMessage)) → 4. skillRecipeBlock →
// 5. messages[]. Per-turn caching (single recall per submitMessage call)
// is load-bearing; recall failures degrade gracefully (empty layer 3).
// CLI / MCP / tests use the InMemoryMemoryStore default; production
// audric will inject MemWalMemoryStore post-2026-05-29 MemWal stability.
// See `.cursor/rules/memory-injection-architecture.mdc` for the contract.
import { InMemoryMemoryStore } from '@t2000/engine';
import type { MemoryStore, MemoryRecord } from '@t2000/engine';

// Context + cost + microcompact
import { estimateTokens, compactMessages, CostTracker, microcompact } from '@t2000/engine';

// Granular permissions (USD-aware)
import {
  resolvePermissionTier, resolveUsdValue, toolNameToOperation,
  DEFAULT_PERMISSION_CONFIG, PERMISSION_PRESETS,
} from '@t2000/engine';
import type { PermissionRule, UserPermissionConfig } from '@t2000/engine';

// MCP client (consume external MCPs, e.g. NAVI)
// Internally backed by @ai-sdk/mcp's createMCPClient since engine v2.1.0;
// McpClientManager class name + public method signatures preserved.
import { McpClientManager, NAVI_MCP_CONFIG, McpPromptAdapter } from '@t2000/engine';

// Token registry (shared with CLI/MCP — import from SDK)
import {
  isTier1,
  isTier2,
  isSupported,
  getTier,
  COIN_REGISTRY,
  TOKEN_MAP,
} from '@t2000/sdk';
```

### Engine event types

```ts
type EngineEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'thinking_done' }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; toolName: string; toolUseId: string; result: unknown; isError: boolean }
  | { type: 'pending_action'; action: PendingAction } // PendingAction.attemptId is a UUID v4 stamped per-yield — host persists it on TurnMetrics + keys resume updateMany on it
  | { type: 'canvas'; html: string }
  | { type: 'turn_complete'; stopReason: StopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'error'; error: Error }
  | { type: 'stream_started'; streamId: string }; // [v2.2.0 Slice C] emitted FIRST when streamCheckpointStore configured
```

### Tool permission levels

- `auto` — read-only tools, execute without approval
- `confirm` — write tools, yield `pending_action` for client-side execution
- `explicit` — manual-only, never dispatched by LLM

**Granular USD-aware permissions (B.4):** Computed every turn + recorded on `TurnMetrics` for analytics in audric/web-v2; auto-execute is **structurally disabled** under zkLogin (no server-side signing agent → `need-approval.ts:113-115` short-circuits every write to confirm-tier). Every write in the shipping app requires a Passport tap-to-confirm by design (Round 3 architectural decision — `SPEC_AI_SDK_HARDENING.md` P4.7). When `permissionConfig` + `priceCache` are set on `ToolContext` AND a server-signing agent IS injected (e.g., `@t2000/cli` engine usage), `resolvePermissionTier(operation, amountUsd, config)` resolves dynamically — sub-threshold writes auto-execute, larger writes downgrade to `confirm`, very large writes go `explicit` (manual only). Three presets: `conservative` (default for new accounts; most writes auto under $5), `balanced` (DEFAULT_PERMISSION_CONFIG; most writes auto under $10–$25), `aggressive` (most writes auto under $25–$100). `borrow` is always `confirm` (`autoBelow: 0` across every preset). Cumulative daily spend > `autonomousDailyLimit` downgrades any `auto` to `confirm` as a runtime safety net. See `.cursor/rules/safeguards-defense-in-depth.mdc` for the full table + canonical preset values.

### Tool result budgeting (B.2)

Tools can set `maxResultSizeChars` to cap output size. Results exceeding the limit are truncated with a hint: `[Truncated — N lines omitted. Call toolName with narrower parameters.]`. Custom `summarizeOnTruncate` callbacks supported.

### Streaming tool execution (B.1)

In `AISDKEngine` (v2), AI SDK natively dispatches read-only `isConcurrencySafe` tools mid-stream — each `tool-call` event triggers execution as soon as the tool block completes (no separate dispatcher needed). Write tools still go through the permission gate (`needsApproval` callback) after the stream's `start-step` / `finish-step` boundary. Results stream back via `tool-result` events in original dispatch order. The legacy `EarlyToolDispatcher` is still exported for back-compat with non-AISDKEngine callers (CLI, MCP), but the v2 engine doesn't use it — the AI SDK step model is the native mechanism.

### Microcompact (B.3)

`microcompact(messages)` deduplicates identical tool calls (same name + input) in conversation history, replacing repeated results with `[Same result as turn N]`. Runs as Phase -1 in `compactMessages` (`packages/engine/src/context.ts`), invoked every turn by the v2 `AISDKEngine`.

### Built-in tools

Read (18): `render_canvas`, `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`, `swap_quote`, `explain_tx`, `portfolio_analysis`, `token_prices`, `create_payment_link`, `list_payment_links`, `cancel_payment_link`, `spending_analytics`, `yield_summary`, `activity_summary`, `resolve_suins`, `pending_rewards` (S.119 — preview claimable rewards before harvesting; companion to `harvest_rewards`)
Write (8): `save_deposit` (USDC + USDsui — strategic exception, see `.cursor/rules/savings-usdc-only.mdc`), `withdraw`, `send_transfer`, `borrow` (USDC + USDsui), `repay_debt` (USDC + USDsui — must repay with same asset as borrow), `claim_rewards`, `harvest_rewards` (S.119 — compound: claim → swap each non-USDC reward to USDC → deposit merged USDC into NAVI savings, single PTB; per-leg fees: 10 bps Cetus overlay per swap + 10 bps NAVI save fee on the deposit per S.120), `swap_execute`

> **S.245 (2026-05-22):** `pay_api` (write) + `mpp_services` (read) deleted per V07E_D_QUESTION_AUDITS D-2 reframe. Net 37 → 35 tools. The legacy MPP gateway capability returns as a Commerce primitive in the upcoming Audric Store SPEC — clean-slate redesign, not a port of the legacy 3-leg apps/web flow.
>
> **S.269 (2026-05-23):** `save_contact` deleted (was a dead host-side write — engine never persisted contacts; audric/web-v2 does it directly). V07E_INVOICE_DEPRECATION (item 7 of the same SPEC) deleted 3 invoice tools (`create_invoice`, `list_invoices`, `cancel_invoice`) + `InvoiceSchema` from `packages/engine/src/tools/receive.ts`. Payment links absorb the invoicing use case (label/memo encode context). Engine bumped 2.16.0 → 2.17.0. Net 35 → 31 tools.
>
> **S.269 item 6 (2026-05-23):** `save_contact` (write) deleted as part of the template-divergence cleanup slice. Engine-side dead tool — host-side Prisma persistence with no engine-owned effect; the user surface is the audric send screen, not the LLM. Net 35 → 34 tools.
>
> **S.277 (2026-05-23):** "Earns Its Keep" audit (engine 2.18.0 + 2.18.1 residue cleanup) cut 5 tools + 2 dead guards. **Volo trio** (`volo_stats`, `volo_stake`, `volo_unstake`) — no Audric chip, no product slot in the 5 named products; `harvest_rewards` routes vSUI via Cetus, not Volo, so cutting Volo is safe. (Pre-S.323: SDK + CLI + MCP retained Volo for "non-Audric consumers"; S.323 cut those too.) **`web_search`** — Brave-backed; already filtered out in audric production (gateway path uses Vercel AI Gateway's `perplexity_search`). `BRAVE_API_KEY` env var also removed. **`protocol_deep_dive`** — DefiLlama-backed; `rates_info` is the in-product proxy for protocol safety. Engine no longer talks to `api.llama.fi`. Also deleted: 2 dead post-cut guards (`costWarning`, `artifactPreview`) + the `costAware` tool flag — both became unreachable post-S.245. **`explain_tx` kept but rethought** — description tightened to "arbitrary external digest only" and the system-prompt primary steer was dropped (`transaction_history` covers the user's own activity). Net 31 → 26 tools (18 read / 8 write), 14 → 12 guards. Patch 2.18.1 scrubbed parallel registries the initial 2.18.0 cut missed (`permission-rules.ts` TOOL_TO_OPERATION + `resolveUsdValue`, `describe-action.ts` switch, `v2/tool-policy.ts` TOOL_POLICY, `tools/tool-modifiable-fields.ts`, `prompt/index.ts` DEFAULT_SYSTEM_PROMPT default steers).

> **Removed in the April 2026 simplification (S.7):** `allowance_status`, `toggle_allowance`, `update_daily_limit`, `update_permissions`, `create_schedule`, `list_schedules`, `cancel_schedule`, `pattern_status`, `pause_pattern` — 9 tools deleted. Allowance contract is dormant; scheduled actions can't sign without user presence under zkLogin; pattern detectors stay as silent classifiers (not user-facing proposals).
>
> **Removed in v1.4 BlockVision swap (April 2026):** 7 `defillama_*` tools — `defillama_token_prices`, `defillama_price_change`, `defillama_yield_pools`, `defillama_protocol_info`, `defillama_chain_tvl`, `defillama_protocol_fees`, `defillama_sui_protocols`. Replaced by 1 `token_prices` tool (BlockVision-backed). `balance_check` and `portfolio_analysis` rewired to BlockVision Indexer REST API. `protocol_deep_dive` retained its DefiLlama dependency (lone production consumer of `api.llama.fi`) until S.277 — cut in engine 2.18.0 ("Earns Its Keep" audit). Engine no longer talks to `api.llama.fi`. See `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`.
>
> **S.323 (2026-05-25) — full Volo removal across SDK + CLI + MCP.** S.277 left Volo helpers in `@t2000/sdk` (`agent.stakeVSui`, `agent.unstakeVSui`, `protocols/volo.ts`, composeTx `volo_stake` / `volo_unstake` appenders + types), the CLI (`t2000 stake` / `t2000 unstake`), and `@t2000/mcp` (`t2000_stake` / `t2000_unstake`) on the rationale that "non-Audric consumers" might still want VOLO liquid staking. They don't — there are no non-Audric consumers of the t2000 SDK / CLI / MCP, so those surfaces were dead code. S.323 cuts the lot. vSUI remains as a passive token (NAVI reward type, Cetus swap target). MCP tool count 29 → 27. CLI commands: `t2000 stake` / `t2000 unstake` removed. SDK: `agent.stakeVSui` / `agent.unstakeVSui` / `protocols/volo.*` / Volo composeTx branches all gone. Released as v3.3.0 (minor — same convention as S.277 feature cuts).
>
> **S.336 (v4.0, 2026-05-25) — Agent Wallet pivot reshaped the CLI + MCP surfaces.** `@t2000/cli` (bin `t2`, with `t2000` alias) and `@t2000/mcp` were narrowed to a **wallet + payments** surface — the DeFi commands/tools (`save`, `withdraw`, `borrow`, `repay`, `claim`) were dropped from CLI and MCP. **`@t2000/mcp` now registers 9 tools** (5 read + 3 write + 1 limit), not 27. The `@t2000/sdk` still exposes the full DeFi builder surface (`agent.save()` etc.) for programmatic use, and the **engine** keeps its 26 tools (Audric's surface) — only the CLI/MCP developer surfaces were narrowed. See the S.336 entry in `audric-build-tracker.md`.
>
> See the S.0–S.12 entries in `audric-build-tracker.md` for the locked decisions on what we won't bring back. `record_advice` is an audric-side tool (not exported from `@t2000/engine`).

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
