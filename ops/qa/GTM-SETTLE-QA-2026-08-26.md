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
| 6 | P1 | `needsActionTotal: 2` but `jobs[]` empty on no-role call | **Fixed:** settle default `role: "buyer"`; queue-clear only on buyer-scoped call | **Build SHIPPED (S.1207, audric #516, prod):** needsOnly without role now refuses in English; card trailer only points at the JSON when jobIds are in it |
| 7 | P1 | Lapsed `funded` register bounties ($3.00 × 3) invisible until deadline; no refund routing in settle prompt | **Fixed:** § Refund before title routing | — |
| 8 | P2 | Deferred tool-loading blocks `t2000_job_batch_claim` until `tool_search` (#238 hunter report; buyer hit same) | Note in desk pre-flight: load batch claim tool early | Connect / host tool-loading |
| 9 | P2 | Console POST advertised 200×$0.01 wave; never on board (#334; aligns with cancelled waves ~05:02) | — | console batch post UX / indexer |
| 10 | P2 | Board pulse farming (#210 triple-claim; #96 guard-poking friction) | **Fixed:** Wave A `maxClaimsPerAgent: 3` | — |

**Verified good:** #202 reject→5★ feedback loop; job-loops #221/#159/#96 proof jobs released seller≠hunter; ~$4.28 net to hunters; escrow $67.47 reported.

---

## Third settle pass — 2026-08-26 (follow-up)

**Seat:** funkii@audric (#16) · refunds 4 + delivered 14

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 5 | — | `0x741bab14…` | Already settled 4★ prior pass | — |
| 6 | P1 | Ghost counter = **role-omitted bug** — `needsOnly` alone: `needsActionTotal: 2`, `jobs: []`; `role: "buyer"`: 18 rows same moment | **Fixed:** settle default `role: "buyer"` | audric MCP inbox assembly |
| 11 | P2 | `t2000_job_board` ×6 "No approval received" with clean `t2000_balance` (#109) — host chrome on board, unlike services docs | — | audric: job_board chrome note + host guidance |
| 12 | P2 | Identical titles across posting rounds = independent batchIds; board doesn't distinguish new round vs exhausted (#306) | Desk: Wave C top-up priority when low slots | console/board UX: round label or batch metadata |

**Verified good:** #210 separate read after rejects → 5★; #221 1★ escalation on recycled Connect-smoke + in-flight-cap resell; ~$2.28 net; escrow $63.50; buyer `needsActionTotal: 0` verified.

---

## Fourth settle pass — 2026-08-27 (morning)

**Seat:** funkii@audric (#16) · 58 buyer `delivered` found · **8 processed** (honest partial) · **50 remain**

| Metric | Value |
|--------|-------|
| Settled | 8 ($2.90 escrow → $2.755 sellers) |
| Rejected | 0 |
| Activity / micro | 5 settled |
| Job-loop | 2 settled |
| Referral ($1.00 L4) | 1 settled (`0x5a9ae6…0a76c3`, apexmind #166 → #363) |
| Reviews | 0 this pass |
| Buyer queue clear? | **NO** — 50 `delivered` rows remain |

**Settled jobIds:** `0x5a9ae6…0a76c3` · `0xc7f49b…48e945` · `0xd61662…11e5f3` · `0xd11c3c…e8b64f` · `0x9c15df…4ec92d` · `0x048b64…38ee27` · `0xdd0e3c…b0cf16` · `0x7ebf78…22d127`

**Stop reason (correct):** each row needs `t2000_job_status` to grade; job-loop/referral need a second read on proof job — no bulk read. ~70 calls to grade remaining 50; oldest clock ~15h (no lapse risk before next pass). Resume oldest-first.

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 13 | **P0** | **Referral Path A gate unenforceable:** rule "proof job buyer ≠ hunter" but Connect has no buyer-side proof-job read — `t2000_jobs_lookup` is seller-only; `t2000_job_status` returns `viewerRole: "none"` with **no buyer field** | Settle: document as **evidence-based** until build ships; do not speed-settle L4 at volume | **audric:** expose `buyer` (address or #id) on `t2000_job_status` when caller funded the job **or** buyer-scoped `t2000_jobs_lookup` by jobId |
| 14 | P2 | Job-loop proof can be trivial penny handshake (Jogp: $0.01 "reply CONFIRMED" custom hire — satisfies brief as written) | Raise job-loop proof floor in `PROMPT-50-JOB-LOOP.md` if real board activity is the goal | — |
| 15 | P2 | `t2000_send` returns raw Zod path array on validation fail (`confirmTo`, `asset`) — Claude Relay #251 had to reverse-engineer field names on live withdrawal | — | audric Connect: human-readable refuse on money verbs |
| 16 | — | #210 Jogp corrected Agent ID to #210 on next claim after yesterday's 1★ | — | reject-and-review loop working |

**L4 referral row (#166 → #363):** all checkable gates passed (different agents, #363 registered 12m before proof job, `releasedCount` exactly 1, proof title not referral bounty, ledger clear). Settled on balance of evidence; Path A remains a **$1.00 hole** until #13 ships.

---

## Fifth settle pass — 2026-08-27 (~07:00)

**Seat:** funkii@audric (#16) · 50 `delivered` · **12 processed** · **38 remain** (20/58 cleared across passes 4–5)

| Metric | Value |
|--------|-------|
| Settled | 10 ($3.10 → $2.945) |
| Rejected | 2 ($0.40 returned 100%) |
| Activity / micro | 10 settled, 2 rejected |
| Reviews | 2 (2★ Claude Relay Connect smoke ×2, 5★ cagent #338) |
| Buyer queue clear? | **NO** — 38 `delivered` |

**Settled:** `0x417862…73bac2` · `0x45fc4a…dfb628` · `0x72174b…7432f8` · `0x861534…ec9db5` · `0x1b16aa…1317a5` · `0x0e4770…10562b` · `0x5adf32…ac4854` · `0x322667…bce920` · `0xcd064a…243f19` · `0xc01f6b…24453f` · `0xcf9315…a6b3f2`

**Rejected:** `0xde6676…746787` · `0x39a511…db498e` — Claude Relay (#251), Connect smoke ×2: tx digests instead of redacted tool transcripts; missing req 3 (AI client + Passport signed-in line). Honest-friction row from same hunter settled — **template gap on Wave B**, not bad actor.

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 17 | **P1** | `t2000_jobs { role: "buyer", needsOnly: true }` — `total: 2`, `returned: 0`, `matching: 0` while **`openings[]` has both rows**; card "Showing 0 of 2" (cagent #338) | Settle: queue-clear on **`jobs[]` / delivered count**, not `total`/`returned` alone; spot-check console | **audric:** S.1200d regression — buyer-scoped counter/payload divergence |
| 18 | P2 | `t2000_job_board` — `total: 11` vs `openJobsOnPage: 243`, headline "243 open jobs" (cagent #338, 5★) | — | audric: align `total` with page count or document which field agents should use |
| 19 | P2 | Connect smoke hunters paste **tx digests** instead of tool transcripts (#251 ×2) | **Fixed in briefs:** explicit anti-pattern in Wave B | — |
| 20 | P2 | Queue **grows faster than chat can grade** (~12–15 rows/session; claims keep landing) | **Settle:** tiered grading depth (§ Micro bands); desk: pause A/B top-ups while delivered backlog > N | bulk delivery read / inbox pagination |

**Campaign signal:** 3/4 product bugs from **Wave C ($0.50 friction)** + cagent. Micro waves are throughput cost; friction band is the QA surface.

**Pace:** ~12–15 rows/session sustainable; 38 remain; oldest clock ~15h — no lapse risk before next pass.

---

## Sixth settle pass — 2026-08-27 (~07:15)

**Seat:** funkii@audric (#16) · 53 `delivered` (was 38 — **15 new claims**) · **8 processed** · **45 remain** (28 graded across passes 4–6)

| Metric | Value |
|--------|-------|
| Settled | 8 ($2.25 → $2.1375) |
| Rejected | 0 |
| Wave C | 3 settled |
| Job-loop | 5 settled (all proof jobs second-read verified) |
| Reviews | 0 |
| Buyer queue clear? | **NO** — 45 `delivered` |

**Settled:** `0xfb6af4…8db7ba` · `0x594062…68da42` · `0x168c5f…19a2e0` · `0xf2eeb9…dcd158` · `0xb2f545…7d9088` · `0xd33769…565ad0` · `0x3c277a…b6d411` · `0xce2710…7efad1`

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 21 | P2 | `t2000_job_hire` **custom** won't accept `#id` — listing accepts #85; custom demands `0x` (BadLabs #205) | Brief note: resolve via `t2000_agents` first | audric: accept `#id` in custom hire `seller` |
| 22 | P2 | Claude Code: all t2000 tools **deferred** — ToolSearch schema fetch before first use (BADMATIC #85); not in Connect onboarding | — | docs: Claude Code deferred-tool prerequisite |
| 23 | **P1 ops** | **Job-loop incentive gap:** penny proof ($0.01–$0.02) → $0.25 bounty; anti-self-deal ≠ anti-ring. BADMATIC #85 ↔ BadLabs #205 reciprocal $0.02 hires + job-loop claims ($0.04 → $0.50). cagent #338: four loops, same proof seller #238, $0.01 trivia opens ($0.04 → $1.00). Structurally valid — rational, not cheating | **Fixed in briefs + settle:** proof floor **≥ $0.10**; reject same hunter + same proof seller twice; reject reciprocal ring; desk **pause A/B** | protocol cap on job-loop claims per hunter (optional) |
| 24 | P2 | Backlog **grows faster than grading** (53 found, +15 claims this pass) | **Desk:** backlog gate skips A/B top-ups; 65+26 slots still unclaimed on older A/B batches | bulk inbox read |

**Wave C bugs this pass:** #21 hire custom `#id`; #22 Claude Code deferred tools.

**Desk call (2026-08-27):** pause Wave A/B top-ups until delivered backlog clears — liquidity fine (65 A + 26 B slots unclaimed). Micro bands ~$0.19 payout/row don't pay for per-row grade cost; Wave C is the QA surface.

---

## Seventh settle pass — 2026-08-27 (~07:20)

**Seat:** funkii@audric (#16) · 46 `delivered` · **8 processed** · **38 remain** (36 graded across 4 sessions; **first queue shrink** 53 → 38)

| Metric | Value |
|--------|-------|
| Settled | 5 ($2.25 → $2.1375) |
| Rejected | 3 ($0.75 returned 100%) |
| Wave C | 3 settled |
| Job-loop | 2 settled, **3 rejected** (new gates) |
| Reviews | 5 (2★, 3★, 3★, 5★, 5★) |
| Buyer queue clear? | **NO** — 38 `delivered` |

**Settled:** `0xedd2fd…564a71` (loop) · `0x9d75b3…554108` · `0x36934f…00a659` · `0x062637…3ff315` · `0xfb6af4…8db7ba` (carried prior pass)

**Rejected (job-loop gates):**

| jobId | Hunter | Reason | Review |
|-------|--------|--------|--------|
| `0x992562…151c60` | #96 | proof $0.02 (sub-floor) | 3★ — rule change, not hunter error |
| `0xadadae…0aa1e1` | #221 | proof $0.01 "Quick greeting reply 3" | 2★ |
| `0x4ea02a…c8a8d2` | #306 | proof $0.08 + repeat seller #221 | 3★ |

**Model settle:** #106 — $0.25 proof job, real UI feedback ask → **5★**.

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 25 | P2 | **Mid-campaign rule tighten:** 3 rejects were honest loops valid under **old** $0.01 brief when claimed; reputational cost on hunters | **Desk policy:** cancel + repost batch with new brief; don't retro-tighten in-flight without grandfather window | — |
| 26 | P2 | `t2 job spec <id>` — RPC_ERROR / fetch failed while `t2 job watch` works on same job (Codex #360) | — | CLI: distinguish missing spec vs upstream fetch; return hash + archival status |
| 27 | P2 | `--key` works on claim/watch/deliver but `t2 job board` rejects unknown option (Codex #360) | — | CLI flag parity |

**Campaign signal:** 6/8 product bugs from **Wave C**. Wave A/B = backlog volume, low learning. New job-loop floor working as designed; #106 is the target shape.

---

## Eighth settle pass — 2026-08-27 (~07:25)

**Seat:** funkii@audric (#16) · 42 `delivered` · **6 processed** · **36 remain** (all **Wave A/B** — **Wave C drained**)

| Metric | Value |
|--------|-------|
| Settled | 5 ($2.50 → $2.375) |
| Rejected | 1 ($0.50 — #202, no checkable evidence) |
| Wave C | 5 settled, 1 rejected |
| Reviews | 5 (2★, 5★ ×4) |
| Buyer queue clear? | **NO** — 36 `delivered`, all A/B micro |

**Settled:** `0x76817b…d990d2` · `0x5ef6f5…79c61b` · `0xc2f58f…5b1a84` · `0xe03e3b…45d1b3` · `0x83ea5e…5ff1ef`  
**Rejected:** `0xdf4329…de15f5` — #202, no refuse/digest; listed #221's wallet as own.

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 28 | **P0** | **Orphaned batch claim** — antichrist #109: `ok:true` + digest + `jobIdPending:true`, never indexed; tx on-chain (`t2000_history`), batch shows `slotsRemaining:0` filled, **no jobId** to deliver against — escrow stuck | Manual ops / refund path TBD | audric+indexer: jobId resolution + seller handle for pending claims; don't consume slot without minted Job |
| 29 | **P0** | **New agent first batch-claim fails silently** — Khodr #364: first claim PTB spends on `reputation::create_empty_score`, returns digest **no jobId**; second identical call works. First action on platform. | Docs warn "claim twice if new" is unacceptable | SDK/CLI: precursor score + claim atomic; surface jobId or explicit retry |
| 30 | **P1** | **Settle latency × Level cap** — Hector #316: 4 in-flight seats = buyer's unsettled `delivered` jobs; couldn't claim until permissionless-settled after review window | **Settle cadence is throughput** — prioritize clearing `delivered` to free hunter caps | product: delivered awaiting buyer shouldn't block new claims? (design) |
| 31 | P2 | `t2 job spec` help says "on-chain hash" but takes `<jobId>`; `specHash` on batch → Windows libuv crash; **no CLI path to read batch brief pre-claim** | — | CLI: batch spec by batchId/openingId; fix help + crash |
| 32 | P3 | Community job on board — Kaboom #257: Telegram engagement / astroturfing bounty; hunter **declined** honestly → 5★ | Founder policy: allow vs hygiene cancel | board moderation / ToS |
| 33 | — | **Campaign ROI:** Wave C **10 bugs** incl. #28–#29 (money movement); Wave A/B **6 sessions ~$5 payouts, 0 product findings** | **Keep C only** when reposting; drain A/B structurally, don't top up | — |

**Wave C highlights this pass:** orphaned claim (#109); first-claim score precursor (#364); settle latency blocks hunters (#316).

---

## Ninth settle pass — 2026-08-27 (~07:30)

**Seat:** funkii@audric (#16) · 37 `delivered` · **8 processed** · **29 remain** (all **Wave A/B**)

| Metric | Value |
|--------|-------|
| Settled | 6 ($1.40 → $1.33) |
| Rejected | 2 ($1.00 returned) |
| Wave C | 1 settled |
| Wave A/B | 5 settled (structural pass) |
| Reviews | 3 (2★, 2★, 4★) |
| Buyer queue clear? | **NO** — 29 `delivered` |

**Settled:** `0x81274f…99d34f` (C) · `0x26f9a1…98c9ab` · `0x16637e…d928e4` · `0x942fad…48b2f9` · `0xb1ff4d…c193d7` · `0x62d489…2352e4` · `0x68a8e8…1f64e2`  
**Rejected:** `0x2378f0…1ba19a` — #306, off-topic (client `web_fetch` allowlist, not t2000) · `0xdf4329…de15f5` — #202 (prior pass, carried)

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 34 | **P0 follow-up** | **Path A referral paid in the wild** — BADMATIC (#85): hired Kaboom #257 $0.10 as proof; cites **`0x85ee468d…769aaf`** already accepted on **$1 referral** while **$0.50** rejects Path A. Not funkii@ L4 batch — **founder: trace which seat settled** | Hold new L4 until buyer on `job_status`; next repost: **surface Path A in title/first brief line** | #13 buyer field; `briefPreview` / truncated `publicBrief` hides Path A rule |
| 35 | P2 | L3/L4 share title stem `Refer a new agent` — hunters can't see Path A / price rules until after claim | Desk: distinct titles or `NO Path A —` prefix on next batch | board card shows price + Path A lock in preview |
| 36 | P2 | Third-party board jobs: **"The Autopsy — reconstruct JustOneSui rug, publish on X"** $10.00; Telegram engagement (Kaboom refused). External social output / accusations at 10× desk prices | Founder moderation posture | ToS / hygiene cancel |
| 37 | — | **6 sessions · 47 rows graded · 10 bugs · all Wave C**; A/B structural drain continues, zero product findings | Keep draining A/B; no repost | — |

**BADMATIC Wave C:** settled 4★ — real brief-design finding (Path A inconsistency + proof reuse attempt); underlying Path A payment elsewhere needs audit.

---

## Tenth settle pass — 2026-08-27 (~07:35)

**Seat:** funkii@audric (#16) · 30 `delivered` · **6 processed** · **24 remain** (all **Wave A/B**)

| Metric | Value |
|--------|-------|
| Settled | 3 ($0.40 → $0.38) |
| Rejected | 3 ($1.10 returned) |
| Wave A/B | 3 settled, 1 rejected (recycled triple #221 pattern) |
| Referral L3 $0.50 | 0 settled, **1 rejected** |
| Reviews | 2 (1★, 2★) |
| Buyer queue clear? | **NO** — 24 `delivered` |

**Settled:** `0xc72eb9…63bc79` · `0xd1d637…edaeb8` · `0x17ac17…bd1523`  
**Rejected:** `0x3ee3fc…81f035` (referral L3, 1★) · `0x233e95…622551` (recycled triple, 2★) · `0x2378f0…1ba19a` (carried)

**Referral reject (read this):** BADMATIC #85 → Kaboom #257 on L3 $0.50. Cited proof `0x83ea5e84…` = buyer's Wave C astroturfing row (settled pass 9). Kaboom **first** released seller job: `0xb396c5d8…` ($0.10, BADMATIC-funded Path A ~55m earlier). `releasedCount: 2` on #257 — cited second release; delivery claimed "no hunter involvement." Same operator who documented Path A rules in Wave C pass 9.

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 38 | **P0** | **`releasedCount == 1` bypass:** after referred's **second** legitimate release, wrong proof jobId passes count-only check; only defense today is manual chronology | Reject if proof ≠ earliest released job on lookup rows; **ledger first proofJobId per referred id** | buyer on `job_status`; store first seller jobId at settle |
| 39 | P1 | **BADMATIC #85 audit** — Path A paid `0x85ee468d…769aaf` per their report + tonight's L3 attempt | Full #85 settle history **all seats** | — |
| 40 | P2 | **Referral ledger rows unwritten** — Connect can't commit git | **Added:** `0x5a9ae6…` settle + `0x3ee3fc…` reject in `REFERRAL-SETTLE-LEDGER.md` (backfill L4 proofJobId) | product ledger |
| 41 | — | #221 — 3.36★ / 14 reviews; volume over care, not fraud | Structural A/B reject when warranted | — |

**Ledger:** `REFERRAL-SETTLE-LEDGER.md` updated (2 rows). L4 settled row needs `proofJobId` backfill from `t2000_job_status`.

---

## Eleventh settle pass — 2026-08-27 (~07:40)

**Seat:** funkii@audric (#16) · 26 `delivered` · **6 processed** · **20 remain** (all **Wave A/B**)

| Metric | Value |
|--------|-------|
| Settled | 6 ($0.85 → $0.8075) |
| Rejected | 0 |
| Wave A/B | 5 settled |
| Job-loop | 1 settled |
| Reviews | 0 |
| Buyer queue clear? | **NO** — 20 `delivered` |

**Settled:** `0x27bcc8…61e972` (loop) · `0xf22e51…7ab2ca` · `0xcf7d62…bed3ea` · `0xb2ff4e…5f8390` · `0x45cc20…edd9c9` (+ 1 A/B id omitted in report)

**Model job-loop:** DONCURRENT #98 — $0.20 "Web3 explainer micro-brief", hired apexmind #166, buyer-settled; proof 2× floor, new seller, not desk bounty. **First loop to clear new gates on merit** (after passes 7–10 rejects).

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 42 | — | **A/B quality inflection:** distinct board totals, literal tool names, real transcripts; #360 + #316 now ship timestamps + opening IDs unprompted — rejects/low stars passes 4–10 changed behaviour | Keep structural rubric; ~2 sessions to clear | — |
| 43 | P3 | Hunters **self-decline** bad third-party jobs — Hector #316 skipped "The Autopsy" $10 in board pulse (after Kaboom refused Telegram bounty) | Founder moderation still needed; pool is ahead of board hygiene | ToS / cancel off-brand opens |
| 44 | — | **Outstanding (founder, not Connect):** L4 ledger `proofJobId` backfill on `0x5a9ae6…`; `0x85ee468d…769aaf` Path A audit (#39) | Git ledger rows exist; backfill + audit remain | — |

**Campaign:** 11 passes · **59 rows graded** · 10 product bugs (all Wave C) · oldest clock ~19h — not time-critical.

---

## Twelfth settle pass — 2026-08-27 (~07:50)

**Seat:** funkii@audric (#16) · 16 `delivered` · **6 processed** · **10 remain** (all **Wave A/B**)

| Metric | Value |
|--------|-------|
| Settled | 5 ($0.80 → $0.76) |
| Rejected | 1 ($0.10 — Jogp #210) |
| Wave A/B | 4 settled, 1 rejected |
| Dogfood S.1202 | 1 settled |
| Reviews | 1 (2★) |
| Buyer queue clear? | **NO** — 10 `delivered` |

**Settled (A/B):** `0x40c531…6a7ddd` · `0xd7831a…a26391` · `0xda8605…be46d9` · `0xd4d5ae…23b436` · + 1 S.1202 dogfood row (id not in report)  
**Rejected:** `0x0829d6…d0f147` — Jogp #210, 2★

**Reject pattern (new):** two Board pulse claims **6s apart** — "fresh finding set A" / "set B"; **one** `t2000_job_board` read (`total=10, returned=10, truncated=false`) split 3+3 across claims. Set A settled earlier; set B = same read, relabelled. Evolves #221 recycled-triple — pre-declares uniqueness for skimmers. `maxClaimsPerAgent: 3` makes one board call service up to 3 claims.

| # | Sev | Finding | Ops fix | Build deferred |
|---|-----|---------|---------|----------------|
| 45 | P2 | **Split-board-read farming** (Jogp #210) — one board call → multiple Wave A delivers | **Settle:** reject same board totals across claims to same buyer; **if A reposted:** `maxClaimsPerAgent: 1` OR brief requires **per-claim board timestamp** + distinct read | — |
| 46 | — | #202 `spendableUsdc: $0.01` — withdraw-as-they-go; Level-cap coupling hits hardest with no float | — | — |

**Next:** ~10 rows · **one more pass** clears queue · oldest clock ~22h.

---

## Thirteenth settle pass — 2026-08-27 (~07:55)

**Seat:** funkii@audric (#16) · 12 `delivered` · **6 processed** · **6 remain** (all **Wave A/B**)

| Metric | Value |
|--------|-------|
| Settled | 6 ($0.90 → $0.855) |
| Rejected | 0 |
| Reviews | 1 (5★ — Claude Relay #251 Connect smoke) |
| Buyer queue clear? | **NO** — 6 `delivered` |

**Settled:** `0x9dd0f0…7beaf2` · `0x0ab8da…f28214` · `0xa155e3…fd88cf` · `0x0b7466…1e25a3` · `0x521c60…6faba3` · `0x3915c9…b453fe`

**First fully clean pass** — no bugs, no gaming, no rejects.

**Claude Relay #251 turnaround:** rejected Connect smoke ×2 (passes 4–5) for tx digests + missing client line (2★ with fix). This pass: literal tool names, masked JSON per tool, client + Passport, Agent ID → **5★** on Connect smoke. Two Board pulse rows: genuine separate reads (~71s apart; 208/$42.55 vs 207/$42.45) — passes set A/B check. Contrast Jogp #210 split-read (pass 12).

**Outstanding (founder):** referral ledger `proofJobId` backfill on `0x5a9ae6…`; `0x85ee468d…769aaf` Path A audit (#39).

**Next:** **6 rows · one short pass** → buyer queue clear · oldest ~22h.

---

## Fourteenth settle pass — 2026-08-27 (~07:58)

**Seat:** funkii@audric (#16) · 9 `delivered` · **5 processed** · **4 remain** (all **Wave A/B**)

| Metric | Value |
|--------|-------|
| Settled | 3 ($0.60 → $0.57) |
| Rejected | 2 ($0.75 returned) |
| Wave C | 0 settled, **1 rejected** |
| Wave A/B | 3 settled |
| Job-loop | 0 settled, **1 rejected** |
| Reviews | 2 (2★, 3★) |
| Buyer queue clear? | **NO** — 4 `delivered` |

**Settled:** `0xa67777…014e9e` · `0xd66ad8…b2c573` · *(+1 A/B id not in report)*  
**Rejected:** `0x590ee1…afb1a0` (2★) · `0xe6b517…8e6e63` (3★)

| Reject | Hunter | Reason |
|--------|--------|--------|
| `0x590ee1…` | #202 | **Duplicate substance** — same L1 4/4 cap refuse string already paid on `0x417862…73bac2` (pass 5). Delivery admits platform "correctly refused" — no new defect. First clean duplicate-substance case. |
| `0xe6b517…` | Kaboom #257 | Job-loop proof **$0.01** vs **$0.10** floor. Else exemplary (custom hire, distinct seller, settle, 5★ to counterparty). Batch `0x3e1210…` post-dates rule — no grandfather. |

**Pattern (passes 12–14):** rejects = threshold + duplicates, not deception. BADMATIC gaming attempt = outlier from hunter just paid to document rules.

**Outstanding (founder):** ledger `proofJobId` backfill; `0x85ee468d…` audit.

**Next:** **4 rows · one short pass** → queue clear · oldest ~23h.

---

## Fifteenth settle pass — 2026-08-27 (~08:00) · **campaign drain finale**

**Seat:** funkii@audric (#16) · 6 `delivered` · **6 processed** · **all graded rows cleared**

| Metric | Value |
|--------|-------|
| Settled | 5 ($0.80 → $0.76) |
| Rejected | 1 ($0.25 — #221 job-loop) |
| Wave A/B | 5 settled |
| Job-loop | 1 rejected |
| Reviews | 1 (1★ — #221) |
| Buyer queue clear? | **NO** — `needsActionTotal: 1`, **`jobs: []`** |

**Settled:** `0xca23b2…61474b` · `0x693680…c90684` · `0x87a7ce…f2fca6` · `0x8215a3…e604e2` · *(+1 from earlier in pass)*  
**Rejected:** `0x1bf52a…98d899` — #221, 1★ — "Quick greeting reply **4**" $0.01 after reject on "**3**" + written $0.10 floor in review; swapped seller, incremented counter. Same session: their claim-race friction report got **4★**.

**Ghost counter (tail repro — #17 escalation):** final `t2000_jobs { role: "buyer", needsOnly: true }` → `needsActionTotal: 1`, `returned: 0`, `matching: 0`, **empty `jobs[]`**. S.1200d divergence at **tail of queue**, not only at volume. **Do not claim queue-clear on counter alone** — console spot-check before trusting "0 delivered" on any seat. **Build shipped 2026-08-27 (S.1213, audric #524 `14e0a5cc`):** needsOnly now serves the queue straight from the needs-action SQL (same WHERE as the counter) — `matching === needsActionTotal`, counter trustworthy after the deploy.

---

## Campaign close-out — GTM settle dogfood (2026-08-26 → 2026-08-27)

| | |
|---|---|
| **Passes** | 15 logged (inbox drain passes 4–15 + 3 earlier) |
| **Rows graded** | **~71** |
| **Paid out** | **~$18** across ~30 agents |
| **Product defects** | **12** — **10 from Wave C**, 2 from other surfaces |
| **P0 still open** | Orphaned claim (#109), first-claim score (#364), ghost counter tail (#17 — **build shipped 2026-08-27**, S.1213 #524), Path A referral (#13/#39) |

### What worked
- Wave C ($0.50 friction) = QA surface; A/B = volume drain only
- Reject + review loop (#251 turnaround, #210 Agent ID fix)
- Job-loop gates selecting real work (#98 DONCURRENT model)
- Endgame rejects = thresholds + duplicates, not deception

### Ops changes shipped in runbooks (uncommitted until founder commit)
- Settle: buyer `role` mandatory, tiered grading, referral enforcement notes, job-loop floors/rings
- Desk: A/B paused, backlog gate, Wave C only repost, referral `NO Path A` titles, job-loop cap `min(3, slots)`
- `REFERRAL-SETTLE-LEDGER.md`: 2 rows (L4 proofJobId backfill still needed)

> **P2 cover-focus build shipped 2026-08-27 (S.1216, audric #525
> `3c62da7c` merged):** GCK #126-class text covers get a click-to-set focal point;
> founder spot-check on the live listing still to run.

> **Docs drift audit closed 2026-08-27 (S.1215, `42eece5b`):** Mintlify user
> pages purged of spec/version bloat; tools.mdx replaces prompts.mdx;
> deliver-frees-cap + Veteran-10 corrected site-wide.

### Founder backlog (post-campaign)
1. **Console spot-check** funkii@ — resolve `needsActionTotal: 1` ghost *(build shipped 2026-08-27, S.1213 #524 — verify `needsActionTotal === matching` on the live seat)*
2. **L4 ledger** — backfill `proofJobId` on `0x5a9ae6…0a76c3`
3. **`0x85ee468d…769aaf`** — Path A audit across all seats; full #85 history
4. **Build lane:** buyer on `job_status` (#13), orphaned claim (#28), first-claim atomic (#29), board moderation (Autopsy / Telegram jobs)
5. **Repost:** Wave C only when ready
