# BENEFITS_SPEC v0.7e (persistent chats) — Activate the Chatbot-Template Scaffolding

> **Status:** **v1.0 LOCKED 2026-05-22 ~06:30 AEST (S.244).** Founder ratified all 5 remaining architectural locks (LOCK-1 was POC-locked 2026-05-22 ~01:30 AEST):
>
> | Lock | Resolution | Source |
> |---|---|---|
> | LOCK-0 | **Option B — sequenced.** v0.7e structural Phase 1A first → persistent chats → v0.7e structural Phase 2. Avoids /api/chat double-touch. | Founder lock H1 sweep |
> | LOCK-1 | **Option B — prisma rewrite.** ~6.5-8.5h (POC found ~50% of drizzle queries are dead code). Single ORM in codebase. | POC 2026-05-22 ~01:30 AEST |
> | LOCK-2 | **Vote = KEEP** (free eval-loop signal). **Document + Suggestion = STRIP** (template artifact debris, uncontroversial). | Founder lock H1 sweep |
> | LOCK-3 | **FOLD Session 9a into this SPEC.** Move 3 surviving files out of `(chat)/`, delete the route group. ~30 min. | Founder lock H1 sweep |
> | LOCK-4 | **Engine StreamCheckpointStore** (v2.2.0 Slice C). Eliminates template's Stream table + 2 queries. | Founder lock H1 sweep |
> | LOCK-5 | **B — Cheap LLM summarizer** (~$0.0001/chat, ~$0.10 per 1000 chats). Async post-first-turn. | Founder lock H1 sweep |
>
> **Effort lock:** ~6.5-8.5h (~1 day) per LOCK-1 POC. Down from original 1.5-2.5d / 3-4d estimate.
>
> **Sequencing per LOCK-0:** Ships AFTER v0.7e structural Phase 1A (~3.5h cleanup of dead apps/web routes) and BEFORE v0.7e structural Phase 2 (~5-7d engine migration). No interleaved /api/chat touches.
>
> Promotion path: v0.1 SKELETON → **v1.0 LOCKED (now)** → ready for Phase 0 baseline capture + Phase 1 execution.
>
> Original drafted 2026-05-21 ~22:30 AEST during v0.7d Phase 7 observation window (Day 0). Audit-first cadence per `engineering-principles.mdc` §1 ("trace the full path before writing code"). The audit corrects the backlog row's 3-5d estimate to **~1.5-2.5d** (Option A path) or **~3-4d** (Option B path) because the Vercel AI chatbot template that bootstrapped web-v2 already shipped ~85% of the surface — we'd been treating it as 0%-built scaffolding. Promotion to v1.0 LOCKED happens after the founder picks Option A vs B (see §4 LOCK-1) and after v0.7d Phase 7 closes (no schema changes during observation).
>
> **Naming:** there are now TWO v0.7e candidates in flight:
>
> | SPEC | Scope | File |
> |---|---|---|
> | **v0.7e (structural)** | Tier C migration — `apps/web` engine + chat-coupled backend cutover, final apps/web archive | `BENEFITS_SPEC_v07e.md` |
> | **v0.7e (persistent chats)** — THIS DOC | Activate template chat persistence: save transcripts, sidebar history, click-to-resume, delete, share | `BENEFITS_SPEC_v07e_persistent_chats.md` |
>
> Whether these ship as one combined v0.7e, sequenced v0.7e + v0.7f, or parallel branches is **LOCK-0** below — founder decision. The two scopes are largely independent (chat persistence doesn't depend on Tier C migration; Tier C migration doesn't depend on chat persistence) but they share the chat-shell cutover surface in Phase 1B / Phase 2.

---

## 0 — Executive summary

The Vercel AI SDK chatbot template (commit `107a43a`) that bootstrapped `apps/web-v2` in v0.7c shipped a **fully-implemented persistent-chats surface** that has been sitting dormant in production for ~5 days:

| Surface | Status | LoC | File |
|---|---|---|---|
| **Drizzle schema** (User, Chat, Message_v2, Vote_v2, Document, Stream, Suggestion) | ✅ DEFINED | 137 | `apps/web-v2/lib/db/schema.ts` |
| **Initial SQL migration** (CREATE TABLE × 7) | ✅ EXISTS | 68 | `apps/web-v2/lib/db/migrations/0000_initial.sql` |
| **Queries layer** (25 functions: save/delete/get for chats + messages + votes + visibility + title + streams + documents + suggestions + count) | ✅ FULLY IMPLEMENTED | 660 | `apps/web-v2/lib/db/queries.ts` |
| **Sidebar history UI** (date grouping, pagination via SWR Infinite, delete confirmation dialog, branded to Audric design system) | ✅ FULLY BUILT | ~700 | `apps/web-v2/components/chat/{app-sidebar,sidebar-history,sidebar-history-item,sidebar-user-nav,sidebar-toggle}.tsx` |
| **`/api/history` route** (GET list + DELETE all-chats, JWT-gated via `getCurrentUser`) | ✅ FULLY BUILT | 50 | `apps/web-v2/app/(chat)/api/history/route.ts` |
| **`/api/vote` route** (upvote/downvote messages) | ✅ EXISTS | ~80 | `apps/web-v2/app/(chat)/api/vote/route.ts` |
| **Visibility hook** (private/public toggle, SWR cache sync) | ✅ EXISTS | 56 | `apps/web-v2/hooks/use-chat-visibility.ts` |
| **`(chat)/actions.ts` server action** for `updateChatVisibility({chatId, visibility})` | ✅ EXISTS | est. ~30 | `apps/web-v2/app/(chat)/actions.ts` |
| **Auth model** (`session.user.id` = canonical zkLogin-derived Sui address per `audric-auth.ts:289`) | ✅ COMPATIBLE | — | sidebar already uses `authFetch` to attach `x-zklogin-jwt` |
| **MIGRATION RUN AGAINST PROD NEON DB** | ❌ NEVER RUN | — | `/api/history` errors with `relation "Chat" does not exist`; S.226 silently swallows the error |
| **`/api/chat` wires `saveChat` / `saveMessages` / `createStreamId`** | ❌ ZERO WIRING | — | `apps/web-v2/app/api/chat/route.ts` has zero imports from `@/lib/db` |
| **Drizzle `User.id` type matches audric** | ❌ MISMATCH | — | drizzle schema says `uuid`, audric passes `0x[a-fA-F0-9]{64}` Sui address |

**What's actually missing (the v0.7e persistent-chats scope):**

1. Reconcile ORM choice (drizzle vs prisma) and reconcile `User.id` type — **LOCK-1**
2. Run the migration (or equivalent prisma migration) against prod Neon DB
3. Add ~10 lines to `/api/chat` to call `saveChat` (on first turn) + `saveMessages` (every turn) + `createStreamId` (every turn)
4. Move `/api/history`, `/api/vote`, `(chat)/actions.ts` OUT of the `(chat)` route group before Session 9a deletes it (or kill `(chat)` deletion blocker)
5. Branding pass: replace remaining chatbot-template strings with Audric copy (e.g. "Login to save and revisit previous chats!" in `sidebar-history.tsx:182`)
6. Visibility / share UI surface (publicly viewable chat link generator)

**Effort:** ~1.5-2.5 days (Option A: keep drizzle) OR ~3-4 days (Option B: rewrite onto prisma). See §4 LOCK-1.

---

## 1 — Background

### 1.1 Why this exists now

The v0.7c "Audric chat experience" cutover (Phases 1-2, late April → mid May 2026) replaced `apps/web`'s legacy chat-shell with a fresh `apps/web-v2` bootstrapped from the Vercel AI SDK chatbot template. The template ships with a **complete chat-persistence stack** — User/Chat/Message/Vote/Stream schema, sidebar history UI, delete + share UX — because that's the canonical example app for AI SDK 5.x.

During v0.7c Phase 2-3 the team systematically ripped out template debris that didn't fit Audric (next-auth → zkLogin, code-artifact runtime, Vercel Postgres → Neon DATABASE_URL, etc.). The chat-persistence layer was **deliberately preserved** because the team intended to activate it as a follow-on shipment — but the activation slice was deferred to "post-v0.7d Phase 8 G12" per the `v07e-backlog` HANDOFF row.

What the founder discovered tonight (2026-05-21) by asking "wait, isn't there a persistent chat sessions backlog item?" is that the activation slice is **dramatically smaller** than the 3-5d backlog estimate implied. The estimate was sized as if the work were from-scratch; the audit shows ~85% of the surface is already built and dormant in production. The remaining work is the **last-mile wiring slice**.

### 1.2 The S.226 silent fallback — context for the activation gate

On 2026-05-21 (S.226) we patched `getChatsByUserId()` in `apps/web-v2/lib/db/queries.ts:208-251` to swallow the `relation "Chat" does not exist` error and return `{ chats: [], hasMore: false }` instead of logging a 500. The comment block at `queries.ts:211-237` explicitly notes:

> Until the v0.7e "persistent chat sessions" spec ships (which will either run the migration + wire writes via drizzle OR rewrite this surface via prisma — decision deferred to v0.7e drafting per the `v07e-backlog` HANDOFF row), `/api/history` will keep hitting this path. The graceful return matches the SAME empty-state response a successful query against an empty `Chat` table would return — SidebarHistory already renders "no chats yet" correctly.

**Translation:** the silent fallback is doing two things today:
1. Hiding the missing tables from operational logs (correct — known/tracked)
2. Faking a successful empty-state response so the sidebar renders correctly (correct — Audric users currently see "Your conversations will appear here once you start chatting!" which is honest given chats aren't being persisted)

When this SPEC ships, the fallback becomes dead code and gets deleted.

### 1.3 No data to migrate — "fresh activation" semantics

Founder lock confirmed during scoping (2026-05-21 ~22:00 AEST): **there is no v1 chat session data to migrate.** Every Audric chat ever has been ephemeral — apps/web (v0.7c chat-shell) never persisted chats; apps/web-v2 (v0.7d MemWal era) never persisted chats. The first chat saved after this SPEC ships is the first chat that exists.

This eliminates the entire class of concerns around:
- Data preservation / backfill
- Backward-compat shim for old session shapes
- "What about user's existing chats" UX
- Anonymous → authenticated user merge

The migration is a **CREATE TABLE only** — no INSERT INTO, no UPDATE, no schema rewrites against existing data. Founder's "drop all v1 data and activate v2 fresh with no data" instinct = exactly what running the migration does.

---

## 2 — Audit inventory: what's built vs what's missing

### 2.1 ✅ Built — queries.ts surface (660 LoC, 25 functions)

| Function | Purpose | Wired by | Tested by |
|---|---|---|---|
| `getUser(email)` | User lookup by email | none (legacy from template's next-auth path) | — |
| `saveChat({id, userId, title, visibility})` | Create new chat row on first turn | ❌ NONE | — |
| `deleteChatById({id})` | Delete chat + cascade (votes, messages, streams) | `/api/chat?id=X` DELETE handler (does this exist? need to verify) | — |
| `deleteAllChatsByUserId({userId})` | Bulk delete (settings "delete all chats" button) | `/api/history` DELETE | — |
| `getChatsByUserId({id, limit, startingAfter, endingBefore})` | Sidebar pagination | `/api/history` GET via SWR Infinite | — |
| `getChatById({id})` | Hydrate `/chat/[id]` page | `/chat/[id]/page.tsx` (does this exist? need to verify) | — |
| `saveMessages({messages: DBMessage[]})` | Persist user + assistant turns | ❌ NONE | — |
| `updateMessage({id, parts})` | In-place edit (resume-and-rewrite UX) | resume path | — |
| `getMessagesByChatId({id})` | Hydrate prior turns on chat resume | `/chat/[id]/page.tsx` | — |
| `getMessageById({id})` | Single-message lookup | vote API | — |
| `deleteMessagesByChatIdAfterTimestamp({chatId, timestamp})` | Truncate history (used by "edit a prior turn → re-run from there" UX) | not wired in audric scope | — |
| `voteMessage({chatId, messageId, type: 'up'\|'down'})` | Thumbs up/down on assistant turns | `(chat)/api/vote/route.ts` | — |
| `getVotesByChatId({id})` | Hydrate vote state on chat load | `/chat/[id]/page.tsx` | — |
| `saveDocument({id, title, kind, content, userId})` | Code/image/sheet artifact persistence | template's artifact UX | — |
| `updateDocumentContent({id, content})` | Edit existing artifact | template's artifact UX | — |
| `getDocumentsById({id})`, `getDocumentById({id})` | Hydrate artifact panel | template's artifact UX | — |
| `deleteDocumentsByIdAfterTimestamp({id, timestamp})` | Cascade delete | template's artifact UX | — |
| `saveSuggestions({suggestions})`, `getSuggestionsByDocumentId({documentId})` | Inline AI suggestions on artifacts | template's artifact UX | — |
| `updateChatVisibilityById({chatId, visibility: 'private'\|'public'})` | Share toggle | `(chat)/actions.ts` server action | — |
| `updateChatTitleById({chatId, title})` | Rename chat in sidebar | not wired in audric scope yet | — |
| `getMessageCountByUserId({id, differenceInHours})` | Rate-limit / quota check | not wired in audric scope yet | — |
| `createStreamId({streamId, chatId})` | Resume-on-reload stream registry | ❌ NONE | — |
| `getStreamIdsByChatId({chatId})` | Resume-on-reload stream registry | ❌ NONE | — |

**Audric-scope evaluation:**
- ✅ Core chat persistence (save/get/delete chat + messages + visibility) — wired path needs ~10 lines in `/api/chat`
- ❌ Artifacts (Document, Suggestion) — Audric does NOT use the template's artifact panel; these tables/queries are dead code. Deletion candidates.
- ❌ `getUser(email)` — legacy from next-auth path; dead. Deletion candidate.
- ⚠️ Resume-on-reload via `createStreamId` / `getStreamIdsByChatId` — Audric's engine v2.2.0 has its own `StreamCheckpointStore` (Slice C) that solves this differently. The template's Stream registry is REDUNDANT with engine-native checkpointing. Decide: keep template path (drizzle + Neon) or use engine path (in-memory / Upstash). **LOCK-4** below.

### 2.2 ✅ Built — UI surface (~700 LoC components)

| Component | Purpose | Already audric-branded? |
|---|---|---|
| `components/chat/app-sidebar.tsx` | Sidebar wrapper, mounted in `app/chat/audric-chat-client.tsx` authenticated branch | ✅ YES per S.209 |
| `components/chat/sidebar-history.tsx` | Date-grouped (today/yesterday/last7/last30/older) + SWR Infinite + delete confirmation dialog | ✅ YES (mostly — one copy string at line 182 still says template-default) |
| `components/chat/sidebar-history-item.tsx` | Single chat row | ✅ YES |
| `components/chat/sidebar-user-nav.tsx` | User avatar + dropdown (logout, settings, theme) | ✅ YES per S.208 |
| `components/chat/sidebar-toggle.tsx` | Collapse/expand toggle | ✅ YES |

**Audric-scope evaluation:** UI is ~95% done. ~30 min of brand polish covers the remaining gaps.

### 2.3 ✅ Built — API surface (in `(chat)` route group, scheduled to die)

| Route | Purpose | LoC | Notes |
|---|---|---|---|
| `app/(chat)/api/history/route.ts` | GET (list chats) + DELETE (bulk delete user's chats) | 50 | Uses `getCurrentUser()` from `audric-auth.ts` ✅ |
| `app/(chat)/api/vote/route.ts` | POST (upvote/downvote a message) | est. 80 | Same auth pattern |
| `app/(chat)/api/document/route.ts` | Artifact CRUD | est. ? | Dead in audric (no artifact UX) — deletion candidate |
| `app/(chat)/api/messages/route.ts` | Messages CRUD | est. ? | Audit needed |
| `app/(chat)/api/suggestions/route.ts` | Suggestions CRUD | est. ? | Dead in audric |
| `app/(chat)/api/files/upload/route.ts` | File upload | est. ? | Audit needed (multimodal-input upload path?) |
| `app/(chat)/api/models/route.ts` | Model list | est. ? | Audit needed (model picker?) |
| `app/(chat)/actions.ts` | `updateChatVisibility` server action | est. 30 | Used by `use-chat-visibility.ts:6` |

**Audric-scope evaluation:**
- `/api/history` + `/api/vote` + `(chat)/actions.ts` → MUST move to non-route-group location before Session 9a deletes `(chat)`. New homes: `app/api/history/route.ts`, `app/api/vote/route.ts`, `lib/actions/chat-visibility.ts` (or co-locate with route).
- `/api/document`, `/api/suggestions` → DELETE (dead in audric)
- `/api/messages`, `/api/files/upload`, `/api/models` → audit needed; likely dead in audric

### 2.4 ❌ Missing — the activation slice (~10 lines of code + 1 migration run + 1 schema decision)

| Gap | Fix | Effort |
|---|---|---|
| `/api/chat/route.ts` doesn't call `saveChat()` on first turn | Add: detect new chat (no `id` in request body or no row for `id`), call `saveChat({id, userId: walletAddress, title: deriveTitle(firstUserMessage), visibility: 'private'})` | ~10 LoC |
| `/api/chat/route.ts` doesn't call `saveMessages()` after each turn | Add: `saveMessages({ messages: [{id, chatId, role, parts, attachments: [], createdAt}] })` at end of stream | ~5 LoC |
| `/api/chat/route.ts` doesn't call `createStreamId()` | Add (or skip — see LOCK-4 about Stream registry redundancy with engine StreamCheckpointStore) | ~3 LoC |
| Migration not run | Run `pnpm --filter audric-web-v2 db:migrate` (or equivalent prisma migration if LOCK-1 = Option B) | ~10 min |
| Drizzle `User.id` type mismatch | If LOCK-1 = Option A (keep drizzle): change `User.id` to `text` PK matching Sui address format. If Option B (move to prisma): use existing prisma `User { suiAddress @unique }` and FK from new `Chat { userSuiAddress }` | LOCK-1-dependent |
| `(chat)` route group dependency | Move 3 files out of `(chat)/` to `app/api/` and `lib/actions/` | ~30 min |
| One copy string in sidebar-history.tsx:182 | Edit `"Login to save and revisit previous chats!"` → audric copy | ~2 min |
| `/chat/[id]/page.tsx` for click-to-resume | Audit if exists; if not, ~50 LoC new file (hydrate `getMessagesByChatId` + render via existing `Chat` component) | ~1-2h |
| `/share/[id]/page.tsx` for public visibility | New ~80 LoC page reading public chats only (auth-optional, visibility='public' filter) | ~2-3h |
| Title generation on first turn | LLM-based or first-50-chars; engine could expose a `generate_chat_title` tool or audric-side does it inline via the engine's existing Anthropic call | ~30 min |

### 2.5 ⚠️ Open questions

1. Does `/chat/[id]/page.tsx` exist today? (Need to verify.)
2. Does `/api/chat` accept a `chatId` request body field today? (Need to verify — first turn vs subsequent turn semantics.)
3. Does the AI SDK `useChat()` hook already pass a stable `id` across turns?
4. Do we want vote-message UX (thumbs up/down)? It's built; it's free; or we hide it.

These don't block SPEC promotion to v1.0 — they're audit items for Phase 0 of the execution slice.

---

## 3 — Why this matters

| Stakeholder | Benefit |
|---|---|
| **Founder / users** | Chat persists across sessions. Click any past chat in the sidebar to resume the conversation with full context. Share an interesting Audric explanation with a friend via public link. |
| **Audric Intelligence (memory)** | MemWal already persists facts; persistent chats let users **see** which conversation a fact was extracted from. Closes the "where did Audric learn that" feedback loop. |
| **Cost attribution / analytics** | `Chat` rows enable per-chat token/cost rollups (currently TurnMetrics aggregates by walletAddress, which loses per-conversation grain). |
| **AdviceLog grounding** | Each AdviceLog entry can FK to a `chatId` — "show me where Audric recommended this" becomes a UI affordance. |
| **Eval / replay** | Saved conversations make agent-level replay tractable for regression testing without needing live wallet state. |
| **Audric Pay / Audric Finance verbs** | "Re-do that swap we set up yesterday" becomes natural — Audric can read its own prior assistant turn for context. |

**What we explicitly do NOT promise in v0.7e (persistent chats):**
- Edit a prior user turn and re-run from that point (built in template via `deleteMessagesByChatIdAfterTimestamp` but Audric UX hasn't designed it)
- Multi-user collaborative chats
- Server-side full-text search over chat history (could add Postgres GIN index in v0.7f)
- Export to PDF / Markdown
- Encryption at rest (Neon does standard at-rest encryption; no E2E)

---

## 4 — Architectural lock decisions

### LOCK-0 — Relationship to v0.7e (structural)

> **Question:** Does this SPEC ship as part of v0.7e, as v0.7f, or in parallel?

**Audit evidence:**
- v0.7e (structural) Phase 1A SAFE-TO-SHIP-TODAY slices: 5 slices, ~3.5h, deletes 7 routes/components from apps/web; does NOT touch web-v2 at all.
- v0.7e (structural) Phase 2 (~45-68h): full engine migration to web-v2 + chat-shell cutover. Touches `/api/chat` route deeply.
- This SPEC: touches `/api/chat` route to add 10 LoC of persistence wiring.

**Conflict surface:** v0.7e (structural) Phase 2 rewrites the engine integration in `/api/chat`. If persistent chats ships FIRST, Phase 2 must preserve the persistence wiring through the rewrite. If structural Phase 2 ships first, persistent chats lands cleanly on top.

**Recommended sequencing:**
- **Option A: Ship persistent chats FIRST (post-Phase-7-close, ~Friday/Saturday).** Independent of Tier C migration. Adds value users immediately notice. ~1.5-2.5d.
- **Option B: Ship v0.7e structural Phase 1A first (~3.5h cleanup of dead apps/web routes), then persistent chats, then v0.7e structural Phase 2 (engine migration).** Avoids interleaving touches to `/api/chat`.
- **Option C: Ship both in parallel branches.** Risky — both touch `/api/chat`.

**Founder lock required.** My recommendation: **Option B** (sequenced).

### LOCK-1 — ORM choice (drizzle vs prisma) — POC RECOMMENDS OPTION B

> **Question:** Keep drizzle for chat persistence, or rewrite queries.ts onto prisma?
>
> **POC RESULT 2026-05-22 ~01:30 AEST:** Per `V07E_PERSISTENT_CHATS_LOCK1_POC.md` (Block 3 of 12h prep plan), Option B (prisma rewrite) wins **9 of 11 dimensions**. Critical finding: the SPEC's original "3-4d Option B" estimate was wrong because it sized rewriting all 25 drizzle queries; the audit shows ~50% are dead code (artifact + stream + legacy from template) and Option B only needs to port ~11 active queries (~150 LoC of prisma functions vs 660 LoC of drizzle). **True Option B cost: ~6.5-8.5h (~1 day)** — close to Option A's ~3.5-4.5h. Net debt-removed cost-of-ownership strictly favors B. **Founder lock recommended: Option B.**

**Audit evidence:**

| Dimension | Option A: Keep drizzle | Option B: Move to prisma |
|---|---|---|
| Code change | ~30 min schema edit (User.id uuid → text Sui-address PK) | ~3-4h rewrite of `lib/db/queries.ts` (660 LoC) using prisma client + 5 new prisma models |
| Migration | Run existing `0000_initial.sql` | New prisma migration (`pnpm prisma migrate dev --name add_chat_persistence`) |
| Tooling | Keep `drizzle.config.ts`, `lib/db/migrate.ts`, `drizzle-orm` + `postgres-js` deps | Drop drizzle deps; one less ORM in the codebase |
| Mixed-ORM debt | YES — drizzle for chat, prisma for everything else | NO — prisma everywhere |
| Codebase signal | `queries.ts:53-54` comment explicitly says "D-9 Phase 2 swaps drizzle for prisma and revisits this query surface end-to-end" | Aligns with stated direction |
| User table reconciliation | Two parallel User tables (drizzle `User` for chat, prisma `User` for everything else) — even if drizzle User.id = suiAddress, the rows are separate. OR: drop drizzle User table, FK directly to prisma User.suiAddress with no drizzle User row | Single prisma User table, FK from new Chat model to existing User.id |
| Effort total | ~1.5-2.5 days | ~3-4 days |
| Risk | Lower (less code change, smaller blast radius for the ship) | Higher (rewrites the entire queries layer) but better long-term |

**My recommendation:** **Option B (prisma rewrite)**. Reasoning (per POC §5):
1. The codebase already states this direction (`queries.ts:53-54` comment is the codebase's own forward-pointer).
2. Mixed-ORM debt is a structural footgun — devs maintaining the codebase need to know "this table is drizzle, this one is prisma, the User table has 2 rows per real user".
3. **True cost delta is ~3-4h, not 1.5d.** Audit shows ~50% of drizzle's 25 queries are dead code (artifact/stream/legacy); B only ports 11 active queries.
4. Connection pool fragmentation (2 postgres clients per Vercel fn instance) is silent but real — Neon connection budget halves under A.
5. Future v0.7g "consolidate ORMs" ticket = ~4-6h to undo + the original B work. Option A is strictly worse total-cost-of-ownership.
6. Prisma migration tooling is already in production use; drizzle migration tooling has never been run against prod.

**Founder lock recommended: Option B.** If founder prefers Option A (3-4h faster ship), document the mixed-ORM debt explicitly in `audric-build-tracker.md` as a planned-debt-with-payback-date.

### LOCK-2 — Vote / artifact / suggestion features (keep or strip)

> **Question:** Does Audric want vote-message thumbs up/down? Should we delete artifact + suggestion template debris from queries.ts / route surface?

**Audit evidence:**
- `voteMessage` + `Vote_v2` table + `(chat)/api/vote/route.ts` are fully built (~150 LoC total). UI surface in `sidebar-history-item.tsx` does not surface votes today, but the Chat panel might. Verify.
- `Document` + `Suggestion` tables + `(chat)/api/{document,suggestions}/route.ts` are template artifact-panel debris. Audric does NOT have an artifact panel.

**My recommendation:**
- **Vote:** KEEP (free; useful for eval-loop signal collection; trivial UI surface).
- **Document + Suggestion:** STRIP. Delete the tables from schema, delete the routes, delete the queries. ~30 min cleanup.

**Founder lock required** for vote; cleanup is uncontroversial.

### LOCK-3 — `(chat)` route group disposition

> **Question:** Move 3 surviving routes/actions out before Session 9a, OR fold Session 9a into this SPEC?

**Audit evidence:**
- `(chat)/layout.tsx:32-33` comment says "This entire `(chat)` route group + this layout delete in Session 9a."
- 3 surviving files in `(chat)/`: `api/history/route.ts`, `api/vote/route.ts`, `actions.ts`
- Session 9a was deferred during v0.7c — never reached.

**My recommendation:** **Fold Session 9a into this SPEC's execution.** Move surviving files to `app/api/history`, `app/api/vote`, `lib/actions/chat-visibility.ts`. Delete `(chat)/` directory entirely. ~30 min.

**No founder lock needed** — implementation detail.

### LOCK-4 — Resume-on-reload: template Stream registry vs engine StreamCheckpointStore

> **Question:** Use the template's drizzle `Stream` table + `createStreamId`/`getStreamIdsByChatId` for resume-on-reload, OR use the engine's native `StreamCheckpointStore` (Slice C, v2.2.0)?

**Audit evidence:**
- Template's Stream registry: persists stream IDs in `Stream` table; client reconnects by polling for unfinished streams on a chat. Drizzle-backed.
- Engine's StreamCheckpointStore: persists EngineEvents fire-and-forget; client passes `resumeStreamId` to replay events. In-memory default; Upstash for prod.
- Both solve "what if the user reloads mid-stream" but with different mechanisms.

**My recommendation:** **Use engine's StreamCheckpointStore.** Reasoning:
1. It's the engine's canonical mechanism; using template's parallel mechanism creates dual-track resume.
2. Template Stream registry only tracks stream IDs — doesn't replay events. Engine path actually replays events.
3. Eliminates 2 unused queries (`createStreamId`, `getStreamIdsByChatId`) + 1 unused table (`Stream`) from the schema.

**Founder lock optional** (implementation detail).

### LOCK-5 — Title generation

> **Question:** How is chat title generated for the sidebar?

**Audit evidence:** Template generates titles via a separate LLM call (often a cheap Haiku-class summarizer) on first turn.

**Options:**
- **A.** Use first 50 chars of user's first message (zero-cost, sometimes awkward).
- **B.** Call a cheap LLM summarizer (~$0.0001/chat, descriptive titles).
- **C.** Use the engine's existing call response — derive title from the first assistant turn's first sentence (zero additional cost, but title appears AFTER first turn completes; sidebar shows "New chat" mid-stream).

**My recommendation:** **B.** Cost is negligible (~$0.10/1000 chats); UX is decisively better.

**Founder lock optional.**

---

## 5 — Phase plan

> Effort estimates per `V07E_PERSISTENT_CHATS_LOCK1_POC.md` (Block 3 audit). Both ORM paths land around 1-1.5 days; Option B preferred per POC §5.

### Phase 0 — Audit completion + LOCK confirmation (founder review)

- Confirm LOCK-0 (relationship to v0.7e structural), LOCK-1 (ORM), LOCK-2 (vote/artifact disposition), LOCK-5 (title generation)
- Verify Phase 0 open questions in §2.5 (does `/chat/[id]/page.tsx` exist? does `useChat()` pass stable id? etc.)
- **Effort:** ~30 min agent + ~10-15 min founder review
- **Gate:** founder signs off on locks; SPEC promoted to v1.0

### Phase 1 — Schema + write path (~4-6h)

**Slice 1.1 — Prisma schema** (LOCK-1=B path)

Add to `apps/web/prisma/schema.prisma`:

```prisma
model Chat {
  id            String    @id @default(uuid())
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  title         String
  visibility    String    @default("private") // "private" | "public"
  userSuiAddress String
  user          User      @relation(fields: [userSuiAddress], references: [suiAddress])
  messages      Message[]
  votes         Vote[]

  @@index([userSuiAddress, createdAt])
  @@index([visibility])
}

model Message {
  id          String   @id @default(uuid())
  chatId      String
  chat        Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  role        String   // "user" | "assistant"
  parts       Json
  attachments Json     @default("[]")
  createdAt   DateTime @default(now())
  votes       Vote[]

  @@index([chatId, createdAt])
}

model Vote {
  chatId    String
  messageId String
  isUpvoted Boolean
  chat      Chat    @relation(fields: [chatId], references: [id], onDelete: Cascade)
  message   Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@id([chatId, messageId])
}
```

Add `chats Chat[]` back-relation to existing `User` model.

**Slice 1.2 — Rewrite queries layer**

Create `apps/web-v2/lib/audric/chat-persistence.ts` (or extend existing prisma helpers). Functions:
- `saveChat({chatId, userSuiAddress, title, visibility})`
- `saveMessages({chatId, messages: [{id, role, parts, attachments, createdAt}]})`
- `getChatsBySuiAddress({userSuiAddress, limit, startingAfter, endingBefore})`
- `getChatById({chatId})`
- `getMessagesByChatId({chatId})`
- `deleteChatById({chatId, userSuiAddress})` (with auth guard)
- `deleteAllChatsBySuiAddress({userSuiAddress})`
- `updateChatVisibility({chatId, visibility, userSuiAddress})`
- `updateChatTitle({chatId, title, userSuiAddress})`
- `voteMessage({chatId, messageId, type, userSuiAddress})` (with chat ownership check)

**Slice 1.3 — Wire `/api/chat/route.ts`**

Locate the request body parse → add `chatId` field handling (template's `useChat()` already passes `id`). At stream start, call `saveChat()` if new. At stream end, call `saveMessages()` with both user and assistant turns. ~15 LoC.

**Slice 1.4 — Title generation**

Add `lib/audric/chat-title.ts` — accept first user message, return ~5-word title via Anthropic Haiku call. Called once on first turn (after `saveChat` with placeholder title, then `updateChatTitle` async after title generates).

**Acceptance gate (G1):** Local dev — start a chat, refresh page, chat appears in sidebar, click resumes it with full message history.

### Phase 2 — Route migrations + delete `(chat)` route group (~2-3h)

**Slice 2.1 — Move surviving routes**

- `app/(chat)/api/history/route.ts` → `app/api/history/route.ts` (update imports to new prisma helpers)
- `app/(chat)/api/vote/route.ts` → `app/api/vote/route.ts` (update imports)
- `app/(chat)/actions.ts` → `lib/actions/chat-visibility.ts` OR co-locate as `app/api/chat-visibility/route.ts` POST
- Update `use-chat-visibility.ts:6` import path

**Slice 2.2 — Delete `(chat)` route group**

- `rm -rf app/(chat)/`
- `rm -rf lib/db/` (entire drizzle layer — schema, queries, migrations, drizzle.config.ts, migrate.ts)
- `pnpm remove drizzle-orm drizzle-kit postgres` (or whatever drizzle deps are present)
- Delete all `Document` / `Suggestion` / `Stream` references (LOCK-2 dispositions)

**Acceptance gate (G2):** `pnpm --filter audric-web-v2 typecheck` passes; sidebar history still works.

### Phase 3 — Click-to-resume (~2-3h)

**Slice 3.1 — `/chat/[id]/page.tsx`**

If doesn't exist (verify in Phase 0), create:
```typescript
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = await getChatById({ chatId: id });
  if (!chat) notFound();
  const session = await getCurrentUser();
  if (!session?.user || (chat.visibility === 'private' && chat.userSuiAddress !== session.user.id)) notFound();
  const messages = await getMessagesByChatId({ chatId: id });
  return <AudricChatClient chatId={id} initialMessages={messages} visibility={chat.visibility} />;
}
```

Verify `useChat({ id, initialMessages })` hook signature in audric-chat-client.tsx.

**Acceptance gate (G3):** Two chats started in same session — sidebar shows both — click each resumes correct history.

### Phase 4 — Visibility / share UI (~3-4h)

**Slice 4.1 — Visibility toggle in chat header**

Reuse `use-chat-visibility.ts`. Surface in `audric-chat-client.tsx` header: lock icon (private) vs globe icon (public) with click-to-toggle.

**Slice 4.2 — `/share/[id]/page.tsx`** public viewer

Same as Phase 3 but no auth required; visibility='public' filter; copy link button; no input bar (read-only view).

**Slice 4.3 — Share button**

In chat header when visibility=public, "Copy link" button → clipboard with `https://audric.ai/share/[id]`.

**Acceptance gate (G4):** Set chat to public; copy link; open in incognito; chat renders without auth.

### Phase 5 — Brand polish + acceptance (~1-2h)

- Fix copy strings (template defaults)
- Verify mobile sidebar UX
- Smoke-test delete-confirm dialog
- Smoke-test bulk-delete (Settings → "delete all chats")
- Run all canvas / card flows from a resumed chat (regression check: do canvases still render correctly when reloaded from persisted messages?)

**Acceptance gate (G5):** End-to-end demo recording — sign in, ask Audric to check balances, refresh, click sidebar item, swap, refresh, share chat, open share link in incognito. All flows green.

### Total effort (REVISED per POC)

| Phase | Effort (Option B) | Effort (Option A) | Cumulative (B) |
|---|---|---|---|
| Phase 0 — locks + audit close | ~30 min | ~30 min | 30 min |
| Phase 1 — schema + write path (prisma rewrite + dead-code strip + wire `/api/chat`) | ~3-4h | ~2-3h | ~3.5-4.5h |
| Phase 2 — route migrations + drizzle removal (B only) | ~2.5-3h | ~1-1.5h | ~6-7.5h |
| Phase 3 — click-to-resume (`/chat/[id]/page.tsx`) | ~2-3h | ~2-3h | ~8-10.5h |
| Phase 4 — visibility / share UI | ~3-4h | ~3-4h | ~11-14.5h |
| Phase 5 — polish + acceptance | ~1-2h | ~1-2h | **~12-16.5h (~1.5-2 days, Option B)** |

Under Option A (drizzle): **~10-13h (~1.5 days)**. Cost delta between B and A: **~2-3.5h** (much smaller than the SPEC's original 1.5d estimate). See POC §3.6.

---

## 6 — Risk surface

| Risk ID | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| R-1 | **Mixed-ORM drift if LOCK-1=A**: drizzle User vs prisma User unfindable for future devs | High (if A picked) | Medium | Pick B; or pick A and document with planned-debt-removal-date |
| R-2 | **`/api/chat` regression**: persistence wiring breaks stream rendering | Medium | High | Slice 1.3 lands behind a feature flag; smoke-test before flag-flip |
| R-3 | **Title-generation cost surprise**: Haiku calls per chat at scale | Low | Low | Cap to 5-word output; estimate: ~$0.0001/chat = $1/10k chats |
| R-4 | **Resume-on-reload divergence**: template Stream registry path collides with engine StreamCheckpointStore | Low (if LOCK-4 = engine path) | Medium | Lock LOCK-4 = engine path; delete template Stream table/queries |
| R-5 | **Schema cascade-delete edge**: deleting a chat with hundreds of messages slow | Low | Low | Prisma cascade is fine for typical chat sizes; index `[chatId, createdAt]` |
| R-6 | **Public share link enumeration**: UUID chat IDs are guessable | Low (UUIDs are 128-bit) | Low | UUIDs are sufficient; if higher security wanted, add `shareToken` field |
| R-7 | **Phase 7 observation collision**: if shipped before Phase 7 closes, schema change crosses observation boundary | High (if shipped now) | Medium | DO NOT ship before Phase 7 closes (~Friday/Saturday) |
| R-8 | **Engine integration drift**: v0.7e structural Phase 2 rewrites engine integration; persistence wiring must survive the rewrite | Medium (if shipped before v0.7e structural Phase 2) | Medium | Sequence per LOCK-0; structural Phase 2 must preserve `saveChat`/`saveMessages` calls |
| R-9 | **MemWal `<memory_recall>` size growth**: persistent chats expose past message volume; MemWal recall might balloon system prompt | Low (recall is top-K bounded; not iterating messages) | Low | Existing K-limit suffices; no action needed |
| R-10 | **TurnMetrics duplication**: TurnMetrics already records turn-level metrics by walletAddress; adding `chatId` FK to TurnMetrics is a nice-to-have, not required for v0.7e ship | Low | Low | Defer to v0.7f as analytics-grain follow-on |

---

## 7 — Cost accounting

| Cost type | Estimate |
|---|---|
| Engineering | ~2-3 days (LOCK-1=B) or ~1.5-2.5 days (LOCK-1=A) |
| Infra | $0 — Neon DB already provisioned (current Neon plan supports the schema); Vercel deploy is free |
| LLM (title generation) | ~$0.0001/chat → at 10k chats/month = ~$1/month |
| Storage | ~10kb/chat (incl. tool-results blobs) → at 10k chats/month = ~100MB/month (Neon Hobby plan: 3GB; Pro plan: 50GB) |

---

## 8 — Open questions for founder lock

Tracked in §4. Summary:

| Lock | Question | Default agent rec | Evidence basis |
|---|---|---|---|
| LOCK-0 | Relationship to v0.7e structural? | Sequence: ship v0.7e structural Phase 1A → ship persistent chats → ship v0.7e structural Phase 2 | SPEC §4 LOCK-0 |
| LOCK-1 | ORM choice? | **Prisma rewrite (B)** — wins 9 of 11 audit dimensions; ~3-4h cost delta only (not 1.5d) | `V07E_PERSISTENT_CHATS_LOCK1_POC.md` §5 |
| LOCK-2 | Vote message thumbs up/down? | **KEEP** (free; eval-loop signal collection useful) | SPEC §4 LOCK-2 |
| LOCK-3 | `(chat)` route group disposition | **Fold Session 9a into this SPEC** (move 3 files, delete dir) | SPEC §4 LOCK-3 |
| LOCK-4 | Resume-on-reload mechanism | **Use engine StreamCheckpointStore** (engine-canonical; delete template Stream table) | SPEC §4 LOCK-4 |
| LOCK-5 | Title generation | **Haiku-class LLM summarizer** (~$1/10k chats, descriptive) | SPEC §4 LOCK-5 |

---

## 9 — Acceptance gates

| Gate | Closes when |
|---|---|
| G0 (SPEC promote) | Founder confirms LOCK-0 through LOCK-5; Phase 0 open questions in §2.5 verified; SPEC promoted to v1.0 |
| G1 (Phase 1 ship) | Local dev round-trip: start chat, refresh, chat in sidebar, click to resume with full history |
| G2 (Phase 2 ship) | Typecheck passes; `(chat)/` directory gone; sidebar history still works |
| G3 (Phase 3 ship) | Two chats started in same session, both in sidebar, each resumes correct history |
| G4 (Phase 4 ship) | Public chat link opens in incognito without auth |
| G5 (Phase 5 acceptance) | End-to-end demo: sign-in → balance → refresh → resume → swap → refresh → share → incognito-open |

---

## 10 — Measurement plan

| Metric | Source | Baseline | Target |
|---|---|---|---|
| `Chat` row count growth | Prisma direct query | 0 | grows linearly with active users |
| Sidebar load p50 (cold cache) | Vercel logs `[db.getChatsByUserId]` (if re-instrumented) | n/a (currently 500ing-then-swallowed) | < 200ms |
| Title-generation p50 latency | New OTel span around Haiku call | n/a | < 600ms (so it lands before user reads the first assistant turn) |
| Share-link open conversion (anon viewer → sign-up) | Plausible/Vercel Analytics | n/a | establishes baseline |
| Delete-chat usage | OTel span / log line | n/a | establishes baseline |

---

## 11 — Traceability

| Doc | Why |
|---|---|
| `audric-build-tracker.md` row S.226 (silent-fallback patch) | Closes when this SPEC ships and the fallback becomes dead code |
| `audric-build-tracker.md` row S.232 (12h-plan results, this SPEC's drafting session) | Documents the audit-first cadence |
| HANDOFF row `v07e-backlog` (line 177) | Closes when this SPEC promotes to v1.0 LOCKED |
| `BENEFITS_SPEC_v07d.md` Phase 8 | Independent — Phase 8 G12 is the fn-injection decision gate, NOT a precondition for this SPEC |
| `BENEFITS_SPEC_v07e.md` (structural archive) | LOCK-0 question — sequencing relationship |
| `apps/web-v2/lib/db/queries.ts:53-54` + `:211-237` | The codebase's own forward-pointers to this SPEC |
| `apps/web-v2/app/(chat)/layout.tsx:32-33` | "This entire `(chat)` route group + this layout delete in Session 9a" — Session 9a folds into LOCK-3 |
| `apps/web-v2/lib/audric-auth.ts:65-70` | Auth model: `session.user.id` = canonical Sui address |
| `apps/web/prisma/schema.prisma:10-46` | Existing `User { suiAddress @unique }` — natural FK pivot for LOCK-1=B |

---

## Appendix A — Why "3-5 days" was wrong

The HANDOFF `v07e-backlog` row stated "OPEN (~3-5d) — persistent chat sessions (save transcripts + sidebar history + click-to-resume + delete + visibility)". The estimate was sized as if from-scratch implementation. The audit corrects:

| Subscope | Backlog estimate | Audited actual | Delta |
|---|---|---|---|
| DB schema + migrations | ~4-6h | ~30 min (already exists) OR ~30 min new prisma model (LOCK-1=B) | -3-5h |
| Queries layer | ~6-8h | ~0 (already exists) OR ~3-4h (prisma rewrite, LOCK-1=B) | -2-8h |
| Sidebar UI | ~8-12h | ~30 min brand polish (already built) | -8-12h |
| `/api/history` + `/api/vote` | ~3-4h | ~30 min (move out of `(chat)/`) | -2-3h |
| `/chat/[id]` resume | ~3-4h | ~2-3h (need to verify exists) | -1h |
| Visibility / share | ~6-8h | ~3-4h (hook + action + viewer; queries done) | -3-4h |
| Auth glue | ~3-4h | ~0 (already done; `audric-auth.ts:289` returns Sui address) | -3-4h |
| Brand polish | — | ~1-2h | +1-2h |
| **Total** | **~33-46h (~4-6d)** | **~13-19h (~2-3d, Option B) OR ~9-12h (~1.5d, Option A)** | **~50-60% reduction** |

Lesson re-affirmed (from `engineering-principles.mdc` §1): **trace the full path before writing code**. The audit cost ~90 minutes and rebudgets ~3 days of work.
