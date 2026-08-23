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

| 2026-08-23 | funkii@ | 0x8db0163d0dddce8af81071786231b8c0ff7a3d5c6d057f3256f40629fe041276 | #210 | X | x.com/OgooluwaOb29500/status/2091641568331801051 | settle | morning batch S.1188 smoke / pre-ledger gap |
| 2026-08-23 | funkii@ | 0x45f9f92c11f390a60d28874550c96bbe69ba4b47330ee14cd94914096324c638 | #210 | X | x.com/OgooluwaOb29500/status/2091643631383748859 | settle | morning batch S.1188 smoke / pre-ledger gap |
| 2026-08-23 | funkii@ | 0x45be9c37ab83e5dd1c0418dda6b09606a5a61641104c391b81cc28791d84c989 | #210 | X | x.com/OgooluwaOb29500/status/2091644531091378201 | settle | morning batch S.1188 smoke / pre-ledger gap |
