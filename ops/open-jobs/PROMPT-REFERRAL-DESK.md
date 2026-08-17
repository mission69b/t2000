# Referral desk — keep 6 live (Passport Connect as admin@t2000.ai)

> **Not automation.** Paste into Claude (or any MCP client) on Connect **1–2×/day**.  
> Session: **admin@t2000.ai** only. Do **not** claim these openings yourself.  
> Campaign: ~$1000 budget · **$1** per opening · keep **6** unclaimed live.  
> Spec: `spec/active/SPEC_REFERRAL_AS_OPEN.md`  
> **Team seats (full desk on their Passport):** `ops/open-jobs/PROMPT-REFERRAL-TEAM.md`

## Before first run today

1. `t2000_balance` — need USDC ≥ openings you will post (+ dust). For a cold start of 6: ≥ **$6** + dust.  
2. `t2000_limit` — per-job ≥ **1**, ask-above allows **$1** without a refuse, daily ≤ remaining campaign burn. Edit at https://t2000.ai/manage/connections if blocked.  
3. Confirm you are **admin@t2000.ai** (treasury). Wrong Passport (including other founder handles) → stop; use `PROMPT-REFERRAL-TEAM.md` instead.

## Desk loop (run all steps)

### A — Inventory (**your** openings only)

List Open / buyer jobs for **this Passport** (admin@). Count **unclaimed** openings **you** posted whose title matches:

`Refer a new agent` **or** legacy `Onboard an agent — first paid delivery`

**Do not** count openings posted by other seats (e.g. funkii@) toward keep-6 — those seats run `PROMPT-REFERRAL-TEAM.md`.  
(Ignore claimed/cancelled/refunded.)

| Live unclaimed (yours) | Action |
|---|---|
| **6** | Skip post. Go to **B**. |
| **N &lt; 6** | Post **(6 − N)** below. |
| **>6** | Do not post more. Optional: cancel extras only if you intentionally over-posted. |

### B — Inbox (settle / reject)

1. **Needs-action both seats:** `t2000_jobs` with `needsOnly: true` and **no** `role` filter — catch buyer deliveries **and** any seller work on this Passport (do not miss funded seller jobs).  
2. For referral settles, use the **buyer** delivered rows for openings **you** funded.

**Before each settle — ledger:** open `ops/open-jobs/REFERRAL-SETTLE-LEDGER.md`. If `referredAgentId` or `proofJobId` already has a **settled** row (any seat) → **reject**.

**Settle only if all true:**
- Proof lists **Hunter Agent ID** and **Referred Agent ID** (both).  
- Hunter Agent ID ≠ Referred Agent ID (different Passport / Agent ID).  
- Referred has an active Agent ID (`t2000.ai/{id}`).  
- Proof job is **released**, referred is **seller**.  
- Proof job is **not** a referral bounty (title is not `Refer a new agent…` / `Onboard an agent…`).  
- **Genuinely new agent:** referred had **0 released seller jobs before this proof job**.  
  - Call **`t2000_jobs_lookup`** with the referred agent ref (`#id` / `0x…` / `@handle`) and `state: "released"`. Require **`releasedCount` exactly 1** and that job id equals the proof job. If ≥2 → reject.  
  - Do **not** use `t2000_reviews` for this (wrong tool). Wrong review params (`agent` / `agentId`) soft-refuse — use `seller` there only for review lists.  
- Proof job / referred agent not already on the **settle ledger**.

**Reject** if self-deal, friend-claimed-this-bounty-as-first-job, proof job is another referral Open, not first released job, missing/recycled receipt, ledger hit, or wrong done-when. One-line reason in review if you rate (`t2000_job_review` with **`stars: 1–5`**).

**Duplicate delivered bounty (same proof, not yet settled):** reject — Open reject returns **100%** of the $1 to you (buyer). Do not settle “to be nice.”

Protocol fee: **5%** from hunter payout on settle (~$0.95 to hunter on $1).

**After each decision:** append a row to `REFERRAL-SETTLE-LEDGER.md`.

**Note:** Live openings posted before this rule still settle under **these** checks. Unclaimed openings with the **old** title/brief: cancel + re-post (§C) so hunters see WHO GETS PAID + Path A. You cannot cancel another seat’s openings.

### C — Re-post (only the deficit from A)

For each new opening, **`t2000_job_open` only**:

| Field | Value |
|---|---|
| title | `Refer a new agent (their first settle) → you earn $1` |
| maxUsdc | `1` |
| openHours | `168` |
| slaHours | `168` |
| claim policy | **Anyone** (default) |

**Inventory title match** (A / cancel-old): openings whose title contains `Refer a new agent` **or** legacy `Onboard an agent — first paid delivery`.

**Brief** (paste verbatim — includes the prospect paste kit):

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
| live unclaimed | posted this run | settled | rejected | openingIds |
| ...            | ...             | ...     | ...      | ...        |
| USDC left (balance) | notes |
```

On tool fail: continue other steps; list blockers. Do **not** invent openingIds.

---

## Cadence

- **2×/day** when claims move fast (review window ~24h then permissionless release — missed desk ≈ auto-payout).  
- **1×/day** only if the board is quiet.  
- Weekly: re-approve Connect when the 7-day session expires.

## Non-goals (this prompt)

- No cron, no keypair ops wallet, no Pools / multi-claim.  
- No claiming these jobs from admin@.  
- No changing campaign knobs mid-run without founder say.
