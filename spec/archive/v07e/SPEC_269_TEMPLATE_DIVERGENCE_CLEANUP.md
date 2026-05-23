# SPEC 269 — Template-divergence cleanup (audric/web-v2)

> **Promoted from:** `AUDIT_V07E_TEMPLATE_DIVERGENCE_2026-05-23.md` (read-only audit, S.269 audit phase)
> **Founder triage stamped:** 2026-05-23 ~13:05 AEST — Q1 ship full slice · Q2 Biome rule yes · Q3 engine MINOR · Q4 invoice deprecation same-day
> **New finding folded in:** smoke test post-S.267 still empty card; root cause likely `T2000_INTERNAL_KEY` unset in Vercel (env was `optionalString`). Adds **item 0a** at front of slice.
> **Sequencing:** ship before 2026-05-29 MemWal stability gate. Does NOT contaminate v0.7c soak (2026-05-28). 3 phased commits + 1 engine release.
> **Status:** in flight — phase A starting

---

## Decisions stamped

| ID | Question | Decision | Locked |
|---|---|---|---|
| Q1 | Ship full slice (items 1-8) or tight (items 1-6)? | **Full slice + new item 0a** | 2026-05-23 ~13:05 AEST |
| Q2 | Add Biome rule banning `"use server"` alongside item 2? | **Yes** | 2026-05-23 ~13:05 AEST |
| Q3 | Engine bump for typed `ToolContextEnv` — minor or patch? | **Minor** | 2026-05-23 ~13:05 AEST |
| Q4 | Item 7 (invoice deprecation) — same-day with S.269 or own slot? | **Same-day** — clean slate | 2026-05-23 ~13:05 AEST |
| Q5 | Item 0a (env-required) added at audit-recommendation review | **Yes — leads slice** | 2026-05-23 ~13:08 AEST (founder context: smoke still empty post-S.267) |

---

## Final ship order

Repacked into 3 phased commits + 1 engine release cycle, total ~6-7h.

### Phase A — audric web-v2 surface fixes (~80 min, single commit + Vercel deploy)

**Goal:** unblock founder smoke test (item 0a) + close the 3 audric-side seam bugs (items 1, 2, 5).

| # | Item | Files | Effort | Verifies |
|---|---|---|---|---|
| 0a | Convert `T2000_INTERNAL_KEY` + `AUDRIC_INTERNAL_API_URL` to `requiredString` | `apps/web-v2/lib/env.ts` | ~15 min | Boot-time validation surfaces missing var; payment-link smoke succeeds OR fails with clear "env unset" error |
| 1 | Fix delete-all-chats sidebar sync (S.271) | `apps/web-v2/components/settings/delete-all-chats-button.tsx` | ~10 min | Delete-all-chats from /settings → sidebar empties without refresh |
| 2 | Convert visibility-toggle Server Action → API route + Biome rule (S.270) | new `apps/web-v2/app/api/chat/[id]/visibility/route.ts` · delete `apps/web-v2/lib/actions/chat-visibility.ts` · update `apps/web-v2/hooks/use-chat-visibility.ts` · `apps/web-v2/biome.jsonc` ban-`"use server"` rule | ~45 min | Toggle private/public succeeds without "Unauthorized"; CI fails on any future `"use server"` re-introduction |
| 5 | Thread `REDIS_URL` through env gate | `apps/web-v2/lib/env.ts` + `apps/web-v2/lib/ratelimit.ts` | ~10 min | Boot validates REDIS_URL or surfaces it as optional explicitly |

**Phase A ship:** single audric commit, push, Vercel auto-deploys.

### Phase B — engine cleanup (~110 min, single engine MINOR release)

**Goal:** typed env contract + dead code removal + remaining env-key threading. Engine bumps once for all.

| # | Item | Files | Effort | Verifies |
|---|---|---|---|---|
| 3 | Type-strengthen `ToolContext.env` (`ToolContextEnv` interface) | `packages/engine/src/types.ts` | ~45 min | TS compile-time error if audric stops threading any required engine key |
| 4 | Thread `BRAVE_API_KEY` + delete `T2000_AUDRIC_API` legacy alias | `packages/engine/src/audric-api.ts:40` (delete fallback) + `apps/web-v2/lib/env.ts` (add BRAVE schema; threaded in Phase C) | ~30 min | web_search no longer silently broken when BRAVE_API_KEY set |
| 6 | Delete `saveContactTool` from engine (folds H3.4 rank 12) | `packages/engine/src/tools/contacts.ts` (delete) + `packages/engine/src/tools/index.ts` + `packages/engine/src/index.ts` + tests | ~30 min | Tool count 35 → 34; engine releases as MINOR (item 3 forces minor anyway) |

**Phase B ship:** engine commit, push to t2000 main, `gh workflow run release.yml --field bump=minor` → engine 2.16.0 publishes.

### Phase C — audric pulls + glue (~30 min, single audric commit + Vercel deploy)

**Goal:** audric web-v2 picks up engine 2.16.0; threads `BRAVE_API_KEY`; cleans any residual `save_contact` references.

| # | Item | Files | Effort | Verifies |
|---|---|---|---|---|
| 4-glue | Thread `BRAVE_API_KEY` into `ToolContext.env` | `apps/web-v2/app/api/chat/route.ts` (add to `env:` block) | ~5 min | web_search tool fires correctly when BRAVE_API_KEY set |
| 6-glue | Audit + clean any residual `save_contact` references in audric | grep `save_contact` across web-v2 | ~10 min | Zero residual references |
| Bump | `pnpm add @t2000/engine@2.16.0 @t2000/sdk@2.16.0` | `apps/web-v2/package.json` + `pnpm-lock.yaml` | ~5 min | Audric on 2.16.0 |

**Phase C ship:** audric commit, push, Vercel auto-deploys.

### Phase D — V07E_INVOICE_DEPRECATION (~4-5h, separate ship, Q1-Q5 of inner SPEC needed)

**Goal:** item 7. Drops invoice as a distinct product (~95% redundant with payment links per founder framing 2026-05-21). 5 phases per the existing draft at `t2000/spec/active/V07E_INVOICE_DEPRECATION.md`.

**Pre-flight: founder Q1-Q5 lock.** Read the existing SPEC's Q1-Q5 first; founder either:
- Locks them in <30 min (they're pre-written for review), then I execute the 5 phases, OR
- Defers Q1-Q5 to a follow-up; Phase D moves to next session.

**5 phases (per existing SPEC):**
1. Engine deletes `createInvoiceTool`, `listInvoicesTool`, `cancelInvoiceTool` from `receive.ts`. Tool count 34 → 31. Engine MINOR bump.
2. Audric web-v2 deletes `InvoiceCard` rendering case + `cancel_invoice` ConfirmationChip case from `tool-result-router`.
3. Audric `app/api/internal/payments` POST handler tightens type to only `link` (404 on `type=invoice`).
4. Audric system prompt deletes invoice mentions.
5. Prisma migration: remove invoice-only columns from Payment table (gated on Q1-Q5 — destructive migration may need staging soak).

### Phase E — tracker + handoff close (~15 min, single t2000 + audric commit)

**Goal:** item 8. Stamps S.269 closed in trackers.

- `t2000/audric-build-tracker.md` — full S.269 entry with shipped items + outcome.
- `audric/HANDOFF_NEXT_AGENT.md` — backlog cleanup: remove S.270/S.271 ranks 3.6/3.7; remove H3.4 rank 12; remove D1 rank 20; bump rank-of-everything-else; add S.272 backlog item if not yet ranked.
- Vercel + npm propagation verify.

---

## Phase-A acceptance gate (founder-actionable)

After Phase A ships:

1. **Smoke S.267 again** — chat *"create a payment link for $1 USDC"* → `<PaymentLinkCard>` renders with QR + Copy link button. If still empty: env var likely still unset; check Vercel dashboard `T2000_INTERNAL_KEY`. The new `requiredString` validation surfaces the misconfig at boot time on next deploy.
2. **Smoke S.270** — toggle a chat private/public → succeeds without "Unauthorized" error.
3. **Smoke S.271** — delete-all-chats from `/settings/passport` → sidebar empties without refresh.

Phase B kicks off after Phase A is green.

---

## Out of scope (explicit non-goals)

- **v0.7d Phase 4 HITL native migration** — backlog rank 7, planned standalone post-MemWal-stable.
- **v0.7d Phase 5 structured-output classifiers** — backlog rank 8, planned standalone.
- **v0.7d Phase 6 memory plumbing delete** — backlog rank 9, planned standalone.
- **PIPELINE-AUDIT-PHASE-2** — backlog rank 7.5, separate ship slot.
- **B1 marketing landing shadcn redesign** — backlog rank 19.
- **CSP polish (SPEC 31)** — backlog rank 14.
- **S.272 cron timeout fix** — registered separately as the new backlog item; lands after S.269 closes.

---

## Cross-references

- Audit + bucket categorization → `AUDIT_V07E_TEMPLATE_DIVERGENCE_2026-05-23.md` (the predecessor read-only doc).
- Invoice deprecation 5 phases → `V07E_INVOICE_DEPRECATION.md` (Phase D pre-existing).
- HITL native (out-of-scope) → `SPEC_SLICE_D_DRAFT.md`.
- Spec 1 (engine harness correctness) → `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md`.
- Spec 2 (engine harness intelligence) → `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`.
