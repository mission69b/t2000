# Vercel Logs Triage — 12h window ending 2026-05-07 ~12:01 UTC+10

Companion to `spec/vercel_logs.md` (273 KB, 6,418 lines). Source dump pulled by founder. This doc classifies every distinct error/warning signature and recommends actions.

**Method.** Pattern enumeration via `rg`, counted occurrences, grouped by route + by status code, traced timestamps to deploys, sampled stack traces, cross-referenced source code where a fix is needed.

---

## TL;DR — top-line numbers

- **590 timestamped log entries** spanning **2026-05-07 00:00 → 12:01 UTC+10** (12h).
- **872 successful 200s vs 73 actual error responses** (44 × 502 + 19 × 503 + 8 × 401 + 1 × 504 + 1 × 500 + 1 × 405).
- **Most stderr noise (>1,000 lines) accompanies 200 responses.** Retries + caching absorb the underlying transient failures; the user-visible result is success. **High noise volume ≠ user impact.**
- **The actual user-impact bug surface is concentrated in ONE route**: `/api/identity/reserve` (62 of 73 errors = 85%). Username claim flow during onboarding.

---

## Triage table — all 14 distinct signatures

| ID | Pattern | Count | HTTP | User impact | Verdict | Fix priority |
|---|---|---|---|---|---|---|
| **L1** | `[reserve] signAndExecuteTransaction failed: Unexpected status code: 429` | 34 | 502 | **Username claim fails** | 🔴 BUG — no retry on Sui RPC 429 | **P1 (pre-launch)** |
| **L2** | `[reserve] signAndExecuteTransaction failed: ...Transaction needs to be rebuilt because object X version Y is unavailable...` | 7 | 502 | **Username claim fails** | 🔴 BUG — shared-object contention, no retry | **P1 (pre-launch)** |
| **L3** | `[reserve] signAndExecuteTransaction failed: ...Object already locked by a different transaction...` | 2 | 502 | **Username claim fails** | 🔴 BUG — same root cause as L2 | covered by L2 fix |
| **L4** | `[reserve] SuiNS pre-mint check failed: HTTP 429` | 18 | 503 | **Username claim fails** | 🔴 BUG — no retry on SuiNS 429 | **P1 (pre-launch)** |
| **L5** | `[sponsor] Enoki error (401): {"code":"jwt_error","message":"no applicable key found in the JSON Web Key Set"}` | 8 | 401 | **Save/send/swap fails** | 🟡 BUG — same class as S18-F2 but in **prepare** route, different Enoki code | **P1 — extend S18-F2 fix** |
| **L6** | `[contact-backfill] reverse-SuiNS failed: ...Name has expired` | 147 | 200 | None (UI degraded, no error shown) | 🟡 NOISE — ONE address, repeated | **P2 (post-demo)** — negative cache the address |
| **L7** | `[contact-backfill] reverse-SuiNS failed: HTTP 429` | 8 | 200 | None | 🟢 BENIGN | none |
| **L8** | `[/<username>] SuiNS lookup failed: HTTP 429` (esp. `/adeniyi` × 77) | ~110 | 200 | Page renders without SuiNS metadata | 🟡 NOISE — public profile pages, mostly ONE handle | **P2 (post-demo)** — server-side cache resolution for ≥60s |
| **L9** | `[blockvision-prices] sui rpc coin fetch failed: 429` | 45 | 200 | None — degrades to stable allow-list | 🟢 BENIGN — SPEC blockvision-resilience handled it | none |
| **L10** | `[blockvision-prices] portfolio HTTP 429, degrading` | 27 | 200 | None — sticky-positive cache returns stale data | 🟢 BENIGN — by design | none |
| **L11** | `[defi] (aftermath\|scallop\|suilend\|cetus\|walrus\|haedal\|bluefin\|suins-staking\|suistake) HTTP 429` | 330 | 200 | None — financial-context-snapshot cron tolerates partial | 🟡 NOISE — DefiLlama burst | **P3 (post-demo)** — sequence the parallel fetches at ~200ms intervals |
| **L12** | `[T2000Error] NAVI getPositions failed: 429` | 36 | 200 | NAVI position widget shows empty | 🟡 NOISE — same NAVI 429 cluster, retries absorb | covered by L11 fix |
| **L13** | `[activity] Error: PrismaClientKnownRequestError P2022 column "(not available)"` | 4 | 200 | None — fallback returns empty list | 🟢 FALSE POSITIVE — deploy race | none |
| **L14** | `[engine/chat] conversation log failed: PrismaClientKnownRequestError P2028 Transaction already closed` | 2 | 200 | None — chat completes, log row missed | 🟢 BENIGN — known Prisma transaction race | **P3 (post-demo)** — wrap in fire-and-forget |
| **N1** | `[AbortError] [defi] scallop\|cetus fetch threw` | 83 | 200 | None | 🟢 BENIGN — overlap with L11 (timeout race) | covered by L11 fix |
| **N2** | `[Error: read ECONNRESET]` (5 in 30s) | 16 | 200 | None — retry absorbs | 🟢 BENIGN | none |
| **N3** | `[HeadersTimeoutError]` (cluster at 01:45) | 7 | 200 | None — retry absorbs | 🟢 BENIGN | none |
| **N4** | `(node:4) [DEP0169] DeprecationWarning: url.parse()` | 21 | n/a | None — Node deprecation in upstream dep | 🟢 BENIGN | none |
| **N5** | `[reserve] SuiNS pre-mint check failed: Name has expired` | 0 (covered in L4 family but reported separately) | 503 | edge case | 🟢 N/A | none |

**Legend:** 🔴 user-impacting bug · 🟡 noise but worth addressing · 🟢 benign / false positive

---

## Critical findings

### 🔴 #1 — `/api/identity/reserve` is the production-blocking surface

**62 of 73 actual error responses (85%) hit this one route.** Username claim is the FIRST thing every new user does — if it fails, they bounce.

The route has THREE retry-able failures with NO retry logic:

#### L1 — Sui RPC 429 during `signAndExecuteTransaction` (34 occurrences)

```typescript
// audric/apps/web/app/api/identity/reserve/route.ts:247-264
let txDigest: string;
try {
  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  // ...
  txDigest = result.digest;
} catch (err) {
  const message = err instanceof Error ? err.message : 'Mint execution failed';
  console.error('[reserve] signAndExecuteTransaction failed:', message);
  return errorResponse(`Failed to mint leaf: ${message}`, 502);  // ← NO RETRY
}
```

Sui RPC 429s are very transient (sub-second). One retry with 500ms backoff would absorb almost all of L1.

#### L2/L3 — Shared-object contention on the audric registry (9 occurrences combined)

The audric username registry is a single Sui shared object (`0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198`). When ≥2 users claim usernames in the same checkpoint window, validators reject all but one with `Transaction needs to be rebuilt because object X version Y is unavailable...` or `Object already locked by a different transaction...`.

**Why this can't be fixed by sharding the object:** the SuiNS leaf-add semantics require mutating the parent `audric.sui` registry. Splitting it would break SuiNS resolution.

**The right mitigation:** retry with fresh tx build on stale-version errors. Sui shared object versions advance every checkpoint (~250ms), so a retry after ~500ms with `tx.build()` re-resolving the latest version will succeed once contention clears. `signAndExecuteTransaction` already does some internal retries for rebuilding, but the route swallows the eventual failure as 502.

**Demo risk:** if 5 conference attendees claim usernames in the same minute, ~10–20% of attempts will see this 502. They'll click retry — but the agent narration WILL show "Failed to mint leaf" before they realize the retry is on them.

#### L4 — SuiNS pre-mint check 429 (18 occurrences, returns 503)

```typescript
// audric/apps/web/app/api/identity/reserve/route.ts:208-222
try {
  onChainAddress = await resolveSuinsViaRpc(handle, { suiRpcUrl });
} catch (err) {
  const detail = /* ... */;
  console.error('[reserve] SuiNS pre-mint check failed:', detail);
  return errorResponse(
    `SuiNS verification temporarily unavailable: ${detail}. Please retry shortly.`,
    503,
  );  // ← NO RETRY
}
```

Same fix as L1: one retry with 500ms backoff.

**Recommended P1 fix (≤30 LoC):** wrap both `resolveSuinsViaRpc` (line 209) and `signAndExecuteTransaction` (line 249) in a small `withRetry()` helper that does up to 2 retries with 500ms exponential backoff for `429`, `Unexpected status code`, `Transaction needs to be rebuilt`, `Object already locked`, and network errors (`ECONNRESET`, `HeadersTimeoutError`, `AbortError`). Keep the existing 502/503 returns for genuinely-fatal cases. Estimated impact: **62 → ≤6 errors per 12h** (~10× reduction in onboarding failure).

### 🔴 #2 — `[sponsor] Enoki error (401) jwt_error` in `/api/transactions/prepare` (8 occurrences) — sibling of S18-F2

This is the same class of bug as S18-F2 (which we just shipped), but in the **prepare** route, with a **different Enoki error code**:

| Code | Meaning | Where surfaces today | Fixed by |
|---|---|---|---|
| `expired` | JWT past `exp` timestamp | execute route, 401 | ✅ S18-F2 (audric@`05180bc`) |
| `jwt_error` (`no applicable key found in JWKS`) | Google rotated JWKs; old key gone | **prepare route, 401** | ❌ NOT YET FIXED |

Both fail for the same user-facing reason (sign-out + sign-in fixes both). Both should surface the same actionable copy.

**The prepare route already extracts `errors[0].message` correctly** (line 469), so the user gets `"no applicable key found in the JSON Web Key Set"` as the chat narration today. That's *technically accurate but not actionable* — the user has no idea what JWKS is.

**Recommended P1 fix (≤10 LoC):** in `audric/apps/web/app/api/transactions/prepare/route.ts` after line 469, mirror the S18-F2 pattern — detect `enokiCode === 'expired'` OR `enokiCode === 'jwt_error'` → return 401 with `error: 'Your sign-in session has expired. Please sign out and sign back in to continue.'` + `code: 'session_expired'`. Same copy, same code, same UX as S18-F2. The execute-route fix should be hoisted into a shared helper to avoid drift.

---

## Major noise sources (not user-impacting but worth fixing for log hygiene)

### 🟡 #3 — Contact-backfill: 147 lookups for ONE expired SuiNS handle (L6)

`0x1bf820c518a88651...c294410` triggers `Name has expired` from Sui RPC every single backfill. The reverse-SuiNS lookup will keep returning this error forever (until the user re-registers).

The current code in `audric/apps/web/lib/identity/contact-suins-backfill.ts:62-66` re-checks any contact whose `audricUsername` is `null` (intentionally — to self-correct if a SuiNS leaf appears later). But it doesn't distinguish:

| State | Today's behavior | Recommended |
|---|---|---|
| Never checked | Re-check every backfill (correct) | Re-check |
| Checked, no leaf, no error | Re-check every backfill (correct, leaf may appear) | Re-check after ≥24h |
| Checked, leaf hit | Skip (correct) | Skip |
| **Checked, "Name has expired"** | **Re-check every backfill (wastes 147 RPC calls + log lines per dead handle)** | **Skip for ≥7d** |
| Checked, 429 | Re-check every backfill (correct, transient) | Re-check |

**Recommended P2 fix:** add an `audricUsernameCheckedAt` field + a `audricUsernameLastError` enum to the Contact schema (or just a sentinel value `null` vs `'EXPIRED'` vs `'UNREGISTERED'`). On `Name has expired`, set the sentinel + skip for 7d. The comment at lines 33-38 of `contact-suins-backfill.ts` already anticipated this need ("Defer until per-user contact counts grow large enough that the cost matters") — that threshold is now crossed.

### 🟡 #4 — `/<username>` profile page: 77 of ~110 lookups for ONE handle (`/adeniyi`) (L8)

The public profile renderer does a SuiNS lookup on every page hit. `adeniyi.audric.sui` was hit 77 times in 12h — likely one popular profile or a scraper. Each lookup runs a Sui RPC `getDynamicFieldObject` call. Under burst load this gets 429ed.

**Recommended P2 fix:** add a server-side in-memory or Redis cache for SuiNS handle → address resolution with ≥60s TTL. SuiNS records are stable on the order of hours/days; even a 5-minute cache would slash 90%+ of lookups. The cache should also be flushed when a user mints a new leaf via `/api/identity/reserve` (cache invalidation is bounded — only the current user's handle).

### 🟡 #5 — DefiLlama snapshot cron 429 burst (L11 + L12 + N1) — already filed as S18-F4

Identical to the S18-F4 finding from the SPEC 18 regression sweep. The financial-context-snapshot cron fans out 7 protocol fetches in parallel; under DefiLlama's per-IP rate limit they all 429 together. Has retry + caching → no user impact.

**Recommended P3 fix:** sequence the parallel fetches at ~200ms intervals OR upgrade to DefiLlama's paid tier OR cache more aggressively. Currently 330 log lines / 12h.

---

## False positives (no action needed)

### 🟢 #6 — `[activity] PrismaClientKnownRequestError P2022 column "(not available)"` (L13)

**Confirmed root cause: rolling-deploy migration race.** The 4 errors fired between `09:33:09` and `09:33:43` UTC+10 — a 30-second window immediately after commit `0361707` (SPEC 17 schema migration) was deployed at `09:32:41`. Old Lambda containers still expected `AppEvent.goalId` while the migration had just dropped the column. New containers booted with the new Prisma client → errors stopped at 09:33:43.

Self-resolved. No code change needed unless we're prepared to do 2-phase migrations (deploy code-without-column-references first, then drop column in a follow-up deploy). Not worth the engineering cost for a 30-second blip.

### 🟢 #7 — Network blips (N2 ECONNRESET, N3 HeadersTimeout)

Transient upstream connection drops — 5 ECONNRESET in 30s at 00:44 (Sui RPC), 4 HeadersTimeout in 5min at 01:45. Existing retry logic absorbs; no user impact.

### 🟢 #8 — Node `[DEP0169] url.parse()` deprecation (N4)

Comes from an upstream dependency (likely `@mysten/sui` or a transitive). Not actionable in our code. Can be silenced via `NODE_OPTIONS=--no-deprecation` if the noise level becomes problematic.

### 🟢 #9 — BlockVision degradation hints (L9 + L10)

By design — `[blockvision-prices] portfolio HTTP 429, degrading` is the sticky-positive cache fallback per `.cursor/rules/blockvision-resilience.mdc`. The `[blockvision-prices] sui rpc coin fetch failed` is the secondary degradation path that drops to the hardcoded stable allow-list. Both produce 200 responses with degraded data; no user impact beyond non-stable USD values reporting `null` (which is the documented behavior).

---

## Recommended action plan

**Pre-demo (P1, ~45 min total):**

1. **L1+L2+L3+L4 — `/api/identity/reserve` retry wrapper (~30 LoC, ~30 min).** Add a `withRetry()` helper in `audric/apps/web/lib/sui-retry.ts` (new file or extend an existing util). Wrap the SuiNS pre-mint check (line 209) and the signAndExecuteTransaction call (line 249) with up to 2 retries on transient errors (429, stale-version, locked-object, network). Reduces onboarding failure rate by ~10×. Adds ~1s latency in the worst case (first attempt + 500ms backoff + second attempt). **Highest pre-demo ROI.**

2. **L5 — extend S18-F2 fix to the prepare route (~10 LoC, ~10 min).** In `audric/apps/web/app/api/transactions/prepare/route.ts` after line 469, detect both `enokiCode === 'expired'` AND `enokiCode === 'jwt_error'` → return 401 with the same actionable copy as S18-F2. Hoist the detection logic into a shared `lib/enoki-error.ts` helper to avoid drift between prepare + execute routes. Bonus: rename S18-F2's helper for symmetry.

**Post-demo (P2):**

3. **L6 — Contact-backfill negative cache for "Name has expired" (~30 LoC).** Add `audricUsernameCheckedAt` field + a sentinel for `EXPIRED`. Schema migration + 1 prisma update + 1 condition in `contact-suins-backfill.ts:62-66`. Eliminates ~150 noise lines per dead handle per 12h.

4. **L8 — Server-side SuiNS handle resolution cache (~50 LoC).** In-memory `Map` keyed by handle, 60s TTL, with cache invalidation on `/api/identity/reserve` success. Cuts ~80% of `/<username>` page lookups.

**Post-demo (P3):**

5. **L11 — Throttle financial-context-snapshot DefiLlama fan-out (~15 LoC).** Replace `Promise.all` with a sequential loop with 200ms intervals between protocol fetches in the snapshot cron. Already filed as S18-F4 in the SPEC 18 runbook.

6. **L14 — Wrap `[engine/chat] conversation log` writes in fire-and-forget (~5 LoC).** The Prisma P2028 only happens 2× / 12h+ and doesn't affect chat completion, but moving the log write outside the request transaction would eliminate the race entirely.

**Won't fix:**

- L13 (P2022 deploy race) — self-resolved, not worth 2-phase migrations.
- N2/N3/N4 — transient infra noise / upstream deprecation, no actionable signal.
- L9/L10 — by design (blockvision-resilience contract).

---

## What this triage adds to the existing tracker

- **L1+L2+L3+L4** is a NEW finding (not in S18-F1–F5). File as **S18-F6 (P1) — `/api/identity/reserve` lacks retry on transient Sui RPC + SuiNS errors**. Production onboarding bug class. Pre-demo P1.

- **L5** is a NEW finding. File as **S18-F7 (P1) — `/api/transactions/prepare` lacks `jwt_error` handling (sibling of S18-F2)**. Pre-demo P1. Hoist into a shared `lib/enoki-error.ts` for both prepare + execute routes.

- **L6** updates the priority of the existing S18-F4 family — was P3, but the volume (147 noise lines for one address) suggests it's worth a small fix (~30 LoC) for log hygiene. File as **S18-F8 (P2)**.

- **L8** is a NEW finding. File as **S18-F9 (P2) — server-side SuiNS handle cache for public profile pages**.

- **L11** is the existing S18-F4 — no change.

- **L13** is a NEW false-positive finding. File as **S18-F10 (resolved-noise) — Prisma P2022 from SPEC 17 deploy race**, documented for completeness, no action.

---

## Cross-references

- `spec/runbooks/RUNBOOK_spec18_regression_checklist.md` — Phase H bug log for the existing S18-F1 through S18-F5.
- `audric/apps/web/app/api/transactions/execute/route.ts` — S18-F2 reference impl for the Enoki error detection pattern (audric@`05180bc`).
- `audric/apps/web/app/api/identity/reserve/route.ts` — target for L1/L2/L3/L4 fix.
- `audric/apps/web/app/api/transactions/prepare/route.ts` lines 462–490 — target for L5 fix.
- `audric/apps/web/lib/identity/contact-suins-backfill.ts` lines 62–66 — target for L6 fix.
- `.cursor/rules/blockvision-resilience.mdc` — explains why L9/L10 are by-design.
