# Engineer Onboarding — t2000 + Audric

> **Goal:** read this once (~30 min), get both repos running, and know where to look for everything else.
> **This is the map, not the territory.** The detailed, always-current task lists live in `HANDOFF_NEXT_AGENT.md` (one in each repo). Those are **local-only (not committed)** — the founder shares them with you directly. This file is the source of truth for *how everything fits together and how to get started*.

---

## 1. The 60-second mental model

There are **three brands** living in **two code repos**:

| Brand | What it is | Where the code lives |
|---|---|---|
| **t2000** | Infrastructure. The CLI, SDK, agent engine, MCP server, API gateway. Developer-facing. | `~/dev/t2000` (this repo) |
| **Audric** | The consumer product. The app real users sign into at `audric.ai`. | `~/dev/audric` (sister repo) |
| **suimpp** | The open payment protocol underneath. | separate repo (rarely touched day-to-day) |

**The one-line version:** Audric is the product users touch; t2000 is the engine room that powers it. Audric imports t2000's published npm packages (`@t2000/engine`, `@t2000/sdk`, etc.) and adds the UI, auth, and database on top.

**Audric is exactly five products** — everything a user can do is one of them:

| Product | What it does |
|---|---|
| 🪪 **Passport** | Sign in with Google → a non-custodial Sui wallet in seconds. Every money action taps to confirm. Gas is sponsored. |
| 🧠 **Intelligence** | The AI agent (the moat). Understands your money, reasons behind safety guards, remembers context. |
| 💰 **Finance** | Save / borrow / swap / charts — on-chain, from chat. |
| 💸 **Pay** | Send + receive USDC. Free, global, instant. Payment links + QR. |
| 🛒 **Store** | Creator marketplace — sell AI-generated content in USDC. **Coming soon.** |

> If you're ever unsure whether something is "infra" or "product," ask: *does a real user see it?* If yes → Audric. If it's a package/tool/endpoint a developer consumes → t2000.

---

## 2. Day 1 — get both repos running

### Prerequisites

- **Node.js** — no version is pinned (no `engines` field), and everything runs on current Node fine. The one exception is the Mintlify docs site (`apps/docs`), which needs an LTS (20/22). If you'll touch docs, keep an LTS handy via `nvm`/`fnm`.
- **pnpm 10.6.2** — both repos pin it via the `packageManager` field. Easiest: `corepack enable` then let it auto-install the pinned version.
- **git**, and access to both repos.

### t2000 (infra monorepo)

```bash
cd ~/dev/t2000
pnpm install
pnpm build          # build all packages (turbo)
pnpm typecheck      # tsc across the workspace
pnpm test           # run the test suites
```

It's a monorepo with `apps/*` (deployable apps) and `packages/*` (npm packages). Run one app or package at a time with a filter:

```bash
pnpm --filter @t2000/engine test        # test just the engine
pnpm --filter @t2000/cli build          # build just the CLI
pnpm --filter gateway dev               # run the MPP gateway dev server
```

### Audric (the consumer product — where most live traffic is)

```bash
cd ~/dev/audric
pnpm install
cp apps/web-v2/.env.example apps/web-v2/.env.local   # then fill in the values (ask the founder)
pnpm dev            # Next.js dev server on http://localhost:3001
pnpm typecheck
pnpm lint           # Biome via ultracite — NOT ESLint
pnpm check:ads      # guard: fails if a legacy design-system token sneaks back in
pnpm test           # vitest
```

Env vars are validated at boot by a Zod schema (`apps/web-v2/lib/env.ts`). If you're missing a required var, the app tells you exactly which one — fill it in `.env.local` and restart.

### Sanity check you're set up

- t2000: `pnpm build && pnpm test` is green.
- Audric: `pnpm dev` boots, you can load `localhost:3001`, and `pnpm typecheck && pnpm lint && pnpm check:ads` are all clean.

---

## 3. Repo map — where does X live?

### t2000 (`~/dev/t2000`)

```
apps/
  gateway/      → MPP API gateway (mpp.t2000.ai) — paid-API proxy, the "pay-per-call" layer
  docs/         → Mintlify developer docs (developers.t2000.ai)
  web/          → t2000.ai marketing site
packages/
  sdk/          → @t2000/sdk     — wallet, balances, transactions, Sui/NAVI/Cetus builders
  engine/       → @t2000/engine  — the agent (tools, reasoning, guards, MCP, streaming)
  cli/          → @t2000/cli     — the `t2` command-line wallet
  mcp/          → @t2000/mcp     — exposes engine tools/skills to Claude Desktop, Cursor, etc.
  ui/           → @t2000/ui      — Geist design-system tokens
t2000-skills/   → agent skill playbooks (SKILL.md files)
team-docs/      → this onboarding doc + team-facing guides
```

Full "where does X go?" reference: **`REPO_LAYOUT.md`** (repo root).

### Audric (`~/dev/audric`)

```
apps/web-v2/    → THE app. Next.js 16, React 19, AI SDK v6, the chat UI, auth, API routes, DB.
                  This is the production surface — almost all real work happens here.
```

Key files inside `apps/web-v2`:
- `app/chat/audric-chat-client.tsx` — the chat client (confirm flow / tool results)
- `app/api/chat/route.ts` — the chat API route (drives the engine, streaming, resume)
- `lib/env.ts` — env validation gate
- `lib/audric-auth.ts` — zkLogin auth verification

### The two most important docs to read after this one

1. **`t2000/CLAUDE.md`** — the canonical architecture + conventions doc (brands, the 5 products, release process, coding rules). It's long but it's the bible.
2. **`audric/CLAUDE.md`** — the same, for the consumer app.

---

## 4. How we work (conventions that matter)

- **Single source of truth, always.** Don't copy token maps, prices, decimals, or fetch logic. Import from the canonical place. (See `t2000/.cursor/rules/single-source-of-truth.mdc` and `engineering-principles.mdc`.)
- **Trace the full path before fixing a bug.** Most wasted time comes from fixing the wrong layer. Identify *which layer owns the bug* (SDK? engine? Audric app? API route?) before writing code.
- **Surgical changes.** Touch only what the task needs. No "while I'm here" refactors.
- **Money is floored, never rounded up.** Display/transaction amounts must be `≤` the real on-chain balance. (See `financial-amounts.mdc`.)
- **Never read `process.env.X` directly** in any app with required env vars — go through the Zod `env` gate. (See `env-validation-gate.mdc`.)

### Linting

- **t2000** uses ESLint (flat config) in a couple of apps.
- **Audric** uses **Biome / ultracite** (`pnpm lint`), *not* ESLint. Don't reach for `.eslintrc`.

### Commits

Format: `emoji type(scope): subject` — e.g. `🐛 fix(engine): floor swap amount to token decimals`.
Types: ✨ feat · 🐛 fix · 📝 docs · ♻️ refactor · ⚡ perf · ✅ test · 📦 build · 🔧 chore.
**Only commit when asked.** Don't auto-commit work.

### Releasing t2000 packages (when a change lands in sdk/engine/cli/mcp)

All four packages version together. **Never bump versions or publish by hand** — trigger the workflow:

```bash
gh workflow run release.yml --field bump=patch   # patch | minor | major
```

Then bump Audric's dependency on the new version (`cd audric && pnpm add @t2000/sdk@latest @t2000/engine@latest`) and push — Vercel auto-deploys. Full steps are in `t2000/CLAUDE.md` → "Release process."

### A note on the Cursor rules

Both repos have `.cursor/rules/*.mdc` files. These are conventions the AI assistant (and you) should follow. Skim the t2000 ones — `engineering-principles`, `coding-discipline`, `single-source-of-truth`, `safeguards-defense-in-depth`, `financial-amounts` — they encode hard-won lessons.

---

## 5. Where we are right now (the task board)

> **The detailed, always-current task lists are the two `HANDOFF_NEXT_AGENT.md` files** (one per repo, shared with you directly — they're not in the repo). Below is the distilled, high-level snapshot as of **2026-06-01**.

### Recently shipped (context, not work)

- **The whole product is on the new Geist design system** (the big visual migration is done across `t2000.ai`, `audric.ai`, docs, gateway).
- **`@t2000/*@4.1.0` is live on npm** and Audric is on it. Per-asset balance cards (USDC vs USDsui) shipped.
- **MPP Dogfood Foundation (t2000 gateway + SDK)** — hardened the pay-per-call loop: honest cost reporting, binary outputs (audio/PDF/images) returned as hosted URLs, and pricing collapsed to one source of truth. Plus a refreshed set of MPP "recipes" in the docs.

### In flight / next up (see the HANDOFFs for detail)

| Where | Item |
|---|---|
| **Audric** | **AUTH-SESSION** — lengthen the effective sign-in session so users aren't logged out so often (move to a server-minted session). Good first meaty task. |
| **t2000** | **gRPC migration** — Sui's JSON-RPC is being deactivated (mid-2026), so the SDK must move to gRPC. Calendar-driven — the highest time-risk item. |
| **t2000 / Audric** | **Audric Store** — the creator marketplace (sell AI-generated content in USDC). In design. Large, founder-gated. |
| **Audric** | **MPP-AUDRIC** — let Audric itself call paid APIs from chat. Currently blocked on a wallet-signing gap. |
| **Audric** | **Fiat on/off-ramp** — buy crypto with card/bank + cash out to bank. Marketed but not built; design/provider-gated. |
| **Audric** | Smaller items: security-header hardening, memory controls, schema cleanup, dead-code cleanup. Ranked in the audric HANDOFF. |

> ℹ️ Heads-up on docs: the `HANDOFF_NEXT_AGENT.md` files, the `spec/` trees, and the build trackers are **local-only** — they hold detailed internal task state and aren't committed. The founder shares them with you directly. This onboarding doc is the committed, shareable entry point.

---

## 6. Your first week — a suggested ramp

A good order so you build a working model before touching production:

1. **Get both repos green** (Section 2). Don't skip — a broken local env wastes the whole first day later.
2. **Read `t2000/CLAUDE.md` and `audric/CLAUDE.md`** end to end. Then skim `ARCHITECTURE.md` and `REPO_LAYOUT.md` in t2000.
3. **Use the product as a user.** Sign into `audric.ai`, fund a wallet with a few test dollars, send/swap/save. Feel the tap-to-confirm flow. This makes the code make sense.
4. **Trace one real flow end to end.** Pick "send USDC": follow it from the chat UI (`audric-chat-client.tsx`) → the API route (`app/api/chat/route.ts`) → the engine tool → the SDK transaction builder. This is the single best exercise for understanding the architecture.
5. **Pick a small task from a HANDOFF.** Something local and bounded — a documented backlog item, a test gap, a small fix. Get one PR through the loop (branch → change → typecheck/lint/test → PR).

### Splitting the work between you two (suggestion — confirm with the founder)

- **Engineer A → Audric / product:** the app, auth, chat UI, tool-result cards, the `AUTH-SESSION` fix. Most live-user impact.
- **Engineer B → t2000 / infra:** the engine, SDK, gateway, the gRPC migration (deadline-driven), MPP. Most foundational.

Both should understand both sides — but having a "primary" each keeps ownership clear.

---

## 7. Glossary (the jargon you'll hit on day one)

| Term | Meaning |
|---|---|
| **Sui** | The blockchain everything runs on. |
| **zkLogin** | Sign-in-with-Google that produces a real crypto wallet — no seed phrase. Powers Audric Passport (via **Enoki**, Mysten's hosted service). |
| **Enoki** | Mysten Labs service that provides zkLogin + **sponsored gas** (we pay the network fee so users don't need SUI). |
| **Non-custodial** | We can't move users' money. They approve every transaction. |
| **USDC / USDsui** | The stablecoins. USDC is canonical; USDsui is a strategic exception for savings/borrow. SUI is the gas/native token. |
| **NAVI** | The lending protocol we use for Save (earn yield) and Borrow. |
| **Cetus** | The DEX aggregator we use for Swap (best route across 20+ DEXs). |
| **gasless** | A send where the Sui foundation sponsors the gas — user pays zero network fee. |
| **MPP** | Micro-Payment Protocol — the "pay a few cents per API call" system behind the gateway (`mpp.t2000.ai`). Lets an agent pay-as-it-goes for paid APIs (image gen, transcription, etc.). |
| **Gateway** | `apps/gateway` — the server that proxies those paid APIs and charges per call. |
| **Agent / engine** | `@t2000/engine` — the LLM-driven loop that picks tools, runs safety guards, and talks to the SDK. |
| **Tool** | A capability the agent can invoke (e.g. `balance_check`, `swap_execute`). 26 of them: 18 read, 8 write. |
| **Guard** | A safety check that runs around every write (health factor, balance, slippage, etc.). 12 of them. |
| **HITL** | Human-in-the-loop — the tap-to-confirm step before any write executes. |
| **Skill** | A markdown playbook (`SKILL.md`) that guides the agent through a multi-step flow. |
| **MCP** | Model Context Protocol — how we expose our tools/skills to external AI clients like Claude Desktop and Cursor. |
| **Walrus / Seal** | Sui's decentralized storage + access-control (aspirational backend for permanent Store content). |
| **Canvas** | An interactive in-chat visualization (portfolio timeline, yield projector, etc.). |

---

## 8. Key links

| Resource | URL |
|---|---|
| Consumer product | https://audric.ai |
| Developer docs | https://developers.t2000.ai |
| Infra site | https://t2000.ai |
| MPP gateway | https://mpp.t2000.ai |
| GitHub | https://github.com/mission69b/t2000 |

**When in doubt:** the two `CLAUDE.md` files answer "how does this work / what's the convention," and the two `HANDOFF_NEXT_AGENT.md` files answer "what should I work on." Start there, then ask.

---

*Welcome aboard. The codebase rewards tracing things end to end — when something's confusing, follow the data, don't guess.*
