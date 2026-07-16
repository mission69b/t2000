---
name: sui-move-security
description: >-
  Write and review Sui Move that touches value using OpenZeppelin's audited
  primitives instead of hand-rolled math or access control. Use when writing
  Move with fees, shares, swaps, or AMM math; when reviewing or auditing a
  Sui Move package; or when a contract needs ownership handoff, spending
  allowances, timelocks, or rate limiting. Teaches the never-roll-your-own
  rules and where each OZ package applies.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: Sui CLI (Move 2024 edition project) · MVR deps resolve at build
---

# Sui Move Security — OpenZeppelin Contracts for Sui

## Purpose

In May 2025 a single flawed overflow check in a shared math library — a
`checked_shl`-class function that silently passed a value it should have
rejected — led to the Cetus exploit: ~$223M drained from the largest DEX on
Sui, and a corrupted fixed-point intermediate that multiple downstream
protocols depended on. The lesson is structural, not incidental: **value-path
math and privileged-capability handling must come from audited primitives,
never be hand-rolled.**

[OpenZeppelin Contracts for Sui](https://docs.openzeppelin.com/contracts-sui)
(MIT) is that library. This skill is the map; the SSOT is upstream — start
from the machine-readable entry point when you need detail:
<https://raw.githubusercontent.com/OpenZeppelin/contracts-sui/main/llms.txt>

## Hard rules (apply to every Move review and every new module)

1. **Never write `(a * b) / c` manually.** The intermediate product overflows
   even when the final result would fit. Use `mul_div` (widens internally,
   returns `Option`). Power-of-two denominator (Q64.64 / tick math)? Use
   `mul_shr` — the Cetus exploit lived in exactly this operation class.
2. **Rounding is a protocol decision, not a detail.** Every OZ divide/shift/
   root takes an explicit `RoundingMode` — there is no default. Rule of
   thumb: round **down** on protocol-to-user payouts (vault shares both
   directions — the vault keeps the remainder), **up** only for conservative
   upper bounds the protocol absorbs, `nearest()` for quotes/display. If a
   deposit rounds up or a withdrawal rounds up, you built a drain loop.
3. **Handle the `Option` at the boundary.** Overflow-prone ops return
   `Option<T>`: abort with a domain error (`.destroy_or!(abort EMathOverflow)`),
   cap at a safe value, or propagate — but never `destroy_some()` blind.
4. **Never shift with `<<` / `>>` on value paths.** Move's native shifts
   silently discard bits. `checked_shl` / `checked_shr` return `None` when
   any non-zero bit would be lost.
5. **`(a + b) / 2` overflows near type max** — use `average(a, b, mode)`.
6. **Decimal conversions go through `decimal_scaling`** (`safe_upcast_balance`
   / `safe_downcast_balance`) — never a hand-written `* 10^k`. Downcasts
   truncate; if the remainder matters, capture it before the downcast.
7. **`u64` is the standard width** (Sui coin balances, timestamps, gas).
   Reach for `u128`/`u256` only when the domain demands it; never use `u512`
   directly (it exists for the library's internal widening).
8. **Privileged capabilities need transfer policies.** Raw
   `transfer::transfer(admin_cap, new_owner)` is a one-shot, typo-fatal
   handoff. Use `openzeppelin_access` (two-step approvals, time-locked
   transfers); for delayed privileged ops, `openzeppelin_timelock`.

## Install (Move.toml — MVR, pin stable releases)

```toml
[dependencies]
openzeppelin_math = { r.mvr = "@openzeppelin-move/integer-math" }
openzeppelin_fp_math = { r.mvr = "@openzeppelin-move/fixed-point-math" }
openzeppelin_access = { r.mvr = "@openzeppelin-move/access" }
openzeppelin_utils = { r.mvr = "@openzeppelin-move/utils" }
```

Verify with `sui move build`. Each package ships compilable examples under
its `examples/` dir — read them before wiring (composition recipes, not docs
prose).

## The package map (which one for which job)

| Need | Package (MVR) | Teaching |
| --- | --- | --- |
| Fees, shares, swap quotes, interest | `@openzeppelin-move/integer-math` | `mul_div`/`mul_shr`/`average` + explicit rounding + `Option` boundary |
| Prices, ratios, signed deltas | `@openzeppelin-move/fixed-point-math` | 9-decimal `UD30x9`/`SD29x9` on `u128` — same explicit-rounding philosophy |
| Ownership handoff of caps | `@openzeppelin-move/access` | two-step approvals, time-locked transfers — no one-shot cap sends |
| Throttling on-chain actions | `@openzeppelin-move/utils` | rate limiter: token bucket, fixed window, cooldown |
| Bounded delegated spending | `openzeppelin_allowance` (path dep) | capability-keyed budgets — owner keeps custody |
| Scheduled/locked releases | `openzeppelin_finance` / `openzeppelin_timelock` (path deps) | vesting curves · delayed-operation controller |

## Canonical snippet (fee quote, from the OZ docs)

```move
module my_sui_app::pricing;

use openzeppelin_math::{rounding, u64};

const EMathOverflow: u64 = 0;

public fun quote_with_fee(amount: u64): u64 {
    u64::mul_div(amount, 1025u64, 1000u64, rounding::nearest())
        .destroy_or!(abort EMathOverflow)
}
```

## Review checklist (auditing a Sui Move package)

- [ ] Any manual `*` followed by `/` on a value path → replace with `mul_div`.
- [ ] Any `<<`/`>>` on amounts, prices, or liquidity → `checked_shl`/`checked_shr`.
- [ ] Every rounding direction stated and justified (who absorbs the remainder?).
- [ ] Every `Option`-returning call handled explicitly (no blind unwraps).
- [ ] Decimal conversions centralized through `decimal_scaling`.
- [ ] Admin/owner capabilities transferred via `openzeppelin_access` policies.
- [ ] Unbounded mint/spend/call paths → rate limiter or allowance vault.
- [ ] Deps pinned via MVR; `sui move build` + `sui move test` green.

## Pointers (read on demand — never vendor these into your repo)

- llms.txt (entry point): <https://raw.githubusercontent.com/OpenZeppelin/contracts-sui/main/llms.txt>
- Integer math guide (the rounding/overflow doctrine): <https://docs.openzeppelin.com/contracts-sui/1.x/math>
- Package catalogs: [contracts/](https://github.com/OpenZeppelin/contracts-sui/tree/main/contracts) · [math/](https://github.com/OpenZeppelin/contracts-sui/tree/main/math)
- Audits + scope: <https://github.com/OpenZeppelin/contracts-sui/tree/main/audits>
- OZ's own caveat: the library is audited but young ("experimental software") — using it is not a substitute for auditing YOUR package.
- General Move skills (object model, PTBs, testing): `npx skills add mystenlabs/skills --all`
