# WHY v0.7a — The Strategic Case

> **Status:** locked 2026-05-15 alongside [audric-v07a-engine-drain.plan.md](/Users/funkii/.cursor/plans/audric-v07a-engine-drain.plan.md). This is the founder-facing "why we're doing this" doc; the plan is the engineer-facing "what we're doing"; [BENEFITS_SPEC_v07a.md](/Users/funkii/dev/t2000/BENEFITS_SPEC_v07a.md) is the verifiable scoreboard with 48 specific benefits + verification criteria. Read THIS doc before kickoff to internalize the strategic case; re-read the SPEC at every verification phase to track realization rate.
>
> **Companion docs:**
> - [BENEFITS_SPEC_v07a.md](/Users/funkii/dev/t2000/BENEFITS_SPEC_v07a.md) — formal benefits inventory with verification criteria (48 benefits across 5 categories)
> - [audric-v07a-engine-drain.plan.md](/Users/funkii/.cursor/plans/audric-v07a-engine-drain.plan.md) — execution plan
> - [audric-engine-decision-doc_8f3c1e92.plan.md](/Users/funkii/.cursor/plans/audric-engine-decision-doc_8f3c1e92.plan.md) — path A/B/C trade-offs

---

## The framing question

> **"This will be the 3rd time I'm changing architecture. Why is this one worth it?"**

Direct answer: **this is the LAST major engine architecture change for the foreseeable future.** After v0.7a + optional v0.7b + cleanup SPEC + UI modernization (v0.7c, separate), future changes are additive (new tools, new MCP integrations, new skills, new memory patterns) — not paradigm-shifting. The reason this 3rd pivot is the right one is that you're moving FROM bespoke infrastructure TO industry standards, and standards don't churn the same way custom code does.

The previous two pivots were within the same paradigm (custom-engine evolution). v0.7a moves paradigms — to AI SDK + MCP + MemWal. Standards are sticky.

---

## Benefits inventory (organized by category)

### 1. Concrete code + cost reduction (measurable today)

| What gets deleted | LoC saved | Replaced by |
|---|---|---|
| `buildTool` factory boilerplate | ~1,000 | AI SDK `tool()` (native) |
| Custom recipe loader/registry | ~510 | Anthropic Agent Skills format |
| Hand-rolled `AnthropicProvider` | ~612 | `@ai-sdk/anthropic` (~50 LoC wrapper) |
| Custom `McpClientManager` | ~250 | `createMCPClient` (~30 LoC wrapper) |
| Hand-rolled SSE serializer | ~158 | `createUIMessageStream` |
| `EarlyToolDispatcher` | ~206 | Native `streamText` parallel dispatch |
| Daily Claude inference cron | infra | MemWal vector retrieval |
| **Engine total** | **~21,800 → ~13,250 LoC (-38%)** | |

**Operational cost reduction (concrete):**
- Daily Claude inference cron eliminated = ECS task removed = estimated $50-200/month AWS savings (depends on user count)
- Anthropic prompt caching becomes native (AI SDK supports it) = potential 30-40% input-token reduction on context-heavy turns
- Less custom code = less time fixing bugs that don't exist in standards

### 2. LLM provider portability (the Qwen unlock)

This is THE strategic benefit for the long-term roadmap.

- AI SDK is provider-agnostic via `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/xai`, `@ai-sdk/openai`, etc.
- Future Qwen self-hosted migration becomes a **config change**, not a refactor:
  ```ts
  // Today (post-v0.7a): Anthropic
  const model = anthropic('claude-sonnet-4');

  // Tomorrow: self-hosted Qwen via OpenAI-compatible endpoint
  const model = createOpenAICompatible({ baseURL: 'http://qwen-internal:8000/v1' })('qwen-72b');
  ```
- Anthropic Memory Tool was hard-excluded specifically because it would have provider-locked the stack. AI SDK + MemWal keeps Audric portable.
- Once on AI SDK: swap to OpenAI / Google / xAI / DeepSeek / Llama / Mistral via 1-line provider change.
- **Cannot achieve this with the hand-rolled engine** — it's anthropic-shaped down to the wire format.

### 3. Standards adoption → cross-tool composability

Custom code is consumable only by code that knows our shape. Standards are consumable everywhere.

- **Tools** as AI SDK `tool()` → portable to any AI SDK consumer
- **Skills** as Anthropic Agent Skills format → consumed by Cursor, Claude Desktop, claude-code CLI, audric, future apps from a SINGLE source of truth (`t2000-skills/skills/`)
- **MCP prompts adapter** → audric becomes the "speak any Sui protocol's MCP" agent. When DeepBook V2 / Cetus / Volo ships an MCP, audric absorbs it via 1 registry entry, ZERO engine changes.
- This is what makes Audric Intelligence a moat that strengthens over time — every new Sui protocol's MCP makes Audric more capable without any audric work.

### 4. Memory infrastructure scalability + Mysten alignment

- ECS daily cron → MemWal vector retrieval = **scales horizontally** (no cron capacity ceiling)
- Top-K retrieval > 30-day time window for AdviceLog (relevance > recency)
- Top-K retrieval scales to N years of history, not a 30-day cliff
- **Mysten partnership reinforced** — MemWal is their flagship product; committing to it strengthens the relationship that matters for Audric's roadmap (Audric Store, on-chain treasury, future Sui-native product partnerships)
- Heavy ECS workload eliminated = one less service to monitor, deploy, scale, debug
- **Strategic confirmation:** [MystenLabs/MemWal/apps/chatbot](https://github.com/MystenLabs/MemWal/tree/dev/apps/chatbot) — Mysten's reference app for MemWal integration is built on the AI SDK + Vercel chatbot template. Their canonical pattern IS our v0.7a stack.

### 5. AI SDK feature unlocks (NOT in current engine)

You inherit features for free that we'd otherwise have to build:

| Feature | Cost to build hand-rolled | AI SDK |
|---|---|---|
| `experimental_transcribe` (voice) | Already partially built | Native + better |
| `experimental_telemetry` (OpenTelemetry) | ~500 LoC custom | Native |
| `prepareStep` (per-step tool gating) | ~300 LoC | Native |
| Page-reload stream resume | Would be ~600 LoC | Native (UIMessage protocol) |
| `experimental_toToolResultContent` | ~200 LoC | Native |
| Native typed errors (`AI_APICallError`) | ~120 LoC `sanitizeStreamErrorMessage` | Class hierarchy |
| Computer use (when Anthropic ships it) | Would require engine refactor | Free in AI SDK |
| Citations (when Anthropic ships it) | Would require engine refactor | Free in AI SDK |

### 6. Reliability + battle-testing

- AI SDK is used by Vercel-scale customers (Linear, Notion AI, Cursor, etc.)
- Provider quirks (Anthropic stream-state, prompt cache invalidation, tool_use_id format, retry semantics) are handled by AI SDK maintainers, not us
- 1,195 engine tests stay; AI SDK has its own test suite covering provider edge cases on top
- Bug surface area shrinks as AI SDK absorbs more of the work

### 7. Anthropic upstream compatibility (zero-effort)

- Today: when Anthropic ships a new feature, we manually port to our hand-rolled provider — typically 1-3 weeks of work per feature
- Post-v0.7a: AI SDK ships these within days of Anthropic's release; we get them by bumping `@ai-sdk/anthropic` version
- Goes from "monitor Anthropic releases + build custom support" to "monitor AI SDK releases + bump version"

### 8. Audric Intelligence moat preservation (moves UP the stack)

The moat doesn't disappear — it moves up.

**Today's "moat" (fragile):**
- Hand-rolled engine code = "we built it ourselves"
- Anyone with 6 weeks could rebuild it on AI SDK
- Doesn't actually differentiate the product — users don't see the engine

**Post-v0.7a moat (durable):**
- 37 tools (Audric IP — domain knowledge of Sui DeFi)
- 14 guards (Audric IP — financial safety logic)
- 5+ skills (Audric IP — composable agent behaviors)
- USD-aware permissions resolver (Audric IP — granular trust model)
- MemWal-backed memory (Audric IP — finance-domain memory pattern)
- `<financial_context>` block + canonical portfolio fetcher (Audric IP — financial state model)
- Sponsored-tx flow (Audric IP — UX without gas friction)
- 5 products (Passport, Intelligence, Finance, Pay, Store) bundled cohesively

The moat moves from "infrastructure we built" to **"agent IP that solves a domain problem"** — which is what users actually pay for.

### 9. Developer velocity + onboarding

- Less custom code = faster iteration on tools / skills / features
- Future engineers know AI SDK natively; they don't know `@t2000/engine`
- Standard patterns = easier to onboard contractors / partners / future hires
- Less context to load per agent session = lower token spend on every chat
- AI SDK has thousands of code examples on the internet; `@t2000/engine` has zero

### 10. Strategic positioning + investor narrative

- "Built on Vercel AI SDK + MCP standards + MemWal" is a recognizable, fundable stack
- Easier conversation with Mysten Labs (MemWal is THEIR product → strategic alignment)
- Easier conversation with Anthropic (we're an AI SDK consumer → standard support path)
- Easier conversation with investors (no proprietary infrastructure risk story)
- Easier hiring (engineers know AI SDK)

### 11. Tech debt accumulation rate

- Custom engine grows complexity proportional to features added
- AI SDK absorbs complexity through framework features
- **Future tech debt accumulates more slowly** because the framework absorbs the surface area

### 12. Documentation + knowledge transfer

- AI SDK is documented at [ai-sdk.dev](https://ai-sdk.dev) with tutorials, examples, community forums, GitHub discussions
- Custom `@t2000/engine` docs only exist in our repo (and CLAUDE.md drift accumulates)
- New agents working on audric understand AI SDK natively from training data
- Less context required = lower token spend per turn for every agent session

### 13. v0.7b option creation

v0.7a creates the OPTION to fully eliminate the engine wrapper later. After Phase 8 close:
- If 0 significant gaps surfaced → v0.7b ships, engine package deleted, audric/web pure AI SDK consumer
- If 1 gap surfaced → v0.7b ships reduced; engine wrapper kept for the gap-bridging code
- If 2+ gaps surfaced → drained engine becomes permanent thin wrapper; option NOT exercised

The option itself is valuable independent of whether it gets exercised.

### 14. UI modernization unlock (v0.7c, separate)

After v0.7a/v0.7b, the path to a modern UI shell opens up. The Vercel chatbot template ([github.com/vercel/chatbot](https://github.com/vercel/chatbot)) gives audric a curated reference: artifacts, multimodal attachments, resumable streams, modern conversation history sidebar, sharing.

**Critically:** [MystenLabs/MemWal/apps/chatbot](https://github.com/MystenLabs/MemWal/tree/dev/apps/chatbot) is Mysten's reference fork. The strategic alignment isn't only at the engine layer — it extends to the UI layer too.

**Specific user-facing capabilities unlocked at v0.7c (formalized as U-1 through U-7 in [BENEFITS_SPEC_v07a.md](/Users/funkii/dev/t2000/BENEFITS_SPEC_v07a.md)):**

- **Artifacts** — generative UI for charts, payment links, invoices, receipts, listings, document previews. Replaces the current canvas HTML-string approach with first-class rendering.
- **Multimodal attachments** — image / file upload integrated with tools. "OCR this receipt", "scan this QR code", "screenshot of my balance" become real flows.
- **Resumable streams** — page reload during a streaming response resumes from last delta. No more "where did my answer go?"
- **Conversation sharing** — shareable chat links for Audric Store creator profiles, audit trails, support tickets.
- **Modern conversation history sidebar** — Vercel chatbot template's UX polish.
- **Voice input UX modernization** — backend wired in v0.7a Phase 1 (`experimental_transcribe`); UX polish lands in v0.7c.
- **Cross-product UI consistency** — all 5 products (Passport / Intelligence / Finance / Pay / Store) consume the same chat UI primitives.

v0.7c (Audric UI Modernization SPEC) ships AFTER v0.7b. Out of v0.7a scope, but enabled by it.

### 15. CI / release infrastructure modernization (Mysten alignment at the deployment layer)

The MemWal CI review surfaced 7 concrete operational improvements (formalized as O-3 through O-9 in the BENEFITS_SPEC):

- **Per-package release workflows** (`paths: 'packages/X/**'` filter) — eliminates ~24 useless package version bumps over v0.7a's 8 phase releases. Each package versioned independently.
- **Performance regression detection** (`engine-benchmark-smoke.yml`) — we have ZERO performance benchmarking today; this catches per-phase regressions before they ship.
- **PR concurrency cancellation** — CI minutes/month down 15-30% on superseded pushes (1-line change per workflow).
- **npm provenance** (`--provenance --access public`) — supply-chain security on every publish, free.
- **Playwright E2E coverage** with postgres + redis services in CI (lands at v0.7c) — audric/web has zero E2E coverage today.
- **Multi-service test infrastructure** (postgres `pgvector/pgvector:pg17` + redis `redis:7-alpine` with health checks) — enables real DB-layer integration testing.
- **Walrus Sites deployment option** (separate post-v0.7c SPEC) — decentralized hosting for audric.ai. Strategic Mysten alignment at the deployment layer (their reference fork uses Walrus).

**Strategic point:** by v0.7c close, audric is structurally aligned to Mysten's reference architecture across **every layer** — engine (AI SDK + MCP + MemWal), app (chatbot template + MemWal/apps/chatbot patterns), CI/CD (MemWal workflow patterns), and optionally deployment (Walrus Sites). Multi-layer alignment, not just engine alignment.

### 16. Cleanup forcing function

v0.7a is followed by a deliberate cross-repo cleanup SPEC (drafted at Phase 7 close, executed after 7-day soak). Eliminates years of accumulated dead code, doc drift, stale rules, obsolete env vars.

Without v0.7a as a forcing function, this cleanup never happens. Tech debt compounds silently.

### 17. Anthropic-monopoly risk reduction

If Anthropic raises prices, deprecates Claude, or has an outage longer than minutes, we want the option to swap providers in a day. AI SDK gives us that option; hand-rolled provider doesn't.

This is insurance, not arbitrage — the cost is one config change when needed.

### 18. Test infrastructure simplification

- AI SDK has its own test suite covering provider quirks
- Less custom code to test = simpler regression surface
- Test infrastructure can leverage AI SDK fixtures
- Mysten's MemWal/apps/chatbot includes Playwright E2E patterns we can mirror

### 19. Audric Skills become consumable everywhere

After Phase 6 + `@t2000/mcp` prompts adapter:
- Audric's skills consumable in Cursor (developer flow)
- Audric's skills consumable in Claude Desktop (general use)
- Audric's skills consumable in claude-code CLI (terminal flow)
- Audric's skills consumable in any future MCP-aware client

Same skills authored once, served via MCP, consumed everywhere. Single source of truth.

### 20. Reduces "what to maintain when Anthropic changes" surface

- Today: Anthropic SDK changes → manually port to `AnthropicProvider` → re-test → maybe ship
- Post-v0.7a: Anthropic SDK changes → AI SDK maintainers absorb → bump `@ai-sdk/anthropic` → done

We become an AI SDK consumer, not an Anthropic SDK consumer. The maintenance ownership shifts up the stack.

### 21. Strategic flexibility — three forks open instead of one

Today: hand-rolled engine forks one path forward (custom code grows custom code).

Post-v0.7a: three options always open:
1. Stay on drained engine wrapper (current state).
2. Eliminate engine wrapper entirely (v0.7b).
3. Adopt full Vercel chatbot template UI patterns (v0.7c).

You don't have to take all three. You always have the option.

### 22. Vendor diversification on the framework layer

Today: hand-rolled engine = single dependency on Anthropic SDK. If Anthropic changes terms or has an outage, all paths are blocked.

Post-v0.7a: three vendors at the framework layer — Vercel (AI SDK), Mysten (MemWal), Anthropic (LLM). No single vendor lock-in:
- Vercel changes AI SDK terms → swap to direct provider use
- Mysten changes MemWal terms → execute Plan B fallback evaluation matrix (Mem0 cloud / Letta cloud / Letta self-hosted / Supermemory / Hindsight — all AI SDK first-party adapters; see BENEFITS_SPEC §"Phase 7 commitment gate decision"). Likely winner: Mem0 cloud.
- Anthropic changes terms → swap provider via 1-line config change

Three independent vendors > one bespoke stack. Insurance against any single vendor's bad day.

### 23. Bridge layer as lasting abstraction boundary

Even if v0.7b skips (engine wrapper kept permanently), the bridge layer (Phase 0 deliverable) is permanent value:
- Audric/web stays on a stable, well-tested SSE-format adapter
- Engine internals can evolve independently (AI SDK upgrades, new MCPs, etc.)
- Audric/web doesn't have to care about UIMessage protocol drift

The bridge layer is **a thin contract surface**, not a leaky abstraction. It's the kind of thing that quietly compounds value.

### 24. Test discipline forced (130-behavior catalogue)

Phase 0's R6 deliverable extracts a 130-behavior catalogue from the soon-to-be-archived v0.6 plan into `packages/engine/__tests__/v0.7a-behavior-catalogue.md`. This becomes the **verification floor** for Phase 8 acceptance.

Today: there's no single document of "what the engine does." It's encoded in code, tests, and tribal knowledge.

Post-v0.7a: 130 explicit behaviors, each verifiable. Future behavior-changing edits MUST update this catalogue. Future agents working on the engine have a one-stop reference for "is this a known behavior?"

### 25. Cross-product code reuse within audric

5 products (Passport / Intelligence / Finance / Pay / Store) all consume the same AI SDK foundation. UI primitives (`useChat`, message parts, artifacts), tools, skills, memory layer — shared across products.

Today: Passport flows have ad-hoc UI; Finance charts use canvas HTML strings; Pay flows have separate confirm modals. Drift accumulates per-product.

Post-v0.7c: 1 chat UI shell consumed by all 5 products. Drift stops accumulating; new products inherit the polish for free.

---

## What we give up (honest accounting)

You should know what's on the other side of the trade.

| What we lose | Severity | Mitigation |
|---|---|---|
| "We built it ourselves" branding for the engine | Marketing/PR loss only | Rebranded as "Audric Intelligence runs on AI SDK" — same idea, more credible |
| ~1,000 custom-built lines we're attached to | Sunk cost | Code is a liability, not an asset; deletion is a win |
| Total control over every behavior | Some flexibility | AI SDK exposes every extension point we use; bridge layer covers gaps |
| 12-14 weeks of focused engineering time | Real cost | Pays back in maintenance reduction within 6-12 months |
| MemWal beta API risk | Real risk | **Two-stage fallback (revised 2026-05-15 after live smoke):** Plan A — file Mysten issue + retry at 3 checkpoints over ~6 weeks, hard deadline 2026-06-26 (Phase 3 close); Plan B — execute fallback evaluation matrix if Plan A fails (Mem0 / Letta / Supermemory / Hindsight — all AI SDK first-party). See BENEFITS_SPEC §"Phase 7 commitment gate decision". |
| Anthropic Memory Tool features | We chose to exclude this | Provider-lock incompatible with Qwen — non-negotiable |

---

## The bet

**v0.7a is a bet that AI SDK + MCP + MemWal will outlast custom infrastructure choices.**

Three reasons this bet is sound:

1. **Vercel is committed to AI SDK** — it's their flagship developer-tools product. They wouldn't ship the chatbot template + AI Elements + AI Gateway if AI SDK was an afterthought.
2. **MCP is the emerging standard** — Anthropic, Cursor, Claude Desktop, claude-code, OpenAI (eventually), Google (eventually) all converge on it.
3. **Mysten is committed to MemWal** — it's their flagship product, and they're using AI SDK + Vercel chatbot template as the reference integration.

If any of those three commitments wavers, the bet weakens. But all three are showing strong commitment signals as of 2026-05-15.

---

## When to re-read this doc

- **Before v0.7a kickoff** — internalize the case.
- **At Phase 4 close** — verify the benefits are materializing (engine LoC reduction, AI SDK feature unlocks, doc velocity).
- **At Phase 8 close** — final review against the bet. Did we get what we expected?
- **At v0.7b decision gate** — does the option to eliminate the wrapper still feel right?
- **If a 4th architecture pivot is being considered** — re-read this doc and the v0.6 plan archive. If the framing here doesn't predict the situation, re-evaluate.

---

## Cross-references

- Active plan: [audric-v07a-engine-drain.plan.md](/Users/funkii/.cursor/plans/audric-v07a-engine-drain.plan.md)
- Decision doc: [audric-engine-decision-doc_8f3c1e92.plan.md](/Users/funkii/.cursor/plans/audric-engine-decision-doc_8f3c1e92.plan.md)
- HANDOFF banner: [HANDOFF_NEXT_AGENT.md](/Users/funkii/dev/t2000/HANDOFF_NEXT_AGENT.md)
- Phase 0 kickoff prompt: [v07a-phase-0-kickoff-prompt.md](/Users/funkii/.cursor/plans/v07a-phase-0-kickoff-prompt.md)
- AI SDK docs: [ai-sdk.dev](https://ai-sdk.dev)
- Vercel chatbot template: [github.com/vercel/chatbot](https://github.com/vercel/chatbot)
- MemWal reference app: [github.com/MystenLabs/MemWal/tree/dev/apps/chatbot](https://github.com/MystenLabs/MemWal/tree/dev/apps/chatbot)
