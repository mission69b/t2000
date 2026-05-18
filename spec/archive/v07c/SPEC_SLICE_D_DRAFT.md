# Slice D Scoping — `pending_action` ↔ AI SDK v6 native HITL

> **Status:** scoping draft, 2026-05-18. Re-read before any Slice D implementation work.
>
> **TL;DR:** Slice D as scoped in `V07B_ROADMAP_DRAFT.md` §3 (D-1) is **not viable as a v0.7b standalone item.** The AI SDK v6 HITL primitive (`needsApproval: true`) is built for server-executed tools; our writes are client-executed (zkLogin sponsored tx) and need the alternative AI SDK v6 client-side-tool primitive (`addToolOutput`), which in turn requires adopting `useChat` from `@ai-sdk/react` — which is Slice B's whole scope. **D is downstream of B, not independent of it.** Plus the audric blast radius is 35-45 production files / ~4k-7k LOC (measured) — not a 1-week patch. Recommend dropping D-1 from v0.7b, slotting actual Slice D into v0.7c (chatbot template fork), and replacing it with a smaller v0.7b cosmetic alignment item (D-6).

---

## 1. What we carry today — the load-bearing PendingAction surface

Our current engine event (from `packages/engine/src/types.ts:504-698`):

| # | Field | Purpose | Load-bearing? |
|---|---|---|---|
| 1 | `toolName` | which write | ✅ |
| 2 | `toolUseId` | engine tool-use id | ✅ |
| 3 | `input` | tool input | ✅ |
| 4 | `description` | user-facing summary in confirm card | ✅ |
| 5 | `assistantContent` | full LLM assistant message for resume continuation | ✅ |
| 6 | `completedResults` | parallel auto-tool results from same turn | ✅ |
| 7 | `guardInjections` | hint/warning bubbles from 14 guards | ✅ |
| 8 | `modifiableFields` | user-editable fields before approval | ✅ |
| 9 | `turnIndex` | monotonic turn counter for TurnMetrics row keying | ✅ |
| 10 | `attemptId` | per-yield UUID v4, TurnMetrics single-row `updateMany` key | ✅ |
| 11 | `cetusRoute` | Cetus route fast-path (saves 400-500ms re-discovery) | ✅ |
| 12 | `steps[]` | multi-write Payment Intent bundle | ✅ |
| 13 | `quoteAge` + `canRegenerate` + `regenerateInput` | refresh-quote affordance | ✅ |
| 14 | `borrowApyBps` | live borrow APY for confirm card | ✅ |
| 15 | `currentHF` + `projectedHF` | HF projection in confirm card | ✅ |

Plus the `PermissionResponse` resume contract (`packages/engine/src/types.ts:708-729`):

```typescript
interface PermissionResponse {
  approved: boolean;
  executionResult?: unknown;        // single-write: { txDigest, balanceChanges, walletAddress }
  stepResults?: Array<{             // bundle: per-step results
    toolUseId: string;
    attemptId: string;
    result: unknown;
    isError: boolean;
  }>;
}
```

Note: **`executionResult` is provided BY THE CLIENT** (audric runs the sponsored tx; the engine never has the signing key). This is the fundamental shape of our zkLogin model.

---

## 2. AI SDK v6 primitives we considered

Two relevant primitives shipped in `ai@6.x` (per PR [vercel/ai#8541](https://github.com/vercel/ai/pull/8541) and the [HITL cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop)):

### 2a. Tool execution approval (`needsApproval: true`)

```typescript
tool({
  description: 'process payment',
  inputSchema: z.object({ amount: z.number(), recipient: z.string() }),
  needsApproval: true,                                // ← the HITL flag
  execute: async ({ amount, recipient }) => {        // ← required: server runs this
    return `Payment of $${amount} to ${recipient} processed.`;
  },
});
```

Streamed parts:

```typescript
type ToolApprovalRequest = {                          // assistant message part
  type: 'tool-approval-request';
  approvalId: string;
  toolCallId: string;
};

type ToolApprovalResponse = {                         // tool message part
  type: 'tool-approval-response';
  approvalId: string;
  approved: boolean;
  reason?: string;                                    // free-text only
};

type ToolApprovalRequestOutput<TOOLS> = {             // UI rendering part
  type: 'tool-approval-request';
  approvalId: string;
  toolCall: TypedToolCall<TOOLS>;
};
```

UI states: `approval-requested` → `approval-responded` → (server runs `execute`) → `output-available` | `output-denied`.

### 2b. Client-side tools (no `execute`)

```typescript
tool({
  description: 'get user location',
  inputSchema: z.object({}),
  // no execute! → AI SDK forwards the tool call to the client
});
```

Client handles via `onToolCall` + `addToolOutput`:

```typescript
const { messages, addToolOutput } = useChat({
  async onToolCall({ toolCall }) {
    if (toolCall.toolName === 'getLocation') {
      const pos = await navigator.geolocation.getCurrentPosition(...);
      addToolOutput({ toolCallId: toolCall.toolCallId, output: { lat, lng } });
    }
  },
});
```

---

## 3. Why `needsApproval` doesn't fit our model

The AI SDK v6 docs are explicit:

> "Tool execution approval lets you require user confirmation before a **server-side** tool runs. Unlike client-side tools that execute in the browser, tools with approval still execute on the server—but only after the user approves."
>
> "For tools that need to run in the browser (updating UI state, accessing browser APIs), use **client-side tools** instead."

In our model:

- The signing key lives in the **browser** (zkLogin ephemeral keypair stored client-side).
- The transaction is **sponsored by Enoki** and signed **client-side**.
- The `txDigest` comes back from the **client** after broadcast.
- The result we need (`{ txDigest, balanceChanges, walletAddress }`) **cannot be produced server-side** because the server has no key.

`needsApproval`'s execution path (verified in the PR source — `executeToolCall({ toolCall: toolApproval.toolCall, tools, ... })`) assumes the server runs `execute` after approval. There is NO escape hatch for "client provides the result" — searched the PR for `injectResult` / `onToolApproval` / `clientExecuted` / experimental hooks: none exist.

So `needsApproval` is the wrong primitive for our writes.

---

## 4. Why client-side tools DO fit (with one big caveat)

A client-side tool (no `execute`) maps onto our zkLogin sponsored-tx flow cleanly:

| Our step | Client-side tool equivalent |
|---|---|
| LLM calls write tool | Model emits tool-call part (no server execute) |
| Engine emits `pending_action` | AI SDK emits standard tool-call part with `input` |
| Audric renders confirm card from rich metadata | Audric's `useChat` `onToolCall` handler renders card |
| User approves + audric runs sponsored tx | `onToolCall` awaits user input, then runs sponsored tx |
| Audric POSTs `/api/engine/resume` with `{ txDigest, balanceChanges }` | `addToolOutput({ toolCallId, output: { txDigest, balanceChanges } })` |
| Engine continues LLM loop with the result | AI SDK threads result into next stream automatically |

The shapes line up. The semantics line up. The only thing AI SDK doesn't carry natively is the **rich metadata** (description, modifiableFields, cetusRoute, steps[], etc.) — but that can ride in the tool `input` itself OR in `experimental_providerMetadata` (an existing v6 escape hatch).

### The caveat — `useChat` + `UIMessageStreamResponse`

Client-side tools + `onToolCall` + `addToolOutput` only work when the host uses `useChat` from `@ai-sdk/react` against an endpoint that returns `result.toUIMessageStreamResponse()`. That's the AI SDK v6 UI protocol — `UIMessage` parts streamed over a specific SSE format.

**Audric today is on a custom SSE format** (`EngineEvent` + `serializeSSE` from `@t2000/engine`) with a hand-rolled message renderer (`BlockRouter`). Migrating to `useChat` + UIMessage parts is exactly **Slice B's scope.**

---

## 5. Audric blast radius (measured 2026-05-18)

Inventoried via repo-wide explore of `/Users/funkii/dev/audric/apps/web` against `PendingAction` / `pending_action` / `PermissionResponse` references.

### Coupled surface area

- **35-45 production files** touch the PendingAction surface
- **15+ test files** validate it
- **~4k-7k LOC** of coupled code across routes, hooks, timeline, components, metrics, and persistence

### Cross-cutting consumers (the migration list)

| Layer | Files | What changes under full Slice D |
|---|---|---|
| **3 API routes** | `app/api/engine/chat/route.ts`, `app/api/engine/resume/route.ts`, `app/api/engine/regenerate/route.ts` | Chat route currently emits via custom SSE (`serializeSSE` from `@t2000/engine`); would need to emit AI SDK UIMessage stream parts. Resume route currently calls `engine.resumeWithToolResult(action, permissionResponse)`; would fold into `addToolOutput` round-trip OR stay as sidecar for post-write narration. Regenerate route currently calls `regenerateBundle` keyed on `attemptId`; would re-key on AI SDK `approvalId` if we adopt the rename. |
| **3 hooks** | `hooks/useEngine.ts` (~1690 LoC, the main chat orchestrator + SSE parser + resume POST + regenerate POST), `hooks/useAgent.ts` (sponsored-tx wrapper), `hooks/executeToolAction.ts` (per-tool execution + bundle assembly) | `useEngine` would be replaced wholesale by `useChat` from `@ai-sdk/react`. The custom SSE parser + `resolveAction` + `handleRegenerate` all collapse into AI SDK's `addToolOutput` semantics. `useAgent` and `executeToolAction` move into a `onToolCall` async handler. |
| **Confirm-card + timeline UI** | `PermissionCard.tsx` (~470 LoC bundle branch + ~200 LoC single-write branch), `preview-bodies/index.tsx`, `PermissionCardBlockView.tsx`, `BlockRouter.tsx`, `UnifiedTimeline.tsx`, `PlanStreamBlockView.tsx`, `BundleReceiptBlockView.tsx`, `ChatMessage.tsx`, `ReasoningTimeline.tsx` | Modifiable-fields editor, guard-injections row, quote-age timer, regenerate button, bundle step list, HF projection row — all keyed on the 12-field PendingAction. Migrating to AI SDK's `tool-call` part means either threading these via `experimental_providerMetadata` or rebuilding the renderer to read from the engine's still-custom side-channel event. |
| **Session persistence** | `lib/engine/upstash-session-store.ts` serializes `SessionData.pendingAction: PendingAction` to Redis as full object | Any field rename (`attemptId` → `approvalId`) = active-session data migration OR dual-read compat shim. |
| **Telemetry** | `lib/engine/harness-metrics.ts` `TurnMetricsCollector.onPendingAction(attemptId, cetusRoute)` | Wired to `attemptId` everywhere; full Prisma column rename or dual-key pattern. |
| **TurnMetrics Prisma queries** | Chat-route `prisma.turnMetrics.create({ data: { ..., attemptId } })`, Resume-route `prisma.turnMetrics.updateMany({ where: { attemptId } })`, Regenerate-route `updateMany({ where: { attemptId } })` | All three keyed on `attemptId`; either rename column + dual-shim or live with the legacy name forever. |
| **Bundle (steps[]) consumers** | `lib/engine/fast-path-bundle.ts`, `lib/engine/permission-tiers-client.ts` (auto-approve check loops `steps[]`), `app/new/dashboard-content.tsx` `handleExecuteBundle`, executeBundleAction (~100 LoC for bundle assembly) | AI SDK has no native "atomic bundle with cross-step coin handles." Need to model `steps[]` as N parallel tool calls + 1 atomic Sui PTB assembled in `onToolCall`. See §9 OQ #1. |
| **Quote-refresh** | `useEngine.handleRegenerate` (POST `/api/engine/regenerate`), `PermissionCard.tsx` `quoteAge` timer + regenerate button | No AI SDK native concept. Stays a custom POST endpoint or rides on a sidecar event. |

### Critical findings from the audit

1. **`PermissionResponse` is not imported as a type in audric.** Audric builds `{ approved, executionResult? } | { approved, stepResults? }` literally and passes it to `engine.resumeWithToolResult`. So `PermissionResponse` type changes are decoupled — but the literal shape audric constructs must match whatever the engine accepts.
2. **`txDigest` is NOT a top-level resume field.** It's embedded inside `executionResult.tx` (single-write) or `stepResults[i].result.tx` (bundle). Resume receives an opaque `unknown` payload that audric structures internally. This means AI SDK's `addToolOutput({ output: <typed-T> })` would need T = our existing `executionResult.data` shape — surprisingly compatible at the call site, but the typing on the engine `tool()` definition becomes load-bearing.
3. **`balanceChanges` are not sent to resume.** They're consumed CLIENT-SIDE BEFORE resume (to derive accurate `amount` fields in `executionResult.data`). Slice D doesn't affect this — `balanceChanges` stay client-only.
4. **Session persistence stores the full `PendingAction`** in Redis. Any field rename forces an active-session migration window OR dual-shape rehydration.

### Verdict

**Size: multi-sprint refactor.** This is not a 3-day patch and not a 1-week patch. Closer to **3-6 weeks of audric refactor** if AI SDK v6 wire-event enum, resume body shape, and persisted `SessionData.pendingAction` all change in lockstep. Smaller (~1 week) if the migration is purely a **host-side adapter** that materializes an internal `PendingAction` identical to today's — but that's a cosmetic alignment with no real "platform-alignment win" (which is the explicit value claim for D-1).

The "real platform-alignment win" framing in V07B §3 requires the full refactor (replacing `useEngine` with `useChat`, replacing custom SSE with `UIMessageStreamResponse`, deleting the resume route as a dedicated path, etc.). That's exactly v0.7c chatbot template fork's scope — confirming Slice D is v0.7c-class.

---

## 6. Coupling matrix

```
            Slice D (this)
                 │
                 ▼
            Slice B (UIMessage / useChat) ← Audric must commit to this first
                 │
                 ▼
            v0.7c chatbot template fork ← Slice B naturally rides this
```

Slice D depends on Slice B. Slice B is gated on "Audric commits to UIMessage protocol" (per V07B §2). That commitment is most naturally made at the start of v0.7c (when the chatbot template fork lands and brings `useChat` with it).

Conclusion: **Slice D is v0.7c-class, not v0.7b-class.** Trying to do D in v0.7b would either:

- (a) Force Slice B early as a prerequisite (no — B is also v0.7c-class for the same reason), OR
- (b) Build a "client-side tool" workaround that ALSO carries our custom `pending_action` event in parallel (cosmetic only, no real alignment win, wasted code that gets deleted at v0.7c).

Both options defeat the stated benefit ("real platform-alignment win" per V07B §3).

---

## 7. Recommended v0.7b alternative — D-6 "AI SDK shape alignment (prep)"

What we CAN ship as v0.7b (engine-only, no audric coupling):

| Item | Effort | Benefit |
|---|---|---|
| **D-6.1** Add `approvalId` as an alias for `attemptId` on PendingAction (carry both; audric can read either) | ~1h | Future-proofs the terminology migration; lets v0.7c use AI SDK's `approvalId` naming without breaking pre-v0.7c hosts |
| **D-6.2** Rename `pending_action` event to `pending-action` in `EngineEvent` discriminated union (kebab-case to match AI SDK part naming) | ~30 min + downstream sweep | Marginal; consider whether the breaking change is worth it |
| **D-6.3** Document the impedance mismatch in `packages/engine/README.md` + `.cursor/rules/agent-harness-spec.mdc` so future contributors don't try Slice D again without reading this scoping doc first | ~30 min | Prevents repeated rediscovery |
| **D-6.4** Add an `experimental_aiSdkCompat: true` mode to PendingAction emission that wraps the rich metadata under `experimental_providerMetadata` instead of top-level fields | ~3-5h | Lets a brave host (or v0.7c) consume PendingAction via AI SDK's `experimental_providerMetadata` channel as a stepping stone toward full migration |

**Total D-6 scope:** ~half a day (excluding D-6.4 which is ~3-5h) for cosmetic alignments that don't change behavior but reduce the future v0.7c migration cost.

**Honest take:** even D-6 is marginal. The headline finding is the actual value of this scoping work — knowing NOT to spend a week on D-1 because the prerequisite isn't in place.

---

## 8. What this means for V07B_ROADMAP_DRAFT.md

Three updates needed:

1. **§3 D-1 row** — change effort estimate from "~1 week" to "v0.7c-class (requires Slice B)" and mark the "real platform-alignment win" claim as VERIFIED PENDING B+D as a paired migration.
2. **§3 D-3 row** — promote Slice B from "Gated on audric committing to Vercel chat UIMessage protocol" to "Gated on v0.7c chatbot template fork." It's the same decision now.
3. **§4 decision matrix** — replace the "Founder wants platform-alignment win | D-1 Slice D" row with "Founder wants platform-alignment win | D-6 (lightweight cosmetic prep) OR wait for v0.7c." Add a D-6 row to §3.

---

## 9. Open questions for v0.7c when D + B run together

These are NOT today's problem but capture them so v0.7c doesn't re-derive:

1. **Atomic bundle execution** — our `steps[]` shape carries `inputCoinFromStep` cross-step coin handles for atomic Payment Intent. AI SDK v6 supports parallel tool calls but no native atomic bundle. Solution likely: emit N independent client-side tool calls, audric's `onToolCall` handler queues them, builds ONE atomic Sui PTB, calls `addToolOutput` N times with the per-step results. Verify this round-trips through AI SDK's `Chat` state without ordering issues.
2. **`completedResults` (parallel auto-tool reads in the same turn)** — AI SDK's `useChat` already handles parallel tool calls natively, so this folds away.
3. **`guardInjections`** — engine emits these BEFORE the tool-call (today they're embedded in PendingAction). With AI SDK transport, they need to ride as a separate `data` part or in `experimental_providerMetadata` on the tool-call.
4. **`turnIndex` for TurnMetrics keying** — AI SDK's `Message` has `id` but no ordinal counter. Audric continues to count from `messages.length` (cheap).
5. **`cetusRoute` + `borrowApyBps` + `currentHF` + `projectedHF` + `modifiableFields` + `description`** — all extension fields, all need an `experimental_providerMetadata` channel.
6. **Resume route** — `/api/engine/resume` either folds into the `addToolOutput` round-trip (cleaner) or stays as a sidecar for post-write narration prompts (today's `isPostWriteResume` path). Pick one.

---

## 10. Effort estimate revision

| Originally | Now |
|---|---|
| D-1 Slice D — ~1 week, v0.7b | **D-1 is v0.7c-class**, requires Slice B as prerequisite; estimate alongside chatbot template fork as a coupled migration |
| — | **D-6 cosmetic prep** — ~half a day v0.7b, optional |

**Verifiable goal for THIS scoping doc:** writing this doc was the verify step. We now have a concrete recommendation backed by primary-source AI SDK type definitions, AI SDK docs verbatim quotes, and our engine's 12-field PendingAction inventory. The 1-week of work we would have spent on D-1 is saved. The honest v0.7b pick is now any of {Phase 7 design scoping, D-4 TurnMetrics column, D-6 cosmetic prep, audric S.152 polish}.

---

## 11. Cross-references

- AI SDK v6 HITL cookbook → https://ai-sdk.dev/cookbook/next/human-in-the-loop
- AI SDK v6 client-side tools docs → https://ai-sdk.dev/v7/docs/ai-sdk-ui/chatbot-tool-usage
- AI SDK v6 PR introducing `ToolApprovalRequest` → https://github.com/vercel/ai/pull/8541
- Engine PendingAction definition → `packages/engine/src/types.ts:504-698`
- Engine PermissionResponse definition → `packages/engine/src/types.ts:708-729`
- Audric resume route (today's path) → `audric/apps/web/app/api/engine/resume/route.ts`
- V0.7b roadmap → `V07B_ROADMAP_DRAFT.md`
