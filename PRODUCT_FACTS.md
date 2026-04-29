# PRODUCT_FACTS.md — Single Source of Truth

> **Every README, docs page, skill file, and marketing material MUST match this file.**
> When a product fact changes, update this file FIRST, then propagate.
>
> For CLI output formatting (primitives, precision, header styles, exact output per command), see **`CLI_UX_SPEC.md`**.
>
> Source: derived from actual source code in `packages/*/src/`.
> Last verified: 2026-04-28 (post-S.26 — engine 0.54.1, Spec 1 (Correctness) + Spec 2 (Intelligence) shipped)

---

## Audric — the five products

> **Canonical reference.** Every consumer surface must use exactly these five product names. S.18 reverted S.17's Finance retirement: Intelligence was carrying both "the moat" and "the verb-bucket," and Send/Receive overlapped Pay. Finance now owns save/credit/swap/charts; Pay owns send/receive.

| Product | What it is |
|---------|-----------|
| 🪪 **Audric Passport** | Trust layer — identity (zkLogin via Google), non-custodial wallet on Sui, tap-to-confirm consent, Enoki-sponsored gas (web only). Wraps every other product. |
| 🧠 **Audric Intelligence** | Brain (the moat) — 5 systems: Agent Harness (34 tools), Reasoning Engine (14 guards, 6 skill recipes), Silent Profile, Chain Memory, AdviceLog. Engineering-facing brand; users experience it as "Audric just understood me." |
| 💰 **Audric Finance** | Manage your money on Sui — Save (NAVI lend, 3–8% APY), Credit (NAVI borrow, health factor), Swap (Cetus aggregator, 20+ DEXs, 0.1% fee), Charts (yield/health/portfolio viz). Every write taps to confirm via Passport. |
| 💸 **Audric Pay** | Move money — Send USDC, Receive (payment links, invoices, QR). Free, global, instant on Sui. |
| 🛒 **Audric Store** | Creator marketplace at `audric.ai/username`. Coming soon (Phase 5). |

See `audric-roadmap.md` for the full taxonomy + naming rules and `CLAUDE.md` for the binding rules.

---

## Audric Intelligence — the 5 systems (canonical)

> **Not a chatbot. A financial agent.** Five systems work together to **understand** the user's money, **reason** about decisions, **act** through 34 financial tools in one conversation, **remember** what they did on-chain, and **remember what it told them**. Every action still waits on Audric Passport's tap-to-confirm.
>
> _This block is the canonical definition. README, docs, marketing copy, and the engine system prompt must match it. Implementation details live in `ARCHITECTURE.md` (`## Engine (@t2000/engine) — Audric Intelligence implementation`)._

| # | System | One-line | Owns | Implementation |
|---|---|---|---|---|
| 1 | 🎛️ **Agent Harness** | 34 tools, one agent. | Tool registry, parallel reads, serial writes (`TxMutex`), permission gates, streaming dispatch (`EarlyToolDispatcher`) | `@t2000/engine` `QueryEngine` + `getDefaultTools()` (23 read + 11 write) |
| 2 | ⚡ **Reasoning Engine** | Thinks before it acts. | Adaptive thinking effort, 14 guards across 3 priority tiers (12 pre-exec + 2 post-exec hints), 6 YAML skill recipes, prompt caching, preflight validation | `classify-effort.ts`, `guards.ts`, `recipes/registry.ts`, `engine.ts` `cache_control` |
| 3 | 🧠 **Silent Profile** | Knows your finances. | Daily on-chain orientation snapshot (`UserFinancialContext`) + Claude-inferred profile (`UserFinancialProfile`), injected as `<financial_context>` block at every engine boot | _Audric-side_: `UserFinancialContext` + `UserFinancialProfile` Prisma models + `buildFinancialContextBlock()` + 02:00 UTC `financial-context-snapshot` cron + `buildProfileContext()` |
| 4 | 🔗 **Chain Memory** | Remembers what you do on-chain. | 7 classifiers extract `ChainFact` rows; injected silently as `<chain_memory>` | _Audric-side_: 7 chain classifiers in `daily-intel` cron group + `ChainFact` Prisma model + `buildMemoryContext()` |
| 5 | 📓 **AdviceLog** | Remembers what it told you. | Every recommendation written via `record_advice` (audric-side tool); last 30 days hydrated each turn so the chat doesn't contradict itself across sessions | _Audric-side_: `AdviceLog` Prisma model + `record_advice` tool + `buildAdviceContext()` + `EngineConfig.onAutoExecuted` flips `actedOn` |

**Naming rules (binding):**
- The phrase **"5 systems"** is canonical — never list 4, never list 6.
- Always use the system names exactly as written: `Agent Harness`, `Reasoning Engine`, `Silent Profile`, `Chain Memory`, `AdviceLog`.
- The Reasoning Engine has **14 guards** (12 pre-exec gates + 2 post-exec hints) across **3 priority tiers** (Safety > Financial > UX) and **6 YAML skill recipes**.
- The Agent Harness has **34 tools** (23 read + 11 write).

---

## Version

| Package | Version |
|---------|---------|
| `@t2000/sdk` | `0.54.1` |
| `@t2000/engine` | `0.54.1` |
| `@t2000/cli` | `0.54.1` |
| `@suimpp/mpp` | `0.3.1` |
| `@t2000/mcp` | `0.54.1` |
| Agent Skills | `3.0` |

---

## Agent Skills

| Fact | Value |
|------|-------|
| Install command | `npx skills add mission69b/t2000-skills` |
| Repo | `https://github.com/mission69b/t2000-skills` |
| Skill count | 12 |
| Skills | `t2000-check-balance`, `t2000-send`, `t2000-receive`, `t2000-save`, `t2000-withdraw`, `t2000-borrow`, `t2000-repay`, `t2000-pay`, `t2000-safeguards`, `t2000-mcp`, `t2000-contacts`, `t2000-engine` |
| Supported platforms | Claude Code, Cursor, Codex, Copilot, Amp, Cline, Gemini CLI, VS Code, + more |
| Source (monorepo) | `t2000-skills/` — auto-synced to standalone repo via GitHub Action |

---

## Fees

| Operation | BPS | Rate | Notes |
|-----------|-----|------|-------|
| Save | 10 | 0.1% | Protocol fee on deposit |
| Borrow | 5 | 0.05% | Protocol fee on loan |
| Withdraw | — | Free | |
| Repay | — | Free | |
| Send | — | Free | |
| Receive | — | Free | Payment request generation is local; uses Sui Payment Kit (`sui:pay?` URIs) for QR codes |
| Swap | 10 | 0.1% | t2000 overlay fee on swap (`overlayFeeRate` / `overlayFeeReceiver` in `cetus-swap.ts`); Cetus Aggregator network fees still apply |
| Stake (vSUI) | — | Free | VOLO protocol fees only |
| Unstake (vSUI) | — | Free | |
| Pay (MPP) | — | Free | Agent pays the API price, no t2000 surcharge |

Source: `packages/sdk/src/constants.ts` → `SAVE_FEE_BPS`, `BORROW_FEE_BPS`

Fees are collected on-chain via `t2000::treasury::collect_fee()` within the same PTB as the operation. The Move function takes `&mut Coin<T>` and splits the fee into the Treasury's internal `Balance<T>`.

---

## Architecture

### Programmable Transaction Blocks (PTBs)

All multi-step operations use single atomic PTBs. If any step fails, the entire transaction reverts — no funds left in intermediate states.

| Operation | PTB Composition |
|-----------|----------------|
| Save | Collect fee → deposit USDC — single PTB |
| Withdraw | Withdraw USDC from protocol → transfer — single PTB |
| Repay | Split USDC → repay debt — single PTB |
| Withdraw all | Withdraw all USDC positions → merge → transfer — single PTB |

### Dust Filtering

Positions with value ≤ $0.005 are filtered out of `positions()` display to avoid showing near-zero remnants from rounding.

### Composable Adapter Methods

Protocol adapters expose composable PTB methods alongside standalone transaction builders:

| Method | Description |
|--------|-------------|
| `addWithdrawToTx(tx, ...)` | Adds withdraw commands to existing PTB, returns `TransactionObjectArgument` |
| `addSaveToTx(tx, ...)` | Adds deposit commands, accepts coin as `TransactionObjectArgument` |
| `addRepayToTx(tx, ...)` | Adds repay commands, accepts coin as `TransactionObjectArgument` |

Source: `packages/sdk/src/adapters/types.ts`, `packages/sdk/src/t2000.ts`

---

## Protocol Adapters

t2000 uses an MCP-first integration model for DeFi protocol reads, with thin transaction builders for writes.

| Adapter | Type | Capabilities | Status |
|---------|------|-------------|--------|
| NAVI (`navi`) | Lending | save, withdraw, borrow, repay; claim rewards | Built-in |
| Cetus Aggregator V3 | Swap | Multi-DEX swap routing (20+ DEXs); t2000 **0.1% overlay** on swaps (`overlayFeeRate` / `overlayFeeReceiver`) | Built-in |
| VOLO | Liquid Staking | Stake SUI → vSUI, unstake vSUI → SUI | Built-in |
| DefiLlama | Market Data | Token prices, yields, TVL, protocol info, fees | Built-in (engine) |

- `LendingAdapter` interface: save, withdraw, borrow, repay, getRates, getPositions, getHealth, getPendingRewards, addClaimRewardsToTx
- `ProtocolRegistry` auto-selects best rates across registered adapters
- CLI `--protocol <name>` flag on save/withdraw/borrow/repay to pin a specific protocol
- Third-party adapters can be registered via `agent.registerAdapter(new MyAdapter())`
- Cetus SDK (`@cetusprotocol/aggregator-sdk`) is isolated to `packages/sdk/src/protocols/cetus-swap.ts`
- VOLO uses thin tx builders (direct Move calls) — no SDK dependency
- DefiLlama uses free public REST API (`coins.llama.fi`, `yields.llama.fi`, `api.llama.fi`)

Source: `packages/sdk/src/adapters/`, `packages/sdk/src/protocols/`, `packages/engine/src/tools/defillama.ts`

---

## Supported Assets

All token metadata (type, decimals, symbol, optional tier) lives in a **single canonical registry**: `packages/sdk/src/token-registry.ts` → `COIN_REGISTRY`. When adding a new token, add ONE entry there — everything else derives from it.

**Tier model**

- **Tier 1 (1 token):** USDC — financial layer (save, borrow, send, swap, MPP, etc.).
- **Tier 2 (15 swap assets):** SUI, wBTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, haSUI, afSUI, LOFI, MANIFEST — send and swap; not used for new save/borrow deposits. (haSUI and afSUI are liquid staking tokens with deep Cetus liquidity; users may receive them as routing intermediaries or hold them as yield-bearing SUI.)
- **Legacy (no tier, 3 tokens):** USDT, USDe, USDSUI — kept for accurate display and **withdraw** of existing positions; not tier-gated for new Tier 1/2 flows.

**19 tokens** in `COIN_REGISTRY`. Removed from the registry: FDUSD, AUSD, BUCK, BLUB, SCA, TURBOS.

| Tier | Symbols | Send | Save | Borrow | Swap |
|------|---------|------|------|--------|------|
| 1 | USDC | ✅ | ✅ (USDC + USDsui) | ✅ (USDC + USDsui) | ✅ |
| 1 | USDsui | ✅ | ✅ (strategic exception, v0.51.0+) | ✅ (strategic exception, v0.51.0+) | ✅ |
| 2 | SUI, wBTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, haSUI, afSUI, LOFI, MANIFEST | ✅ | — | — | ✅ |
| Legacy | USDT, USDe, USDSUI | ✅ | — | — | ✅ |

**Save**, **borrow**, and **repay** flows accept **USDC + USDsui** (strategic exception added in v0.51.0; SDK throws `INVALID_ASSET` for any other asset). USDsui is the only other Sui-native stable with a productive NAVI pool; the canonical default remains USDC. **Withdraw** still supports legacy positions in any asset. **Repay symmetry (v0.51.1+):** a USDsui debt MUST be repaid with USDsui (and USDC debt with USDC) — the SDK fetches the matching coin type per borrow asset; the agent never auto-swaps to bridge between stables. Swap routing uses Cetus Aggregator V3 (with t2000 overlay fee — see Fees).

Key SDK exports from `token-registry.ts`:
- `COIN_REGISTRY` — full registry (`Record<string, CoinMeta>`)
- `isTier1(coinType)`, `isTier2(coinType)`, `isSupported(coinType)`, `getTier(coinType)`
- `getDecimalsForCoinType(coinType)` — decimals lookup with suffix fallback
- `resolveSymbol(coinType)` — friendly name from full coin type
- `resolveTokenType(name)` — name → full coin type
- `TOKEN_MAP` — case-insensitive name → type mapping
- Type constants: `SUI_TYPE`, `USDC_TYPE`, `USDT_TYPE`, `USDSUI_TYPE`, `ETH_TYPE`, `WAL_TYPE`, `IKA_TYPE`, `LOFI_TYPE`, `MANIFEST_TYPE`, etc.

`STABLE_ASSETS` in `constants.ts` is **`['USDC']` only** — used for the "available cash" rollup in `queryBalance.available`. USDsui is exposed separately as `saveableUsdsui` on `balance_check` so the agent can keep the per-asset distinction when answering "how much can I save?".

`OPERATION_ASSETS` in `constants.ts` is the **canonical allow-list** for save/borrow/repay/withdraw — `['USDC', 'USDsui']` for save + borrow; `'*'` (any asset) for withdraw + repay (the SDK enforces "repay with same coin type as the borrow" inside `T2000.repay()`). `assertAllowedAsset(op, asset)` is the runtime gate.

Source: `packages/sdk/src/token-registry.ts`, `packages/sdk/src/constants.ts`

---

## CLI Commands

### Syntax (exact signatures from Commander.js)

| Command | Syntax | Notes |
|---------|--------|-------|
| init | `t2000 init` | Options: `--name <name>` |
| balance | `t2000 balance` | Options: `--show-limits` |
| send | `t2000 send <amount> <asset> [to] <address>` | `to` keyword is optional |
| save | `t2000 save <amount> [--asset USDC\|USDsui]` | Deposits **USDC or USDsui** to NAVI lending (default USDC, v0.51.1+ accepts `--asset USDsui`). Alias: `supply`. `amount` accepts `all`. |
| withdraw | `t2000 withdraw <amount> [--asset TOKEN]` | Withdraws from NAVI lending. `amount` accepts `all`. `--asset` for specific token. |
| borrow | `t2000 borrow <amount> [--asset USDC\|USDsui]` | Borrow USDC or USDsui (v0.51.1+ accepts `--asset USDsui`). |
| repay | `t2000 repay <amount> [--asset USDC\|USDsui]` | Repay USDC or USDsui debt. Repay must use the same asset as the original borrow. `amount` accepts `all` (repays across all assets). |
| pay | `t2000 pay <url>` | Options: `--method`, `--data`, `--header`, `--max-price`, `--timeout`, `--dry-run` |
| history | `t2000 history` | Options: `--limit <n>` (default: 20) |
| earnings | `t2000 earnings` | |
| fund-status | `t2000 fund-status` | |
| health | `t2000 health` | |
| rates | `t2000 rates` | |
| positions | `t2000 positions` | |
| deposit | `t2000 deposit` | Shows funding instructions |
| receive | `t2000 receive` | Options: `--amount <n>`, `--currency <sym>`, `--memo <text>`, `--label <text>`, `--key <path>` |
| address | `t2000 address` | |
| serve | `t2000 serve` | Options: `--port` (default: 3001), `--rate-limit` (default: 10) |
| config get | `t2000 config get [key]` | Omit key for all |
| config set | `t2000 config set <key> <value>` | |
| export | `t2000 export` | Options: `--yes` to skip confirmation |
| import | `t2000 import` | |
| lock | `t2000 lock` | Clear saved session |
| contacts | `t2000 contacts` | List saved contacts |
| contacts add | `t2000 contacts add <name> <address>` | Save a named contact |
| contacts remove | `t2000 contacts remove <name>` | Remove a contact |
| claim-rewards | `t2000 claim-rewards` | Claim pending protocol rewards |
| swap | `t2000 swap <amount> <from> [for] <to>` | Swap tokens via Cetus Aggregator. Options: `--slippage <pct>` (default: 1%) |
| swap-quote | `t2000 swap-quote <amount> <from> [for] <to>` | Preview swap quote (read-only, no execution) |
| stake | `t2000 stake <amount>` | Stake SUI for vSUI (VOLO liquid staking, min 1 SUI) |
| unstake | `t2000 unstake <amount>` | Unstake vSUI back to SUI. `amount` accepts `all` |
| earn | `t2000 earn` | Show all earning opportunities — savings yield |
| mcp install | `t2000 mcp install` | Auto-configure MCP in Claude Desktop + Cursor |
| mcp uninstall | `t2000 mcp uninstall` | Remove t2000 MCP config from platforms |
| mcp | `t2000 mcp` | Start MCP server (stdio transport, used by AI platforms) |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--yes` / `-y` | Skip confirmation prompts |
| `--key <path>` | Key file path (default: `~/.t2000/wallet.key`) |

### CLI Output Formats (canonical examples)

**balance:**
```
  Available:  $4.00  (checking — spendable)
  Savings:    $1.00  (earning 3.31% APY)
  Gas:        1.04 SUI    (~$0.98)
  ──────────────────────────────────────
  Total:      $5.98
  Earning ~$0.01/day
```

**save:**
```
  ✓ Saved $1.00 USDC to best rate
  ✓ Protocol fee: $0.00 USDC (0.1%)
  ✓ Current APY: 3.31%
  ✓ Savings balance: $1.00 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**borrow:**
```
  ✓ Borrowed $0.20 USDC
  Health Factor:  4.24
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**repay:**
```
  ✓ Repaid $0.20 USDC
  Remaining Debt:  $0.00
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**send:**
```
  ✓ Sent $10.00 USDC → 0x8b3e...d412
  Gas:  0.0042 SUI
  Balance:  $90.00 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**swap:**
```
  ✓ Swapped 10 SUI for 38.4200 USDC
  Route:  SUI → USDC (Cetus)
  Gas:    0.0031 SUI
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**stake:**
```
  ✓ Staked 5 SUI for 4.7619 vSUI
  ✓ APY: 3.85%
  Gas:    0.0028 SUI
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**unstake:**
```
  ✓ Unstaked 4.7619 vSUI
  ✓ Received 5.0500 SUI
  Gas:    0.0028 SUI
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**receive:**
```
  ✓ Payment Request

  $25.00 USDC

  Address:   0x8b3e...d412
  Network:   Sui Mainnet
  Nonce:     a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d
  Memo:      Office supplies

  Payment URI: sui:pay?receiver=0x8b3e...&amount=25000000&coinType=0xdba3...::usdc::USDC&nonce=a1b2...

  Share this URI or scan the QR to pay via any Sui wallet.
```

**pay:**
```
  → GET https://api.example.com/data
  ← 402 Payment Required: $0.01 USDC (Sui)
  ✓ Paid $0.01 USDC (tx: 0xabc123ab...)
  ← 200 OK  [820ms]
```

---

## SDK Methods

### Construction

| Method | Signature | Description |
|--------|-----------|-------------|
| `T2000.create()` | `(options?: T2000Options): Promise<T2000>` | Load existing wallet. Key options: `pin`, `keyPath`, `rpcUrl` |
| `T2000.init()` | `(options: { pin: string; keyPath?: string }): Promise<{ agent: T2000; address: string }>` | Create new wallet |
| `T2000.fromPrivateKey()` | `(privateKey: string, options?: { rpcUrl?: string }): T2000` | From raw key |

### Wallet

| Method | Params | Returns |
|--------|--------|---------|
| `balance()` | — | `BalanceResponse` |
| `send()` | `{ to, amount, asset? }` | `SendResult` |
| `history()` | `{ limit? }` | `TransactionRecord[]` |
| `address()` | — (sync) | `string` |
| `deposit()` | — | `DepositInfo` |
| `receive()` | `{ amount?, currency?, memo?, label? }` | `PaymentRequest` — address, nonce, Payment Kit URI (`sui:pay?...`), display text |

### Savings

| Method | Params | Returns |
|--------|--------|---------|
| `save()` | `{ amount: number \| 'all', protocol? }` | `SaveResult` — **USDC only**; non-USDC `asset` throws `INVALID_ASSET` |
| `withdraw()` | `{ amount: number \| 'all', asset?: string }` | `WithdrawResult` |
| `maxWithdraw()` | — | `MaxWithdrawResult` |

### Credit

| Method | Params | Returns |
|--------|--------|---------|
| `borrow()` | `{ amount }` | `BorrowResult` |
| `repay()` | `{ amount: number \| 'all' }` | `RepayResult` |
| `maxBorrow()` | — | `MaxBorrowResult` |
| `healthFactor()` | — | `HealthFactorResult` |

### Swap

| Method | Params | Returns |
|--------|--------|---------|
| `swap()` | `{ from, to, amount, byAmountIn?, slippage? }` | `SwapResult` |

### Liquid Staking (VOLO)

| Method | Params | Returns |
|--------|--------|---------|
| `stakeVSui()` | `{ amount }` | `StakeVSuiResult` |
| `unstakeVSui()` | `{ amount: number \| 'all' }` | `UnstakeVSuiResult` |

### Info

| Method | Params | Returns |
|--------|--------|---------|
| `rates()` | — | `RatesResult` |
| `allRatesAcrossAssets()` | — | `Array<{ protocol, asset, rates }>` |
| `positions()` | — | `PositionsResult` |
| `earnings()` | — | `EarningsResult` |
| `fundStatus()` | — | `FundStatusResult` |

### Safeguards

| Method | Description |
|--------|-------------|
| `agent.enforcer.getConfig()` | Returns current `SafeguardConfig` |
| `agent.enforcer.isConfigured()` | `true` if any limit is non-zero |
| `agent.enforcer.set(key, value)` | Set `maxPerTx`, `maxDailySend`, or `locked` |
| `agent.enforcer.lock()` | Freeze all operations |
| `agent.enforcer.unlock()` | Resume operations |
| `agent.enforcer.check(metadata)` | Validate a `TxMetadata` against rules |
| `agent.enforcer.recordUsage(amount)` | Record outbound USDC for daily tracking |

### Getters

| Getter | Returns |
|--------|---------|
| `agent.suiClient` | `SuiJsonRpcClient` |
| `agent.signer` | `Ed25519Keypair` |
| `agent.enforcer` | `SafeguardEnforcer` |

### Events

| Event | Description |
|-------|-------------|
| `yield` | Yield earned notification |
| `balanceChange` | Balance changed |
| `healthWarning` | HF dropping, attention recommended |
| `healthCritical` | HF dangerous, action required |
| `error` | SDK error |

---

## SDK Types (key interfaces)

```typescript
interface T2000Options {
  pin?: string;           // PIN to decrypt key file
  keyPath?: string;       // Path to key file (default: ~/.t2000/wallet.key)
  rpcUrl?: string;        // Custom Sui RPC URL
  passphrase?: string;    // @deprecated — use pin
  network?: 'mainnet' | 'testnet';
}

interface BalanceResponse {
  available: number;
  stables: Record<string, number>;  // Per-stablecoin breakdown
  savings: number;
  gasReserve: { sui: number; usdEquiv: number };  // GasReserve
  total: number;
}

interface SendResult {
  success: boolean;
  tx: string;
  amount: number;
  to: string;
  gasCost: number;
  gasCostUnit: string;
  balance: BalanceResponse;
}

interface SaveResult {
  success: boolean; tx: string; amount: number;
  apy: number; fee: number; gasCost: number;
  savingsBalance: number;
}

interface WithdrawResult {
  success: boolean; tx: string; amount: number;
  gasCost: number;
}

interface BorrowResult {
  success: boolean; tx: string; amount: number;
  fee: number; healthFactor: number;
  gasCost: number;
}

interface RepayResult {
  success: boolean; tx: string; amount: number;
  remainingDebt: number; gasCost: number;
}

interface SwapResult {
  success: boolean; tx: string;
  fromToken: string; toToken: string;
  fromAmount: number; toAmount: number;
  priceImpact: number; route: string;
  gasCost: number;
}

interface StakeVSuiResult {
  success: boolean; tx: string;
  amountSui: number; vSuiReceived: number;
  apy: number; gasCost: number;
}

interface UnstakeVSuiResult {
  success: boolean; tx: string;
  vSuiAmount: number; suiReceived: number;
  gasCost: number;
}

interface PaymentRequest {
  address: string;
  network: string;
  amount: number | null;
  currency: string;
  memo: string | null;
  label: string | null;
  qrUri: string;
  displayText: string;
}
```

Source: `packages/sdk/src/types.ts`

---

## Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `INSUFFICIENT_BALANCE` | Not enough USDC | No |
| `INSUFFICIENT_GAS` | Not enough SUI for gas | Yes |
| `INVALID_ADDRESS` | Bad Sui address | No |
| `INVALID_AMOUNT` | Amount <= 0 or NaN | No |
| `INVALID_ASSET` | Save called with a non-USDC asset (borrow is USDC-only by API) | No |
| `WALLET_NOT_FOUND` | No key file at path | No |
| `WALLET_LOCKED` | Wrong PIN | No |
| `WALLET_EXISTS` | Key already exists at path | No |
| `SIMULATION_FAILED` | Dry-run failed | No |
| `TRANSACTION_FAILED` | On-chain execution failed | No |
| `HEALTH_FACTOR_TOO_LOW` | Borrow would risk liquidation | No |
| `WITHDRAW_WOULD_LIQUIDATE` | Withdraw would drop HF below safe | No |
| `NO_COLLATERAL` | No savings to borrow against | No |
| `PROTOCOL_PAUSED` | t2000 contract paused | No |
| `PROTOCOL_UNAVAILABLE` | NAVI unavailable | Yes |
| `RPC_ERROR` | Sui RPC error | Yes |
| `RPC_UNREACHABLE` | Sui RPC unreachable | Yes |
| `PRICE_EXCEEDS_LIMIT` | MPP price > maxPrice | No |
| `UNSUPPORTED_NETWORK` | MPP server not on Sui | No |
| `PAYMENT_EXPIRED` | MPP payment window expired | Yes |
| `DUPLICATE_PAYMENT` | MPP nonce already used | No |
| `FACILITATOR_REJECTION` | Facilitator rejected payment | No |
| `FACILITATOR_TIMEOUT` | Facilitator timed out | Yes |
| `SWAP_NO_ROUTE` | No swap route found (insufficient liquidity or unsupported pair) | No |
| `SWAP_FAILED` | Swap execution or routing error | Yes |
| `SAFEGUARD_BLOCKED` | Safeguard rule violated (locked, maxPerTx, maxDailySend) | No |
| `UNKNOWN` | Unclassified error | Yes |

Source: `packages/sdk/src/errors.ts`

---

## Move Contract Abort Codes

| Code | Meaning |
|------|---------|
| 1 | Protocol is temporarily paused (`EPAUSED`) |
| 2 | Amount must be greater than zero (`EZERO_AMOUNT`) |
| 3 | Invalid operation type (`EINVALID_OPERATION`) |
| 4 | Fee rate exceeds maximum (`EFEE_RATE_TOO_HIGH`) |
| 5 | Insufficient treasury balance (`EINSUFFICIENT_TREASURY`) |
| 6 | Not authorized (`ENOT_AUTHORIZED`) |
| 7 | Package version mismatch (`EVERSION_MISMATCH`) |
| 8 | Timelock is active (`ETIMELOCK_ACTIVE`) |
| 9 | No pending change to execute (`ENO_PENDING_CHANGE`) |
| 10 | Already at current version (`EALREADY_MIGRATED`) |
| 1503 | Invalid withdrawal amount (zero or dust balance) |

Source: `packages/sdk/src/errors.ts` → `mapMoveAbortCode()`, `packages/contracts/sources/errors.move`

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIST_PER_SUI` | `1_000_000_000n` | SUI base units per SUI |
| `SUI_DECIMALS` | `9` | |
| `USDC_DECIMALS` | `6` | |
| `BPS_DENOMINATOR` | `10_000n` | Basis points denominator |
| `PRECISION` | `1_000_000_000_000_000_000n` (10^18) | Reward math precision (matches contract) |
| `MIN_DEPOSIT` | `1_000_000n` (1 USDC) | Minimum deposit |
| `CLOCK_ID` | `'0x6'` | Sui Clock shared object |
| `STABLE_ASSETS` | `['USDC']` | Stablecoins used for balance breakdown / stable-specific logic |
| `DEFAULT_RATE_LIMIT` | `10 req/s` | Default HTTP API rate limit (CLI `--rate-limit` default) |

Source: `packages/sdk/src/constants.ts` (core constants), `packages/cli/src/commands/*.ts` (CLI defaults)

---

## Contract Object IDs (Mainnet)

### t2000 Protocol

| Object | ID |
|--------|----|
| Package | `0xd775fcc66eae26797654d435d751dea56b82eeb999de51fd285348e573b968ad` |
| Config | `0x08ba26f0d260b5edf6a19c71492b3eb914906a7419baf2df1426765157e5862a` |
| Treasury (USDC) | `0xf420ec0dcad44433042fb56e1413fb88d3ff65be94fcf425ef9ff750164590e8` |

> **Note:** AdminCap and UpgradeCap IDs are intentionally omitted — stored in `.env.local` only. The IDs above are the canonical mainnet IDs in use today; they are mirrored in `packages/sdk/src/constants.ts` (`T2000_PACKAGE_ID`, `T2000_CONFIG_ID`, `T2000_TREASURY_ID`) and `infra/server-task-definition.json`. An earlier abandoned package (`0xab92e9f1...`) and its associated Config / Treasury are no longer referenced by any code path.
> **Contract Version:** 1 (set in `packages/contracts/sources/constants.move`). Source and the active on-chain Config + Treasury are all at v1. The next package upgrade — when there's a real reason to ship one — should bump `VERSION` and call `migrate_config` + `migrate_treasury` with AdminCap so the new package's `assert_version` rejects calls into the previous binary.

### Treasury Functions (v2)

| Function | Description |
|----------|-------------|
| `collect_fee<T>()` | Called in PTB — splits fee from `&mut Coin<T>` into `Balance<T>` |
| `receive_coins<T>()` | Admin recovery of coins sent via `transferObjects` (object-owned) |
| `withdraw_fees<T>()` | Admin withdraw from treasury balance (requires AdminCap) |
| `migrate_treasury<T>()` | Version bump guard — call after package upgrade (requires AdminCap) |

### MPP Payments (Sui Payment Kit)

| Object | ID |
|--------|----|
| Package | `0xbc126f1535fba7d641cb9150ad9eae93b104972586ba20f3c60bfe0e53b69bc6` |
| Payment Registry | `0x4009dd17305ed1b33352b808e9d0e9eb94d09085b2d5ec0f395c5cdfa2271291` |

MPP uses peer-to-peer verification via mppx; no facilitator URL or verify/settle endpoints.

---

## Infrastructure

| Component | URL / Location |
|-----------|---------------|
| Website | `https://t2000.ai` (Vercel) |
| Docs | `https://t2000.ai/docs` |
| API | `https://api.t2000.ai` (ECS Fargate, ALB) |
| npm (SDK) | `https://www.npmjs.com/package/@t2000/sdk` |
| npm (CLI) | `https://www.npmjs.com/package/@t2000/cli` |
| npm (MPP) | `https://www.npmjs.com/package/@suimpp/mpp` |
| GitHub | `https://github.com/mission69b/t2000` |
| Network | Sui mainnet |

---

## Gas

Every transaction is self-funded by the agent's wallet. Throws `INSUFFICIENT_GAS` if SUI balance is too low — top up via Mercuryo (https://exchange.mercuryo.io/?widget_id=89960d1a-8db7-49e5-8823-4c5e01c1cea2) or any Sui exchange.

> **Audric web app exception:** Audric web users transact under Enoki gas sponsorship (zkLogin), so `INSUFFICIENT_GAS` does not surface there. The SDK itself is sponsorship-agnostic — sponsorship is wired in at the host layer (Audric web), not inside `@t2000/sdk`.

---

## MPP Payments

| Fact | Value |
|------|-------|
| Package | `@suimpp/mpp` |
| SDK method | `agent.pay()` |
| CLI command | `t2000 pay <url>` |
| MCP tool | `t2000_pay` |
| Flow | request → 402 → mppx pays via Sui USDC → credential → retry → response |
| Replay protection | On-chain nonce via Sui Payment Kit |

---

## Engine (Audric)

| Fact | Value |
|------|-------|
| Package | `@t2000/engine` |
| Version | `0.54.1` |
| Description | Agent engine for conversational finance — implements Audric Intelligence (the moat) |
| Entry point | `@t2000/engine` (ESM only) |
| Build | tsup → ESM bundle |
| Test framework | Vitest |
| Test count | 250 |
| Total tools | **34** (23 reads + 11 writes) — see breakdown below |

### Engine Public Exports

| Export | Type | Purpose |
|--------|------|---------|
| `QueryEngine` | class | Stateful conversation loop with tool dispatch, thinking, guards |
| `validateHistory` | function | Pre-flight message history validation |
| `AnthropicProvider` | class | Streaming LLM provider (Anthropic Claude, extended thinking) |
| `buildTool` | function | Typed tool factory with Zod + JSON schema |
| `runTools` | function | Parallel reads / serial writes orchestration |
| `TxMutex` | class | Transaction serialization lock |
| `CostTracker` | class | Token usage + USD cost tracking |
| `MemorySessionStore` | class | In-memory session store with TTL |
| `McpClientManager` | class | Multi-server MCP client with caching |
| `McpResponseCache` | class | Client-side TTL cache for MCP responses |
| `adaptMcpTool` | function | Convert MCP tool → engine Tool |
| `buildMcpTools` | function | Convert engine tools → MCP descriptors |
| `registerEngineTools` | function | Register engine tools on MCP server |
| `serializeSSE` / `parseSSE` | function | SSE wire format |
| `engineToSSE` | function | Adapt QueryEngine → SSE stream |
| `estimateTokens` | function | Rough token estimation |
| `compactMessages` | function | Context window compaction (ContextBudget) |
| `fetchTokenPrices` | function | Batch USD prices from BlockVision Indexer REST (Sui-RPC + hardcoded-stable degraded fallback) |
| `fetchAddressPortfolio` | function | Wallet coins + balances + USD prices + totals from BlockVision (single round-trip) |
| `clearPortfolioCache` / `clearPortfolioCacheFor` / `clearPriceMapCache` | function | Reset BlockVision portfolio + price caches |
| `getDefaultTools` | function | All 34 built-in tools (23 read, 11 write) |
| `DEFAULT_SYSTEM_PROMPT` | string | Audric system prompt |
| `classifyEffort` | function | Adaptive thinking effort classifier |
| `ContextBudget` | class | Context window budget tracking + compaction trigger |
| `RecipeRegistry` | class | YAML skill recipe loader + longest-trigger matching |
| `runGuards` | function | Pre/post-execution guard runner (14 guards across 3 tiers) |
| `applyToolFlags` | function | Apply `ToolFlags` to tool definitions |
| `buildProfileContext` | function | User financial profile → prompt context |
| `buildMemoryContext` | function | Episodic user memory → prompt context |

### Reasoning Engine (Phase 1-3 — Shipped)

| Feature | Module | Description |
|---------|--------|-------------|
| Adaptive thinking | `classify-effort.ts` | Routes queries to `low`/`medium`/`high` thinking effort based on financial complexity |
| Prompt caching | `engine.ts` | System prompt + tool definitions cached across turns (Anthropic cache_control) |
| Guard runner | `guards.ts` | 14 guards across 3 priority tiers (Safety > Financial > UX): 12 pre-execution (`input_validation`, `retry_protection`, `address_source`, `asset_intent`, `address_scope`, `swap_preview`, `irreversibility`, `balance_validation`, `health_factor`, `large_transfer`, `slippage`, `cost_warning`) + 2 post-execution hints (`artifact_preview`, `stale_data`) |
| Tool flags | `tool-flags.ts` | `ToolFlags` interface (mutating, requiresBalance, affectsHealth, irreversible, producesArtifact, costAware, maxRetries) on all tools |
| Preflight validation | `preflight` on Tool | Input validation gate on `send_transfer`, `swap_execute`, `pay_api`, `borrow`, `save_deposit` |
| Skill recipes | `recipes/registry.ts` | YAML recipe loader, `RecipeRegistry` with longest-trigger-match-wins, `toPromptContext()` |
| Context compaction | `context.ts` | `ContextBudget` (200k limit, 85% compact, 70% warn), LLM summarizer + truncation fallback |

Extended thinking is **always on** for Sonnet/Opus (adaptive mode). `ENABLE_THINKING` env flag removed in Audric 2.0 Phase A.

### Recent Harness Upgrades — Spec 1 + Spec 2

Two correctness/intelligence upgrades shipped on top of the 5-system base. Both are "structural" — they change the contract between the engine and the host (audric/web).

| Spec | Versions | What it added | Cross-repo contract |
|------|----------|---------------|---------------------|
| **Spec 1 — Correctness** | engine `0.41.0` → `0.50.3` | Per-yield `attemptId` UUID v4 stamped on every `pending_action` (stable join key from action → on-chain receipt → `TurnMetrics(sessionId, turnIndex)` row). `modifiableFields` registry — fields the user can edit on a confirm card without losing the LLM's reasoning (resume route applies `modifications` so conversation history reflects what was approved on-chain). `EngineConfig.onAutoExecuted({ toolName, input, result, walletAddress, sessionId, turnIndex })` hook so `auto`-permission writes participate in the same telemetry as confirm-gated ones (currently no `auto` writes in Audric, but the hook is wired). | `t2000/.cursor/rules/agent-harness-spec.mdc` + `audric/.cursor/rules/audric-transaction-flow.mdc` + `audric/.cursor/rules/write-tool-pending-action.mdc` |
| **Spec 2 — Intelligence** | engine `0.47.0` → `0.54.1` | BlockVision swap — replaced 7 `defillama_*` tools (`token_prices`, `price_change`, `yield_pools`, `protocol_info`, `chain_tvl`, `protocol_fees`, `sui_protocols`) with one BlockVision-backed `token_prices` tool. `balance_check` + `portfolio_analysis` rewired to BlockVision Indexer REST (single round-trip wallet portfolio + USD prices). Sticky-positive cache + retry/circuit breaker (`fetchBlockVisionWithRetry`, `_resetBlockVisionCircuitBreaker`) for graceful 429 handling. `<financial_context>` boot-time orientation block injected at every engine boot from the daily 02:00 UTC `UserFinancialContext` snapshot — every chat starts oriented, no warm-up tool calls (Silent Profile system). `attemptId`-keyed resume — `/api/engine/resume updateMany({ where: { sessionId, attemptId } })` so two pending actions in the same turn never clobber each other's `pendingActionOutcome`. `protocol_deep_dive` retained on DefiLlama as the lone exception. Net tool count: 29 → 23 reads, 40 → 34 total. | `t2000/.cursor/rules/blockvision-resilience.mdc` + `audric/.cursor/rules/audric-canonical-portfolio.mdc` + `audric/.cursor/rules/engine-context-assembly.mdc` |

> Local-only specs (private working documents): `AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.3.md`, `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`. Both are gitignored — the cross-repo `.cursor/rules/*.mdc` files are the public contract.

### Engine Tool Names

| Read Tools (23) | Write Tools (11) |
|-----------|------------|
| `render_canvas` | `save_deposit` |
| `balance_check` | `withdraw` |
| `savings_info` | `send_transfer` |
| `health_check` | `borrow` |
| `rates_info` | `repay_debt` |
| `transaction_history` | `claim_rewards` |
| `swap_quote` | `pay_api` |
| `volo_stats` | `swap_execute` |
| `mpp_services` | `volo_stake` |
| `web_search` | `volo_unstake` |
| `explain_tx` | `save_contact` |
| `portfolio_analysis` | |
| `protocol_deep_dive` | |
| `token_prices` | |
| `create_payment_link` | |
| `list_payment_links` | |
| `cancel_payment_link` | |
| `create_invoice` | |
| `list_invoices` | |
| `cancel_invoice` | |
| `spending_analytics` | |
| `yield_summary` | |
| `activity_summary` | |

> **Removed in the April 2026 simplification (S.7):** `allowance_status`, `toggle_allowance`, `update_daily_limit`, `update_permissions`, `create_schedule`, `list_schedules`, `cancel_schedule`, `pattern_status`, `pause_pattern` — 9 tools deleted. Allowance contract is dormant; scheduled actions can't sign without user presence under zkLogin; pattern detectors stay as silent classifiers (not user-facing proposals). See the S.0–S.12 entries in `audric-build-tracker.md`.
>
> **Removed in v1.4 BlockVision swap (April 2026):** 7 `defillama_*` tools — `defillama_token_prices`, `defillama_price_change`, `defillama_yield_pools`, `defillama_protocol_info`, `defillama_chain_tvl`, `defillama_protocol_fees`, `defillama_sui_protocols`. Replaced by 1 `token_prices` tool (BlockVision-backed). `balance_check` and `portfolio_analysis` rewired to BlockVision Indexer REST. `protocol_deep_dive` is the lone surviving DefiLlama consumer. Net: 29 → 23 reads, 40 → 34 total. See `AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`.
>
> `record_advice` lives in `audric/apps/web/lib/engine/advice-tool.ts` (audric-side tool that writes `AdviceLog` rows; not exported from `@t2000/engine`).

### Engine Event Types

`text_delta`, `thinking_delta`, `thinking_done`, `tool_start`, `tool_result`, `pending_action`, `canvas`, `compaction`, `turn_complete`, `usage`, `error`

> v0.41.0 additions: `compaction` event (emitted after the context budget triggers a compaction so hosts can record `TurnMetrics.compactionFired`), plus per-event flags `tool_result.wasEarlyDispatched` and `tool_result.resultDeduped` so hosts can attribute zero-cost tool results back to the early dispatcher / microcompact.

### Engine Permission Levels

| Level | Behavior |
|-------|----------|
| `auto` | Executes without user approval |
| `confirm` | Yields `pending_action`, client executes and resumes via `resumeWithToolResult` |
| `explicit` | Manual-only — not dispatched by LLM |

### Pending Action (engine 0.41.0)

`pending_action` events now stamp two extra fields on the action payload so hosts can wire the modification protocol and per-turn analytics:

| Field | Type | Purpose |
|-------|------|---------|
| `turnIndex` | `number` | Index of the originating assistant turn (derived from `messages.filter(m => m.role === 'assistant').length`). Hosts use this to update the matching `TurnMetrics` row when the user resolves the action. |
| `modifiableFields` | `PendingActionModifiableField[]` | Editable input fields registered for the tool (e.g. `{ name: 'amount', kind: 'amount', asset: 'USDC' }`). Sourced from `TOOL_MODIFIABLE_FIELDS` in `packages/engine/src/tools/tool-modifiable-fields.ts`. Empty / absent for non-write tools. |

---

## MCP Server (AI Integration)

| Fact | Value |
|------|-------|
| Package | `@t2000/mcp` |
| Version | `0.54.1` |
| Tool count | 29 — read-only `t2000_*` namespaced subset of the engine (verified by `packages/mcp/src/integration.test.ts` `toHaveLength(29)`) |
| Description | MCP-first financial tools for AI agents. Non-custodial. Part of the t2000 infrastructure behind Audric. |
| Transport | stdio |
| Safeguard enforced | Yes — all tool calls pass through `SafeguardEnforcer` before execution |
| Setup | `t2000 init` (guided wizard — wallet + MCP + safeguards in one command) |
| MCP auto-configured during init | Yes — Step 2 of init wizard auto-writes configs for Claude Desktop, Cursor, Windsurf |
| Standalone MCP install | `t2000 mcp install` (for reconfiguring or adding platforms after init) |
| Manual config | `{ "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }` |
| Remove | `t2000 mcp uninstall` |
| Start server | `t2000 mcp` (stdio transport, used by AI platforms) |
