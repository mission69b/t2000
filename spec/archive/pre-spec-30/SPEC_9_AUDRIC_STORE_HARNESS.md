# SPEC 9 — Foundation harness extensions (ships today's value; Audric Store primitives deferred to v0.2)

**Version:** 0.1.3 (v0.1.2 + 6 pre-lock refinements from May 3 founder review, locked 2026-05-03)
**Date:** 2026-05-03
**Status:** Locked. **Hard prerequisite: SPEC 8 v0.5 ships first**, SPEC 7 v0.3.1 ships second; SPEC 9 v0.1.3 lands third; **SPEC 10 v0.2.1 lands fourth** (consumes the same `pending_input` primitive for the username picker, and consumes the unified Contact shape that v0.1.3 ships in `add_recipient`). The deferred-items lists at the bottom of SPEC 7 v0.3 + SPEC 8 v0.4 were the seed for the v0.1 draft. **v0.1.1 reframes the v0.1 scope based on a "what ships value to existing users vs what waits on Phase 5 marketplace work" cut**: every Theme A.1 / A.3.1 / A.3.2 deliverable (content-review ReviewCard, 5 generator tools, split-screen buyer panel, manifest tables) is **gated on Phase 5** Audric Store marketplace product work — listings DB, royalty splits, creator payout schedule. Phase 5 isn't a technical decision; it's a product decision the founder hasn't made yet. Building those harness primitives now leaves them sitting until Phase 5 unlocks. **v0.1.1 splits the spec into two ship windows:** v0.1.1 (~3.5d) ships **today's-value** primitives — `pending_input` inline forms (useful for Finance/Pay/contact flows), proactive insight blocks (useful for savings recommendations), persistent cross-turn todos (useful for goal tracking). v0.2 (~6.5d) ships **marketplace-gated** primitives when Phase 5 begins — content-review ReviewCard, 5 generator tools, split-screen buyer panel, manifest tables. Theme B.2-7 stay as **SPEC 10 candidates**.
**Author:** AI assistant (post v2-demo audit + SPEC 7 v0.3 / SPEC 8 v0.4 bundle, reframed post May 1 full-trio review)
**Targets:** `@t2000/engine` v1.3.0 · `@audric/web` next minor UI (no new app surface required for v0.1.1)
**Engine baseline:** v1.2.0 (post SPEC 8 v0.5)
**SDK baseline:** v1.1.0 (post SPEC 7 v0.3.1)
**Audric baseline:** v0.56.x (post SPEC 7 v0.3.1)
**Version-chain drift note (S.53.8, 2026-05-03 → updated S.61, 2026-05-05):** Version targets above were locked pre-Phase 0 (SPEC 13). Engine has since shipped `1.12.0` (Phase 0 — `MAX_BUNDLE_OPS=2` + 7-pair `VALID_PAIRS` whitelist). SPEC 12 was retired 2026-05-03 in favour of "specs get refreshed at implementation time" — then **resurrected 2026-05-05** as a real ~3-4d spec (S.61) after the policy failed to bite on items outside in-flight scopes. Treat `audric-build-tracker.md` as the authoritative version chain at implementation time; SPEC 12 v0.1 drafting will reconcile this header against the actual shipped chain.

---

## Revision log

| Version | Date | Notes |
|---|---|---|
| **0.1.3** | **2026-05-03** | **Pre-lock founder-review refinements (6 surgical edits — R1–R6 from May 3 review during SPEC 7 P2.7 soak).** **(R1 — sequencing flip, A.3.3 → B.1 → A.2)** v0.1.2 sequenced A.2 first as the largest deliverable. v0.1.3 flips to smallest-first, lowest-risk-first: A.3.3 (~0.5d, pure additive — system prompt + ~5 LOC engine + ~30 LOC host) ships first, B.1 (~1.5d, self-contained — Prisma model + host API + sidebar) ships second, A.2 (~2d, biggest change — new EngineEvent emission + new resume endpoint + new form renderer) ships last. Lets us bank A.3.3 + B.1 ship-value before opening the A.2 surface fight. **(R2 — A.2 boundary with chip flow)** v0.1.2 implied `add_recipient` would be the user-initiated contact-add UI. v0.1.3 explicitly gates `pending_input`-emitting `add_recipient` to **LLM-initiated only** — fires when the LLM resolves an unknown contact mid-conversation (e.g. "send $10 to Mom" but Mom isn't in contacts yet). The existing chip-flow user-initiated contact-add path stays untouched. Avoids duplicative UX surface. **(R3 — A.3.3 per-conversation cooldown)** v0.1.2 capped emission at ≤1 per turn. v0.1.3 adds a **per-conversation-thread cooldown** — same proactive nudge content (idle-balance / HF-warning / APY-drift) doesn't fire twice in the same session. Engine-side dedup by (`type`, `subjectKey`) tuple from the `<proactive>` marker payload. Prevents tune-out when users revisit Audric throughout a session. **(R4 — B.1 system-prompt cost trim)** v0.1.2 injected `<open_goals>` block + ~80-token teaching addendum unconditionally for goal-bearing users (~230 tokens/turn). v0.1.3 makes both conditional: (a) `<open_goals>` block is **omitted entirely when goal count = 0** (saves ~150 tokens for the majority of users); (b) goal-promotion teaching addendum is **gated on `harnessShape >= rich`** (lean/standard turns don't pay the cost; goal feature is muted on lean anyway). **(R5 — drop `dismiss_goal` as engine tool)** v0.1.2 specced `dismiss_goal` as an auto-tier engine tool with the note "no LLM intermediation needed." v0.1.3 drops it from the tool surface entirely — sidebar dismiss button POSTs directly to a host API (`POST /api/goals/dismiss`). Engine sees goals via the financial-context block read-only; mutations are host-only. Saves ~50 tokens of permanent tool-description bloat. v0.1.1 ships **2 new tools, not 3**: `add_recipient` + `update_todo` extension. **(R6 — A.2 form field kind rename)** v0.1.2 specced `kind: 'address'` for the polymorphic identifier field (Audric handle / external SuiNS / bare 0x). v0.1.3 renames to **`kind: 'sui-recipient'`** to match the unified Contact shape's `identifier` field semantics — "address" is misleading because the field accepts handles + names + addresses. Pure spec polish; pre-lock catch avoids a v0.1.4 rename patch. **(Bonus — opportunistic SPEC 12 overlap notes)** P9.2 implementation phase notes flag two captured-for-SPEC-12 items that overlap with v0.1.3 surface: (a) contact-match strict-equality (P2.5b SPEC 12 #2) — `add_recipient`'s polymorphic resolver is the natural place to relax strict-equality on saved-contact lookups, ~30 min during P9.2; (b) hardcoded recipient-field allow-list (P2.5b SPEC 12 #1) — if SPEC 9 adds tools with recipient fields, register via `ToolFlags.recipientFields?: string[]` to close the open-set, ~15 min. Both opportunistic, not blocking. Effort impact: 0d (refinements net to zero — A.2 trims ~50 tokens via R5 offset by R3 dedup-key plumbing ~0.1d). |
| **0.1.2** | **2026-05-01** | **SPEC 10 v0.2.1 alignment patch (3 cross-spec fixes — G1/G5/G6 from v0.2.1 lock review).** (G1 — HIGH) **`add_recipient` tool aligned with SPEC 10's unified Contact shape.** v0.1.1 specced `add_recipient` with three discrete fields (`recipient name + 0x address + optional SuiNS`). SPEC 10 v0.2.1 D7 locks a unified `Contact { name, identifier, resolvedAddress, audricUsername?, addedAt, source }` shape where `identifier` is polymorphic (Audric handle / external SuiNS / bare 0x). Since v0.1.2 ships BEFORE SPEC 10, the tool would otherwise ship in the wrong shape and need migration. v0.1.2 ships `add_recipient` directly in the unified shape — single `identifier` text field with helper text `"Type @alice for an Audric user, alex.sui for any SuiNS, or paste a 0x"`; server-side resolves via `normalizeAddressInput` (S.52); reverse-lookup populates `audricUsername` if applicable. (G5 — LOW) `pending_input` consumer list extended — SPEC 10's chat-timeline username picker (Phase B.1) is documented as a v0.1.2 consumer. (G6 — LOW) `audric.ai/[username]` route shape is LOCKED in SPEC 10 v0.2.1 D9 + Phase D.1; v0.2 author MUST consult SPEC 10 first and extend additively. Effort impact: 0d (display/schema-only spec change; no new tools, no new endpoints). |
| 0.1.1 | 2026-05-01 | **Scope reframe (post full-trio review + founder decisions).** v0.1's "Theme A first, then Theme B" assumed Audric Store marketplace work was the next product bet. Revisiting against `audric-roadmap.md` Phase 5 status (no firm date; Phase 4 + Audric Finance still landing): every A.1 / A.3.1 / A.3.2 deliverable (content-review ReviewCard, 5 generator tools, split-screen buyer panel, manifest tables) **depends on marketplace business logic that doesn't exist yet** (listings DB, royalty splits, creator payout schedule). Building those harness primitives now leaves them sitting until Phase 5 unlocks. The v0.1.1 cut: **v0.1.1 ships today's-value primitives (~3.5d)** — A.2 `pending_input` inline forms (useful for ANY structured-input scenario in Finance/Pay/contacts), A.3.3 proactive `✦ ADDED BY AUDRIC` insight blocks (useful for savings recommendations), B.1 persistent cross-turn todos (pure Finance value: "you set 'save $500 by month-end' three weeks ago — you're $120 short"). **v0.2 ships marketplace-gated primitives (~6.5d)** when Phase 5 starts — A.1 content-review ReviewCard + 5 generators, A.3.1 split-screen buyer panel, A.3.2 manifest tables. Theme B.2-7 → SPEC 10 candidates. **Three pre-SPEC-9 lock decisions resolved** in SPEC 7 v0.3.1 + SPEC 8 v0.5 (May 1 patches): (D1) `permission-card` `TimelineBlock` variant landed in SPEC 8 v0.5; (D2) `pending_input` event type RESERVED in SPEC 8 v0.5 (no-op handler); (D3) `preserveSeed` field DROPPED entirely from SPEC 7 v0.3.1 — SPEC 9 v0.2 designs the right shape (`seed?: string` + `regenerationMode?: enum`) when content-review lands. |
| 0.1 | 2026-05-01 | **Initial draft.** Consolidated the deferred-items lists from SPEC 7 v0.3 (5 items) + SPEC 8 v0.4 (8 items) — 13 candidate items, 4 of which overlap. Split into two themes: (Theme A) Audric Store readiness, (Theme B) Generic harness extensions. Total scope: ~6d Theme A or ~9.5d with B.1 + B.2 folded in. Superseded by v0.1.1 scope reframe. |

---

## TL;DR (read this first)

> **The product context (reframed).** v0.1 framed SPEC 9 as "Audric Store readiness." But Audric Store (Phase 5) needs marketplace business logic — listings DB, royalty splits, creator payouts — that doesn't exist yet. Building Audric-Store-specific harness primitives BEFORE that exists leaves them sitting on a shelf. Meanwhile, three patterns surfaced in the v2 demo audit work TODAY for existing Audric Finance / Pay users without any marketplace dependency. **v0.1.1 ships those today.** v0.2 ships the marketplace-gated primitives the day Phase 5 starts.
>
> **What v0.1.1 ships (~3.5d) — sequencing locked smallest-first in v0.1.3:**
> 1. **Proactive `✦ ADDED BY AUDRIC` insight blocks** (~0.5d, **ships first per R1**) — surface unsolicited recommendations as a distinct `TimelineBlock` styling (`text` block subtype with `proactive: true` flag + lockup). Today's "you have $X idle, want to save it?" hint is buried in chat text. Making it a recognisable visual primitive lets the agent surface yield/savings/HF nudges without feeling chatty. **v0.1.3 R3:** per-conversation-thread cooldown — same nudge content doesn't fire twice in the same session.
> 2. **Persistent cross-turn todos** (~1.5d, **ships second per R1**) — extend SPEC 8 v0.5's `update_todo` from per-turn to cross-session. New `Goal` Prisma model + sidebar surface. Pure Finance value: "you set 'save $500 by month-end' three weeks ago — you're $120 short." **v0.1.3 R4:** `<open_goals>` block omitted when goal count = 0; teaching addendum gated on `harnessShape >= rich`. **v0.1.3 R5:** dismissal is a host-only API (no engine tool surface).
> 3. **`pending_input` inline forms** (~2d, **ships last per R1**) — when a tool needs structured input (recipient + memo on send, scheduled-tx setup, contact entry, future onboarding fields), render a typed form inline in the timeline instead of free-text parsing. Failure mode killed: today the agent has to extract three fields from `"send 50 to my mum at 0xabc..."` and gets it wrong ~10% of the time. The pattern is generic — Audric Store is one consumer, not the only one. **v0.1.3 R2:** `add_recipient` consumer is LLM-initiated only (fires when the LLM resolves an unknown contact mid-conversation); existing user-initiated chip-flow contact-add stays untouched. **v0.1.3 R6:** polymorphic identifier field uses `kind: 'sui-recipient'` (renamed from `kind: 'address'`).
>
> **What v0.2 ships (~6.5d, when Phase 5 begins):**
> 1. **Content-review ReviewCard** + 5 content-generation tools (~3d) — Accept/Regenerate/Cancel for AI-generated music/art/ebooks. Gated on Phase 5 because "Approve = mint + list" needs the listings DB.
> 2. **Split-screen buyer panel** (~1.5d) — `audric.ai/<username>` non-owner view. Gated on Phase 5 because there's nothing to render until listings exist.
> 3. **Manifest tables** (~1d) — per-listing supply tracker. Gated on Phase 5.
> 4. **Reframe** — when v0.2 starts, re-evaluate provider choices (Suno vs alternatives), pricing strategy, royalty contract design.
>
> **What this spec does NOT change.**
> - The Audric Finance / Pay / Passport surfaces (SPEC 7 + SPEC 8 territory).
> - The harness foundation — SPEC 8 v0.5's `TimelineBlock` taxonomy is the substrate; v0.1.1 ships ONE new variant (`pending_input`) plus a `proactive` flag on the existing `text` variant; v0.2 adds the content-review variant.
> - The MPP gateway / Pepesto integration — orthogonal product surface (`spec/COMMERCE_V2.md`).
>
> **What v0.1.1 deliberately DOES NOT do:**
> - No new app surface (`apps/store` deferred to v0.2 or later).
> - No new content providers (Suno / Flux etc. — wait until A.1 lands).
> - No marketplace primitives (listings, royalties, payouts) — Phase 5 product scope.

**One-line product impact (v0.1.1):** *the agent gets typed forms, distinct proactive nudges, and goals that survive across sessions — without waiting for Phase 5 to start.*

**One-line product impact (v0.2, future):** *Audric Store goes from "demo-only mockups" to a shippable creator marketplace, reusing the v0.1.1 + SPEC 7/8 primitives for content review.*

---

## Pre-SPEC-9 lock decisions — RESOLVED in May 1 patches

The v0.1 draft flagged three pre-SPEC-9 decisions that needed to land in SPEC 7/8 before SPEC 9 started, to avoid rebuilt-twice tax. **All three are resolved in the May 1 patches** (SPEC 7 v0.3.1 + SPEC 8 v0.5):

| ID | Decision | Resolution |
|---|---|---|
| D1 | `permission-card` `TimelineBlock` variant | **Resolved in SPEC 8 v0.5** — added to the `TimelineBlock` union with `payload: PendingAction` + `status: 'pending' \| 'approving' \| 'regenerating' \| 'denied' \| 'approved'`. SPEC 7 owns the renderer; SPEC 8 owns the slot. SPEC 9 v0.2 will add a content-review variant or a separate block type when content-review lands (decision deferred to v0.2 design). |
| D2 | `pending_input` event type — reserve the ordinal | **Resolved in SPEC 8 v0.5** — event type added to `EngineEvent` union with documented "engine does NOT emit under SPEC 8" comment + no-op host handler with `pendingInputSeenOnLegacy` telemetry counter. SPEC 9 v0.1.1 starts emitting the event when A.2 lands. |
| D3 | `regenerateInput.preserveSeed` semantics | **Resolved in SPEC 7 v0.3.1 — DROPPED entirely.** Content-review's seed semantics are richer than a boolean (default = variation; rare = locked seed; possible future = parametric variation). YAGNI for quote-refresh. SPEC 9 v0.2 will design the right shape (`seed?: string` + `regenerationMode?: 'fresh' \| 'variant' \| 'lockedSeed'`) when content-review lands with full context. |

No outstanding pre-SPEC-9 decisions blocking implementation.

---

## v0.1.1 SCOPE — today's-value primitives (~3.5d, ships immediately after SPEC 7 v0.3.1)

These three primitives have value to existing Audric Finance / Pay users without any Phase 5 dependency. They land first.

| Order (v0.1.3) | Item | Source | Value to existing users | Effort |
|---|---|---|---|---|
| 1st | **A.3.3 — Proactive `✦ ADDED BY AUDRIC` insight blocks** | v2 demo `06` | Surface savings recommendations / yield nudges / HF warnings as a distinct visual primitive instead of buried text. Already partially done in chips; this makes it a recognised TimelineBlock styling. v0.1.3 R3 adds per-conversation-thread cooldown. | ~0.5d |
| 2nd | **B.1 — Persistent cross-turn todos** | SPEC 8 v0.4 deferred-list | Goal tracking across sessions ("you set 'save $500 by month-end' three weeks ago — you're $120 short"). Pure Finance value. New `Goal` Prisma model + sidebar surface. v0.1.3 R4 trims system-prompt cost; R5 makes dismissal a host-only API. | ~1.5d |
| 3rd | **A.2 — `pending_input` inline forms** | v2 demos `05` + `07`; v1 contact-add chip flow | Replaces free-text parsing for ANY structured-input scenario: send-recipient + memo, scheduled-tx setup, contact entry, future onboarding fields. Used by Audric Store too when A.1 lands, but not gated on it. v0.1.3 R2 gates `add_recipient` to LLM-initiated only; R6 renames `kind: 'address'` → `kind: 'sui-recipient'`. | ~2d |

**v0.1.1 total: ~3.5d.** No new app surface, no new content providers, no marketplace dependencies.

---

## v0.2 SCOPE — Audric Store readiness (~6.5d, gated on Phase 5 product start)

This is what makes Audric Store shippable. **Hard prerequisite: Phase 5 marketplace business logic** (listings DB, royalty splits, creator payout schedule) — none of which exists today. Building these primitives now leaves them on a shelf. Re-evaluate when Phase 5 starts.

| Item | Effort | Phase 5 dependency |
|---|---|---|
| A.1 — Content-review ReviewCard + 5 generators | ~3d | Approve = mint + list — needs listings DB |
| A.3.1 — Split-screen buyer panel | ~1.5d | Nothing to render until listings exist |
| A.3.2 — Manifest tables | ~1d | Per-listing supply tracker — needs supply contract |

**v0.2 total: ~6.5d.** Re-evaluate provider choices, pricing strategy, royalty contract design when Phase 5 starts.

---

## Theme A details (deferred items live in v0.2 unless tagged v0.1.1)

### A.1 — Content-review ReviewCard (DEFERRED to v0.2 — gated on Phase 5)

**Source pattern:** v2 demos `03-make-a-beat.html` (line 142+, the "Review Beat" card with Accept / Regenerate / Cancel buttons), `04-coloring-book.html` (per-page review + supply cap), `07-xmas-gifts.html` (gift bundle review with manifest table).

**Engine contract.** Same `permission-card` `TimelineBlock` from D1 above, but the underlying `PendingAction` carries a content artifact (audio URL, image URL, PDF URL) instead of a transaction step list. The action is a write to the **content-generation tool's output** (e.g. `generate_beat`, `generate_coloring_book_page`, `compile_gift_bundle`) — the artifact already exists at the URL; "approve" means "mint/list this artifact on-chain"; "regenerate" means "discard, re-run the tool with same prompt + new seed"; "cancel" means "discard, do nothing."

```typescript
// New tool flag (additive to ToolFlags):
interface ToolFlags {
  // ... existing flags ...
  producesReviewableArtifact?: boolean;  // SPEC 9 — opts the tool into content-review flow
  artifactPreviewKind?: 'audio' | 'image' | 'pdf' | 'mixed';  // host renders preview accordingly
}

// Tools opting in (v1, all NEW):
//  - generate_beat (audio/mp3 URL via Suno-or-equivalent)
//  - generate_image (image URL via DALL-E / Flux / etc)
//  - generate_coloring_book (PDF URL, multi-page)
//  - compile_gift_bundle (manifest of N artifacts + total price)
//  - generate_ebook (PDF URL)
```

**The PermissionCard shape (SPEC 9 fills the SPEC 8 v0.4 renderer slot):**

```
┌─ Review your beat ───────────────────────────── 0:42 ┐
│                                                       │
│  ▶ ──────●─────────────  audio scrubber              │
│                                                       │
│  STYLE        Lo-fi hip-hop, 90 BPM                   │
│  DURATION     0:42                                    │
│  PROMPT       "chill vibe for studying"               │
│  SEED         #a3f9b27c (regenerate for variation)   │
│                                                       │
│  LIST PRICE   [ $5.00 USDC ] · 92% to you             │
│                                                       │
│  [   Cancel   ]   [   ↻ Regenerate   ]   [   List   ]│
└───────────────────────────────────────────────────────┘
```

- Same 3-button vocabulary as SPEC 7 v0.3 quote-refresh (Cancel / Regenerate / Approve-equivalent).
- Approve-equivalent label is **List** for content-review (mints the artifact + creates the listing in one Payment Stream — eats SPEC 7 v0.3's bundling for free).
- Regenerate calls the same generation tool again. Engine-side: dispatches the tool with same input + new seed, emits a fresh `permission-card` block replacing the prior one.
- Cancel: emits a `tool_result` for the original tool with `{ approved: false }` and the LLM continues (typically asking "want to try a different prompt?").

**Effort:** ~3 days (engine: tool flag + content-generation orchestration + regenerate handler — partially shared with SPEC 7 v0.3's `regenerateBundle` helper; host: artifact preview component + audio/image/PDF renderers; new content-generation tools wired to underlying providers).

### A.2 — `pending_input` inline forms (**v0.1.1 — SHIPS FIRST**)

**Source pattern:** v2 demos `05-mums-birthday.html` (line 200+, the "WHAT'S MUM'S DELIVERY ADDRESS?" inline form mid-conversation), `07-xmas-gifts.html` (recipient list builder with name + relationship + budget per row).

**The problem today.** When the agent needs structured input (recipient name + address + relationship), it asks via free-text and parses the response. Failure mode: user types `"send to my mum at 123 fake st london"` — the agent has to extract three fields from one string, often fails, then asks again. Free-text input makes the agent feel less competent than a form.

**The decision: introduce a `pending_input` event type + `pending_input` `TimelineBlock` variant.** Engine emits when a tool's preflight detects missing structured input; host renders a typed form inline; user submits; host POSTs to `/api/engine/resume-with-input`; engine resumes the turn with the structured payload as the tool input.

> **v0.1.3 R2 — `add_recipient` is LLM-initiated only.** The first consumer of `pending_input` (the `add_recipient` tool) fires ONLY when the LLM resolves an unknown contact mid-conversation — e.g. user types "send $10 to Mom" and "Mom" isn't in their saved-contacts list, so the LLM calls `add_recipient` to capture the name. The existing user-initiated chip-flow contact-add UI (settings page or dashboard "Add contact" button) stays untouched in v0.1.1; users who want to manually pre-add contacts continue to use chips. v0.1.1 ships TWO co-existing add-contact paths: chip-flow for user-initiated, `pending_input` for LLM-initiated. **No surface conflict** — chips never trigger `pending_input`; LLM never triggers chips. The `pending_input` form is only rendered when the engine emits the event mid-turn (which only happens when the LLM calls `add_recipient` with incomplete input). Boundary documented in the system prompt + tool description: "call `add_recipient` only when you (the LLM) need to save a new contact you don't already have; never as a UI substitute for the user's settings page."

**Documented consumers (v0.1.2 + future):**

| Consumer | Spec | When it consumes `pending_input` |
|---|---|---|
| `add_recipient` (contact entry) | SPEC 9 v0.1.2 (this spec) | A.2 ships first — original use case |
| Send-recipient + memo flow | SPEC 9 v0.1.2 (this spec) | When user-typed input is too unstructured for chip flow |
| Username picker (chat-timeline variant) | **SPEC 10 v0.2.1 Phase B.1** | Mandatory-at-signup picker renders inline using `pending_input` (settings-page picker is independent — uses the standalone modal version of the same component) |
| Future scheduled-tx setup | TBD | Multi-field date + amount + recipient flow |
| Future onboarding fields | TBD | Multi-field forms during account setup |

```typescript
// New EngineEvent variant (additive):
| {
    type: 'pending_input';
    inputId: string;                  // UUID v4 — analogous to attemptId for pending_action
    toolName: string;                 // tool that requested the input
    toolUseId: string;                // matches the tool_use block waiting for input
    schema: PendingInputSchema;       // typed form schema (see below)
    description: string;              // user-facing prompt ("Where should this be delivered?")
  }

// Form schema (lightweight — JSON Schema is overkill here):
interface PendingInputSchema {
  fields: Array<{
    name: string;                     // input key
    label: string;                    // user-facing label
    // v0.1.3 R6: 'sui-recipient' (renamed from 'address') — polymorphic identifier
    // accepting Audric handle (`@alice` or `alice.audric.sui`), external SuiNS
    // name (`alex.sui`), or bare 0x. Resolved server-side via `normalizeAddressInput`
    // (S.52). 'address' was misleading because the field accepts handles + names
    // + addresses, not just addresses.
    kind: 'text' | 'sui-recipient' | 'number' | 'usd' | 'select' | 'date';
    required: boolean;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;  // for 'select'
    min?: number;                     // for 'number' / 'usd'
    max?: number;
    pattern?: string;                 // regex for 'text'
  }>;
}
```

**Tool side.** A tool opts into `pending_input` by returning a special preflight result:

```typescript
// In the tool's preflight or execute:
if (!input.recipientAddress) {
  return { needsInput: { schema: { fields: [...] }, description: '...' } };
}
```

The engine handles `needsInput` by yielding `pending_input` and pausing the turn (analogous to `pending_action`).

**Resume.** New host endpoint `POST /api/engine/resume-with-input` (~80 LOC) accepts `{ sessionId, inputId, values }`, validates against the schema, calls `engine.resumeWithInput(inputId, values)`, which feeds the values back as the tool's input and continues execution.

**Effort:** ~2 days (engine: `pending_input` event + `resumeWithInput` method + preflight `needsInput` plumbing; host: form renderer with typed fields + new resume endpoint + Storybook coverage).

#### A.2.1 — `add_recipient` form schema (v0.1.2 — SPEC 10 D7 unified Contact shape)

The first consumer of `pending_input`. Implements the unified Contact shape locked in SPEC 10 v0.2.1 D7:

```typescript
// Tool: add_recipient — preflight returns this when called with no/incomplete input
return {
  needsInput: {
    schema: {
      fields: [
        {
          name: 'name',
          label: 'Nickname',
          kind: 'text',
          required: true,
          placeholder: 'Mom',
        },
        {
          name: 'identifier',
          label: 'Audric handle, SuiNS name, or wallet address',
          kind: 'sui-recipient',  // v0.1.3 R6: renamed from 'address' (polymorphic — see schema doc above)
          required: true,
          placeholder: 'mom.audric.sui  /  alex.sui  /  0x40cd…3e62',
        },
      ],
    },
    description: 'Add a new contact',
  },
};
```

**Server-side resolution** (in the host's `/api/engine/resume-with-input` handler, before persisting):

```typescript
import { normalizeAddressInput, resolveAddressToSuinsViaRpc } from '@t2000/engine';

// 1. Normalize the polymorphic identifier (S.52 — already handles all 3 forms)
const { address: resolvedAddress, originalForm } = await normalizeAddressInput(values.identifier, {
  suiRpcUrl: env.SUI_RPC_URL,
});

// 2. Reverse-lookup to populate audricUsername if applicable (SPEC 10 D7)
const allNames = await resolveAddressToSuinsViaRpc(resolvedAddress, { suiRpcUrl: env.SUI_RPC_URL });
const audricUsername = allNames.find((n) => n.endsWith('.audric.sui'));

// 3. Persist as unified Contact
await prisma.contact.create({
  data: {
    userId,
    name: values.name,
    identifier: values.identifier.trim().toLowerCase(),  // what user typed
    resolvedAddress,                                     // canonical 0x key
    audricUsername,                                       // present iff *.audric.sui leaf exists
    source: 'agent',
    addedAt: new Date(),
  },
});
```

**Why a polymorphic `sui-recipient` kind on the form (NOT three separate fields):**
- Matches how users actually think — they type ONE thing ("the way I refer to this person")
- Aligned with SPEC 10 D7's unified Contact shape — no schema migration when SPEC 10 ships
- Server-side normalization hides the namespace complexity from the user
- Reverse-lookup happens automatically at save time + at first contact-list render

**Display rendering** (handled in the contacts page UI, owned by SPEC 10 Phase D.5 — but `add_recipient` produces the data shape that powers it):
- Nickname (large) + 🪪 `audricUsername` badge (when present) + identifier subtitle (small) + full 0x copyable on tap
- Sort: Audric users first → external SuiNS contacts → bare-address contacts

**Pre-SPEC-10 behavior:** Contacts saved before SPEC 10 ships will have `audricUsername: null`. The lazy backfill cron (SPEC 10 Phase D.4) will populate them retroactively. No data loss; no migration window.

### A.3 — Audric Store launchpad surface (split between v0.1.1 and v0.2)

**Source pattern:** v2 demos `06-party-shop.html` (split-screen buyer panel with proactive `✦ ADDED BY AUDRIC` insights), `04-coloring-book.html` (per-listing manifest table with remaining supply).

**Three sub-deliverables (split by Phase 5 dependency):**

#### A.3.1 — Split-screen buyer panel (**v0.2 — gated on Phase 5**)
At `audric.ai/<username>`, non-owners see a panel rendering the creator's listings (priced in USDC) alongside the agent timeline. Buyer can click a listing → opens a `permission-card` for purchase (same SPEC 7 Payment Stream flow — "Pay $5 USDC for beat → mint NFT receipt"). Owner view stays as-is (chat-only). **Deferred to v0.2** because there's nothing to render until listings exist (Phase 5 marketplace).

#### A.3.2 — Manifest tables (**v0.2 — gated on Phase 5**)
For multi-item listings (gift bundles, coloring books), render a per-row table inside the `permission-card` showing item / price / remaining supply / buyer claim count. Updates in real-time as on-chain supply ticks down. **Deferred to v0.2** because per-listing supply tracker depends on Phase 5 supply contract.

#### A.3.3 — Proactive `✦ ADDED BY AUDRIC` insight blocks (**v0.1.1 — SHIPS FIRST**)
When the agent makes a recommendation NOT directly asked for (e.g. "you have $120 idle USDC — saving it would earn ~$5/mo at current NAVI APY"), surface as a special `text` `TimelineBlock` with `proactive: true` flag + `✦ ADDED BY AUDRIC` lockup. Distinct from regular `text` blocks (which are answers to user questions) — these are unsolicited insights. Telemetry tracks acceptance rate (user follow-up engagement) so we can tune the LLM's emission rate over time.

**v0.1.1 implementation:**
- Extend SPEC 8 v0.5's `text` `TimelineBlock` variant: add `proactive?: boolean` field (default false; back-compat automatic) + optional `proactiveType?: string` + `proactiveSubjectKey?: string` (used by R3 cooldown — see below).
- Engine emits `proactive: true` when the LLM wraps the text in `<proactive type="..." subjectKey="...">...</proactive>` markers (system-prompt-taught — analogous to `<eval_summary>` from SPEC 8 v0.4 G5). The `type` attribute is one of a small allow-list (`idle_balance` / `hf_warning` / `apy_drift` / `goal_progress`); the `subjectKey` is a stable identifier for the specific subject (e.g. `idle_balance:USDC` or `hf_warning:1.45`).
- **v0.1.3 R3 — per-conversation-thread cooldown.** Engine maintains a per-session `Set<{type, subjectKey}>` of already-emitted proactive nudges (lives in `QueryEngine` instance state, dropped on session expiry). Before yielding a `proactive: true` text block, the engine checks the set: if the `(type, subjectKey)` tuple was already seen in this session, the engine strips the `<proactive>` markers and yields the body as a regular `text` block instead (so the LLM's narrative still flows; the visual lockup just doesn't fire twice). Same `(type, subjectKey)` tuple in a NEW session re-triggers the lockup — cooldown is per-session, not cross-session. Telemetry: `audric.harness.proactive_text_suppressed_count{reason: cooldown}` counter so we can dashboard the suppression rate.
- Host renders `proactive: true` text blocks with the `✦ ADDED BY AUDRIC` lockup + a slight visual de-emphasis (italic body, dim border-left accent) to distinguish from primary answer text.
- Telemetry: `audric.harness.proactive_text_emitted_count{type}` counter + `audric.harness.proactive_text_suppressed_count{reason}` counter (R3) + dashboard-derived `proactive_text_acceptance_rate` (% of proactive blocks where the user's next message references the suggestion).

**Effort (v0.1.1, A.3.3 only):** ~0.5d (engine: ~10 LOC marker parse + per-session dedup Set; host: ~30 LOC text variant styling; system prompt: ~50 added tokens explaining when to emit + the `type`/`subjectKey` attribute contract). A.3.1 + A.3.2 stay deferred to v0.2.

---

## Theme B — Generic harness extensions (split: B.1 in v0.1.1; B.2-7 → SPEC 10 candidates)

These work for ALL Audric products, not just Store. **B.1 lands in v0.1.1** because cross-turn todos directly improve Audric Finance UX (goal tracking) without any Store dependency. **B.2-7 are SPEC 10 candidates** — nice-to-have polish or higher-cost features without an urgent driver.

### B.1 — Persistent cross-turn todo surface (**v0.1.1 — SHIPS FIRST**, ~1.5 days)

Today's `update_todo` (SPEC 8 v0.5) lives within a single turn. v0.1.1 promotes it to cross-turn: a sidebar "✦ Open goals" surface that lists todos still in_progress from prior turns. User can dismiss / mark complete / re-prompt. Engine emits a `cross_turn_todos` snapshot at session start; host renders sidebar.

**Schema:** new `Goal` Prisma model (id, userId, content, status, sourceSessionId, createdAt, updatedAt, completedAt). Indexed on `(userId, status)` for fast sidebar hydration.

**Engine wiring:** `update_todo` extended to optionally write to `Goal` table when `persist: true` flag set on the input — opts a todo into being a long-lived goal. Engine pulls open goals on session create + injects into the system prompt's `<financial_context>` block (under a new `<open_goals>` sub-section) so the LLM can reference them on every turn. **v0.1.3 R5: `dismiss_goal` is NOT an engine tool** — sidebar dismissal POSTs directly to `POST /api/goals/dismiss` (host-only API). Engine sees goals via the financial-context block read-only.

**v0.1.3 R4 — system-prompt cost trim.** v0.1.2 injected the `<open_goals>` block + ~80-token teaching addendum unconditionally for goal-bearing users (~230 tokens permanent system-prompt cost per turn). v0.1.3 makes both conditional:

1. **`<open_goals>` block omitted entirely when goal count = 0.** `buildFinancialContextBlock()` skips the sub-section when the user has zero open goals. Saves ~150 tokens per turn for the majority of users (most users never set persistent goals; for those who do, the block only appears when there's something to inject). When goals exist, the block is capped at top-5 by `updatedAt` per v0.1.2 risk #2.
2. **Goal-promotion teaching addendum gated on `harnessShape >= rich`.** The system-prompt teaching block ("when to promote a turn-scoped todo into a persistent goal") only appears in `rich` and `max` harness shapes. `lean` and `standard` turns never see it — they don't have goal-related complexity (lean = no `update_todo` rendering at all per SPEC 8 P3.3 adaptive-shape contract; standard = LLM rarely promotes goals on simpler queries). Saves ~80 tokens per turn for ~70% of turns.

**Net cost (v0.1.3):** zero tokens for users without goals + lean/standard turns; ~150 tokens for users with goals on rich/max turns. Down from ~230 tokens unconditional.

**Host wiring:** new `<OpenGoalsSidebar />` component in `apps/web/components/dashboard/` (or whatever lives at the Audric main dashboard surface). Renders open `Goal` rows with status indicator + **dismiss button POSTs to `POST /api/goals/dismiss`** (R5; no engine tool round-trip) + complete button. Updates in real-time when engine emits `goal_updated` events (new event type — RESERVED in SPEC 8 v0.5 by analogy with `pending_input` if needed; otherwise polls on session change).

**System-prompt addition (~80 tokens, gated):** teach the LLM when to promote a turn-scoped todo into a persistent goal (e.g. "save $500 by month-end" = persist; "check current rates" = don't persist). Default is don't-persist; user can ask "remember this goal" to opt in. **Per R4: only injected when `harnessShape >= rich`.**

**Why this is high-value v0.1.1:** today the agent forgets everything between sessions. A user sets a savings target on Monday, comes back Friday, gets no context. Persistent goals + the existing `<financial_context>` block make Audric feel like it remembers. Big trust win for ~1.5d.

### B.2 — Multi-agent handoff (~2 days, → SPEC 10 candidate)

When the user asks a deep-research question ("what's the best DeFi yield right now across all chains?"), main agent hands off to a sub-agent that runs longer (~30s) with a specialised prompt + tool subset. Sub-agent runs in parallel; main agent stays responsive for follow-ups. UI: new `subagent` `TimelineBlock` showing the sub-agent's narration in a nested card.

**Engine:** new `handoff_to_subagent` auto-tier tool. SubAgent shares prompt cache with parent.

### B.3 — Inline data browsers (~1 day, → SPEC 10 candidate)

When a tool returns a data structure (portfolio, tx history, position list), let the user click a row to "drill in" — opens an inline expandable panel showing the full row data. Today this requires a follow-up question ("tell me more about my SUI position"); SPEC 10 makes it a click.

### B.4 — Voice mode v2 (~1 day, → SPEC 10 candidate)

Per-block voicing (deferred from SPEC 8 v0.3 Gap 4). Thinking blocks voiced silently, tool blocks voiced via concise summaries, final text voiced as today. Adds `voice.speakingBlockId` alongside `voice.speakingMessageId`.

### B.5 — Streaming follow-up dispatch (~0.5 day, → SPEC 10 candidate)

While final text streams, agent proactively starts the next likely tool call (e.g. while narrating the swap result, pre-fetches the new wallet balance). Reduces perceived latency on the next turn. Risk: mis-prediction wastes tokens.

### B.6 — Animated balance header transitions (~0.5 day, → SPEC 10 candidate)

Pure polish. When a write settles, the BalCard animates from old → new value with a 600ms ease.

### B.7 — `PassportIntro` zkLogin handshake (~0.5 day, → SPEC 10 candidate)

Onboarding screens for first-time users. Probably belongs in a different spec (onboarding flow, not harness). Listed for completeness — recommend deferring to a dedicated onboarding spec.

---

## Tools to ship

### v0.1.1 (2 tools, ~3.5d total scope — v0.1.3 R5 dropped `dismiss_goal`)

| Tool | Permission | Theme | Notes |
|---|---|---|---|
| `add_recipient` | `auto` | A.2 | Postgres write (no on-chain leg); demonstrates `pending_input` form. **v0.1.2 (SPEC 10 D7 alignment):** ships in the unified Contact shape — TWO fields (`name: string` nickname + `identifier: string` polymorphic). Server-side `normalizeAddressInput` (S.52) resolves `identifier` (Audric handle / external SuiNS / bare 0x); reverse-lookup populates `audricUsername` when the resolved address has a `*.audric.sui` leaf. NO separate "address" + "SuiNS" fields (rejected — contradicts SPEC 10 D7). **v0.1.3 R2:** LLM-initiated only — fires when the LLM resolves an unknown contact mid-conversation; the existing user-initiated chip-flow contact-add UI stays untouched. **v0.1.3 R6:** polymorphic identifier field uses `kind: 'sui-recipient'` (renamed from `kind: 'address'`). |
| (extension to `update_todo`) | `auto` | B.1 | Add `persist?: boolean` flag — opts a turn-scoped todo into being a long-lived `Goal` row |

> **v0.1.3 R5 — `dismiss_goal` removed from engine tool surface.** v0.1.2 specced `dismiss_goal` as an `auto`-tier engine tool with the note "user-initiated; no LLM intermediation needed." If the LLM never invokes it, it doesn't belong in the tool surface — it's noise in the system prompt + tool definitions for a feature only the host fires. v0.1.3 makes dismissal a host API: the sidebar dismiss button POSTs directly to `POST /api/goals/dismiss` (defined in audric/apps/web). Engine sees goals via the `<financial_context>` `<open_goals>` sub-section read-only; mutations are host-only. Saves ~50 tokens of permanent tool-description bloat across every turn for goal-bearing users.

### v0.2 (8 tools, gated on Phase 5)

| Tool | Permission | Theme | Notes |
|---|---|---|---|
| `generate_beat` | `confirm` (review) | A.1 | Suno-or-equivalent provider; produces audio URL + metadata |
| `generate_image` | `confirm` (review) | A.1 | Flux / DALL-E provider; produces image URL + alt text |
| `generate_coloring_book` | `confirm` (review) | A.1 | Multi-page PDF generator; per-page review optional |
| `compile_gift_bundle` | `confirm` (review) | A.1 | Aggregates child listings into one bundle listing |
| `generate_ebook` | `confirm` (review) | A.1 | Markdown → PDF; long-running, emits tool_progress |
| `list_artifact` | `confirm` (bundleable) | A.1 | Mints + lists in one Payment Stream (uses SPEC 7) |
| `purchase_listing` | `confirm` | A.3.1 | Buyer-side; pays USDC for one listing |
| (additional generator tools as Phase 5 product surface emerges) | TBD | A.1 | Re-evaluate provider mix when Phase 5 starts |

### SPEC 10 candidates (B.2-7, no urgent driver)

| Tool | Permission | Theme | Notes |
|---|---|---|---|
| `handoff_to_subagent` | `auto` | B.2 | Spawns sub-agent for deep research |

---

## Surface area in numbers

| Surface | Today (post SPEC 7 v0.3.1 + SPEC 8 v0.5) | After SPEC 9 v0.1.1 | After v0.2 (when Phase 5 starts) |
|---|---|---|---|
| `TimelineBlock` variants | 8 (incl. `permission-card` from SPEC 8 v0.5 D1) | 8 (no new variants — `pending_input` is an event, rendered into a transient form; A.3.3 is a `proactive` flag on existing `text` variant) | 9 (+ content-review variant if needed; or reuse `permission-card` with content payload — decide in v0.2) |
| Engine event types | 12 (incl. `pending_input` reserved no-op from SPEC 8 v0.5 D2) | 12 (engine starts EMITTING the reserved `pending_input` event; type was already added in v0.5) | 12-13 (TBD — content-review may need a dedicated event or reuse `pending_action`) |
| Engine tools | 34 | **35** (+ `add_recipient` only; `update_todo` extended; `dismiss_goal` removed per v0.1.3 R5 — host-only API) | 42-43 (+ 7-8 v0.2 tools) |
| Audric API endpoints | `/api/engine/{chat,resume,regenerate}` | + `/api/engine/resume-with-input` (A.2) + `/api/goals/{list,dismiss}` (B.1 — `dismiss` is host-only per v0.1.3 R5) | + `/api/store/{listings,purchase}` (A.3) |
| New Prisma models | None | `Goal` (B.1) | + `Listing` + `Purchase` (A.3) |
| Audric apps | `apps/web` only | `apps/web` only (no new app surface in v0.1.1) | + maybe `apps/store` (or route group inside `apps/web` — decide in v0.2) |

---

## Risks

### v0.1.1 risks (current scope)

1. **`pending_input` conflicts with chip flow.** Audric already has chip-flow forms (e.g. send-to-contact has a chip-driven input). `pending_input` should NOT replace chips — it's for cases where chips don't fit (e.g. multi-field structured input like address + recipient name). v0.1.1 documents the boundary in the system prompt + tool descriptions: chips for single-field with discrete options; `pending_input` for multi-field forms with mixed types.
2. **Persistent goals leak privacy if surfaced wrongly.** `Goal` rows are user-private but the `<financial_context>` block including open goals is part of the system prompt — every LLM call sees them. Cap to top 5 goals by `updatedAt` to avoid context bloat. Don't include goal text in any telemetry/logs (only IDs + metadata). Documented in the env validation gate (PII handling).
3. **Proactive insight blocks become spam.** If the LLM emits a proactive block on every turn, users tune them out. v0.1.1 system prompt enforces ≤1 proactive emission per turn AND only on turns where a clear opportunity exists (idle balance > $50, HF approaching 1.5, APY drift > 1%). Telemetry tracks `proactive_text_acceptance_rate`; if it drops below 30%, tune the prompt to emit less.

### v0.2 risks (deferred — re-evaluate when Phase 5 starts)

4. **Audric Store is greenfield product work, not just harness work.** SPEC 8/9 deliver the harness primitives, but the actual marketplace (listings DB, purchase flow, creator payouts, royalty splits) is Phase 5 product scope per `audric-roadmap.md`. SPEC 9 v0.2 should NOT ship the marketplace — it should ship the *primitives* the marketplace will use, plus enough demo coverage to prove they work end-to-end. Marketplace business logic stays separate.
5. **Content-generation provider lock-in.** Suno (audio), Flux (image), etc. are external APIs with their own costs / rate limits / legal terms. Pick wisely when v0.2 starts. Recommend wrapping each generator behind an MCP service so the provider can swap without engine changes.
6. **`audric.ai/[username]` route shape is LOCKED in SPEC 10 v0.2.1 — v0.2 author MUST extend additively.** SPEC 10 ships the route in v0.2.1 Phase D.1 as a profile stub that resolves `[username]` → SuiNS lookup → 0x → public-portfolio infrastructure (the `audric.ai/report/[address]` machinery from Audric 2.0 Phase E). SPEC 9 v0.2's Audric Store launchpad surface (A.3.1 split-screen buyer panel + A.3.2 manifest tables) MUST extend the SAME route additively — single component shape, additive layout switch based on user state (no listings → profile stub; has listings → split-screen buyer panel). DO NOT define a new route. DO NOT redefine `[username]` slug semantics. **Action item before drafting v0.2:** read SPEC 10 D9 + Phase D.1 + the cross-spec contract row in SPEC 10's "Cross-spec dependencies" table — they're the binding contract.
7. **(NEW G6 — May 1 cross-spec review) v0.2's "Approve = mint + list" Payment Stream MUST follow SPEC 7 v0.4 Layer 0 fragment-appender contract.** v0.2 Theme A.1's content-review ReviewCard says "List = mints the artifact + creates the listing in one Payment Stream — eats SPEC 7 v0.3's bundling for free." Concretely, v0.2's `mint_artifact` and `create_listing` write tools (or whatever final names they ship as) MUST: (a) ship as fragment-appenders in `@t2000/sdk` (`addMintArtifactToTx`, `addCreateListingToTx`), (b) be registered in `WRITE_APPENDER_REGISTRY` per SPEC 7 v0.4 Layer 0 contract, (c) carry `bundleable: true` so Payment Stream composition works automatically, (d) NOT fork the on-chain build path — every on-chain leg goes through `composeTx` (single-write or bundled). Action item when drafting v0.2: read SPEC 7 v0.4 Layer 0 + `audric/.cursor/rules/audric-canonical-write.mdc` BEFORE designing the on-chain flow. Same architectural pattern that makes chat-agent writes drift-impossible-by-construction applies here.

### Pre-SPEC-9 risks (RESOLVED in May 1 patches)

- (D1) `permission-card` `TimelineBlock` variant — **resolved in SPEC 8 v0.5.**
- (D2) `pending_input` event reservation — **resolved in SPEC 8 v0.5.**
- (D3) `regenerateInput.preserveSeed` semantics — **resolved (dropped) in SPEC 7 v0.3.1.**

---

## Suggested sequencing

### v0.1.1 sequencing (~3.5d implementation + dependencies)

| Phase | Work | Effort | Validates |
|---|---|---|---|
| P9.0 | **DONE** — D1/D2/D3 resolved in SPEC 7 v0.3.1 + SPEC 8 v0.5 May 1 patches | 0d | Pre-rework decisions locked |
| P9.1 | Wait for SPEC 8 v0.5 + SPEC 7 v0.3.1 to ship (~14.5d + 12.75d = ~27d wall-time) | — | Foundation in place |
| P9.2 | **A.3.3 (ships first per v0.1.3 R1)** — Proactive insight `text` block variant + system prompt addendum + per-conversation-thread cooldown (R3 — engine-side dedup by `(type, subjectKey)` tuple parsed from the `<proactive>` marker payload) + telemetry. **Opportunistic SPEC 12 overlap (NOT blocking):** none for A.3.3. | ~0.5d | Idle-balance nudge appears as a distinct visual block on a test turn; same nudge does NOT re-emit on a subsequent turn in the same session (R3 cooldown gate verified) |
| P9.3 | **B.1 (ships second per v0.1.3 R1)** — Persistent cross-turn todos: `Goal` Prisma model + `update_todo` `persist?: boolean` flag + `<OpenGoalsSidebar />` + sidebar dismiss button POSTs to **`POST /api/goals/dismiss`** (R5 — host-only API; NO `dismiss_goal` engine tool) + system prompt addendum gated on **`harnessShape >= rich`** (R4) + `<open_goals>` block injection **only when goal count > 0** (R4). | ~1.5d | Goal set in session A appears in sidebar in session B; LLM references it via `<financial_context>` ONLY when goals exist (R4 verified — count=0 turns omit the block entirely); dismissal works via host API without engine round-trip (R5 verified) |
| P9.4 | **A.2 (ships last per v0.1.3 R1)** — `pending_input` event emission (engine starts emitting the v0.5-reserved event) + form renderer + `/api/engine/resume-with-input` endpoint + `add_recipient` tool as the first consumer, **gated to LLM-initiated only** (R2 — fires when LLM resolves an unknown contact mid-conversation; existing user-initiated chip-flow contact-add path stays untouched) + form schema uses **`kind: 'sui-recipient'`** for the polymorphic identifier field (R6). **Opportunistic SPEC 12 overlap (NOT blocking — fold in if cheap):** (a) contact-match strict-equality (P2.5b SPEC 12 #2) — `add_recipient`'s polymorphic resolver is the natural place to relax strict-equality on saved-contact lookups (~30 min); (b) hardcoded recipient-field allow-list (P2.5b SPEC 12 #1) — register new recipient-bearing tools via `ToolFlags.recipientFields?: string[]` (~15 min). | ~2d | LLM-initiated add-contact flow runs end-to-end via inline form (no free-text parsing); user-initiated chip-flow path remains untouched (R2 verified); polymorphic identifier accepts Audric handle + external SuiNS + bare 0x via `kind: 'sui-recipient'` (R6 verified) |
| P9.5 | Eval pass: 3 canonical use cases (idle-balance proactive nudge with same-session cooldown; cross-session goal persistence with R4 lean-shape gate; LLM-initiated add-contact via inline form) | ~0.25d | All three flows ship clean on Haiku and Sonnet; R3/R4/R5/R6 gates verified per phase |
| P9.6 | Release `@t2000/engine 1.3.0` + audric deploy behind feature flag `NEXT_PUBLIC_HARNESS_V9` | 0.25d | Production-ready behind flag |

**Total v0.1.1 scope: ~4.5d** (3.5d code + 0.5d eval + 0.25d release + 0.25d buffer).

### v0.2 sequencing (~6.5d, gated on Phase 5 start)

| Phase | Work | Effort | Validates |
|---|---|---|---|
| P9.7 | A.1 — Content-review `permission-card` content variant + 5 generator tools (`generate_beat`, `generate_image`, `generate_coloring_book`, `compile_gift_bundle`, `generate_ebook`) + `list_artifact` (uses SPEC 7 Payment Stream) | ~3d | Demo `03-make-a-beat.html` flow runs end-to-end against the new harness |
| P9.8 | A.3.1 — Split-screen buyer panel at `audric.ai/<username>` + `purchase_listing` tool | ~1.5d | Demo `06-party-shop.html` end-to-end |
| P9.9 | A.3.2 — Manifest tables for multi-item listings | ~1d | Demo `04-coloring-book.html` per-page review + supply tracker works |
| P9.10 | Provider integration spike (Suno / Flux / etc. — re-evaluate at Phase 5 start) | ~1d | First real audio/image artifact generated end-to-end |

**Total v0.2 scope: ~6.5d**, conditional on Phase 5 product start.

### SPEC 10 candidates (no urgent driver)

B.2 multi-agent handoff (~2d), B.3 inline data browsers (~1d), B.4 voice mode v2 (~1d), B.5 streaming follow-up dispatch (~0.5d), B.6 animated balance transitions (~0.5d), B.7 PassportIntro zkLogin handshake (~0.5d). Total ~5.5d if all shipped — but each needs its own usage-signal trigger before scoping.

---

## What this spec deliberately does NOT touch

### v0.1.1 deliberately does NOT touch

- **Content-review ReviewCard + content generators** (deferred to v0.2, gated on Phase 5).
- **Audric Store marketplace business logic** (listings DB, royalties, creator payout schedules) — Phase 5 product scope per roadmap.
- **`apps/store` new app surface** — not needed for v0.1.1; revisit in v0.2.
- **Multi-agent handoff (B.2)** — SPEC 10 candidate.
- **Voice mode v2 / inline data browsers / streaming follow-up / animated balance / PassportIntro** — SPEC 10 candidates.

### v0.2 (and SPEC 9 broadly) deliberately does NOT touch

- **Pepesto / `COMMERCE_V2.md`** — orthogonal commerce surface; not part of Audric Store.
- **Audric Explorer (SPEC 6)** — chain-explorer killer; ships independently.
- **NEW Audric products** — five-product taxonomy is locked.
- **PassportIntro zkLogin onboarding** — listed in B.7 but recommend deferring to dedicated onboarding spec.

---

## Cross-references

- **SPEC 7 v0.3.1** (Payment Stream + Quote-Refresh ReviewCard) — `spec/SPEC_7_MULTI_WRITE_PTB.md`
- **SPEC 8 v0.5** (Interactive Agent Harness) — `spec/SPEC_8_INTERACTIVE_HARNESS.md` (D1 `permission-card` variant + D2 `pending_input` reservation land here, blocking v0.1.1)
- **v2 demo source patterns** — `audric/audric_demos_v2/demos/03-07*.html` + `shared/primitives.jsx` (`OrderReviewCard`, `WhyOnlySui`, `BalCard`)
- **Audric roadmap (Phase 5 — Store)** — `audric-roadmap.md` (local-only) — gates v0.2 sequencing
- **Pepesto / commerce** (orthogonal) — `spec/COMMERCE_V2.md`
- **Audric Explorer** (orthogonal) — `spec/SPEC_6_CHAIN_EXPLORER.md`
- **`<financial_context>` block + cron** — `audric/apps/web/lib/engine/buildFinancialContextBlock.ts` (B.1 extends this with `<open_goals>` sub-section)
- **Upstash session store** — `audric/apps/web/lib/engine/upstash-session-store.ts` (SPEC 8 v0.5 `harnessVersion` field — v0.1.1 piggybacks on existing infrastructure)
