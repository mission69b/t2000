---
name: t2000-pay
description: >-
  Pay any x402-protected API endpoint with the t2000 wallet — an ASP Service
  listed on the t2000 store, or any URL that answers 402 with a Sui challenge.
  Use when the user hands you a paid endpoint URL, or after t2000_services
  surfaces a per-call Service. Handles the full 402 challenge automatically.
license: MIT
status: active
metadata:
  author: t2000
  version: "4.0"
  requires: t2000 CLI (npm install -g @t2000/cli)
  available: "true"
---

# t2000: Pay for x402 API Service

## Status
Active — bundled with `@t2000/cli` (no separate install).

**USDC payment is gasless.** The 402 challenge response is a `0x2::balance::send_funds` Move call, which is in Sui's foundation-sponsored allowlist. The wallet can pay even with 0 SUI in the gas reserve.

## Purpose
Make a paid HTTP request to any x402-protected endpoint. Handles the 402
challenge, pays via Sui USDC, and returns the API response.

## What this pays

Any endpoint that answers **402 with a Sui x402 challenge**:

- an **ASP Service** listed on the t2000 store (find one with `t2 services` /
  `t2000_services`) — the seller runs the endpoint on their own origin and the
  payment settles straight to their wallet; or
- **any URL the user gives you**, listed or not.

There is no t2000-hosted catalog of third-party provider URLs. t2000 resells
nothing, so **never guess a provider URL** — if the user hasn't given you one
and nothing is listed, say so and offer to post the work as an Open job
(`t2 job open`) for an ASP to claim.

```bash
t2 services "image"       # what's actually listed
t2 pay <url> --estimate   # price a specific endpoint without paying
```

## Command
```bash
t2 pay <url> [options]
```

## Options
| Option | Description | Default |
|--------|-------------|---------|
| `--method <method>` | HTTP method (GET, POST, PUT) | GET (auto-promotes to POST when `--data` is set) |
| `--data <json>` | Request body for POST/PUT (JSON bodies default `content-type: application/json`) | — |
| `--max-price <amount>` | Max USDC to auto-approve (enforced before any payment) | $1.00 |
| `--header <key=value>` | Additional HTTP header (repeatable) | — |
| `--estimate` | Show the price without paying (no funds spent) | — |
| `--force` | Override spending limits for this call (see `t2 limit`) | — |

## Price discovery

The seller's own 402 challenge is the source of truth for price. Never assume
one: `t2 pay <url> --estimate` returns what would be charged without paying,
and `--max-price` refuses anything above your ceiling before funds move.

## Example

```bash
# An ASP's per-call Service (the URL comes from `t2 services`, or the user)
t2 pay https://api.example-asp.com/v1/brief \
  --data '{"ticker":"SUI","window":"7d"}' \
  --max-price 0.25
```

## Flow (automatic)
1. Makes initial HTTP request to the URL
2. If 402: reads x402 challenge for amount and terms
3. If price <= --max-price: pays via Sui USDC
4. Retries with credential header
5. Returns the API response body

## Safety
- If requested price exceeds --max-price, payment is refused (no funds spent)
- Default max-price: $1.00 USDC per request
- For commerce (mail, merch), set --max-price higher
- Payment only broadcast after 402 terms are validated

## Errors
- `PRICE_EXCEEDS_LIMIT`: API asking more than --max-price
- `INSUFFICIENT_BALANCE`: not enough available USDC
- `UNSUPPORTED_NETWORK`: x402 requires a network other than Sui
- `PAYMENT_EXPIRED`: payment challenge has expired
- `DUPLICATE_PAYMENT`: nonce already used on-chain

## MCP
Via MCP: `t2000_services` to see what is listed, then `t2000_pay` against the
seller's endpoint URL.

**History:** this skill used to list dozens of `mpp.t2000.ai/<provider>/…`
example URLs against a t2000-hosted proxy catalog. That mall was purged
2026-08-01 (SPEC_T2_CLEANUP_USDC_ONLY) — those URLs are dead, and t2000 does
not resell third-party APIs.
