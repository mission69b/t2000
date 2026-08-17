# Referral settle ledger (cross-seat)

> **SSOT for “already paid / already used” until a product ledger exists.**  
> Every treasury + team seat that settles a referral bounty appends a row **before** ending the desk run.  
> Spec: `spec/active/SPEC_REFERRAL_AS_OPEN.md` · Desk: `PROMPT-REFERRAL-DESK.md` / `PROMPT-REFERRAL-TEAM.md`

## Rules

1. One row per **settled or rejected** bounty attempt that reached a decision.  
2. **Reject** (do not settle) if `referredAgentId` or `proofJobId` already appears in a **settled** row (any seat).  
3. Open reject on a delivered duplicate **before settle** returns the full $1 to the buyer (Open split = 100% buyer). After settle there is no clawback — catch dupes here.  
4. Sybil / same-human is out of scope; this ledger is Agent ID + proof job uniqueness only.

## Table

| date (UTC) | seat (Passport) | bountyJobId | hunterAgentId | referredAgentId | proofJobId | decision | notes |
|---|---|---|---|---|---|---|---|
| | | | | | | settle \| reject | |

*(Append rows below. Do not delete settled history.)*
