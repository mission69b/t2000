---
name: t2000-send
description: >-
  Send USDC, USDsui, or SUI from the t2000 Agent Wallet to another Sui
  address. Use when asked to pay someone, transfer funds, send money, tip
  a creator, or make a payment to a specific Sui address, SuiNS name, or
  saved contact. Do NOT use for API payments — use the t2000-pay skill
  for x402-protected services.
license: MIT
metadata:
  author: t2000
  version: "2.0"
  requires: t2000 CLI (npm install -g @t2000/cli)
---

# t2000: Send USDC / USDsui / SUI

## Purpose

Transfer USDC, USDsui, or SUI from the agent's available balance to any Sui address. **USDC + USDsui are gasless** — they go through Sui's protocol-level `0x2::balance::send_funds` path (Sui foundation sponsored). **SUI is not gasless** — the wallet must hold some SUI to cover the gas fee (typically < $0.0002).

## Rules

1. **Asset is REQUIRED.** v4 has no implicit USDC default. `t2 send 5 alice.sui` exits with a clear error pointing at the missing `<asset>` arg. Always pass one of `USDC | USDsui | SUI`.
2. **Only USDC / USDsui / SUI are accepted.** Other tokens (e.g. USDY, USDT, USDe) are rejected with `unsupported asset`. To send a different asset, the user first swaps it via `t2 swap` (or audric.ai) into USDC, USDsui, or SUI.
3. **Validate the recipient first.** Names → SuiNS resolves (`alice.sui`). Raw addresses → `isValidSuiAddress()`. The SDK throws clear errors (`CONTACT_NOT_FOUND`, `INVALID_ADDRESS`, `SUINS_NOT_REGISTERED`); don't guess.
4. **SuiNS over local contacts.** `alice.sui` is preferred over a local contact named `alice` — SuiNS is the global standard. The local contact subsystem is deprecated and will sunset.
5. **Sends are single-write.** Each transfer is its own intent. If you need send + something else, sequence them across turns.
6. **Amount precision matters.** Floor to the asset's decimals (USDC + USDsui: 6, SUI: 9). Never round up — `Math.round` can produce a number larger than the on-chain balance and the transfer will fail simulation.
7. **Multi-recipient = multiple sends.** A "send to A, B, C" request emits N sequential `t2 send` invocations (CLI) or N `t2000_send` tool calls (MCP). Each is atomic.
8. **Limits apply to CLI writes.** If the user set `t2 limit set --per-tx 50` and the request exceeds the cap, the CLI throws `LIMIT_EXCEEDED`. The user can override one time with `--force`. MCP writes do NOT currently gate on limits (Phase D consolidation).

## Command

```bash
t2 send <amount> <asset> <recipient>
t2 send <amount> <asset> to <recipient>      # `to` filler optional

# Examples:
t2 send 5 USDC 0x8b3e...d412                  # 5 USDC to a hex address (gasless)
t2 send 5 USDsui alice.sui                    # 5 USDsui to a SuiNS name (gasless)
t2 send 50 USDC to mission69b@audric          # @audric handle (gasless)
t2 send 0.1 SUI 0x8b3e...d412                 # 0.1 SUI to a hex address (gas required)
```

Use `--force` to bypass an opt-in limit one time. Use `--key <path>` to point at a non-default wallet file.

## Output (default)

```
✓ Sent $5.00 USDC → alex.sui (0x8b3e...d412)
  Gas:  gasless ⚡
  Tx:   https://suiscan.xyz/mainnet/tx/0xdigest...
```

For non-gasless sends (SUI), the gas line shows the actual SUI burn:

```
✓ Sent 0.1000 SUI → 0x8b3e...d412
  Gas:  0.000123 SUI
  Tx:   https://suiscan.xyz/mainnet/tx/0xdigest...
```

## Output (--json)

```json
{
  "tx": "0xdigest...",
  "amount": 5,
  "to": "0x8b3e...d412",
  "suinsName": "alex.sui",
  "gasCost": 0,
  "gasCostUnit": "SUI",
  "asset": "USDC",
  "gasless": true
}
```

## Pre-flight checks (automatic)

1. Sufficient asset balance (USDC / USDsui / SUI as requested).
2. For SUI sends only: sufficient SUI for gas.
3. For USDC + USDsui: zero SUI is acceptable — the Sui foundation sponsors the gas.
4. Limit check (CLI only): per-tx cap (any asset) + daily-send cap (any asset). Override with `--force`.

## Error handling

| Error code | Meaning |
|---|---|
| `INSUFFICIENT_BALANCE` | Wallet balance for the chosen asset is less than the requested amount. |
| `INSUFFICIENT_GAS` | SUI sends only — wallet has the asset but not enough SUI for gas. Suggest a swap. |
| `INVALID_ADDRESS` | Recipient is not a valid Sui hex address. |
| `INVALID_ASSET` | Asset is missing or not in the allowlist (USDC / USDsui / SUI). |
| `SUINS_NOT_REGISTERED` | The `.sui` name isn't registered. |
| `CONTACT_NOT_FOUND` | The name isn't a SuiNS name, an @audric handle, or a saved local contact. |
| `LIMIT_EXCEEDED` | CLI hit a `t2 limit set` cap. Use `--force` to override. |
| `SIMULATION_FAILED` | Transaction would fail on-chain (details in the error message). |

## Recipient resolution flow

The SDK (`T2000.resolveRecipient`) handles resolution in this priority order:

1. **Hex address** (starts with `0x`) → validated via `isValidSuiAddress()`. If invalid → `INVALID_ADDRESS`.
2. **SuiNS name** (`*.sui`) → resolves via SuiNS registry. If unregistered → `SUINS_NOT_REGISTERED`.
3. **@audric handle** (`name@audric`) → resolves via the audric.ai handle registry.
4. **Local contact name** → resolves via `~/.t2000/contacts.json` (deprecated; will sunset).

If the user's input doesn't match any path, the SDK throws `CONTACT_NOT_FOUND` with a suggestion to use a hex address or register a SuiNS name.

## After a successful send to an unknown raw address

Offer (but don't auto-save):

> "Want to save 0x8b3e…d412 as a contact? You can run `t2 contacts add <name> 0x8b3e…d412` to keep it. (SuiNS at https://suins.io is the recommended path — globally resolvable.)"

The local contact subsystem is deprecated and will sunset. SuiNS is the canonical name layer for Sui addresses.

## When called through MCP (`t2000_send` tool)

The MCP `t2000_send` tool has the same asset-required contract:

```json
{
  "to": "alice.sui",
  "amount": 5,
  "asset": "USDC",
  "dryRun": false
}
```

- `dryRun: true` returns a preview without signing — useful for confirming the resolved address + gasless badge before the actual write.
- `asset` is REQUIRED — calls without it return an error.
- MCP writes do NOT honor `t2 limit set` caps in v4 Phase B. Use the CLI for limit-gated workflows.
