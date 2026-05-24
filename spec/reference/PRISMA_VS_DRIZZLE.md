# Prisma vs Drizzle

> **Status:** LOCKED — Audric stays on Prisma; do not re-litigate without new evidence
> **Closes:** `SPEC_AI_SDK_HARDENING.md` P4.4
> **Tracked by:** `audric-build-tracker.md` S.306 (2026-05-24)
> **Last reviewed:** 2026-05-24

---

## The decision in one paragraph

The AI SDK chatbot template uses Drizzle. Audric uses Prisma — 13 models, 41 migrations, ~90 call sites across 31 files in `audric/apps/web-v2`, freshly migrated FROM Drizzle TO Prisma in v0.7e S.247 (~2 months ago) for good reasons that still hold. The chatbot template's Drizzle choice is correct FOR THE TEMPLATE (edge-runtime by default, smaller bundle wins on cold start), but audric/web-v2's `/api/chat` is a Node-runtime serverless function on Vercel where Drizzle's bundle savings don't apply. Migrating back would reverse S.247, cost ~1500-2500 LoC of risky edits concentrated in JSON-column schemas (Message.parts UIMessage shape, TurnMetrics 41-field telemetry, UserPreferences.limits) + 2 raw-SQL call sites, and buy nothing the current Prisma surface lacks. **Decision: stay on Prisma. Document this so the question doesn't get re-asked.**

---

## Why the question keeps coming up

The AI SDK chatbot template ([chatbot.ai-sdk.dev](https://chatbot.ai-sdk.dev)) ships Drizzle as its reference ORM. Every time an agent reads the template and compares to audric's stack, the natural question is "should we match the template?" The answer is no, and that needs a permanent home.

---

## The actual evidence

### 1. We just migrated the OTHER direction

`apps/web-v2/prisma/schema.prisma` line 447 contains the migration marker:

> `// v0.7e Persistent Chats (S.247) — replaces the drizzle Chat/Message/Vote`

Audric/web-v2 went FROM Drizzle TO Prisma in S.247 (v0.7e Persistent Chats, ~April 2026). Migrating back reverses a recent decision made for explicit reasons. The agent re-asking the question almost certainly hasn't read S.247's rationale.

### 2. Migration cost is real and concentrated in risky surfaces

- **13 Prisma models** to translate to Drizzle schemas
- **41 migrations** to re-baseline (Drizzle uses its own migration runner)
- **~90 call sites across 31 files** to rewrite (`prisma.X.findMany` → Drizzle's query builder)
- **Risk-concentrated JSON columns** that don't translate cleanly:
  - `Message.parts` — the UIMessage shape, mutable across chat sessions
  - `TurnMetrics` — 41-field telemetry row, every field is a per-turn schema contract
  - `UserPreferences.limits` — UserPermissionConfig serialized as JSON
- **2 raw-SQL call sites** (`/api/stats`, `/api/user/preferences`) — Drizzle's raw SQL surface differs from Prisma's `$queryRaw`
- **Estimated 1500-2500 LoC of risky edits.** Migration windows of this size almost always introduce subtle regressions (silent JSON shape drift, transaction semantics mismatches, migration ordering bugs).

### 3. Drizzle's edge-runtime advantage doesn't apply here

The chatbot template's main use of Drizzle is in API routes that run on **edge runtime by default** (smaller bundle, faster cold start). Prisma's older bundle was a real problem for edge — until the Neon serverless adapter (which audric uses) solved it.

Audric/web-v2's `/api/chat` is a **Node-runtime serverless function**, not edge. The bundle-size argument for Drizzle is moot.

```ts
// apps/web-v2/app/api/chat/route.ts top of file
export const runtime = 'nodejs';  // not 'edge'
```

### 4. No painful Prisma surface today

Audit of the audric Prisma usage post-S.247:

| Pain point that would justify migration | Audric uses it? |
|---|---|
| `$transaction` (Prisma's interactive tx — known performance overhead) | **No** — zero call sites |
| `$extends` (Prisma 5+ client extensions — limited tooling support) | **No** — zero call sites |
| Fluent-chain pain (deeply nested `.include({ X: { include: { Y: ... } } })` queries) | **No** — flat queries dominate; deep includes are rare and tested |
| Pessimistic locking that Prisma doesn't expose well | **No** — Sui transaction layer owns concurrency |
| Read replicas with custom routing | **No** — Neon serverless is the path |
| Prisma client compatibility issues with Next.js / Vercel | **No** — generated client committed, works |

The painful Prisma surfaces that DO motivate migrations in other codebases don't exist in audric.

### 5. The template's schema patterns CAN inform us without migration

The chatbot template's separation of `chat / message / vote / user / document` is clean. Audric's Prisma schema already has the matching entities:

- `Chat` ✓
- `Message` ✓
- `Vote` ✓
- `User` ✓

The chatbot template's `Document` (for artifacts) maps to Audric's future Audric Store `Artifact` table (per `CANVAS_VS_ARTIFACT.md`) — same conceptual entity, different name.

If we wanted to align naming conventions (`User → DBUser`, `Chat → DBChat`), that's a cosmetic rename, not an ORM migration. ~30-line diff, not 1500-2500. Pursue when convenient, not as a structural shift.

---

## What migrating WOULD buy

Honestly accounting for the other side of the trade:

| Benefit | Real magnitude |
|---|---|
| "Standardize on chatbot template" | Marginal — we already use AI SDK + `Experimental_Agent` + every other template pattern. ORM choice is invisible to the architecture diagram. |
| Smaller bundle | Doesn't apply (Node runtime, see §3). |
| Faster cold start | Doesn't apply (same reason). |
| Drizzle's TypeScript inference is generally tighter | Real but small — Prisma's generated client has good inference for our usage. Edge cases (raw SQL, dynamic queries) the same in both. |
| Lower per-query overhead | Real ~10-30ms gain on edge; ~negligible on Node. Our chat route latency is dominated by LLM time-to-first-token (~500-1500ms), not ORM dispatch. |
| Schema-as-code in TypeScript instead of `.prisma` DSL | Stylistic preference, not a decisive factor. Prisma's `.prisma` DSL works fine + has better DX for migrations. |

**Net benefit:** marginal. **Net cost:** 1500-2500 LoC of risky edits + multi-week migration window + opportunity cost. Not worth it.

---

## When to revisit this decision

Re-read this doc when ANY of these lands:

1. **Prisma deprecates the Neon serverless adapter** OR ships a breaking change in a major version. Bundle size becomes a problem; revisit.
2. **Audric/web-v2 needs to run on edge runtime** for a specific verb (e.g. ultra-low-latency `/api/balance` snapshot). Edge-incompatible ORM choice forces the conversation.
3. **A new Prisma version introduces a regression that costs >2 days to work around.** Pain hits a threshold.
4. **Drizzle ships a feature that Prisma can't match within 6 months** (e.g. native vector column support without prisma-extension hacks).
5. **Schema complexity grows past ~50 models** with frequent breaking refactors — at that scale, Prisma's `.prisma` DSL ergonomics can become a bottleneck. (We're at 13 today.)

None of those are imminent. The default for the foreseeable future is: stay on Prisma.

---

## What we DO commit to (alignment without migration)

- **Cosmetic naming alignment** with chatbot template when convenient — `User → DBUser` / `Chat → DBChat` if/when we touch those entities for other reasons. Not a standalone task.
- **Cherry-pick patterns** from the chatbot template's data layer when adding new tables: id generation, indexing conventions, timestamp shapes. Doesn't require the same ORM to copy the patterns.
- **Document patterns we adopted from the template** in this doc + the schema comments, so the inheritance is visible.

---

## Cross-references

- `audric/apps/web-v2/prisma/schema.prisma` — the canonical 13-model schema. Line 447 carries the S.247 migration marker.
- `audric/apps/web-v2/prisma/migrations/` — 41 migrations applied to production.
- `audric-build-tracker.md` S.247 — the original Drizzle → Prisma migration (~April 2026).
- `spec/active/shipping/SPEC_AI_SDK_HARDENING.md` P4.4 — the SPEC item this doc closes.
- `audric-build-tracker.md` S.306 — ship record for this decision doc.
- [chatbot.ai-sdk.dev](https://chatbot.ai-sdk.dev) — the AI SDK chatbot template (uses Drizzle).
- `spec/reference/CANVAS_VS_ARTIFACT.md` — sibling decision doc on the chatbot template's other primitive divergence.
- `t2000/CLAUDE.md` — cross-reference for future agents who might re-ask the question.
