---
name: t2000-swap
description: >-
  Swap tokens on Sui via Cetus Aggregator (20+ DEXs, best-route across SUI,
  USDC, USDsui, USDT, USDe, ETH, GOLD, NAVX, WAL, vSUI, and more). Use when
  asked to swap, trade, convert, exchange, or "turn X into Y". Also use as
  a preflight inside the engine's "swap and save" / "swap and pay" bundled
  flows. Do not use for sending — use t2000-send for transfers.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Swap Tokens

## Purpose

Convert between tokens at the best available rate. Cetus Aggregator routes across 20+ DEXs and picks the lowest-price-impact path. Slippage defaults to 1%; configurable up to 5%.

## Rules

1. **Preview before signing.** Always run `t2000 swap-quote ...` (or call `swap_quote` in the engine) and surface `priceImpact` + `toAmount` to the user before broadcasting.
2. **Decline obviously bad swaps.** If `priceImpact > 0.5%` (50 bps), warn the user and require explicit confirmation. If `priceImpact > 5%`, refuse — that's almost certainly a thin-liquidity trap.
3. **One swap per intent.** Cetus aggregator handles multi-hop internally; do not chain `swap` calls.
4. **Don't auto-decide stables.** If the user says "swap to USD", ASK whether USDC or USDsui — they have different NAVI pool APYs.
5. **Engine path is the swap-and-save / swap-and-pay anchor.** When the user asks "save my SUI", the engine emits `swap_execute` + `save_deposit` in the SAME turn → atomic Payment Intent. See the `t2000-save` skill for the bundling contract.

## Command

```bash
t2000 swap <amount> <from> [for] <to> [--slippage <pct>]

# Examples:
t2000 swap 100 USDC SUI               # 100 USDC → SUI, default 1% slippage
t2000 swap 100 USDC for SUI           # same; `for` keyword is optional
t2000 swap 5 SUI USDC --slippage 2    # 5 SUI → USDC, 2% slippage
t2000 swap 50 USDC USDsui             # stable-to-stable; usually <0.05% impact
```

Slippage is capped at 5% (any higher is rejected — that's degenerate liquidity).

## Preview (no signing)

```bash
t2000 swap-quote <amount> <from> <to>
```

Returns:
- `toAmount` — estimated output (at current pool state)
- `priceImpact` — basis points moved by the trade
- `route` — provider name(s) Cetus selected

## Fees

- **Network gas:** ~0.001-0.01 SUI per swap (self-funded from the wallet)
- **Cetus protocol fee:** typically 0.05-0.30% depending on the pool tier (already baked into `toAmount`)
- **t2000 / CLI:** zero fee. Audric (consumer product) adds a 10 bps overlay fee — that's separate, not charged by the CLI.

## Output

```
✓ Swapped 100 USDC for 49.8721 SUI
  Price Impact: 0.04%
  Route: USDC → SUI (Cetus → Turbos)
  Gas: 0.0038 SUI
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Engine orchestration

When called inside the Audric chat agent, `swap_execute` always pairs with a `swap_quote` first turn (or fresh quote inside the same turn) so the LLM can:
1. Compute the projected output value in USD via `token_prices`.
2. Surface a confirm card with: `fromAmount`, `toAmount`, `priceImpact`, `route`, `fee`.
3. Block on user confirm — every swap is `permissionLevel: 'confirm'` (no auto-execute under zkLogin).

For "swap and save" — emit `swap_execute` + `save_deposit` in the same assistant turn so the engine compiles one atomic Payment Intent. See `t2000-save` for the full bundle contract.

## Error handling

- `SWAP_NO_ROUTE` — no path from `from` to `to` in Cetus's pool graph. Suggest going via USDC as an intermediate.
- `INSUFFICIENT_LIQUIDITY` — the requested size moves the pool too far. Suggest a smaller trade or splitting.
- `INSUFFICIENT_BALANCE` — wallet doesn't hold enough of the source token (after gas reserve).
- `SLIPPAGE_EXCEEDED` — by the time the tx confirmed, the pool moved past the slippage limit. Retry with the same params; usually transient.

## Supported tokens

USDC, USDsui, USDT, USDe, SUI, vSUI, ETH, GOLD (XAUM), NAVX, WAL, and the long tail Cetus routes through. Use the canonical symbol or pass a full coin type (`0x...::module::TYPE`). The `t2000` token registry resolves common symbols automatically.

## What NOT to do

- Don't auto-execute multi-leg flows ("swap A → B → C in three transactions"). If a multi-hop is needed, Cetus does it internally as one PTB.
- Don't recommend swapping mid-position rebalance without first surfacing impermanent-loss risk if the user asked for advice.
- Don't swap to a stable just to "park" funds — point them at `t2000-save` instead (yield > 0).
