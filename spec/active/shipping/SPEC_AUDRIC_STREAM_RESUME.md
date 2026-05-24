# SPEC — Audric Stream Resume (host-side, using `resumable-stream` + `useChat({ resume: true })`)

> **Status:** v0.4 SHIPPING (Phase 1 + 2 + 3 LANDED) · drafted 2026-05-24 (v0.1) · revised 2026-05-24 (v0.2 — major correction after AI SDK doc review) · revised 2026-05-24 (v0.3 — Phase 1 + Phase 2 SHIPPED + feature flag DROPPED) · revised 2026-05-24 (v0.4 — Phase 3 cross-instance abort + telemetry SHIPPED) · author: agent (Opus 4.7)
> **Companion to:** AI SDK Hardening Phase 2 (S.285) — captures the P2.2 deferral as a standalone designable slice
> **Decision gate:** Phase 4 (production soak observation + stale-stop guard) optional. No blocking Qs.
> **Local-only?** No — this SPEC is tracked. `audric-build-tracker.md` references stay founder-local.
> **What changed from v0.3:** Phase 3 shipped end-to-end. New `lib/stream-abort.ts` module provides cross-instance abort signal via Redis pub/sub (`stream:abort:{streamId}` channel + `PSUBSCRIBE` pattern + in-memory dispatch). POST `/api/chat` threads `abortController.signal` into `audricAgent.stream` so stop genuinely cancels the LLM call. Telemetry log lines added at every key point (`[consumeSseStream]`, `[stream-resume] resume_attempt/resume_success/producer_completed_after_disconnect`, `[stream-abort] stop_explicit/aborting`). 6 new vitest tests cover the local dispatch path.
> **What changed from v0.2:** the `AUDRIC_STREAM_RESUME_ENABLED` flag was dropped because the natural gates (`REDIS_URL` presence + `Chat.activeStreamId` column existence) already cover what the flag was protecting. Build script now runs `prisma migrate deploy && next build` on Vercel so the column lands atomically with each deploy. Phase 2 client wiring shipped in the same commit as Phase 1 cleanup.
> **What changed from v0.1:** the v0.1 design was over-engineered — I planned a custom Redis-LIST replay store and a 5-phase plan with a 2hr spike. AI SDK ships first-class support via the `resumable-stream` npm package + `consumeSseStream` callback + `useChat({ resume })` option. v0.2 adopts that pattern. Total sizing drops from ~3 dev days to ~1 day; the spike phase is gone; the in-flight tool detection phase is gone (producer completes naturally on the server via Next.js `after()`).

---

## 1. Problem statement

When a user reloads `audric.ai` mid-chat (page refresh, mobile-tab swap, Vercel cold-start during slow response, network hiccup), the in-flight assistant response is **permanently lost**. The browser disconnects from the SSE stream, the server-side stream is aborted (default `streamText` backpressure cancels the LLM when no consumer remains), and the partial UIMessage state is discarded. The user sees their question hanging in the chat history with no reply.

This is a known, unaddressed UX gap. It blocks:

- **Mobile reliability** — backgrounding the audric tab for >30s often kills the response stream.
- **Slow tool sequences** — multi-step bundles (e.g. payment-intent build + simulate + sign sequence) can take 30–60s; users who tap away come back to "where did it go?".
- **Trust signals** — losing replies undermines the "your money agent always finishes what it started" pillar of Audric Intelligence.

Phase 2 of AI SDK Hardening (S.285) scoped this as P2.2 (stream-resume host wiring) and deferred when pre-flight audit revealed the engine's `StreamCheckpointStore` is dead code on the audric path (audric uses `Experimental_Agent` per D-15, not `AISDKEngine.submitMessage()`). This SPEC captures the corrected design using AI SDK's first-class support.

---

## 2. Architectural context

### 2.1 Why the engine's `StreamCheckpointStore` is the wrong tool

`packages/engine/src/stream-checkpoint.ts` (engine v2.2.0, shipped 2026-05-17) ships a per-stream `EngineEvent[]` log keyed to `AISDKEngine.submitMessage()`. Audric/web-v2 does NOT call `submitMessage` — per BENEFITS_SPEC_v07c §D-15 (the v0.7c chat-flip, shipped 2026-05-20), audric instantiates `Experimental_Agent` from `ai` directly and drives `streamText` via `createUIMessageStream` + writer. The engine's checkpoint store is unused on the audric path (it's still correct for CLI / MCP / engine tests; keep it as-is per §6 Q3).

### 2.2 The AI SDK has a first-class answer for this exact case

`https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams` documents the canonical pattern:

1. **Client** opts in via `useChat({ resume: true })`. On mount, the hook fires a GET to `/api/chat/[id]/stream` to check for an active stream and reconnects if found.
2. **Server POST `/api/chat`** uses `result.toUIMessageStreamResponse({ consumeSseStream })` — the callback receives the outgoing SSE stream and wraps it in a `resumable-stream` producer, persisting the streamId on the chat record.
3. **Server GET `/api/chat/[id]/stream`** reads the chat's `activeStreamId` and calls `streamContext.resumeExistingStream(activeStreamId)` to return the live or buffered output.
4. **Stop button** becomes its own POST `/api/chat/[id]/stop` endpoint because `useChat.stop()` is now a disconnect signal, not a cancel signal — the server stream keeps running until told to stop.

The underlying `resumable-stream` library is a pure pub/sub layer over Redis (Upstash-compatible via the generic adapter); the producer keeps generating chunks via Next.js `after()` even after the original consumer disconnects.

### 2.3 Why this is the right shape

- **Composes natively with `createUIMessageStream` writer pattern** — audric's existing chat route doesn't change shape; the resumable wrapper is one callback parameter on `toUIMessageStreamResponse` (or on `createUIMessageStreamResponse` — audric uses the latter; the integration point is the same).
- **`data-audric-bundle` custom chunks survive byte-level pass-through** — `resumable-stream` operates on `ReadableStream<Uint8Array>`. It doesn't parse or care about chunk semantics. Custom UIMessage parts ride along.
- **HITL flow is orthogonal** — `tool-approval-request` chunks go down the stream; user-confirm comes back via a separate POST (audric's inline-in-route resume that round-trips `attemptId`, see `web-v2-chat-route-architecture.mdc`). Stream resume covers the LLM→client direction only.
- **Engine stays untouched** — its store is correct for CLI/MCP; we layer audric's resume on top of UIMessage chunks where they're emitted.

---

## 3. Recommended approach

Adopt `resumable-stream` + AI SDK's `consumeSseStream` + `useChat({ resume })` end-to-end. Skip the v0.1 "Option 2 host-side custom store" path entirely — the library already IS the host-side custom store, and the AI SDK doc validates this is the supported integration.

```
       ┌────────────────────────────────────────────────────────────────┐
       │ POST /api/chat                                                  │
       │  ── existing route logic generates streamText result ──         │
       │  result.toUIMessageStreamResponse({                              │
       │    consumeSseStream({ stream }) {                                │
       │      const streamId = generateId();                              │
       │      streamContext.createNewResumableStream(streamId, () => …); │
       │      await prisma.chat.update({                                  │
       │        where: { id: chatId },                                    │
       │        data:  { activeStreamId: streamId }                       │
       │      });                                                         │
       │    },                                                            │
       │    onFinish({ messages }) {                                      │
       │      await prisma.chat.update({                                  │
       │        where: { id: chatId },                                    │
       │        data:  { activeStreamId: null, messages }                 │
       │      });                                                         │
       │    },                                                            │
       │  });                                                             │
       └────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (Next.js `after()` keeps producer alive)
       ┌────────────────────────────────────────────────────────────────┐
       │ Upstash Redis (via resumable-stream generic adapter)            │
       │   stream:{streamId}:buffer  →  pub/sub-fed chunk log            │
       │   stream:{streamId}:done    →  flag set on producer completion │
       └────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
       ┌────────────────────────────────────────────────────────────────┐
       │ GET /api/chat/[id]/stream                                        │
       │   const chat = await prisma.chat.findUnique({ where: { id } });  │
       │   if (!chat.activeStreamId) return new Response(null, {status:204});│
       │   return new Response(                                           │
       │     await streamContext.resumeExistingStream(chat.activeStreamId), │
       │     { headers: UI_MESSAGE_STREAM_HEADERS }                       │
       │   );                                                             │
       └────────────────────────────────────────────────────────────────┘

       ┌────────────────────────────────────────────────────────────────┐
       │ POST /api/chat/[id]/stop  (NEW — handles stop button)            │
       │   await markStreamAsStopped(activeStreamId);                     │
       │   await cancelActiveWork(activeStreamId);                        │
       │   await prisma.chat.update({                                     │
       │     where: { id }, data: { activeStreamId: null }                │
       │   });                                                            │
       └────────────────────────────────────────────────────────────────┘
```

Client side:

```ts
// apps/web-v2/components/audric/chat-shell.tsx (sketch — exact shell file TBD)
const { messages, sendMessage, stop, status } = useChat({
  id: chat.id,
  messages: chat.messages,
  resume: true,
  transport: new DefaultChatTransport({
    prepareSendMessagesRequest: ({ id, messages }) => ({
      body: { id, message: messages[messages.length - 1] },
    }),
  }),
});

// Replace `stop()` with the explicit stop endpoint — see §3.4.
const handleStop = useCallback(async () => {
  const lastMessage = messages[messages.length - 1];
  await fetch(`/api/chat/${chat.id}/stop`, {
    method: 'POST',
    body: JSON.stringify({
      assistantMessage: lastMessage?.role === 'assistant' ? lastMessage : undefined,
      activeStreamId: chat.activeStreamId,
    }),
  });
  stop(); // close local SSE; server work is already cancelled by the POST above
}, [chat.id, chat.activeStreamId, messages, stop]);
```

### 3.4 Stop-button reframe (the gotcha I missed in v0.1)

In a resumable-stream setup, **client-side aborts become disconnects, NOT cancels**. The default `useChat.stop()` only closes the local HTTP connection; the server-side producer keeps running until natural completion. To support an explicit "stop" gesture, audric needs:

- A new `POST /api/chat/[id]/stop` endpoint that persists the partial assistant snapshot, cancels the active work (closes the resumable stream + aborts the model request), and clears `activeStreamId`.
- The chat shell calls the stop endpoint BEFORE invoking `useChat.stop()` — the local stop is just for UI snappiness, the server stop is what actually cancels work.
- Per AI SDK doc: don't call the stop endpoint from route cleanup code or unload handlers. Navigation should leave the stream resumable. Only call it on explicit user gesture.

This is genuinely new surface area that v0.1 missed by glossing over Q2 ("conflict-check vs stop button"). The correct answer to Q2 isn't "persist a flag" — it's "ship a dedicated stop endpoint." See §5 Phase 3.

---

## 4. Storage model

Audric already has persistent chats via the Prisma `Chat` model (S.247 LOCK-1). Add one column:

```prisma
model Chat {
  id              String   @id @default(cuid())
  userId          String
  messages        Json
  activeStreamId  String?  // NEW — null when no resumable stream is active
  // ... existing fields
  @@index([userId])
}
```

Migration: single `prisma migrate` to add the nullable column. Existing rows backfill to `null` (correct — no streams in flight at migration time). No data backfill needed.

Redis (Upstash) is the runtime store for the chunks themselves, owned by `resumable-stream`. We don't read or write Redis directly — the library does. Stream chunks expire on the resumable-stream library's TTL (configurable; library default is fine for v1). We can revisit if memory pressure shows up post-deploy.

---

## 5. Phase plan

### Phase 1 — Server-side wiring + stop endpoint ✅ SHIPPED 2026-05-24 (S.287)

- ✅ Install `resumable-stream@2.2.12` in audric/web-v2.
- ✅ Add `activeStreamId String?` to the `Chat` Prisma model + migration file `20260524000000_stream_resume_add_active_stream_id`.
- ✅ `createResumableStreamContext({ waitUntil: after, publisher, subscriber })` in `lib/resumable-stream.ts` using node-redis clients routed through the env gate.
- ✅ `consumeSseStream` callback wired in `apps/web-v2/app/api/chat/route.ts` (sequential awaits eliminate the 3 races caught in the self-audit — see S.287).
- ✅ `apps/web-v2/app/api/chat/[id]/stream/route.ts` GET handler (returns 204 / streams).
- ✅ `apps/web-v2/app/api/chat/[id]/stop/route.ts` POST handler (compare-and-set clear of `activeStreamId`).
- ~~Feature flag~~ → DROPPED (see Phase 1.5).
- ✅ Tests: `lib/resumable-stream.test.ts` (4 tests covering the Redis-URL gate + memoisation matrix).

### Phase 1.5 — Drop the feature flag ✅ SHIPPED 2026-05-24 (folded into Phase 2 commit)

- ✅ Remove `AUDRIC_STREAM_RESUME_ENABLED` from `lib/env.ts`.
- ✅ Strip the flag check from `lib/resumable-stream.ts` (now just gates on `REDIS_URL`).
- ✅ Add `prisma migrate deploy && next build` to web-v2 build script so the column always lands before code touches it on every Vercel deploy.
- Rationale: the flag was protecting against (a) Redis being unconfigured and (b) the column not existing yet. (a) is already covered by the `REDIS_URL` presence check in `getResumableStreamContext`. (b) is now structurally impossible because the build script runs the migration before any code that touches the column. A third gate was complexity without preventing any failure mode.

### Phase 2 — Client-side enablement + stop button ✅ SHIPPED 2026-05-24

- ✅ `useChat({ resume: true })` in `app/chat/audric-chat-client.tsx` (the `AudricChatPanel` inner component, line 497 — the chat shell file was `audric-chat-client.tsx`, not `components/audric/chat-shell.tsx` as v0.2 guessed).
- ✅ Replaced the disabled-Send button with a real Stop button (visible only when `status === "streaming" | "submitted"`) — toggles via the existing `isStreaming` flag.
- ✅ `handleStop` callback calls `useChat.stop()` (local disconnect) + `fetch("/api/chat/[id]/stop", { method: "POST" })` (server-side `activeStreamId` clear).
- Deferred to Phase 3: passing `chat.activeStreamId` from server-rendered chat data into the shell for the stale-stop guard. Phase 2 skips the guard (the route's JSDoc documents this is the conservative default — without it, a double-tap could race a new turn; not a correctness bug, just a minor UX glitch).

### Phase 3 — Cross-instance abort + telemetry ✅ SHIPPED 2026-05-24 (S.289)

- ✅ `lib/stream-abort.ts` (NEW): `subscribeToAbort` + `publishAbort` backed by Redis pub/sub on `stream:abort:{streamId}` channel. One `PSUBSCRIBE stream:abort:*` per warm instance + in-memory dispatch `Map<streamId, handler>`. Memoised init + subscribe Promise so concurrent callers can't double-subscribe.
- ✅ POST `/api/chat`: passes `abortController.signal` to `audricAgent.stream({ abortSignal })`. The same controller's signal was already in ToolContext for tools — one controller, both LLM AND tools cancel on stop.
- ✅ consumeSseStream registers the abort handler after both Redis sentinel + DB write succeed. Order matters: by the time `activeStreamId` is readable from DB, the dispatch table on this instance has the handler. Stop fan-out from another instance arrives via the pattern subscription.
- ✅ onFinish tears down the subscription on natural completion + logs `[stream-resume] producer_completed_after_disconnect=ok` (the win metric).
- ✅ POST `/api/chat/[id]/stop`: `publishAbort(currentActiveStreamId)` fans out to all instances. Receiver count logged.
- ✅ GET `/api/chat/[id]/stream`: `[stream-resume] resume_attempt` + `resume_success` telemetry log lines.
- ✅ `[consumeSseStream] streamId=X chatId=Y` proof log added so production logs can definitively answer "did the resumable producer actually start" without inferring from 204s downstream.
- ✅ Tests: 6 new vitest tests in `lib/stream-abort.test.ts` covering the local dispatch path (handler register/fire/isolate/cleanup, exception swallowing, late-publish safety).
- Phase 3 telemetry hooks into `console.info` + Vercel log aggregation rather than a separate metric pipeline. Sufficient for the SPEC's "did the feature work?" question; can promote to a dedicated metric pipeline later if signal quality demands.

### Phase 4 — Production soak observation + stale-stop guard (optional, pending)

- **Stale-stop guard**: surface `chat.activeStreamId` to the chat shell via server-rendered chat page data so the stop POST body can carry it. Closes a minor double-tap UX race (Phase 3 stop sends empty body; the route's compare-and-set guard handles the common case correctly but a rare double-tap could clear a newly auto-fired turn's id).
- **48h prod soak**: monitor the new telemetry log lines on Vercel. Confirm `[consumeSseStream]` fires on every successful turn, `resume_success` fires when real reload-mid-stream happens, `stop_explicit` correlates with actual user gestures.
- **Token cost validation**: pull Anthropic API spend before/after Phase 3 to confirm stop genuinely cuts cost (the SPEC's biggest user-invisible win).
- If clean: promote SPEC to `spec/archive/v07e/` (engine version stays where it is — this is host-only).

---

## 6. Open questions — all resolved

| # | Question | Resolution |
|---|---|---|
| Q1 | Is the chat-shell file `components/audric/chat-shell.tsx` or something else? | RESOLVED at Phase 2 — it's `app/chat/audric-chat-client.tsx` (the `AudricChatPanel` inner component). |
| Q2 | Stream resumption changes `stop()` semantics. Ship the dedicated stop endpoint in Phase 1, or as fast-follow? | RESOLVED in Phase 1 — endpoint shipped in S.287 alongside the resume wire. |
| Q3 | Should the engine's `StreamCheckpointStore` be removed since audric won't use it? | NO — keep it. CLI / MCP / engine tests use it; removing it churns a published `@t2000/engine` API for zero audric benefit. |
| Q4 | Why the `AUDRIC_STREAM_RESUME_ENABLED` feature flag? | RESOLVED — dropped in v0.3. The `REDIS_URL` presence check + `prisma migrate deploy` in the build script already provide the natural gates; the flag was complexity without a corresponding failure mode it prevented.

(v0.1 had a Phase 0 spike — DROPPED, the AI SDK doc validates the integration. Q3 TTL — DROPPED, the library handles it. Q3 per-IP vs per-user — DROPPED, the chat-id-keyed model uses zkLogin user implicitly via the existing chat ACL. Q4 replay UX feel — DROPPED, the producer-keeps-running model means replay IS live, not synthetic-fast-replay.)

---

## 7. Cross-references

- **AI SDK docs (the canonical reference)** → `https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams`
- **`resumable-stream` package** → `https://www.npmjs.com/package/resumable-stream` (npm), `https://github.com/vercel/resumable-stream` (repo)
- **Engine checkpoint store** → `packages/engine/src/stream-checkpoint.ts` (kept as-is per Q3)
- **Audric chat route** → `apps/web-v2/app/api/chat/route.ts` (POST handler gets `consumeSseStream` wiring)
- **AI SDK Hardening Phase 2 ship** → S.285 in `audric-build-tracker.md` (P2.2 deferral entry)
- **D-15 architecture lock** → `audric/.cursor/rules/web-v2-chat-route-architecture.mdc`
- **Chat persistence (Prisma Chat model)** → S.247 LOCK-1; schema in `apps/web-v2/prisma/schema.prisma`
- **Upstash client** → already provisioned via `env.REDIS_URL`; `resumable-stream/generic` adapter takes a `publisher` + `subscriber` shape, wire on top of the existing client

---

## 8. What's banned (don't slip these into implementation)

- **Calling the stop endpoint on route cleanup / unload handlers** — per AI SDK doc, navigation is a disconnect (should remain resumable). Only call stop on explicit user gesture.
- **Cross-account resume** — the GET /stream route MUST verify the requesting user owns the chat (zkLogin session check against `Chat.userId`). Resumable-stream library doesn't authenticate; that's the host's job.
- **Auto-reconnect after explicit stop** — per AI SDK doc: "After a user stops a stream, avoid automatic reconnect attempts for that chat until the user sends another message or explicitly retries." Implementation: the stop endpoint clears `activeStreamId`, so the next mount's GET returns 204 → no reconnect.
- **Confusing pending_action HITL resume with stream resume** — they're separate. pending_action / tool-approval-request HITL is the existing inline-in-route resume that round-trips `attemptId` through user-confirm. Stream resume is for client disconnect / reconnect during a single producer's lifetime. Both can coexist; neither replaces the other.
- **Logging chunk payloads to Sentry / Datadog** — replay logs may contain PII (memo text, recipient names, swap details). Telemetry counts events; never logs the chunks themselves.

---

## 9. Sizing estimate

- Phase 1: ~1 day (server-side wiring + 3 new routes + Prisma migration + tests)
- Phase 2: ~½ day (client opt-in + stop rewire)
- Phase 3: ~½ day (telemetry + production flag-flip + soak)
- **Total: ~2 dev days end-to-end**, ships behind a flag from day 1.

(v0.1 estimated ~3 dev days across 5 phases. v0.2 drops to ~2 days because Phase 0 spike + Phase 3 in-flight-detection from v0.1 are unnecessary.)

---

## 10. Promotion criteria

- `spec/active/` → `spec/active/shipping/` after Phase 1 ships (route changes land + Prisma migration runs on prod). This becomes tracked git history at that point per the `spec/active/*` gitignore policy.
- `spec/active/shipping/` → `spec/archive/` after Phase 3 completes (production flag-flip + 48h clean soak).

---

## 11. Revision history

- **v0.1 (2026-05-24 ~09:50 AEST)** — initial draft. Posited 3 options (resurrect submitMessage / custom host store / `@vercel/resumable-stream`). Recommended a 2hr spike on Option 3.
- **v0.2 (2026-05-24 ~10:10 AEST)** — major revision after AI SDK doc review surfaced first-class support I'd missed. The library is `resumable-stream` (not `@vercel/`), the AI SDK ships a `consumeSseStream` callback + `useChat({ resume })` option that wire the integration natively, and the stop-button reframe is a hard requirement of the model (client-side `stop()` becomes a disconnect; explicit stop needs its own endpoint). Phase 0 spike + Phase 3 (Path B) dropped. 6 founder Qs → 3. Total sizing 3d → 2d.
