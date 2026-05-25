---
name: t2000-yields
description: >-
  Compare yield opportunities across t2000 — current save / borrow APYs for
  USDC and USDsui on NAVI, and the user's current earning positions. Use
  when asked "what's the best yield?", "where should I park USDC?", "should
  I save USDC or USDsui?", "what's my earning rate?", or "compare yields".
  Pairs with t2000-save (action) and t2000-rebalance (multi-leg planning).
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Compare Yields

## Purpose

Surface every earning opportunity the user has on t2000 — current NAVI pool APYs (USDC + USDsui, save + borrow), the user's open positions, and earnings so far. Helps the user choose where to deploy idle funds without dragging them through five different commands.

> **Note (S.323 / 2026-05-25):** Liquid staking via VOLO was removed from t2000 entirely. SUI staking is no longer a t2000 yield option. If the user holds SUI and wants yield, swap to USDC (or USDsui) and save — that is the only yield path t2000 exposes today.

## Rules

1. **Always read live state.** Cache nothing — APY swings hourly. Run `t2000 rates` (or `rates_info` in the engine) every time the user asks.
2. **Compare apples-to-apples.** USDC and USDsui have separate NAVI pools at different APYs; surface both with the spread. Don't lead with "the USDC rate" when USDsui is paying more.
3. **Strip the marketing lift.** NAVI's quoted APY includes liquidity-mining rewards in some pools — net APY (lending only) is the durable number. Surface both if the rates feed splits them.
4. **Yield ≠ free.** When recommending a save, also surface: smart-contract risk (NAVI is battle-tested but non-zero), liquidity risk (variable APY, withdrawable anytime), tax considerations (out of scope — flag and move on).
5. **Match the user's asset.** If they hold USDC or USDsui, lead with that pool. If they hold SUI and ask about yield, surface the swap-and-save path — there is no SUI-native yield product on t2000.

## Commands

```bash
# Cross-asset APY snapshot
t2000 rates

# Single-asset deep dive (e.g. USDC across every protocol that offers it)
t2000 rates --asset USDC

# Your current earnings + APY (positions weighted)
t2000 earnings

# Full savings summary (deposits, blended APY, projected monthly)
t2000 fund-status

# Earning opportunities directory (alternative entry point)
t2000 earn
```

## Output (`t2000 rates`)

```
USDC      Save: 5.10% APY   Borrow: 7.20% APY   (NAVI)
USDsui    Save: 6.40% APY   Borrow: 7.80% APY   (NAVI)
```

If a pool is paused or degrading, the row shows `--` for the affected side.

## Output (`t2000 earnings`)

```
Savings:
  $100.00 USDC on NAVI @ 5.10% APY
  $200.00 USDsui on NAVI @ 6.40% APY

Earned today:      ~$0.06
Earned all time:   ~$2.34
Monthly projected: ~$1.79
```

## Decision guide for the agent

**User says "best place to park USDC":**
- Lead with the higher of `USDC save APY` and `USDsui save APY`.
- If USDsui is higher: surface the spread, surface the swap cost (~0.05% on the USDC→USDsui leg), and confirm the spread covers the swap before recommending the switch.
- Else: NAVI USDC save is the answer — atomic, well-trodden, lowest friction.

**User says "where's my yield going":**
- Run `t2000 earnings` (or `yield_summary` in the engine).
- Surface position-by-position breakdown with the blended APY at the top.
- Flag any position older than 30 days where APY has dropped by >2% from initial — they may want to reconsider.

**User says "I hold SUI, what's the best yield?":**
- t2000 does not expose a SUI-native yield product. The path is `t2000-swap` (SUI → USDC or USDsui) + `t2000-save`.
- Surface: net APY post-swap-fee (Cetus ~0.05% on the SUI→stable leg). Confirm the user is OK losing SUI price exposure.
- If they want to keep SUI price exposure: tell them honestly that t2000 doesn't have a way to earn yield on SUI directly today. Don't invent one.

**User says "should I borrow USDC":**
- This is a credit decision, not a yield one. Pull `t2000 rates --asset USDC` for the borrow APY, then route to `t2000-borrow` for the safety checks.

## Engine orchestration

The engine's `rates_info` tool returns the same shape as `t2000 rates` plus protocol metadata (pool addresses, last refreshed). For multi-leg "compare and act" flows:

1. Call `rates_info` (read, auto).
2. Call `yield_summary` if the user has positions (read, auto).
3. Compose a comparison response — surface numbers + recommendation in prose.
4. If the user confirms a move, hand off to the action skill (`t2000-save`, `t2000-swap`, `t2000-rebalance`).

## What NOT to do

- **Don't recommend yield-chasing.** A 0.3% APY spread between pools is not worth the swap friction + tax event for most users. Recommend a switch only when the spread > 1.0% AND the user holds the source asset already.
- **Don't quote off-platform APYs.** "Aave USDC on Solana is 8%" is not a t2000 recommendation — t2000 is Sui-native by design.
- **Don't auto-execute the rebalance.** Yield comparison is read-only. Any "let's just switch you" requires the user to invoke `t2000-rebalance` and confirm each leg.
- **Don't invent staking.** t2000 has no SUI staking, no vSUI minting, no liquid-staking product. If the user asks for it, be honest: "We don't support that. Closest path is swap SUI → USDC and save."

## Related skills

- `t2000-save` — execute the save once a decision is made.
- `t2000-swap` — convert SUI / other tokens to a saveable stable.
- `t2000-rebalance` — multi-leg "move funds to best yield" plan.
- `t2000-borrow` — credit side of the NAVI pool.
