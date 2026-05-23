# AUDIT — Template-divergence pass (S.269)

> **Status:** READ-ONLY audit · 1-page exec at top · 3 buckets only · 1 concrete recommendation
> **Author:** Agent under founder direction (S.267 follow-on)
> **Date:** 2026-05-23 ~13:00 AEST
> **Scope:** `apps/web-v2` divergence from the upstream `vercel/ai-chatbot@107a43a` template (forked v0.7c Phase 1 Day 1b)
> **Predecessor evidence:** S.267 (engine `receive` auth threading), S.270 + S.271 (newly found bugs), `BENEFITS_SPEC_v07c.md` Phase 1-6 progressive re-shelling
> **Lock:** awaits founder triage of §6 recommendation

---

## 1. Executive summary (1 page)

**Why this audit exists.** Nine bug fixes in three days (S.245, S.261-263, S.265, S.266, S.267, S.270, S.271) — three of the four most recent bugs sit at the seam between **template-pattern** (forked from `vercel/ai-chatbot`) and **audric-pattern** (zkLogin-via-headers, sponsored-tx, engine integration). Fixing each in isolation is not converging.

**Headline finding.** The seam catalog is **smaller and sharper than feared.** Web-v2 has:
- **One** `"use server"` Server Action (the full audit; `lib/actions/chat-visibility.ts` — exactly the file S.270 broke).
- **Two** non-canonical `process.env` reads (`REDIS_URL`, `IS_DEMO` outside config files).
- **Three** unthreaded engine env keys (`AUDRIC_INTERNAL_KEY` — fixed S.267; `BRAVE_API_KEY`; `T2000_AUDRIC_API` legacy alias).
- **One** SWR-infinite mutate pattern bug (S.271).
- **Zero** auto-generated chat shell that needs replacing — `useChat`, `UIMessage`, `convertToModelMessages` are all already adopted.

The lib/audric/ layer (22 files, 4802 LoC) almost entirely **earns its keep** — it encodes audric's product reality (zkLogin auth, sponsored transactions, MemWal recall, financial context, dispatch-intents D-14 lock, validate-model-messages production-bug fix). One DEAD module surfaced (the `saveContactTool` engine path post-S.243 contacts simplification — already on the existing backlog as H3.4).

**Recommendation in one sentence.** Ship a **time-boxed ~6-7h slice** that closes every seam-bug we've hit plus type-fences the engine→host env contract so the next regression of this class fails at compile-time, NOT in production. **No re-fork. No 1-2 week speculative rewrite.** Existing v0.7d backlog Phase 4 (HITL native), Phase 5 (structured outputs), Phase 6 (memory plumbing delete) keep their slots — they are the genuine "Medium" template alignment work and they're already planned.

**Bug-class disposition.**
- S.267 (env key not threaded) — FIXED today.
- S.268 (BRAVE_API_KEY + T2000_AUDRIC_API + REDIS_URL) — FOOT-GUN, fix in this slice.
- S.270 (Server Action vs zkLogin headers) — FOOT-GUN, fix in this slice (convert action → API route; sets canonical "audric uses ONE auth pattern" precedent).
- S.271 (SWR-infinite mutate predicate) — FOOT-GUN, fix in this slice.

**Sequencing call.** Slot the recommendation BEFORE 2026-05-29 MemWal stability gate. Comfortably fits the 5-day countdown without contaminating the v0.7c soak observation. Existing 12 forward-backlog items keep their order; nothing in this slice blocks v0.7d Phase 1+.

---

## 2. Methodology

| Step | What I did | Why |
|---|---|---|
| 2.1 | Read `apps/web-v2/README.template.md` + grep `BENEFITS_SPEC_v07c.md` for SHA pin | Establish template baseline: `vercel/ai-chatbot@107a43a` (2026-04-17) |
| 2.2 | Grep every `context.env?.X` in engine source | Engine ToolContext env-read inventory |
| 2.3 | Grep `'use server'` + map every `app/api/**/route.ts` | Server Action vs API route inventory |
| 2.4 | `wc -l lib/audric/*.ts` + read each opening doc-comment | Bucket the 22 audric-specific modules |
| 2.5 | Read `tool-result-router.tsx` switch + `WRITE_TOOLS_WITH_RECEIPT` set | Renderer coverage gap check |
| 2.6 | Grep `useSWRInfinite` + `mutate(` callers | SWR pattern audit |
| 2.7 | Grep `process.env.\w+` excluding generated + env.ts itself | Direct env-read bypass audit |
| 2.8 | Cross-reference findings with `HANDOFF_NEXT_AGENT.md` ranks 7-22 | Avoid duplicating planned v0.7d work |

Total: ~75 minutes read-only investigation. Zero edits. All findings traced to file:line.

---

## 3. Bucket A — EARNS KEEP

> Audric pattern is correct because the template can't model audric's reality. Not negotiable.

### 3.1 zkLogin-via-headers auth (`lib/audric-auth.ts`, `lib/auth-fetch.ts`)
- Sui's Google-OIDC zkLogin produces a JWT that's verified per-request via the on-chain proof. Cookie sessions don't fit — there's no server-side session store and the proof is forge-resistant by design.
- **Implication:** Server Actions are structurally incompatible with audric auth. Don't add new ones (see §5.1 fix for the one we have).

### 3.2 Sponsored-tx flow (`lib/audric/sponsored-tx.ts`, 397 LoC)
- Audric's user is a non-custodial zkLogin wallet that doesn't pay gas. Enoki sponsorship requires server-side build-then-client-sign-then-server-execute. Template's "user has a wallet that pays its own gas" model doesn't apply.

### 3.3 Engine integration (`apps/web-v2/app/api/chat/route.ts`, 2989 LoC)
- Wires `@t2000/engine` `Experimental_Agent` with audric-specific concerns: `ToolContext` (RPC URL, BlockVision key, internal API URL/key, portfolio cache, position fetcher, MemWal store, permission preset, session-spend ledger). `Experimental_Agent` is template-canonical; the wiring shape is audric-canonical.

### 3.4 Memory layer (`lib/audric/memwal-{prepare-step,write-callback,memory-store}.ts`, ~508 LoC combined)
- MemWal vector recall via `prepareStep` + `onFinish` is the v0.7d singular memory backbone. Template ships zero memory primitives.

### 3.5 Dispatch intents (`lib/audric/dispatch-intents.ts`, 594 LoC)
- D-14 LOCKED in `BENEFITS_SPEC_v07c.md` S.173. Regex pre-fire layer specifically chosen over `generateObject` because it's pre-LLM-call (avoids 300-500ms + cost per turn). Template has no analog.

### 3.6 Validate-model-messages (`lib/audric/validate-model-messages.ts`, 414 LoC)
- Anthropic strict-shape safety net for orphan tool_use blocks after stream truncation. Real production bug fix (session `s_1778993279816_47a9814c835d`). Template's chatbot doesn't hit this because its tools are simpler.

### 3.7 Sui pay flow (`components/pay/*`, `app/pay/[slug]/page.tsx`)
- Audric Pay is a product surface, not a template feature. Template doesn't ship payment links.

### 3.8 Canvas template registry (engine `canvas.ts` + audric `CanvasTemplateRenderer`)
- 9 templates today (post-S.266 `receive_address` add). Renders LLM-emitted structured data. Template's "artifact" surface is generic; audric's canvas templates are typed per-product (yield_chart, health_chart, full_portfolio, activity_heatmap, receive_address, etc.). Canvas-side coverage **complete** post-S.266.

### 3.9 System prompt (`lib/audric/system-prompt.ts`, 588 LoC)
- Encodes Audric's product reality (5 named systems, 35 tools, USDC-canonical savings, sponsored gas posture, atomic compound writes). Template ships a generic chat prompt.

### 3.10 financial-context, post-write-refresh, account-age-gate, etc.
- Every other `lib/audric/*.ts` file (~14 modules) encodes a real audric concern. None are template ports. None are template-pattern foot-guns.

### 3.11 `lib/ratelimit.ts` Redis client (~38 LoC)
- Redis client itself earns keep (the rate-limit pattern is fine). The `process.env.REDIS_URL` bypass is the foot-gun, not the file (see §5.5).

---

## 4. Bucket B — DEBT (started migrating, didn't finish)

> Worth completing. Most are already in the v0.7d backlog as planned phases — listing here for cross-reference, NOT to duplicate.

### 4.1 HITL native migration (existing backlog rank 7, v0.7d Phase 4)
- Engine still emits bespoke `pending_action` events; AI SDK has native `tool-approval-request`. Migration drafted in `SPEC_SLICE_D_DRAFT.md`. Ranked rank 7 on existing backlog. **Don't fold into S.269 — keep as standalone v0.7d Phase 4 ship.** Estimated 1-2 weeks. Gate: Memwal stability + post-soak.

### 4.2 Structured-output classifier migration (existing backlog rank 8, v0.7d Phase 5)
- 8+ existing LLM-call classifiers should migrate to `generateObject({ schema })`. ~150-470 LoC delete. **Independent of MemWal; could ship anytime. Don't fold into S.269.**

### 4.3 Memory plumbing delete (existing backlog rank 9, v0.7d Phase 6 compressed)
- `moat-context.ts buildMemoryContext` + `system-prompt.ts` legacy block. ~100 LoC delete after MemWal-prepareStep is the single recall path. **Don't fold into S.269 — separate v0.7d slot.**

### 4.4 ToolContext.env type-strengthening (NEW)
- `ToolContext.env: Record<string, string | undefined>` is the structural cause of S.267 + S.268 (no compile-time check that audric threads every key the engine reads).
- **Fix shape:** define `ToolContextEnv` interface in `packages/engine/src/types.ts` listing every key the engine consumes (`AUDRIC_INTERNAL_API_URL`, `AUDRIC_INTERNAL_KEY`, `BRAVE_API_KEY`, etc.). Audric web-v2's wire-up site fails type-check if any required key is missing. Optional keys stay optional.
- Best operationalized **inside this S.269 slice** because it closes the bug class permanently. ~30 min in engine + 15 min audric.

### 4.5 NEXT_PUBLIC_BASE_PATH unification (LOW)
- `sidebar-history.tsx:109,118,205`, `hooks/use-chat-visibility.ts` read `process.env.NEXT_PUBLIC_BASE_PATH` directly. Should route through `env.NEXT_PUBLIC_BASE_PATH` per env-validation-gate. Small. Defer or fold — see §6.

---

## 5. Bucket C — FOOT-GUN (template pattern wrong for audric)

> Causing real bugs. Fix in this slice.

### 5.1 Server Action for chat visibility — **S.270**
- **File:** `apps/web-v2/lib/actions/chat-visibility.ts` (sole `"use server"` file in web-v2)
- **Symptom:** Toggling private/public on a chat returns `Error: Unauthorized`.
- **Trace:** `updateChatVisibility` calls `getCurrentUser()` which reads `headers().get("x-zklogin-jwt")`. Browser sets the header on direct fetches via `auth-fetch.ts`, but Next.js's RSC Server Action POST does NOT carry custom client headers. JWT is null → null session → action throws.
- **Why FOOT-GUN, not DEBT:** the template's auth is cookie-based (Auth.js), so Server Actions get session via `cookies()`. We deleted Auth.js in v0.7c Phase 1 Day 1c but kept the Server Action — that's the architectural mismatch.
- **Fix shape:** convert `updateChatVisibility` from Server Action → `PATCH /api/chat/[id]/visibility` route handler, called from client via `authFetch`. Mirrors every other chat operation (DELETE chat, vote, list history, share). Sets the canonical precedent: **audric uses ONE auth pattern — header-attaching `authFetch` + API routes — and `"use server"` is banned in web-v2 going forward.** Add a Biome rule.
- **Effort:** ~30-45 min (one route file, delete one action file, update one hook + toggle component).

### 5.2 Engine env-key threading gap — **S.267 + S.268**
- **Files:** `engine/tools/{receive,activity-summary,yield-summary,spending,portfolio-analysis,web-search}.ts` + `engine/audric-api.ts`
- **Status post-S.267:** `AUDRIC_INTERNAL_KEY` ✅ threaded. `BRAVE_API_KEY` ❌, `T2000_AUDRIC_API` legacy alias ❌.
- **Fix shape:** thread `BRAVE_API_KEY` from web-v2's env (add to schema as optional) into `ToolContext.env`. Delete the `T2000_AUDRIC_API` legacy alias from `engine/audric-api.ts:40` — it's a pre-v0.7c historical name, redundant with `AUDRIC_INTERNAL_API_URL`. Lock down with §4.4 typed ToolContextEnv.
- **Effort:** ~30 min.

### 5.3 SWR-infinite mutate pattern bug — **S.271**
- **File:** `apps/web-v2/components/settings/delete-all-chats-button.tsx:54-58`
- **Symptom:** Delete-all-chats succeeds server-side; sidebar still shows deleted chats until page refresh.
- **Trace:** Predicate `(key) => typeof key === "string" && key.includes("/api/history")` doesn't match `useSWRInfinite`'s namespaced keys (stored as serialized arrays under `$inf$/...`). Predicate matches ZERO keys → no invalidation.
- **Fix shape:** match the canonical pattern at `hooks/use-chat-visibility.ts:63`:
```ts
import { unstable_serialize } from "swr/infinite";
import { getChatHistoryPaginationKey } from "@/components/chat/sidebar-history";
await mutate(unstable_serialize(getChatHistoryPaginationKey), undefined, { revalidate: true });
```
- **Effort:** ~10 min.

### 5.4 `lib/ratelimit.ts` direct `process.env.REDIS_URL` read
- **File:** `apps/web-v2/lib/ratelimit.ts:12-13`
- **Why FOOT-GUN:** bypasses the env-validation-gate (the S.20 BlockVision incident pattern).
- **Fix shape:** add `REDIS_URL: optionalString` to env schema, read via `env.REDIS_URL` in ratelimit. ~10 min.

### 5.5 Dead `saveContactTool` in engine
- **Files:** `engine/tools/contacts.ts` + `engine/tools/index.ts` + `engine/index.ts` + `engine/preflight-coverage.test.ts`
- **Why FOOT-GUN:** S.243 (V07E_CONTACTS_SIMPLIFICATION Path A) removed `save_contact` from audric `ConfirmationChip.tsx` consumer list, but the engine still ships the tool. If the LLM calls it, audric's tool-result-router has no case → returns null → no UI feedback. Dead engine surface.
- **Existing backlog match:** This IS H3.4 ("Contacts Phase 4 — engine cleanup") rank 12. Folding lets us close it inside S.269 in 30 min instead of as a separate ship.
- **Effort:** ~30 min (delete tool + tests + index registration + bump engine).

### 5.6 V07E_INVOICE_DEPRECATION (existing draft)
- **File:** `t2000/spec/active/V07E_INVOICE_DEPRECATION.md`
- **Why fold here:** the SPEC is drafted, deferred (rank 20), 5-phase plan ready. Founder framing 2026-05-21: invoice is ~95% redundant with payment links. Fits the same "delete-first" theme as S.269. Estimated ~4-5h.
- **Decision:** include as item 7 of the recommendation. If founder defers further, slice it out — recommendation still works without it.

---

## 6. Recommendation — S.269-the-ship (~6-7h, no calendar slip)

**Concrete numbered slice. Each item is independently revertable. Ship in the order listed.**

| # | Item | Bucket | File scope | Effort | Risk | Verifies |
|---|---|---|---|---|---|---|
| 1 | Fix delete-all-chats sidebar sync | FOOT-GUN | `delete-all-chats-button.tsx` | ~10 min | None | S.271 — delete chats from /settings, sidebar empties without refresh |
| 2 | Convert visibility-toggle Server Action → API route | FOOT-GUN | `lib/actions/chat-visibility.ts` (delete) + `app/api/chat/[id]/visibility/route.ts` (new) + `hooks/use-chat-visibility.ts` (rewire) + Biome rule banning `"use server"` | ~45 min | Low | S.270 — toggle private/public, succeeds without "Unauthorized" |
| 3 | Type-strengthen `ToolContext.env` | DEBT (newly named) | `engine/types.ts` + `engine/tool-context.ts` (define `ToolContextEnv`) + audric chat route wire-up | ~45 min | Low (compile-time only) | tsc fails when an engine tool reads an env key audric doesn't thread |
| 4 | Thread `BRAVE_API_KEY` + delete `T2000_AUDRIC_API` alias | FOOT-GUN (S.268 partial) | `engine/audric-api.ts:40` (delete legacy fallback) + `web-v2/lib/env.ts` (add BRAVE schema) + chat route (thread) | ~30 min | None | web_search no longer silently broken; alias removed |
| 5 | Thread `REDIS_URL` through env gate | FOOT-GUN (S.268 part) | `web-v2/lib/env.ts` + `web-v2/lib/ratelimit.ts` | ~10 min | None | Boot-time validation surfaces missing REDIS_URL |
| 6 | Delete `saveContactTool` from engine (folds H3.4 rank 12) | FOOT-GUN | `engine/tools/{contacts,index}.ts` + tests + `engine/index.ts` + audric `tool-result-router` cleanup if any residual | ~30 min | None | Tool count 35 → 34; engine bumps minor |
| 7 | Ship V07E_INVOICE_DEPRECATION 5 phases | FOOT-GUN (folds existing draft; rank 20) | per existing SPEC: engine `receive.ts` invoice tools delete + system prompt edit + web-v2 invoice union case removal + apps/web-v2 internal-API tightening + Prisma migration | ~4-5h | Medium (Prisma migration) | Founder Q1-Q5 lock pre-flight; tool count 34 → 31; pay surface single-shape |
| 8 | Update `audric-build-tracker.md` + `HANDOFF_NEXT_AGENT.md` | docs | both files | ~15 min | None | Backlog reflects post-S.269 state |

**Total: ~6-7 hours.** Fits a single-day session (today + tomorrow morning).

**Ship order rationale.**
- Items 1+2+5 are <2h combined and unblock the visibility toggle bug + delete-all-chats UX bug + the canonical SWR pattern, before any engine release.
- Item 3+4 are the engine bump pair (one minor release covers both).
- Item 6 chains into item 4's release (both are engine deletions, one bump covers).
- Item 7 is the longest single item; ship LAST so its risk doesn't block items 1-6.
- Item 8 stamps the close.

**What we DELIBERATELY DO NOT touch in S.269:**
- v0.7d Phase 4 HITL native migration (rank 7, planned standalone).
- v0.7d Phase 5 structured-output classifiers (rank 8, planned standalone).
- v0.7d Phase 6 memory plumbing delete (rank 9, planned standalone).
- `dispatch-intents.ts` regex pre-fire (D-14 LOCKED).
- `chat-persistence.ts` template-flavor abstraction (works fine, no bug pressure).
- `validate-model-messages.ts` (real production bug fix, leave alone).
- `icons.tsx` 1129 LoC (static SVG data, no win).
- Marketing landing shadcn redesign (rank 19, separate B1 ship).
- PIPELINE-AUDIT-PHASE-2 (rank 7.5, separate Phase 2-3 ship).

**Sequencing call.** Slot S.269 between today (S.267 just shipped) and 2026-05-29 (MemWal stability gate). Nothing in this slice contaminates the v0.7c soak observation (2026-05-28 gate) or blocks v0.7d Phase 1+ (MemWalMemoryStore adapter). Run in parallel with the 5-day countdown — gates are observation-only, no engineering action required during them.

---

## 7. Open questions for founder triage

### Q1 — Ship the full slice (~6-7h) or a strict subset?
- **Full slice (recommended):** items 1-8. Closes every seam-bug we've hit + type-fences the bug class permanently + retires invoices + folds H3.4. ~6-7h, comfortable inside the 5-day countdown.
- **Tight slice (alternative):** items 1-6 only (skip item 7 invoice deprecation). ~2h, leaves invoice surface alive until founder re-locks Q1-Q5 of `V07E_INVOICE_DEPRECATION.md`. Cleanest if you want invoice surface preserved until Audric Store SPEC lands.

### Q2 — Item 2 (Server Action conversion) — make it a Biome rule too?
- **Recommended:** YES. Add `"use server"` ban in `biome.jsonc` so the next agent cannot accidentally re-introduce a Server Action under zkLogin auth. Costs ~5 min on top of the rewrite, prevents the next regression of this class.
- **Alternative:** rely on review + this audit doc.

### Q3 — Item 3 (Type ToolContext.env) — engine major or minor?
- **Recommended:** MINOR. The `ToolContextEnv` interface is additive (existing `Record<string, string | undefined>` callers still type-check unless they read non-listed keys, which is the whole point — we WANT them to fail). External callers outside audric are zero today.
- **Alternative:** PATCH (treat as internal). Loses the "behavior change downstream consumers opt into" signal.

### Q4 — Item 7 (Invoice deprecation) — ship same-day or wait for own SPEC ratify?
- **Recommended:** ship same-day. The 5-phase SPEC is drafted. Q1-Q5 inside that SPEC are `Pending founder review` per the doc — they need your answers regardless. If you prefer, we lock those during the S.269 ship session as a single 30-min decision call.
- **Alternative:** defer item 7 to its own ship slot post-MemWal-stable. Slice becomes ~2h (items 1-6).

---

## 8. What this audit deliberately did NOT do

- Did NOT re-scope option C (re-fork from latest template SHA). Option C was already rejected (founder Q1 answer 2026-05-23 ~12:00 AEST: re-forking throws away ~6 months of stabilization).
- Did NOT inventory every line of `lib/audric/*.ts`. Read each opening doc-comment to bucket; deeper read only where the bucket was ambiguous. Time-boxed at 75 min total.
- Did NOT propose new architectural patterns. Every recommendation is "fix this seam" or "type-fence this contract" — no green-field design.
- Did NOT ship anything. Read-only audit. Recommendation awaits founder triage of §7 Q1-Q4.

---

## 9. Cross-references

- **S.267** (2026-05-23 ~12:00) — engine 2.15.0 + audric `42dfa92`: `AUDRIC_INTERNAL_KEY` threading + `[receive]` failure-path observability.
- **S.270** (2026-05-22 ~04:20) — visibility toggle Unauthorized; deferred to S.269 §5.1.
- **S.271** (2026-05-23) — delete-all-chats sidebar sync; deferred to S.269 §5.3.
- **`BENEFITS_SPEC_v07c.md`** §"Day 1b" — fork SHA `107a43a` pin + Auth.js eviction rationale.
- **`SPEC_SLICE_D_DRAFT.md`** — HITL native migration scoping (out of S.269 scope; existing backlog rank 7).
- **`V07E_INVOICE_DEPRECATION.md`** — 5-phase invoice retirement plan (folded as S.269 item 7 if Q4 = ship-same-day).
- **`HANDOFF_NEXT_AGENT.md`** — current state of the world; this audit's recommendation will reshuffle backlog ranks 3.5-3.7.
- **`.cursor/rules/env-validation-gate.mdc`** — the S.20 BlockVision incident lesson; S.269 §4.4 + §5.4-5.5 operationalize it for the engine→host contract.
- **`.cursor/rules/coding-discipline.mdc`** — surgical changes; S.269 holds the line.

---

**END AUDIT — awaits founder triage of §7 Q1-Q4.**
