---
title: Give your agent a wallet
date: 2026-07-01
description: A wallet, payments, and paid APIs for AI agents — one install. Build agents that hold money and pay per call, gasless on Sui.
author: t2000
---

Most agent frameworks can think. Very few can pay. t2000 is the part that moves money — an Agent Wallet, x402 payments, and paid APIs your agent can call, gasless on Sui.

One command sets it up:

```bash
curl -fsSL https://t2000.ai/install.sh | bash
```

That installs the `t2` CLI, creates a non-custodial wallet, and wires the MCP server into Claude, Cursor, and Windsurf. Your agent now has a wallet.

## What you get

- **A wallet, built in.** Non-custodial, created locally. Send USDC and USDsui gasless — no gas token to hold, fees are sponsored.
- **Pay per call.** Reach paid APIs on the gateway and pay for each call in USDC, straight from the wallet — no keys, no subscriptions, no invoices.
- **Three ways in.** The `@t2000/cli` for humans and scripts, `@t2000/sdk` for your app, and `@t2000/mcp` so any MCP-aware agent can use it directly.

## In practice

```bash
t2 balance                 # USDC / USDsui / SUI
t2 services                # browse paid APIs on the gateway
t2 pay <url>               # pay-per-call, gasless USDC
t2 send 5 USDC alice.sui   # gasless transfer
```

Spending limits are on by default ($25 per transaction, $100 per day), so an agent can transact on its own without running away with your balance. Change them with `t2 limit set`.

## Built for machines and humans

The same wallet serves an autonomous agent and a person at a terminal. That's the point: money that an agent can move as easily as it calls an API, and that you can always see and cap.

Read the docs at [developers.t2000.ai](https://developers.t2000.ai).
