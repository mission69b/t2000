---
name: t2000-sui-platform
description: >-
  Sui platform patterns for throughput and gas — Address Balances (SIP-58)
  accumulators that let ONE address run concurrent txs, and gasless stablecoin
  transfers that remove the "you need SUI to send USDC" wall. Includes the
  eligibility gotchas that cause misleading failures (0.01 minimum, the
  dust-remainder floor, contract-calls-are-not-gasless, gRPC-only auto-detect).
  Use when architecting a high-throughput payer or settlement address, building
  or debugging a USDC send, seeing an "insufficient SUI balance" or "Invalid
  withdraw reservation" error, considering a wallet fleet for scaling, or
  wondering whether a transaction leg qualifies as gasless.
---

# Sui Address Balances + Gasless Stablecoin Transfers

Two Sui platform features that change how we architect any **high-throughput
payer** (the Model B settlement float, the MPP gateway, future agent custody) and
any **gas-free user send** (Audric Pay → creator payouts, send-to-email claim
links). Read before assuming a single Sui address serializes, or before adding
SUI-for-gas onboarding friction.

## TL;DR — the two patterns

| Pattern | What it gives you |
|---|---|
| **Address Balances (SIP-58)** | Fungible assets held as ONE accumulator balance at the address, not a scatter of `Coin<T>` objects. Concurrent debits are accumulator mutations → no owned-object lock → a single address is **no longer single-threaded**. Pairs with non-sequential nonces (many in-flight txs, keyed by digest not a serial counter). Gas can be paid from the balance (`enable_address_balance_gas_payments`). |
| **Gasless stablecoin transfers** | Move USDC **without holding SUI** — gas is sponsored or paid in-asset. Removes the onboarding wall and the SUI gas coin as a contention object on a busy payer. |

Docs: `docs.sui.io/onchain-finance/asset-custody/address-balances/using-address-balances`
· `docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers`

## The myth these kill: "one Sui address can only do one tx at a time"

The classic owned-object model serializes a wallet on TWO objects:
1. The **gas coin** (every tx mutates it) → equivocation risk under concurrency.
2. The **payload coin** being spent (owned `Coin<T>`).

That's why the **client-side** consumer path ships `enqueueWalletWrite` (the
equivocation queue) — correct for one human wallet doing occasional writes.

A **high-throughput server payer** must NOT inherit that constraint:
- Address Balances remove #2 (accumulator, not owned object).
- Address-balance gas payments / gasless transfers remove #1.
- Non-sequential nonces let many settlement txs be in flight at once.

→ **A single settlement address scales.** A wallet *fleet* is an OPTIONAL lever
for blast-radius isolation or extreme headroom — **never a scaling prerequisite.**

## When to reach for which

- **Busy payer** (settlement float, gateway settlement, server-signing custody) →
  architect on **Address Balances + non-sequential nonces**. Do not pre-shard into
  a wallet fleet "for throughput."
- **A user/creator sends USDC and may not hold SUI** → **gasless stablecoin
  transfer** so onboarding never requires SUI. `@t2000/sdk` already does this.
- **Occasional single human wallet, client-side writes** → keep
  `enqueueWalletWrite`. Address Balances help, but the queue is cheap insurance
  for the human path; don't rip it out chasing this.

## Eligibility gotchas — do NOT overclaim "gasless"

**1. Gasless ≠ free Move calls.** The feature targets **stablecoin transfer**
flows. A *pure USDC transfer* leg qualifies. An MPP `pay()` — or any tx calling a
**custom Move contract** — is not automatically gasless; it still needs gas, which
**address-balance gas payments** or Enoki sponsorship cover. Classify each
settlement leg: pure transfer → gasless path; contract call → address-balance-gas
or sponsored path.

- **The eligible PTB shape is exactly the allowlisted trio** (`send_funds`,
  `redeem_funds`, `withdrawal_split` + helpers) on an **allowlisted stable**
  (USDC ✓, USDSUI ✓ — protocol config, re-verify across versions), `gasPayment`
  empty + `gasPrice = 0`, no object writes.
- **Minimum transfer 0.01** — gasless transfers below 0.01 of the asset are
  rejected at validation. Any per-call payment leg must price ≥ $0.01 or fall
  back to a gas-paid path.
- **Dust-remainder floor** (verified live 2026-07-19) — a gasless withdrawal must
  either consume the sender's ENTIRE balance of that stable, or leave a remainder
  ≥ 0.01. Sending 0.14 of 0.14625 USDC fails validation (*"Invalid withdraw
  reservation … must either use the entire balance, or leave at least 10000"*); on
  a zero-SUI wallet this surfaces as a **misleading "insufficient SUI balance"**
  gas-selection error. `buildSendTx` preflights this and throws a clear
  `INVALID_AMOUNT` with send-all / leave-0.01 suggestions.
- **Owned `Coin<T>` objects do NOT block gasless sends** — verified live
  2026-07-19: a fresh zero-SUI wallet funded via `transferObjects` (the escrow-
  payout shape) executed a gasless send-all fine; the gRPC resolver consumes coin
  objects into the gasless flow (`coin::into_balance` is allowlisted). Do not
  claim escrow payouts need a SUI top-up before the seller can move funds.
- **Congestion deprioritization** — gasless txs yield to gas-paying ones under
  load. Budget settlement-latency headroom; don't promise instant settlement.
- **Transport dependence** — the TS SDK **auto-detects gasless eligibility only on
  gRPC/GraphQL**. On JSON-RPC you must set `gasPrice 0` manually and an ineligible
  shape fails at validation. Another forcing function for the gRPC migration
  (JSON-RPC is deactivated on mainnet 2026-07-31 anyway — see `CLAUDE.md § Sui
  Integration`): build/execute gasless legs, including the x402
  `settleX402Payment` of client-signed bytes, on `SuiGrpcClient`.

**2. `enable_address_balance_gas_payments` is a protocol flag** — verify it's live
on mainnet before building hard on address-balance *gas* sponsorship. Gasless
stablecoin *transfers* are already live and exercised by the SDK; the
address-balance-*gas* half is newer. **Fallback: Enoki gas sponsorship** (already
wired for Passport writes).

**3. Migration cost.** Funds sitting in legacy owned `Coin<T>` objects must be
deposited into the address balance to get the concurrency benefit; withdrawing
back to a `Coin` when a downstream needs an object is a step. Don't assume every
balance is already an accumulator.

**4. Don't fork the canonical fetchers.** Address Balances change the
*write/concurrency* story, not the "one canonical reader" rule.

## What NOT to do

- ❌ Add a wallet fleet to the settlement float "so it scales" — it scales on one
  address. Fleet is security/extreme-scale only.
- ❌ Tell a user they need SUI to send/receive USDC — use the gasless path.
- ❌ Claim a Move-calling tx is "gasless" — only pure stablecoin transfers are.
- ❌ Architect address-balance *gas* payments as a hard dependency without
  confirming the mainnet flag — keep the Enoki fallback.

## Related

- Amount flooring for on-chain legs → `t2000-financial-amounts` skill
- The anchor signer's concurrency story → `t2000-confidential-verify` skill
- Enoki sponsorship path → `audric/.cursor/rules/audric-transaction-flow.mdc`
- `spec/` — `SPEC_AUDRIC_TOPUP_METERING.md` §3c (the scaling resolution this generalizes)
