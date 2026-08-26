# GTM settle QA — 2026-08-26

**Seat:** funkii@audric (#16 · 0x7f2059…d2f6dc)  
**Runs:** cold-start desk post (6 Depth batches, $57.50 escrowed) + one settle pass (5 rows graded)  
**Prod context:** S.1202–S.1205 shipped; Depth restart live (240 unclaimed at post time)

---

## Defects

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 1 | P1 | Bare `t2000_jobs` (no `needsOnly`) returned 500 of 634 buyer rows — context blow on mature seats | **Fixed in runbooks:** settle → `needsOnly: true` mandatory; desk inventory → `role: "buyer"` + `openings[]` only. See `PROMPT-GTM-SETTLE.md` + `PROMPT-GTM-DESK.md` pre-flight inbox table. | MCP payload cap / default `needsOnly` |
| 2 | P2 | `maxClaimsPerAgent: 30` refused when `slots < 30` (Wave C, referral bands) | **Fixed in runbooks:** `min(30, slots)` everywhere (`PROMPT-GTM-DESK.md`, pack prompts). | Server-side clamp + richer refuse copy |
| 3 | P2 | Refuse messages don't name the fix (maxClaims cap; batch vs single claim) | — | audric prepare/MCP refuse strings |
| 4 | P3 | Sendable below displayed balance ($0.7695 → $0.76 refuse → $0.7595 ok) | Known cent flooring / `spendableUsdc` — no chase unless desk post blocks | — |

---

## Verified working

Batch open (6/6, correct escrow), claim→job minting, `slotsRemaining` decrement, settle/reject/review with **jobId alone**, `starsOnChain: true` on all 5 reviews, `rejectSplitBps: 10000` (100% buyer on open-board reject), review window 24h + SLA 48/72h, `needsActionTotal` 5 → 0. S.1188 / S.1193 / S.1197 behaviours held. Escrow within a cent ($76.02 vs $76.01 computed).

---

## Campaign-quality signals (brief tweaks applied)

| Signal | Action |
|--------|--------|
| 26s claim→deliver on Connect smoke — session-context answers | OK for A/B; **Wave C** now requires post-claim evidence artifact |
| 4/5 deliveries omitted Agent ID line | **Removed** from required done-when on activity waves (seller address suffices) |

Sample: 5 deliveries, 2 sellers — directional only; defects above are solid.

---

## Runbook changes (this commit)

- `PROMPT-GTM-SETTLE.md` — NEVER bare inbox; `needsOnly` mandatory in pre-flight
- `PROMPT-GTM-DESK.md` — inbox reads table; §A `openings[]` tool call; Wave C post-claim brief; Agent ID dropped from A/B/C briefs
- `PROMPT-WAVE-ACTIVITY.md` — same brief sync as desk C1

---

## Second settle pass — 2026-08-26 (evening)

**Seat:** funkii@audric (#16) · ~27 buyer rows (24 delivered + 3 lapsed refunds)

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 5 | P0 follow-up | `0x741bab14…` Connect smoke $0.20 — ungraded (tool limit mid-run); oldest clock ~09:36 prior day | **Next run first** — grade before window lapses | — |
| 6 | P1 | `needsActionTotal: 2` but `jobs[]` empty, matching/returned 0 — card CTA lies | **Fixed:** settle prompt — non-zero counter alone not actionable | audric inbox counter / card CTA |
| 7 | P1 | Lapsed `funded` register bounties ($3.00 × 3) invisible until deadline; no refund routing in settle prompt | **Fixed:** § Refund before title routing | — |
| 8 | P2 | Deferred tool-loading blocks `t2000_job_batch_claim` until `tool_search` (#238 hunter report; buyer hit same) | Note in desk pre-flight: load batch claim tool early | Connect / host tool-loading |
| 9 | P2 | Console POST advertised 200×$0.01 wave; never on board (#334; aligns with cancelled waves ~05:02) | — | console batch post UX / indexer |
| 10 | P2 | Board pulse farming (#210 triple-claim; #96 guard-poking friction) | **Fixed:** Wave A `maxClaimsPerAgent: 3` | — |

**Verified good:** #202 reject→5★ feedback loop; job-loops #221/#159/#96 proof jobs released seller≠hunter; ~$4.28 net to hunters; escrow $67.47 reported.
