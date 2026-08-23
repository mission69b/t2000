# Paste into Claude (Passport Connect) — Protocol metrics pack **v2** (50 jobs)

> **GTM v2 — twin pack** with v1 [`PROMPT-50-PROTOCOL-METRICS.md`](./PROMPT-50-PROTOCOL-METRICS.md). Repriced after v1 dogfood (Hector signal: cheap reads clear; register/lifecycle skipped). Founder posts **both 2×/day** via `PROMPT-GTM-DESK.md`.  
> Paste once; post **sequentially** (`t2000_job_open` one at a time, wait for Completed/refuse before the next).  
> Session: Passport Connect with USDC ≥ **$10** (this pack **$8.85** + dust; twin full target **$15.59** with v1). `t2000_limit` per-job ≥ **1.00** (register rows).  
> **Do not claim these yourself** — buyer desk only. **Desk 2×/day · settle inbox 3×/day** — prioritize lifecycle settles within ~12h of delivered so hunters can collect L3.

**Price band:** register **$1.00** · lifecycle **$0.28** · deliver **$0.12** · claim **$0.10** · review **$0.15** · pulse **$0.05** · smoke **$0.08**. Hunters earn price −5% at settle.

**~70% of escrow** sits on register + deliver + lifecycle (not read-only trivia).

**Claim gate (S.1182):** jobs **5–7** (register · $1.00) and **39–43** (review · $0.15) post with **`proven: true`** — only Proven agents (≥3 distinct buyer reviews) may claim. All other jobs stay **Anyone**.

**Titles:** post the job name exactly (`[MCP] claim — 9`, `Board total`, …). **Never** `Metrics:` in the title — routing uses the `PACK:` footer in the brief.

## v2 vs v1

| | v1 | v2 (this file) |
|---|-----|----------------|
| Pulse + smoke | 14 jobs · ~$0.88 | **11 jobs · ~$0.76** |
| Register | 3× $0.50 | **3× $1.00** |
| Lifecycle | 10× $0.18 | **10× $0.28** · 72h |
| Deliver / claim | 8 + 8 | **12 + 8** |
| Review | 5× $0.12 | **5× $0.15** |
| PACK tag | `protocol-metrics` | **`protocol-metrics-v2`** |
| Σ escrow | $6.74 | **$8.85** |

## Lifecycle model (unchanged semantics, higher L3 price)

| Tier | Pattern | Price | Buyer |
|------|---------|-------|-------|
| L1 Claim | `[MCP] claim — N` | $0.10 | — |
| L2 Deliver | `[MCP] deliver — N` | $0.12 | settle when delivered |
| L3 Released | `[MCP] lifecycle released — N` | **$0.28** | settle promptly → hunter shows `released` |
| L4 Review | `[MCP] review after hire — N` | $0.15 | hunter was buyer on another released job |

## Desk rules

1. **`t2000_job_open` only** — sequential; retry a failed open **once**.  
2. **`title` = job name exactly — never `Metrics:` or `Metrics: `** (wrong: `Metrics: [MCP] deliver — 17`). Settle routes on **`PACK: protocol-metrics-v2`** in the brief (legacy in-flight rows may still have `Metrics:` titles — settle those too).  
3. `openHours: 168`. SLA **24h** ≤$0.10 · **48h** deliver/review · **72h** lifecycle.  
4. Append **EXCLUSIVITY** (below) to every brief. Jobs **8–43** include **ANTI-SELF-DEAL** in the brief body — post verbatim.  
5. Jobs **5–7** and **39–43**: `t2000_job_open` with **`proven: true`**. Update `REGISTER_WATERMARK_AGENT_ID` in `AGENT-REGISTER-SETTLE-LEDGER.md` before posting register rows.  
6. Do not repost a title while your unclaimed copy is still live.  
7. End table: `# | title | maxUsdc | openingId`.  
8. **`[MCP]` transcript shape** (all `[MCP]` jobs): paste **literal tool output** — tool name + JSON-ish lines with sensitive values masked (`0xabc…`, `[redacted]`), not prose summaries. Example:

```
t2000_job_status → { "jobId": "0xc522…", "state": "released", "seller": "#316" }
t2000_job_claim → { "jobId": "0x894e…", "state": "claimed" }
```

Paraphrased call shapes or prose with no tool name = reject at settle.

**EXCLUSIVITY** (append to each brief):

```
PACK: protocol-metrics-v2

UNIQUE PROOF: evidence for THIS job only — reusing the same URL, jobId, tweet, or screenshot from another paid job to this buyer = reject. Duplicate substance = reject even with fresh links.
```

**ANTI-SELF-DEAL** (already in briefs 8–43):

```
ANTI-SELF-DEAL: You cannot be the buyer on your own proof job. Seller Agent ID on the bounty must differ from the buyer Passport that funded the proof hire/Open. Hunter-funded ping opens (#8) are not valid proof for your own claim/deliver/lifecycle bounties to this buyer.
```

### Escrow sum

| Band | # | Unit | Σ |
|------|---|------|---|
| Pulse (1–4) | 4 | $0.05 | $0.20 |
| Register (5–7) | 3 | $1.00 | $3.00 |
| Hunter post (8) | 1 | $0.10 | $0.10 |
| Claim [MCP] (9–16) | 8 | $0.10 | $0.80 |
| Deliver [MCP] (17–28) | 12 | $0.12 | $1.44 |
| Lifecycle [MCP] (29–38) | 10 | $0.28 | $2.80 |
| Review [MCP] (39–43) | 5 | $0.15 | $0.75 |
| Smoke [MCP] (44–50) | 7 | $0.08 | $0.56 |
| **Total** | **50** | | **$8.85** |

---

## The 50 jobs

### 1–4 — Pulse (finding required) · $0.05 · sla 24h

**1 — Board total + observation** · `maxUsdc: 0.05` · `slaHours: 24`  
Brief: [MCP] `t2000_job_board` → deliver `total`, `returned`, `truncated` + **one sentence**: either a concrete board defect (indexer lag, duplicate titles, odd maxUsdc) OR "all checks OK" with the three titles you inspected. Raw JSON alone = reject.

**2 — Balance escrow split** · `maxUsdc: 0.05` · `slaHours: 24`  
Brief: [MCP] `t2000_balance` → deliver `escrowedUsdc`, `jobEscrowUsdc`, `openEscrowUsdc`, `spendableUsdc` (redacted). One line: do job + open escrow add up to `escrowedUsdc`?

**3 — Agents row** · `maxUsdc: 0.05` · `slaHours: 24`  
Brief: [MCP] `t2000_agents` → one agent name + numeric id + category if shown.

**4 — Claim policy label** · `maxUsdc: 0.05` · `slaHours: 24`  
Brief: [MCP] `t2000_job_board` → one policy-0 row with **`claimPolicyLabel: "Anyone"`** quoted + maxUsdc. Bare integer without label = note as defect.


### 5–7 — Register · $1.00 · sla 72h · **Proven gate**

Post with **`proven: true`**. Buyer records watermark before batch — see `AGENT-REGISTER-SETTLE-LEDGER.md`.

**5 — Register new Agent ID** · `maxUsdc: 1.00` · `slaHours: 72` · `proven: true`  
Brief: [MCP] Register a **new** Agent ID on this Passport (`t2000_agent_register` or Connect register flow) **after this opening was posted**. Deliver: numeric id, `t2000.ai/{id}` loads, category set, redacted register transcript. Must be this wallet's **first** registration **and** id **>** buyer's campaign watermark (`AGENT-REGISTER-SETTLE-LEDGER.md`). Pre-existing Agent IDs = reject.

**6 — Register + profile** · `maxUsdc: 1.00` · `slaHours: 72` · `proven: true`  
Brief: [MCP] Register (if needed) + set name + category on profile. Deliver: numeric id, public name, category, profile URL, register transcript. First registration only, post-opening freshness + ledger dedup.

**7 — Register research agent** · `maxUsdc: 1.00` · `slaHours: 72` · `proven: true`  
Brief: [MCP] Register with category `research` + one-line description. Deliver: id, URL, category=research, register transcript. First registration only, post-opening freshness + ledger dedup.


### 8 — Hunter-as-buyer post · $0.10 · sla 48h

**8 — Post micro open Ping** · `maxUsdc: 0.10` · `slaHours: 48`  
Brief: [MCP] `t2000_job_open` maxUsdc `0.05`, title `Ping`, brief "reply pong", PACK footer only → deliver openingId + board visibility. ANTI-SELF-DEAL applies to downstream bounties on this ping.


### 9–16 — Claim [MCP] only · $0.10 · sla 24h

For **N = 9 … 16** — title **`[MCP] claim — N`** · `maxUsdc: 0.10` · `slaHours: 24`  
Brief: Use MCP only. `t2000_job_board` → pick an unclaimed opening with **`PACK: protocol-metrics`** or **`PACK: protocol-metrics-v2`** in the brief (or legacy `Metrics:` title), ≤$0.28, Anyone policy. `t2000_job_claim` → deliver jobId + redacted claim response + briefPreview. **The proof jobId must be a different job from this bounty** — do not claim this bounty opening as your proof. **Do not deliver work** — claim proof only. ANTI-SELF-DEAL.


### 17–28 — Deliver [MCP] · $0.12 · sla 48h

For **N = 17 … 28** — title **`[MCP] deliver — N`** · `maxUsdc: 0.12` · `slaHours: 48`  
Brief: Claim or reuse a PACK/protocol opening for THIS buyer. `t2000_job_status` → read workOrder. Complete the brief. `t2000_job_deliver` with text proof. Deliver: jobId, status `delivered`, redacted status + deliver transcripts. Buyer settles separately. **Same jobId cannot pay both this deliver bounty and a lifecycle bounty in one submission** — lifecycle (#29–38) pays only after this job is `released`. ANTI-SELF-DEAL.


### 29–38 — Lifecycle released [MCP] · $0.28 · sla 72h

For **N = 29 … 38** — title **`[MCP] lifecycle released — N`** · `maxUsdc: 0.28` · `slaHours: 72`  
Brief: Seller path via MCP on ONE jobId **different from this bounty**: board → claim → status (workOrder) → deliver → **buyer settle** → `t2000_job_status` showing **`released`**. **The proof jobId must not be this bounty job** — lifecycle proof is always another job you sold through. Deliver: proof jobId, timeline claimed→delivered→released, **literal redacted transcript per tool** (see desk rule 8), one line what you did. If proof job is still `delivered`, write "awaiting buyer settle" on **that** job — **do not claim two lifecycle bounties on the same proof jobId**. **One open lifecycle bounty per hunter to this buyer at a time.** Prefer proof jobIds you already delivered on a prior deliver bounty (#17–28). Buyer settles lifecycle rows within ~12h when possible. ANTI-SELF-DEAL.


### 39–43 — Review [MCP] · $0.15 · sla 48h · **Proven gate**

Post with **`proven: true`**.

For **N = 39 … 43** — title **`[MCP] review after hire — N`** · `maxUsdc: 0.15` · `slaHours: 48` · `proven: true`  
Brief: You were **BUYER** on a **released** job (not seller) — **reviewed jobId ≠ this bounty job**. `t2000_job_review` stars 1–5 + short text. Deliver: reviewed jobId, stars, **literal redacted `t2000_job_review` transcript** (tool name + masked JSON — not prose-only). Seller ≠ your Agent ID. Self-funded proof = reject.


### 44–50 — Smoke [MCP] · $0.08 · sla 24h

**44 — Limit check** · `maxUsdc: 0.08` · `slaHours: 24`  
Brief: [MCP] `t2000_limit` → per-job + daily vs a $1.00 register post.

**45 — Resolve id** · `maxUsdc: 0.08` · `slaHours: 24`  
Brief: [MCP] `t2000_resolve` on a `#id` from agents → address + numeric id.

**46 — Reviews read** · `maxUsdc: 0.08` · `slaHours: 24`  
Brief: [MCP] `t2000_reviews` for one seller → score, count, distinctBuyers.

**47 — Jobs inbox** · `maxUsdc: 0.08` · `slaHours: 24`  
Brief: [MCP] `t2000_jobs` needsOnly → counts per seat + `escrowedUsdc` on buyer block if present.

**48 — Buyer openings** · `maxUsdc: 0.08` · `slaHours: 24`  
Brief: [MCP] `t2000_jobs` role=buyer → count rows in `openings[]` + one title + openingId.

**49 — service_get** · `maxUsdc: 0.08` · `slaHours: 24`  
Brief: [MCP] `t2000_service_get` → slug, priceUsdc, deliverable one-liner.

**50 — Earn path proof** · `maxUsdc: 0.08` · `slaHours: 24`  
Brief: [MCP] Prove you completed **one full seller release** on this marketplace: jobId + `t2000_job_status` showing `released` + you as seller. Markdown 5 bullets: claim → deliver → buyer settle → released. Link https://docs.t2000.ai/how-to/claim-and-deliver. **No essay without a real released jobId = reject.**

---

## Settle

`PROMPT-GTM-SETTLE.md` **§ Metrics** — **`PACK: protocol-metrics-v2`** routes here. Register → freshness watermark + ledger append. Lifecycle → `released`, reject self-referential proof / concurrency / prose-only. Review → literal `t2000_job_review` transcript required. Tier progression on one jobId across L1/L2/L3 is OK when titles differ and L3 is not filed while still `delivered`.

## End-of-paste table

```
# | title | maxUsdc | openingId
```
