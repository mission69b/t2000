---
name: t2000-receive
description: >-
  Generate a payment request to receive funds into the t2000 agent wallet. Use
  when asked to receive money, create a payment link, share a wallet address, or
  generate a QR code for receiving payment. Produces a payment request with
  address, QR-ready URI, and optional amount/memo.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Receive Payment

## Purpose
Generate a payment request containing the agent's wallet address and a
QR-encodable URI. The sender can scan the QR or copy the address to send funds.
No on-chain transaction is created — this is a local, read-only operation.

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

  Address:   0x8b3e...d412
  Amount:    $25.00 USDC
  Memo:      Invoice #42
  QR URI:    sui:0x8b3e...d412?amount=25&currency=USDC&memo=Invoice%20%2342

  Share this address or scan the QR code to receive funds.
```

## SDK Usage
```typescript
const request = agent.receive({ amount: 25, memo: 'Invoice #42' });
// Returns: { address, network, amount, currency, memo, label, qrUri, displayText }
```

## MCP Tool
Tool name: `t2000_receive` (read-only, auto-approved).

## Notes
- This is a **local operation** — no transaction is created, no gas is used
- The QR URI uses the format `sui:<address>?amount=X&currency=Y&memo=Z`
- Without `--amount`, the request is open-ended (any amount accepted)
- Default currency is USDC; specify `--currency SUI` for native SUI
