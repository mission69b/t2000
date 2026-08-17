# Social-comment desk — team seat (any funded Passport)

> **Same campaign as admin desk — full desk on THIS Passport.**  
> Paste into Connect **1–2×/day**. Post + settle on **this** session.  
> Do **not** claim these openings yourself.  
> Campaign: **$0.30** / opening · keep **10 unclaimed that YOU posted**.  
> Spec: `spec/active/SPEC_SOCIAL_COMMENT_AS_OPEN.md`  
> **admin@:** `PROMPT-SOCIAL-COMMENT-DESK.md`  
> **Ledger (repo file, not Connect):** `SOCIAL-COMMENT-SETTLE-LEDGER.md`

If this session **is** admin@t2000.ai → prefer `PROMPT-SOCIAL-COMMENT-DESK.md`.

---

## Before first run today

1. Confirm Passport handle + address.  
2. `t2000_balance` — cold start of 10: ≥ **$3** + dust **from this wallet**.  
3. `t2000_limit` — per-job ≥ **0.30**, ask-above allows **$0.30**. Edit: https://t2000.ai/manage/connections  
4. If blocked → report the refuse; do not invent a post.

---

## Desk loop (run all steps)

### A — Inventory (**your** openings only)

Count **unclaimed** openings **you** posted whose title matches:

`Social comment about t2000`

Do **not** count admin@ or other seats toward your keep-10.

| Your live unclaimed | Action |
|---|---|
| **10** | Skip post. Go to **B**. |
| **N &lt; 10** | Post **(10 − N)** in §C. |
| **>10** | Do not post more. |

### B — Inbox (settle / reject)

1. `t2000_jobs` with `needsOnly: true` and **no** `role`.  
2. Social settles: **buyer** delivered rows for openings **you** funded.

**Before each settle — ledger:** `ops/open-jobs/SOCIAL-COMMENT-SETTLE-LEDGER.md`. Duplicate `proofUrl` already **settled** → **reject**.

**Settle only if all true:**
- Public permalink + quoted comment text.  
- Clearly mentions **t2000** (marketplace / hire · work · earn).  
- Honest voice — no fake metrics/partners (`brandkit/VOICE.md`).  
- Paid disclosure when promo.  
- URL not on the settle ledger.  
- Not private / deleted / unverifiable.

**Reject** spam, recycled URLs, off-topic, deceptive claims. Review with **`stars: 1–5`** if you rate.

**Duplicate delivered (not settled):** reject — full $0.30 returns to you.

Protocol fee: **5%** (~$0.285 to hunter).

**After each decision:** append a row to `SOCIAL-COMMENT-SETTLE-LEDGER.md`.

You **cannot** settle another Passport’s openings.

### C — Re-post (only your deficit from A)

| Field | Value |
|---|---|
| title | `Social comment about t2000 → $0.30` |
| maxUsdc | `0.30` |
| openHours | `168` |
| slaHours | `168` |
| claim policy | **Anyone** |

**Brief** (paste verbatim — same SSOT as desk §C):

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
| seat | your live unclaimed | posted | settled | rejected | openingIds |
| ...  | ...                 | ...    | ...     | ...      | ...        |
| USDC left | blockers |
```

---

## Cadence

- **1–2×/day** (2× when busy).  
- Fund **this** Passport before cold-starting ten.

## Non-goals

- No claiming campaign openings from this seat.  
- No settling another seat’s jobs.  
- Don’t redirect to admin@ unless the user asks.  
