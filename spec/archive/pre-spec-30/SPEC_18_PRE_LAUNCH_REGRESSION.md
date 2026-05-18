# SPEC 18 — Pre-Launch Regression + Smoke Testing

**Status:** v0.1 DRAFT (2026-05-07)
**Owner:** Founder + assistant
**Slot:** between SPEC 12 and SPEC 11 (per S.99 sequencing)
**Estimated effort:** ~2.5–3.0 days (compressed: ~1.0–1.5d if focused on demo-critical paths only)

---

## TL;DR

Audric is being presented to thousands in 12 hours. SPEC 18 is a comprehensive pre-launch regression + smoke pass across all 5 product surfaces, all 35 engine tools, all 13 chip flows, and all critical user paths — automated where possible, manual where required, with a hard go/no-go sign-off gate before demo.

**This is not a feature spec.** It ships zero new code. It executes a verification matrix, files bugs as they surface, fixes P0/P1 before sign-off, and produces a release-readiness report.

**Prerequisite:** SPEC 17 (Savings Goals removal), SPEC 12 (consistency sweep), and CHIP Review #2 should ship FIRST. SPEC 18 verifies the post-cleanup state — running regression on a moving target is wasted effort.

---

## Background

We've shipped 17 SPECs across 8 weeks: identity (SPEC 10), payment links (SPEC 9 P9), invoices (SPEC 9 P10), chip-flow standardization (S.85 B1), env validation gate (S.20), permission resolver (B.4), agent harness correctness (Spec 1), agent harness intelligence (Spec 2), atomic multi-MPP draft (SPEC 16, paused), and dozens of smaller fixes.

Each SPEC was tested in isolation. **No SPEC has been verified end-to-end against the cumulative production state.** Bugs that emerge from interaction effects (e.g., chain-memory hits a payment-link receipt and crashes; the chart renderer trips a guard during a chained tool call; the financial-context snapshot interacts badly with a watched address) are exactly what surfaces under demo conditions.

The 12-hour deadline forces a triage: comprehensive coverage isn't possible, but demo-critical coverage is.

---

## Scope

### IN SCOPE — full

| Surface | What gets tested |
|---|---|
| **Audric Passport** | Google sign-in → username claim → profile page → zkLogin session refresh → wallet view |
| **Audric Intelligence** | Chat completion, streaming, prompt caching, complexity classifier, financial-context snapshot, chain-memory hydration, advice-log hydration, microcompact, guards (all 14), recipes (all 6), early tool dispatch, tool result budgeting |
| **Audric Finance** | save (USDC + USDsui), withdraw, swap (Cetus), borrow (USDC + USDsui), repay (asset-symmetric), charts (yield/health/portfolio), all chip flows for finance ops |
| **Audric Pay** | send transfer, create payment link, list/cancel payment links, create invoice, list/cancel invoices, public receipt screen (`/pay/<id>`), recipient-pays flow (dapp-kit + sponsored bypass) |
| **Audric Store** | OUT OF SCOPE — not yet shipped (Phase 5) |
| **35 engine tools** | All 24 read tools + 11 write tools, exercised in chat with realistic inputs |
| **13 chip flows** | Re-verify post-S.85 B1 + post-CHIP-Review-#2 — all chips load, defaults populate, modifiable fields edit, confirm card renders correct copy, error path renders inline |
| **Auth state machines** | Signed-out, signed-in-no-username, signed-in-with-username, expired-zkLogin-session, watched-address-mode |
| **Error states** | Insufficient balance, invalid recipient, expired payment link, RPC failure, BlockVision failure (degradation path), CDN/cache miss, network offline |
| **Cross-device** | Mobile Safari (iOS), mobile Chrome (Android), desktop Chrome, desktop Safari, desktop Firefox |
| **Performance baselines** | TTFVP (time to first visible paint) ≤ 2.0s on mobile 3G; chat first-token ≤ 1.5s; payment verify ≤ 800ms; portfolio load ≤ 1.2s |
| **Production wallet smoke** | Real wallet, real positions, real on-chain writes (small $ amounts) |

### OUT OF SCOPE

- Audric Store (not shipped yet)
- Atomic multi-MPP (SPEC 16, paused)
- Onramp flow (SPEC 11.5, not shipped)
- PayButton + Audric-payer routing (SPEC 11, not shipped — verified state is dapp-kit only for receivers)
- Stress / load testing (10k concurrent users) — this is single-user smoke
- Penetration testing — separate spec
- Fuzz testing — separate spec

---

## Phases

> **Time box:** entire SPEC 18 ≤ 3.0d. Each phase has a hard time cap. If a phase runs over, the founder is consulted to decide cut/continue.

### Phase A — Audit + checklist build (~0.25d, hard cap 3h)

Build the test matrix as a checklist (markdown table or Linear/Notion checklist). One row per surface × test type. Each row has:
- Test name
- Surface (Passport / Intelligence / Finance / Pay)
- Type (auto / manual / production)
- Expected result
- Status (pending / pass / fail / blocked)
- Bug ticket (if fail)

**Output:** `spec/runbooks/RUNBOOK_spec18_regression_checklist.md` with the full matrix (estimated ~120–150 rows).

### Phase B — Automated regression (~0.25d, hard cap 3h)

Run all automated suites in both repos. Block on any failure.

```bash
# t2000 monorepo
pnpm --filter @t2000/sdk test
pnpm --filter @t2000/engine test
pnpm --filter @t2000/cli test
pnpm --filter @t2000/mcp test
pnpm --filter gateway test
pnpm typecheck
pnpm lint
pnpm build

# audric monorepo
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
```

**Acceptance:** 0 test failures, 0 typecheck errors, 0 lint errors, all builds succeed.

**Output:** Phase B section of `RUNBOOK_spec18_regression_checklist.md` filled in with command output excerpts + any failures triaged into bug tickets.

### Phase C — Manual smoke (6 happy paths) (~0.5d, hard cap 6h)

**Path 0 — QR-driven cold-start onboarding** (added because the cold-start flow gets the least dev-time attention but is the most-exercised real-user path — every new account walks it once):

| Step | Verify | Failure mode |
|---|---|---|
| 1. QR scan from physical screen / slide | QR resolves to `https://audric.ai/?ref=qr` (or canonical landing URL) | QR malformed → users land elsewhere |
| 2. Mobile landing page load | TTFVP ≤ 2s on mobile LTE; hero copy + Passport CTA visible without scroll | Slow load → drop-off |
| 3. "Sign in with Google" tap | Google OAuth popup opens; account picker shows | OAuth misconfigured → blank popup |
| 4. Google sign-in completes | zkLogin completes; user lands on username claim screen | zkLogin failure → spinner forever |
| 5. Username claim screen | UsernamePicker renders; suggested usernames populate; user taps a suggestion OR types | Empty suggestions → blank state |
| 6. Username reservation | Reserve API succeeds; user gets `username.audric.sui` confirmation | Race / collision → "username taken" mid-claim |
| 7. First chat lands | DashboardChat renders; placeholder shows; chat input focused | Blank screen / broken input |
| 8. First message sent | User types "what can you do?" → agent responds with intro within 5s | Stream stalls → silence |

**Acceptance for Path 0:** all 8 sub-steps green on iOS Safari + Android Chrome (the two browsers cold-start users overwhelmingly arrive on). If any sub-step fails on either → P0 → halt Phase C → triage.

**Paths 1–5 (returning-user happy paths):**

1. **Passport happy path:** Open audric.ai → "Sign in with Google" → username claim → land on chat → confirm `username.audric.sui` shows in profile → sign out → sign in again → session restored
2. **Intelligence happy path:** Send "what's my balance?" → balance_check fires → reply renders → click a portfolio chip → portfolio canvas renders → ask follow-up → cache hit (faster than cold)
3. **Finance happy path (save):** Send "save 1 USDC" → chip flow opens → confirm card shows correct amount + APY + asset → tap confirm → sponsored tx fires → receipt shows → portfolio updates → financial-context snapshot reflects new savings within next refresh
4. **Pay happy path (send):** Send "send 0.5 USDC to @alice" → contact resolution → confirm card → tap confirm → sponsored tx fires → receipt shows → recipient profile shows incoming
5. **Pay happy path (link):** Send "create a payment link for $1" → confirm → link created → open `/pay/<id>` in incognito → pay (with second wallet) → receipt → original sender sees fulfilled

**Acceptance:** Path 0 + all 5 paths complete without errors. Any P0 (path-blocking) bug halts Phase C and triggers immediate triage.

**Output:** Phase C section of runbook with screenshots + any bugs filed.

### Phase D — Chip flow re-verification (post-CHIP-Review-#2) (~0.5d, hard cap 6h)

Walk all 13 chip flows from the chip registry. For each:
1. Trigger the chip (via chat or canvas)
2. Verify defaults populate from current portfolio
3. Edit each modifiable field (amount, recipient, asset)
4. Verify confirm card copy matches D-6 convention (locked in SPEC 12)
5. Verify confirm card amount matches resolved permission tier (auto vs confirm)
6. Trigger an error path (insufficient balance, invalid amount) — verify error renders inline (F4 fix from SPEC 11 G-6)
7. Tap confirm — verify receipt renders

**Acceptance:** All 13 chips pass all 7 sub-checks. Any chip with regressions is filed as a bug + assigned to the SPEC-12-or-CHIP-Review-#2 owner for hotfix.

**Output:** Phase D section of runbook with the 13×7 grid filled in.

### Phase E — Edge case + error injection (~0.5d, hard cap 6h)

Deliberately trigger known failure modes and verify the system degrades gracefully:

| Injection | Surface | Expected behavior |
|---|---|---|
| Insufficient balance for save | save chip | Error inline on chip; no tx submitted; no orphan TurnMetrics row |
| Expired payment link | `/pay/<id>` | "This link has expired" message; no payment dialog |
| Invalid recipient (random hex) | send chip | Preflight blocks; chip shows "Invalid recipient"; no LLM round-trip |
| Health Factor would drop below 1.5 | borrow chip | Guard blocks; LLM narrates "this would put HF at 1.42, blocked" |
| BlockVision API down (kill key) | balance_check, portfolio_analysis | Degradation path: Sui RPC + stable allow-list; non-stable USD shows null + UI shows degradation banner |
| RPC timeout (intercept) | any write | Retry once; if still fails, surface error to user with "Try again" CTA |
| zkLogin session expired mid-chat | any write | Refresh prompt; user re-signs; chat resumes |
| Same chip submitted twice (rapid double-tap) | any write | Idempotent — second submission is no-op (attemptId dedupe) |
| Watched address mode + write attempt | any write | Tool refuses; LLM narrates "you're viewing this wallet, not signed in as it" |
| MPP gateway 500 | pay_api | Single retry; if still fails, surface vendor name + error code |

**Acceptance:** All 10 injections produce expected behavior. Any unexpected behavior is a bug.

**Output:** Phase E section of runbook with each injection logged + outcome.

### Phase F — Production wallet smoke (~0.25d, hard cap 3h)

Real wallet, real positions, real on-chain writes (small $ amounts):

- Save 0.10 USDC → verify on-chain via Sui Vision → verify NAVI receipt → verify portfolio updates
- Withdraw 0.05 USDC → verify on-chain → verify portfolio updates
- Swap 0.10 USDC → 0.10 USDC equivalent in USDsui via Cetus → verify on-chain → verify slippage acceptable
- Send 0.10 USDC to a known recipient → verify on-chain → verify receipt screen
- Create payment link for $0.50 → pay from second wallet → verify settlement → verify both ledgers updated

**Acceptance:** All 5 production writes complete on-chain. No funds lost or stuck. All UIs reflect on-chain state within 60s.

**Output:** Phase F section of runbook with tx digests linked.

### Phase G — Performance baseline (~0.25d, hard cap 3h)

Measure performance against demo-critical baselines:

| Metric | Target | Tool |
|---|---|---|
| TTFVP (audric.ai mobile 3G) | ≤ 2.0s | Lighthouse / WebPageTest |
| TTFVP (audric.ai desktop) | ≤ 1.0s | Lighthouse |
| Chat first-token latency | ≤ 1.5s | Manual stopwatch + `metrics-and-monitoring.mdc` |
| Payment link verify latency | ≤ 800ms | DevTools Network tab |
| Portfolio load (full canvas) | ≤ 1.2s | DevTools Network tab |
| Chip flow open → confirm card render | ≤ 500ms | Manual stopwatch |
| Onboarding (Google → first chat ready) | ≤ 8.0s | Manual stopwatch |

**Acceptance:** All metrics meet target on the demo network (whatever the venue Wi-Fi or LTE provides). If venue Wi-Fi unknown, run on standard mobile LTE.

**Output:** Phase G section of runbook with measured values + any regressions filed as bugs.

### Phase H — Bug triage + fix loop (~rolling, integrated with phases B–G)

As bugs surface in B–G, triage immediately:
- **P0** (demo-blocking — happy path broken, can't sign in, can't send tx): Fix immediately, halt other phases until shipped
- **P1** (high — visible UX bug, copy error, slow performance, edge case affects realistic user): Fix before sign-off
- **P2** (medium — affects rare paths, non-blocking): File for post-demo
- **P3** (low — polish, minor copy, edge case): File for post-demo

**Cap:** if more than 3 P0 bugs surface, founder is alerted immediately to decide demo go/no-go.

### Phase I — Sign-off + go/no-go (~0.25d, hard cap 1h)

Final review with founder:
- All phases A–G have status logged
- All P0 bugs are closed
- All P1 bugs are either closed OR explicitly accepted by founder
- All P2/P3 bugs are filed for post-demo backlog
- Production wallet smoke is green
- Performance baselines are met (or accepted exceptions documented)

**Sign-off:** Founder explicitly says "GO for demo" — recorded in tracker as S.100 entry.

If founder says NO-GO: identify the single biggest blocker, fix it, re-run only the affected phase, re-sign-off.

---

## Acceptance gates

| Gate | Pass criterion | Check |
|---|---|---|
| **G1** | Test matrix exists with ≥120 rows | Phase A output present |
| **G2** | All automated suites green | Phase B output: 0 failures |
| **G3** | All 5 happy paths complete | Phase C output: 5/5 pass |
| **G4** | All 13 chip flows × 7 sub-checks pass | Phase D output: 91/91 pass |
| **G5** | All 10 error injections behave as expected | Phase E output: 10/10 pass |
| **G6** | All 5 production writes complete on-chain | Phase F output: 5/5 pass |
| **G7** | All 7 performance metrics meet target | Phase G output: 7/7 pass |
| **G8** | 0 P0 bugs open, all P1 explicitly accepted | Phase H closed |
| **G9** | Founder sign-off | S.100 entry in tracker |

---

## Risks

1. **R1 — Time pressure forces shortcuts.** 12 hours isn't enough for SPEC 17 + 12 + CHIP #2 + SPEC 18. Mitigation: founder has acknowledged the risk in the D-question; we proceed with expedited phases (B, C, F, I are mandatory; D, E, G are nice-to-have if time runs out).
2. **R2 — Bugs surfaced cannot be fixed in time.** Mitigation: P0 fixes get priority; P1 are explicitly accepted by founder before demo; P2/P3 deferred. If a P0 has no quick fix, demo scope is reduced (e.g., skip the broken product) rather than postponed.
3. **R3 — Production wallet smoke costs real money.** Mitigation: cap each test at $0.50; total spend ≤ $5.
4. **R4 — Demo network conditions differ from test conditions.** Mitigation: Phase G measures on mobile LTE (closest analog to venue Wi-Fi); founder briefed on baseline so on-the-day deltas are interpretable.
5. **R5 — Last-minute SPEC 17 + 12 + CHIP #2 ship introduces new bugs faster than SPEC 18 can find them.** Mitigation: lock all SPECs as "no new commits" 4h before demo; SPEC 18 runs against the locked state. New bugs found in last 4h go to post-demo backlog unless P0.
6. **R6 — Founder unavailable for sign-off.** Mitigation: founder pre-commits to a sign-off window; assistant runs phases A–H autonomously and presents G9 ready for tap.

---

## Compressed mode (if 12h timeline holds)

If we genuinely have 12h and SPEC 17 + 12 + CHIP #2 must also ship: SPEC 18 compresses to ~6 hours by:
- Phase A: skip formal matrix; use this spec's tables as the matrix (~30min)
- Phase B: mandatory, no shortcut (~3h)
- Phase C: mandatory, all 5 paths (~2h)
- Phase D: skip — covered by CHIP Review #2 if it ran fully
- Phase E: skip injection 5–10, do only insufficient-balance + expired-link + invalid-recipient (~30min)
- Phase F: mandatory, all 5 production writes (~1h)
- Phase G: skip — accept current performance, no measurement
- Phase H: rolling
- Phase I: mandatory (~15min)

Total compressed: ~7h. Skips chip-flow re-verification (D), most injections (E), and performance (G). Founder accepts the residual risk by selecting `demo-needs-everything` in the D-question.

---

## Cross-references

- Sequencing → S.99 in `audric-build-tracker.md`
- Locked baseline (post-cleanup state) → SPEC 17 + SPEC 12 + CHIP Review #2
- Chip-flow registry → `audric/.cursor/rules/audric-chip-flows.mdc` (or wherever the post-S.85-B1 registry lives)
- Performance metrics conventions → `.cursor/rules/metrics-and-monitoring.mdc`
- Production wallet test addresses → operator-only, not in spec
