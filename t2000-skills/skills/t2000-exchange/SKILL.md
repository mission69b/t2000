---
name: t2000-exchange
description: >-
  Exchange tokens via Cetus DEX with on-chain slippage protection.
  Use when asked to swap, exchange, convert, or trade between tokens.
  Supports USDC ⇌ SUI, stablecoin pairs, and any supported token pair.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Exchange

## Purpose
Exchange between tokens via Cetus DEX. Useful for acquiring SUI for gas,
converting earnings, or moving between stablecoins. On-chain slippage
protection enforced by Cetus CLMM pools.

## Command
```bash
t2000 exchange <amount> <from> <to>

t2000 exchange 5 USDC SUI              # buy SUI with USDC
t2000 exchange 2 SUI USDC              # sell SUI for USDC
t2000 exchange 10 USDC USDT            # stablecoin swap
t2000 exchange 5 USDC SUI --slippage 0.5  # custom slippage (default: 3%)
```

## Output
```
  ✓ Exchanged 5 USDC → 4.8500 SUI
  Tx:  https://suiscan.xyz/mainnet/tx/...
  Gas:  0.0050 SUI (self-funded)
```

## Options
| Flag | Description | Default |
|------|-------------|---------|
| `--slippage <pct>` | Maximum slippage percentage | 3% |
| `--json` | Machine-readable output | false |

## Supported Pairs
| From | To | Notes |
|------|----|-------|
| USDC | SUI | Buy SUI for gas or trading |
| SUI | USDC | Convert SUI earnings to stablecoins |
| USDC | USDT | Stablecoin swap |
| USDC | USDe | Stablecoin swap |
| USDC | USDsui | Stablecoin swap |
| Any supported | Any supported | All pairs routed via Cetus |

## When to use
- Need SUI for gas but only have USDC
- Converting SUI earnings to stablecoins
- Moving between stablecoin types
- Agent needs to acquire a specific token

## Notes
- Exchange is also used internally by `rebalance` and `withdraw all` (auto-swap)
- No protocol fee on exchange — only standard Cetus pool fees apply
- Slippage protection is enforced on-chain by the Cetus CLMM contract
