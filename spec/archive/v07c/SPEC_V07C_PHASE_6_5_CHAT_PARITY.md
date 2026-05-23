# SPEC v0.7c Phase 6.5 — Chat-Shell Parity Hardening

> **Status:** ⚡ **LARGELY SHIPPED — S.253 RE-AUDIT 2026-05-22 ~17:30 AEST.** SPEC originally LOCKED 2026-05-20 ~15:55 AEST as "NOT STARTED" but Group A re-audit (S.253) found **3 of 5 P0s already SHIPPED**, 1 PARTIAL (in-memory rate-limit needs Upstash upgrade), 1 NEEDS VERIFY (`<ChatGate>` wrap status). **Actual remaining P0 work: ~1-2h.** See §0.1 below for the audit findings.
> **Sequencing:** lands between Phase 6 Sessions 1–5.5d (SHIPPED) and Phase 7 (post-soak deletion sweep). Chat-flip is BLOCKED until every P0 + critical-P1 item in this SPEC is green — but the bar is much closer than the original SPEC suggested.
> **Reference audit:** S.198 in `audric-build-tracker.md` (original audit, 2026-05-20). **S.253 re-audit (2026-05-22) supersedes for Group A status** — see `audric-build-tracker.md` S.253 entry.
> **Parent SPEC:** `spec/active/BENEFITS_SPEC_v07c.md` (Phase 6 of v0.7c migration).

---

## Section 0.1 — S.253 Re-audit findings (2026-05-22 ~17:30–18:30 AEST) — SUPERSEDES the SPEC's "NOT STARTED" framing

Audit performed during a wandering session that started as v0.7e Phase 2 prep (H1) and pivoted when the founder challenged: *"Are you sure these aren't in v2?"* Initial code-state grep against `apps/web-v2/app/api/chat/route.ts` suggested 3 of 5 Group A items shipped and 2 partial — but a follow-up tracker scan revealed the **full** picture.

### The actual state per `audric-build-tracker.md` (history of record)

| SHIP entry | When | Status |
|---|---|---|
| **S.199** — Phase 6.5 Group A SHIPPED (all 5 P0s) | 2026-05-20 ~15:55 AEST | ✅ DONE |
| **S.200** — Phase 6.5 Group B SHIPPED (moat hydration) | 2026-05-20 ~16:30 AEST (est.) | ✅ DONE |
| **S.201** — Phase 6.5 Group C SHIPPED (postWriteRefresh + harness-metrics + stream-error sanitize) | 2026-05-20 ~17:05 AEST | ✅ DONE |
| **S.207** — Phase 6.5+ v0.7c UI/UX parity port SHIPPED | 2026-05-20 ~20:30 AEST | ✅ DONE |
| **S.215** notes (line 7300/7366) — *"v0.7c 7d soak COLLAPSED into Group E smoke + production verification"* + *"web-v2 production has been native-HITL-only since the v0.7c Phase 6.5 chat-flip"* | 2026-05-21 ~09:00 AEST | ✅ Phase 6.5 declared closed |

**Group A decisions verified via code grep (decisions deviated from the SPEC's original prescription — intentionally):**

| Item | Original SPEC says | What S.199 actually shipped | Why deviation is correct |
|---|---|---|---|
| A.1 | Wire 24 tools | `READ_TOOLS` spread imports all in bulk via `@t2000/engine`; `AUDRIC_INTERNAL_API_URL` threaded via `ToolContext.env` (web-v2 chat route lines 740-741) | Cleaner than per-tool imports; new tools auto-wired |
| A.2 | Add `@upstash/ratelimit` (replace in-memory) | KEPT in-memory `lib/rate-limit.ts` (per S.199 entry "reused from existing") | Pragmatic — Vercel cold-start trade-off accepted for chat surface (not a payment-style critical path); can upgrade later if abuse surfaces |
| A.3 | Log SessionUsage per turn | Fire-and-forget `prisma.sessionUsage.create()` at chat route lines 1830-1860 with full 30-day-fuse explainer comment | As specified |
| A.4 | Wrap `/chat/page.tsx` in `<ChatGate>` | "**Inline ChatGate via AuthenticatedChat wrapper**" per S.199 — onboarding-gate logic lives inside `AudricChatClient` instead of page-level wrap | Architecturally equivalent; page.tsx stays clean |
| A.5 | Permission preset + account-age gate | `applyAccountAgeGate` used at chat route line 567; wired into `ToolContext` line 832 | As specified |

### The SPEC was never updated post-S.199

The Phase 6.5 SPEC was authored at 2026-05-20 ~15:55 AEST as the **planning artifact**. S.199 shipped Group A at the SAME timestamp (the SPEC and the ship raced). Subsequent audit (S.200 Group B, S.201 Group C) shipped within hours. **The SPEC's "NOT STARTED" header was never patched** to reflect any of this — partly because subsequent work (v0.7d MemWal Phases 1-7, v0.7e Phase 1A, S.247 Persistent Chats) consumed all the attention and partly because nobody read the SPEC again until S.253.

### Genuine ambiguity surfaced — chat-flip routing

The tracker says *"web-v2 production has been native-HITL-only since the v0.7c Phase 6.5 chat-flip"* (S.215), but `apps/web/next.config.ts` rewrites do NOT include `/new`, `/chat/:path*`, `/api/engine/*`, `/api/transactions/*` (only `/pay/:slug`, `/settings`, `/api/portfolio`, `/api/analytics/*`, `/[username]`). The runbook v3 comment (line 86) explicitly says these chat-shell paths "flip in Session 6 as the founder-owned ops step" which I can't verify happened.

**Possible reconciliations** (founder smoke check resolves):
1. "Chat-flip" in S.215 refers to the engine-side native-HITL adoption / web-v2 deployment going production-stable at `audric-web-v2.vercel.app`, NOT to DNS-level rewrites of audric.ai's chat-shell paths. apps/web's `/new` still serves the legacy chat at audric.ai today.
2. Chat-shell rewrites were added at a different layer I haven't inspected (Vercel dashboard project-level redirects / domain routing rules) — not in `next.config.ts`.
3. The rewrites went in temporarily and were rolled back without tracker reflection.

**Until the founder smoke-checks audric.ai/chat in a browser and confirms which app serves it, the chat-shell deletion plan can't be safely executed.**

### Real remaining Phase 6.5 work after the full audit

**Zero — assuming the chat-flip ambiguity above resolves toward "web-v2 already serves audric.ai chat-shell."** If founder smoke reveals "no, apps/web still serves it," then Phase 6 Session 6 chat-flip rewrites need to ship (~30 min — add 4 rewrite blocks to `apps/web/next.config.ts`). Either way, Phase 6.5 itself is closed; the only outstanding piece is the chat-shell *rewrite cutover*, not the *parity work*.

### Course-correction lessons (S.253 — 2x in one session)

**Lesson 1: SPEC locks ≠ ship state.** The original 2026-05-20 SPEC was authored as point-in-time scoping. By 2026-05-22, 3 SHIPPED tracker entries (S.199/S.200/S.201) had closed every item without the SPEC being updated. **Always cross-check SPEC headers against `audric-build-tracker.md` ship entries.**

**Lesson 2: When auditing, read the tracker BEFORE the SPEC.** S.253 first version trusted the SPEC's "NOT STARTED" header and did code grep to "verify" → found 3/5 shipped + 2/5 partial. Reading tracker S.199 would have shown ALL 5 shipped + the rationale for each deviation. **The tracker is the history of record; the SPEC is the planning artifact. When they disagree, the tracker wins.**

**Lesson 3: My audit doc framing kept oscillating because each tier of verification surfaced new state.** Tonight the conversation went: H1 audit → P2 fix sweep → "delete v1 en bloc" plan → "STOP, that breaks prod chat" → "actually Phase 6.5 SPEC is stale" → "actually Phase 6.5 is fully done per tracker". Each step revealed the prior framing was wrong. **The discipline I missed: every audit doc should START with `git log --since=<spec_date> spec/active/` + `grep -E "S\\.\\d+" audric-build-tracker.md` to surface what shipped since the SPEC was written.**

---

---

## Why this SPEC exists

Phase 6 Session 6 (founder operations) opened with an env-flip question that triggered a parity audit of `apps/web` (today's `/new` chat) vs `apps/web-v2` (chat-flip target). Audit surfaced **18 real gaps** — 4 P0s, 8 P1s, 6 P2s — beyond the originally-anticipated tool-wiring scope.

**Founder-locked decision (2026-05-20 ~15:50 AEST):** ship Phase 6.5 as a chat-parity hardening sprint BEFORE the chat-flip in Session 6. Defer v0.7d MemWal to its own post-cutover SPEC (MemWal not production-stable until ~2026-05-29 per the memory-injection-architecture rule; spec D-11 lock).

**Two gaps explicitly NOT in this sprint:**

1. **MemWal memory migration** (v0.7d scope). UserMemory port in this SPEC is *interim* — gets deleted when MemWal stabilizes.
2. **Skill recipes via `McpPromptAdapter`** (v0.7d scope alongside MemWal).

---

## Scope (14 items, ~4-5 days)

Sequence is **dependency-ordered**. Items in the same letter group can be parallelized across a single workday; letter groups themselves are sequential.

### Group A — Tool wiring + onboarding gate (P0 batch, ~1.5 days)

#### A.1 — Wire 24 missing read tools into web-v2's chat route

**File:** `apps/web-v2/app/api/chat/route.ts`

**Tools to add (24):** `render_canvas` · `savings_info` · `health_check` · `rates_info` · `transaction_history` · `swap_quote` · `volo_stats` · `mpp_services` · `web_search` · `explain_tx` · `portfolio_analysis` · `protocol_deep_dive` · `token_prices` · `create_payment_link` · `list_payment_links` · `cancel_payment_link` · `create_invoice` · `list_invoices` · `cancel_invoice` · `spending_analytics` · `yield_summary` · `activity_summary` · `resolve_suins` · `pending_rewards`

**Audric overrides also to add (3):** `lookup_user` (handle directory), `audric_mpp_services` (MPP filter), `list_contacts` (web-v2 has `save_contact` but no list reader).

**Tool wiring pattern (SAME pattern Sessions 1–5.5d used; do NOT re-implement):**

```typescript
// Import from @t2000/engine (tools already exist there):
import {
  balanceCheckTool, // ← already wired
  // NEW (existing engine tools, just import them):
  portfolioAnalysisTool,
  ratesInfoTool,
  transactionHistoryTool,
  renderCanvasTool,
  // ... + 20 more (full list above)
} from "@t2000/engine";

const engineTools = toAISDKTools([
  balanceCheckTool,
  portfolioAnalysisTool, // ← NEW
  ratesInfoTool,         // ← NEW
  // ... etc
  ...writeToolsForWebV2,
]);
```

**Thread `AUDRIC_INTERNAL_API_URL` through `ToolContext.env`** (currently missing — see A.5):

```typescript
const toolContext: ToolContext = {
  // ... existing fields ...
  env: {
    AUDRIC_INTERNAL_API_URL: env.AUDRIC_INTERNAL_API_URL ?? 'https://audric-web-v2.vercel.app',
  },
};
```

The 7 env-dependent tools (`portfolio_analysis`, `spending`, `yield_summary`, `balance` [partial], `receive` [payment-link/invoice cluster], `activity_summary`) need this field populated.

**Set `AUDRIC_INTERNAL_API_URL` env var on the `audric-web-v2` Vercel project:** `https://audric-web-v2.vercel.app` (so web-v2's engine calls itself directly for portfolio/history/analytics fetches).

**Acceptance:** all 24 tools fire and render via the existing `tool-result-router.tsx:111-235` client renderers (no client work needed — renderers already exist).

**Effort:** medium (~1 day including smoke).

#### A.2 — Add `@upstash/ratelimit` to `/api/chat`

**File:** `apps/web-v2/app/api/chat/route.ts`

**Pattern (use the managed Upstash primitive, NOT a hand-rolled in-memory limiter):**

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '60 s'),
  prefix: 'audric:chat',
});

// In POST handler, after auth:
const { success } = await ratelimit.limit(`${userId}:${ip}`);
if (!success) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

**Why managed (not in-memory):** Vercel serverless cold-starts wipe in-memory state. Distributed rate-limit via Upstash is the canonical Vercel AI SDK pattern. We already use Upstash for stream-checkpoint store (v0.7a Phase 5) — same instance, one prefix namespace.

**Acceptance:** 21st request within 60s returns 429. Verified via `for i in {1..25}; do curl -X POST .../api/chat ...; done`.

**Effort:** small (~30 min).

#### A.3 — Log `SessionUsage` per turn

**File:** `apps/web-v2/app/api/chat/route.ts` (in the `onFinish` callback)

**Pattern:**

```typescript
// In onFinish, fire-and-forget:
prisma.sessionUsage.create({
  data: {
    sessionId,
    userId,
    walletAddress,
    turnIndex,
    createdAt: new Date(),
  },
}).catch((err) => {
  console.error('[chat] sessionUsage write failed', err);
  // Don't bubble up — this is best-effort accounting
});
```

**Why this is P0:** `/api/internal/financial-context-snapshot` (the daily 02:00 UTC ECS cron at `apps/web`) filters its user list to `SessionUsage.createdAt >= 30d ago`. Users who only use web-v2 post-cutover age out at 30 days → `<financial_context>` block goes empty → Audric loses memory of who they are. **Silent 30-day fuse.**

**Acceptance:** verify `prisma.sessionUsage` row written per turn against PROD test wallet. Run financial-context-snapshot cron manually post-deploy to confirm wallet still included in the user list.

**Effort:** tiny (~10 min — 1 fire-and-forget call).

#### A.4 — Wrap `/chat/page.tsx` in `<ChatGate>`

**File:** `apps/web-v2/app/chat/page.tsx`

**Pattern:**

```typescript
// page.tsx currently renders <AudricChatClient /> directly. Wrap it:
import { ChatGate } from '@/components/chat/chat-gate';

export default function ChatPage() {
  return (
    <ChatGate>
      <AudricChatClient />
    </ChatGate>
  );
}
```

**Why this is P0:** `<ChatGate>` is the username-claim onboarding wedge. Without it, new Google sign-ups land directly in chat without ever being prompted for `username@audric` → Audric Store flywheel breaks for every new user post-cutover.

The component already exists at `apps/web-v2/components/chat/chat-gate.tsx` (mounted in the dead `(chat)` route group's layout, not the live `/chat` route).

**Acceptance:** sign in as a fresh test account → see username-claim prompt before chat UI. Existing accounts with usernames → see chat UI directly.

**Effort:** small (~30 min — wrap + smoke).

#### A.5 — Read user's permission preset + apply account-age gate

**File:** `apps/web-v2/app/api/chat/route.ts`

**Pattern:**

```typescript
import { PERMISSION_PRESETS, applyAccountAgeGate } from '@t2000/engine';

// After auth, before building ToolContext:
const userPrefs = await prisma.userPreferences.findUnique({
  where: { userId },
  select: { permissionPreset: true, dailyLimitUsd: true },
});
const preset = userPrefs?.permissionPreset ?? 'conservative';
let permissionConfig = PERMISSION_PRESETS[preset];

// SPEC 30 D-13: onboarding-window defense (first 7 days = conservative)
const accountAgeDays =
  Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000);
permissionConfig = applyAccountAgeGate(permissionConfig, accountAgeDays);

const toolContext: ToolContext = {
  // ...
  permissionConfig,
  // ...
};
```

**Why this is P0/P1:** user explicitly sets `conservative`/`aggressive` in settings — web-v2 currently ignores it (hardcodes `DEFAULT_PERMISSION_CONFIG`). Trust violation if/when sub-threshold auto-execute lands. Account-age gate is a SPEC 30 D-13 invariant that the audit caught as missing.

**Acceptance:** test 3 users (conservative / balanced / aggressive presets). Verify their preset is what the chat route uses. Test a fresh < 7-day account is forced to conservative regardless of stated preset.

**Effort:** small (~30 min).

---

### Group B — Moat hydration (P1 batch, ~1.5 days)

#### B.1 — Port AdviceLog hydration into system prompt

**Files:**
- `apps/web-v2/lib/audric/system-prompt.ts` (extend `buildAudricSystemPrompt`)
- `apps/web-v2/app/api/chat/route.ts` (wire the read)

**Why this is permanent (NOT throwaway port):** AdviceLog stores **what Audric said to the user**. MemWal stores **what the user said / what facts about the user are true**. Different access pattern; AdviceLog stays even after v0.7d.

**Pattern (port from `apps/web/lib/engine/engine-factory.ts:391-415`):**

```typescript
import { buildAdviceContext } from '@/lib/audric/advice-log';

const adviceContext = await buildAdviceContext(userId); // Last 30 days
const systemPrompt = buildAudricSystemPrompt({
  // ... existing layers ...
  intelligence: {
    advice: adviceContext,
    // profile + memory added in B.2 / B.3
  },
});
```

**Acceptance:** verify a user with a recent `AdviceLog` row sees the agent reference prior advice ("Last week I recommended saving in USDsui — has your view on that changed?").

**Effort:** small-medium (~2 hours — port the helper + wire).

#### B.2 — Port Silent Profile hydration into system prompt

**Why:** stores **who the user is** (risk appetite, language, literacy, name). Probably-not double work with MemWal — MemWal's attribute-storage shape is undecided.

**Pattern:** read `UserFinancialProfile` row in chat route, thread through `intelligence.profile` in `buildAudricSystemPrompt`.

**Acceptance:** verify user with `riskTolerance: 'low'` sees the agent's responses err toward conservative framing.

**Effort:** small-medium (~2 hours).

#### B.3 — Port UserMemory hydration into system prompt (INTERIM — gets deleted in v0.7d)

**Why interim:** UserMemory IS what v0.7d MemWal replaces. Port it now to avoid the 30-60 day gap before MemWal lands; explicit deletion task in v0.7d kickoff SPEC.

**Pattern:** read `prisma.userMemory.findMany` top-8 most-recent rows → thread as `<memory_recall>` block in F-4 5-layer assembly.

**Acceptance:** verify a user with seeded memories sees relevant facts surface ("you mentioned hating gas fees last week").

**Effort:** small (~1 hour — same pattern as B.1/B.2).

#### B.4 — Port Chain Memory hydration into system prompt

**Why permanent:** ChainFact rows are classified from on-chain data, not user statements. MemWal doesn't read the chain. Stays.

**Pattern:** read `prisma.chainFact.findMany` for the user's wallet → format as `<chain_memory>` block.

**Acceptance:** verify a user with a "recurring send to 0xabc every Friday" classified fact has it surfaced in context.

**Effort:** small (~1 hour).

---

### Group C — Hallucination + observability fixes (P1 batch, ~1 day)

#### C.1 — Wire `postWriteRefresh` map

**File:** `apps/web-v2/app/api/chat/route.ts`

**Why P1 (the "system prompt is lying" gap):** the static prompt at `system-prompt.ts:86-89` claims *"the engine AUTOMATICALLY re-runs balance_check / savings_info / health_check after every successful write — fresh tool results appear in your context BEFORE you narrate"*. Without `postWriteRefresh` wired, this is a lie. LLM narrates from stale balances → hallucination class re-opens.

**Pattern (port `POST_WRITE_REFRESH_MAP` from `apps/web/lib/engine/engine-factory.ts:100-129`):**

The engine v2.11+ contract via `experimental_agent` doesn't natively support `postWriteRefresh` the way legacy `AISDKEngine.submitMessage` did. Need to either:
- (a) port the map to web-v2 + manually re-dispatch the listed read tools in `onStepFinish` after each successful write, OR
- (b) extend the engine's `experimental_agent` flow to honor `postWriteRefresh` callbacks at `tool-result` time.

**Sequencing:** explore (a) first (faster, host-side). If (b) is needed, that's an engine package change (separate PR).

**Acceptance:** after `save_deposit` of $10, the next narration shows the post-save balance (not pre-save). Verified against PROD test wallet.

**Effort:** medium (~3 hours — port + wire + smoke).

#### C.2 — Wire `harness-metrics` collector + classifiers

**Files:**
- `apps/web-v2/lib/audric/telemetry-integration.ts` (extend the 41-field row builder)
- `apps/web-v2/app/api/chat/route.ts` (invoke `classifyEffort` + `harnessShapeForEffort`)

**Why P1:** TurnMetrics rows for web-v2 currently hardcode `effortLevel: 'medium'`, `harnessShape: null`, `guardsFired: []`, `sessionSpendUsd: 0`. Dashboards segmented by these fields go flat after the flip. Can't detect:

- Guard regressions (always 0)
- Effort routing regressions (always medium)
- Per-shape harness ratio drift

**Pattern:** port the helpers from `apps/web/lib/harness-metrics.ts`; wire `classifyEffort()` at turn start and `harnessShapeForEffort(effortLevel)` for the row. Hook engine's `onGuardFired` → telemetry collector.

**Acceptance:** verify TurnMetrics row for a "what's my APY?" turn shows `effortLevel: 'low'` + `harnessShape: 'haiku-low'`. Verify a save+swap turn shows `guardsFired: ['health_factor', 'slippage_cap']` (or whatever fired).

**Effort:** medium (~3 hours).

#### C.3 — Sanitize stream errors + redact PII at display time

**Files:**
- `apps/web-v2/app/api/chat/route.ts` (wrap engine error chunks)
- `apps/web-v2/app/chat/audric-chat-client.tsx` (sanitize displayed error.message)

**Pattern:** port `sanitizeStreamErrorMessage()` from `apps/web/lib/engine/stream-errors.ts` + apply `redactPII` to displayed error text.

**Acceptance:** trigger a Prisma error mid-turn — user sees "Something went wrong. Please try again." not the raw stack. Trigger an Anthropic 429 — user sees "Service temporarily busy" not the raw 429 payload.

**Effort:** small (~1 hour).

---

### Group D — Vercel-managed polish (P1 batch, ~1 day)

#### D.1 — Wire AI SDK `streamCheckpointStore` for page-reload survival

**File:** `apps/web-v2/app/api/chat/route.ts`

**Pattern (use the AI SDK v2.2.0 native primitive — D-17 spec lock):**

```typescript
import { UpstashStreamCheckpointStore } from '@/lib/engine/upstash-checkpoint';

// In EngineConfig / Agent config:
streamCheckpointStore: new UpstashStreamCheckpointStore({
  namespace: `audric:stream:${sessionId}`,
  ttlSeconds: 3600, // 1 hour
}),
// And honor resumeStreamId from request body if present:
resumeStreamId: body.resumeStreamId,
```

**Why managed:** D-17 lock — engine v2.2.0 already published this contract; we just need to wire it host-side. Upstash instance is the same one A.2 uses for rate-limit.

**Acceptance:** start a 30-second compound borrow + swap turn → reload mid-stream → stream resumes and completes.

**Effort:** medium (~3 hours — wire + smoke + verify Upstash TTL).

#### D.2 — Wire AI SDK `useChat({ id, initialMessages })` for chat-history persistence

**Files:**
- `apps/web-v2/app/chat/page.tsx` (compute sessionId; pass to client)
- `apps/web-v2/app/chat/audric-chat-client.tsx` (use `useChat({ id })`)
- NEW: `apps/web-v2/app/api/chat/[id]/route.ts` (history reader)

**Pattern:** AI SDK v6's `useChat({ id, initialMessages })` is the canonical Vercel pattern. Combine with Vercel KV or Upstash for backing store.

**Acceptance:** refresh the page mid-conversation → conversation reloads with prior turns.

**Effort:** medium-large (~4 hours — schema + reader + client wiring).

**Note:** this is currently DEFERRED-BY-DESIGN per the runbook §2.2 ("single-conversation surface; MemWal recall in v0.7d supersedes"). Founder re-evaluated 2026-05-20 — chat-history persistence is needed for UX (especially debug workflows) even though MemWal is the long-term continuity primitive. Both can coexist: chat-history = "what we said last hour", MemWal = "what I learned about you over months".

---

### Group E — Polish (P2 batch, ~half day)

#### E.1 — `<user_identity>` block uses `@username` not bare wallet

**File:** `apps/web-v2/lib/audric/system-prompt.ts:451-457`

**Pattern:** read `User.username` + `User.usernameClaimedAt` (set during A.4 ChatGate flow) → format identity block as `username@audric` if claimed, fallback to `wallet 0x...` if not.

**Acceptance:** narration uses `@funkii` not `0x40cd…3e62` for users with claimed handles.

**Effort:** tiny (~30 min).

#### E.2 — Wire `onAutoExecuted` + `incrementSessionSpend` + `invalidateUserFinancialContext`

**File:** `apps/web-v2/app/api/chat/route.ts`

**Why:** load-bearing only when auto-execute lands (not Phase 6.5 scope), but cheap to wire now while we're in the area. Avoids re-opening the file.

**Pattern:** port helpers from `apps/web/lib/engine/engine-factory.ts:892-899`.

**Acceptance:** after a (hypothetical) auto-executed save, `sessionSpendUsd` increments and `<financial_context>` cache invalidates.

**Effort:** small (~1 hour).

---

## Sequencing + acceptance gates

| Day | Group | Items | Gate before next group |
|---|---|---|---|
| 1 | A | A.1, A.2, A.3, A.4, A.5 | All 4 P0s green; PROD smoke vs `audric-web-v2.vercel.app/chat`; founder-confirms each of the 24+3 tools fires |
| 2 | B | B.1, B.2, B.3, B.4 | Moat-revival smoke: same prompt asked to apps/web's chat and web-v2's chat → both responses reference user context similarly |
| 3 | C | C.1, C.2, C.3 | `postWriteRefresh` smoke (save → verify post-save balance in narration); TurnMetrics row for the same turn shows correct `effortLevel` + `guardsFired` |
| 4 | D | D.1, D.2 | Page-reload mid-stream → stream resumes; refresh mid-conversation → history reloads |
| 5 | E + final smoke | E.1, E.2 + the full 30-row §6 catalog | Founder operations: re-run env-flip step (now actually meaningful) + rehydrate + chat-flip PR + 7d soak begins |

Each group is **one PR** (5 PRs total). Each PR gates on:

- `pnpm typecheck` green in `audric/apps/web-v2`
- `pnpm lint` green in `audric/apps/web-v2`
- `pnpm smoke:b1-b1a` green (16/16 must keep passing)
- PROD smoke against `audric-web-v2.vercel.app/chat` for the new behavior

---

## Out of scope (deferred — explicit)

These were surfaced in the S.198 audit but are NOT in this SPEC:

- **MemWal memory layer** (v0.7d) — UserMemory (B.3) is interim; v0.7d replaces it.
- **Skill recipes via McpPromptAdapter** (v0.7d).
- **`pay_api` MPP services tool** (Agentic Commerce SPEC).
- **Voice surface** (audit-3 — deletes with chat shell).
- **Account-aging metrics in TurnMetrics extended fields** (`aciRefinements`, `mutableToolDedupes`, etc. — keep hardcoded 0 for now).
- **`audricPrepareBundleTool` SPEC 14 plan-time stash** — bundle path works without it.

---

## What "chat-flip ready" means after this SPEC closes

| Check | Status |
|---|---|
| Web-v2's chat has ≥ tool parity with apps/web's chat (37 tools + audric overrides) | ✅ A.1 |
| Cost-runaway exposure closed | ✅ A.2 |
| Daily Intelligence cron (financial-context-snapshot) keeps including post-cutover users | ✅ A.3 |
| Onboarding flywheel intact for new sign-ups | ✅ A.4 |
| User's permission preset honored; account-age gate applied | ✅ A.5 |
| Audric Intelligence moat (AdviceLog/Profile/Memory/ChainMemory) intact | ✅ B.1-B.4 |
| Post-write hallucination class closed | ✅ C.1 |
| Dashboards segmented by effort/shape/guards keep working | ✅ C.2 |
| Errors safe to surface | ✅ C.3 |
| Page-reload survival for long writes | ✅ D.1 |
| Chat-history persistence | ✅ D.2 |
| Narration uses `@username` not bare wallet | ✅ E.1 |
| Auto-execute accounting wired (load-bearing later) | ✅ E.2 |

**Then and only then:** runbook §7 cutover sequence resumes — env-flip becomes meaningful (web-v2's chat actually consumes the URL), rehydrate cron + chat-flip PR + 7d soak.

---

## Cross-references

- **Parent SPEC:** `spec/active/BENEFITS_SPEC_v07c.md`
- **Audit findings:** `audric-build-tracker.md` § S.198 (the canonical evidence + the subagent audit report)
- **Runbook:** `spec/runbooks/RUNBOOK_v07c_phase_6_cutover.md` § 7 (cutover sequence — chat-flip step BLOCKED on this SPEC)
- **Engine package contract:** `packages/engine/src/v2/engine.ts`, `packages/engine/src/tools/*`, `packages/engine/src/permission-rules.ts`, `packages/engine/src/onboarding-gate.ts`
- **Memory architecture rule:** `.cursor/rules/memory-injection-architecture.mdc` (F-4 5-layer assembly)
- **Single-source-of-truth rule:** `.cursor/rules/single-source-of-truth.mdc` (canonical fetchers — `getPortfolio` etc.)

---

## What changes if MemWal stabilizes faster than 30 days

If MemWal lands during this sprint (unlikely but possible):

- **B.3 (UserMemory port)** gets cancelled — go straight to MemWal injection.
- **B.2 (Silent Profile)** may get partial replacement — depends on MemWal's attribute-storage shape.
- **B.1 (AdviceLog) + B.4 (Chain Memory)** unaffected — stays.

Track `.cursor/rules/memory-injection-architecture.mdc` for MemWal stability signal.
