# AUDIT — v0.7c Session 5.5 — V2 UI/UX Hardening Pass

> **Status:** AUDIT-ONLY (no code changes). Founder approval required before Session 5.5 implementation.
> **Trigger:** founder question "And what about the new v2 ui / ux pass to ensure v2 is production ready and all ui is perfect with no nextjs chatbot template boilerplate left over, where does that fit in?" (2026-05-20 ~13:33 AEST).
> **Audit timestamp:** 2026-05-20 ~13:45 AEST.
> **Auditor:** agent (read-only audit; ~25 file reads + 6 rg sweeps).
> **Scope:** apps/web-v2 chat-shell scaffolding NOT touched by S.188/S.189/S.190/S.191/S.192/S.193/S.194/S.195/S.196.

---

## Section 0 — TL;DR (read this first)

The audit surfaced **one finding bigger than UI polish** plus the expected template debris. Founder decision required before Session 5.5 scope can be locked.

### 0.1 HEADLINE — chat-surface architectural ambiguity (P0)

**The Session 6 chat-rewrite plan in `RUNBOOK_v07c_phase_6_cutover.md` §2.2 points `audric.ai/new` → `web-v2/` — but that lands users on the Vercel AI Chatbot template's `(chat)` group + `useActiveChat` → `useChat({ api: '/api/chat' })`, which talks to a TEMPLATE backend with TEMPLATE tools (`getWeather`, `createDocument`, `editDocument`, `requestSuggestions`, `updateDocument`), NOT Audric's 37 tools.**

The production-verified working Audric chat (S.195 happy path: save 0.01 USDC end-to-end clean, digest `9VtFsxnJ...bQ3XUk`) lives at `web-v2/audric-chat` (`app/audric-chat/audric-chat-client.tsx`, 35k LoC, `useChat({ api: '/api/audric-chat' })`).

**Two paths forward (founder decision needed):**

| | Path A — relocate audric-chat (LEAN) | Path B — port-into-template (BIG) |
|---|---|---|
| **What** | Change rewrite from `web-v2/` to `web-v2/audric-chat`. AudricChatClient becomes production chat. Template `(chat)` group + ChatShell + Messages + Artifact + AppSidebar + ChatHeader + 30 template chat files delete in Session 9a. | Keep template ChatShell as visible surface. Rewire `useActiveChat` to `/api/audric-chat`. Port AudricChatClient's rendering (PermissionCard / ToolResultRouter / BundlePermissionCard / BalanceCardV2 / receipts / reasoning accordion / bundle parsing) INTO ChatShell's Messages component. Delete `audric-chat-client.tsx` + `/audric-chat` page. |
| **Effort** | ~½ day (1 rewrite-line change + chat history sidebar UX decision + reroute). Most of "Session 5.5" scope drops to "delete template chrome" which compounds with Session 9a. | ~5–7 days (port 35k LoC of rendering primitives + chat-history schema swap from Drizzle to Prisma + rewire transport + retest entire HITL + bundle flows). Major regression risk. |
| **Production verification status** | The exact surface (audric-chat-client.tsx) IS the surface S.195 verified end-to-end clean. Cutover ships exactly what was verified. | The target surface (template ChatShell wired to /api/audric-chat) has NEVER been smoke-tested end-to-end with sponsored writes. Day 1 regression risk on every chat turn. |
| **Code volume after cutover** | Smaller (~30 template files + chat/[id] support files delete in Session 9a) | Same final state but via a "merge" hop that's ~2k LoC of rendering port work |
| **Chat-history feature** | Single-conversation surface (audric-chat-client is one-shot, no `/chat/[id]`). Multi-conversation = Session 5.5+ workstream. | Inherits template's multi-chat sidebar wiring (but needs schema port from Drizzle to Prisma — Day 1 P0 work). |

**Recommendation: PATH A.** Path B's only advantage is preserving the template's chat-history sidebar feature, but:
1. The sidebar feature is wired to a Drizzle schema that has NEVER been migrated to Prisma (live wire still goes through `lib/db/queries.ts` Drizzle, which contradicts apps/web's Prisma-only convention).
2. The chat-history UX is template-default ("New chat 1", "Delete all chats") — re-doing it in audric design is itself another future session.
3. Path B re-introduces every template chrome finding below as in-scope; Path A drops most of them into the Session 9a sweep.
4. Path A's "single-conversation surface" matches the S.193/S.194/S.195 production-verified architecture exactly — zero regression risk.

**Path A is the soak-safe choice for Phase 6 cutover. Chat history is a v0.7d+ feature when MemWal lands (memory replaces chat history as the cross-session continuity primitive anyway — see CLAUDE.md §Chain Memory + AdviceLog).**

### 0.2 If Path A is chosen — Session 5.5 scope shrinks to (~½–1 agent day):

1. Fix `app/layout.tsx` template metadata (4 lines) — **P0 brand leak**.
2. Audit `app/audric-chat/audric-chat-client.tsx` (35k LoC) for any template-residue copy / icons / aria labels — light pass; this file was rebuilt by audric team.
3. Re-route the founder's Session 6 chat-rewrite from `web-v2/` to `web-v2/audric-chat`.
4. Decide chat history sidebar UX: hide entirely (recommended) OR ship a v0.7d-deferral signpost ("Chat history is rebuilt in v0.7d to use memory recall"). Match the Memory-section deferral pattern from S.188.
5. Update `RUNBOOK_v07c_phase_6_cutover.md` §2.2 + §7.2 to reflect the new rewrite target.

**Template debris cleanup (50+ findings in Sections 2–7 below) folds into Session 9a deletion sweep — it deletes WITH the template `(chat)` group.**

### 0.3 If Path B is chosen — Session 5.5 scope expands to (~5–7 agent days):

All 50+ findings below are in-scope, plus the additional port-into-template engineering work. Founder should re-read the runbook §11.1 (v0.7d) deferral discipline before signing off — this is the opposite of slice discipline.

---

## Section 1 — Audit methodology

### 1.1 Files audited (25 reads + 6 rg sweeps)

| File | Type | Status |
|---|---|---|
| `app/layout.tsx` | Root layout + metadata | **TEMPLATE — P0** |
| `app/(chat)/page.tsx` | Empty (returns null) | template |
| `app/(chat)/layout.tsx` | Chat-shell wrapper (mounts AppSidebar + ChatGate) | template + audric mixed |
| `app/(chat)/actions.ts` | generateTitleFromUserMessage + updateChatVisibility | template |
| `app/(chat)/api/audric-chat/route.ts` | Audric backend POST | AUDRIC (kept) |
| `app/(chat)/api/chat/route.ts` | Template chat backend | **TEMPLATE — dead code post-cutover** |
| `app/audric-chat/page.tsx` | Audric chat page (Suspense wrapper) | AUDRIC (currently smoke surface) |
| `app/audric-chat/audric-chat-client.tsx` | Audric chat client (35k LoC) | AUDRIC (production-verified) |
| `components/chat/empty-state.tsx` | Splash-B post-auth empty state | AUDRIC (S.192) |
| `components/chat/chat-gate.tsx` | Username-claim gate | AUDRIC (S.192) |
| `components/chat/chat-header.tsx` | Top header w/ Deploy-with-Vercel CTA | **TEMPLATE — P0** |
| `components/chat/app-sidebar.tsx` | Left sidebar shell | template |
| `components/chat/sidebar-history.tsx` | Chat history list | template |
| `components/chat/sidebar-user-nav.tsx` | User dropdown (theme toggle, sign-out) | template + audric-mixed |
| `components/chat/shell.tsx` | ChatShell (the post-cutover surface IF Path B) | template |
| `components/chat/visibility-selector.tsx` | Public/Private chat toggle | **TEMPLATE — P0 PRIVACY** |
| `components/chat/suggested-actions.tsx` | Sample-prompt grid | template |
| `components/chat/multimodal-input.tsx` | Input area w/ attachments + model picker | template + light audric |
| `components/chat/icons.tsx` | 1050 LoC icon library (incl. VercelIcon) | template |
| `lib/constants.ts` | suggestions[] array | **TEMPLATE — P0** |
| `lib/errors.ts` | ChatbotError class | template (naming) |
| `lib/ai/prompts.ts`, `models.ts`, `providers.ts`, `entitlements.ts`, `tools/*` | Template AI SDK config | template (template chat route uses these) |
| `lib/db/queries.ts`, `lib/db/schema.ts` | Drizzle schema | template (Audric uses Prisma) |
| `hooks/use-active-chat.tsx` | ChatShell state hook | template |
| `.env.example` | Env documentation | partial template |
| `README.md` | Project docs | AUDRIC (good) |

### 1.2 rg sweeps run

```
chatbot|Chatbot|Next\.js AI|Vercel AI|vercel\.com/templates|chat\.vercel\.ai|sdk\.vercel\.ai|Deploy with Vercel|template using the AI SDK
→ 27 file hits

VercelIcon|GitIcon|WeatherIcon|How can I help
→ 3 file hits (icons.tsx + chat-header.tsx + ai/models.mock.ts)

Various component-import-tracer regexes
→ confirmed visibility-selector, artifact*, model-selector, code-editor, etc. are live-imported by the (chat) group
```

---

## Section 2 — Bucket 1: App Shell Chrome (P0 brand leaks)

### 2.1 `app/layout.tsx:16-20` — **P0 BRAND LEAK**

```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://chat.vercel.ai"),
  title: "Next.js Chatbot Template",
  description: "Next.js chatbot template using the AI SDK.",
};
```

**Impact:** every browser tab, every social share preview, every Slack/Discord/Twitter unfurl, every Google search result for `audric.ai` shows "Next.js Chatbot Template".

**Fix (4 lines):**

```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://audric.ai"),
  title: { default: "Audric", template: "%s — Audric" },
  description: "Audric is your AI agent for money on Sui. Save, send, swap, borrow — non-custodial, sponsored gas, tap-to-confirm.",
  openGraph: { type: "website", siteName: "Audric", locale: "en_US" },
  twitter: { card: "summary_large_image", creator: "@audricai" },
};
```

**Effort:** 5 min. **Path A + B both required.**

### 2.2 `app/(chat)/opengraph-image.png` + `app/(chat)/twitter-image.png` — **P0 BRAND LEAK**

15k + 52k binary files. These are Vercel template's default OG/Twitter card images. Every shared link uses them.

**Fix:** generate Audric-branded versions (suggested: BalanceHero shot or Audric wordmark + tagline). Or delete the two files (Next.js falls back to favicon for OG).

**Effort:** 30 min (asset gen) + 5 min (place files). **Path A: delete; Path B: replace.**

### 2.3 `components/chat/chat-header.tsx:37-44,53-65` — **P0 BRAND LEAK (catastrophic)**

```tsx
// Lines 37-44: mobile logo links to Vercel template
<Link href="https://vercel.com/templates/next.js/chatbot" rel="noopener noreferrer" target="_blank">
  <VercelIcon size={14} />
</Link>

// Lines 53-65: "Deploy with Vercel" CTA on every chat page (desktop, top-right)
<Button asChild className="hidden rounded-lg bg-foreground px-4 ... md:ml-auto md:flex">
  <Link href="https://vercel.com/templates/next.js/chatbot" rel="noopener noreferrer" target="_blank">
    <VercelIcon size={16} />
    Deploy with Vercel
  </Link>
</Button>
```

**Impact:** every user who lands on chat sees a "Deploy with Vercel" CTA above the fold next to their financial chat. **This is the worst single finding in the audit.**

**Fix:**
- **Path A:** delete this file (it's part of the template ChatShell which deletes in Session 9a).
- **Path B:** delete lines 37-44 and 53-65; replace with AudricMark + product-area label per design system.

**Effort:** 1 min (delete) / 15 min (replace).

### 2.4 `components/chat/shell.tsx:207-227` — **P0 BRAND LEAK (gateway error modal)**

```tsx
<AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
<AlertDialogDescription>
  This application requires {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
  activate Vercel AI Gateway.
</AlertDialogDescription>
<AlertDialogAction
  onClick={() => {
    window.open("https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card", "_blank");
    ...
```

**Impact:** if the AI Gateway connection fails (rate limit, credit card lapse, etc.), the FALLBACK MODAL shown to users says "activate Vercel AI Gateway" + opens a vercel.com link. **Users see vercel.com branding during their worst Audric experience (broken chat).**

**Fix:**
- **Path A:** deletes with `shell.tsx` (Session 9a).
- **Path B:** rewrite as Audric-branded "Chat unavailable — please try again in a moment" + log details to telemetry; or wire to a status-page link if one exists.

**Effort:** 1 min (delete) / 20 min (rewrite + retest error path).

### 2.5 `app/(chat)/layout.tsx:16-19` — Pyodide CDN load (P1 — privacy + perf)

```tsx
<Script
  src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
  strategy="lazyOnload"
/>
```

**Impact:** every visitor's browser fetches a 10MB+ Python-in-browser runtime from jsdelivr CDN for a code-execution feature Audric will never use. Performance regression + third-party-host privacy leak.

**Fix:** delete this Script tag.

**Effort:** 1 min. **Path A + B both required.**

---

## Section 3 — Bucket 2: Chat History Sidebar (template-default)

### 3.1 `components/chat/app-sidebar.tsx:77` — "Chatbot" tooltip (P1)

```tsx
tooltip="Chatbot"
```

The logo tooltip says "Chatbot" not "Audric".

**Fix:** change to "Audric" (or remove tooltip entirely if mark is self-evident).

### 3.2 `components/chat/app-sidebar.tsx:80` — generic icon as brand (P1)

```tsx
<MessageSquareIcon className="size-4 text-sidebar-foreground/50" />
```

The sidebar brand mark is a generic chat-bubble icon, not the Audric mark. `components/ui/audric-mark.tsx` already exists (S.192 ship); just not wired here.

**Fix:** swap MessageSquareIcon for `<AudricMark />`.

### 3.3 `components/chat/app-sidebar.tsx:149-152` — generic dialog copy (P3)

```tsx
<AlertDialogTitle>Delete all chats?</AlertDialogTitle>
<AlertDialogDescription>
  This action cannot be undone. This will permanently delete all
  your chats and remove them from our servers.
</AlertDialogDescription>
```

Functional but generic. Could mention "your conversations with Audric" instead of "your chats."

### 3.4 `components/chat/sidebar-history.tsx:162,206,357,361` — generic copy (P2)

```tsx
"Login to save and revisit previous chats!"
"Your conversations will appear here once you start chatting!"
"Are you absolutely sure?"
"This action cannot be undone. This will permanently delete your chat and remove it from our servers."
```

**All functional but template-default voice.** Audric brand voice would be quieter + more deliberate.

**Fix (all of Section 3):**
- **Path A:** entire sidebar deletes in Session 9a.
- **Path B:** rewrite copy + swap icons per design system. ~30 LoC delta across 2 files.

---

## Section 4 — Bucket 3: Empty / Landing State

### 4.1 `lib/constants.ts:15-20` — **P0 SUGGESTED-PROMPTS LEAK**

```typescript
export const suggestions = [
  "What are the advantages of using Next.js?",
  "Write code to demonstrate Dijkstra's algorithm",
  "Help me write an essay about Silicon Valley",
  "What is the weather in San Francisco?",
];
```

**Impact:** these are imported into `SuggestedActions` (rendered inside `MultimodalInput`). Every user who lands on a fresh chat sees these as clickable starter prompts. **Audric users see "What are the advantages of using Next.js?" as a suggested chat to send to a financial agent.**

**Fix:**
- **Path A:** `SuggestedActions` deletes with the template ChatShell in Session 9a.
- **Path B:** replace with Audric-relevant prompts ("How much can I save?" / "What's my health factor?" / "Show my portfolio" / "Receive USDC"). Match the chip-bar pattern from S.192 / `chip-configs.ts`.

**Effort:** 5 min (delete) / 20 min (rewrite).

### 4.2 `components/chat/empty-state.tsx` (Audric Splash-B) — CLEAN

Verified S.192's Splash-B (BalanceHero + greeting + sub-stats) is on-brand. Not a finding.

### 4.3 `components/ai-elements/model-selector.tsx` + wiring in `multimodal-input.tsx:28-38` — P1 (Audric doesn't expose model choice)

The template lets users pick from `chatModels` array. Audric runs on a single Claude model — model selection is a developer concern, not user-facing.

**Fix:**
- **Path A:** deletes with MultimodalInput in Session 9a.
- **Path B:** remove ModelSelector* imports + JSX from MultimodalInput; delete `components/ai-elements/model-selector.tsx`.

**Effort:** 1 min (delete) / 10 min (surgical removal).

---

## Section 5 — Bucket 4: Auth Flow Chrome

### 5.1 `components/chat/sidebar-user-nav.tsx:112-115` — **P0 STALE DEV COPY**

```tsx
if (isGuest) {
  ...
  toast({
    type: "error",
    description: "Sign-in is wired in Phase 2.",
  });
}
```

**Impact:** this is leftover dev code from "Day 1d" — but `Phase 2` shipped MONTHS ago (S.175+ wired full zkLogin). If any guest-email user hits this code path, they see a developer-facing error about a phase that's long since completed.

**Fix:** remove the entire `if (isGuest)` branch + delete `guestRegex` from `lib/constants.ts:13` (the comment explicitly says "audric stub `getCurrentUser()` does not yet emit `guest-*` emails" → dead code).

**Effort:** 5 min. **Path A + B both required.**

### 5.2 `components/chat/sidebar-user-nav.tsx:80-88` — Theme toggle (P3)

Light/dark mode toggle in user dropdown. Audric design system is dark-first per `audric-design-system` (the Audric tokens in `globals.css` define a dark palette).

**Decision needed:** keep theme toggle (allow light mode) or remove (lock to dark-only)?

**Fix:**
- Founder UX call. If keeping: leave as-is. If removing: delete the `DropdownMenuItem` + `useTheme` import.

---

## Section 6 — Bucket 5: Template-Only Features (deletion candidates)

### 6.1 `components/chat/visibility-selector.tsx` + `hooks/use-chat-visibility.ts` + `app/(chat)/api/vote/route.ts` — **P0 PRIVACY**

The template lets users mark chats as `public` (anyone with the link can read). **Audric should never let financial conversations be public.** Even if the link is hard to guess, the affordance itself is wrong for a financial agent.

Wired into `chat-header.tsx:46-51`:
```tsx
{!isReadonly && (
  <VisibilitySelector chatId={chatId} selectedVisibilityType={selectedVisibilityType} />
)}
```

**Fix:**
- **Path A:** deletes with the template `(chat)` group.
- **Path B:** delete VisibilitySelector + its JSX call + the public-chat code paths in `/api/chat/route.ts` + the `Vote` schema column + the `/api/vote` route. Significant cross-cut.

**Effort:** 1 min (Path A) / 1 day surgical (Path B — touches schema, db queries, every chat route).

### 6.2 Artifact streaming (5 component files + 4 subfolders + 2 API routes) — P1

Files: `components/chat/artifact.tsx`, `artifact-actions.tsx`, `artifact-close-button.tsx`, `artifact-messages.tsx`, `code-editor.tsx`, `console.tsx`, `diffview.tsx`, `document.tsx`, `document-preview.tsx`, `document-skeleton.tsx`, `image-editor.tsx`, `sheet-editor.tsx`, `text-editor.tsx`, `weather.tsx`, `preview.tsx`, `preview-attachment.tsx`, `toolbar.tsx`, `slash-commands.tsx`, plus `artifacts/code/`, `artifacts/text/`, `artifacts/sheet/`, `artifacts/image/` (4 subfolders) + `lib/artifacts/server.ts` + `app/(chat)/api/document/route.ts` + `app/(chat)/api/suggestions/route.ts`.

**Total: ~25 files, ~3000 LoC.** All template artifact streaming for code/document/image/sheet editing. **Zero usage in Audric** (read tools render via `ToolResultRouter`; write tools render via `PermissionCard`).

`shell.tsx:22+180` mounts `<Artifact />` unconditionally:
```tsx
import { Artifact } from "./artifact";
...
<Artifact ... />
```

**Fix:**
- **Path A:** deletes wholesale in Session 9a.
- **Path B:** delete files + tree-shake imports across MultimodalInput, ChatShell, lib/types, hooks/use-artifact.

**Effort:** 5 min (delete dir tree) / 1 day surgical (Path B).

### 6.3 Template AI tool definitions — `lib/ai/tools/*` — P1

Files: `create-document.ts`, `edit-document.ts`, `get-weather.ts`, `request-suggestions.ts`, `update-document.ts`.

These are wired into `/api/chat/route.ts:22-26` and are TEMPLATE tools (NOT Audric tools). They expose `getWeather` etc. to the LLM in the template chat route.

**Fix:**
- **Path A:** deletes with `/api/chat/route.ts` in Session 9a.
- **Path B:** delete + verify the template route doesn't re-import them.

### 6.4 Drizzle schema + queries — `lib/db/queries.ts` + `lib/db/schema.ts` — P0 (Path B only)

The template uses Drizzle ORM; Audric uses Prisma. apps/web's `lib/db/queries.ts` (Drizzle) is **still live** at every chat history call site. **This is a violation of audric monorepo's Prisma-only convention** that has been silently active since Day 1c when the template was vendored.

- Path A: dies with the template chat route in Session 9a.
- Path B: requires a full Drizzle → Prisma port BEFORE Session 6 chat-flip. Day 1 P0 work, ~2 days.

### 6.5 Template provider config — `lib/ai/{models,prompts,providers,entitlements}.ts` + `models.mock.ts` — P1

Wired into `/api/chat/route.ts`. Includes `chatModels` array, template `systemPrompt`, `getLanguageModel`, `entitlementsByUserType`, mock-mode model registry.

**Fix:**
- **Path A:** deletes with `/api/chat/route.ts` in Session 9a.
- **Path B:** audit each file's importers (some are referenced from `(chat)/actions.ts` for title generation — needs to be preserved or rewired). Surgical work.

### 6.6 Template helper code — minor

- `lib/errors.ts:38` — `class ChatbotError extends Error` — class name leaks "Chatbot" into stack traces + Sentry errors. Rename to `AudricError`. P2.
- `lib/utils.ts` — `getTextFromMessage`, `convertToUIMessages`, `fetcher`, etc. — generic; mostly fine. No findings.
- `instrumentation-client.ts:5-7` — references `/api/chat` path; remap to `/api/audric-chat`. P2.

---

## Section 7 — Bucket 6: Documentation + Env

### 7.1 `README.md` — CLEAN

Audric-branded README ("@audric/web-v2", phase status, audric-roadmap links). Not a finding.

### 7.2 `README.template.md` — vendored template upstream README (KEEP)

Template's original README preserved for upstream credits. Not a finding (intentional vendoring discipline).

### 7.3 `.env.example` — CLEAN (light fix needed in copy)

Lines 35-43 reference template features (Vercel Blob, Redis-for-resumable-stream) that may not be needed post-Path-A. Line 30-33's `AI_GATEWAY_API_KEY` comment ("required only once Day 2c wires the gateway() wrapper") is stale since Day 2c shipped.

**Effort:** 10 min cleanup. P3.

---

## Section 8 — Recommended Session 5.5 Shape (Path A)

### 8.1 Minimal-viable Session 5.5 (~½–1 agent day)

1. **Fix root metadata** (`app/layout.tsx:16-20`) — P0 brand leak. 5 min.
2. **Delete Pyodide CDN script** (`app/(chat)/layout.tsx:16-19`) — P1 perf + privacy. 1 min.
3. **Delete stale dev copy** (`sidebar-user-nav.tsx:112-115` + `constants.ts:13`) — P0 dev leak. 5 min.
4. **Verify AudricChatClient is clean** — light audit of `audric-chat-client.tsx` (35k LoC) for any template-residue copy / aria labels / icons. ~½ day.
5. **Update runbook §2.2 + §7.2** — change chat-rewrite target from `web-v2/` to `web-v2/audric-chat`. ~15 min runbook edits.
6. **Decide chat history UX** — recommended: hide (single-conversation surface aligns with audric-chat-client's actual shape). Alternative: ship a v0.7d-deferral signpost matching the `/settings/memory` pattern. 10 min decision + 20 min implementation if signpost.
7. **Quality gates** — `pnpm --filter @audric/web-v2 smoke:b1-b1a` + `typecheck` + `lint`. 5 min.

### 8.2 Session 9a deletion sweep — what folds in (Path A)

When Session 9a runs post-soak, these template files delete in one commit:

| Path | LoC |
|---|---|
| `app/(chat)/page.tsx` | 3 |
| `app/(chat)/layout.tsx` | 58 |
| `app/(chat)/actions.ts` | 83 |
| `app/(chat)/api/chat/route.ts` | ~600 |
| `app/(chat)/api/document/route.ts` | ~? |
| `app/(chat)/api/history/route.ts` | ~? |
| `app/(chat)/api/suggestions/route.ts` | ~? |
| `app/(chat)/api/vote/route.ts` | ~? |
| `app/(chat)/api/files/upload/route.ts` (if exists) | ~? |
| `app/(chat)/chat/[id]/*` | ~? |
| `app/(chat)/opengraph-image.png` + `twitter-image.png` | binary |
| `components/chat/{app-sidebar,sidebar-history,sidebar-history-item,sidebar-user-nav,sidebar-toggle,chat-gate,chat-header,messages,message,message-actions,message-editor,message-reasoning,messages,multimodal-input,preview,preview-attachment,suggested-actions,suggestion,slash-commands,submit-button,toast,toolbar,visibility-selector,shell}.tsx` | ~3500 |
| `components/chat/{artifact,artifact-actions,artifact-close-button,artifact-messages,code-editor,console,create-artifact,data-stream-handler,data-stream-provider,diffview,document,document-preview,document-skeleton,image-editor,sheet-editor,text-editor,weather}.tsx` | ~3000 |
| `components/chat/icons.tsx` | 1050 |
| `components/ai-elements/{model-selector,prompt-input,code-block,suggestion}.tsx` | ~? |
| `lib/ai/{models,prompts,providers,entitlements,models.mock}.ts` + `lib/ai/tools/*` | ~? |
| `lib/db/{queries,schema}.ts` (Drizzle) + `lib/db/migrations/` | ~? |
| `lib/artifacts/*` + `artifacts/*` (4 subfolders) | ~? |
| `lib/errors.ts` | 88 |
| `hooks/{use-active-chat,use-artifact,use-auto-resume,use-chat-visibility,use-messages,use-scroll-to-bottom}.ts` | ~? |

**Estimate: ~10,000+ LoC of template debris deletes in Session 9a.** Big number — but it's the SAME work whether done in 5.5 or 9a. 9a is the right time (after 7d soak validates AudricChatClient at `/audric-chat` is the working surface).

KEEP files (Audric):
- `app/(chat)/api/audric-chat/route.ts` — the audric backend (move OUT of (chat) group to `app/api/audric-chat/route.ts` when (chat)/ deletes)
- `app/audric-chat/{page.tsx,audric-chat-client.tsx}`
- `app/{[username],settings,pay,api/payments,api/portfolio,api/analytics,api/internal,api/transactions,api/contacts,api/identity,api/user}/*`
- `components/{audric,auth,pay,settings,ui}/*`
- `components/ai-elements/{conversation,message,reasoning,shimmer,tool}.tsx`
- `components/theme-provider.tsx`
- `lib/{audric,auth-fetch,env,prisma,portfolio,...}.ts`

### 8.3 Runbook updates needed

- `RUNBOOK_v07c_phase_6_cutover.md` §2.2 line 118: `{ source: '/new', destination: \`${webV2}/\` }` → `{ source: '/new', destination: \`${webV2}/audric-chat\` }`
- §2.2 line 119: `{ source: '/new/:path*', destination: \`${webV2}/:path*\` }` — DELETE (audric-chat doesn't have sub-paths; single-conversation surface)
- §2.2 line 120: `{ source: '/chat/:path*', destination: \`${webV2}/chat/:path*\` }` — DELETE or replace with redirect to `/new` (no multi-conversation routing in audric-chat)
- §6 Smoke catalogue rows C1–C10 (chat flows) — should explicitly state the surface is `/new → web-v2/audric-chat`
- §9 Phase 9a — expand to enumerate the 10k+ LoC template debris listed in §8.2 above

---

## Section 9 — Open questions for founder

1. **Path A vs Path B decision.** Recommended: A.
2. **Chat history UX (Path A).** Hide entirely vs. v0.7d-deferral signpost? Recommended: hide. The memory layer (S.193 + v0.7d MemWal) is the right cross-session continuity primitive, not a chat-history sidebar.
3. **Theme toggle.** Keep light/dark switcher in user dropdown? Recommended: lock to dark-only (matches `audric-design-system` defaults).
4. **OG/Twitter images.** Generate Audric-branded versions vs. delete and let favicon fall back? Recommended: generate (one-time asset work; pays off for every share + every Google search result).
5. **`ChatbotError` rename.** Rename to `AudricError` now (touches every API route's error path) or defer to Session 9a where the file deletes anyway?

---

## Section 10 — Acceptance criteria for Session 5.5 (Path A)

When Session 5.5 ships, the following must hold:

- ☐ `rg -i 'chatbot|next\.js ai|vercel ai|deploy with vercel|chat\.vercel\.ai' apps/web-v2/app apps/web-v2/components/audric apps/web-v2/components/ui apps/web-v2/components/auth apps/web-v2/components/pay apps/web-v2/components/settings apps/web-v2/lib/audric apps/web-v2/lib/{env,portfolio,prisma,...}.ts` returns ZERO matches.
- ☐ `view-source:https://audric-web-v2.vercel.app/audric-chat` shows `<title>Audric` (not "Next.js Chatbot Template").
- ☐ `<meta property="og:title">` + `<meta property="og:description">` + `<meta property="og:url">` all Audric-branded.
- ☐ `<meta name="twitter:title">` + `<meta name="twitter:description">` Audric-branded.
- ☐ Network tab on a fresh chat-page load: NO requests to `cdn.jsdelivr.net/pyodide/*`.
- ☐ User dropdown contains NO "Sign-in is wired in Phase 2." copy path.
- ☐ Runbook §2.2 + §7.2 reflect the relocated chat target (`web-v2/audric-chat`).
- ☐ Quality gates green: `pnpm --filter @audric/web-v2 smoke:b1-b1a` 16/16 + `typecheck` 0 errors + `lint` 0 errors.

---

## Section 11 — Effort estimate summary

| Path | Session 5.5 effort | Total v0.7c effort (5.5 + 6 + 9a folding) | Cutover risk |
|---|---|---|---|
| **A — relocate audric-chat (LEAN)** | ~½–1 agent day | ~½ day (5.5) + founder ops (6) + ~1.5 days (9a sweep with 10k LoC delete) = **~2 days agent + founder ops** | LOW — ships production-verified surface |
| **B — port-into-template (BIG)** | ~5–7 agent days | ~5–7 days (5.5) + founder ops (6) + ~½ day (9a sweep) = **~6–8 days agent + founder ops** | HIGH — never-tested surface; major regression risk on every chat turn |

**Path A is ~3× faster + lower risk + same end state.**

---

## Section 12 — Audit confidence

| Aspect | Confidence | Why |
|---|---|---|
| Template debris file enumeration | HIGH | Direct file reads + rg sweeps; no inference |
| P0 brand leaks (Sections 2.1–2.4, 4.1, 5.1) | HIGH | Verbatim quotes from files |
| Chat-surface architectural ambiguity (Section 0.1) | HIGH | Verified via `/api/chat` vs `/api/audric-chat` route content + `useChat` transport config + page comment ("Phase 6 cutover deletes this page") |
| Path A recommendation | HIGH | Production-verified S.195 happy path was on `/audric-chat`; Path A ships exactly what was tested |
| LoC delete estimates in §8.2 | MEDIUM | File sizes counted; transitive dep counts inferred |
| Founder-acceptable copy rewrites | LOW | Audric voice is a founder judgment — drafts above are starting points, not final |

---

## Appendix A — Files audited (full list)

See Section 1.1 above.

## Appendix B — Cross-references

- `RUNBOOK_v07c_phase_6_cutover.md` §2.2 (chat rewrite plan — needs §8.3 updates if Path A)
- `RUNBOOK_v07c_phase_6_cutover.md` §9 (Session 9a deletion sweep — needs §8.2 enumeration appended if Path A)
- `CLAUDE.md` §Audric Intelligence (the 5-system framing — chat history is NOT one of the 5; memory/AdviceLog supersede it)
- `audric-build-tracker.md` S.188 (Memory deferral signpost pattern — repeatable for chat history if Path A picks signpost UX)
- `audric-build-tracker.md` S.192 (Splash-B + chip-bar — `chip-configs.ts` is the source of truth for Audric prompt suggestions if Path B keeps `SuggestedActions`)
- `audric-build-tracker.md` S.193 (STATIC_SYSTEM_PROMPT — confirms audric-chat backend is the production target)
- `audric-build-tracker.md` S.195 (the production-verified happy path — `audric-chat-client.tsx` was the surface)
- `.cursor/rules/coding-discipline.mdc` (Simplicity First — Path A by this rule)
- `.cursor/rules/goal-driven-execution.mdc` (verifiable goals — §10 acceptance criteria above)
- `.cursor/rules/engineering-principles.mdc` §1 (trace the full path — this audit IS that trace for the chat-surface question)

---

**END OF AUDIT — awaiting founder decision on Path A vs Path B + open questions in §9.**
