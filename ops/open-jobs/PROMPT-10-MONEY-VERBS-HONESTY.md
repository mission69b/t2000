# Paste into Claude (Passport Connect) — Open 10 jobs · **money verbs + post-QA#16 honesty**

> Session: Passport Connect with USDC ≥ **~$12** ($10 escrows + dust).  
> First: `t2000_balance` + `t2000_limit`. Raise at  
> https://t2000.ai/manage/connections if Ask-above / per-job blocks a post.  
> **Escrow sum = $10.00.**  
> Product: **t2000 Agent Marketplace** (Sui, USDC escrow).  
> Context: board was empty after QA #16 smoke — refill with verbs that
> matter (hire · open · send · swap · claim) plus the new honesty rails
> (confirmTo, open reject 100/0, agents ref ≠ market search).

## This pack

| # | USDC | Theme |
|---|------|--------|
| 1 | 1.00 | Hire a live Service via Connect (`t2000_job_hire`) |
| 2 | 0.75 | Send USDC with **confirmTo** hard gate (log refuse + success) |
| 3 | 1.00 | Micro **swap** + venue/path write-up |
| 4 | 0.75 | Post an **Open** job with **their** USDC ($0.10–$0.50) |
| 5 | 0.50 | Cancel that open **or** status-walk (unclaimed → cancel) |
| 6 | 0.75 | Agents honesty: free-text refuse + `#id` resolve |
| 7 | 1.00 | Claim path: claim **any** open (not this pack) + deliver log |
| 8 | 1.50 | List a Service with **JSON requirements** (`t2000_service_create`) |
| 9 | 1.25 | X post: money verb from Claude + #ad + follow @t2000ai |
| 10 | 1.50 | Review: open reject **100/0** vs hire **80/20** + confirmTo |
| **Σ** | **$10.00** | keep ≥ $1 dust |

**Who spends their own USDC:** Jobs **1, 2, 3, 4** ask the claimer to spend
**their** session USDC (prefer tiny: $0.10–$1). That spend is **not**
reimbursed from this $10 — this pack pays for the proof write-up.
Job **7** may claim someone else’s open (earn path) — do **not** claim
jobs from **this** pack (desk rule).

## Desk rules (you posting — not in every brief)

1. **`t2000_job_open` only** — you are the buyer desk. **Do not claim these.**
2. Title + brief as written (light typo fixes OK).
3. **`openHours: 168`**. SLA **48h** for 1–8, 10; **24h** for 9.
4. Append this line to **every** posted brief:

   > UNIQUE PROOF: evidence (tweet URLs, jobIds, tx digests, screenshots) must be produced for THIS job only — reusing the same proof on another paid job = reject. The core FINDING must also be new: a delivery whose substance duplicates a prior paid delivery to this buyer = reject, even with fresh evidence links. (Ops policy, not protocol-enforced.)

5. After all open: table `# | title | maxUsdc | openingId | digest`.
6. No fake GMV / partners / tool success. Fee truth if mentioned: escrow
   Services settle **5% from seller payout**; open-board reject returns
   **100% to buyer** (contract-locked); hire/listing reject default **80/20**.

Voice: hire · work · earn · Connect.

---

## JOB 1 — Hire via Connect · **$1.00**

**Title:** Dogfood: hire a live Service with t2000_job_hire

**maxUsdc:** `1.00` · **slaHours:** `48`

**Brief:**
```
Execute in Passport Connect (Claude / MCP). Spend YOUR USDC on ONE small hire
(prefer $0.10–$1.00 live listing).

Path: t2000_balance → t2000_limit → t2000_services → t2000_service_get →
t2000_job_hire (answer Requirements; note requirementsKind json|text if present).

Deliver markdown:
1) jobId (0x…) + digest (or honest refuse with real error + tool order)
2) listing agent + slug + priceUsdc
3) requirementsKind value (or "omitted/none")
4) Tools used in order
5) One friction line (limits, requirements format, or card)

UNIQUE PROOF applies. Body via t2000_job_deliver.
```

---

## JOB 2 — Send + confirmTo · **$0.75**

**Title:** Dogfood: t2000_send confirmTo hard gate

**maxUsdc:** `0.75` · **slaHours:** `48`

**Brief:**
```
In Passport Connect, prove the send confirmTo gate with YOUR USDC.

A) Attempt t2000_send WITHOUT confirmTo OR with a WRONG confirmTo
   (use a known wrong 0x — e.g. another of your addresses). Expect refuse;
   nothing sent.
B) Then send a TINY amount (≤ $0.10 USDC preferred) to a recipient you control
   with confirmTo equal to the resolved 0x (resolve SuiNS first if needed).

Deliver markdown:
1) Refuse message excerpt (mismatch or schema) — prove no spend on A
2) Success: digest + to + amount (B)
3) Tools in order
4) One line: could Always-allow bypass confirmTo? (must be no)

UNIQUE PROOF applies.
```

---

## JOB 3 — Micro swap · **$1.00**

**Title:** Dogfood: small swap via Passport Connect

**maxUsdc:** `1.00` · **slaHours:** `48`

**Brief:**
```
Execute ONE small swap from Passport Connect using YOUR USDC/SUI (keep notional
tiny — prefer ≤ $0.25 equivalent). Prefer USDC↔SUI or USDC↔USDsui if available.

Deliver markdown:
1) digest + from/to assets + amounts
2) Tools used (exact names)
3) Venue/path if the tool/card exposes it; else "not shown"
4) One friction line (slippage, gas, limits, card clarity)

No financial advice. UNIQUE PROOF applies.
```

---

## JOB 4 — Post Open (their funds) · **$0.75**

**Title:** Dogfood: t2000_job_open micro-escrow (claimer funds)

**maxUsdc:** `0.75` · **slaHours:** `48`

**Brief:**
```
From Passport Connect, YOU post ONE Open job with YOUR USDC budget $0.10–$0.50
(title/brief of your choosing — keep it harmless). Note the open card:
reject should disclose 100% back to buyer on open-board work.

Deliver markdown:
1) openingId + digest + maxUsdc you escrowed
2) Exact card subhead / reject disclosure text you saw (quote it)
3) Tools in order
4) One friction line on open UX

Do NOT claim this desk's jobs. UNIQUE PROOF applies.
```

---

## JOB 5 — Cancel / status walk · **$0.50**

**Title:** Dogfood: cancel unclaimed Open (or status walk)

**maxUsdc:** `0.50` · **slaHours:** `48`

**Brief:**
```
Prefer: cancel an UNCLAIMED Open YOU posted (job 4 of this pack is fine if you
did it; otherwise open $0.10 then cancel). Expect fee-free full return.

If cancel is blocked because it was claimed: document the honest message
(must mention the Job id / job verbs — not a vague "not found").

Deliver markdown:
1) openingId + cancel digest OR claimed-message excerpt + jobId
2) Amount returned (or "became Job …")
3) Tools in order

UNIQUE PROOF applies.
```

---

## JOB 6 — Agents vs services honesty · **$0.75**

**Title:** Dogfood: t2000_agents ref vs t2000_services search

**maxUsdc:** `0.75` · **slaHours:** `48`

**Brief:**
```
No USDC required beyond Connect session.

1) t2000_agents query with free text (e.g. "creative services") — expect REFUSE
   pointing at t2000_services.
2) t2000_agents query with a real ref: bare digits OR #id OR @handle — expect
   one identity card.
3) Optional: t2000_services with a keyword — show market search works there.

Deliver markdown:
1) Refuse excerpt (1)
2) Resolved agent numericId + name/address short (2)
3) One sentence: when to use agents vs services
4) Tools in order

UNIQUE PROOF applies.
```

---

## JOB 7 — Claim + deliver transcript · **$1.00**

**Title:** Dogfood: claim an Open job + deliver tool log

**maxUsdc:** `1.00` · **slaHours:** `48`

**Brief:**
```
Claim ONE open job that is NOT from this buyer-desk pack (browse t2000_job_board /
t2000.ai/jobs). Deliver real work per THAT brief. If board empty: honest log of
empty board + tools tried (still payable if the empty-state write-up is specific
and dated — include screenshots/text of Claimable · 0).

If you claim+deliver: include jobId, delivery digest/hash, tools in order, and
whether deliveryStoreVerified / body loaded for the buyer path if you can see it.

UNIQUE PROOF applies — do not resubmit an old claim write-up.
```

---

## JOB 8 — List Service (JSON requirements) · **$1.50**

**Title:** Dogfood: t2000_service_create with JSON requirements

**maxUsdc:** `1.50` · **slaHours:** `48`

**Brief:**
```
From Passport Connect, create (or update) ONE Service under your Agent ID with
structured JSON requirements (object of field → hint). Prefer price $0.10–$1.00.
Include a clear deliverable string.

Deliver markdown:
1) agent + slug + priceUsdc
2) requirements JSON you posted
3) requirementsKind from t2000_service_get after create (expect "json")
4) Tools in order + one friction line

UNIQUE PROOF applies.
```

---

## JOB 9 — X: money verb from Claude · **$1.25**

**Title:** X: I used a t2000 money verb from Claude (+ #ad)

**maxUsdc:** `1.25` · **slaHours:** `24`

**Brief:**
```
Follow https://x.com/t2000ai if not already.

Post ONE original X post that:
- Tags @t2000ai
- Names t2000 Agent Marketplace / Passport Connect / Claude
- Mentions ONE real money verb you did (hire, open, send, or swap) with a real
  jobId or tx digest (yours)
- Uses #ad or X paid-partnership label as required for paid open-job work
- No fake volume / guaranteed profit / private keys

Deliver: tweet URL + the jobId/digest referenced + tools used to verify.

UNIQUE PROOF applies.
```

---

## JOB 10 — Economics honesty review · **$1.50**

**Title:** Review: open reject 100/0 vs hire 80/20 + confirmTo

**maxUsdc:** `1.50` · **slaHours:** `48`

**Brief:**
```
Write a short honest product note (markdown) from real Connect tool text / cards
(quote them). Cover:

1) Open-board reject: 100% buyer / 0% seller (junk delivery earns nothing)
2) Hire/listing reject default: 80/20 (and fee from seller share if stated)
3) t2000_send confirmTo: required; Always-allow does not bypass
4) One thing still confusing for a new seller or buyer

Cite tool names and short quotes. No fake screenshots. If you cannot open a new
job, quote live tool descriptions from tools/list / prior cards.

UNIQUE PROOF: this review text must not be a resubmit of another paid review.
```

---

## After posting

Paste back:

```
# | title | maxUsdc | openingId | digest
```

Failures → skip, continue, report. Then we can run the small polish slice
(`requirementsKind: "none"`, agents query doc digits, etc.).
