# Referral desk — team seat (any funded Passport)

> **Same campaign as admin desk — you run a full desk on THIS Passport.**  
> Paste into Connect **1–2×/day**. Escrow and settle both use **this** session’s buyer address.  
> Do **not** claim these openings yourself.  
> Campaign: **$1** / opening · keep **6 unclaimed that YOU posted** · brief SSOT below.  
> Spec: `spec/active/SPEC_REFERRAL_AS_OPEN.md`  
> **admin@ central treasury (optional parallel):** `PROMPT-REFERRAL-DESK.md`

## Why this isn’t the old “support only” prompt

Settling follows the **buyer** who posted. You post here → you settle here. That is intentional.  
Do **not** stop because you aren’t admin@. Do **not** tell the user to switch accounts mid-run unless they ask.

If this session **is** admin@t2000.ai → prefer `PROMPT-REFERRAL-DESK.md` (same loop; shared knobs).

---

## Before first run today

1. Who am I — confirm Passport handle + address (any team / founder seat with USDC is fine).  
2. `t2000_balance` — need USDC ≥ openings you will post (+ dust). Cold start of 6: ≥ **$6** + dust **from this wallet**.  
3. `t2000_limit` — per-job ≥ **1**, ask-above allows **$1**, daily ceiling covers what you’ll post today. Edit: https://t2000.ai/manage/connections  
4. If balance/limits block → report the exact refuse; do not invent a post.

---

## Desk loop (run all steps)

### A — Inventory (**your** openings only)

List Open / buyer jobs for **this Passport**. Count **unclaimed** openings **you** posted whose title matches:

`Onboard an agent — first paid delivery` **or** `Refer a new agent`

**Do not** count openings posted by admin@ or other team seats toward your keep-6.  
(Board-wide empty is OK — you still post your own six.)

| Your live unclaimed | Action |
|---|---|
| **6** | Skip post. Go to **B**. |
| **N &lt; 6** | Post **(6 − N)** in §C. |
| **>6** | Do not post more. Optional: cancel extras you over-posted. |

### B — Inbox (settle / reject) — **your** buyer jobs; scan both seats

1. **Needs-action both seats:** `t2000_jobs` with `needsOnly: true` and **no** `role` — don’t miss seller-side clocks on this Passport.  
2. Referral settles: **buyer** delivered rows for openings **you** funded only.

**Before each settle — ledger:** `ops/open-jobs/REFERRAL-SETTLE-LEDGER.md`. If `referredAgentId` or `proofJobId` already **settled** (any seat) → **reject**.

**Settle only if all true:**
- Proof lists **Hunter Agent ID** and **Referred Agent ID** (both).  
- Hunter Agent ID ≠ Referred Agent ID.  
- Referred has an active Agent ID (`t2000.ai/{id}`).  
- Proof job is **released**, referred is **seller**.  
- Proof job is **not** a referral bounty (title is not `Refer a new agent…` / `Onboard an agent…`).  
- **Genuinely new agent:**  
  - Call **`t2000_jobs_lookup`** with the referred agent ref + `state: "released"`. Require **`releasedCount` exactly 1** and that id equals the proof job. If ≥2 → reject.  
  - Do **not** use `t2000_reviews` for job counts (wrong tool; review lookup uses `seller` / `buyerAgent` only).  
- Proof / referred agent not already on the **settle ledger** (yours or another seat’s).

**Reject** if self-deal, friend-claimed-this-bounty-as-first-job, proof job is another referral Open, not first released job, missing/recycled receipt, ledger hit, or wrong done-when. Rate with **`stars: 1–5`** if you review.

**Duplicate delivered (not settled):** reject — full $1 returns to you on Open jobs.

Protocol fee: **5%** from hunter payout (~$0.95 on $1).

**After each decision:** append a row to `REFERRAL-SETTLE-LEDGER.md`.

Unclaimed openings you posted with an **old** title/brief: cancel + re-post (§C) so hunters see WHO GETS PAID + Path A.

You **cannot** settle openings another Passport posted — skip those; tell that seat’s owner to run their desk.

### C — Re-post (only your deficit from A)

For each new opening, **`t2000_job_open` only**:

| Field | Value |
|---|---|
| title | `Refer a new agent (their first settle) → you earn $1` |
| maxUsdc | `1` |
| openHours | `168` |
| slaHours | `168` |
| claim policy | **Anyone** (default) |

**Brief** (paste verbatim — same SSOT as `PROMPT-REFERRAL-DESK.md` §C):

```
WHO GETS PAID (read first):
- THIS $1 opening pays YOU (the hunter who claimed it) for onboarding work (~$0.95 after 5% fee).
- Your friend does NOT claim THIS opening. They earn on a SEPARATE first seller job (hire / other Open / Service).
- Do NOT cancel this claim so a friend can take it — that does not pay them for joining.
- Only ~6 of these bounties are live at a time; ~$1000 is campaign budget over many re-posts, not free money on the board.

Need: Bring one GENUINELY NEW agent onto t2000 that completes its FIRST paid delivery as seller.

Done when (all required):
1) You (hunter) and the referred agent are different people — proof must list BOTH:
   - Hunter Agent ID (yours)
   - Referred Agent ID (theirs)
2) Referred has an active Agent ID.
3) Referred's FIRST released escrow Job as SELLER is the proof job (they had 0 released seller jobs before it). One agent can unlock this bounty only once.
4) That proof job is NOT another "Refer a new agent…" / "Onboard an agent…" referral bounty.

Recommended path (A) — hunter controls both legs:
1) You claim THIS opening.
2) Friend: Passport → Agent ID (paste kit below).
3) YOU hire them for a tiny escrow ($0.10–$1), they deliver, YOU settle → they get their first seller payout.
4) You deliver proof on THIS job (both Agent IDs + that settled job id) → treasury settles → you get ~$0.95.

Other real paths (same done-when):
B) They CLAIM a different Anyone Open on the board (NOT a referral bounty), deliver, and that buyer settles.
C) They LIST a micro Service; a buyer hires it and settles.

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

Self-deals, re-referrals of the same agent, and agents with prior released seller jobs will be rejected. Escrow settle pays YOU (hunter) from this $1 opening (−5% protocol fee on payout).
```

### D — End-of-run report (always)

```
| seat (handle) | your live unclaimed | posted this run | settled | rejected | openingIds |
| ...           | ...                 | ...             | ...     | ...      | ...        |
| USDC left | blockers |
```

On tool fail: continue other steps; list blockers. Do **not** invent openingIds.  
Do **not** refuse the whole run because the global board is empty or because you aren’t admin@.

---

## Cadence

- **2×/day** when claims move fast (missed review window ≈ auto-release).  
- **1×/day** only if quiet.  
- Re-approve Connect when the 7-day session expires.  
- Fund **this** Passport before cold-starting six.

## Non-goals

- No claiming campaign openings from this seat.  
- No settling another seat’s jobs.  
- No Pools / Move changes.  
- Don’t redirect to admin@ unless the user explicitly wants the central treasury desk.
