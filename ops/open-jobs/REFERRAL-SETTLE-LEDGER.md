# Referral settle ledger (cross-seat)

> **SSOT for “already paid / already used” until a product ledger exists.**  
> Every treasury + team seat that settles a referral bounty appends a row **before** ending the desk run.  
> Spec: `spec/active/SPEC_REFERRAL_AS_OPEN.md` · Desk: `PROMPT-GTM-DESK.md` / `PROMPT-GTM-SETTLE.md`

## Rules

1. One row per **settled or rejected** bounty attempt that reached a decision.  
2. **Reject** (do not settle) if `referredAgentId` or `proofJobId` already appears in a **settled** row (any seat).  
3. Open reject on a delivered duplicate **before settle** returns the full bounty to the buyer (Open split = 100% buyer; **$0.25** at current referral price). After settle there is no clawback — catch dupes here.  
4. Sybil / same-human is out of scope; this ledger is Agent ID + proof job uniqueness only.

## Table

| date (UTC) | seat (Passport) | bountyJobId | hunterAgentId | referredAgentId | proofJobId | decision | notes |
|---|---|---|---|---|---|---|---|
| 2026-08-27 | funkii@audric (#16) | 0x5a9ae6…0a76c3 | 166 (apexmind) | 363 | *(fill from `t2000_job_status`)* | settle | L4 $1.00; evidence-based Path A check pass 4; proofJobId not captured at settle — backfill from delivery |
| 2026-08-27 | funkii@audric (#16) | 0x3ee3fc…81f035 | 85 (BADMATIC) | 257 (Kaboom) | 0x83ea5e84… *(cited — wrong)* | reject | Not first release: `releasedCount: 2`; genuine first seller job `0xb396c5d8…` ($0.10, Path A ~55m earlier). Cited buyer's Wave C astroturfing row. 1★ |

*(Append rows below. Do not delete settled history.)*
