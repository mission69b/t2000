# v0.7c Spike — Chatbot Template Fork

> **Status:** working spike, 2026-05-18. Pre-stage for the v0.7c "fork Vercel's `ai-chatbot` template into audric/web" workstream. Not a SPEC. Promote to a formal SPEC when ANY of the V07B_ROADMAP_DRAFT.md promotion triggers fires AND the founder commits to the fork.
>
> **Purpose:** answer the question *"what does the v0.7c fork ACTUALLY entail before we commit to 3-6 weeks of audric refactor?"* in 30 minutes instead of finding out in week 3.
>
> **Companion docs:**
> - `SPEC_SLICE_D_DRAFT.md` — already proved Slice D (HITL alignment) is v0.7c-class, not v0.7b-class. The 35-45 file / 4k-7k LoC blast radius is mostly the same code.
> - `V07B_ROADMAP_DRAFT.md` — the §"Promotion-criterion status" + "Semver framing" sections set the gating + naming.
> - `BENEFITS_SPEC_v07a.md` — completed contract for v0.7a (the engine-side drain). v0.7c is the audric-side companion.

---

## 1. The fork — what we'd actually be forking

**Canonical template:** `github.com/vercel/ai-chatbot` (formerly "Vercel AI Chatbot"; now renamed "Chatbot"). 20k+ stars, MIT, actively maintained by the Vercel AI team. **Reference deploy:** [chat.vercel.ai](https://chat.vercel.ai).

**Template stack (verified 2026-05-18 against `vercel/ai-chatbot@main`):**

| Layer | Template | Audric today | Compatibility |
|---|---|---|---|
| Framework | Next.js 15 App Router | Next.js 15 App Router | ✅ identical |
| AI orchestration | AI SDK v6 (`ai`, `@ai-sdk/react`) | AI SDK v6 via `@t2000/engine` (engine 2.7.0) | 🟡 same SDK, different wrapper |
| Model routing | **Vercel AI Gateway** (via OIDC on Vercel, `AI_GATEWAY_API_KEY` otherwise) | Direct `createAnthropic()` to Anthropic API | 🔴 **template assumes AI Gateway is the default** |
| Auth | Auth.js (NextAuth v5) | zkLogin via Google + Enoki sponsored tx | 🔴 fundamentally incompatible — see §3 |
| Database | Neon Postgres + Drizzle | Neon Postgres + Prisma | 🟡 same DB; ORM differs |
| Storage | Vercel Blob | Vercel Blob | ✅ identical |
| UI | shadcn/ui + Tailwind + Radix | shadcn/ui + Tailwind + Radix | ✅ identical |
| Chat hook | `useChat` from `@ai-sdk/react` | Hand-rolled `useEngine` (2,170 LoC) | 🔴 the whole fork point |
| Wire format | AI SDK `UIMessageStreamResponse` (UIMessage parts over SSE) | Custom `EngineEvent` + `serializeSSE` | 🔴 the second fork point |
| File browser / canvas | "Artifacts" sidebar + code editor + spreadsheet | Inline canvas templates in chat | 🟡 different UX shape |

**Two things the template brings that audric doesn't have today:**

1. **`useChat` + `UIMessageStreamResponse` + `addToolOutput`** — the AI SDK v6 native HITL primitive. This is the unlock for `pending_action` → client-side-tool migration (the Slice D win that's currently impossible).
2. **AI Gateway** — by default the template routes via Vercel AI Gateway, which means model-switching (Anthropic → OpenAI → Google → xAI) becomes a config change instead of a code change. Independently useful even if we keep going to Anthropic by default.

---

## 2. What audric KEEPS (load-bearing infra that does NOT come from the fork)

The fork is a **template**, not a product. Audric is a product. Most of what makes audric *audric* doesn't come from the template and isn't replaced by it.

| Stays as-is | Why |
|---|---|
| **`@t2000/engine`** | The agent engine, 37 tools, 14 guards, recipes, silent intelligence, financial-context — none of this is in the template. Template's "chatbot" is a thin `streamText` call with 2 tools (weather + create_document). Audric is a financial agent with safeguards. |
| **`@t2000/sdk`** | All Sui + NAVI + Cetus + USDC primitives. Template knows nothing about blockchain. |
| **zkLogin + Enoki sponsored tx** | Template assumes server-held API keys + Auth.js sessions. Audric's whole trust model (Audric Passport) is non-custodial wallet on Sui. Template's Auth.js gets THROWN AWAY; zkLogin stays. |
| **Sponsored tx flow** (`/api/transactions/prepare` → sign → `/api/transactions/execute`) | Specific to Audric Pay / Finance. Template has no concept of on-chain writes. |
| **TurnMetrics + AdviceLog + UserMemory + ChainFact + UserFinancialContext** | Silent intelligence stack. Template has a single `messages` + `chats` table. |
| **MPP gateway integration + 60+ pay_api routes** | Audric Pay. Template uses one model provider call. |
| **Canvas templates** (yield / health / portfolio viz) | Audric Finance feature. Template's "artifacts" is similar in spirit but different in shape (sidebar vs inline) — keep our inline-canvas semantics, possibly steal their artifact-streaming pattern for code/spreadsheet canvases later. |

**Net:** the fork brings ~10-15% of audric/web's actual code; we keep the other 85-90%. The fork is a *replacement for the chat-shell layer*, not the whole app.

---

## 3. What audric MIGRATES (collateral to the fork — the work)

Three buckets, in dependency order.

### Bucket A — Chat shell migration (Slice B from V07B_ROADMAP_DRAFT.md)

The fork's `useChat` + `UIMessageStreamResponse` REPLACES audric's hand-rolled chat shell. This is the bulk of the work.

**Files deleted or fundamentally rewritten:**

| File | LoC | Disposition |
|---|---|---|
| `hooks/useEngine.ts` | 2,170 | **Replace** with `useChat` from `@ai-sdk/react` + a thin audric adapter (~300 LoC, mostly mapping our 12-field PendingAction onto AI SDK part metadata) |
| `app/api/engine/chat/route.ts` | 1,696 | **Rewrite** to use `result.toUIMessageStreamResponse()` instead of `engineToSSE` (already deleted in engine v2.2.0 / SPEC 37 Phase 5 Slice A) → `serializeSSE` per event. The engine's `submitMessage()` stays; the wire format changes. |
| `app/api/engine/resume/route.ts` | 797 | **Possibly merge** into chat route as `addToolOutput` round-trip. Or keep as sidecar for post-write narration. Open question — see §5 OQ-3. |
| `app/api/engine/regenerate/route.ts` | ? | Re-key from `attemptId` to AI SDK's `approvalId` (or carry both for transition; see V07B D-6 alias). |
| `lib/engine/upstash-session-store.ts` | ? | Active-session migration window when persisted `PendingAction` shape changes. Dual-shape rehydration shim probably necessary. |
| `executeToolAction.ts` + `useAgent.ts` | ? | Move into `useChat`'s `onToolCall` handler. |

**Files preserved with adapter layer:**

| File | Why kept |
|---|---|
| `PermissionCard.tsx` (~670 LoC bundle + single-write branches) | Confirm card UX is audric-specific; reads from PendingAction metadata. Migrate the data source (tool-call part), keep the renderer. |
| `preview-bodies/index.tsx`, `PermissionCardBlockView.tsx`, `BlockRouter.tsx`, `UnifiedTimeline.tsx`, `PlanStreamBlockView.tsx`, `BundleReceiptBlockView.tsx`, `ChatMessage.tsx`, `ReasoningTimeline.tsx` | Audric-specific renderers. Keep, swap their data source from custom SSE events to AI SDK UIMessage parts. |
| `TurnMetricsCollector` + 3 Prisma write sites in chat/resume/regenerate routes | Telemetry is audric-internal. Either keep `attemptId` as the persistence key with a dual-shim that reads `approvalId` OR rename column with a migration. |

**Net for Bucket A:** ~4k-7k LoC of rewrite, mostly in 3 routes + 3 hooks + 1 renderer family. ~3-4 weeks of one focused engineer.

### Bucket B — AI Gateway adoption (NEW workstream — see §6)

Template defaults to Vercel AI Gateway. We can either:

| Option | What changes | Why |
|---|---|---|
| **B1 — Adopt AI Gateway** | `createAnthropic()` → AI Gateway routing in `AISDKAnthropicProvider`. Add `AI_GATEWAY_API_KEY` to env schema. Optionally add fallback provider (e.g. OpenAI) for outages. | Multi-provider failover, unified observability in Vercel dashboard, future model-switching is config-only. Adds ~20-50ms latency per call (gateway hop). |
| **B2 — Skip AI Gateway, stay direct** | Keep `createAnthropic()` from `@ai-sdk/anthropic`. Override the template's model config. | Status quo. Loses the failover + observability wins. Saves the latency hop. |

This is independently decidable from the fork itself. Recommend B2 in the initial fork (minimize change surface), B1 as a follow-up SPEC after the fork stabilizes. See §6 for the AI Gateway-specific tradeoff matrix.

### Bucket C — Auth.js eviction

The template ships with Auth.js (NextAuth v5) wired into the `(auth)` route group with email-magic-link + Google OAuth flows. Audric replaces this entirely:

| Template | Audric replacement |
|---|---|
| `app/(auth)/login/page.tsx` | Existing audric zkLogin flow (Google sign-in → Enoki ephemeral keypair → Sui address derivation) |
| Auth.js session cookies | zkLogin JWT verified server-side via `jose` + Google JWKS (already in audric — see SPEC 30 Phase 1A) |
| `lib/db/queries.ts` `getUser` / `createUser` / `getSession` | Audric's `User` Prisma model + `lookupUser` indexer query (no separate session table — JWT is the session) |
| Auth.js `signIn` / `signOut` callbacks | Audric `useAuth` + zkLogin's wallet derivation |

**Net for Bucket C:** Delete the entire `app/(auth)` directory, keep the existing audric zkLogin code unchanged. ~½ day of cleanup.

---

## 4. What the fork BRINGS NEW (the upside)

| Capability | Audric today | Post-fork |
|---|---|---|
| **Client-side tools** (Slice D win) | Impossible — `pending_action` lives in custom SSE event, no AI SDK primitive maps to it | Native — `useChat` + `addToolOutput` is the standard mechanism for "client runs the tool, posts the result back" |
| **Resume across page reload during stream** | Already shipped (engine v2.2.0 / SPEC 37 Phase 5 Slice C `StreamCheckpointStore`) | Same mechanism still works; AI SDK has its own stream-resume but our checkpoint store is more battle-tested |
| **Multi-provider failover** | None — Anthropic outage = audric outage | Optional via AI Gateway (Bucket B) |
| **Artifacts** (code editor + spreadsheet + image canvas streaming) | Inline canvas templates only | Sidebar artifacts panel with live streaming, code editor, spreadsheet. Could absorb our chart canvases. **Audric Store creator-tooling fit** — ebook authoring, prompt-iteration on images, etc. |
| **AI Elements** (Vercel's prebuilt chat UI primitives) | Built from scratch | Drop-in replacements for ChatMessage / ChatInput / etc. — match audric's design system, save on rebuild |
| **Conversation persistence patterns** | Custom Prisma queries + Upstash session store | Template's Drizzle queries + RSC streaming patterns. We keep Prisma (no migration), but the **data-fetching patterns** are worth stealing. |
| **Test patterns** | Audric has 2,913 web tests + 1,346 engine tests; chat-shell coverage is solid but custom | Template has e2e Playwright suites; can absorb their patterns for the new `useChat`-based shell. |

**The real strategic win:** every future AI SDK feature (caching, generative UI, structured output streaming, tool-call resumption, agent loops) drops in for free instead of needing a custom integration in `useEngine`.

---

## 5. Open questions (must resolve before fork start)

| # | Question | Why it matters | Default |
|---|---|---|---|
| OQ-1 | **In-place fork vs side-by-side?** Do we replace `audric/apps/web` in-place, or stand up `audric/apps/web-v2` alongside and switch DNS when ready? | In-place = no DNS work, but breaks main branch during the 3-6 week refactor. Side-by-side = preserves working main, but Vercel project duplication + env var sync. | Recommend **side-by-side** — same pattern as Mysten's MemWal chatbot ref-app development. |
| OQ-2 | **Adapter layer or direct migration?** Build a thin `useChat` ↔ `useEngine` adapter that lets the rest of audric/web ignore the change, OR migrate every renderer to consume AI SDK parts directly? | Adapter = faster initial fork, slower long-term (carrying two mental models). Direct = slower fork, cleaner end state. | Recommend **direct migration** — adapter pattern usually becomes permanent debt; if we're forking, fork. |
| OQ-3 | **Keep or merge `/api/engine/resume`?** AI SDK's `addToolOutput` model means tool results stream back over the same channel. Do we delete the resume route or keep it as a sidecar for post-write narration? | Delete = one fewer route to maintain. Keep = preserves the existing chained-narration pattern (audric writes a NEW TurnMetrics row for the resume turn itself). | Recommend **keep, simplify** — resume route absorbs into chat route logic, but the chat-time + resume-time TurnMetrics row separation stays (it's load-bearing for the dashboard). |
| OQ-4 | **`attemptId` → `approvalId` rename, when?** AI SDK uses `approvalId` for HITL. We use `attemptId`. V07B's D-6 proposes carrying both. Do we ship the rename WITH the fork, or carry both indefinitely? | Rename-with-fork = single migration window. Carry both = harder to delete cruft later. | Recommend **carry both for v0.7c, schedule rename for v0.7d** — the fork is already disruptive; don't compound. |
| OQ-5 | **Artifacts feature: in or out?** Template's sidebar artifacts panel + code editor + spreadsheet is a major UX surface. Audric uses inline canvases instead. Adopt? | Adopt = unlocks Audric Store creator tooling early. Skip = preserves current UX, ship artifacts as separate SPEC later. | Recommend **skip in v0.7c** — adopt as a separate post-fork SPEC after Audric Store Phase 5 scope is clear. The fork should focus on the chat shell, not feature additions. |
| OQ-6 | **AI Gateway: in or out for the fork?** See §6. | Adoption changes the LLM call path. | Recommend **B2 — skip AI Gateway in the fork, evaluate as a separate post-fork SPEC.** |
| OQ-7 | **Auth.js eviction timing?** Strip Auth.js from the template upstream BEFORE we vendor it, or vendor as-is and strip it in our fork? | Upstream-first = cleaner diff. Vendor-first = faster initial integration. | Recommend **vendor-first** — Auth.js code is isolated to `app/(auth)`; delete that whole directory in commit 2 of the fork. |
| OQ-8 | **PendingAction → tool-call part: rich metadata transport?** AI SDK tool-call parts carry `input` (the tool input) but not our 12+ field PendingAction metadata (description, modifiableFields, cetusRoute, steps[], etc.). Use `experimental_providerMetadata` or sidecar events? | `providerMetadata` = native AI SDK extension point. Sidecar = preserves current pattern. | Recommend **`experimental_providerMetadata`** — that's exactly what the field exists for; sidecar event would re-introduce the parallel-stream problem we just removed. |
| OQ-9 | **Drizzle vs Prisma?** Template uses Drizzle; audric is on Prisma with 3 years of migrations. | Stay on Prisma = save ~2 weeks of ORM migration. Switch to Drizzle = match template, simpler stack long-term. | Recommend **stay on Prisma** — ORM swap is not a v0.7c win, just a v0.7c distraction. |
| OQ-10 | **Audric Passport branding through the new shell?** Template is brand-neutral. We rebrand. | All renderers, copy, glyphs, icons. | Existing audric brand system stays; merge via shadcn theme + the existing `audric-tokens.css`. ~1 day. |

---

## 6. AI Gateway tradeoff matrix (Bucket B detail)

Pulled out because the user asked about it specifically.

| Dimension | Direct Anthropic (today) | AI Gateway |
|---|---|---|
| Latency per call | Baseline | +20-50ms (gateway hop) |
| Multi-provider failover | None | Built-in (config per model) |
| Cost margin | None — Anthropic billing direct | Vercel takes a small margin on tokens |
| Observability | Engine `external.retry_count` + `usage` events | Vercel dashboard + everything we already emit |
| Anthropic features (prompt cache, signed thinking, structured output) | Verified working in `AISDKAnthropicProvider` (preserved verbatim) | **Must re-verify** that gateway pass-through preserves: `providerOptions.anthropic.cacheControl`, `providerOptions.anthropic.thinking.budgetTokens`, signed-thinking signatures, etc. AI Gateway docs claim full passthrough but our use is non-trivial. |
| Vendor lock | Vercel hosting + Anthropic SDK | Vercel hosting + AI Gateway SDK + Anthropic upstream |
| Rate-limit pooling | None | Yes — shared across Vercel orgs (?) |
| Failover semantics | All retries hit Anthropic | Configurable per-route fallback (e.g. Anthropic down → fall through to GPT-5 for read-only queries; not for writes since system prompts diverge) |

**Recommended trigger to revisit AI Gateway as its own SPEC:**

1. Audric has a documented Anthropic outage that costs >1h of customer-impacting downtime, OR
2. We decide to A/B test prompts on a non-Anthropic model (GPT-5 for cost optimization on read-only turns), OR
3. The v0.7c fork is complete and stable (3-6 weeks post-merge) and we have observed steady state.

Until any trigger fires, AI Gateway stays in the placeholder bucket alongside `spec_gateway_variable_pricing` (row 7l in `audric-build-tracker.md` — different gateway, same "valuable but not yet" framing).

---

## 7. Effort tier + critical path

**Estimated effort (one focused engineer, no surprises):**

| Bucket | Optimistic | Realistic | Pessimistic |
|---|---|---|---|
| Bucket A — chat shell migration | 3 weeks | 4 weeks | 6 weeks |
| Bucket C — Auth.js eviction | ½ day | 1 day | 2 days |
| Cutover + smoke + bug bash | 1 week | 2 weeks | 3 weeks |
| **Total to v0.7c production** | **~4 weeks** | **~6 weeks** | **~9 weeks** |

Bucket B (AI Gateway) is independently scopable; not on the critical path.

**Critical path:**

```
v0.7c kickoff
  ├── Side-by-side audric/apps/web-v2 stood up (~2 days)
  ├── Fork vercel/ai-chatbot into web-v2 (1 commit, ~1 day)
  ├── Delete app/(auth), wire zkLogin in (Bucket C, ~1 day)
  ├── Replace useChat's default route with audric chat route reading from @t2000/engine
  │   ├── Adapt EngineEvent stream to UIMessageStreamResponse parts
  │   ├── Wire pending_action → tool-call part with providerMetadata transport
  │   └── Wire executeToolAction into onToolCall handler
  ├── Migrate confirm-card renderers to consume AI SDK parts (~1 week)
  ├── Migrate timeline / canvas / reasoning renderers (~1 week)
  ├── Restore TurnMetrics + AdviceLog wiring (~3 days)
  ├── Smoke pass: 1 user, every chip flow, every write, every cron-driven feature
  ├── 5-user smoke (R9 from Phase 8 ledger lives here naturally)
  └── DNS cutover audric.ai → web-v2 → archive web → done
```

---

## 8. What this spike is NOT

- Not a SPEC. Not even a SPEC draft. Promotion criterion is in V07B_ROADMAP_DRAFT.md.
- Not a commitment. The fork only happens if the founder commits AFTER reading the spike, and ideally after a v0.7b minor ships first to prove the engine-side platform is stable.
- Not exhaustive. Bucket A's blast-radius file list is the headline files; SPEC_SLICE_D_DRAFT.md §5 already inventoried 35-45 production files. The full audit lands at SPEC kickoff.

---

## 9. Recommended next steps (in order, AFTER user commits)

1. **Stand up `audric/apps/web-v2` as a blank Next.js 15 app** (~1 day, no template yet — just verify Vercel project + DNS + env vars work).
2. **Fork `vercel/ai-chatbot@main` into `web-v2`** as a single commit; tag the SHA in HANDOFF_NEXT_AGENT.md so we know our baseline. Run the template once against a throwaway Anthropic key to confirm it boots.
3. **Delete `app/(auth)` + wire zkLogin** (Bucket C, the easy bucket — gets us a foothold).
4. **Adapt the default chat route to read from `@t2000/engine.submitMessage()`** instead of the template's vanilla `streamText` — this is the first real load-bearing change. Verify a single read-only tool (`balance_check`) round-trips end-to-end.
5. **Migrate the confirm-card renderer for `save_deposit`** as the canonical write tool. Once this works, the pattern for the other 11 writes is mechanical.
6. **Migrate the remaining tools + canvases in parallel** (multiple engineers possible from this point).
7. **Run R9 5-user smoke against `web-v2`** before DNS cutover.
8. **Cutover + archive old `apps/web`** + delete dead code.

Each numbered step is a checkpoint; the next agent or session can pick up from any one.

---

## Cross-references

- `V07B_ROADMAP_DRAFT.md` — "Promotion-criterion status" section names the triggers that get us to v0.7c.
- `SPEC_SLICE_D_DRAFT.md` — already proved Slice D is v0.7c-class; this spike subsumes it.
- `BENEFITS_SPEC_v07a.md` — the contract v0.7a fulfilled (engine-side drain).
- `WHY_v07a.md` §"The bet" — three reasons the AI SDK bet is sound. All three still hold; v0.7c is what cashes the bet on the audric side.
- `vercel/ai-chatbot` repo — [github.com/vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) (canonical template, ~20k stars, MIT, actively maintained).
- AI SDK v6 HITL cookbook — [ai-sdk.dev/cookbook/next/human-in-the-loop](https://ai-sdk.dev/cookbook/next/human-in-the-loop).
- MemWal reference chatbot — [github.com/MystenLabs/MemWal/tree/dev/apps/chatbot](https://github.com/MystenLabs/MemWal/tree/dev/apps/chatbot) (Mysten built theirs on the same template; cross-check patterns when SPEC kickoff).
