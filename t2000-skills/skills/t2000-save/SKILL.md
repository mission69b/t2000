---
name: t2000-save
description: >-
  Deposit USDC or USDsui into savings to earn yield on Sui via NAVI
  Protocol. Use when asked to save money, earn interest, deposit to
  savings, "swap and save" a non-USDC token, or put funds to work. Not
  for sending to other addresses — use t2000-send for that.
license: MIT
metadata:
  author: t2000
  version: "1.7"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Save (Deposit to Savings)

## Purpose
Deposit **USDC or USDsui** into savings to earn yield on NAVI Protocol. Funds remain non-custodial and
withdrawable at any time. USDsui is permitted as a strategic exception (v0.51.0+) because it has
its own NAVI pool, often at a different APY than USDC. Every other token (GOLD, SUI, USDT, USDe,
ETH, NAVX, WAL) is **not saveable** — swap to USDC or USDsui first.

## Rules

1. **Only USDC or USDsui save.** The SDK enforces it via `assertAllowedAsset('save', asset)`; other tokens return `UNSUPPORTED_ASSET`.
2. **Don't auto-swap.** If the user says "save 10 SUI", confirm the swap-and-save intent first — some users want to keep SUI exposure.
3. **Engine bundling: same turn or not at all.** When you need swap + save, emit BOTH `tool_use` blocks in the same assistant turn so the engine compiles ONE atomic Payment Intent. Never call them in separate turns — that loses atomicity and exposes price drift.
4. **Preview is mandatory.** Before emitting, always surface: source token + amount, estimated USDC received (from `swap_quote`), save APY, total fees. The user signs once but the LLM walks them through the math first.
5. **CLI users get sequential.** The CLI doesn't bundle. Run `t2000 swap` then `t2000 save all` — accept small drift for amounts under $1k.

## Command
```bash
t2000 save <amount> [--asset USDC|USDsui]
t2000 save all [--asset USDC|USDsui]

# Examples:
t2000 save 80                    # 80 USDC (default)
t2000 save 80 --asset USDsui     # 80 USDsui
t2000 save all                   # full USDC balance (minus $1 gas reserve)
t2000 save all --asset USDsui    # full USDsui balance (minus 1.0 reserve)
```

- `save all`: deposits full available balance of the chosen asset minus 1.0 of that asset for safety
- `--asset` defaults to USDC when omitted

## Fees
- Protocol fee: 0.1% on deposit (collected atomically on-chain)

## Output
```
✓ Gas manager: $1.00 USDC → SUI          [only shown if auto-topup triggered]
✓ Saved $XX.XX <asset> to best rate
✓ Current APY: X.XX%
✓ Savings balance: $XX.XX <asset>
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Notes
- APY is variable based on protocol utilization (USDC and USDsui pools quote independently)
- If available balance of the chosen asset is too low, returns INSUFFICIENT_BALANCE
- `t2000 supply` is an alias for `t2000 save`
- **Repay symmetry (v0.51.1+):** if you borrow USDsui, you must repay with USDsui (and USDC borrows must repay with USDC) — the SDK fetches the matching coin type per borrow asset.

## Saving a non-USDC token ("swap and save")

If the user wants to save a token that's **not** USDC or USDsui — GOLD,
SUI, USDT, USDe, ETH, NAVX, WAL — the agent must swap first, then save.
The right flow depends on the consumer:

### Engine (audric/web) — bundled atomic swap + save

Emit BOTH tool_use blocks in the SAME assistant turn. The engine's
permission gate compiles them into ONE Payment Intent: the swap's
`received` coin handles off as the save's input via coin-ref inside the
same PTB. Atomic — both succeed or both revert. User signs once.

```
[ASSISTANT TURN — emit in parallel]
  tool_use: swap_execute({ from: "SUI", to: "USDC", amount: 1.0 })
  tool_use: save_deposit({ amount: <swap_received>, asset: "USDC" })
```

Before emitting, **always preview** to the user:
- The source token + amount being swapped
- Estimated USDC received (from `swap_quote`)
- The save APY they'll earn
- Total fees (Cetus + Audric overlay + NAVI save fee)

**Do NOT** call swap then save in separate turns — that loses atomicity
and exposes the user to price drift between the legs.

**Do NOT** auto-decide for the user. If they say "save 10 SUI", confirm
the intent: "That requires swapping ~10 SUI to ~$XX USDC first, then
depositing. Proceed?" Some users want to hold SUI.

### CLI — sequential (no bundling)

The CLI doesn't support Payment Intent bundling. Run two commands:

```bash
t2000 swap 1.0 SUI to USDC
t2000 save all
```

Each command prices against on-chain state at the moment of execution,
so there's small price drift between them. For large amounts ($1k+),
prefer the agent path which bundles into one Payment Intent.

### What's NOT saveable

GOLD, SUI, USDT, USDe, ETH, NAVX, WAL — none of these have NAVI lending
pools today, so they can't be saved directly. Must swap to USDC or
USDsui first. This is enforced by the SDK's `assertAllowedAsset('save',
asset)` allow-list — calling `save_deposit({ asset: 'SUI' })` returns
`UNSUPPORTED_ASSET`.
