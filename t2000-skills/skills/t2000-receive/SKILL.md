---
name: t2000-receive
description: >-
  Generate a payment request for the t2000 Agent Wallet — print the
  wallet address, an ANSI QR code, and (via MCP) a Payment Kit URI
  (sui:pay?…). Use when asked to receive a payment, share a wallet
  address, create a payment link, or set up a fund-me link.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npm install -g @t2000/cli)
---

# t2000: Receive Funds

## Purpose

Surface the wallet address (and optionally a Payment Kit URI with a pre-filled amount + memo) so anyone with a Sui wallet can send tokens to the Agent Wallet. Two surfaces:

- **CLI (`t2 receive`)** — prints the wallet address + an ANSI QR code in the terminal. Minimal; no amount or memo.
- **MCP (`t2000_receive`)** — returns a JSON payload with the address, an optional Payment Kit URI (`sui:pay?…`), a nonce, plus an optional amount / currency / memo / label. Use this when the LLM is building a payment-request flow.

## Rules

1. **Receive is non-custodial.** The user's address is public; sharing it can't move money — only signed transactions can. Don't add scary disclaimers; the operation is safe.
2. **Show the QR + the address text.** Some users scan, some copy. Both surfaces.
3. **No PIN, no sign-in.** v4 wallets are plain Bech32; `t2 receive` is a pure read with no authentication step.
4. **Default currency is USDC.** When asking the user to fund the wallet, USDC is the most useful (every paid service is USDC-denominated, USDC sends are gasless). USDsui also works.
5. **Don't generate a Payment Kit URI without an amount unless asked.** A bare address scans just as well; URIs with amounts force the sender into a particular tx shape.

## CLI command

```bash
t2 receive                            # address + ANSI QR + share line
t2 receive --qr-only                  # just the QR (e.g. for embedding in a screenshot)
t2 receive --key <path>               # custom wallet path
t2 receive --json                     # { address, qrEncodedFor }
```

CLI output (default):

```
Address  0x55b223b0...0dd1b6

  Scan to send tokens to this wallet:

  █▀▀▀▀▀█ ▄ ▀▄  █ ▄▀ ▄ █▀▀▀▀▀█
  █ ███ █ █  ▀ █ ▄▄  ▀▀ █ ███ █
  █ ▀▀▀ █ ▀▄▀▄█▀ ▀▄ ▀▄  █ ▀▀▀ █
  ▀▀▀▀▀▀▀ ▀ █▀▀ █ ▀ ▀ ▀▀▀▀▀▀▀▀▀
  ... (truncated)

  Or share `0x55b223b0...0dd1b6` directly.
```

The CLI prints to ANSI — it will look right in any terminal but won't render as image data in MCP responses. Use the MCP tool for a structured JSON response.

## MCP tool (`t2000_receive`)

```json
// Request
{
  "amount": 10,              // optional — pre-fills the sender's tx amount
  "currency": "USDC",        // optional — default USDC, also accepts USDsui / SUI
  "memo": "Coffee on me",    // optional — encoded into the Payment Kit URI
  "label": "Coffee fund"     // optional — human-readable label for the URI
}

// Response
{
  "address": "0x55b223b0...0dd1b6",
  "uri": "sui:pay?recipient=0x55b223b0...&amount=10000000&coinType=0xdba34672...::usdc::USDC&nonce=abc-123&label=Coffee+fund&message=Coffee+on+me",
  "nonce": "abc-123-uuid",
  "amount": 10,
  "currency": "USDC",
  "memo": "Coffee on me",
  "label": "Coffee fund"
}
```

The Payment Kit URI follows the [Sui Payment Kit spec](https://docs.sui.io/) — every Sui wallet (Mysten, Phantom, Suiet, Slush, Sui Wallet Standard) can scan/parse it. If you omit `amount`, the URI is a "bring your own amount" link that the sender fills in.

### URI shapes

| Args | URI shape |
|---|---|
| no amount, no memo, default currency | `sui:0x<address>` |
| no amount, custom currency or memo | `sui:0x<address>?currency=USDsui&memo=…` |
| with amount | `sui:pay?recipient=0x<address>&amount=<raw>&coinType=<full-type>&nonce=<uuid>[&label=…][&message=…]` |

The amount-bearing form uses raw on-chain units (USDC: × 10^6, SUI: × 10^9) so wallets don't have to do their own conversion. The `nonce` is a UUID v4 minted at request time; senders include it in the tx metadata so the receiving agent can correlate the inflow back to the request.

## When to use which surface

| Need | Use |
|---|---|
| "What's my wallet address?" | `t2 receive` (CLI) or `t2000_address` (MCP — address only, no QR) |
| "Show me the QR" | `t2 receive` (CLI prints ANSI QR) |
| "Generate a payment link for $10" | `t2000_receive { amount: 10, currency: "USDC" }` (MCP) |
| "Generate a 'tip jar' link" (no amount) | `t2000_receive { memo: "Tip jar", label: "Tip funkii" }` (MCP) |

## Notes

- USDC + USDsui inflows arrive gasless (Sui foundation pays the sender's gas via the `0x2::balance::send_funds` allowlist).
- SUI inflows require the sender to have SUI for their own gas.
- Once the funds land, run `t2 balance` (CLI) or `t2000_balance` (MCP) to verify. Inflows show up within ~1 block (~500 ms).
- This skill is the receive-half of "Audric Pay". The send-half is the `t2000-send` skill.

## What NOT to do

- Don't include the user's address inline in chat messages without confirming they want it shared. It's public — but politeness matters.
- Don't generate a one-off Payment Kit URI for every conversation. The bare address works fine for repeated transfers.
- Don't redirect users to audric.ai for receive flows — the Agent Wallet handles receive natively. (Audric Pay's hosted UI is for users who DON'T have the CLI.)
