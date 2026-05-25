---
name: t2000-stake
description: >-
  Stake SUI for vSUI via VOLO liquid staking (Sui-native, non-custodial,
  ~3-5% APY). Use when asked to stake SUI, earn validator rewards, get
  vSUI, or "let my SUI work." Unstake via `t2000 unstake`. Not for
  stablecoin yield — use t2000-save for USDC / USDsui savings.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Stake SUI (Liquid Staking via VOLO)

## Purpose

Convert SUI into vSUI through VOLO's liquid staking pool. vSUI accrues validator rewards (~3-5% APY today) while remaining liquid — tradable on Cetus, usable as collateral in some DeFi venues, and unstakable back to SUI at any time.

## Rules

1. **Minimum is 1 SUI.** The CLI rejects amounts below 1 (the gas + relayer overhead dominates smaller stakes).
2. **Keep a gas reserve.** Never stake the wallet's entire SUI balance — keep ≥0.05 SUI for future transactions. The CLI does NOT auto-reserve here; the user must subtract.
3. **vSUI ≠ SUI.** vSUI is a separate token type. Use `t2000 balance --show-limits` to see the vSUI position; use `t2000 unstake` to convert back.
4. **Not the same as NAVI savings.** Liquid staking earns validator rewards (~3-5%); NAVI USDC savings earn lending APY (3-8%). Different protocols, different yields, different assets. Use `t2000-yields` to compare.
5. **One stake per intent.** Don't bundle with another write; VOLO writes a `mint` op that doesn't compose cleanly with NAVI or Cetus.

## Command

```bash
t2000 stake <amount>

# Examples:
t2000 stake 10              # stake 10 SUI for vSUI
t2000 stake 100             # stake 100 SUI for vSUI
```

To unstake:

```bash
t2000 unstake <amount>
t2000 unstake all
```

`unstake` redeems vSUI back to SUI including accumulated rewards.

## Fees

- **Network gas:** ~0.001 SUI per stake (self-funded)
- **VOLO protocol:** the validator rewards share is built into the SUI:vSUI exchange rate (no separate cut)
- **t2000:** zero fee

## Output

```
✓ Staked 10 SUI for 9.9876 vSUI
  APY: 3.47%
  Gas: 0.0024 SUI
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

vSUI received is slightly less than SUI staked because vSUI represents proportional ownership of the pool — and the pool has already accrued rewards since the last rebase. As the pool keeps earning, your fixed vSUI balance redeems for more SUI.

## When to recommend staking

- The user holds idle SUI and wants yield without leaving the SUI ecosystem.
- They prefer Sui-native liquid staking over stablecoin lending.
- They want to keep SUI exposure (price upside) while still earning.

## When NOT to recommend staking

- The user holds USDC and asks for yield → recommend `t2000-save` instead (NAVI USDC is 3-8% APY vs 3-5% liquid staking, and USDC is the stable they likely came in with).
- The user wants stablecoin liquidity for paying / sending — vSUI is a held asset, not a payment medium.
- The user might need the SUI for gas in the next ~hour — keep at least 0.05 SUI liquid.

## Comparison to NAVI savings

| Property | `t2000 stake` (VOLO) | `t2000 save` (NAVI) |
|---|---|---|
| Asset | SUI → vSUI | USDC / USDsui |
| Yield | ~3-5% APY | ~3-8% APY (variable) |
| Yield source | Sui validator rewards | DeFi lending demand |
| Liquidity | vSUI tradable on Cetus | Withdrawable on demand |
| Risk | Validator slashing (rare) | Smart-contract + liquidity |
| Use as collateral | Yes (some venues) | Yes (NAVI native) |

## Error handling

- `INSUFFICIENT_BALANCE` — wallet has less SUI than requested (or less after gas reserve).
- `AMOUNT_TOO_SMALL` — below the 1 SUI minimum. Suggest 1+.
- `POOL_PAUSED` — VOLO pool is paused for maintenance. Wait or use `t2000-save` if the user wants stablecoin yield instead.

## Engine orchestration (audric/web)

VOLO tools (`volo_stake` / `volo_unstake` / `volo_stats`) were **removed from the engine in S.277** (2026-05-23) as part of the "Earns Its Keep" audit — they had no Audric product slot. **The SDK + CLI + MCP still expose stake / unstake** for non-Audric consumers (the `@t2000/cli` engine usage and direct SDK callers).

For Audric users who want SUI yield, the recommended path is:
1. `swap_quote` SUI → USDC at current rate
2. `swap_execute` + `save_deposit` (atomic via Payment Intent) — earns NAVI USDC APY
3. If they want SUI back later, withdraw + swap back.

This is a deliberate product choice — Audric's yield surface is intentionally narrow (USDC + USDsui via NAVI). CLI users who specifically want vSUI exposure have direct access via this skill.
