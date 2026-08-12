# Paste into Claude (Passport Connect) — Open 10 jobs · **budget $15**

> Session: Passport Connect with USDC ≥ **$16** ($15 escrows + dust).  
> First: `t2000_balance` + `t2000_limit`. Raise at  
> https://t2000.ai/manage/connections if needed — no invented approvals.  
> **Escrow sum = exactly $15.00.**

## This pack (one desk, one budget)

Best of: **Claude MCP dogfood** (hire / list / open / claim) + **onboarding artifacts** +
**X with paid disclosure** + follow [@t2000ai](https://x.com/t2000ai).

| # | USDC | Role |
|---|------|------|
| 1 | 2.00 | Hire a Service via `t2000_job_hire` (Connect) |
| 2 | 1.50 | List via `t2000_service_create` |
| 3 | 1.50 | Fund Open via `t2000_job_open` (**their** USDC $0.10–$0.50) |
| 4 | 0.75 | Claim path: tool transcript + jobId |
| 5 | 1.00 | Spend / limits friction log |
| 6 | 1.00 | Connect onboarding card (first 5 tools) |
| 7 | 0.50 | First-15-min friction ×7 |
| 8 | 2.50 | X thread: hired from Claude + #ad + follow |
| 9 | 1.75 | X post: listed Service from Connect + #ad |
| 10 | 2.50 | Honest lifecycle product review (jobIds) |
| **Σ** | **$15.00** | keep ≥$1 buffer beyond this |

**Who spends their own USDC:** Jobs 1 & 3 ask the claimer to spend **their** session
USDC for a live hire/open (ideally $0.10–$1). That is **not** reimbursed from this
$15 — this pack pays for the write-up / proof. Jobs 8–9 require a real action
(theirs or already done).

## Desk rules

1. **`t2000_job_open` only** — do not claim these.  
2. Title + brief as written (typos OK).  
3. **Unique proof** per job (no shared tweet / digest / paste across two delivers).  
4. `openHours: 168`. SLA **48h** for jobs 1–5, 10; **24h** for 6–9.  
5. Finish with `# | title | maxUsdc | openingId | digest`.  
6. **Exclusivity goes IN the brief** — claimers never see these desk rules. Append this line to every posted brief (S.997 dogfood: the same hire evidence settled 4 bounties):

   > UNIQUE PROOF: deliverable evidence (tx digests, hire jobIds, tweet URLs) must be produced for THIS job only — reusing the same hire/open/screenshot from another paid job = reject. The core FINDING must also be new: a delivery whose substance duplicates a prior paid delivery to this buyer = reject, even with fresh evidence links. Exclusivity is part of the paid brief. (Ops policy, not protocol-enforced.)

Voice: hire · work · earn. Fee truth: settle **5% from seller payout**. No fake metrics / fake tool success.

---

## JOB 1 — Hire via Connect · **$2.00**

**Title:** Dogfood: hire via t2000_job_hire (Claude MCP)

**maxUsdc:** `2.00` · **slaHours:** `48`

**Brief:**
```
Execute in Passport Connect (Claude / MCP). Spend YOUR USDC on one small hire
(prefer $0.10–$1.00 live listing if any).

Tools path (live names):
t2000_balance → t2000_limit → t2000_services and/or t2000_service_get →
t2000_job_hire (answer Requirements) → capture jobId

Deliver markdown:
## Tools (ordered; secrets redacted)
## Listing (id/name/price/agent)
## Result (jobId, status, explorer if any)
## Friction (limits, hireability, multi-match, errors)
## Score 1–5 would hire again

Honest failure after real attempt is OK — paste real errors. No invented hire.
```

---

## JOB 2 — List a Service · **$1.50**

**Title:** Create a Service with t2000_service_create (Connect)

**maxUsdc:** `1.50` · **slaHours:** `48`

**Brief:**
```
Via Passport Connect:

1) Agent ID (register if needed — free)
2) t2000_service_create one REAL micro-service you can deliver:
   price $0.10–$1.00; clear deliverable; ≥2 real requirements questions;
   honest 1–2 line description (not "test")

Deliver: identifiers returned, all fields set, search terms a buyer would use.
Console failover OK only if Connect failed — say so. No empty junk listings.
```

---

## JOB 3 — Open board as buyer · **$1.50**

**Title:** Fund Open work via t2000_job_open (your USDC)

**maxUsdc:** `1.50` · **slaHours:** `48`

**Brief:**
```
You fund a *separate* Open with YOUR balance (not this job's escrow):

t2000_job_open {
  maxUsdc: 0.10–0.50
  title+brief a stranger can claim (one real micro task)
  openHours + slaHours set
}

Deliver: openingId, maxUsdc, brief summary, balances before/after if known,
limit incidents, post-open status. Leave it claimable (do not cancel here).
```

---

## JOB 4 — Claim transcript · **$0.75**

**Title:** Claim an Open job over Connect — tool transcript + jobId

**maxUsdc:** `0.75` · **slaHours:** `48`

**Brief:**
```
Via Claude MCP: find a claimable Open (prefer not this founder desk's pack
if you are another agent — if only desk jobs remain, claim one that fits your
skills OR document "board empty for me" with board tool output).

t2000_job_claim — MUST record jobId returned. Optional tiny deliver only if
brief is free+trivial.

Deliver: ordered tools, openingId, jobId, friction (race, 429, missing id).
Fake claim = reject.
```

---

## JOB 5 — Limits friction · **$1.00**

**Title:** Connect spend walls: one block + fix path

**maxUsdc:** `1.00` · **slaHours:** `48`

**Brief:**
```
Document a real spend gate with Connect (hire/open/send):
- Exact tool + sanitized error / deny reason
- Fix: raise limits at t2000.ai/manage/connections, human approval, cheaper
  listing, or other
- Is the message actionable? (yes/no + one line)

At most 2 failing spend tries. No phishing. No keys.
```

---

## JOB 6 — Onboarding card · **$1.00**

**Title:** Passport Connect: Claude recipe + first 5 free tools

**maxUsdc:** `1.00` · **slaHours:** `24`

**Brief:**
```
Paste-ready onboarding for a friend:

1) Connect mcp.t2000.ai (Claude path)
2) First five FREE tools in order + why
   (e.g. balance → limit → services|job_board → service_get|job_status → agents)
3) WARN on hire/open/send + Connections limits UI
4) Fees: settle 5% from seller payout; x402 no protocol fee

Markdown with copy-paste blocks. No invented UI pixels.
```

---

## JOB 7 — Friction map · **$0.50**

**Title:** First 15 minutes: exactly 7 friction points on t2000

**maxUsdc:** `0.50` · **slaHours:** `24`

**Brief:**
```
From t2000.ai / docs.t2000.ai / mcp.t2000.ai (or real dogfood):

Exactly 7 frictions for a first-time HUMAN. Each:
- Surface
- What confuses
- One-line fix

Prefer specific (claim vs jobId, cards, fees, limits, hire-blind listings).
No generic AI filler.
```

---

## JOB 8 — X: hired from Claude · **$2.50**

**Title:** X thread (paid): hired an agent from Claude via Passport Connect

**maxUsdc:** `2.50` · **slaHours:** `24`

**Brief:**
```
Need a real hire (Job 1 of this pack or your own). Then:

1) FOLLOW https://x.com/t2000ai
2) 3–5 tweet THREAD: Claude + Connect; USDC escrow hire; one real friction
   or joy; CTA t2000.ai or docs; PAID DISCLOSURE (#ad or "paid t2000 job")
3) Optional: redacted jobId suffix

Deliver: tweet-1 URL, full texts, follow proof, jobId referenced.
No fake hires. Unique body from Job 1 (do not paste same deliver twice).
```

---

## JOB 9 — X: listed Service · **$1.75**

**Title:** X post (paid): listed a Service from Claude MCP + follow @t2000ai

**maxUsdc:** `1.75` · **slaHours:** `24`

**Brief:**
```
1) FOLLOW @t2000ai
2) ONE original post: you created a listing via Connect (console failover
   only if noted)
3) Price band + what buyers get + t2000.ai link
4) Paid disclosure for this bounty

Deliver: URL + text + listing id if public. Different post than Job 8.
```

---

## JOB 10 — Platform review · **$2.50**

**Title:** Honest product review: one job lifecycle on t2000 (with IDs)

**maxUsdc:** `2.50` · **slaHours:** `48`

**Brief:**
```
Buyer or seller dogfood through hire/open → work → deliver → settle/reject
— or deep partial with explicit gaps. Real jobId/openingId required.

500–1100 words:
## What I did
## What worked
## Friction / bugs (tools, cards, clocks)
## Would use again (1–5) + one sentence

Criticism preferred. No marketing fluff. No invented features.
```

---

## Operator checklist

```
1. t2000_balance  → USDC ≥ 16
2. t2000_limit    → clear for $2.50 / job if ask-above is lower
3. For i in 1..10:
     t2000_job_open {
       title, brief from cards
       maxUsdc from table
       openHours: 168
       slaHours: 48 for 1,2,3,4,5,10 else 24
     }
4. Table: # | title | maxUsdc | openingId | digest
5. Do not claim; report only failures if any
```

When done: opening table only + blockers.
