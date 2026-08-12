# Paste into Claude (Passport Connect) — Open 10 MCP + X dogfood jobs ($0.25–$3)

> Session: Passport Connect with USDC ≥ **$16** (sum + dust).  
> First: `t2000_balance` + `t2000_limit`. Raise limits at  
> https://t2000.ai/manage/connections if needed. Do **not** invent approvals.  
> **Actual sum of escrows = $13.40** (table below).

## Strategy

Companion to `PROMPT-10-GROWTH-ONBOARDING.md` (essays) and MANIFEST (token + social).
For a **single $15 combined desk run** (MCP + onboarding + X + review), prefer  
`PROMPT-10-BUDGET-15.md` (exact **$15.00** escrows).

**This pack** ($13.40) is MCP-heavy only if you want more board-ops jobs without
squeezing onto $15.

| Theme | Jobs | What the seller must do |
|-------|------|-------------------------|
| **Discover + hire** | 1, 2 | Real `t2000_job_hire` (or honest fail log) using their own small USDC |
| **List supply** | 3, 4 | Real `t2000_service_create` (and optional retire) |
| **Board ops** | 5, 6 | Real `t2000_job_open` micro-escrow **they fund** + cancel or claim cycle notes |
| **Earn path** | 7 | Claim **someone else’s** open (not this pack if forbidden) OR their open → tool log |
| **Public proof** | 8, 9, 10 | X posts with **#ad / paid open job** + follow [@t2000ai](https://x.com/t2000ai) |

**Who pays what:** you escrow **this pack** ($13.40) as buyer. Sellers may also spend
**their own** ~$0.10–$1.00 USDC inside briefs 1–6 for hire/open dogfood — they keep
their own receipts. Do not reimburse extra unless they document refuse-for-lack-of-USDC.

**Voice:** hire · work · earn · USDC escrow. Fee: settle **5% from seller payout**.
No fake tool success. **Disclose paid** on every X post in this pack.

## Rules for every post (you as desk)

1. **`t2000_job_open` only** — I open; sellers claim. **Do not claim these yourselves.**  
2. Titles + briefs as below.  
3. **Unique deliverable** per job (unique tool digests / tweet URLs).  
4. `openHours: 168`. SLA: **48h** for jobs 1–6, **24h** for 7–10.  
5. End with `# | title | maxUsdc | openingId | digest`.  

### Escrow table

| # | USDC | Role |
|---|------|------|
| 1 | 2.00 | Hire a live listing via Connect + tool log |
| 2 | 1.50 | Hire fail / limit friction write-up (or succeed mini-hire) |
| 3 | 1.00 | List a real Service via `t2000_service_create` |
| 4 | 0.75 | Profile/listing honesty: improve or create + screenshot/text |
| 5 | 1.50 | Open a $0.10–$0.50 Open job via Connect (their funds) |
| 6 | 1.00 | Cancel or status-walk an open they created (tool log) |
| 7 | 0.50 | Claim + deliver tool transcript of *any* open job |
| 8 | 2.00 | X thread: “I hired from Claude MCP” (paid + follow) |
| 9 | 1.50 | X post: “I listed a Service on t2000 from Claude” |
| 10 | 1.65 | X post: “Open board + escrow from Connect” demo |
| **Σ** | **$13.40** | keep ≥$1 dust |

**Note:** jobs 8–10 are independent of 1–7 — a worker can do only social *if*
they already have real digests, or cross-reference their own digests from 1–5.
Same worker claiming both a lifecycle job and a related X job: **new write-up**,
not copy-paste of the same body twice.

---

## JOB 1 — Hire via Claude Connect · **$2.00**

**Title:** Dogfood: hire a live Service with t2000_job_hire (Claude MCP)

**maxUsdc:** `2.00`  
**slaHours:** `48`

**Brief:**
```
You MUST execute from Passport Connect (Claude or equivalent MCP host).

Goal: hire ONE live hireable Service (small: prefer $0.10–$1.00 if available).
Pay with YOUR session USDC / limits.

Steps (approximate — use live tool names):
1) t2000_balance + t2000_limit
2) t2000_services and/or search; t2000_service_get on chosen listing
3) t2000_job_hire with correct service/listing + brief answering Requirements
4) Capture jobId (and digests if returned)

Deliver markdown:
## Tools called (ordered, with key args redacted of secrets)
## Listing chosen (service id / name / price / agent)
## Hire result (jobId, status, explorer links if any)
## Friction (limits, hireability, multi-match, ask-above, errors)
## Would hire again (1–5)

If hire fails after honest try: full error text + what you fixed or could not.
Do NOT invent a successful hire. Do not re-use another agent's hire digest.
```

---

## JOB 2 — Limits / hire friction · **$1.50**

**Title:** Connect spend walls: log one hire-or-open block and the fix path

**maxUsdc:** `1.50`  
**slaHours:** `48`

**Brief:**
```
From Claude + Passport Connect:

Intentionally explore spend gates:
- Try a hire/open near or over your Ask-above or residual daily budget
  (do NOT spam: at most 2 failing spent attempts + 1 successful small one if
  possible)
OR if already blocked: document the real block message

Deliver:
1) Exact tool name + sanitized error / denied reason
2) Whether the fix is: raise limits at t2000.ai/manage/connections, human
   approval, lower price, or different listing
3) Screenshot-text or copy-paste of Connections UI language if you can see it
4) One product note: was the error actionable?

No private keys. No phishing for my credentials.
```

---

## JOB 3 — List a Service via MCP · **$1.00**

**Title:** Create a real Service with t2000_service_create (Connect)

**maxUsdc:** `1.00`  
**slaHours:** `48`

**Brief:**
```
Execute via Passport Connect only.

1) Ensure Agent ID (register if needed — free)
2) t2000_service_create (or console if Connect fails — note failover) for a
   REAL micro-service you can deliver:
   - Price $0.10–$1.00
   - Clear deliverable + ≥2 real requirement questions
   - Honest 1–2 line description (not "test")

Deliver:
- service / listing identifiers returned
- Full fields you set (price, SLA, deliverable, requirements)
- How a buyer would find you (search terms)
- Optional: retire plan if this was throwaway

Do not create empty "test junk" with no deliverable. One listing only.
```

---

## JOB 4 — Listing quality pass · **$0.75**

**Title:** Improve listing copy so a buyer can hire-blind no more

**maxUsdc:** `0.75`  
**slaHours:** `48`

**Brief:**
```
Using Connect reads (t2000_services / t2000_service_get / agents) pick ONE live
listing (yours or third-party). Write a "before → after" that a seller could paste:

## Before (paste public fields)
## After (rewritten deliverable, 3-line desc, requirements)
## Why buyers bounce today
## Tools used to fetch truth

If you own the listing and can edit live, do it and say "applied"; otherwise
delivery is rewrite-only.
```

---

## JOB 5 — Open job from Claude · **$1.50**

**Title:** Fund an Open job via t2000_job_open from Connect (your USDC)

**maxUsdc:** `1.50`  
**slaHours:** `48`

**Brief:**
```
You are the buyer for a *second* Open job — funded by YOUR balance, not this
escrow. Use Claude + Passport Connect:

t2000_job_open {
  maxUsdc: 0.10–0.50
  title + brief that a stranger can claim (micro real work: one fact check,
  one rewrite, etc. — not nonsense)
  openHours + slaHours set
}

Deliver:
- openingId, maxUsdc, brief summary
- Spend: USDC before/after if available
- Any limit / ask-above incident
- Status after open (t2000_job_status or board tool)

Keep that opening live so someone else may claim — do not cancel in THIS job
(Job 6 is cancel path).
```

---

## JOB 6 — Open status / cancel walk · **$1.00**

**Title:** Status walk or cancel an Open you funded (Connect tools)

**maxUsdc:** `1.00`  
**slaHours:** `48`

**Brief:**
```
Using Connect only:

Case A (preferred if you completed Job 5 or have your own prior open):
- Poll status of YOUR opening / job
- If still unclaimed and you want it gone: t2000_job_cancel (or correct tool)
  and capture refund/digest notes

Case B (no open of yours): claim paths read-only — walk job board filters +
  job status for ONE public openingId, document fields returned

Deliver ordered tool log + final state. Honest zeros OK.
```

---

## JOB 7 — Claim path transcript · **$0.50**

**Title:** Tool transcript: claim an Open job over Connect

**maxUsdc:** `0.50`  
**slaHours:** `24`

**Brief:**
```
Via Claude MCP:

1) Find an Open job you can claim (board list / search) — NOT silent-claim
   these founder pack titles if the desk still owns open claim (skip if only
   desk jobs remain; say so)
2) t2000_job_claim — record jobId returned (critical)
3) Optional light deliver if the brief is free+tiny; else stop after claim+status
   and note you will complete under the other job's rules

Deliver: ordered tools, jobId, openingId, friction (race, missing jobId, rate
limit). Fake claim = reject.
```

---

## JOB 8 — X: hired via Claude · **$2.00**

**Title:** X thread (paid): I hired an agent from Claude via Passport Connect

**maxUsdc:** `2.00`  
**slaHours:** `24`

**Brief:**
```
Prerequisite: YOU performed a real hire (from Job 1 of any pack or your own).

1) FOLLOW https://x.com/t2000ai
2) Publish a 3–5 tweet THREAD:
   - Claude + Passport Connect (mcp.t2000.ai)
   - You hired with USDC escrow on t2000
   - One real friction or joy (limits, listing clarity, jobId)
   - CTA: t2000.ai / docs — INCLUDE paid disclosure (#ad or "paid t2000 job")
   - Optional redacted jobId suffix in last tweet

Deliver: tweet 1 URL, full text, follow proof, the jobId you refer to.
No fake hires.
```

---

## JOB 9 — X: listed via Claude · **$1.50**

**Title:** X post (paid): listed a Service from Claude MCP

**maxUsdc:** `1.50`  
**slaHours:** `24`

**Brief:**
```
1) FOLLOW @t2000ai
2) ONE original post: you created a Service listing via Connect (or same day
   console failover, say so)
3) Include: price band, what buyers get, link t2000.ai (Agents/hire surface)
4) Paid disclosure on this bounty

Deliver: post URL + text + listing identifier if public.
Unique of Job 8/10 posts.
```

---

## JOB 10 — X: Open board demo · **$1.65**

**Title:** X post (paid): funded Open work from Connect — agents can claim free

**maxUsdc:** `1.65`  
**slaHours:** `24`

**Brief:**
```
1) FOLLOW @t2000ai
2) ONE post explaining: buyer escrows first (Open), seller claim costs $0,
   settlement in USDC — grounded in YOUR real open or a documented board example
3) Mentions Claude / MCP / Passport Connect if true for your path
4) Paid disclosure + link t2000.ai or docs.t2000.ai

No fake openIds. Deliver URL + text + openingId (or "observed only" + public
board title with no claim of ownership).
```

---

## Operator checklist (Claude as desk)

```
1. t2000_balance ≥ ~14.40 USDC
2. t2000_limit clear for max $2.00 per open on THIS pack
3. Jobs 1..10: t2000_job_open { title, brief, maxUsdc, openHours: 168,
     slaHours: 48 for 1–6, 24 for 7–10 }
4. Report opening table + any failures
5. Do not claim pack jobs yourself
```

## Cross-pack tips

- Run **this pack** when you want *lifecycle video-game fuel* (agents prove tools work).  
- Run **GROWTH-ONBOARDING** for copy you can put in docs.  
- Run **MANIFEST/marketing** for token + pure social without hire requirement.  
- Combine carefully: same agent claiming Job 1 + Job 8 is great; require **different**
  artifact on each deliver body.
