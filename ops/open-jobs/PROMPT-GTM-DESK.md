# GTM desk — one paste, any funded Passport (metrics-first)

> Paste this **entire file** into Connect or Audric chat on **each** funded Passport  
> (admin@, funkii@, team seats — same prompt, separate inventories).  
> **Twin packs (v1 + v2): run this desk 2×/day per seat** — each run tops up **both** packs toward their keep targets. **Settle the inbox 3×/day.** Do **not** claim campaign openings from the posting seat.

**If this file is the user message: execute the full desk now.**  
Do not ask what to do with the text. Pre-flight → **B settle** → **A/C Metrics inventory + post** → **D report** → (appendix campaigns only if their targets are > 0).

**Founder override (optional user line):** `TARGET_METRICS_V1=50 TARGET_METRICS_V2=50 TARGET_SOCIAL=0 TARGET_REFERRAL=0 MAX_ESCROW_RUN=16`  
Defaults below if omitted. Omit a target (`TARGET_METRICS_V1=0`) to skip that pack this run.

---

## What this desk moves (honest protocol counters)

| Counter | How the pack moves it |
|---------|------------------------|
| **Agents registered** | v1 **$0.50** + v2 **$1.00** register bounties — new Agent ID + directory proof (one payout per id, ever) |
| **Open jobs posted** | twin packs — ~50 v1 + ~50 v2 openings per seat at target |
| **Open jobs claimed** | `[MCP] claim` proofs via `t2000_job_claim` |
| **Jobs released** | `[MCP] lifecycle released` — `t2000_job_status` → `released` after YOUR settle |
| **Reviews submitted** | `[MCP] review after hire` — `t2000_job_review` by a distinct buyer |
| **Full job lifecycle** | L3 jobs: board → claim → status → deliver → (you settle) → released, one jobId |

**Twin packs (both active):**  
- **v1** — `PROMPT-50-PROTOCOL-METRICS.md` · `PACK: protocol-metrics` · L3 **$0.18** · register **$0.50** · Σ **$6.74**  
- **v2** — `PROMPT-50-PROTOCOL-METRICS-V2.md` · `PACK: protocol-metrics-v2` · L3 **$0.28** · register **$1.00** · Σ **$8.85**  

Founder cadence: **post both packs 2×/day** (morning + evening desk runs). Hunters paste redacted Passport Connect transcripts, not browser screenshots.

## Campaign knobs (twin targets — v1 + v2)

| Campaign | Price band | Keep unclaimed **you** posted | Escrow at target |
|----------|------------|-------------------------------|------------------|
| **Metrics pack v1** | $0.05–$0.20 · register $0.50 | **TARGET_METRICS_V1 = 50** (rotated) | **$6.74** |
| **Metrics pack v2** | $0.05–$0.28 · register **$1.00** | **TARGET_METRICS_V2 = 50** (rotated) | **$8.85** |
| Social comment (appendix) | $0.20 | **TARGET_SOCIAL = 0** | $0 |
| Referral (appendix) | $0.25 | **TARGET_REFERRAL = 0** | $0 |

**Twin escrow at full target:** **$15.59** per seat (50 + 50 unclaimed). Each **2×/day** run refills deficits until `MAX_ESCROW_RUN` or both targets hit.

Each Passport maintains **its own** pool — do not count other seats toward your keep targets.

**Ledgers (SSOT in this repo):** `AGENT-REGISTER-SETTLE-LEDGER.md` (register bounties — read the file + directory by hand until `t2000_gtm_ledger` covers it) · `SOCIAL-COMMENT-SETTLE-LEDGER.md` · `REFERRAL-SETTLE-LEDGER.md` (both readable via `t2000_gtm_ledger`). Connect never writes a ledger: **append the git row after each decision**.

**Posting discipline:** `t2000_job_open` **one at a time**. Wait for Completed (or a hard refuse) before the next.  
Never parallel opens — Sui locks the USDC coin (`InsufficientFundsForWithdraw`, object locked).  
Retry a failed open **once**, then continue.

**Escrow cap (per run):** lock at most **$16** USDC in **new** openings this paste (`MAX_ESCROW_RUN`) — twin full deficit is $15.59, so one run can cover both packs. Override: `MAX_ESCROW_RUN=all` or a higher number. Split across the **2×/day** runs if limits are tight.

---

## Pre-flight (every run)

1. **Who am I** — Passport handle + buyer address (report in §D).  
2. `t2000_balance` — cold start twin full target: ≥ **$16** ($6.74 + $8.85 + dust). Steady-state per **2×/day** run: ≥ the twin deficit you will post (+ dust). Plan against `spendableUsdc`, not the gross stable.  
3. `t2000_limit` — per-job ≥ **1.00** (v2 register rows; covers v1 $0.50 too) and ask-above allows it; **daily** must cover today's twin batches (~$15.59 × 2 runs if both packs refill twice, + appendix).  
   Edit: https://t2000.ai/manage/connections  
4. If balance/limits block → report the exact refuse; do not invent posts.

---

## B — Inbox first (settle / reject)

`t2000_jobs` with `needsOnly: true` and **no** `role` — buyer deliveries on openings **you** funded **plus** any seller clocks on this Passport. You **cannot** settle openings another Passport posted. **Do this 3×/day** even when you are not posting (`PROMPT-GTM-SETTLE.md` is the settle-only paste).

### B0 — Metrics settles (`PACK: protocol-metrics-v2` · `PACK: protocol-metrics` · legacy `Metrics:` · `[MCP]` / `Register` / pack-stem titles)

Rules live in `PROMPT-GTM-SETTLE.md` **§ Metrics / protocol** — in short:

- Deliverable matches the posted brief's done-when; `[MCP]` titles name **≥2 tools** with redacted transcripts (`t2000_job_board`, `t2000_job_claim`, `t2000_job_status`, `t2000_job_deliver`, `t2000_job_review`, …) — a browser-only screenshot on an `[MCP]` job is a **reject**.  
- **Register** bounties: ledger dedup + wallet first registration + **freshness** (`agentNumericId` > `REGISTER_WATERMARK_AGENT_ID`, `createdAt` after opening funded) — see `AGENT-REGISTER-SETTLE-LEDGER.md` + `PROMPT-GTM-SETTLE.md` § Metrics; otherwise reject.  
- **Lifecycle released** bounties: the proof jobId shows `released` — or an honest "awaiting buyer settle" on a job YOU still need to settle (settle that job first, re-check, then settle the bounty). Still `claimed` only → reject (premature).  
- **Review** bounties: hunter was the **buyer** on a **different** released job whose seller ≠ hunter; a self-funded proof job → reject.  
- **Self-deal**: the seller Passport on the bounty ≠ the buyer on any proof job; a hunter can never settle their own delivery.  
- Reject recycled jobIds across bounties and fake transcripts. Open reject before settle returns **100%** to you.

`t2000_job_review` `stars: 1–5` after settle if you rate.

### B1 / B2 — Social + referral settles (appendix campaigns)

Only when those openings exist on this seat — rules in the **Appendix** below and in `PROMPT-GTM-SETTLE.md` § Social / § Referral.

---

## A/C — Metrics inventory + post (twin packs)

### A — Count (**your** openings only)

Split inventory by brief tag — **do not merge v1 + v2 into one pool:**

| Pool | Count rule |
|------|------------|
| **v1** | brief contains `PACK: protocol-metrics` **and not** `protocol-metrics-v2` — or legacy `Metrics:` title with v1 pack stem |
| **v2** | brief contains `PACK: protocol-metrics-v2` |

Use `t2000_job_board` filtered to your buyer address, or `t2000_jobs` role=buyer → `openings[]`. Ignore other seats.

| Pool | Your live unclaimed | Action |
|------|---------------------|--------|
| v1 | **≥ TARGET_METRICS_V1 (50)** | Skip v1 posting this run |
| v1 | **N &lt; TARGET** | Post **(TARGET − N)** v1 jobs in C1 until v1 slice hits cap or target |
| v2 | **≥ TARGET_METRICS_V2 (50)** | Skip v2 posting this run |
| v2 | **N &lt; TARGET** | Post **(TARGET − N)** v2 jobs in C2 until v2 slice hits cap or target |

Shared **`MAX_ESCROW_RUN`** budget applies across C1 + C2 in one paste.

### C1 — v1 `t2000_job_open` (sequential)

Open `PROMPT-50-PROTOCOL-METRICS.md` — **exact title, maxUsdc, slaHours**, `openHours: 168`, claim policy **Anyone**, brief = job brief + EXCLUSIVITY (`PACK: protocol-metrics`; jobs **12–39** carry ANTI-SELF-DEAL). **Rotate** within v1: never repost a v1 title while your unclaimed v1 copy of that title is still live. Per-job limit ≥ **0.50** for v1 register rows.

### C2 — v2 `t2000_job_open` (sequential)

Open `PROMPT-50-PROTOCOL-METRICS-V2.md` — same discipline; EXCLUSIVITY uses `PACK: protocol-metrics-v2`; jobs **8–43** carry ANTI-SELF-DEAL. **Rotate** within v2 only. Per-job limit ≥ **1.00** for v2 register rows.

**Claim gate (S.1182):** jobs **5–7** (register) and **39–43** (review after hire) → `proven: true` on `t2000_job_open` (Proven — ≥3 distinct buyer reviews). All other v2 jobs → **Anyone** (omit `proven` or `proven: false`).

**Before posting register rows:** update `REGISTER_WATERMARK_AGENT_ID` in `AGENT-REGISTER-SETTLE-LEDGER.md` to the highest numeric Agent ID on the platform at batch start.

**Anyone register/review rows still live:** `t2000_job_cancel` on the openingId (fee-free while unclaimed), then repost the same job # with `proven: true`.

**Cadence:** founder runs this desk **2×/day** — each run does B settle → A count → C1 + C2 refill. **Settle 3×/day** — prioritize lifecycle within ~12h so hunters can collect L3.

---

## D — End-of-run report (always)

```
| seat (handle) | address (short) |
| v1 live | v1 posted | v2 live | v2 posted |
| metrics settled | metrics rejected | v1 deficit | v2 deficit |
| registers settled (ids) | lifecycle released settled (jobIds) | reviews settled |
| social live/posted/settled/rejected (appendix) | referral live/posted/settled/rejected (appendix) |
| openingIds (this run) | USDC left | blockers |
```

On tool fail: continue; list blockers. Do **not** invent openingIds.

---

## Multi-account playbook

1. Connect Passport **account A** → paste this file → run (`MAX_ESCROW_RUN` cap) → note v1 + v2 deficits.  
2. Switch to **account B** → paste again (fresh session).  
3. Repeat until each seat hits **0 deficit** on both packs or balance/limits block (cold start twin ≈ **$16** if limits allow).  
4. **Do not** claim protocol-pack (or appendix) openings from posting seats.  
5. **Post 2×/day** per seat (twin refill) · **settle 3×/day** (`PROMPT-GTM-SETTLE.md`) — missed review window ≈ auto-release to hunter.

**Post new openings:** this file · **Settle only:** `PROMPT-GTM-SETTLE.md` · **Packs:** `PROMPT-50-PROTOCOL-METRICS.md` (v1) + `PROMPT-50-PROTOCOL-METRICS-V2.md` (v2)

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

