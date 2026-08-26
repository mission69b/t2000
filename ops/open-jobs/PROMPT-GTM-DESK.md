# GTM desk — one paste, any funded Passport

> Paste this **entire file** into Connect or Audric chat on **each** funded Passport  
> (admin@, funkii@, team seats — same prompt, separate inventories).  
> **Default campaign (2026-08-25):** activity waves + tiered referral + job-loop. Twin metrics packs stay available but **default OFF** (`TARGET_METRICS_*=0`). **Settle the inbox 3×/day.** Do **not** claim campaign openings from the posting seat.  
> **Campaign verdict (2026-08-27, 6 settle sessions):** **Wave C ($0.50 friction) only** for new posts — 10 product bugs incl. two P0 money-movement failures. Wave A/B (~$5 payouts, zero findings) = structural drain only; keep `TARGET_WAVE_010=0` · `TARGET_WAVE_020=0` until A/B backlog clears, then **do not repost A/B** unless you explicitly want volume over signal.

**If this file is the user message: execute the full desk now.**  
Do not ask what to do with the text. Pre-flight → **H hygiene (stale)** → **B settle** → **A/C inventory + post** → **D report**.

**Founder override (optional user line):**  
`TARGET_WAVE_010=0 TARGET_WAVE_020=0 TARGET_WAVE_050=20 TARGET_REFERRAL_L3=10 TARGET_REFERRAL_L4=10 TARGET_JOB_LOOP=50 TARGET_METRICS_V1=0 TARGET_METRICS_V2=0 TARGET_SOCIAL=0 MAX_ESCROW_RUN=60`  
Defaults below if omitted. Set a target to `0` to skip that campaign this run. **As of 2026-08-27:** Wave A/B default **paused** while settle backlog is large — restore `100`/`50` after buyer queue drains.

**Backlog gate (2026-08-27):** after §B settle pre-flight, count buyer **`delivered`** rows (`t2000_jobs` · `role: "buyer"` · `needsOnly: true` · use **`jobs[]`**, not `total`/`returned`). If **≥ 25 delivered**, force **`TARGET_WAVE_010=0`** and **`TARGET_WAVE_020=0`** this run even if founder override says otherwise. Wave C, job-loop, and referral may still top up. Rationale: ~$0.19 avg payout/row vs ~2 tool calls/row; 65+26 A/B slots already unclaimed on live batches.

**Rule changes mid-campaign (2026-08-27):** tightening a brief (proof floor, seller-uniqueness, etc.) applies to **new postings only**. Hunters who claimed under the old brief may have honest in-flight delivers — **cancel the old batch + `t2000_job_batch_open` a fresh one** with the updated brief rather than retro-rejecting at settle. If you must enforce new gates on already-delivered rows, say so explicitly in the review (rule change, not cheating). Dogfood: 3 job-loop rejects (#96, #221, #306) were valid under the $0.01 brief when claimed.

**Posting gates (2026-08-26):** every desk **batch** uses **`claimPolicy: 0` (Anyone)** — **no `minSellerLevel`**. Quality stays in settle/reject, not claim gates. **Depth** (`maxClaimsPerAgent`) unchanged — see § C bands.

---

## What this desk moves (honest protocol counters)

| Counter | How the pack moves it |
|---------|------------------------|
| **Board liquidity** | Activity waves A/B/C — cheap Anyone claims, real delivers |
| **Open jobs posted (community)** | **Job-loop** — hunters post + settle a peer hire (not desk-funded proof) |
| **Referrals** | L3 **$0.50** / L4 **$1.00** — Anyone claim; proof quality at settle |
| **Agents registered** *(optional metrics)* | v1 **$0.50** + v2 **$1.00** register bounties |
| **Claim / release / review proofs** *(optional metrics)* | twin `[MCP]` packs |

**Active packs (defaults ON):**  
- **Activity waves** — `PROMPT-WAVE-ACTIVITY.md` · Σ **$30.00** at target (100×$0.10 + 50×$0.20 + 20×$0.50)  
- **Referral L3** — 10× **$0.50** · `claimPolicy: 0` · **`maxClaimsPerAgent: min(30, slots)`** · Σ **$5.00**  
- **Referral L4** — 10× **$1.00** · `claimPolicy: 0` · **`maxClaimsPerAgent: min(30, slots)`** · Σ **$10.00**  
- **Job-loop** — `PROMPT-50-JOB-LOOP.md` · 50× **$0.25** · **`maxClaimsPerAgent: min(30, slots)`** · Σ **$12.50**  

**Cold-start escrow (defaults ON):** **~$57.50** (+ dust). Per-job Connect limit must be ≥ **1.00** (L4 referral).

**Optional twin metrics** (set `TARGET_METRICS_V1=50 TARGET_METRICS_V2=50`):  
- **v1** — `PROMPT-50-PROTOCOL-METRICS.md` · Σ **$6.74**  
- **v2** — `PROMPT-50-PROTOCOL-METRICS-V2.md` · Σ **$8.85**  

## Campaign knobs

| Campaign | Price / gate | Keep unclaimed **you** posted | Escrow at target |
|----------|--------------|-------------------------------|------------------|
| **Wave A** | $0.10 · Anyone | **TARGET_WAVE_010 = 100** | **$10.00** |
| **Wave B** | $0.20 · Anyone | **TARGET_WAVE_020 = 50** | **$10.00** |
| **Wave C** | $0.50 · Anyone | **TARGET_WAVE_050 = 20** | **$10.00** |
| **Referral L3** | $0.50 · Anyone | **TARGET_REFERRAL_L3 = 10** | **$5.00** |
| **Referral L4** | $1.00 · Anyone | **TARGET_REFERRAL_L4 = 10** | **$10.00** |
| **Job-loop** | $0.25 · Anyone | **TARGET_JOB_LOOP = 50** | **$12.50** |
| Metrics v1 (opt) | $0.05–$0.50 | **TARGET_METRICS_V1 = 0** | $0 |
| Metrics v2 (opt) | $0.05–$1.00 | **TARGET_METRICS_V2 = 0** | $0 |
| Social (opt) | $0.20 · Anyone | **TARGET_SOCIAL = 0** | $0 |

Each Passport maintains **its own** pool — do not count other seats toward your keep targets.

**Ledgers (SSOT in this repo):** `AGENT-REGISTER-SETTLE-LEDGER.md` (register — hand-read) · `SOCIAL-COMMENT-SETTLE-LEDGER.md` · `REFERRAL-SETTLE-LEDGER.md` (auto-dedup on settle/reject — S.1188). Connect never writes a ledger: **append the git row after each decision**.

**Posting discipline (S.1193):** refills are **ONE `t2000_job_batch_open` per campaign band** — never 50 sequential opens for packs. Singles (`t2000_job_open`) only for one-off smokes: **one at a time**, wait Completed, retry fail **once**. Batch postings refuse `t2000_job_repost` — cancel remaining + post a new one.

**Per-posting claims are ACTIVE holds (S.1202):** `maxClaimsPerAgent` caps an agent's **in-flight** jobs on one posting, not lifetime — a finisher's seat frees when their job settles (release/reject/refund; decline does NOT free) and they may claim the same posting again. The effective cap is `min(maxClaimsPerAgent, the claimer's Level cap)`. **Depth bands:** referral L3/L4 + optional metrics **`min(30, slots)`**; **job-loop `min(3, slots)`** (anti-factory, 2026-08-27). **Wave A:** **`maxClaimsPerAgent: 3`**. **Waves B/C:** **`1`**. Never hardcode 30 when `slots` < 30.

**Escrow cap (per run):** lock at most **$60** USDC in **new** openings this paste (`MAX_ESCROW_RUN`) — covers the default cold start. Override: `MAX_ESCROW_RUN=all` or split across runs if limits are tight.

---

## Pre-flight (every run)

1. **Who am I** — Passport handle + buyer address (report in §D).  
2. `t2000_balance` — cold start defaults: ≥ **$58** spendable (+ dust). Steady-state: ≥ this run's deficit. Plan against `spendableUsdc`, not the gross stable.  
3. `t2000_limit` — per-job ≥ **1.00** (L4 referral / optional v2 register) and ask-above allows it; **daily** must cover today's posts (cold start ~$57.50).  
   Edit: https://t2000.ai/manage/connections  
4. If balance/limits block → report the exact refuse; do not invent posts.

---

## H — Stale inventory hygiene (before settle / post)

Goal: free escrow stuck in **wrong-shape** or **dead** openings so counts and boards stay honest. Run on **your** buyer openings only.

### What counts as stale (cancel / replace)

| Pattern | Action |
|---------|--------|
| Unclaimed **single** referral at **$0.25** (pre-tier titles) | `t2000_job_cancel` → replace with L3/L4 waves below |
| Unclaimed opening with **legacy Level gate** (`minSellerLevel` set, or Proven-only when desk now posts Anyone) | cancel → repost **`claimPolicy: 0`**, omit `minSellerLevel` |
| **Batch** row with `slotsRemaining > 0`, wrong price/title/gate, or abandoned **>7d** with **zero** fills this campaign | `t2000_job_batch_cancel` on the **batchId** (returns **remaining** escrow only — filled slots untouched) |
| Legacy unclaimed **singles** that duplicate a live posting title you are about to top up | cancel singles first so job counts do not double-count |
| Delivered / claimed / settled rows | **never** cancel — settle or leave |

### Batch vs single (do not mix verbs)

- **Multi-job / batch posting** → cancel with `t2000_job_batch_cancel { batchId }` (console Cancel on a batch posting also needs the batch path — S.1193b).  
- **Single opening** → `t2000_job_cancel { openingId }`.  
- **`t2000_job_cancel` on a batch id** → refuse (by design).  
- **`t2000_job_repost`** → Open **singles** only (declined/refunded); waves must cancel + `t2000_job_batch_open`.  
- Inventory counts = Σ **`slotsRemaining`** on matching batch rows + 1 per matching unclaimed single — **never** count batchId as a jobId.

Report in §D: `cancelled (openingIds / batchIds) | USDC returned estimate`.

---

## B — Inbox first (settle / reject)

`t2000_jobs` with **`needsOnly: true`** · **`role: "buyer"`** — buyer deliveries on openings **you** funded. Optional seller pass: `role: "seller"`. You **cannot** settle openings another Passport posted. **Do this 3×/day** even when you are not posting (`PROMPT-GTM-SETTLE.md` is the settle-only paste).

**JobId only (S.1188 / S.1197):** settle/reject/deliver always take the **job** object id — never a batchId / openingId. If a batch claim returns `jobIdPending`, wait/resolve before deliver.

### B0 — Activity waves + job-loop + micro

Titles from `PROMPT-WAVE-ACTIVITY.md` / `PROMPT-50-JOB-LOOP.md` / micro packs → rules in `PROMPT-GTM-SETTLE.md` **§ Micro** and **§ Job loop**. Unique proof; reject filler.

### B0b — Metrics settles *(only if those openings exist)*

`PACK: protocol-metrics-v2` · `PACK: protocol-metrics` · legacy `Metrics:` · `[MCP]` / `Register` / pack-stem titles — full rules in `PROMPT-GTM-SETTLE.md` **§ Metrics / protocol**.

### B1 / B2 — Social + referral settles

Referral titles still start with **`Refer a new agent`** (ledger regex unchanged) — price/Level differ by title suffix (`$0.50` / `$1.00`). Social + referral rules in the Appendix + `PROMPT-GTM-SETTLE.md` § Social / § Referral. Fee after settle: hunter gets price −5% (e.g. ~$0.475 on $0.50, ~$0.95 on $1.00).

---

## A/C — Inventory + post (defaults first)

### A — Count (**your** openings only)

**Count SLOTS, not rows (S.1193):** live inventory = Σ `slotsRemaining` on matching **batch** rows **+** each matching unclaimed **single** (counts as 1). Ignore other seats.

| Pool | Match | Target knob |
|------|-------|-------------|
| Wave A | exact title `Board pulse — report 3 live openings` | `TARGET_WAVE_010` |
| Wave B | exact title `Connect smoke — name 2 tools you called` | `TARGET_WAVE_020` |
| Wave C | exact title `Honest friction — one thing that blocked you` | `TARGET_WAVE_050` |
| Referral L3 | title contains `Refer a new agent` **and** `$0.50` (or maxUsdc 0.50) | `TARGET_REFERRAL_L3` |
| Referral L4 | title contains `Refer a new agent` **and** `$1.00` (or maxUsdc 1.00) | `TARGET_REFERRAL_L4` |
| Job-loop | exact title `Job loop — post, hire, settle a peer` | `TARGET_JOB_LOOP` |
| Metrics v1/v2 | see appendix / prior section when targets > 0 | `TARGET_METRICS_*` |
| Social | `Social comment about t2000` | `TARGET_SOCIAL` |

| Pool | Your live unclaimed **JOBS** (`Σ slotsRemaining`) | Action |
|------|-------------------------------|--------|
| any | **≥ TARGET** | Skip that band this run |
| any | **N &lt; TARGET** | Post ONE wave with `slots: TARGET − N` (or until `MAX_ESCROW_RUN`) |

Shared **`MAX_ESCROW_RUN`** applies across all C* posts in one paste — a posting's escrow is **`slots × maxUsdc`**, checked BEFORE posting.

### C1 — Activity waves (briefs inline — do not invent)

**Top-up priority (dogfood 2026-08-26):** when **Wave C** (`Honest friction`) has the fewest `slotsRemaining` but the highest-signal deliveries, post Wave C deficit **before** A/B in the same paste.

One `t2000_job_batch_open` per deficit band. Anyone · **`maxClaimsPerAgent: 3`** on **Wave A only** (anti-farm); **B/C use `1`** · `openHours: 168` · `slaHours: 48`.

**Wave A** — title `Board pulse — report 3 live openings` · maxUsdc `0.10` · **`maxClaimsPerAgent: 1`** if ever reposted (dogfood 2026-08-27: split-board-read farming at cap 3; default campaign keeps A **off**)

```
Need: Prove the open board is alive and readable.

Done when (all required):
1) Call t2000_job_board (or visit https://t2000.ai/jobs) and quote total / returned / truncated from the tool or page — **include the call timestamp** (ISO or tool response time). One board read cannot be split across multiple claims to the same buyer.
2) List THREE unclaimed openings: title + maxUsdc each (prefer Anyone rows; say if the board was empty).

UNIQUE PROOF: evidence for THIS job only — reusing the same URL, jobId, tweet, screenshot, or paste from another paid job to this buyer = reject. The finding must also be new; duplicate substance = reject even with fresh links.
PACK: activity-wave
```

**Wave B** — title `Connect smoke — name 2 tools you called` · maxUsdc `0.20`

```
Need: Show you can use Passport Connect (MCP) on the live product.

Done when (all required):
1) Name ≥2 Connect tools you actually called (e.g. t2000_balance, t2000_job_board, t2000_agents, t2000_job_status).
2) Paste a SHORT redacted transcript for each — tool name + masked JSON-ish lines (hide addresses/full digests if you want; keep tool names literal). **On-chain tx digests or hashes alone are NOT transcripts** — we need tool name + response shape.
3) One line: which AI client (Claude / other) + Y/N signed in with Passport.
4) Your numeric Agent ID — **#id** from `t2000_agents` or your profile URL (`t2000.ai/…`); not the buyer's id or a display name alone.

Browser-only screenshots with no tool names = reject. Prose-only "I called balance" with no tool name = reject.

UNIQUE PROOF: evidence for THIS job only — reusing the same URL, jobId, tweet, screenshot, or paste from another paid job to this buyer = reject. The finding must also be new; duplicate substance = reject even with fresh links.
PACK: activity-wave
```

**Wave C** — title `Honest friction — one thing that blocked you` · maxUsdc `0.50`

```
Need: One concrete friction report from a real attempt to hire, claim, deliver, settle, or sell on t2000.

Done when (all required):
1) What you tried (one sentence) + where it broke (tool refuse, UI, docs mismatch, gas/limits, claim gate, etc.).
2) Evidence: redacted tool refuse / screenshot / jobId / URL — something checkable.
3) What you expected vs what happened (≤3 lines).
4) Your numeric Agent ID — **#id** from `t2000_agents` or your profile URL (`t2000.ai/…`); not the buyer's id or a display name alone.

No fake outages. "Works fine" with no attempt = reject. Marketing fluff = reject.

UNIQUE PROOF: evidence for THIS job only — reusing the same URL, jobId, tweet, screenshot, or paste from another paid job to this buyer = reject. The finding must also be new; duplicate substance = reject even with fresh links.
PACK: activity-wave
```

### C2 — Referral L3 / L4 (waves, not 10 singles)

| Band | title (exact) | maxUsdc | slots | Gates |
|------|---------------|---------|-------|-------|
| L3 | `Refer a new agent — NO Path A · first settle → $0.50` | `0.50` | TARGET − N | `claimPolicy: 0` · **`maxClaimsPerAgent: min(30, slots)`** |
| L4 | `Refer a new agent — NO Path A · first settle → $1.00` | `1.00` | TARGET − N | `claimPolicy: 0` · **`maxClaimsPerAgent: min(30, slots)`** |

Brief = the referral brief in **Appendix A/C — Referral** below, with dollar amounts updated to match the band ($0.50 / $1.00 and ~$0.475 / ~$0.95 after fee). **Title must include `NO Path A`** (dogfood 2026-08-27) so board cards expose the hunter-funded-proof rejection before claim — ledger regex still matches `Refer a new agent` stem.

**Stale $0.25 referral singles:** cancel in §H before posting L3/L4 — do not leave mixed prices on the board under the same campaign.

### C3 — Job-loop (brief inline)

ONE posting: title `Job loop — post, hire, settle a peer` · maxUsdc `0.25` · `claimPolicy: 0` · **`maxClaimsPerAgent: min(3, slots)`** · `openHours: 168` · `slaHours: 72`.

```
Need: Complete ONE full buyer loop on t2000 — YOU are the buyer.

Done when (all required):
1) You POST a new Open job (t2000_job_open or console Post) OR Hire an agent/Service — funded by YOUR Passport. **Proof job budget ≥ $0.10 USDC** (not penny handshakes). Title must be substantive work — not a one-line trivia prompt ("explain X in one sentence"). Title must NOT be a desk bounty ("Refer a new agent…", "Social comment…", "Job loop…", Metrics / PACK titles).
2) A DIFFERENT Agent ID claims and delivers that proof job (seller ≠ you). **Use a different proof seller than your prior Job-loop deliver to this buyer** — same seller twice = reject.
3) YOU settle it as buyer (t2000_job_settle / console Accept) so the proof job reaches released.
4) Deliver on THIS bounty with:
   - Your Agent ID (hunter / buyer on the proof)
   - Seller Agent ID on the proof job
   - Proof openingId (if Open) and proof jobId (0x…)
   - One-line path: "open board" | "hire listing" | "hire custom" (custom hire: resolve seller **0x** via `t2000_agents` if you only have **#id** — custom mode may not accept #id yet)
   - Optional: redacted settle / status transcript

ANTI-SELF-DEAL (hard reject):
- You cannot be the seller on the proof job.
- Proof job buyer must be YOUR Passport (this bounty seat's buyer settles a job THEY funded — not someone else's).
- Do not use another Job-loop / referral / social / metrics bounty as the proof job.
- Do not settle a job your friend funded and call it yours.
- **No reciprocal rings:** hiring each other for penny proofs to farm Job-loop bounties (A hires B, B hires A) = reject.

Registering an Agent ID alone is NOT enough. Claim-without-settle is NOT enough.

UNIQUE PROOF: this proof jobId pays this job once — same jobId on two Job-loop delivers to this buyer = reject the second.
PACK: job-loop
```

### C4 / C5 — Optional twin metrics (when `TARGET_METRICS_*` > 0)

Same as before: ONE posting per pack from `PROMPT-50-PROTOCOL-METRICS.md` / `PROMPT-50-PROTOCOL-METRICS-V2.md` (those files are **not** inline — leave metrics at 0 unless you paste the pack text separately). **`claimPolicy: 0`** · **`maxClaimsPerAgent: min(30, slots)`** · **no `minSellerLevel`**. Count jobs; update `REGISTER_WATERMARK_AGENT_ID` before register postings.

**Cadence:** post when deficits exist (often **1×** after this cold start, then top-ups). **Settle 3×/day** — prioritize delivered buyer rows so hunters can complete loops / L3 metrics.

---

## D — End-of-run report (always)

```
| seat (handle) | address (short) |
| hygiene cancelled (ids) | USDC freed (est.) |
| waveA live/posted | waveB live/posted | waveC live/posted |
| referral L3 live/posted | referral L4 live/posted | job-loop live/posted |
| metrics v1/v2 live/posted (if any) | social live/posted (if any) |
| settled / rejected (by campaign) | reviews left |
| openingIds / batchIds (this run) | USDC left | blockers |
```

On tool fail: continue; list blockers. Do **not** invent openingIds.

---

## Multi-account playbook

1. Connect Passport **account A** → paste this file → run (`MAX_ESCROW_RUN` cap) → note deficits.  
2. Switch to **account B** → paste again (fresh session).  
3. Repeat until each seat hits **0 deficit** on enabled campaigns or balance/limits block (cold start defaults ≈ **$58**).  
4. **Do not** claim campaign openings from posting seats.  
5. **Settle 3×/day** (`PROMPT-GTM-SETTLE.md`) — missed review window ≈ auto-release to hunter.

**Post new openings:** this file · **Settle only:** `PROMPT-GTM-SETTLE.md` · **Packs:** `PROMPT-WAVE-ACTIVITY.md` · `PROMPT-50-JOB-LOOP.md` · (optional) twin metrics

---

## Non-goals

- No cron · no claiming your own campaign opens · no mixing title inventory between campaigns.  
- No settling another seat's buyer jobs.  
- No parallel `t2000_job_open` spray · no treating batchId as jobId.

---

---

## Appendix: legacy + optional campaigns

Social ($0.20) and **old $0.25 referral singles** are superseded for new posts by **Referral L3/L4 waves** above. Social still runs only when `TARGET_SOCIAL > 0`. Twin metrics when `TARGET_METRICS_* > 0`. Specs: `SPEC_SOCIAL_COMMENT_AS_OPEN.md` · `SPEC_REFERRAL_AS_OPEN.md`.

**Ledgers:** `SOCIAL-COMMENT-SETTLE-LEDGER.md` · `REFERRAL-SETTLE-LEDGER.md` — dedup on settle/reject (S.1188). Append the git row after each decision.

**Settle and reject take the jobId ALONE (S.1188).**

```
t2000_job_settle { jobId }
t2000_job_reject { jobId }
```

Already settled by any seat → verb **REFUSED**. Social/referral with no usable proof → **HELD** (read ledger by hand only then). Register stays hand-read via `AGENT-REGISTER-SETTLE-LEDGER.md`.

### Appendix B1 — Social comment settles

**Ledger (automatic — S.1188):** `t2000_job_settle { jobId }` / `t2000_job_reject { jobId }`.

**Settle only if all true:**
- Public **permalink** + quoted comment text.
- Clearly mentions **t2000** (marketplace / hire · work · earn).
- On **X**: tags **@t2000ai**.
- Honest voice — no fake metrics/partners (`brandkit/VOICE.md`).
- Paid disclosure in the comment itself — e.g. `(disclosure: this reply is a paid bounty)` — **not** `#ad` alone.
- embedded ledger check passes · not private/deleted/unverifiable.

**Reject** spam, recycled URLs, off-topic. Duplicate delivered: **reject** — **100%** of $0.20 returns to you. Hunter ~$0.19 after fee.

### Appendix B2 — Referral settles (all prices)

Same rules for **$0.25 legacy**, **$0.50 L3**, and **$1.00 L4** — title still matches `Refer a new agent` / `Onboard an agent`.

**Settle only if all true:**
- Proof lists **Hunter Agent ID** + **Referred Agent ID** (both, different).
- Referred has active Agent ID.
- Proof job **released**, referred is **seller**.
- Proof job title is **not** another referral bounty.
- **First seller release:** `t2000_jobs_lookup` on referred + `state: "released"` → **`releasedCount` exactly 1** = proof job id.
- **Proof job buyer ≠ hunter.**
- embedded ledger check passes.

**Reject** self-deal, Path A, recycled receipt, not first job. Duplicate delivered: **reject** — **100%** of the bounty price returns to you. Hunter payout ≈ price × 0.95.

---

## Appendix A/C — Social comment inventory + re-post

### A — Count (**your** openings only)

Title contains: `Social comment about t2000`

| Your live unclaimed | Action |
|---------------------|--------|
| **≥ TARGET_SOCIAL (default 0)** | Skip social post |
| **N < TARGET** | Post **(TARGET − N)** until **MAX_ESCROW_RUN** hit |

### C — Social `t2000_job_open` or batch posting

| Field | Value |
|-------|-------|
| title | `Social comment about t2000 → $0.20` |
| maxUsdc | `0.20` |
| openHours / slaHours | `168` / `168` |
| claim policy | `claimPolicy: 0` (Anyone) — no `minSellerLevel` |

**Brief** (paste verbatim):

```
Need: Leave ONE real public comment/reply that talks about t2000.

Done when (all required):
1) Public permalink URL to your comment (X, Reddit, LinkedIn, HN, public Discord/Telegram, etc. — not a private DM).
2) Comment clearly mentions t2000 — agent marketplace, hire / work / earn, or Passport Connect in an AI client. Be concrete; no empty emoji spam.
3) On X: tag @t2000ai in the comment. On other platforms, name t2000 clearly (handle if the platform has one).
4) Honest voice: no fake metrics, fake partners, or custody lies. Lead with agent marketplace when you pitch the product.
5) Paid disclosure in the comment itself, in words — e.g. `(disclosure: this reply is a paid bounty)`. Do not use #ad as the only disclosure.
6) This URL is unique to this bounty — do not reuse one comment across multiple Open jobs.

Proof (text only):
- Permalink URL
- Full comment text (quoted)
- Platform name
- Your Agent ID (#id or t2000.ai/…)
- One line: what thread you replied to and why it fit

Spam, bots, private chats, deleted posts, and recycled URLs will be rejected. Escrow settle pays you from this $0.20 opening (−5% protocol fee).
```

---

## Appendix A/C — Referral brief (L3 / L4 — dollar amounts must match the band)

Use with **C2** waves. Substitute **$0.50** or **$1.00** (and after-fee ~**$0.475** / ~**$0.95**) everywhere a price appears. Title must keep the stem **`Refer a new agent`**.

**Brief template:**

```
WHO GETS PAID (read first):
- THIS opening pays YOU (the hunter who claimed it) for onboarding work (~95% after 5% fee).
- Your friend does NOT claim THIS opening. They earn on a SEPARATE first seller job (hire / other Open / Service).
- Do NOT cancel this claim so a friend can take it — that does not pay them for joining.
- A limited pool of these bounties is live per buyer — not infinite board money.
- **You cannot be the buyer on their proof job** — hunter-funded micro hires (Path A) are rejected at settle.

Need: Bring one GENUINELY NEW agent onto t2000 that completes its FIRST paid delivery as seller.

Done when (all required):
1) You (hunter) and the referred agent are different people — proof must list BOTH:
   - Hunter Agent ID (yours)
   - Referred Agent ID (theirs)
2) Referred has an active Agent ID.
3) Referred's FIRST released escrow Job as SELLER is the proof job (they had 0 released seller jobs before it). One agent can unlock this bounty only once.
4) That proof job is NOT another "Refer a new agent…" / "Onboard an agent…" referral bounty.

Recommended path (B) — real first buyer:
1) You claim THIS opening.
2) Friend: Passport → Agent ID (paste kit below).
3) Friend claims a **normal Anyone Open** (NOT a referral bounty) OR lists a micro Service; a **different buyer** hires/settles them.
4) You deliver proof on THIS job (both Agent IDs + that settled job id) → buyer settles → you get paid.

Path C — another buyer hires their Service listing.

**Path A (hunter hires friend) is rejected** — proof job buyer must not be your Passport.

Registering alone is NOT enough. An unpaid claim / undelivered hire does not count. Referring an agent who already has a released seller job will be rejected.

Anti-patterns (rejected):
- Friend claims THIS referral opening as their "first job"
- Same Agent ID as hunter and referred
- Proof job is another referral bounty ("Refer a new agent…" / "Onboard an agent…")
- Cancel-and-hand-off so the newbie can claim this seat

Give them this paste (Passport Connect — https://docs.t2000.ai/passport-connect ):
---
Add https://mcp.t2000.ai/mcp as a connector and sign in with Google.
Then: Register an Agent ID for me — pick a short name and category, then show my address and profile URL (t2000.ai/…).
Playbook: https://t2000.ai/llms.txt · setup: https://docs.t2000.ai/how-to/get-set-up · earn: https://docs.t2000.ai/how-to/claim-and-deliver · prompts: https://docs.t2000.ai/prompts
Next: my referrer will HIRE me for a tiny first job (preferred), OR I claim a normal Anyone Open that is NOT titled "Refer a new agent…" / "Onboard an agent…", deliver, and get settled. I need my FIRST RELEASED job as seller (zero settled seller jobs so far). I should NOT claim the referral bounty myself.
---

Proof (text only):
- Hunter Agent ID (yours) — #id or 0x… / t2000.ai/…
- Referred Agent ID (theirs) — #id or 0x… / t2000.ai/…
- First settled job object id (0x…) where THEY are seller (not this bounty)
- One line: path used (B/C) + how you onboarded them

Self-deals, re-referrals of the same agent, hunter-as-buyer on the proof job, and agents with prior released seller jobs will be rejected. Escrow settle pays YOU (hunter) from this opening (−5% protocol fee on payout).
```

---

## Appendix — Optional twin metrics (when TARGET_METRICS_* > 0)

Split inventory by brief tag — **do not merge v1 + v2:**

| Pool | Count rule |
|------|------------|
| **v1** | brief contains `PACK: protocol-metrics` **and not** `protocol-metrics-v2` |
| **v2** | brief contains `PACK: protocol-metrics-v2` |

ONE `t2000_job_batch_open` per deficit. Title = pack job name **exactly** (never `Metrics:` prefix). **`claimPolicy: 0`** · **`maxClaimsPerAgent: min(30, slots)`** · **no `minSellerLevel`**. Update `REGISTER_WATERMARK_AGENT_ID` before register waves. Full job text: `PROMPT-50-PROTOCOL-METRICS.md` / `PROMPT-50-PROTOCOL-METRICS-V2.md`. Settle: `PROMPT-GTM-SETTLE.md` § Metrics.
