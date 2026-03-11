# Phase 18a — Contacts Build Plan

**Goal:** Let users send money by name instead of address. `t2000 send 50 to Tom` resolves "Tom" from a local contact book and sends to the stored address.

**Estimated total:** 1–1.5 days

**Version bump:** v0.12.3 → v0.13.0 (minor — new feature, no breaking changes)

---

## Design Principle

**Send by name. Resolve locally. Zero friction. No blockchain lookups.**

| Principle | Implementation |
|-----------|---------------|
| Human-readable payments | `t2000 send 50 to Tom` instead of `t2000 send 50 to 0x8b3e...` |
| Local-first | Contacts stored in `~/.t2000/contacts.json` — no network calls |
| Case-insensitive | "Tom", "tom", "TOM" all resolve the same contact |
| SDK-level resolution | Both CLI and MCP benefit from contact resolution |
| Transparent | Send output always shows both name and resolved address |

---

## What's in vs what's deferred

| Feature | v1 (this phase) | v2 (later) |
|---------|-----------------|------------|
| Contact CRUD (add/remove/list) | ✅ | — |
| Send by contact name | ✅ | — |
| MCP `t2000_contacts` tool | ✅ | — |
| MCP `t2000_send` contact resolution | ✅ | — |
| Agent Skill | ✅ | — |
| SuiNS resolution (`.sui` names) | — | ⬜ Separate network lookup |
| Payment receipts | — | ⬜ Phase 18b |
| Payment requests | — | ⬜ Phase 18b |
| Recurring payments | — | ⬜ Phase 18b |
| Contact groups / tags | — | ⬜ If needed |
| Import/export contacts | — | ⬜ If needed |
| Contact-based safeguard allowlists | — | ⬜ When safeguards v2 ships |

---

## Storage

### File: `~/.t2000/contacts.json`

```json
{
  "tom": {
    "name": "Tom",
    "address": "0x8b3e4f2a1c9d7b5e3f1a8c2d4e6f9b0a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e"
  },
  "alice": {
    "name": "Alice",
    "address": "0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62"
  },
  "treasury": {
    "name": "Treasury",
    "address": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  }
}
```

- Keys are lowercase (for case-insensitive lookup)
- `name` preserves original casing (for display)
- `address` is normalized via `normalizeSuiAddress()`
- File created on first `contacts add`
- File permissions: default (contact names + public addresses aren't secrets)

---

## SDK Implementation

### Contact Manager: `packages/sdk/src/contacts.ts`

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { validateAddress } from './utils/sui.js';
import { T2000Error } from './errors.js';

const CONTACTS_PATH = resolve(homedir(), '.t2000', 'contacts.json');

export interface Contact {
  name: string;
  address: string;
}

export type ContactMap = Record<string, Contact>;

export class ContactManager {
  private contacts: ContactMap = {};

  constructor() {
    this.load();
  }

  private load(): void {
    // Re-reads from disk on every call — prevents stale state when
    // contacts are added via CLI while MCP server is running
    // (same pattern as SafeguardEnforcer)
    try {
      if (existsSync(CONTACTS_PATH)) {
        this.contacts = JSON.parse(readFileSync(CONTACTS_PATH, 'utf-8'));
      }
    } catch {
      this.contacts = {};
    }
  }

  private save(): void {
    const dir = resolve(homedir(), '.t2000');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CONTACTS_PATH, JSON.stringify(this.contacts, null, 2));
  }

  add(name: string, address: string): { action: 'added' | 'updated' } {
    this.validateName(name);
    const normalized = validateAddress(address);
    const key = name.toLowerCase();
    const existed = key in this.contacts;
    this.contacts[key] = { name, address: normalized };
    this.save();
    return { action: existed ? 'updated' : 'added' };
  }

  remove(name: string): boolean {
    const key = name.toLowerCase();
    if (!(key in this.contacts)) return false;
    delete this.contacts[key];
    this.save();
    return true;
  }

  get(name: string): Contact | undefined {
    this.load();
    return this.contacts[name.toLowerCase()];
  }

  list(): Contact[] {
    this.load();
    return Object.values(this.contacts);
  }

  resolve(nameOrAddress: string): { address: string; contactName?: string } {
    this.load();
    // 1. Looks like a Sui address? Use directly.
    if (nameOrAddress.startsWith('0x') && nameOrAddress.length >= 42) {
      return { address: validateAddress(nameOrAddress) };
    }

    // 2. Check contacts
    const contact = this.get(nameOrAddress);
    if (contact) {
      return { address: contact.address, contactName: contact.name };
    }

    // 3. Not an address, not a contact
    throw new T2000Error(
      'CONTACT_NOT_FOUND',
      `"${nameOrAddress}" is not a valid Sui address or saved contact.\n` +
      `  Add it: t2000 contacts add ${nameOrAddress} 0x...`
    );
  }

  private static RESERVED_NAMES = new Set(['to', 'all', 'address']);

  private validateName(name: string): void {
    if (name.startsWith('0x')) {
      throw new T2000Error('INVALID_CONTACT_NAME', 'Contact names cannot start with 0x');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new T2000Error('INVALID_CONTACT_NAME', 'Contact names can only contain letters, numbers, and underscores');
    }
    if (name.length > 32) {
      throw new T2000Error('INVALID_CONTACT_NAME', 'Contact names must be 32 characters or fewer');
    }
    if (ContactManager.RESERVED_NAMES.has(name.toLowerCase())) {
      throw new T2000Error('INVALID_CONTACT_NAME', `"${name}" is a reserved name and cannot be used as a contact`);
    }
  }
}
```

### Integration with `T2000` class

Add a `contacts` property to the `T2000` class:

```typescript
// In T2000 class
public readonly contacts = new ContactManager();
```

### SDK exports

Export from `packages/sdk/src/index.ts`:

```typescript
export { ContactManager, type Contact, type ContactMap } from './contacts.js';
```

### Update `agent.send()` — resolve contacts before sending

```typescript
async send(params: { to: string; amount: number; asset?: string }): Promise<SendResult> {
  this.enforcer.assertNotLocked();

  // Resolve contact name → address
  const resolved = this.contacts.resolve(params.to);

  // ... rest of send logic uses resolved.address ...

  return {
    success: true,
    tx: gasResult.digest,
    amount: sendAmount,
    to: resolved.address,
    contactName: resolved.contactName,  // NEW — undefined if raw address
    // ...
  };
}
```

### Update `SendResult` type

```typescript
export interface SendResult {
  success: boolean;
  tx: string;
  amount: number;
  to: string;
  contactName?: string;  // NEW
  // ... existing fields
}
```

---

## CLI Implementation

### New command: `t2000 contacts`

**File:** `packages/cli/src/commands/contacts.ts`

**No PIN required.** Contacts are local file I/O — no wallet access needed. Unlike `balance`, `send`, etc., this command should NOT prompt for PIN.

```bash
# List all contacts
t2000 contacts
#   Contacts
#   ─────────────────────────────────────────────────────
#   Tom           0x8b3e...f4a2
#   Alice         0x40cd...3e62
#   Treasury      0x1234...cdef

# Add a contact
t2000 contacts add Tom 0x8b3e4f2a1c9d7b5e3f1a8c2d4e6f9b0a...
#   ✓ Added Tom (0x8b3e...f4a2)

# Update existing contact
t2000 contacts add Tom 0xNEWADDRESS...
#   ✓ Updated Tom (0xNEWA...RESS)

# Remove a contact
t2000 contacts remove Tom
#   ✓ Removed Tom

# Remove non-existent contact
t2000 contacts remove Bob
#   ✗ Contact "Bob" not found

# JSON mode (all subcommands)
t2000 contacts --json
#   [{ "name": "Tom", "address": "0x8b3e..." }, ...]

t2000 contacts add Tom 0x8b3e... --json
#   { "action": "added", "name": "Tom", "address": "0x8b3e..." }

t2000 contacts remove Tom --json
#   { "removed": true, "name": "Tom" }
```

### Update `send` command output

When sending to a contact, show both name and address:

```bash
t2000 send 50 USDC to Tom
#   ✓ Sent $50.00 USDC → Tom (0x8b3e...f4a2)
#   Gas:  -0.0007 SUI (self-funded)
#   Balance:  $46.81 USDC
#   Tx:  https://suiscan.xyz/mainnet/tx/...
```

When sending to a raw address (no contact), unchanged:

```bash
t2000 send 50 USDC to 0x8b3e...
#   ✓ Sent $50.00 USDC → 0x8b3e...f4a2
```

---

## MCP Implementation

### New tool: `t2000_contacts` (read-only)

```typescript
server.tool(
  't2000_contacts',
  'List saved contacts (name → address mappings). Use contact names with t2000_send instead of raw addresses.',
  {},
  async () => {
    try {
      const contacts = agent.contacts.list();
      return { content: [{ type: 'text', text: JSON.stringify({ contacts }) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);
```

**Output:**
```json
{
  "contacts": [
    { "name": "Tom", "address": "0x8b3e..." },
    { "name": "Alice", "address": "0x40cd..." }
  ]
}
```

### Update `t2000_send` tool

**Description update:**
```
"Send USDC or stablecoins to a Sui address or contact name. Amount is in dollars. Subject to per-transaction and daily send limits. Set dryRun: true to preview without signing."
```

**`to` param description update:**
```
"Recipient Sui address (0x...) or contact name (e.g. 'Tom')"
```

**dryRun preview update** — include `contactName` if resolved from contacts:
```json
{
  "preview": true,
  "canSend": true,
  "amount": 50,
  "to": "0x8b3e4f2a1c9d7b5e...",
  "contactName": "Tom",
  "asset": "USDC",
  "currentBalance": 96.81,
  "balanceAfter": 46.81,
  "safeguards": { "dailyUsedAfter": 50, "dailyLimit": 1000 }
}
```

The MCP `t2000_send` handler needs updating — resolve contacts at the top, before the dryRun branch:

```typescript
async ({ to, amount, asset, dryRun }) => {
  try {
    // Resolve contact name → address at the top (before dryRun branch)
    const resolved = agent.contacts.resolve(to);
    const resolvedAddress = resolved.address;
    const contactName = resolved.contactName;

    if (dryRun) {
      agent.enforcer.check({ operation: 'send', amount });
      const balance = await agent.balance();
      const config = agent.enforcer.getConfig();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            preview: true,
            canSend: balance.available >= amount,
            amount,
            to: resolvedAddress,
            contactName,  // included if resolved from contacts
            asset: asset ?? 'USDC',
            currentBalance: balance.available,
            balanceAfter: balance.available - amount,
            safeguards: {
              dailyUsedAfter: config.dailyUsed + amount,
              dailyLimit: config.maxDailySend,
            },
          }),
        }],
      };
    }

    // agent.send() also resolves contacts internally, but we already
    // resolved above — pass the address directly
    const result = await mutex.run(() => agent.send({ to, amount, asset }));
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    return errorResult(err);
  }
}
```

**Key:** Contact resolution happens once at the top of the handler. Both the dryRun preview and the execute path use the resolved address. The old `validateAddress(to)` check at the top is removed — `contacts.resolve()` handles both address validation and name resolution.

---

## Edge Cases

| # | Edge Case | Handling |
|---|-----------|----------|
| 1 | **Case sensitivity** | Lookup is case-insensitive: "Tom", "tom", "TOM" all resolve |
| 2 | **Duplicate name** | `contacts add` upserts — overwrites address, prints "Updated" |
| 3 | **Invalid address on add** | `validateAddress()` rejects before storing |
| 4 | **Name starts with `0x`** | Rejected: "Contact names cannot start with 0x" |
| 5 | **Name with spaces** | Rejected: alphanumeric + underscore only |
| 6 | **Name with special chars** | Rejected: alphanumeric + underscore only |
| 7 | **Name > 32 chars** | Rejected: "must be 32 characters or fewer" |
| 8 | **Empty contacts file** | Created on first `add`. `list` shows "No contacts yet." |
| 9 | **Corrupted JSON file** | `load()` catches parse error, treats as empty |
| 10 | **Missing file on send** | Resolution falls through to address validation |
| 11 | **Send to non-existent contact** | Throws `CONTACT_NOT_FOUND` with `t2000 contacts add` hint |
| 12 | **MCP dryRun with contact name** | Resolves before preview, returns `contactName` in response |
| 13 | **Remove non-existent contact** | Returns false, CLI shows "Contact not found" |
| 14 | **File permissions** | Default — contact names + public addresses aren't secrets |
| 15 | **Self-send via contact** | Not blocked — same as current address behavior |
| 16 | **Contact address matches own address** | Allowed but unusual — no guard needed |
| 17 | **Empty name** | Rejected by alphanumeric regex |
| 18 | **Reserved names (`to`, `all`, `address`)** | Rejected: "is a reserved name" — prevents CLI parsing conflicts |
| 19 | **MCP server caching** | `load()` called on every `resolve()`, `list()`, `get()` — same fix as SafeguardEnforcer |
| 20 | **No PIN needed** | `t2000 contacts` is file I/O only — no wallet access, no PIN prompt |
| 21 | **JSON mode for add/remove** | `--json` returns structured output for all subcommands |
| 22 | **MCP contacts tool is read-only** | AI can list + resolve contacts but cannot add/remove — human manages contacts via CLI |

---

## Agent Skill

### `t2000-skills/skills/t2000-contacts/SKILL.md`

Teaches agents:
- `t2000 contacts` — list contacts
- `t2000 contacts add <name> <address>` — add contact
- `t2000 contacts remove <name>` — remove contact
- `t2000 send <amount> <asset> to <name>` — send by contact name

### Update `t2000-send` skill

Add a note: "The `to` field can be a contact name (e.g. 'Tom') or a Sui address (0x...). Use `t2000 contacts` to list saved contacts."

---

## Tasks

### SDK (18a.1–18a.3)

| # | Task | Est | Status |
|---|------|-----|--------|
| 18a.1 | Implement `ContactManager` class (CRUD, resolve, validate) | 1h | ⬜ |
| 18a.2 | Add `contacts` property to `T2000` class | 15m | ⬜ |
| 18a.3 | Update `agent.send()` to resolve contacts, add `contactName` to `SendResult` | 30m | ⬜ |

### CLI (18a.4–18a.5)

| # | Task | Est | Status |
|---|------|-----|--------|
| 18a.4 | Implement `t2000 contacts` command (add/remove/list, JSON mode) | 1.5h | ⬜ |
| 18a.5 | Update `send` command output to show contact name when resolved | 15m | ⬜ |

### MCP (18a.6–18a.7)

| # | Task | Est | Status |
|---|------|-----|--------|
| 18a.6 | New `t2000_contacts` read-only tool | 30m | ⬜ |
| 18a.7 | Update `t2000_send` — description, `to` param, dryRun preview, remove manual validation | 30m | ⬜ |

### Tests (18a.8–18a.11)

| # | Task | Est | Status |
|---|------|-----|--------|
| 18a.8 | Unit tests: `ContactManager` — add, remove, list, get, resolve, case insensitivity, validation errors | 1h | ⬜ |
| 18a.9 | Unit tests: send with contact resolution — name, address, not found | 30m | ⬜ |
| 18a.10 | Unit tests: MCP `t2000_contacts` tool | 20m | ⬜ |
| 18a.11 | Unit tests: MCP `t2000_send` with contact name + dryRun | 20m | ⬜ |

### Agent Skill (18a.12)

| # | Task | Est | Status |
|---|------|-----|--------|
| 18a.12 | Create `t2000-contacts` SKILL.md + update `t2000-send` skill | 30m | ⬜ |

### Docs + Marketing + Release (18a.13–18a.15)

| # | Task | Est | Status |
|---|------|-----|--------|
| 18a.13 | All docs: docs page (section + CLI table), homepage (comparison table + tool count), CLI_UX_SPEC, PRODUCT_FACTS, all READMEs | 1.5h | ⬜ |
| 18a.14 | Marketing: launch tweet + roadmap update | 15m | ⬜ |
| 18a.15 | Version bump (→ 0.13.0), build all packages, publish | 15m | ⬜ |

**Total: 15 tasks · ~7 hours**

---

## Execution Order

### Block 1: Core (18a.1–18a.3)
1. `ContactManager` class
2. Wire into `T2000` class
3. Update `agent.send()` with resolution

### Block 2: CLI (18a.4–18a.5)
4. `t2000 contacts` command
5. Update send output

### Block 3: MCP (18a.6–18a.7)
6. `t2000_contacts` tool
7. Update `t2000_send` tool

### Block 4: Tests (18a.8–18a.11)
8. ContactManager tests
9. Send resolution tests
10. MCP tool tests

### Block 5: Skill + Docs + Ship (18a.12–18a.15)
11. Agent skill
12. All docs + READMEs + homepage + marketing
13. Version bump, build, publish

---

## Testing Strategy

| Test file | What it covers | Est count |
|-----------|---------------|-----------|
| `contacts.test.ts` | Add, remove, list, get, resolve, case insensitivity, name validation (0x prefix, special chars, length, reserved names), corrupted file, missing file, reload from disk | ~15 |
| `send.test.ts` (update) | Send with contact name, send with address, send with unknown name | ~3 |
| `tools/read.test.ts` (update) | `t2000_contacts` tool returns contact list | ~2 |
| `tools/write.test.ts` (update) | `t2000_send` with contact name, dryRun with contact | ~3 |

**Estimated: ~23 new tests**

---

## What v2 adds (when needed)

| Feature | Trigger to add |
|---------|---------------|
| SuiNS resolution (`.sui` names) | When SuiNS adoption grows, user demand |
| Payment receipts | User feedback — "I need proof of payment" |
| Payment requests | User feedback — "I need to request money" |
| Recurring payments | User feedback — "I pay rent monthly" |
| Contact groups / tags | When contact lists get large |
| Import/export contacts (CSV/JSON) | Multi-device or migration use case |
| Contact-based safeguard allowlists | When safeguards v2 ships |
| Contact sync across profiles | When multi-agent profiles (Phase 14) ships |

---

*t2000 — The first bank account for AI agents.*
*Phase 18a — Contacts Build Plan*
