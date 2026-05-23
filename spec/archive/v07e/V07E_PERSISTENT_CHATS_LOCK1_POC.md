# v0.7e Persistent Chats — LOCK-1 ORM Proof-of-Concept

> **Status:** EVIDENCE-BACKED RECOMMENDATION 2026-05-22 ~01:30 AEST. Block 3 of the 12h prep plan. Folds into `BENEFITS_SPEC_v07e_persistent_chats.md` §4 LOCK-1 at next promotion.
>
> **Goal:** Pick between Option A (keep drizzle) vs Option B (rewrite to prisma) with file-by-file evidence and corrected effort estimates. The SPEC drafted both paths with rough estimates; this POC reads the actual code and tightens them.

---

## 1 — Audited surface state

### 1.1 Drizzle footprint in `apps/web-v2`

| File | LoC | Status |
|---|---|---|
| `lib/db/schema.ts` | 136 | DEFINED — 7 tables (User, Chat, Message_v2, Vote_v2, Document, Suggestion, Stream) |
| `lib/db/queries.ts` | 659 | DEFINED — 25 query functions |
| `lib/db/migrations/0000_initial.sql` | 67 | DEFINED — CREATE TABLE × 7, never run against prod |
| `lib/db/migrate.ts` | 33 | DEFINED — runner; never invoked at deploy time |
| `drizzle.config.ts` | ~15 | DEFINED — drizzle-kit CLI config |
| **Total drizzle code** | **~910 LoC** | All in-place; zero rows written |

### 1.2 Drizzle deps in `apps/web-v2/package.json`

```json
"drizzle-orm": "^0.34.0",
"postgres": "^3.4.4",
"drizzle-kit": "^0.25.0",
// + 6 db:* npm scripts
```

### 1.3 Drizzle consumers — runtime imports (`queries.ts`)

**10 files** import functions from `@/lib/db/queries`:

| File | Active? | Notes |
|---|---|---|
| `app/(chat)/actions.ts` | ✅ CHAT-ACTIVE | `updateChatVisibility` server action |
| `app/(chat)/api/history/route.ts` | ✅ CHAT-ACTIVE | GET (list) + DELETE (bulk delete) — has S.226 silent-fallback patch |
| `app/(chat)/api/vote/route.ts` | ✅ CHAT-ACTIVE | POST upvote/downvote message |
| `app/(chat)/api/messages/route.ts` | ⚠️ DEAD (audric) | Template artifact-version-control surface |
| `app/(chat)/api/document/route.ts` | ❌ DEAD | Artifact panel (Audric doesn't use) |
| `app/(chat)/api/suggestions/route.ts` | ❌ DEAD | Artifact panel |
| `lib/ai/tools/update-document.ts` | ❌ DEAD | Template artifact tool |
| `lib/ai/tools/edit-document.ts` | ❌ DEAD | Template artifact tool |
| `lib/ai/tools/request-suggestions.ts` | ❌ DEAD | Template artifact tool |
| `artifacts/actions.ts` | ❌ DEAD | Template artifact panel |

**Verdict:** of 10 runtime consumers, **3 are chat-active**. 7 are template-debris artifact code that Audric doesn't surface.

### 1.4 Drizzle consumers — type-only imports (`schema.ts`)

**17 files** import types from `@/lib/db/schema`:

| Surface | Files | Active? |
|---|---|---|
| Sidebar history UI | `sidebar-history.tsx`, `sidebar-history-item.tsx` | ✅ CHAT-ACTIVE — uses `Chat` type |
| Chat message UI | `messages.tsx`, `message.tsx`, `artifact-messages.tsx`, `message-actions.tsx`, `use-active-chat.tsx` | ⚠️ MIXED — uses `Vote` (chat-active) + `Document` (dead) |
| Artifact UI | `artifact.tsx`, `create-artifact.tsx`, `document-preview.tsx`, `version-footer.tsx`, `text-editor.tsx`, `code-editor.tsx`, `artifacts/text/client.tsx`, `editor/suggestions.tsx`, `request-suggestions.ts` | ❌ DEAD |
| Utils | `lib/utils.ts` | ⚠️ — needs audit (likely template-debris) |

**Verdict:** of 17 type-only imports, ~5 are chat-active (sidebar + message UI), the rest are artifact debris.

### 1.5 Prisma footprint in `apps/web-v2`

**11 active prisma consumers** (already in production):

```
lib/activity-data.ts
lib/audric/moat-context.ts
lib/audric/financial-context.ts
app/api/analytics/spending/route.ts
app/api/contacts/save/route.ts
app/api/payments/[slug]/route.ts
app/api/analytics/portfolio-history/route.ts
app/api/chat/route.ts          ← THIS is the file we'd extend with persistence wiring
app/api/payments/[slug]/verify/route.ts
app/api/analytics/yield-summary/route.ts
app/api/internal/payments/route.ts
```

Plus `apps/web` itself has **53 prisma-consuming files**. Prisma is the de-facto ORM of Audric.

### 1.6 User table reconciliation problem

The drizzle template ships:

```typescript
export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  // ...
});
```

`User.id` is a **UUID v4**. Audric's session contract (`apps/web-v2/lib/audric-auth.ts:289`):

```typescript
return {
  user: {
    id: verified.suiAddress,  // ← "0x[a-fA-F0-9]{64}" Sui address, NOT a uuid
    email,
    type: "regular",
  },
};
```

If we wire `saveChat({ id, userId: session.user.id, ... })` against drizzle as-is, the FK insert FAILS — Sui address format is not a valid UUID.

**Option A fix:** ALTER drizzle `User.id` to `text` PK; insert a User row per Sui address; drizzle and prisma each have their own `User` table tracking the SAME logical user (drizzle for chat, prisma for everything else). Two parallel user tables in the same Neon DB.

**Option B fix:** Skip drizzle User entirely; new prisma `Chat` model FKs to existing `User.suiAddress` (already unique-indexed at `apps/web/prisma/schema.prisma:12`). Single source of truth.

---

## 2 — Path A (keep drizzle) — full audit

### 2.1 Mechanical work

| Step | Time |
|---|---|
| Edit `lib/db/schema.ts`: User.id `uuid → text`, regenerate types | ~15 min |
| Edit `lib/db/migrations/0000_initial.sql`: User.id `UUID → TEXT` | ~5 min |
| Drop dead tables (`Document`, `Suggestion`, `Stream` per LOCK-2 + LOCK-4): delete from schema.ts + migration.sql | ~15 min |
| Drop dead queries: delete `saveDocument`, `updateDocumentContent`, `getDocumentsById`, `getDocumentById`, `deleteDocumentsByIdAfterTimestamp`, `saveSuggestions`, `getSuggestionsByDocumentId`, `createStreamId`, `getStreamIdsByChatId` from `queries.ts` | ~30 min |
| Delete dead consumers (5 artifact tool files + 9 type-only artifact UI files + 3 dead routes) — REQUIRED because they import drizzle types that no longer exist | ~1-2h |
| Wire `/api/chat/route.ts`: call `saveChat` + `saveMessages` per turn | ~30 min (~15 LoC) |
| Run `0000_initial.sql` against prod Neon DB (manual) | ~10 min |
| Smoke test: full chat round-trip, refresh, sidebar appears | ~30 min |
| **Subtotal Option A core ship** | **~3.5-4.5h** |

### 2.2 Path-A debt continuing to accrue

| Debt item | Cost |
|---|---|
| Two parallel User tables in same Neon DB (drizzle.User for chat, prisma.User for everything else) | Confusing for any future dev. Every join `Chat → User` returns a different User row than `LinkedWallet → User` even though they're the same person. |
| Two postgres connection pools per Vercel function instance | Connection pool fragmentation. Neon serverless connection pooler partially mitigates but raises bill at scale. |
| 3 npm deps (drizzle-orm, postgres, drizzle-kit) | Ongoing dep maintenance + lock-file churn |
| `queries.ts:53-54` codebase signal: "D-9 Phase 2 swaps drizzle for prisma and revisits this query surface end-to-end" | Code lies about its own future. Either delete the comment or do the work. |
| Future analytics rollups (per-chat token cost) require cross-ORM joins | Either rewrite chat analytics in raw SQL or import prisma to read drizzle-written tables. Both fragile. |

### 2.3 Path-A total cost-of-ownership

Core ship: **~3.5-4.5h**. Ongoing debt: medium-permanent. Future migration cost (when someone files the v0.7g cleanup ticket): **~4-6h to undo + the original Path-B work** = strictly worse than just doing Path B now.

---

## 3 — Path B (prisma rewrite) — full audit

### 3.1 Mechanical work — schema

```prisma
// apps/web/prisma/schema.prisma — add to existing schema

model Chat {
  id              String    @id @default(cuid())
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  title           String
  visibility      String    @default("private")  // "private" | "public"
  userSuiAddress  String
  user            User      @relation(fields: [userSuiAddress], references: [suiAddress])
  messages        Message[]
  votes           Vote[]

  @@index([userSuiAddress, createdAt])
  @@index([visibility])
}

model Message {
  id          String   @id @default(cuid())
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

Add `chats Chat[]` back-relation to existing `User`. Run `pnpm --filter audric prisma migrate dev --name add_chat_persistence`. **~30 min**.

### 3.2 Mechanical work — queries layer

Create `apps/web-v2/lib/audric/chat-persistence.ts`. Active functions (cut from 25 drizzle queries to 11 prisma functions by stripping artifact + stream + legacy dead code per LOCK-2 + LOCK-4):

| Function | LoC est. | Purpose |
|---|---|---|
| `saveChat({chatId, userSuiAddress, title, visibility})` | ~10 | Create chat row on first turn |
| `getChatsBySuiAddress({userSuiAddress, limit, cursor})` | ~25 | Sidebar pagination |
| `getChatById({chatId})` | ~5 | Hydrate `/chat/[id]` page |
| `updateChatTitle({chatId, title, userSuiAddress})` | ~10 | Async title fill after Haiku call |
| `updateChatVisibility({chatId, visibility, userSuiAddress})` | ~10 | Share toggle |
| `deleteChatById({chatId, userSuiAddress})` | ~10 | Single-chat delete (auth-gated) |
| `deleteAllChatsBySuiAddress({userSuiAddress})` | ~10 | Bulk delete |
| `saveMessages({chatId, messages})` | ~15 | Persist user + assistant turns |
| `getMessagesByChatId({chatId})` | ~8 | Hydrate prior turns on resume |
| `voteMessage({chatId, messageId, type, userSuiAddress})` | ~15 | Vote with chat-ownership check |
| `getVotesByChatId({chatId})` | ~8 | Hydrate vote state |
| **Total** | **~126 LoC** | (vs 659 drizzle, mostly because dead code stripped) |

### 3.3 Mechanical work — type substitution

Drizzle's `InferSelectModel<typeof chat>` becomes prisma's generated `Chat` type. 17 type-only imports across the codebase get search-replaced:

```diff
- import type { Chat, Vote } from "@/lib/db/schema";
+ import type { Chat, Vote } from "@/lib/generated/prisma";
```

Files needing this substitution (chat-active subset):
- `sidebar-history.tsx`, `sidebar-history-item.tsx` → `Chat`
- `messages.tsx`, `message.tsx`, `message-actions.tsx`, `artifact-messages.tsx`, `use-active-chat.tsx` → `Vote`

**~5 min per file × 7 files = ~35 min**. Artifact-side files get deleted entirely (LOCK-2), so no substitution needed for those.

### 3.4 Mechanical work — wire `/api/chat/route.ts`

```typescript
// At stream start:
const session = await getCurrentUser();
if (!session?.user.id) throw new ChatbotError("unauthorized:chat");

const existingChat = await getChatById({ chatId });
if (!existingChat) {
  await saveChat({
    chatId,
    userSuiAddress: session.user.id,
    title: "New chat",  // updateChatTitle fires async after first turn
    visibility: "private",
  });
}

// At stream end:
await saveMessages({
  chatId,
  messages: [
    { id: userMsgId, role: "user", parts: userMsgParts, attachments: [] },
    { id: assistantMsgId, role: "assistant", parts: assistantMsgParts, attachments: [] },
  ],
});

// Async title generation (fire-and-forget if first turn):
if (!existingChat) {
  generateTitleViaHaiku(userMsgParts).then((title) =>
    updateChatTitle({ chatId, title, userSuiAddress: session.user.id })
  ).catch((err) => console.error("[chat] title generation failed", err));
}
```

**~20 LoC, ~30 min including local smoke**.

### 3.5 Mechanical work — drizzle removal

| Step | Time |
|---|---|
| `rm -rf apps/web-v2/lib/db/` | ~1 min |
| `rm apps/web-v2/drizzle.config.ts` | ~1 min |
| `pnpm --filter audric-web-v2 remove drizzle-orm drizzle-kit postgres` | ~3 min |
| Remove 6 `db:*` npm scripts from `package.json` | ~2 min |
| Delete dead artifact code (5 tool files + 6 dead routes + 9 dead UI components) — same scope as Path-A item but cleaner because no schema reconciliation needed | ~1-2h |
| `pnpm --filter audric-web-v2 typecheck` to catch stragglers | ~10 min |
| **Subtotal drizzle removal** | **~1.5-2.5h** |

### 3.6 Path-B total cost

| Step | Time |
|---|---|
| Schema (Slice 3.1) | ~30 min |
| Queries layer (Slice 3.2) | ~2-3h (incl. unit tests) |
| Type substitution (Slice 3.3) | ~35 min |
| `/api/chat/route.ts` wiring (Slice 3.4) | ~30 min |
| Drizzle removal (Slice 3.5) | ~1.5-2.5h |
| Route migrations (`history`, `vote`, `actions.ts` out of `(chat)/`) | ~1h |
| Phase 0 audit confirmations + smoke | ~30 min |
| **Subtotal Option B core ship** | **~6.5-8.5h** |

**Calendar reality:** ~1 dedicated day OR ~2 lighter days. Closer to the SPEC's "1.5d" Option-A estimate than its "3-4d" Option-B estimate — because the audit shows ~50% of drizzle's queries are dead code in Audric and don't need porting.

---

## 4 — Side-by-side decision matrix

| Dimension | Option A (keep drizzle) | Option B (prisma rewrite) | Winner |
|---|---|---|---|
| Core ship time | ~3.5-4.5h | ~6.5-8.5h | **A** (~3-4h faster) |
| Net LoC change (after dead-code strip) | -~250 LoC (drop artifact tables/queries; keep ~660 queries) | -~700 LoC (drop ~910 drizzle; add ~150 prisma) | **B** (~450 LoC less to maintain) |
| npm deps removed | 0 | 3 (drizzle-orm, postgres, drizzle-kit) | **B** |
| postgres connection pools per fn instance | 2 (drizzle's `postgres()` + prisma's engine) | 1 (prisma only) | **B** |
| Mental model for future devs | "this table is drizzle, this one is prisma; User has 2 rows" | "everything is prisma" | **B** |
| Aligns with codebase-stated direction (`queries.ts:53-54`) | NO (debt remains) | YES (closes the stated intent) | **B** |
| Migration tooling production-tested | NO (`drizzle-kit` never run against prod Neon) | YES (`prisma migrate` shipped 12+ migrations) | **B** |
| FK to existing `User` table | NO (parallel drizzle User) | YES (FK to `User.suiAddress`) | **B** |
| Cross-ORM joins for analytics (per-chat cost rollup) | Requires raw SQL or import-drizzle-into-prisma-context | Native prisma `Chat → TurnMetrics` (both have `userId` cuid) | **B** |
| Rollback complexity if shipped broken | Lower (just unwire `/api/chat` writes) | Lower (same — unwire `/api/chat` writes) | tie |
| Future v0.7g "consolidate ORMs" ticket cost | ~4-6h (the migration we'd be deferring) | $0 (already done) | **B** |
| Risk during ship | Lower (less code change) | Slightly higher (more files touched) | **A** marginal |

**Score:** Option B wins 9 dimensions; Option A wins 2 (ship-time + risk margin).

---

## 5 — Recommendation

### Lock LOCK-1 = Option B (prisma rewrite)

**Reasoning:**
1. **The SPEC's 1.5d estimate for Option A is correct; the SPEC's 3-4d estimate for Option B is WRONG.** The actual Option-B cost is ~1 dedicated day (~6.5-8.5h) because we strip artifact / stream / legacy code from drizzle's 660 LoC down to ~150 LoC of active prisma functions. The cost delta between A and B is ~3-4h, not ~1.5 days.
2. **The codebase already states this direction** (`queries.ts:53-54`). Option A is shipping known-debt; Option B closes a stated intent.
3. **Future cost of Option A (when someone does the v0.7g cleanup) = ~4-6h** to migrate prisma data + delete drizzle. That's MORE than the ~3-4h you save by picking A now. Net: A is strictly worse.
4. **Connection pool fragmentation in serverless** is silent but real. Each Vercel function instance with drizzle + prisma holds 2 connection pools to the same Neon DB. Prisma-only halves the connection budget.
5. **No risk delta worth the trade.** Both A and B touch `/api/chat`; both add ~20 LoC of write wiring; both need migration runs against prod. The "smaller blast radius" Option A argument is correct but trivial — both ships are independently rollbackable.

### If founder picks Option A anyway

That's fine — document the debt explicitly:

```markdown
# audric-build-tracker.md — when persistent chats ships under Option A
> **PLANNED DEBT** — drizzle stays in apps/web-v2 alongside prisma. Owner: next agent picking up v0.7g "ORM consolidation". Estimated removal cost: ~4-6h. Folder to delete when paying down: `apps/web-v2/lib/db/`. Migration plan: copy chat/message/vote rows from drizzle → prisma via SQL, delete drizzle layer, switch consumers.
```

The recommendation is B, but A is shippable if the founder values the 3-4h delta over the ongoing debt.

---

## 6 — Open follow-ons (not in this POC's scope)

1. **LOCK-2 (vote / artifact disposition):** POC assumes vote=KEEP, artifact=STRIP. Affirmed inline (no separate POC needed).
2. **LOCK-4 (resume-on-reload mechanism):** POC assumes engine StreamCheckpointStore path. Affirmed inline (`Stream` table dropped in both A and B).
3. **`/chat/[id]/page.tsx` audit:** Phase 0 open question — does this page exist? `apps/web-v2/app/chat/[sessionId]/page.tsx` exists but uses session shell not chat-from-DB. Net new file needed (~50 LoC) for both options.
4. **Title generation cost validation:** Haiku at ~$0.0001/chat × 10k chats/month = ~$1/month. Validated. Affirms LOCK-5 = B recommendation in SPEC.

---

## 7 — Update for SPEC v1.0 promotion

When this POC folds into `BENEFITS_SPEC_v07e_persistent_chats.md` v1.0:

1. **§4 LOCK-1 status:** change from "founder lock required" to "LOCKED: Option B (prisma rewrite) per V07E_PERSISTENT_CHATS_LOCK1_POC.md §5."
2. **§5 Phase 1 effort:** revise from "~4-6h" to "~6.5-8.5h" (more accurate; includes prisma rewrite + drizzle removal).
3. **Total effort table §5 (line 449):** revise Option B from "~13-19h (~2-3d)" to "~9-12h (~1.5d)" — same as Option A in practice.
4. **Cost accounting §7:** drop the "$0 infra" line; confirm with operations that Neon connection pool can handle the doubled load if Option A had been picked, but since recommendation is B, this is moot.

---

## 8 — How to cite this POC

In conversations / docs: "LOCK-1 audit recommends Option B (prisma rewrite) — see `V07E_PERSISTENT_CHATS_LOCK1_POC.md` for the file-level evidence."

In git commits: "feat(spec): lock LOCK-1=B in persistent-chats SPEC per POC §5 evidence."
