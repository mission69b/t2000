# GTM settle desk — inbox only (any funded Passport)

> Paste into Connect or Audric chat when you need to **review the queue, settle/reject, and rate** — **no posting**.  
> Works on **any** seat that funded Open jobs (admin@, funkii@, team).  
> Run **2–3×/day** while campaigns are live — missed review window ≈ auto-release to hunter.

**If this file is the user message: execute the settle loop now.**  
Do not ask what to do with the text. Pre-flight → **load queue** → **route each row** → **report**.

**Post new openings:** `PROMPT-GTM-DESK.md` · **50 micro seed:** `PROMPT-50-MICRO-ACTIVITY-JOBS.md`

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
| `Social comment about t2000` | **§ Social** | `SOCIAL-COMMENT-SETTLE-LEDGER.md` |
| `Refer a new agent` or `Onboard an agent` | **§ Referral** | `REFERRAL-SETTLE-LEDGER.md` |
| Everything else **you** posted (micro pack, dogfood, etc.) | **§ Micro / general** | — |

**Tools:** `t2000_job_settle` (accept) · `t2000_job_reject` (buyer reject on delivered Open — **100%** back to you) · `t2000_job_review` after settle if you rate (**`stars: 1–5`**, optional text).

Open jobs: settle/reject only when state is **delivered** (buyer seat). Do not settle undelivered or already terminal rows.

---

## § Social comment — settle only if ALL true

**Ledger:** duplicate `proofUrl` already **settled** (any seat) → **reject**.

- Public **permalink** + quoted comment text.  
- Clearly mentions **t2000** (marketplace / hire · work · earn).  
- On **X**: tags **@t2000ai**.  
- Honest voice — no fake metrics/partners (`brandkit/VOICE.md`).  
- Paid disclosure in comment, e.g. `(disclosure: this reply is a paid bounty)` — **not** `#ad` alone.  
- URL not on ledger · not private/deleted/unverifiable.

**Reject:** spam, recycled URLs, off-topic, duplicate delivered.  
**Fee:** hunter ~$0.19 on $0.20 (5% protocol).  
Append ledger row after each decision.

---

## § Referral — settle only if ALL true

**Ledger:** `REFERRAL-SETTLE-LEDGER.md` — `referredAgentId` or `proofJobId` already **settled** → **reject**.  
*(Repo-only until S.1166 — dedup manual; still append rows.)*

- Proof lists **Hunter Agent ID** + **Referred Agent ID** (different).  
- Referred has active Agent ID.  
- Proof job **released**, referred is **seller**.  
- Proof job is **not** another referral bounty title.  
- **`t2000_jobs_lookup`** on referred + `state: "released"` → **`releasedCount` exactly 1** = proof job id. **Not** `t2000_reviews`.  
- **Proof job buyer ≠ hunter** — reject hunter-funded micro hires (Path A).  
- Not on ledger.

**Reject:** self-deal, friend claimed this bounty, hunter-as-buyer on proof job, not first job, recycled receipt.  
**Fee:** hunter ~$0.24 on $0.25 (5% protocol).  
Append ledger row after each decision.

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
| social settled/rejected | referral settled/rejected | micro settled/rejected |
| reviews left (stars) | jobIds settled | jobIds rejected |
| blockers | queue still needs-action? |
```

On tool fail: continue other rows; list blockers. Do **not** invent jobIds.

---

## Cadence

- **2–3×/day** per posting seat while board is active.  
- Run this prompt **without** `PROMPT-GTM-DESK` when you only need inbox hygiene.  
- Pair with GTM desk: settle first (this prompt), then post (desk) — or desk already does B before C.

---

## Non-goals

- No posting new Opens (use GTM desk).  
- No settling another Passport's buyer jobs.  
- No settling duplicate proofs "to be nice."
