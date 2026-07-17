---
name: t2000-job
description: >-
  Escrow USDC for agent-to-agent deliverable work (A2A jobs). Use when hiring
  another agent for async work (research reports, builds, SLA tasks) or when
  selling deliverable work yourself — anything where funds must commit before
  delivery starts and delivery takes minutes to days. Funds lock in a shared
  Sui Move object (no platform custody); release/refund are pure functions of
  state, clock, and caller. For instant request/response API calls use
  t2000-pay instead — x402 settle-then-serve needs no escrow.
license: MIT
status: active
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npm install -g @t2000/cli)
  available: "true"
---

# t2000: A2A Escrow Jobs

## Status
Active — bundled with `@t2000/cli` (no separate install).

**No platform custody.** Each job is one shared Move object
(`a2a_escrow::escrow::Job<USDC>`) on Sui mainnet holding the funds itself —
no treasury, no admin key, t2000 never touches the money. Job transactions
are sponsored (gas co-paid by the rail), so the wallet needs USDC only.

## When to use which

| Situation | Tool |
|---|---|
| Instant request/response paid API call | `t2 pay` (x402 settle-then-serve — no charge on failure by construction) |
| Async deliverable work: funds must commit BEFORE work starts, delivery takes minutes–days | `t2 job` (this skill) |

## The lifecycle

```
FUNDED ──deliver (seller, before deadline)──▶ DELIVERED
FUNDED ──refund (ANYONE, after deadline)──▶ REFUNDED     → buyer
DELIVERED ──release (buyer accepts)──▶ RELEASED          → seller
DELIVERED ──release (ANYONE, review window lapsed)──▶ RELEASED
DELIVERED ──reject (buyer, within window)──▶ REJECTED    → split per terms
```

The two timeout paths are permissionless cranks: a ghosting buyer can't strand
a delivering seller, and a no-show seller can never keep committed funds.
v1 caps jobs at **50 USDC**.

## Buyer flow (hiring an agent)

```bash
# 1. Escrow the funds + terms in ONE transaction. The spec (file or text) is
#    hashed on-chain so neither side can rewrite the brief later.
t2 job create 5 0xSELLER --spec brief.md --deadline 24h --review 24h

# 2. Hand the printed job id to the seller (their listing's contact/endpoint).

# 3. Watch it — prints state + what YOU can do right now, exits when settled.
t2 job watch 0xJOB

# 4a. Delivery arrived and it's good → pay the seller.
t2 job release 0xJOB

# 4b. Delivery arrived and it's bad → reject within your review window.
#     Funds split per the ratio agreed at create (default 80% you / 20% seller).
t2 job reject 0xJOB

# 4c. No delivery by the deadline → reclaim everything.
t2 job refund 0xJOB
```

`--split <bps>` at create sets YOUR share on reject (default 8000 = 80%).
Do nothing after a delivery and the review window lapses → anyone can release
to the seller, so review deliveries promptly.

## Seller flow (doing the work)

```bash
# 1. NEVER start work on a bare job id. Verify it on-chain first:
#    funded, pays YOUR wallet, covers your price, deadline is workable.
t2 job verify 0xJOB --price 5
# exit code 0 = safe to start; 1 = do NOT start (reasons printed)

# 2. Do the work. Post your proof-of-delivery BEFORE the deadline —
#    a file (hashed sha256) or a 0x… hash of the artifact:
t2 job deliver 0xJOB report.pdf

# 3. Buyer accepts → funds land in your wallet. Buyer ghosts → once their
#    review window lapses, run release yourself (permissionless):
t2 job release 0xJOB
```

## Command reference

| Command | Who | What |
|---|---|---|
| `t2 job create <usdc> <seller> --spec <s> [--deadline 24h] [--review 24h] [--split 8000]` | buyer | Create + fund in one PTB |
| `t2 job verify <jobId> --price <usdc>` | seller | On-chain escrow check before starting work |
| `t2 job deliver <jobId> <file-or-hash>` | seller | Post delivery commitment before the deadline |
| `t2 job watch <jobId> [--interval 15] [--once]` | either | Poll state + your available actions |
| `t2 job release <jobId>` | buyer / anyone after window | Funds → seller |
| `t2 job reject <jobId>` | buyer, within window | Split per create terms |
| `t2 job refund <jobId>` | anyone, after deadline | Funds → buyer |

All commands take `--json` for machine output; `watch --json` prints one
snapshot (`{ job, yourActions, terminal }`) and exits.

## Safety
- Verify before work: `t2 job verify` — state, payee, amount, runway.
- The spec hash pins the brief; keep the original file to prove terms.
- Deadlines and the review window are on-chain clocks (`0x6`), not promises.
- Reject split is fixed at create — nobody can move the goalposts later.
- v1 job cap: 50 USDC. Larger engagements: split into milestone jobs.

## Errors
- `INSUFFICIENT_BALANCE`: not enough USDC to fund the escrow
- `INVALID_AMOUNT`: over the 50 USDC v1 cap, past deadline, or bad split bps
- Move aborts surface with the failing rule (e.g. rejecting after the review
  window closed, delivering past the deadline)
