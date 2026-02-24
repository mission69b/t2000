---
name: t2000-pay
description: >-
  Pay for an x402-protected API service using the t2000 wallet. Use when an
  API returns a 402 Payment Required response, when asked to "call that paid
  API", "pay for data from", "access the x402 service at", or when fetching
  a resource that requires micropayment. Handles the full x402 handshake
  automatically.
license: MIT
status: coming-soon
metadata:
  author: t2000
  version: "1.1"
  requires: t2000 CLI with x402 support (npm install -g t2000 @t2000/x402)
  available: false
---

# t2000: Pay for x402 API Service

## Status
⚠️ This skill requires the @t2000/x402 package which is not yet released.
It will be available before the March 4, 2026 hackathon deadline.

## Purpose
Make a paid HTTP request to any x402-protected endpoint. Handles the 402
handshake, signs the USDC payment from the available balance, and returns
the API response.

## Command
```bash
t2000 pay <url> [--method GET|POST] [--data '<json>'] [--max-price <amount>]

# Examples:
t2000 pay https://api.example.com/data
t2000 pay https://api.example.com/analyze --method POST --data '{"text":"hello"}'
t2000 pay https://api.example.com/premium --max-price 0.10
```

## Flow (automatic)
1. Makes initial HTTP request to the URL
2. If 402: reads PAYMENT-REQUIRED header for amount and terms
3. If price ≤ --max-price (default: $1.00): signs and broadcasts USDC payment
4. Retries with X-PAYMENT proof header
5. Returns the API response body

## Safety
- If requested price exceeds --max-price, payment is refused (no funds spent)
- Default max-price: $1.00 USDC per request
- Payment only broadcast after 402 terms are validated

## Errors
- `PRICE_EXCEEDS_LIMIT`: API asking more than --max-price
- `INSUFFICIENT_BALANCE`: not enough available USDC
- `UNSUPPORTED_NETWORK`: 402 requires a network other than Sui
