---
name: t2000-contacts
description: >-
  Manage contacts — save a name-to-address mapping so the user can send money by
  name instead of pasting raw Sui addresses. Use when asked to add, remove, or
  list contacts, or to look up a saved address.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init)
---

# t2000: Contacts

## Purpose
Let users send money by name instead of raw addresses. Contacts are stored
locally in `~/.t2000/contacts.json` — no blockchain lookups, no network calls.

## Commands

```bash
# List all contacts
t2000 contacts

# Add or update a contact
t2000 contacts add <name> <address>

# Remove a contact
t2000 contacts remove <name>
```

## Examples

```bash
t2000 contacts add Tom 0x8b3e4f2a...
#   ✓ Added Tom (0x8b3e...f4a2)

t2000 contacts add Tom 0xNEWADDRESS...
#   ✓ Updated Tom (0xNEWA...RESS)

t2000 contacts remove Tom
#   ✓ Removed Tom

t2000 contacts
#   Contacts
#   ─────────────────────────────────────────────────────
#   Tom           0x8b3e...f4a2
#   Alice         0x40cd...3e62
```

## Sending by name

Once a contact is saved, use the name directly in `t2000 send`:

```bash
t2000 send 50 USDC to Tom
#   ✓ Sent $50.00 USDC → Tom (0x8b3e...f4a2)
```

## Name rules
- Letters, numbers, underscores only
- Case-insensitive (Tom = tom = TOM)
- Max 32 characters
- Reserved names: `to`, `all`, `address`
- Cannot start with `0x`

## No PIN required
Contact commands are local file operations — no wallet access, no PIN prompt.

## JSON mode
All subcommands support `--json` for structured output:

```bash
t2000 contacts --json
t2000 contacts add Tom 0x... --json
t2000 contacts remove Tom --json
```

## Error handling
- `INVALID_CONTACT_NAME`: name violates naming rules
- `CONTACT_NOT_FOUND`: name not in contacts when sending
- `INVALID_ADDRESS`: address provided to `add` is not a valid Sui address
