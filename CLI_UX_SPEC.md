# CLI UX Specification

> Design contract for every t2000 CLI command. All output must match this spec.
> Demos, docs, tests, and marketing must reflect these exact formats.

---

## Design Principles

1. **Every output tells a story** — even `balance` should make the user feel their money is working
2. **Consistency is trust** — same formatting, same ordering, same precision everywhere
3. **Dim what's context, highlight what's value** — use `dim` for labels, color for numbers
4. **Zero-noise for agents** — `--json` returns structured data, never leaks text
5. **Fail gracefully** — errors include actionable next steps

---

## Output Primitives

| Helper | Format | When to use |
|---|---|---|
| `printSuccess(msg)` | `  ✓ msg` | Action completed successfully |
| `printError(msg)` | `  ✗ msg` | Action failed |
| `printWarning(msg)` | `  ⚠ msg` | Degraded or risky state |
| `printInfo(msg)` | `  msg` (dim) | Supplementary context |
| `printKeyValue(k, v)` | `  k:  v` | Structured data display |
| `printLine(text)` | `  text` | Freeform line |
| `printHeader(title)` | `\n  **title**\n` | Major section (with blanks) |
| `printDivider()` | `  ─` ×53 | Section separator |
| `printBlank()` | blank line | Breathing room |
| `explorerUrl(hash)` | Full suiscan URL | Transaction links |

### Rules

- **Never use raw `console.log()`** in non-JSON paths. Always use output helpers.
- **Always wrap command output** in `printBlank()` at start and end.
- **Use `formatUsd()`** for all dollar amounts. Never manual `$${x.toFixed(2)}`.
- **APY precision**: always `.toFixed(2)` (e.g. `4.94%`, not `4.9%`).
- **Transaction metadata order**: action result → Tx → Gas (Tx always last or second-to-last).
- **Section headers**: use `printLine(pc.bold(title))` + `printDivider()` for subsections within a command.

---

## Command Output Specs

### `t2000 balance`

```
  Available:  $78.91  (checking — spendable)
  Savings:    $80.00  (earning 4.94% APY)       ← only when savings > $0.01
  Gas:        0.62 SUI    (~$0.58)
  ──────────────────────────────────────
  Total:      $159.49
  Earning ~$0.01/day                            ← only when daily ≥ $0.005
```

With `--show-limits`:
```
  Limits
    Max withdraw:  $80.00 USDC
    Max borrow:    $40.00 USDC
    Health factor: ∞  (no active loan)
```

### `t2000 save <amount>`

```
  ✓ Gas manager: $1.00 USDC → SUI              ← only when auto-topup fires
  ✓ Saved $80.00 USDC to best rate
  ✓ Protocol fee: $0.08 USDC (0.1%)            ← only when fee > 0
  ✓ Current APY: 4.94%
  ✓ Savings balance: $79.92 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/...
```

### `t2000 withdraw <amount>`

```
  ✓ Withdrew $50.00 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/...
```

### `t2000 send <amount> USDC to <address>`

```
  ✓ Sent $10.00 USDC → 0x8b3e...d412
  Gas:      0.0050 SUI (self-funded)
  Balance:  $90.00
  Tx:  https://suiscan.xyz/mainnet/tx/...
```

### `t2000 borrow <amount>`

```
  ✓ Borrowed $40.00 USDC
  Health Factor:  2.15
  Tx:  https://suiscan.xyz/mainnet/tx/...
```

Over-borrow warning (before action):
```
  ⚠ Max safe borrow: $40.00 (HF 2.15 → min 1.5)
```

### `t2000 repay <amount>`

```
  ✓ Repaid $40.00 USDC
  Remaining Debt:  $0.00
  Tx:  https://suiscan.xyz/mainnet/tx/...
```

### `t2000 rebalance`

```
  Rebalance Plan
  ─────────────────────────────────────────────────────
  From:  USDC on NAVI Protocol (4.94% APY)
  To:  suiUSDT on NAVI Protocol (5.47% APY)
  Amount:  $19.98

  Economics
  ─────────────────────────────────────────────────────
  APY Gain:  +0.53%
  Annual Gain:  $0.11/year
  Conversion cost:  ~$0.00
  Break-even:  6 days

  Steps
  ─────────────────────────────────────────────────────
    1. Withdraw $19.98 USDC from navi
    2. Convert USDC → suiUSDT (~$19.98)
    3. Deposit $19.98 suiUSDT into navi

  ✓ Rebalanced $19.98 → 5.47% APY
  Tx:  https://suiscan.xyz/mainnet/tx/...
  Gas:  0.0106 SUI
```

Already optimized:
```
  Already optimized — 4.94% APY on NAVI Protocol
    Best available: 5.10% (suiUSDT on NAVI)
    Difference: 0.16% (below 0.5% threshold)
```

### `t2000 positions`

```
  Savings
  ─────────────────────────────────────────────────────
  navi:     55.2500 USDC ($55.25) @ 4.18% APY  +rewards
  navi:     13.5300 suiUSDT ($13.53) @ 5.47% APY
  Total:    $68.78

  Borrows
  ─────────────────────────────────────────────────────
  navi:  100.0000 USDC ($100.00) @ 3.80% APY
```

Empty state:
```
  No positions. Use `t2000 save <amount>` to start earning.
```

### `t2000 health`

```
  ✓ Health Factor: 4.24 (healthy)
                                              ← green ✓ for HF ≥ 2.0
                                              ← yellow ⚠ for 1.0 < HF < 2.0
                                              ← red ✗ for HF ≤ 1.0

  Supplied:    $100.00 USDC
  Borrowed:     $20.00 USDC
  Max Borrow:   $40.00 USDC
```

### `t2000 rates`

```
  ⭐ Best yield: 5.47% APY — suiUSDT on NAVI

  USDC
  ─────────────────────────────────────────────────────
  NAVI:  Save 4.94%  Borrow 7.99%

  suiUSDT
  ─────────────────────────────────────────────────────
  NAVI:  Save 5.47%  Borrow 8.20%
```

### `t2000 earn`

```
  Earning Opportunities

  SAVINGS — Passive Yield
  ─────────────────────────────────────────────────────
  navi:  $500.00 USDC @ 4.94% APY
      ~$0.07/day · ~$2.06/month

  Total Saved:  $500.00

  Quick Actions
  ─────────────────────────────────────────────────────
    t2000 save <amount>            Save USDC for yield
```

### `t2000 earnings`

```
  Total Saved:  $500.00
    • $500.00 USDC on NAVI @ 4.94% APY
  Blended APY:  4.94%
  Daily Yield:  ~$0.0676/day
  Est. Earned:  ~$0.1200
```

### `t2000 fund-status`

```
  ✓ Savings: ACTIVE

  Total Saved:       $500.00
    • $500.00 USDC on NAVI @ 4.94% APY
  Blended APY:       4.94%
  Earned today:      ~$0.0676
  Earned all time:   ~$1.2000
  Monthly projected: ~$2.06/month

  Withdraw anytime: t2000 withdraw <amount>
```

### `t2000 history`

```
  Transaction History

  0x9f2c...a801  save (sponsored)      2/19/2026, 3:45 PM
  0xa1b2...c3d4  send (self-funded)    2/19/2026, 2:30 PM
  0xd5e6...f7a8  pay (self-funded)     2/18/2026, 1:15 PM
```

### `t2000 pay <url>`

```
  → GET https://api.example.com/resource
  ← 402 Payment Required (MPP): $0.01 USDC (Sui)
  ✓ Paid $0.01 USDC (tx: 8kPq3RvN...)
  ← 200 OK  [820ms]

  { "BTC": 97421.50, "ETH": 3201.80 }
```

### `t2000 init`

See the full interactive wizard output spec in the [`t2000 init` (interactive wizard)](#t2000-init-interactive-wizard) section below.

### `t2000 address`

```
  Address:  0x8b3e4f2a1c9d7b5e3f1a8c2d4e6f9b0a...
```

### `t2000 config show`

```
  Agent Safeguards
  ─────────────────────────────────────────────────────
  Locked:             No
  Per-transaction:    $500.00
  Daily send limit:   $1,000.00 ($350.00 used today)
```

JSON: `{ "locked": false, "maxPerTx": 500, "maxDailySend": 1000, "dailyUsed": 350 }`

### `t2000 config set <key> <value>`

```
  ✓ Set rpcUrl = https://custom-rpc.example.com
  ✓ Set maxPerTx = 500
```

### `t2000 config get [key]`

```
  rpcUrl:  https://custom-rpc.example.com
  network: mainnet
```

### `t2000 lock`

```
  ✓ Agent locked. All operations frozen.
  Run: t2000 unlock  (requires PIN)
```

JSON: `{ "locked": true }`

### `t2000 unlock`

```
  ✓ Agent unlocked. Operations resumed.
  Active safeguards: maxPerTx=$500, maxDailySend=$1000
```

JSON: `{ "locked": false }`

### `t2000 contacts`

```
  Contacts
  ─────────────────────────────────────────────────────
  alice    0x8b3e...d412
  bob      0xf1a2...b789
  vault    0x4c5d...e901

  3 contacts
```

Empty state:
```
  No contacts saved. Use `t2000 contacts add <name> <address>` to add one.
```

### `t2000 contacts add <name> <address>`

```
  ✓ Contact saved: alice → 0x8b3e...d412
```

### `t2000 contacts remove <name>`

```
  ✓ Contact removed: alice
```

### `t2000 mcp install`

```
  ✓ Claude Desktop  configured
  ✓ Cursor (global)  configured

  Restart your AI platform to activate.
  Then ask: "what's my t2000 balance?"
```

### `t2000 mcp install` (already configured)

```
  Claude Desktop  already configured
  Cursor (global)  already configured

  Restart your AI platform to activate.
  Then ask: "what's my t2000 balance?"
```

### `t2000 mcp uninstall`

```
  ✓ Claude Desktop  removed
  ✓ Cursor (global)  removed
```

### `t2000 mcp`

Starts stdio server (used by AI platforms, not run directly by users).

### Claim Rewards

`t2000 claim-rewards` — claims protocol incentive rewards from all lending protocols and auto-converts to USDC.

```
  ✓ Claimed and converted rewards to USDC
  ──────────────────────────────────────
  Received:  $0.12 USDC
  Source:  navi
  Tx:  https://suiscan.xyz/mainnet/tx/...
```

No rewards:
```
  No rewards to claim
```

Reward indicators appear in other commands:
- `positions`: `navi: 5.3000 USDC ($5.30) @ 4.09% APY +rewards`

---

## `t2000 init` (interactive wizard)

Guided setup wizard. Creates wallet, configures MCP for AI platforms, sets safeguards — all in one command.

```
  ┌─────────────────────────────────────────┐
  │  Welcome to t2000                       │
  │  A bank account for AI agents           │
  └─────────────────────────────────────────┘

  Step 1 of 3 — Create wallet
  Create PIN (min 4 chars): ****
  Confirm PIN: ****

  Creating agent wallet...
  ✓ Keypair generated
  ✓ Network  Sui mainnet
  ✓ Gas sponsorship  enabled

  Setting up accounts...
  ✓ Checking  ✓ Savings  ✓ Credit

  🎉 Bank account created
  Address: 0x8b3e...d412

  Step 2 of 3 — Connect AI platforms
  Which AI platforms do you use? (space to select)
  ◉ Claude Desktop
  ◉ Cursor
  ◯ Windsurf

  Adding t2000 to your AI platforms...
  ✓ Claude Desktop  configured
  ✓ Cursor  configured

  Step 3 of 3 — Set safeguards
  Max per transaction ($): 500
  Max daily sends ($): 1000
  ✓ Safeguards configured

  ┌─────────────────────────────────────────┐
  │  ✓ You're all set                       │
  │                                         │
  │  Next steps:                            │
  │    1. Restart Claude Desktop / Cursor   │
  │    2. Ask: "What's my t2000 balance?"   │
  │                                         │
  │  Deposit USDC to get started:           │
  │    0x8b3e...d412                        │
  └─────────────────────────────────────────┘
```

**Existing users:** If a wallet is detected, the wizard skips wallet creation (Step 1) and goes directly to MCP + safeguards setup (2 steps total).

---

## Error Output

All errors use `printError(msg)` → `  ✗ message`

Structured errors include actionable context:
```
  ✗ Insufficient balance — need $50.00 but only $10.00 available
  ✗ Health factor too low — repay debt before withdrawing
  ✗ Oracle validation failed during withdrawal — try again in a moment
  ✗ Blocked: amount $1,000.00 exceeds per-transaction limit ($500.00)
  ✗ Blocked: daily send limit reached ($900.00/$1,000.00 used today)
  ✗ Agent is locked. All operations frozen.
```

---

## JSON Mode Contract

- Every command supports `--json` via `isJsonMode()` / `printJson()`
- JSON mode outputs **only** valid JSON to stdout — no decorative text
- Errors in JSON mode: `{ "error": { "code": "...", "message": "..." } }`
- JSON early-return must happen before any `print*()` calls
