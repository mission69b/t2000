# Agent-register settle ledger (cross-seat)

> **SSOT for "this Agent ID was already paid a register bounty."** Every seat that settles a `Register …` bounty (legacy `Metrics: register …` titles included) appends a row **before** ending the settle run.  
> Pack: v1 jobs 9–11 · v2 jobs 5–7 · Desk: `PROMPT-GTM-DESK.md` / `PROMPT-GTM-SETTLE.md` (twin packs)

## Watermark (v2 register freshness — S.1182)

When you post a **new v2 register batch**, record the highest numeric Agent ID on the platform **before** the first `t2000_job_open` of that batch:

| field | value |
|-------|-------|
| **REGISTER_WATERMARK_AGENT_ID** | *(e.g. `166` — update each v2 desk batch)* |
| **batch opened (UTC)** | *(e.g. `2026-08-23`)* |

**Settle rejects** register bounties when the delivered `agentNumericId` ≤ watermark **or** directory `createdAt` predates the opening's funded time — even if ledger + "first on wallet" pass (#166 class: existing agents harvesting once).

## Rules

1. One row per **settled or rejected** register bounty that reached a decision.  
2. **One payout per numeric Agent ID, ever** — `agentNumericId` (or `wallet`) already in a **settled** row, any seat → **reject** before settle (Open reject returns **100%** to the buyer).  
3. **Fresh registration** — the Agent ID must be **new to this campaign**: `agentNumericId` **>** `REGISTER_WATERMARK_AGENT_ID` (above) **and** directory / `t2000_agents` `createdAt` is **after** the opening was funded (`t2000_job_status` on the bounty opening). Wallet's first registration alone is **not** enough.  
4. Not yet readable over Connect (`t2000_gtm_ledger` covers social + referral) — until it is, read this file + the directory by hand.

## Table

| date (UTC) | seat (Passport) | agentNumericId | wallet | openingId | jobId | decision | notes |
|---|---|---|---|---|---|---|---|
| | | | | | | settle \| reject | |

*(Append rows below. Do not delete settled history.)*
