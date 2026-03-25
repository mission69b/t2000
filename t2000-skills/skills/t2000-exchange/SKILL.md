---
name: t2000-exchange
description: >-
  Swap tokens via Cetus DEX with on-chain slippage protection.
  Use when asked to swap, exchange, or convert between tokens.
  Supports USDC ⇌ SUI, stablecoin pairs, and any supported token pair.
license: MIT
metadata:
  author: t2000
  version: "1.2"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Swap (Exchange)

## Purpose
Swap between tokens via Cetus DEX. Useful for acquiring SUI for gas,
converting earnings, or moving between stablecoins. On-chain slippage
protection enforced by Cetus CLMM pools.

## Command
```bash
t2000 swap <amount> <from> <to>

t2000 swap 5 USDC SUI              # buy SUI with USDC
t2000 swap 2 SUI USDC              # sell SUI for USDC
t2000 swap 10 USDC suiUSDT         # stablecoin swap
t2000 swap 5 USDC SUI --slippage 0.5  # custom slippage (default: 3%)
```

> **Deprecated alias:** `t2000 exchange` still works but is deprecated. Use `t2000 swap` instead.

## Output
```
  ✓ Swapped 5 USDC → 4.8500 SUI
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
| USDC | suiUSDT | Stablecoin swap |
| USDC | suiUSDe | Stablecoin swap |
| USDC | USDsui | Stablecoin swap |
| Any supported | Any supported | All pairs routed via Cetus |

## When to use
- Need SUI for gas but only have USDC
- Converting SUI earnings to stablecoins
- Moving between stablecoin types
- Agent needs to acquire a specific token

## Notes
- Swap is also used internally by `rebalance` and `withdraw all` (auto-swap)
- No protocol fee on swap — only standard Cetus pool fees apply
- Slippage protection is enforced on-chain by the Cetus CLMM contract
- MCP tool ID remains `t2000_exchange` for backward compatibility
