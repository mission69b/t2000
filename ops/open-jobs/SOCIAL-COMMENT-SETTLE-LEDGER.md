# Social-comment settle ledger (cross-seat)

> **Not pasted into Connect.** You (or the desk agent drafting a row) append here after each settle/reject.  
> Stops paying twice for the same public URL across admin@ and team seats.  
> Spec: `spec/active/SPEC_SOCIAL_COMMENT_AS_OPEN.md` · Desk: `PROMPT-GTM-DESK.md` / `PROMPT-GTM-SETTLE.md`

## Rules

1. One row per decision on a social-comment bounty.  
2. If `proofUrl` (normalized: strip tracking query junk when obvious) already **settled** → reject.  
3. Open reject before settle returns the full **$0.20** to the buyer.

## Table

| date (UTC) | seat | bountyJobId | hunterAgentId | platform | proofUrl | decision | notes |
|---|---|---|---|---|---|---|---|
| | | | | | | settle \| reject | |

*(Append below. Keep settled history.)*
