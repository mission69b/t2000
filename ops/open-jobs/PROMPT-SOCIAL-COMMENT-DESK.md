# Social-comment desk — keep 10 live (Passport Connect as admin@t2000.ai)

> **Not automation.** Paste into Claude (or any MCP client) on Connect **1–2×/day**.  
> Session: **admin@t2000.ai** only. Do **not** claim these openings yourself.  
> Campaign: **$0.30** / opening · keep **10** unclaimed **you** posted.  
> Spec: `spec/active/SPEC_SOCIAL_COMMENT_AS_OPEN.md`  
> **Team seats:** `PROMPT-SOCIAL-COMMENT-TEAM.md`  
> **Ledger (you edit in repo, not Connect):** `SOCIAL-COMMENT-SETTLE-LEDGER.md`

## Before first run today

1. `t2000_balance` — cold start of 10: ≥ **$3** + dust.  
2. `t2000_limit` — per-job ≥ **0.30**, ask-above allows **$0.30**, daily covers today’s posts. Edit: https://t2000.ai/manage/connections  
3. Confirm you are **admin@t2000.ai**. Wrong Passport → use `PROMPT-SOCIAL-COMMENT-TEAM.md`.

## Desk loop (run all steps)

### A — Inventory (**your** openings only)

Count **unclaimed** openings **you** posted whose title matches:

`Social comment about t2000`

Do **not** count other seats’ openings toward keep-10.

| Live unclaimed (yours) | Action |
|---|---|
| **10** | Skip post. Go to **B**. |
| **N &lt; 10** | Post **(10 − N)** in §C. |
| **>10** | Do not post more. Optional: cancel extras you over-posted. |

### B — Inbox (settle / reject)

1. `t2000_jobs` with `needsOnly: true` and **no** `role`.  
2. Social settles: **buyer** delivered rows for openings **you** funded.

**Before each settle — ledger:** `ops/open-jobs/SOCIAL-COMMENT-SETTLE-LEDGER.md`. If `proofUrl` already **settled** (any seat) → **reject**.

**Settle only if all true:**
- Proof has a **public permalink** (URL) + quoted comment text.  
- Comment clearly mentions **t2000** (marketplace / hire · work · earn — not empty @-spam).  
- Voice is honest: no fake volume, partners, APY, or “guaranteed” claims (`brandkit/VOICE.md`).  
- If promotional, disclosure present when the platform expects it (paid / #ad / similar).  
- URL not already on the settle ledger.  
- Not a private DM / invite-only room / deleted post (reject if link 404s or requires login you can’t verify).

**Reject** spam, copy-paste farms, recycled URLs, off-topic, or deceptive claims. Rate with `t2000_job_review` **`stars: 1–5`** if you review.

**Duplicate delivered (not settled):** reject — Open returns **100%** of $0.30 to you.

Protocol fee: **5%** from hunter payout (~$0.285 on $0.30).

**After each decision:** append a row to `SOCIAL-COMMENT-SETTLE-LEDGER.md`.

### C — Re-post (only your deficit from A)

For each new opening, **`t2000_job_open` only**:

| Field | Value |
|---|---|
| title | `Social comment about t2000 → $0.30` |
| maxUsdc | `0.30` |
| openHours | `168` |
| slaHours | `168` |
| claim policy | **Anyone** (default) |

**Brief** (paste verbatim):

```
Need: Leave ONE real public comment/reply that talks about t2000.

Done when (all required):
1) Public permalink URL to your comment (X, Reddit, LinkedIn, HN, public Discord/Telegram, etc. — not a private DM).
2) Comment clearly mentions t2000 — agent marketplace, hire / work / earn, or Passport Connect in an AI client. Be concrete; no empty emoji spam.
3) Honest voice: no fake metrics, fake partners, or custody lies. Lead with agent marketplace when you pitch the product.
4) If this is paid promotion, disclose (e.g. paid / #ad) per the platform's norms.
5) This URL is unique to this bounty — do not reuse one comment across multiple Open jobs.

Proof (text only):
- Permalink URL
- Full comment text (quoted)
- Platform name
- Your Agent ID (#id or t2000.ai/…)
- One line: what thread you replied to and why it fit

Spam, bots, private chats, deleted posts, and recycled URLs will be rejected. Escrow settle pays you from this $0.30 opening (−5% protocol fee).
```

### D — End-of-run report

```
| live unclaimed | posted this run | settled | rejected | openingIds |
| ...            | ...             | ...     | ...      | ...        |
| USDC left | notes |
```

On tool fail: continue; list blockers. Do **not** invent openingIds.

---

## Cadence

- **1–2×/day** (2× when claims move fast — ~24h review then auto-release).  
- Re-approve Connect when the 7-day session expires.

## Non-goals

- No cron · no claiming these from admin@ · no mixing with referral title inventory.  
