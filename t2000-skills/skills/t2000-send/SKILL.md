---
name: t2000-send
description: >-
  Send USDC from the t2000 agent wallet to another address on Sui. Use when
  asked to pay someone, transfer funds, send money, tip a creator, or make a
  payment to a specific Sui address or saved contact. Do NOT use for API
  payments — use t2000-pay for MPP-protected services.
license: MIT
metadata:
  author: t2000
  version: "1.4"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Send USDC

## Purpose
Transfer USDC from the agent's available balance to any Sui address. Gas is
self-funded from the agent's SUI reserve (auto-topped up if needed).

## Rules

1. **Validate the recipient first.** Names → contacts lookup; `0x...` → `isValidSuiAddress()`. Refuse with `INVALID_ADDRESS` on a malformed address; don't guess.
2. **Resolve SuiNS over contacts when both exist.** `alex.sui` is preferred over a local contact named `alex` — SuiNS is the global standard. The contacts subsystem is deprecated and will sunset.
3. **Sends are single-write.** Never bundle with another write in a Payment Intent. Each transfer is its own intent. If you need send + something else, sequence them across turns.
4. **Don't auto-save raw addresses.** After a send to an unknown address, OFFER to save as contact but require the user to provide a name. Cluttered contacts hurt UX.
5. **Amount precision matters.** Floor to USDC's 6 decimals (or 2 for display). Never round up — `Math.round` can produce a number larger than the on-chain balance and the transfer will fail simulation.
6. **Multi-recipient = multiple sends.** A "send to A, B, C" request emits N parallel `send_transfer` tool calls; the engine compiles them into atomic bundles of up to 4 per Payment Intent (host splits across multiple intents if N > 4).

## Command
```bash
t2000 send <amount> <asset> to <address_or_contact>
t2000 send <amount> <asset> <address_or_contact>

# Examples:
t2000 send 10 USDC to 0x8b3e...d412
t2000 send 50 USDC to Tom
t2000 send 50 USDC 0xabcd...1234
```

The `to` keyword is optional. The recipient can be a Sui address (0x...) or a
saved contact name (e.g. "Tom"). Use `t2000 contacts` to list saved contacts.

## Pre-flight checks (automatic)
1. Sufficient available USDC balance
2. SUI gas reserve present; if not, auto-topup triggers transparently

## Output
```
✓ Sent $XX.XX USDC → 0x8b3e...d412
  Gas: X.XXXX SUI (self-funded)
  Balance: $XX.XX USDC
  Tx: https://suiscan.xyz/mainnet/tx/0x...
```

## Error handling
- `INSUFFICIENT_BALANCE`: available balance is less than the requested amount
- `INVALID_ADDRESS`: destination is not a valid Sui address
- `CONTACT_NOT_FOUND`: name is not a saved contact or valid address
- `SIMULATION_FAILED`: transaction would fail on-chain; details in error message

## Recipient resolution flow

When the user provides a recipient, resolve it before broadcasting:

1. **Name given** → look up in saved contacts. If found, use the mapped
   address. If not found and not a valid `0x...` address, ask the user
   to clarify (suggest `t2000 contacts add <name> <address>` first).
2. **Address given (`0x...`)** → validate with `isValidSuiAddress()`. If
   invalid, refuse with `INVALID_ADDRESS`.
3. **Ambiguous** (looks like a name AND a valid prefix) → ask the user
   which they meant.

After a successful send to a **previously-unknown raw address** (not a
saved contact), offer to save it:

> "Want to save 0x8b3e…d412 as a contact? Say `yes <name>` to save."

If the user provides a name, call `t2000 contacts add <name> <address>`
(CLI). This makes future sends to the same person work by name
(`t2000 send 10 USDC to <name>`). The engine no longer ships a
`save_contact` tool — contacts are CLI-only state today; audric users
manage contacts via the send screen.

**Do not auto-save** without asking — the user might not want every
one-off recipient cluttering their contacts list.

## Engine orchestration (audric/web)

When called inside the Audric chat agent:

1. Resolve recipient (contacts lookup or address validation) — no tool call needed for contacts; resolution happens in prose.
2. Call `balance_check` to confirm sufficient funds.
3. Emit `send_transfer({ to, amount, asset })` as the write tool_use.
4. After the send settles, if the recipient was a raw address not already
   in contacts, surface the "save as contact?" prompt to the user (see
   above). The user confirms in the next turn; the host (CLI / audric)
   handles persistence — the engine has no contact-write tool.

Sends are **single-write** — never bundle with another write in a
Payment Intent. Each transfer is its own intent.
