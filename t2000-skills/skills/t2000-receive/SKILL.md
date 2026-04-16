---
name: t2000-receive
description: >-
  Generate a payment request to receive funds into the t2000 agent wallet. Use
  when asked to receive money, create a payment link, share a wallet address, or
  generate a QR code for receiving payment. Produces a payment request with
  address, Sui Payment Kit URI (sui:pay?…), nonce, and optional amount/memo.
license: MIT
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Receive Payment

## Purpose
Generate a payment request containing the agent's wallet address, a unique
nonce, and a Sui Payment Kit URI (`sui:pay?…`). The sender can scan the QR or
copy the address to send funds. No on-chain transaction is created — this is a
local, read-only operation.

## Command
```bash
t2000 receive [options]

# Examples:
t2000 receive                                          # Address only
t2000 receive --amount 25                              # Request $25 USDC
t2000 receive --amount 100 --memo "Invoice #42"        # With memo
t2000 receive --amount 50 --label "Freelance work"     # With label
t2000 receive --currency SUI --amount 10               # Request SUI
```

## Options
| Option | Description |
|--------|-------------|
| `--amount <n>` | Amount to request (omit for open amount) |
| `--currency <sym>` | Currency symbol (default: USDC) |
| `--memo <text>` | Payment note shown to sender |
| `--label <text>` | Description for the payment request |

## Output
```
✓ Payment Request

  ──────────────────────────────────────
  Address   0x8b3e...d412
  Network   Sui Mainnet
  Nonce     a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Amount    $25.00 USDC
  Memo      Invoice #42
  ──────────────────────────────────────

  Payment URI   sui:pay?receiver=0x8b3e...&amount=25000000&...

  Share this URI or scan the QR to pay via any Sui wallet.
```

## SDK Usage
```typescript
const request = agent.receive({ amount: 25, memo: 'Invoice #42' });
// Returns: { address, network, amount, currency, memo, label, nonce, qrUri, displayText }
```

## MCP Tool
Tool name: `t2000_receive` (read-only, auto-approved).

## Notes
- This is a **local operation** — no transaction is created, no gas is used
- Uses **Sui Payment Kit** — generates `sui:pay?` URIs with nonce binding
- The nonce is a UUID that uniquely identifies each payment request
- Wallets that support Payment Kit register payment in an on-chain registry, preventing double-spend
- Without `--amount`, the request is open-ended (any amount accepted)
- Default currency is USDC; specify `--currency SUI` for native SUI
