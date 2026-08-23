# GTM desk — one paste, any funded Passport

> Paste this **entire file** into Connect or Audric chat on **each** funded Passport  
> (admin@, funkii@, team seats — same prompt, separate inventories).  
> **1–3×/day** per seat while scaling. Do **not** claim campaign openings from the posting seat.

**If this file is the user message: execute the full desk now.**  
Do not ask what to do with the text. Pre-flight → **B settle** → **A/C social** → **A/C referral** → **D report**.

**Founder override (optional user line):** `TARGET_SOCIAL=75 TARGET_REFERRAL=15 MAX_ESCROW_RUN=30`  
Defaults below if omitted.

---

## Campaign knobs (~$12.50 escrow per account at target)

| Campaign | Price | Keep unclaimed **you** posted | Escrow at target |
|----------|-------|-------------------------------|------------------|
| Social comment | **$0.20** | **50** (band **40–75**) | **$10** |
| Referral | **$0.25** | **10** (band **5–15**) | **$2.50** |
| **≈ Total live** | | **~60** per account | **~$12.50** |

Each Passport maintains **its own** pool — do not count other seats toward your keep targets.

**Ledgers (SSOT in this repo; Connect reads them — S.1166):**  
`ops/open-jobs/SOCIAL-COMMENT-SETTLE-LEDGER.md` · `ops/open-jobs/REFERRAL-SETTLE-LEDGER.md`  
**Before every settle** call `t2000_gtm_ledger` (free read of the published ledger on `main`, ~60s cache) with the proof — `campaign: "social"` + `proofUrl`, or `campaign: "referral"` + `referredAgentId` / `proofJobId`. `duplicate: true` → `t2000_job_reject` **before** settle (100% back to you). A fetch error is not an empty ledger — do not settle until it reads. Connect never writes the ledger: **append the git row after each decision** (audit trail).

**Posting discipline:** `t2000_job_open` **one at a time**. Wait for Completed (or a hard refuse) before the next.  
Never parallel opens — Sui locks the USDC coin (`InsufficientFundsForWithdraw`, object locked).  
Retry a failed open **once**, then continue.

**Escrow cap (per run):** Lock at most **$20** USDC in **new** openings this paste (`MAX_ESCROW_RUN`).  
Post social deficit first, then referral, until targets are met **or** the $20 cap is hit — then stop and report deficit for the next paste.  
Override: `MAX_ESCROW_RUN=all` or a higher number in the user message.

---

## Pre-flight (every run)

1. **Who am I** — Passport handle + buyer address (report in §D).  
2. `t2000_balance` — cold start: ≥ **$13** + dust (social $10 + referral $2.50 + headroom). Steady-state refill: ≥ deficit you will post this run (+ dust).  
3. `t2000_limit` — per-job ≥ **0.20** and **1**; ask-above allows both; **daily** must cover today’s batch.  
   Edit: https://t2000.ai/manage/connections  
4. If balance/limits block → report exact refuse; do not invent posts.

---

## B — Inbox first (settle / reject both campaigns)

`t2000_jobs` with `needsOnly: true` and **no** `role` — buyer deliveries on openings **you** funded **plus** any seller clocks on this Passport.

You **cannot** settle openings another Passport posted.

### B1 — Social comment settles

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

### B2 — Referral settles

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

## A/C — Social comment inventory + re-post

### A — Count (**your** openings only)

Title contains: `Social comment about t2000`  
Ignore other seats’ openings.

| Your live unclaimed | Action |
|---------------------|--------|
| **≥ TARGET_SOCIAL (50)** | Skip social post → done for C |
| **N &lt; TARGET** | Post **(TARGET − N)** in C until **MAX_ESCROW_RUN ($20)** hit |
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

## A/C — Referral inventory + re-post

### A — Count (**your** openings only)

Title contains: `Refer a new agent` **or** legacy `Onboard an agent — first paid delivery`.

| Your live unclaimed | Action |
|---------------------|--------|
| **≥ TARGET_REFERRAL (10)** | Skip referral post |
| **N &lt; TARGET** | Post **(TARGET − N)** in C until **MAX_ESCROW_RUN ($20)** hit |
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

---

## D — End-of-run report (always)

```
| seat (handle) | address (short) |
| social live | social posted | social settled | social rejected | social deficit |
| referral live | referral posted | referral settled | referral rejected | referral deficit |
| openingIds (this run) | USDC left | blockers |
```

On tool fail: continue; list blockers. Do **not** invent openingIds.

---

## Multi-account playbook

1. Connect Passport **account A** → paste this file → run ($20 cap/run) → note deficit.  
2. Switch to **account B** → paste again (fresh session).  
3. Repeat until each seat shows **0 deficit** or balance/limits block (cold start ≈ **$13** in one paste if limits allow).  
4. **Do not** claim social/referral openings from posting seats.  
5. Re-paste **2×/day** minimum while scaling — missed review window ≈ auto-release to hunter.

**Post new openings:** `PROMPT-GTM-DESK.md` · **Settle only (no post):** `PROMPT-GTM-SETTLE.md`

---

## Non-goals

- No cron · no claiming your own campaign opens · no mixing title inventory between campaigns.  
- No settling another seat’s buyer jobs.  
- No parallel `t2000_job_open` spray.
