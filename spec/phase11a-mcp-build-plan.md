# Phase 11a — MCP Server Build Plan

**Goal:** Ship a stdio MCP server that wraps `@t2000/sdk` so any MCP client (Claude Desktop, Cursor, Claude Code, Windsurf, Codex) can operate an agent's bank accounts.

**Estimated total:** 2–3 days

**Version bump:** v0.11.0 → v0.12.0 (minor — new package, no breaking changes)

---

## Design Principle

**16 tools. 5 prompts. Structured JSON. Check before signing. Human keeps the kill switch.**

| Principle | Implementation |
|-----------|---------------|
| Simple tool set | 16 tools + 5 prompts covering full banking experience |
| Stateless previews | `dryRun: true` returns preview without signing — no pending state |
| Safeguard enforced | State-changing tools pass through `enforcer.check()` before signing |
| Human keeps control | `unlock` is CLI-only — AI cannot circumvent a locked agent |
| Local-first | stdio transport, key never leaves the machine |

---

## What's in vs what's deferred

| Feature | v1 (this phase) | v2 (later, if needed) |
|---------|-----------------|----------------------|
| stdio transport | ✅ | — |
| 16 MCP tools | ✅ | — |
| `dryRun` previews | ✅ | — |
| Safeguard enforcement | ✅ | — |
| Tool annotations (readOnly, destructive) | — | ⬜ Add when MCP SDK API stabilizes |
| `t2000 mcp` CLI command | ✅ | — |
| Platform configs (Claude Desktop, Cursor) | ✅ | — |
| SSE / Streamable HTTP transport | — | ⬜ Adds auth complexity |
| x402 `pay` tool | — | ⬜ Complex schema, separate package |
| Sentinel tools | — | ⬜ Separate product |
| MCP resources | — | ⬜ Evaluate after v1 |
| MCP prompts (5 templates) | ✅ | — |

---

## Package Setup

### New package: `packages/mcp/`

```
packages/mcp/
├── package.json          # @t2000/mcp
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # Exports startMcpServer() for CLI import
│   ├── bin.ts            # #!/usr/bin/env node — standalone entry (calls startMcpServer)
│   ├── tools/
│   │   ├── read.ts       # 7 read-only tools
│   │   ├── write.ts      # 7 state-changing tools
│   │   └── safety.ts     # 2 safety tools (config, lock)
│   ├── prompts.ts        # 3 MCP prompts (financial-report, optimize-yield, send-money)
│   ├── unlock.ts         # PIN resolution (env var + session file)
│   ├── mutex.ts          # Transaction serialization mutex
│   └── errors.ts         # SDK error → MCP error mapping
```

### Dependencies

```json
{
  "name": "@t2000/mcp",
  "version": "0.12.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "t2000-mcp": "dist/bin.js"
  },
  "dependencies": {
    "@t2000/sdk": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.27.0",
    "zod": "^3.25.0"
  }
}
```

Using `@modelcontextprotocol/sdk` v1.x (production-ready). Upgrade to v2 split packages when stable.

---

## Wallet Unlock

MCP servers can't prompt for interactive input. The server resolves the PIN using the same priority chain as the CLI, minus the interactive prompt:

```typescript
// packages/mcp/src/unlock.ts

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { T2000 } from '@t2000/sdk';

const SESSION_PATH = resolve(homedir(), '.t2000', '.session');

async function resolvePin(): Promise<string> {
  // 1. Env var (T2000_PIN or T2000_PASSPHRASE)
  const envPin = process.env.T2000_PIN ?? process.env.T2000_PASSPHRASE;
  if (envPin) return envPin;

  // 2. Session file (~/.t2000/.session) — written by CLI on first PIN entry
  try {
    const session = await readFile(SESSION_PATH, 'utf-8');
    if (session.trim()) return session.trim();
  } catch { /* no session */ }

  // 3. No PIN available
  throw new Error(
    'No PIN available. Either:\n' +
    '  1. Run `t2000 balance` first (creates session), or\n' +
    '  2. Set T2000_PIN environment variable'
  );
}

export async function createAgent(keyPath?: string): Promise<T2000> {
  const pin = await resolvePin();
  return T2000.create({ pin, keyPath });
}
```

**Setup flow — 3 steps, zero friction:**

```bash
# Step 1: Install + create wallet
npm i -g @t2000/cli && t2000 init

# Step 2: Configure safeguards (required before MCP starts)
t2000 config set maxPerTx 100
t2000 config set maxDailySend 500

# Step 3: Enter PIN once (saves session for MCP to reuse)
t2000 balance
```

Then paste the MCP config into your AI platform — no PIN needed in the config:

```json
{ "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }
```

**Alternative (CI / automation):** Pass PIN via env var if no session exists:

```bash
T2000_PIN=1234 t2000 mcp
```

---

## MCP Tools — Full Specifications

### Read-Only Tools (7)

No safeguard checks. Tool annotation: `readOnlyHint: true`.

---

#### `t2000_balance`

**Description:** Get agent's current balance — available (checking), savings, gas reserve, and total.

**Input schema:** _(none)_

**Output:** `BalanceResponse` JSON

```json
{
  "available": 96.81,
  "stables": { "USDC": 96.81 },
  "savings": 5.10,
  "gasReserve": { "sui": 0.86, "usdEquiv": 0.84 },
  "total": 102.75,
  "assets": { "USDC": 101.91 }
}
```

---

#### `t2000_address`

**Description:** Get the agent's Sui wallet address.

**Input schema:** _(none)_

**Output:**

```json
{ "address": "0x40cdfd49d252c798833ddb6e48900b4cd44eeff5f2ee8e5fad76b69b739c3e62" }
```

---

#### `t2000_positions`

**Description:** View current lending positions across protocols (NAVI, Suilend) — deposits, borrows, APYs.

**Input schema:** _(none)_

**Output:** `PositionsResult` JSON

---

#### `t2000_rates`

**Description:** Get best available interest rates per asset across all protocols.

**Input schema:** _(none)_

**Output:** `RatesResult` JSON

---

#### `t2000_health`

**Description:** Check the agent's health factor — measures how safe current borrows are. Below 1.0 risks liquidation.

**Input schema:** _(none)_

**Output:** `HealthFactorResult` JSON

---

#### `t2000_history`

**Description:** View recent transactions (sends, saves, borrows, swaps, etc.).

**Input schema:**

```typescript
z.object({
  limit: z.number().optional().describe('Number of transactions to return (default: 20)'),
})
```

**Output:** `TransactionRecord[]` JSON

---

#### `t2000_earnings`

**Description:** View yield earnings from savings positions.

**Input schema:** _(none)_

**Output:** `EarningsResult` JSON

---

### State-Changing Tools (7)

All state-changing tools:
- Pass through `enforcer.check()` with appropriate `TxMetadata`
- Accept `dryRun: true` to return a preview without signing
- Use a mutex to serialize concurrent calls (prevents gas coin conflicts)
- Tool annotation: `readOnlyHint: false`

---

#### `t2000_send`

**Description:** Send USDC or stablecoins to a Sui address. Amount is in dollars.

**Input schema:**

```typescript
z.object({
  to: z.string().describe('Recipient Sui address (0x...)'),
  amount: z.number().describe('Amount in dollars to send'),
  asset: z.string().optional().describe('Asset to send (default: USDC)'),
  dryRun: z.boolean().optional().describe('Preview without signing'),
})
```

**dryRun preview:**
1. Validate address with `isValidSuiAddress()`
2. Run `enforcer.check({ operation: 'send', amount })`
3. Check balance is sufficient
4. Return preview:

```json
{
  "preview": true,
  "canSend": true,
  "amount": 10,
  "to": "0x40cd...3e62",
  "asset": "USDC",
  "currentBalance": 96.81,
  "balanceAfter": 86.81,
  "safeguards": { "dailyUsedAfter": 10, "dailyLimit": 1000 }
}
```

**Execute:** Call `agent.send()`, then `enforcer.recordUsage()`. Return `SendResult` JSON.

---

#### `t2000_save`

**Description:** Deposit USDC to savings (earns yield). Use "all" to save entire available balance.

**Input schema:**

```typescript
z.object({
  amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to save, or "all"'),
  dryRun: z.boolean().optional().describe('Preview without signing'),
})
```

**dryRun preview:**
1. Run `enforcer.assertNotLocked()`
2. Get current balance and rates
3. Return preview:

```json
{
  "preview": true,
  "amount": 50,
  "currentApy": 4.92,
  "estimatedFee": 0.05,
  "savingsBalanceAfter": 55.10
}
```

**Execute:** Call `agent.save()`. Return `SaveResult` JSON.

---

#### `t2000_withdraw`

**Description:** Withdraw from savings back to checking. Use "all" to withdraw everything.

**Input schema:**

```typescript
z.object({
  amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to withdraw, or "all"'),
  dryRun: z.boolean().optional().describe('Preview without signing'),
})
```

**dryRun preview:**
1. Run `enforcer.assertNotLocked()`
2. Get max withdraw, current health factor
3. Return preview with estimated health factor after withdrawal

**Execute:** Call `agent.withdraw()`. Return `WithdrawResult` JSON.

---

#### `t2000_borrow`

**Description:** Borrow USDC against savings collateral. Check health factor first.

**Input schema:**

```typescript
z.object({
  amount: z.number().describe('Dollar amount to borrow'),
  dryRun: z.boolean().optional().describe('Preview without signing'),
})
```

**dryRun preview:**
1. Run `enforcer.assertNotLocked()`
2. Get max borrow, current health factor
3. Estimate health factor after borrow
4. Return preview:

```json
{
  "preview": true,
  "amount": 2,
  "maxBorrow": 3.50,
  "currentHealthFactor": 4.24,
  "estimatedHealthFactorAfter": 2.10,
  "estimatedFee": 0.001
}
```

**Execute:** Call `agent.borrow()`. Return `BorrowResult` JSON.

---

#### `t2000_repay`

**Description:** Repay borrowed USDC. Use "all" to repay entire debt.

**Input schema:**

```typescript
z.object({
  amount: z.union([z.number(), z.literal('all')]).describe('Dollar amount to repay, or "all"'),
  dryRun: z.boolean().optional().describe('Preview without signing'),
})
```

**dryRun preview:**
1. Run `enforcer.assertNotLocked()`
2. Get current debt, balance
3. Return preview with remaining debt after repayment

**Execute:** Call `agent.repay()`. Return `RepayResult` JSON.

---

#### `t2000_exchange`

**Description:** Swap assets via Cetus DEX (e.g. USDC to SUI, SUI to USDC).

**Input schema:**

```typescript
z.object({
  amount: z.number().describe('Amount to swap (in source asset units)'),
  from: z.string().describe('Source asset (e.g. USDC, SUI)'),
  to: z.string().describe('Target asset (e.g. SUI, USDC)'),
  maxSlippage: z.number().optional().describe('Max slippage percentage (default: 3%)'),
  dryRun: z.boolean().optional().describe('Preview without signing'),
})
```

**dryRun preview:** Call `agent.exchangeQuote()` — this already exists as a native preview.

```json
{
  "preview": true,
  "from": "USDC",
  "to": "SUI",
  "amount": 10,
  "expectedOutput": 10.25,
  "priceImpact": 0.01,
  "fee": 0.03
}
```

**Execute:** Call `agent.exchange()`. Return `SwapResult` JSON.

---

#### `t2000_rebalance`

**Description:** Optimize yield by moving funds to the highest-rate protocol. Always runs dryRun first to show the plan.

**Input schema:**

```typescript
z.object({
  dryRun: z.boolean().optional().describe('Preview without executing (default: true)'),
  minYieldDiff: z.number().optional().describe('Min APY difference to rebalance (default: 0.5%)'),
  maxBreakEven: z.number().optional().describe('Max break-even days (default: 30)'),
})
```

**Note:** `rebalance()` already has native `dryRun` support. Default to `dryRun: true` — the AI must explicitly set `dryRun: false` to execute.

**Execute:** Call `agent.rebalance()`. Return `RebalanceResult` JSON.

---

### Safety Tools (2)

No safeguard checks (these are meta-operations). Tool annotation: `readOnlyHint: false`.

---

#### `t2000_config`

**Description:** View or set agent safeguard limits (per-transaction max, daily send limit).

**Input schema:**

```typescript
z.object({
  action: z.enum(['show', 'set']).describe('"show" to view current limits, "set" to update a limit'),
  key: z.string().optional().describe('Setting to update: "maxPerTx" or "maxDailySend"'),
  value: z.number().optional().describe('New value in dollars (0 = unlimited)'),
})
```

**show output:**

```json
{
  "locked": false,
  "maxPerTx": 100,
  "maxDailySend": 1000,
  "dailyUsed": 350
}
```

**set output:**

```json
{ "updated": true, "key": "maxPerTx", "value": 500 }
```

**Validation:**
- Only `maxPerTx` and `maxDailySend` can be set via MCP. `locked` is not settable (use `t2000_lock`).
- Values must be non-negative numbers.

---

#### `t2000_lock`

**Description:** Freeze all agent operations immediately. Only a human can unlock via `t2000 unlock` in the terminal.

**Input schema:** _(none)_

**Output:**

```json
{ "locked": true, "message": "Agent locked. Only a human can unlock via: t2000 unlock" }
```

> **`unlock` is intentionally NOT exposed as an MCP tool.** If an AI could unlock, the lock would be meaningless. The human owner must run `t2000 unlock` in their terminal to resume operations.

---

## MCP Prompts (3)

Prompts are reusable conversation templates that help AI assistants interact with t2000 effectively. They appear in Claude Desktop's prompt selector and Cursor's MCP prompt list. Lightweight — just message templates, no SDK logic.

---

#### `financial-report`

**Title:** Financial Report

**Description:** Get a comprehensive summary of the agent's financial position — balance, savings, debt, health factor, and yield earnings.

**Args:** _(none)_

**Messages:**

```
You are a financial assistant for a t2000 AI agent bank account.

Please provide a comprehensive financial report by:
1. Check the current balance (t2000_balance)
2. Review lending positions (t2000_positions)
3. Check the health factor (t2000_health)
4. Show yield earnings (t2000_earnings)
5. Review current interest rates (t2000_rates)

Summarize the agent's financial health in a clear, concise format with actionable recommendations.
```

---

#### `optimize-yield`

**Title:** Optimize Yield

**Description:** Analyze savings positions and suggest yield optimizations — rate comparisons, rebalancing opportunities.

**Args:** _(none)_

**Messages:**

```
You are a yield optimization assistant for a t2000 AI agent bank account.

Please analyze the current yield strategy:
1. Check current positions (t2000_positions)
2. Compare rates across protocols (t2000_rates)
3. Run a dry-run rebalance to see if optimization is available (t2000_rebalance with dryRun: true)

If a rebalance would improve yield, explain the trade-off (gas cost vs yield gain, break-even period) and ask if the user wants to proceed.
```

---

#### `send-money`

**Title:** Send Money

**Description:** Guided flow for sending USDC to a Sui address — validates address, checks limits, previews before signing.

**Args:**

```typescript
z.object({
  to: z.string().optional().describe('Recipient Sui address'),
  amount: z.number().optional().describe('Amount in dollars'),
})
```

**Messages:**

```
You are a payment assistant for a t2000 AI agent bank account.

The user wants to send money. Follow this flow:
1. If address or amount is missing, ask the user
2. Preview the transaction (t2000_send with dryRun: true)
3. Show the preview — amount, recipient, remaining balance, safeguard status
4. Ask the user to confirm before executing
5. Execute the send (t2000_send with dryRun: false)
6. Show the transaction result with the Suiscan link
```

---

## Server Entry Point

```typescript
// packages/mcp/src/index.ts — exports startMcpServer() for CLI import

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgent } from './unlock.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerSafetyTools } from './tools/safety.js';
import { registerPrompts } from './prompts.js';

export async function startMcpServer(opts?: { keyPath?: string }): Promise<void> {
  const agent = await createAgent(opts?.keyPath);

  // Safeguard gate — refuse to start without configured limits
  if (!agent.enforcer.isConfigured()) {
    console.error(
      'Safeguards not configured. Set limits before starting MCP:\n' +
      '  t2000 config set maxPerTx 100\n' +
      '  t2000 config set maxDailySend 500\n'
    );
    process.exit(1);
  }

  const server = new McpServer({ name: 't2000', version: '0.12.0' });

  registerReadTools(server, agent);
  registerWriteTools(server, agent);
  registerSafetyTools(server, agent);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

```typescript
// packages/mcp/src/bin.ts — standalone entry point for `npx t2000-mcp`

#!/usr/bin/env node
import { startMcpServer } from './index.js';
await startMcpServer();
```

---

## Concurrency — Transaction Mutex

MCP clients can call multiple tools in parallel. State-changing SDK methods must not run concurrently — they share gas coins and nonce management.

```typescript
// Simple mutex for write operations
class TxMutex {
  private queue: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let resolve: () => void;
    const next = new Promise<void>(r => { resolve = r; });
    const prev = this.queue;
    this.queue = next;
    await prev;
    try {
      return await fn();
    } finally {
      resolve!();
    }
  }
}
```

All write tools use `mutex.run(() => agent.send(...))` to serialize execution.

Read-only tools do NOT use the mutex — they can run concurrently without issues.

---

## Error Mapping

SDK errors map to MCP tool error responses (`isError: true`):

```typescript
// packages/mcp/src/errors.ts

import { T2000Error, SafeguardError } from '@t2000/sdk';

interface McpToolError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export function mapError(err: unknown): McpToolError {
  if (err instanceof SafeguardError) {
    return {
      code: 'SAFEGUARD_BLOCKED',
      message: err.message,
      retryable: false,
      details: { rule: err.rule, ...err.details },
    };
  }

  if (err instanceof T2000Error) {
    return {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
    };
  }

  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
    retryable: false,
  };
}

export function errorResult(err: unknown) {
  const mapped = mapError(err);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(mapped) }],
    isError: true,
  };
}
```

---

## Tool Descriptions — Quality Matters

MCP tool descriptions are the primary way AI understands how to use each tool. Every tool description must:

1. **Say what it does** in one sentence
2. **Include units** — "Amount is in dollars" not just "amount"
3. **Mention constraints** — "Use 'all' to withdraw everything" or "Check health factor first"
4. **Explain dryRun** — "Set dryRun: true to preview without signing"

Bad: `"Send tokens"` — too vague, no context.
Good: `"Send USDC or stablecoins to a Sui address. Amount is in dollars. Subject to per-transaction and daily send limits."` — actionable.

---

## CLI Command

### `t2000 mcp`

**File:** `packages/cli/src/commands/mcp.ts`

```typescript
import type { Command } from 'commander';

export function registerMcp(program: Command) {
  program
    .command('mcp')
    .description('Start MCP server (stdio transport)')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      // Dynamic import to avoid loading MCP deps for non-MCP commands
      const { startMcpServer } = await import('@t2000/mcp');
      await startMcpServer({ keyPath: opts.key });
    });
}
```

Minimal — delegates to `@t2000/mcp`. No `--pin` flag (use env var instead — visible in process list is a security risk).

**CLI dependency:** Add `@t2000/mcp` as an optional dependency of `@t2000/cli` so the dynamic import resolves. Users who don't use MCP won't pull the dep.

---

## Platform Configs

Session-based auth means the config is just a command — no PIN, no env vars, no secrets.

### Claude Desktop

**File:** `docs/claude-desktop.json`

```json
{
  "mcpServers": {
    "t2000": {
      "command": "t2000",
      "args": ["mcp"]
    }
  }
}
```

Location: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

### Cursor

**File:** `docs/cursor-mcp.json`

```json
{
  "mcpServers": {
    "t2000": {
      "command": "t2000",
      "args": ["mcp"]
    }
  }
}
```

Location: `.cursor/mcp.json` in project root (or global `~/.cursor/mcp.json`)

### CI / Automation (env var fallback)

When no session file exists (headless environments), pass PIN via env var:

```json
{
  "mcpServers": {
    "t2000": {
      "command": "t2000",
      "args": ["mcp"],
      "env": { "T2000_PIN": "YOUR_PIN_HERE" }
    }
  }
}
```

### Setup Guide

Ship a `docs/mcp-setup.md` covering:
1. Install t2000 CLI (`npm i -g @t2000/cli`)
2. Create wallet (`t2000 init`)
3. Configure safeguards (`t2000 config set maxPerTx 100`)
4. Run any command once to create session (`t2000 balance`)
5. Paste platform config (Claude Desktop / Cursor)
6. Verify: ask your AI "what's my t2000 balance?"

---

## Tasks

### Package + Server (11a.1–11a.5)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.1 | Scaffold `packages/mcp/` (package.json, tsconfig, README, deps) | 30m | ✅ |
| 11a.2 | Implement `unlock.ts` (PIN resolution: env var + session file) | 30m | ✅ |
| 11a.3 | Implement `errors.ts` (SDK error → MCP error mapping) | 15m | ✅ |
| 11a.4 | Implement `mutex.ts` (transaction serialization for write tools) | 15m | ✅ |
| 11a.5 | Implement `index.ts` (McpServer + StdioServerTransport + safeguard gate + registration) | 30m | ✅ |

### Read-Only Tools (11a.6)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.6a | `t2000_balance` — `agent.balance()` | 15m | ✅ |
| 11a.6b | `t2000_address` — `agent.address` | 10m | ✅ |
| 11a.6c | `t2000_positions` — `agent.positions()` | 10m | ✅ |
| 11a.6d | `t2000_rates` — `agent.rates()` | 10m | ✅ |
| 11a.6e | `t2000_health` — `agent.healthFactor()` | 10m | ✅ |
| 11a.6f | `t2000_history` — `agent.history()` | 10m | ✅ |
| 11a.6g | `t2000_earnings` — `agent.earnings()` | 10m | ✅ |

### State-Changing Tools (11a.7)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.7a | `t2000_send` — `agent.send()` + dryRun preview | 30m | ✅ |
| 11a.7b | `t2000_save` — `agent.save()` + dryRun preview | 20m | ✅ |
| 11a.7c | `t2000_withdraw` — `agent.withdraw()` + dryRun preview | 20m | ✅ |
| 11a.7d | `t2000_borrow` — `agent.borrow()` + dryRun preview | 20m | ✅ |
| 11a.7e | `t2000_repay` — `agent.repay()` + dryRun preview | 20m | ✅ |
| 11a.7f | `t2000_exchange` — `agent.exchange()` + quote preview | 20m | ✅ |
| 11a.7g | `t2000_rebalance` — `agent.rebalance()` (native dryRun) | 15m | ✅ |

### Safety Tools + Prompts (11a.8)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.8a | `t2000_config` — show/set safeguard limits | 20m | ✅ |
| 11a.8b | `t2000_lock` — freeze all operations | 10m | ✅ |
| 11a.8c | MCP prompts: `financial-report`, `optimize-yield`, `send-money`, `budget-check`, `savings-strategy` | 30m | ✅ |

### CLI (11a.9)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.9 | `t2000 mcp` CLI command (dynamic import of `@t2000/mcp`) | 30m | ✅ |

### Tests (11a.10–11a.16)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.10 | Unit tests: `unlock.ts` (env var, session file, no PIN error) | 30m | ✅ (5 tests) |
| 11a.11 | Unit tests: `errors.ts` (SafeguardError, T2000Error, unknown error mapping) | 20m | ✅ (6 tests) |
| 11a.12 | Unit tests: read tools (mock agent, verify JSON output for all 7) | 1h | ✅ (10 tests) |
| 11a.13 | Unit tests: write tools (dryRun preview, execute, safeguard block, mutex serialization) | 1.5h | ✅ (18 tests) |
| 11a.14 | Unit tests: safety tools (config show/set, lock) + prompts (verify message templates) | 30m | ✅ (14 tests) |
| 11a.15 | Integration test: full stdio MCP client ↔ server round-trip (list tools, call read, call write, verify errors) | 1h | ✅ (9 tests via InMemoryTransport) |
| 11a.16 | Safeguard gate test: server refuses to start without configured limits | 15m | ✅ (3 tests) |

### Platform + Docs (11a.17–11a.20)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.17 | Platform config files (Claude Desktop, Cursor — session-based, no PIN) + setup guide | 45m | ✅ |
| 11a.18 | Agent Skill: `t2000-mcp` SKILL.md | 30m | ✅ |
| 11a.19 | Update `apps/web/app/docs/page.tsx`: add MCP Server section (setup, tools, prompts, platform configs) | 45m | ✅ |
| 11a.20 | Update `apps/web/app/docs/page.tsx`: bump version to v0.12.0, add changelog entry | 15m | ✅ |

### Web + Homepage (11a.21–11a.23)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.21 | Evolve homepage Skills section → "Connect Your AI" (MCP-first, Skills secondary) | 1.5h | ✅ |
| 11a.22 | Add "MCP" hero pill + update hero subtitle | 15m | ✅ |
| 11a.23 | Add "Agent Safeguards" + "MCP Server" rows to comparison table | 15m | ✅ |

### Marketing (11a.24)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.24 | Add MCP launch tweets (3 tweets) to `marketing/marketing-plan.md` | 20m | ✅ |

### Release (11a.25–11a.28)

| # | Task | Est | Status |
|---|------|-----|--------|
| 11a.25 | Update `PRODUCT_FACTS.md`: add `@t2000/mcp` package, skill count, MCP tool list | 15m | ✅ |
| 11a.26 | Update `CLI_UX_SPEC.md`: add `t2000 mcp` command output | 15m | ✅ |
| 11a.27 | Update READMEs: root, SDK, CLI — add MCP mentions. Write `packages/mcp/README.md` | 30m | ✅ |
| 11a.28 | Version bump (0.12.0), build all packages, publish `@t2000/mcp` + updated CLI/SDK, update roadmap | 30m | ✅ |

**Total: 37 tasks (37 completed) · Current versions: SDK v0.11.2, CLI v0.12.3, MCP v0.12.3**

---

## Execution Order

### Day 1: Foundation + Read Tools

1. **11a.1** — Scaffold package
2. **11a.2** — Unlock (PIN resolution)
3. **11a.3** — Error mapping
4. **11a.4** — Transaction mutex
5. **11a.5** — Server entry point + safeguard gate
6. **11a.6a–g** — All 7 read-only tools
7. **11a.10–11** — Unlock + error mapping tests
8. **11a.12** — Read tool tests

### Day 2: Write + Safety + Prompts + CLI

9. **11a.7a–g** — All 7 state-changing tools with dryRun
10. **11a.8a–b** — Safety tools
11. **11a.8c** — MCP prompts
12. **11a.9** — CLI `t2000 mcp` command
13. **11a.13–14** — Write + safety + prompt tests
14. **11a.16** — Safeguard gate test

### Day 3: Integration + Web + Ship

15. **11a.15** — Integration test (full round-trip)
16. **11a.17** — Platform configs + setup guide
17. **11a.18** — Agent skill
18. **11a.19** — Web docs page MCP section
19. **11a.20** — Docs version bump + changelog
20. **11a.21** — Homepage: evolve Skills → "Connect Your AI"
21. **11a.22** — Homepage: hero pill + subtitle
22. **11a.23** — Homepage: comparison table rows
23. **11a.24** — Marketing tweets
24. **11a.25** — PRODUCT_FACTS
25. **11a.26** — CLI_UX_SPEC
26. **11a.27** — READMEs
27. **11a.28** — Version bump, build, publish

---

## Testing Strategy

| Test file | What it covers | Count |
|-----------|---------------|-------|
| `unlock.test.ts` | PIN from env var, session file, no PIN error | 5 ✅ |
| `errors.test.ts` | SafeguardError, T2000Error, unknown error → MCP format | 6 ✅ |
| `mutex.test.ts` | Serialization, concurrent operations, error handling | 3 ✅ |
| `tools/read.test.ts` | All 7 read tools return correct JSON structure | 10 ✅ |
| `tools/write.test.ts` | Write tools: dryRun preview, execute, safeguard block, invalid address | 18 ✅ |
| `tools/safety.test.ts` | Config show/set validation, lock output | 9 ✅ |
| `prompts.test.ts` | All 5 prompts return valid message arrays + args | 8 ✅ |
| `integration.test.ts` | Full InMemoryTransport client ↔ server: list tools, call read/write, verify errors, get prompts | 9 ✅ |
| `gate.test.ts` | Server exits without configured limits, passes with limits, forwards keyPath | 3 ✅ |

**Actual: 71 tests passing across 9 test files.**

### Key test scenarios

| Scenario | Expected |
|----------|----------|
| `T2000_PIN` env var set | `resolvePin()` returns env value |
| `~/.t2000/.session` exists, no env var | `resolvePin()` returns session value |
| No PIN available at all | `resolvePin()` throws with setup instructions |
| `SafeguardError` → MCP error | `{ code: 'SAFEGUARD_BLOCKED', retryable: false, details: { rule, ... } }` |
| `T2000Error` → MCP error | `{ code: err.code, retryable: err.retryable }` |
| Unknown error → MCP error | `{ code: 'UNKNOWN', retryable: false }` |
| Call `t2000_balance` | Returns `BalanceResponse` JSON with all fields |
| Call `t2000_send` with `dryRun: true` | Returns preview, no transaction signed |
| Call `t2000_send` with `dryRun: false` | Calls `agent.send()`, returns `SendResult` |
| Call `t2000_send` while locked | Returns `isError: true` with `SAFEGUARD_BLOCKED` |
| Call `t2000_send` exceeding maxPerTx | Returns safeguard error with rule details |
| Two concurrent `t2000_send` calls | Mutex serializes — both succeed sequentially |
| Call `t2000_config` with `action: 'set'`, `key: 'locked'` | Rejected (use `t2000_lock` instead) |
| Call `t2000_lock` | Returns `locked: true` |
| List prompts via MCP | Returns 5 prompts with correct names |
| Call `financial-report` prompt | Returns system message with tool-calling instructions |
| Start MCP with no safeguards configured | Process exits with setup instructions |
| Start MCP with no PIN available | Process exits with clear error message |

---

## Homepage Updates

### Hero pills — add MCP

Current pills: `Checking · Savings · Credit · Exchange · x402 Pay`

Add:

```typescript
{ icon: "⚙", label: "MCP" },
```

### Hero subtitle — update

Current: "Your agent can hold money, earn yield, borrow against savings, exchange currencies, and pay for APIs — all in one CLI command."

Updated: "Your agent can hold money, earn yield, borrow against savings, exchange currencies, and pay for APIs. Connect any AI via MCP — no human in the loop."

### Skills section → "Connect Your AI"

Evolve the current Agent Skills section. MCP becomes the primary story, Skills becomes secondary. Inspired by [CardForAgent's clean MCP presentation](https://cardforagent.com/#mcp).

**New section layout:**

```
┌─────────────────────────────────────────────────────────┐
│ CONNECT YOUR AI                                         │
│                                                         │
│ Your AI already has a bank account.                     │
│ Now it can use it from anywhere.                        │
│                                                         │
│ ┌─────────────────────┐  ┌────────────────────────────┐ │
│ │ MCP Config           │  │ 16 tools · 3 prompts      │ │
│ │ ─────────────────── │  │                            │ │
│ │ {                    │  │ t2000_balance   read       │ │
│ │   "mcpServers": {   │  │ t2000_send      write      │ │
│ │     "t2000": {      │  │ t2000_save      write      │ │
│ │       "command":    │  │ t2000_withdraw  write      │ │
│ │         "t2000",    │  │ t2000_borrow    write      │ │
│ │       "args":       │  │ t2000_repay     write      │ │
│ │         ["mcp"]     │  │ t2000_exchange  write      │ │
│ │     }               │  │ t2000_config    safety     │ │
│ │   }                 │  │ ...+ 8 more                │ │
│ │ }                   │  │                            │ │
│ └─────────────────────┘  └────────────────────────────┘ │
│                                                         │
│ Setup in 3 steps:                                       │
│ 1. npm i -g @t2000/cli && t2000 init                   │
│ 2. t2000 config set maxPerTx 100                        │
│ 3. Paste config into Claude Desktop / Cursor            │
│                                                         │
│ Works with:                                             │
│ [Claude Desktop] [Cursor] [Claude Code] [Windsurf]      │
│ [Codex] [Copilot] [Amp] [+ any MCP client]              │
│                                                         │
│ ─── Also available as Agent Skills ───                  │
│ $ npx skills add mission69b/t2000-skills                │
│ For platforms without MCP support.                      │
└─────────────────────────────────────────────────────────┘
```

**Key changes from current Skills section:**
- Headline: "Your agent already knows how to use t2000" → "Your AI already has a bank account. Now it can use it from anywhere."
- Left panel: Skills install → MCP config snippet (copy-paste)
- Right panel: Skill trigger phrases → Tool list with categories
- 3-step setup as a clear flow
- Skills demoted to a small "also available" note at the bottom
- Platform list updated with MCP-focused messaging

### Comparison table — add 2 rows

```typescript
{ feature: "Agent Safeguards", coinbase: "—", t2000: "✓ Per-tx + daily limits + lock", coinbaseCross: true },
{ feature: "MCP Server", coinbase: "—", t2000: "✓ 16 tools + 3 prompts", coinbaseCross: true },
```

---

## Docs + Web Updates Checklist

### `apps/web/app/docs/page.tsx` — New MCP section

Add after the Agent Safeguards section (`cmd-safeguards`):

- **What is MCP** — one-liner explanation
- **Setup** — install, init, configure safeguards, add platform config
- **Available tools** — table of 16 tools with descriptions
- **Prompts** — list of 3 prompts with descriptions
- **Platform configs** — Claude Desktop + Cursor JSON snippets
- **dryRun** — explain preview pattern
- **Security** — safeguard gate, unlock is CLI-only

### `apps/web/app/page.tsx` — Comparison table additions

Add two rows to `COMPARE_ROWS`:

```typescript
{ feature: "Agent Safeguards", coinbase: "—", t2000: "✓ Per-tx + daily limits + lock", coinbaseCross: true },
{ feature: "MCP Server", coinbase: "—", t2000: "✓ 16 tools + 3 prompts", coinbaseCross: true },
```

### `PRODUCT_FACTS.md` updates

- Add `@t2000/mcp` to version table (`0.12.0`)
- Update skill count (11 → 12), add `t2000-mcp` to skills list
- Add MCP section: tool count (16), prompt count (3), transport (stdio)
- Update CLI commands table: add `t2000 mcp`

### `CLI_UX_SPEC.md` updates

Add `t2000 mcp` startup output:

```
  ✓ t2000 MCP server running (stdio)
  Tools: 16  Prompts: 3
  Safeguards: maxPerTx=$100, maxDailySend=$500
```

### READMEs

- **Root README**: Add MCP section with one-liner + setup link
- **CLI README**: Add `t2000 mcp` to command table
- **SDK README**: Mention MCP server uses SDK
- **MCP README** (new): Full setup guide, tool list, prompt list, platform configs, security notes

---

## Marketing — MCP Launch

Add to `marketing/marketing-plan.md` as a new week entry.

### Tweet 1 — The announcement

> t2000 now works with Claude Desktop, Cursor, and any MCP client.
>
> 16 tools. 3 prompts. One config line.
>
> Your AI can check balances, send money, earn yield, borrow, swap assets — all with safeguard limits baked in.
>
> ```json
> { "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }
> ```
>
> v0.12.0 →

**Media:** Terminal recording: `t2000 mcp` starting → Claude Desktop asking "what's my balance?" → getting structured response.

### Tweet 2 — The "why it matters"

> Before MCP: your AI had to run CLI commands and parse terminal output.
>
> After MCP: structured tools with dryRun previews, safeguard enforcement, and JSON responses.
>
> t2000 went from "CLI tool" to "infrastructure any AI can use."
>
> 3 steps to connect →

**Media:** Side-by-side — old way (skill running CLI) vs new way (MCP tool call with structured JSON).

### Tweet 3 — The safeguards angle

> "But what if the AI drains my wallet?"
>
> Every MCP tool call passes through safeguards:
> - Per-transaction limits
> - Daily send caps
> - Lock/unlock (only humans can unlock)
> - dryRun previews before signing
>
> The AI manages your money. You keep the kill switch.

**Media:** Screenshot of `t2000 config show` with limits + a blocked send attempt.

---

## Post-launch additions (shipped after v1)

| Feature | Status |
|---------|--------|
| `t2000 mcp install` / `uninstall` — auto-configure Claude Desktop + Cursor | ✅ Shipped (v0.12.1) |
| Integration test (InMemoryTransport client ↔ server) | ✅ Shipped (9 tests) |
| Safeguard gate test | ✅ Shipped (3 tests) |
| Homepage "Connect Your AI" redesign (MCP-first, Skills secondary) | ✅ Shipped |
| `budget-check` + `savings-strategy` prompts (3 → 5 prompts) | ✅ Shipped (v0.12.2) |
| SafeguardEnforcer caching fix — re-reads config from disk on every check | ✅ Shipped (SDK v0.11.2) |
| `debt` field in `BalanceResponse` — CLI shows Credit line with borrow APY | ✅ Shipped (SDK v0.11.2, CLI v0.12.3) |
| MCP balance tool description updated to mention credit/debt | ✅ Shipped (MCP v0.12.3) |
| Cinematic marketing demo video (`marketing/demo-video.html`) | ✅ Shipped |
| "Contacts" (coming soon) + OpenClaw added to homepage | ✅ Shipped |

## What v2 adds (when needed)

| Feature | Trigger to add |
|---------|---------------|
| SSE / Streamable HTTP transport | When remote/hosted MCP is needed |
| x402 `pay` tool | When x402 adoption grows, AI agents need to pay APIs |
| Sentinel tools | When sentinel product matures |
| MCP resources (address, rates, config) | If clients benefit from resource protocol |
| `unlock` via MCP (gated) | Only if a secure mechanism exists (e.g. human-in-the-loop confirmation) |
| Tool annotations (readOnlyHint, destructiveHint) | When MCP SDK API stabilizes |
| Tool output schemas | When MCP clients leverage structured output parsing |
| Demo page MCP demo | When shipping Agent UI (Phase 11b) |

---

*t2000 — The first bank account for AI agents.*
*Phase 11a — MCP Server Build Plan*
