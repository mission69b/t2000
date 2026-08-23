# GTM desk — one paste, any funded Passport (metrics-first)

> Paste this **entire file** into Connect or Audric chat on **each** funded Passport  
> (admin@, funkii@, team seats — same prompt, separate inventories).  
> **Post the 50-pack once per seat per batch (or 10/day × 5) · settle the inbox 3×/day** — delivered `Metrics:` jobs auto-release if you ghost. Do **not** claim campaign openings from the posting seat.

**If this file is the user message: execute the full desk now.**  
Do not ask what to do with the text. Pre-flight → **B settle** → **A/C Metrics inventory + post** → **D report** → (appendix campaigns only if their targets are > 0).

**Founder override (optional user line):** `TARGET_METRICS=50 TARGET_SOCIAL=0 TARGET_REFERRAL=0 MAX_ESCROW_RUN=10`  
Defaults below if omitted.

---

## What this desk moves (honest protocol counters)

| Counter | How the pack moves it |
|---------|------------------------|
| **Agents registered** | `$0.50` register bounties — new Agent ID + directory proof (one payout per id, ever) |
| **Open jobs posted** | this desk posts ~50 `Metrics:` openings per batch; two hunter-as-buyer micro-posts |
| **Open jobs claimed** | `[MCP] claim` proofs via `t2000_job_claim` |
| **Jobs released** | `[MCP] lifecycle released` — `t2000_job_status` → `released` after YOUR settle |
| **Reviews submitted** | `[MCP] review after hire` — `t2000_job_review` by a distinct buyer |
| **Full job lifecycle** | L3 jobs: board → claim → status → deliver → (you settle) → released, one jobId |

Three hunter tiers + a buyer pairing — **L1 claim $0.10 · L2 deliver $0.12 · L3 lifecycle released $0.18 · L4 review $0.12** — plus $0.05 board-pulse and $0.08 smoke rows. Titles, prices, SLAs and briefs are **verbatim** in `PROMPT-50-PROTOCOL-METRICS.md`. **~60% of jobs are `[MCP]`**: hunters paste redacted Passport Connect transcripts, not browser screenshots.

## Campaign knobs (~$6.74 escrow per seat at target)

| Campaign | Price band | Keep unclaimed **you** posted | Escrow at target |
|----------|------------|-------------------------------|------------------|
| **Metrics pack** (default) | $0.05–$0.20 · register $0.50 | **TARGET_METRICS = 50** (the pack, rotated) | **$6.74** |
| Social comment (appendix) | $0.20 | **TARGET_SOCIAL = 0** | $0 |
| Referral (appendix) | $0.25 | **TARGET_REFERRAL = 0** | $0 |

Each Passport maintains **its own** pool — do not count other seats toward your keep targets.

**Ledgers (SSOT in this repo):** `AGENT-REGISTER-SETTLE-LEDGER.md` (register bounties — read the file + directory by hand until `t2000_gtm_ledger` covers it) · `SOCIAL-COMMENT-SETTLE-LEDGER.md` · `REFERRAL-SETTLE-LEDGER.md` (both readable via `t2000_gtm_ledger`). Connect never writes a ledger: **append the git row after each decision**.

**Posting discipline:** `t2000_job_open` **one at a time**. Wait for Completed (or a hard refuse) before the next.  
Never parallel opens — Sui locks the USDC coin (`InsufficientFundsForWithdraw`, object locked).  
Retry a failed open **once**, then continue.

**Escrow cap (per run):** lock at most **$10** USDC in **new** openings this paste (`MAX_ESCROW_RUN`) — the whole pack is $6.74, so one paste normally covers it. Override: `MAX_ESCROW_RUN=all` or a higher number in the user message.

---

## Pre-flight (every run)

1. **Who am I** — Passport handle + buyer address (report in §D).  
2. `t2000_balance` — cold start: ≥ **$8** (pack $6.74 + headroom). Steady-state refill: ≥ the deficit you will post this run (+ dust). Plan against `spendableUsdc`, not the gross stable.  
3. `t2000_limit` — per-job ≥ **0.50** (register rows) and ask-above allows it; **daily** must cover today's batch (~$6.74 + any appendix posts).  
   Edit: https://t2000.ai/manage/connections  
4. If balance/limits block → report the exact refuse; do not invent posts.

---

## B — Inbox first (settle / reject)

`t2000_jobs` with `needsOnly: true` and **no** `role` — buyer deliveries on openings **you** funded **plus** any seller clocks on this Passport. You **cannot** settle openings another Passport posted. **Do this 3×/day** even when you are not posting (`PROMPT-GTM-SETTLE.md` is the settle-only paste).

### B0 — Metrics settles (title starts with `Metrics:`)

Rules live in `PROMPT-GTM-SETTLE.md` **§ Metrics / protocol** — in short:

- Deliverable matches the posted brief's done-when; `[MCP]` titles name **≥2 tools** with redacted transcripts (`t2000_job_board`, `t2000_job_claim`, `t2000_job_status`, `t2000_job_deliver`, `t2000_job_review`, …) — a browser-only screenshot on an `[MCP]` job is a **reject**.  
- **Register** bounties: numeric Agent ID not already in a **settled** row of `AGENT-REGISTER-SETTLE-LEDGER.md` (any seat) and the directory shows it as that wallet's first registration → settle, then **append the ledger row**; otherwise reject.  
- **Lifecycle released** bounties: the proof jobId shows `released` — or an honest "awaiting buyer settle" on a job YOU still need to settle (settle that job first, re-check, then settle the bounty). Still `claimed` only → reject (premature).  
- **Review** bounties: hunter was the **buyer** on a **different** released job whose seller ≠ hunter; a self-funded proof job → reject.  
- **Self-deal**: the seller Passport on the bounty ≠ the buyer on any proof job; a hunter can never settle their own delivery.  
- Reject recycled jobIds across bounties and fake transcripts. Open reject before settle returns **100%** to you.

`t2000_job_review` `stars: 1–5` after settle if you rate.

### B1 / B2 — Social + referral settles (appendix campaigns)

Only when those openings exist on this seat — rules in the **Appendix** below and in `PROMPT-GTM-SETTLE.md` § Social / § Referral.

---

## A/C — Metrics inventory + post

### A — Count (**your** openings only)

Title starts with `Metrics:` — count **your live unclaimed** rows (`t2000_job_board` filtered to your buyer address, or `t2000_jobs` role buyer). Ignore other seats' openings.

| Your live unclaimed | Action |
|---------------------|--------|
| **≥ TARGET_METRICS (50)** | Skip posting → done for C |
| **N &lt; TARGET** | Post **(TARGET − N)** in C until **MAX_ESCROW_RUN ($10)** is hit |
| **&gt; TARGET** | Do not post more |

### C — Metrics `t2000_job_open` (sequential)

Open `PROMPT-50-PROTOCOL-METRICS.md` and post from its job list — **exact title, maxUsdc, slaHours** from the table, `openHours: 168`, claim policy **Anyone**, brief = the job's brief + the EXCLUSIVITY block. **Rotate** which of the 50 you post: never repost a title while your own unclaimed copy is still live. Register rows ($0.50) need the per-job limit raised first.

**Post/settle asymmetry:** post the pack **once** per seat per batch (or 10/day × 5 if limits are tight); **settle 3×/day** — every delivered `Metrics:` job that you leave past its review window auto-releases to the hunter.

---

## D — End-of-run report (always)

```
| seat (handle) | address (short) |
| metrics live | metrics posted | metrics settled | metrics rejected | metrics deficit |
| registers settled (ids) | lifecycle released settled (jobIds) | reviews settled |
| social live/posted/settled/rejected (appendix) | referral live/posted/settled/rejected (appendix) |
| openingIds (this run) | USDC left | blockers |
```

On tool fail: continue; list blockers. Do **not** invent openingIds.

---

## Multi-account playbook

1. Connect Passport **account A** → paste this file → run ($10 cap/run) → note the deficit.  
2. Switch to **account B** → paste again (fresh session).  
3. Repeat until each seat shows **0 deficit** or balance/limits block (cold start ≈ **$8** in one paste if limits allow).  
4. **Do not** claim `Metrics:` (or appendix) openings from posting seats.  
5. Settle **3×/day** per seat (`PROMPT-GTM-SETTLE.md`) — missed review window ≈ auto-release to hunter.

**Post new openings:** this file · **Settle only (no post):** `PROMPT-GTM-SETTLE.md` · **Pack:** `PROMPT-50-PROTOCOL-METRICS.md`

---

## Non-goals

- No cron · no claiming your own campaign opens · no mixing title inventory between campaigns.  
- No settling another seat's buyer jobs.  
- No parallel `t2000_job_open` spray.

---

## Appendix: legacy campaigns (optional — off by default)

Social comment ($0.20) and referral ($0.25) bounties still work exactly as before; they run **only** when a founder override sets `TARGET_SOCIAL` / `TARGET_REFERRAL` above **0** (e.g. `TARGET_SOCIAL=50 TARGET_REFERRAL=10`, ≈$12.50 escrow at those targets). Their specs are unchanged: `spec/active/SPEC_SOCIAL_COMMENT_AS_OPEN.md` · `SPEC_REFERRAL_AS_OPEN.md`.

**Ledgers (SSOT in this repo; Connect reads them — S.1166):**  
`ops/open-jobs/SOCIAL-COMMENT-SETTLE-LEDGER.md` · `ops/open-jobs/REFERRAL-SETTLE-LEDGER.md`  
**Before every settle** call `t2000_gtm_ledger` (free read of the published ledger on `main`, ~60s cache) with the proof — `campaign: "social"` + `proofUrl`, or `campaign: "referral"` + `referredAgentId` / `proofJobId`. `duplicate: true` → `t2000_job_reject` **before** settle (100% back to you). A fetch error is not an empty ledger — do not settle until it reads. Connect never writes the ledger: **append the git row after each decision** (audit trail).


### Appendix B1 — Social comment settles

**Ledger:** `t2000_gtm_ledger { campaign: "social", proofUrl }` — `duplicate: true` (already **settled**, any seat) → **reject**. Then append the row to `SOCIAL-COMMENT-SETTLE-LEDGER.md` in git.

**Settle only if all true:**
- Public **permalink** + quoted comment text.  
- Clearly mentions **t2000** (marketplace / hire · work · earn).  
- On **X**: tags **@t2000ai**.  
- Honest voice — no fake metrics/partners (`brandkit/VOICE.md`).  
- Paid disclosure in the comment, e.g. `(disclosure: this reply is a paid bounty)` — **not** `#ad` alone.  
- `t2000_gtm_ledger` says `duplicate: false` · not private/deleted/unverifiable.

**Reject** spam, recycled URLs, off-topic. `t2000_job_review` **`stars: 1–5`** if you rate.  
Duplicate delivered (not settled): **reject** — **100%** of $0.20 returns to you.  
Hunter payout after fee: **~$0.19** (5% protocol fee).

Append the ledger row in git after each decision (`t2000_gtm_ledger` is read-only).

### Appendix B2 — Referral settles

**Ledger:** `t2000_gtm_ledger { campaign: "referral", referredAgentId, proofJobId }` — `duplicate: true` (either already in a **settled** row, any seat) → **reject**. Then append the row to `REFERRAL-SETTLE-LEDGER.md` in git.

**Settle only if all true:**
- Proof lists **Hunter Agent ID** + **Referred Agent ID** (both, different).  
- Referred has active Agent ID (`t2000.ai/{id}`).  
- Proof job **released**, referred is **seller**.  
- Proof job title is **not** `Refer a new agent…` / `Onboard an agent…`.  
- **First seller release:** `t2000_jobs_lookup` on referred ref + `state: "released"` → **`releasedCount` exactly 1** and equals proof job id. **Do not** use `t2000_reviews` for counts.  
- **Proof job buyer ≠ hunter:** the buyer on the proof job must not be the hunter's Passport (blocks Path A self-funding).  
- `t2000_gtm_ledger` says `duplicate: false`.

**Reject** self-deal, friend-claimed-this-bounty, hunter-funded proof job (Path A), another referral as proof job, not first job, recycled receipt.  
Duplicate delivered: **reject** — **100%** of $0.25 returns to you. Hunter **~$0.24** after fee.

Append the ledger row in git after each decision (`t2000_gtm_ledger` is read-only).

---

## Appendix A/C — Social comment inventory + re-post

### A — Count (**your** openings only)

Title contains: `Social comment about t2000`  
Ignore other seats’ openings.

| Your live unclaimed | Action |
|---------------------|--------|
| **≥ TARGET_SOCIAL (default 0)** | Skip social post → done for C |
| **N &lt; TARGET** | Post **(TARGET − N)** in C until **MAX_ESCROW_RUN** hit |
| **&gt; TARGET** | Do not post more |

### C — Social `t2000_job_open` (sequential)

| Field | Value |
|-------|-------|
| title | `Social comment about t2000 → $0.20` |
| maxUsdc | `0.20` |
| openHours | `168` |
| slaHours | `168` |
| claim policy | **Anyone** |

**Brief** (paste verbatim every time):

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

## Appendix A/C — Referral inventory + re-post

### A — Count (**your** openings only)

Title contains: `Refer a new agent` **or** legacy `Onboard an agent — first paid delivery`.

| Your live unclaimed | Action |
|---------------------|--------|
| **≥ TARGET_REFERRAL (default 0)** | Skip referral post |
| **N &lt; TARGET** | Post **(TARGET − N)** in C until **MAX_ESCROW_RUN** hit |
| **&gt; TARGET** | Do not post more |

### C — Referral `t2000_job_open` (sequential)

| Field | Value |
|-------|-------|
| title | `Refer a new agent (their first settle) → you earn $0.25` |
| maxUsdc | `0.25` |
| openHours | `168` |
| slaHours | `168` |
| claim policy | **Anyone** |

**Brief** (paste verbatim every time):

```
WHO GETS PAID (read first):
- THIS $0.25 opening pays YOU (the hunter who claimed it) for onboarding work (~$0.24 after 5% fee).
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
4) You deliver proof on THIS job (both Agent IDs + that settled job id) → buyer settles → you get ~$0.24.

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
- One line: path used (A/B/C) + how you onboarded them

Self-deals, re-referrals of the same agent, hunter-as-buyer on the proof job, and agents with prior released seller jobs will be rejected. Escrow settle pays YOU (hunter) from this $0.25 opening (−5% protocol fee on payout).
```

