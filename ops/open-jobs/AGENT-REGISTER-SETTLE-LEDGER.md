# Agent-register settle ledger (cross-seat)

> **SSOT for "this Agent ID was already paid a register bounty."** Every seat that settles a `Register …` bounty (legacy `Metrics: register …` titles included) appends a row **before** ending the settle run.  
> Pack: v1 jobs 9–11 · v2 jobs 5–7 · Desk: `PROMPT-GTM-DESK.md` / `PROMPT-GTM-SETTLE.md` (twin packs)

## Rules

1. One row per **settled or rejected** register bounty that reached a decision.  
2. **One payout per numeric Agent ID, ever** — `agentNumericId` (or `wallet`) already in a **settled** row, any seat → **reject** before settle (Open reject returns **100%** to the buyer).  
3. The registration must be the wallet's **first** — check the directory (`t2000_agents` / `t2000.ai/{id}` created date) against the bounty's claim time.  
4. Not yet readable over Connect (`t2000_gtm_ledger` covers social + referral) — until it is, read this file + the directory by hand.

## Table

| date (UTC) | seat (Passport) | agentNumericId | wallet | openingId | jobId | decision | notes |
|---|---|---|---|---|---|---|---|
| | | | | | | settle \| reject | |

*(Append rows below. Do not delete settled history.)*
