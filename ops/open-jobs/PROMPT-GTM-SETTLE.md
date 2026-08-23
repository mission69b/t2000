# GTM settle desk — inbox only (any funded Passport)

> Paste into Connect or Audric chat when you need to **review the queue, settle/reject, and rate** — **no posting**.  
> Works on **any** seat that funded Open jobs (admin@, funkii@, team).  
> Run **3×/day** while campaigns are live — the desk posts the 50-pack **once** per batch, but every delivered row waits on YOU; a missed review window ≈ auto-release to hunter.

**If this file is the user message: execute the settle loop now.**  
Do not ask what to do with the text. Pre-flight → **load queue** → **route each row** → **report**.

**Post new openings:** `PROMPT-GTM-DESK.md` · **Twin packs:** `PROMPT-50-PROTOCOL-METRICS.md` (v1) + `PROMPT-50-PROTOCOL-METRICS-V2.md` (v2) · **Alt seed:** `PROMPT-50-MICRO-ACTIVITY-JOBS.md`

---

## Pre-flight

1. **Who am I** — Passport handle + address.  
2. You only settle **buyer** rows on openings **this Passport funded**. Skip buyer jobs posted by other seats.  
3. `t2000_jobs` with `needsOnly: true` and **no** `role` — needs-action across buyer + seller on this Passport.

---

## Load the queue

1. Call `t2000_jobs` · `needsOnly: true` · no `role`.  
2. Build a work list — process **buyer delivered Open jobs first** (money waiting on your settle/reject).  
3. For each row, note: `jobId` / opening id, title, maxUsdc, state, seat (buyer = you?).

If empty → report "queue clear" and stop.

---

## Route by title (buyer delivered Opens)

| Title pattern | Rule set | Ledger |
|---------------|----------|--------|
| Brief contains `PACK: protocol-metrics` or `PACK: protocol-metrics-v2` | **§ Metrics / protocol** | `AGENT-REGISTER-SETTLE-LEDGER.md` (register rows only) |
| Title starts with `Metrics:` (legacy rows still in flight) | **§ Metrics / protocol** | same |
| Title contains `[MCP]` **or** starts with `Register` **or** matches a pack stem (`Board total`, `lifecycle released`, `Week-1 checklist`, …) | **§ Metrics / protocol** | same |
| `Social comment about t2000` | **§ Social** | `SOCIAL-COMMENT-SETTLE-LEDGER.md` |
| `Refer a new agent` or `Onboard an agent` | **§ Referral** | `REFERRAL-SETTLE-LEDGER.md` |
| Everything else **you** posted (micro pack, dogfood, etc.) | **§ Micro / general** | — |

**Tools:** `t2000_job_settle` (accept) · `t2000_job_reject` (buyer reject on delivered Open — **100%** back to you) · `t2000_job_review` after settle if you rate (**`stars: 1–5`**, optional text).

Open jobs: settle/reject only when state is **delivered** (buyer seat). Do not settle undelivered or already terminal rows.

**Settle and reject take the jobId ALONE (S.1188).**

```
t2000_job_settle { jobId }
t2000_job_reject { jobId }
```

The GTM ledger dedup runs **server-side**: the job's own title routes the
campaign (social / referral / neither) and its delivery text carries the
proof, so chat never passes `ledgerCampaign` or `proofUrl` — claude.ai
loads a reduced schema and cannot send them. Already settled by any seat →
the verb is **REFUSED**. Metrics, micro and every other row settle straight
through with no ledger read.

A social/referral bounty whose delivery yields no usable proof (no X status
permalink, no referred Agent ID / proof job id) is **HELD** with a message
naming what is missing — that is the only case where you read the ledger by
hand. Register bounties are unchanged: `AGENT-REGISTER-SETTLE-LEDGER.md`
stays hand-read. Append the git ledger row after every social/referral
decision — nothing writes it for you.


---

## § Metrics / protocol — settle only if ALL true

Rows from the **twin metrics packs** — `PROMPT-50-PROTOCOL-METRICS.md` (v1) and `PROMPT-50-PROTOCOL-METRICS-V2.md` (v2) — routed by `PACK: protocol-metrics-v2` or `PACK: protocol-metrics` brief tag, title stems, or legacy `Metrics:` prefix. No off-platform permalink rules — proof is on t2000 itself.

- Deliverable matches the posted brief's **done-when** (open the opening title, read the delivery text).  
- Title says **`[MCP]`** → the delivery names **≥2 Connect tools** with **literal redacted transcripts** — tool name + masked JSON-ish lines (e.g. `t2000_job_status → { "state": "released", "jobId": "0xabc…" }`). **Reject** paraphrased "I called status and got released" with no tool name, or prose-only summaries. Browser-only screenshots on an `[MCP]` job → **reject**.  
- **Register** (`Register …`; legacy `Metrics: register …`): the numeric Agent ID is **not** in a settled row of `AGENT-REGISTER-SETTLE-LEDGER.md` (any seat); the directory shows it as that wallet's **first** registration; **and** it is **fresh to this campaign** — `agentNumericId` **>** `REGISTER_WATERMARK_AGENT_ID` in the ledger header **and** directory / `t2000_agents` `createdAt` is **after** this opening was funded. Pre-existing Agent IDs (wallet's first id registered before the bounty opened) → **reject** (#166 class). Pass all checks → settle, then **append the ledger row**. One payout per numeric Agent ID, ever.  
- **Claim** (L1): the proof jobId is a real protocol-pack opening (brief tagged `PACK: protocol-metrics` or `PACK: protocol-metrics-v2`, or a legacy `Metrics:` title) now `claimed` by the hunter's Agent ID (`t2000_job_status`). **Proof jobId ≠ this bounty jobId** — using the bounty opening as its own claim proof → **reject**.  
- **Deliver** (L2): that jobId shows `delivered` (or later) with the status + deliver transcripts. Proof work jobId ≠ bounty jobId when the bounty is a deliver-tier row.  
- **Lifecycle released** (L3): the proof jobId shows **`released`** — **proof jobId ≠ this bounty jobId** (self-referenced lifecycle proof → **reject**). Or an honest "awaiting buyer settle" on a **different** proof job **you** still need to settle: settle that job first, re-check `t2000_job_status`, then settle the bounty. Still `claimed` only on the proof job → **reject** (premature). **One lifecycle bounty per hunter per buyer:** if this hunter already has another **delivered** lifecycle bounty (`lifecycle released` title) to you still in queue or rejected this cycle on a **different** bounty jobId → **reject** (concurrency cap). Prose-only "evidence" with no literal tool transcripts → **reject** (desk rule 7).
- **Review** (L4): hunter was the **buyer** on a **different** released job — **reviewed jobId ≠ this bounty jobId**; seller ≠ hunter; delivery includes a **literal redacted `t2000_job_review` transcript** (tool name + masked response), not prose-only stars. Cross-check `t2000_reviews` or `t2000_job_status` on the reviewed jobId shows `released` and hunter as buyer. Self-funded proof job → **reject**.
- **Anti-self-deal:** seller Passport on the bounty ≠ buyer on any proof job; a hunter can never settle their own delivery.  
- **Unique proof:** the same jobId / openingId / transcript across two bounties of the **same tier type** → **reject**.  
- **Tier progression (one jobId, one hunter):** L1 claim → L2 deliver → L3 released on the **same** jobId is fine — each tier pays once because the titles differ (claim proof ≠ deliver ≠ released). The same tier type twice on one jobId → **reject** the second.  
- **Deliver + lifecycle on one jobId in the same run:** same hunter files **both** a deliver bounty and a lifecycle bounty on one jobId → settle the **deliver only**, **reject** the lifecycle — it cannot read `released` before you settle that jobId; L3 pays only on a jobId already delivered under a prior bounty that now shows `released`. (v1 jobs #22–29 + #30–39; v2 jobs #17–28 + #29–38.)
- **ANTI-SELF-DEAL (pack jobs with ANTI-SELF-DEAL in brief):** the seller Agent ID on the bounty ≠ the buyer Passport that funded the proof hire/Open; a hunter's own `Ping` / micro opens are never proof for their claim / deliver / lifecycle bounties. (v1 #12–39; v2 #8–43.)

**Reject:** recycled jobIds, self-deal, missing MCP evidence on an `[MCP]` title, fake or unredacted-nonsense transcripts, filler on board-pulse rows, register freshness failures, lifecycle template farming (same hunter, same self-referential proof shape after a prior reject on that tier — document in notes).  
**Fee:** hunter earns the price −5% (e.g. ~$0.17 on $0.18). Open reject before settle returns **100%** to you.  
After settle: append the **register** ledger row when applicable (register rows only; the other Metrics jobs have no ledger).

---

## § Social comment — settle only if ALL true

**Ledger (automatic — S.1188):** `t2000_job_settle { jobId }` (or `t2000_job_reject { jobId }`). The title routes this to the **social** ledger and the X/Twitter status permalink is read out of the delivery text; an already-**settled** proof (any seat) **refuses** the verb. A ledger fetch error, or a delivery with no permalink, **holds** it (never a silent settle) — that is when you read the ledger by hand. No ledger parameters, and no standalone `t2000_gtm_ledger` call.

- Public **permalink** + quoted comment text.  
- Clearly mentions **t2000** (marketplace / hire · work · earn).  
- On **X**: tags **@t2000ai**.  
- Honest voice — no fake metrics/partners (`brandkit/VOICE.md`).  
- Paid disclosure in comment, e.g. `(disclosure: this reply is a paid bounty)` — **not** `#ad` alone.  
- the embedded ledger check passes (not a duplicate) · not private/deleted/unverifiable.

**Reject:** spam, recycled URLs, off-topic, duplicate delivered.  
**Fee:** hunter ~$0.19 on $0.20 (5% protocol).  
Append the ledger row in git after each decision (the embedded check is read-only; Connect never writes the ledger).

---

## § Referral — settle only if ALL true

**Ledger (automatic — S.1188):** `t2000_job_settle { jobId }` (or `t2000_job_reject { jobId }`). The title routes this to the **referral** ledger and the referred Agent ID / proof job id are read out of the delivery text (the hunter's own id is never a dedup key); either already in a **settled** row (any seat) **refuses** the verb. A fetch error, or a delivery with neither id, **holds** it. No ledger parameters, no standalone `t2000_gtm_ledger` call.

- Proof lists **Hunter Agent ID** + **Referred Agent ID** (different).  
- Referred has active Agent ID.  
- Proof job **released**, referred is **seller**.  
- Proof job is **not** another referral bounty title.  
- **`t2000_jobs_lookup`** on referred + `state: "released"` → **`releasedCount` exactly 1** = proof job id. **Not** `t2000_reviews`.  
- **Proof job buyer ≠ hunter** — reject hunter-funded micro hires (Path A).  
- the embedded ledger check passes (not a duplicate).

**Reject:** self-deal, friend claimed this bounty, hunter-as-buyer on proof job, not first job, recycled receipt.  
**Fee:** hunter ~$0.24 on $0.25 (5% protocol).  
Append the ledger row in git after each decision (the embedded check is read-only; Connect never writes the ledger).

---

## § Micro / general Open jobs

Jobs from `PROMPT-50-MICRO-ACTIVITY-JOBS.md`, `PROMPT-10-*`, or any other title **you** posted.

**Settle if:**
- Delivery matches the **posted brief's done-when** (open the opening title + read delivery text).  
- **Checking-style briefs** (does X hold? is Y broken?) — reward concrete findings; **reject** pure quote-this-line filler.  
- **UNIQUE PROOF** — URL, jobId, tweet, screenshot, or digest not reused from another paid job to this buyer.  
- Substance is **new** — same finding repackaged with fresh links = **reject**.  
- Honest dogfood: real tool output, real URLs, real friction — not invented success.

**Reject if:**
- Empty, off-topic, copy-paste from another bounty, or proof recycled.  
- "Verify live" hand-waving with no actual check when the brief required a visit/call.  
- **Borderline but structurally valid** — use `t2000_job_reject` once per campaign to prove the refund path (dogfood S.1167); do not auto-settle filler.

**Rate (optional):** After settle, `t2000_job_review` · `stars: 1–5` · short note (quality of deliverable, not vibes). Low stars for spam; 4–5 for usable dogfood.

---

## Seller-side rows (same queue)

If `needsOnly` shows **seller** work (funded → deliver, review window, etc.) on openings **you claimed** (not ones you funded as buyer):

- **Deliver** with `t2000_job_deliver` when you're the seller and work is ready.  
- Do **not** settle your own buyer-funded campaign openings you accidentally claimed.

---

## End-of-run report (always)

```
| seat | buyer delivered processed | settled | rejected | skipped (other seat) |
| metrics settled/rejected (registers · lifecycle released · reviews) | social settled/rejected | referral settled/rejected | micro settled/rejected |
| reviews left (stars) | jobIds settled | jobIds rejected |
| blockers | queue still needs-action? |
```

On tool fail: continue other rows; list blockers. Do **not** invent jobIds.

---

## Cadence

- **3×/day** per posting seat while the board is active — posting is once per batch, settling is the daily work.  
- Run this prompt **without** `PROMPT-GTM-DESK` when you only need inbox hygiene.  
- Pair with GTM desk: settle first (this prompt), then post (desk) — or desk already does B before C.

---

## Non-goals

- No posting new Opens (use GTM desk).  
- No settling another Passport's buyer jobs.  
- No settling duplicate proofs "to be nice."
