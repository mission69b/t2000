# PRODUCT_FACTS.md — Single Source of Truth

> **Every README, docs page, skill file, and marketing material MUST match this file.**
> When a product fact changes, update this file FIRST, then propagate.
>
> For CLI output formatting (primitives, precision, header styles, exact output per command), see **`CLI_UX_SPEC.md`**.
>
> Source: derived from actual source code in `packages/*/src/`.
> Last verified: 2026-03-12

---

## Version

| Package | Version |
|---------|---------|
| `@t2000/sdk` | `0.19.0` |
| `@t2000/cli` | `0.21.0` |
| `@t2000/mpp-sui` | `0.1.0` |
| `@t2000/mcp` | `0.21.0` |
| Agent Skills | `3.0` |

---

## Agent Skills

| Fact | Value |
|------|-------|
| Install command | `npx skills add mission69b/t2000-skills` |
| Repo | `https://github.com/mission69b/t2000-skills` |
| Skill count | 14 |
| Skills | `t2000-check-balance`, `t2000-send`, `t2000-save`, `t2000-withdraw`, `t2000-exchange`, `t2000-borrow`, `t2000-repay`, `t2000-pay`, `t2000-sentinel`, `t2000-rebalance`, `t2000-safeguards`, `t2000-mcp`, `t2000-contacts`, `t2000-invest` |
| Supported platforms | Claude Code, Cursor, Codex, Copilot, Amp, Cline, Gemini CLI, VS Code, + more |
| Source (monorepo) | `t2000-skills/` — auto-synced to standalone repo via GitHub Action |

---

## Fees

| Operation | BPS | Rate | Notes |
|-----------|-----|------|-------|
| Save | 10 | 0.1% | Protocol fee on deposit |
| Borrow | 5 | 0.05% | Protocol fee on loan |
| Swap | 0 | **Free** | Only standard Cetus pool fees apply; swap is used internally by rebalance, auto-convert, and auto-swap |
| Withdraw | — | Free | |
| Repay | — | Free | |
| Send | — | Free | |
| Pay (MPP) | — | Free | Agent pays the API price, no t2000 surcharge |

Source: `packages/sdk/src/constants.ts` → `SAVE_FEE_BPS`, `SWAP_FEE_BPS`, `BORROW_FEE_BPS`

Fees are collected on-chain via `t2000::treasury::collect_fee()` within the same PTB as the operation. The Move function takes `&mut Coin<T>` and splits the fee into the Treasury's internal `Balance<T>`. Swap is exempt (0 BPS) — Cetus pool fees apply separately.

---

## Architecture

### Programmable Transaction Blocks (PTBs)

All multi-step operations use single atomic PTBs. This means withdraw+swap+deposit (rebalance), save with auto-convert, withdraw with auto-swap, and repay with auto-swap all execute in one on-chain transaction. If any step fails, the entire transaction reverts — no funds left in intermediate states.

| Operation | PTB Composition |
|-----------|----------------|
| Save (with non-USDC wallet stables) | Merge wallet stables → swap to USDC → collect fee → deposit — single PTB |
| Withdraw (non-USDC position) | Withdraw from protocol → swap to USDC → transfer — single PTB |
| Repay (non-USDC debt) | Split USDC → swap to borrowed asset → repay — single PTB |
| Rebalance | Withdraw from source → swap (if cross-asset) → deposit to target — single PTB |
| Withdraw all | Withdraw all positions → swap non-USDC → merge → transfer — single PTB |

### Auto-Convert (Save)

`save all` or `save <amount>` when wallet USDC is insufficient automatically converts non-USDC stablecoins (suiUSDT, suiUSDe, USDsui) to USDC within the same PTB before depositing.

### Auto-Swap (Withdraw / Repay)

- **Withdraw:** Non-USDC positions are automatically swapped back to USDC within the same PTB.
- **Repay:** When debt is in a non-USDC asset, USDC is automatically swapped to the borrowed asset within the same PTB.

### Dust Filtering

Positions with value ≤ $0.005 are filtered out of `positions()` display to avoid showing near-zero remnants from rounding.

### Composable Adapter Methods

Protocol adapters expose composable PTB methods alongside standalone transaction builders:

| Method | Description |
|--------|-------------|
| `addWithdrawToTx(tx, ...)` | Adds withdraw commands to existing PTB, returns `TransactionObjectArgument` |
| `addSaveToTx(tx, ...)` | Adds deposit commands, accepts coin as `TransactionObjectArgument` |
| `addRepayToTx(tx, ...)` | Adds repay commands, accepts coin as `TransactionObjectArgument` |
| `addSwapToTx(tx, ...)` | Adds swap commands, accepts/returns `TransactionObjectArgument` |

Source: `packages/sdk/src/adapters/types.ts`, `packages/sdk/src/t2000.ts`

---

## Protocol Adapters

t2000 uses a pluggable adapter architecture for DeFi protocol integrations.

| Adapter | Type | Capabilities | Status |
|---------|------|-------------|--------|
| NAVI (`navi`) | Lending | save, withdraw, borrow, repay; SUI, ETH, GOLD (invest earn); claim rewards | Built-in |
| Cetus (`cetus`) | Swap | swap, reward-token-to-USDC conversion | Built-in |
| Suilend (`suilend`) | Lending | save, withdraw, borrow, repay; SUI, ETH, BTC, GOLD (invest earn); claim rewards | Built-in |

- `LendingAdapter` interface: save, withdraw, borrow, repay, getRates, getPositions, getHealth, getPendingRewards, addClaimRewardsToTx
- `SwapAdapter` interface: swap, getQuote, getSupportedPairs, getPoolPrice
- `ProtocolRegistry` auto-selects best rates/quotes across registered adapters
- CLI `--protocol <name>` flag on save/withdraw/borrow/repay to pin a specific protocol
- Third-party adapters can be registered via `agent.registerAdapter(new MyAdapter())`

Source: `packages/sdk/src/adapters/` — types.ts, registry.ts, navi.ts, cetus.ts, suilend.ts

---

## Supported Assets

User-facing commands are denominated in **USDC** — the user always thinks in USDC.
Internally, save auto-converts non-USDC wallet stablecoins to USDC, withdraw
auto-swaps non-USDC positions back to USDC, and repay auto-swaps USDC to the
borrowed asset if debt is in a non-USDC stablecoin (from rebalance).
Rebalance optimizes across all stablecoins internally.

| Symbol | Display | Decimals | Send | Save | Borrow | Withdraw | Swap | Rebalance |
|--------|---------|----------|------|------|--------|----------|-----------------|-----------|
| USDC | USDC | 6 | ✅ | ✅ | ✅ | ✅ (always returns USDC) | ✅ | ✅ |
| USDT | suiUSDT | 6 | — | — (via rebalance) | — | — | ✅ | ✅ |
| USDe | suiUSDe | 6 | — | — (via rebalance) | — | — | ✅ | ✅ |
| USDsui | USDsui | 6 | — | — (via rebalance) | — | — | ✅ | ✅ |
| SUI | SUI | 9 | ✅ (gas) | — | — | — | ✅ | — |
| BTC | Bitcoin | 8 | — | — | — | — | ✅ (buy/sell) | — |
| ETH | Ethereum | 8 | — | — | — | — | ✅ (buy/sell) | — |
| GOLD | Gold | 9 | — | — | — | — | ✅ (buy/sell) | — |

**Coin Types (investment assets):**

| Symbol | Coin Type |
|--------|-----------|
| BTC | `0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC` |
| ETH | `0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH` |
| GOLD | `0x9d297676e7a4b771ab023291377b2adfaa4938fb9080b8d12430e4b108b836a9::xaum::XAUM` |

**Format utility:** `formatAssetAmount(asset, rawAmount)` returns human-readable display with asset-appropriate decimals: 8 for BTC (e.g. `0.00123456`), 8 for ETH (e.g. `0.12345678`), 9 for SUI, 9 for GOLD, 6 for stablecoins. Exported from `@t2000/sdk`.

Source: `packages/sdk/src/constants.ts` → `SUPPORTED_ASSETS`, `packages/sdk/src/utils/format.ts` → `formatAssetAmount()`

---

## CLI Commands

### Syntax (exact signatures from Commander.js)

| Command | Syntax | Notes |
|---------|--------|-------|
| init | `t2000 init` | Options: `--name <name>`, `--no-sponsor` |
| balance | `t2000 balance` | Options: `--show-limits` |
| send | `t2000 send <amount> <asset> [to] <address>` | `to` keyword is optional |
| save | `t2000 save <amount>` | Deposits USDC (auto-converts non-USDC stables). Alias: `supply`. `amount` accepts `all`. |
| withdraw | `t2000 withdraw <amount>` | Always returns USDC (auto-swaps non-USDC positions). `amount` accepts `all` |
| borrow | `t2000 borrow <amount>` | USDC only |
| repay | `t2000 repay <amount>` | Pays with USDC (auto-swaps to borrowed asset if non-USDC debt). `amount` accepts `all` |
| pay | `t2000 pay <url>` | Options: `--method`, `--data`, `--header`, `--max-price`, `--timeout`, `--dry-run` |
| history | `t2000 history` | Options: `--limit <n>` (default: 20) |
| earnings | `t2000 earnings` | |
| fund-status | `t2000 fund-status` | |
| health | `t2000 health` | |
| rates | `t2000 rates` | |
| positions | `t2000 positions` | |
| deposit | `t2000 deposit` | Shows funding instructions |
| address | `t2000 address` | |
| serve | `t2000 serve` | Options: `--port` (default: 3001), `--rate-limit` (default: 10) |
| config get | `t2000 config get [key]` | Omit key for all |
| config set | `t2000 config set <key> <value>` | |
| export | `t2000 export` | Options: `--yes` to skip confirmation |
| import | `t2000 import` | |
| lock | `t2000 lock` | Clear saved session |
| sentinel list | `t2000 sentinel list` | List active sentinels with prize pools |
| sentinel info | `t2000 sentinel info <id>` | Show details for a sentinel |
| sentinel attack | `t2000 sentinel attack <id> [prompt]` | Attack a sentinel (full 3-step flow). Options: `--fee <sui>` |
| rebalance | `t2000 rebalance` | Options: `--dry-run`, `--min-diff <pct>`, `--max-break-even <days>`, `--yes` |
| swap | `t2000 swap <amount> <from> <to>` | Swap tokens via Cetus DEX (e.g. USDC ⇌ SUI). Options: `--slippage <pct>` (default: 3%) |
| exchange | `t2000 exchange <amount> <from> <to>` | **Deprecated** — alias for `swap`. Use `t2000 swap` instead |
| contacts | `t2000 contacts` | List saved contacts |
| contacts add | `t2000 contacts add <name> <address>` | Save a named contact |
| contacts remove | `t2000 contacts remove <name>` | Remove a contact |
| buy | `t2000 buy <amount> <asset>` | Buy crypto asset with USD |
| sell | `t2000 sell <amount\|all> <asset>` | Sell crypto back to USDC (auto-withdraws if earning) |
| invest buy | `t2000 invest buy <amount> <asset>` | **Deprecated** — alias for `buy`. Use `t2000 buy` instead |
| invest sell | `t2000 invest sell <amount\|all> <asset>` | **Deprecated** — alias for `sell`. Use `t2000 sell` instead |
| invest earn | `t2000 invest earn <asset>` | Deposit invested asset into best-rate lending for yield |
| invest unearn | `t2000 invest unearn <asset>` | Withdraw from lending, keep in portfolio |
| invest rebalance | `t2000 invest rebalance` | Move earning positions to better-rate protocols |
| claim-rewards | `t2000 claim-rewards` | Claim protocol rewards and auto-convert to USDC |
| portfolio | `t2000 portfolio` | Show investment portfolio + P&L (APY column when earning, strategy grouping) |
| invest strategy list | `t2000 invest strategy list` | List available strategies with allocations (5 built-in) |
| invest strategy buy | `t2000 invest strategy buy <name> <amount>` | Buy into a strategy (single atomic PTB). Options: `--dry-run` |
| invest strategy sell | `t2000 invest strategy sell <name>` | Sell all positions in a strategy |
| invest strategy status | `t2000 invest strategy status <name>` | Show strategy positions, weights, drift |
| invest strategy rebalance | `t2000 invest strategy rebalance <name>` | Rebalance strategy to target weights |
| invest strategy create | `t2000 invest strategy create <name> --alloc "BTC:40,ETH:40,GOLD:20"` | Create custom strategy |
| invest strategy delete | `t2000 invest strategy delete <name>` | Delete custom strategy (no active positions) |
| invest auto setup | `t2000 invest auto setup <amount> <frequency> [strategy]` | Set up DCA schedule (daily/weekly/monthly) |
| invest auto status | `t2000 invest auto status` | Show auto-invest schedules |
| invest auto run | `t2000 invest auto run` | Execute pending DCA purchases |
| invest auto stop | `t2000 invest auto stop [id]` | Stop auto-invest schedule |

**Investment yield (v0.15.0):** SUI, ETH, BTC, and GOLD positions can earn lending APY via `invest earn`. `sell` auto-withdraws if earning. `balance` and `portfolio` show APY when earning. `rates` includes investment-asset lending rates. Borrow guard excludes investment collateral (SUI/ETH/BTC/GOLD) from borrowable collateral. Savings rebalance skips earning investment positions. `invest rebalance` moves earning positions to better-rate protocols (0.1% minimum APY difference). `claim-rewards` claims DeFi incentive rewards from all protocols and auto-converts to USDC in a single operation.
| earn | `t2000 earn` | Show all earning opportunities — savings yield + sentinel bounties |
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
  Investment: $250.00  (0.05 BTC, 1.2 ETH)  (earning 2.10% APY on SUI)  ← APY shown when position is earning
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
  Gas:  0.0042 SUI (self-funded)
  Balance:  $90.00 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
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
| `T2000.init()` | `(options: { pin: string; keyPath?: string; name?: string; sponsored?: boolean }): Promise<{ agent: T2000; address: string; sponsored: boolean }>` | Create new wallet |
| `T2000.fromPrivateKey()` | `(privateKey: string, options?: { rpcUrl?: string }): T2000` | From raw key |

### Wallet

| Method | Params | Returns |
|--------|--------|---------|
| `balance()` | — | `BalanceResponse` |
| `send()` | `{ to, amount, asset? }` | `SendResult` |
| `history()` | `{ limit? }` | `TransactionRecord[]` |
| `address()` | — (sync) | `string` |
| `deposit()` | — | `DepositInfo` |

### Savings

| Method | Params | Returns |
|--------|--------|---------|
| `save()` | `{ amount: number \| 'all' }` | `SaveResult` |
| `withdraw()` | `{ amount: number \| 'all' }` | `WithdrawResult` |
| `maxWithdraw()` | — | `MaxWithdrawResult` |

### Credit

| Method | Params | Returns |
|--------|--------|---------|
| `borrow()` | `{ amount }` | `BorrowResult` |
| `repay()` | `{ amount: number \| 'all' }` | `RepayResult` |
| `maxBorrow()` | — | `MaxBorrowResult` |
| `healthFactor()` | — | `HealthFactorResult` |

### Info

| Method | Params | Returns |
|--------|--------|---------|
| `rates()` | — | `RatesResult` |
| `allRatesAcrossAssets()` | — | `Array<{ protocol, asset, rates }>` |
| `positions()` | — | `PositionsResult` |
| `earnings()` | — | `EarningsResult` |
| `fundStatus()` | — | `FundStatusResult` |
| `rebalance()` | `{ dryRun?, minYieldDiff?, maxBreakEven? }` | `RebalanceResult` |
| `exchange()` | `{ from, to, amount, maxSlippage? }` | `SwapResult` — CLI: `t2000 swap` (alias: `exchange`) |
| `exchangeQuote()` | `{ from, to, amount }` | `{ expectedOutput, priceImpact, poolPrice, fee }` |
| `investBuy()` | `{ asset, usdAmount, maxSlippage? }` | `InvestBuyResult` — CLI: `t2000 buy` (alias: `invest buy`) |
| `investSell()` | `{ asset, usdAmount \| 'all', maxSlippage? }` | `InvestSellResult` — CLI: `t2000 sell` (alias: `invest sell`) |
| `investEarn()` | `{ asset }` | `InvestEarnResult` |
| `investUnearn()` | `{ asset }` | `InvestUnearnResult` |
| `investRebalance()` | `{ dryRun?, minYieldDiff? }` | `InvestRebalanceResult` |
| `getPortfolio()` | — | `PortfolioResult` |
| `investStrategy()` | `{ strategy, usdAmount, maxSlippage?, dryRun? }` | `StrategyBuyResult` |
| `sellStrategy()` | `{ strategy, maxSlippage? }` | `StrategySellResult` |
| `rebalanceStrategy()` | `{ strategy, maxSlippage?, driftThreshold? }` | `StrategyRebalanceResult` |
| `getStrategyStatus()` | `{ strategy }` | `StrategyStatusResult` |
| `getStrategies()` | — | `StrategyDefinition[]` |
| `createStrategy()` | `{ name, allocations, description? }` | `StrategyDefinition` |
| `deleteStrategy()` | `{ name }` | `void` |
| `setupAutoInvest()` | `{ amount, frequency, strategy?, asset?, ... }` | `AutoInvestSchedule` |
| `getAutoInvestStatus()` | — | `AutoInvestStatus` |
| `runAutoInvest()` | — | `AutoInvestRunResult` |
| `stopAutoInvest()` | `{ id? }` | `void` |

### Sentinel

| Method | Params | Returns |
|--------|--------|---------|
| `sentinelList()` | — | `SentinelAgent[]` |
| `sentinelInfo()` | `id: string` | `SentinelAgent` |
| `sentinelAttack()` | `id: string, prompt: string, fee?: bigint` | `SentinelAttackResult` |

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
| `gasAutoTopUp` | Auto-topped up gas via USDC→SUI swap |
| `gasStationFallback` | Gas resolution fell back to sponsor |
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
  sponsored?: boolean;
  name?: string;
}

interface BalanceResponse {
  available: number;
  stables: Record<string, number>;  // Per-stablecoin breakdown
  savings: number;
  gasReserve: { sui: number; usdEquiv: number };  // GasReserve
  total: number;
  assets: Record<string, number>;
}

interface SendResult {
  success: boolean;
  tx: string;
  amount: number;
  to: string;
  gasCost: number;
  gasCostUnit: string;
  gasMethod: 'self-funded' | 'sponsored' | 'auto-topup';
  balance: BalanceResponse;
}

interface SaveResult {
  success: boolean; tx: string; amount: number;
  apy: number; fee: number; gasCost: number;
  gasMethod: GasMethod; savingsBalance: number;
}

interface WithdrawResult {
  success: boolean; tx: string; amount: number;
  gasCost: number; gasMethod: GasMethod;
}

interface BorrowResult {
  success: boolean; tx: string; amount: number;
  fee: number; healthFactor: number;
  gasCost: number; gasMethod: GasMethod;
}

interface RepayResult {
  success: boolean; tx: string; amount: number;
  remainingDebt: number; gasCost: number; gasMethod: GasMethod;
}

interface SwapResult {
  success: boolean; tx: string;
  fromAmount: number; fromAsset: string;
  toAmount: number; toAsset: string;
  priceImpact: number; fee: number;
  gasCost: number; gasMethod: GasMethod;
}

interface RebalanceStep {
  action: 'withdraw' | 'swap' | 'deposit';
  protocol?: string;
  fromAsset?: string; toAsset?: string;
  amount: number; estimatedOutput?: number;
}

interface RebalanceResult {
  executed: boolean;
  steps: RebalanceStep[];
  fromProtocol: string; fromAsset: string;
  toProtocol: string; toAsset: string;
  amount: number; currentApy: number; newApy: number;
  annualGain: number; estimatedSwapCost: number;
  breakEvenDays: number;
  txDigests: string[]; totalGasCost: number;
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
| `WALLET_NOT_FOUND` | No key file at path | No |
| `WALLET_LOCKED` | Wrong PIN | No |
| `WALLET_EXISTS` | Key already exists at path | No |
| `SPONSOR_FAILED` | Sponsorship request failed | Yes |
| `SPONSOR_RATE_LIMITED` | Too many sponsor requests | Yes |
| `SPONSOR_UNAVAILABLE` | Sponsor service down | Yes |
| `GAS_STATION_UNAVAILABLE` | Gas station unreachable | Yes |
| `GAS_FEE_EXCEEDED` | Gas cost > $0.05 ceiling | No |
| `AUTO_TOPUP_FAILED` | USDC→SUI auto-swap failed | Yes |
| `SIMULATION_FAILED` | Dry-run failed | No |
| `TRANSACTION_FAILED` | On-chain execution failed | No |
| `ASSET_NOT_SUPPORTED` | Asset not in whitelist | No |
| `SLIPPAGE_EXCEEDED` | Price moved too much | Yes |
| `HEALTH_FACTOR_TOO_LOW` | Borrow would risk liquidation | No |
| `WITHDRAW_WOULD_LIQUIDATE` | Withdraw would drop HF below safe | No |
| `NO_COLLATERAL` | No savings to borrow against | No |
| `PROTOCOL_PAUSED` | t2000 contract paused | No |
| `PROTOCOL_UNAVAILABLE` | NAVI/Suilend/Cetus unavailable | Yes |
| `RPC_ERROR` | Sui RPC error | Yes |
| `RPC_UNREACHABLE` | Sui RPC unreachable | Yes |
| `PRICE_EXCEEDS_LIMIT` | MPP price > maxPrice | No |
| `UNSUPPORTED_NETWORK` | MPP server not on Sui | No |
| `PAYMENT_EXPIRED` | MPP payment window expired | Yes |
| `DUPLICATE_PAYMENT` | MPP nonce already used | No |
| `FACILITATOR_REJECTION` | Facilitator rejected payment | No |
| `FACILITATOR_TIMEOUT` | Facilitator timed out | Yes |
| `SENTINEL_API_ERROR` | Sentinel API request failed | Yes |
| `SENTINEL_NOT_FOUND` | Sentinel agent not found | No |
| `SENTINEL_TX_FAILED` | Sentinel transaction failed | No |
| `SENTINEL_TEE_ERROR` | TEE attestation/prompt error | Yes |
| `SAFEGUARD_BLOCKED` | Safeguard rule violated (locked, maxPerTx, maxDailySend) | No |
| `INVESTMENT_LOCKED` | Attempted to send/exchange invested assets | No |
| `INVEST_ALREADY_EARNING` | Asset is already earning via a protocol | No |
| `INVEST_NOT_EARNING` | Asset is not currently earning | No |
| `BORROW_GUARD_INVESTMENT` | Borrow blocked — investment collateral excluded | No |
| `STRATEGY_NOT_FOUND` | Strategy name doesn't exist | No |
| `STRATEGY_INVALID_ALLOCATIONS` | Allocations don't sum to 100, or contain non-investment assets | No |
| `STRATEGY_HAS_POSITIONS` | Cannot delete strategy with active positions | No |
| `STRATEGY_BUILTIN` | Cannot delete built-in strategy | No |
| `STRATEGY_MIN_AMOUNT` | Per-asset allocation < $1 | No |
| `AUTO_INVEST_NOT_FOUND` | Schedule ID doesn't exist | No |
| `AUTO_INVEST_INSUFFICIENT` | Insufficient balance for DCA run | No |
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
| 46001 | Swap failed — DEX pool rejected the trade (Cetus liquidity/routing issue) |

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
| `GAS_RESERVE_USDC` | `1_000_000n` ($1) | USDC reserved for gas on `save all` |
| `AUTO_TOPUP_THRESHOLD` | `50_000_000n` (0.05 SUI) | SUI balance below this triggers topup |
| `AUTO_TOPUP_AMOUNT` | `1_000_000n` ($1 USDC) | Amount swapped per topup |
| `AUTO_TOPUP_MIN_USDC` | `2_000_000n` ($2) | Min USDC required to trigger topup |
| `BOOTSTRAP_LIMIT` | `10` | Max sponsored bootstrap transactions |
| `GAS_FEE_CEILING_USD` | `$0.05` | Max gas fee before rejection |
| `CLOCK_ID` | `'0x6'` | Sui Clock shared object |
| `DEFAULT_SLIPPAGE` | `3%` | Default swap slippage (CLI `--slippage` default) |
| `DEFAULT_RATE_LIMIT` | `10 req/s` | Default HTTP API rate limit (CLI `--rate-limit` default) |

Source: `packages/sdk/src/constants.ts` (core constants), `packages/cli/src/commands/*.ts` (CLI defaults)

---

## Contract Object IDs (Mainnet)

### t2000 Protocol

| Object | ID |
|--------|----|
| Package | `0xab92e9f1fe549ad3d6a52924a73181b45791e76120b975138fac9ec9b75db9f3` |
| Config | `0x408add9aa9322f93cfd87523d8f603006eb8713894f4c460283c58a6888dae8a` |
| Treasury (USDC) | `0x3bb501b8300125dca59019247941a42af6b292a150ce3cfcce9449456be2ec91` |

> **Note:** AdminCap and UpgradeCap IDs are intentionally omitted — stored in `.env.local` only.
> **Contract Version:** 2 (set in `packages/contracts/sources/constants.move`). After publishing a new package, call `migrate_config` and `migrate_treasury` with AdminCap to activate version 2 and disable v1 calls.

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

### Sui Sentinel (Partner — Red Teaming)

| Object | ID |
|--------|----|
| Package | `0x88b83f36dafcd5f6dcdcf1d2cb5889b03f61264ab3cee9cae35db7aa940a21b7` |
| Agent Registry | `0xc47564f5f14c12b31e0dfa1a3dc99a6380a1edf8929c28cb0eaa3359c8db36ac` |
| Enclave | `0xfb1261aeb9583514cb1341a548a5ec12d1231bd96af22215f1792617a93e1213` |
| Protocol Config | `0x2fa4fa4a1dd0498612304635ff9334e1b922e78af325000e9d9c0e88adea459f` |

> Sentinel integration: SDK (`protocols/sentinel.ts`), CLI (`t2000 sentinel list|info|attack`), and `t2000-sentinel` skill.
> Docs: https://docs.suisentinel.xyz | App: https://app.suisentinel.xyz

---

## Infrastructure

| Component | URL / Location |
|-----------|---------------|
| Website | `https://t2000.ai` (Vercel) |
| Docs | `https://t2000.ai/docs` |
| API | `https://api.t2000.ai` (ECS Fargate, ALB) |
| npm (SDK) | `https://www.npmjs.com/package/@t2000/sdk` |
| npm (CLI) | `https://www.npmjs.com/package/@t2000/cli` |
| npm (MPP) | `https://www.npmjs.com/package/@t2000/mpp-sui` |
| GitHub | `https://github.com/mission69b/t2000` |
| Network | Sui mainnet |

---

## Gas Resolution Chain

1. **Self-funded** — agent has enough SUI
2. **Auto-topup** — SUI < 0.05 and USDC >= $2 → swap $1 USDC to SUI (swap itself is sponsored)
3. **Sponsored** — fallback for bootstrap (up to 10 txs)

---

## MPP Payments

| Fact | Value |
|------|-------|
| Package | `@t2000/mpp-sui` |
| SDK method | `agent.pay()` |
| CLI command | `t2000 pay <url>` |
| MCP tool | `t2000_pay` |
| Flow | request → 402 → mppx pays via Sui USDC → credential → retry → response |
| Replay protection | On-chain nonce via Sui Payment Kit |

---

## MCP Server (AI Integration)

| Fact | Value |
|------|-------|
| Package | `@t2000/mcp` |
| Version | `0.21.0` |
| Description | A bank account for AI agents — MCP-first integration for AI platforms. Non-custodial. |
| Transport | stdio |
| Tools | 23 |
| Prompts | 15 |
| Safeguard enforced | Yes — all tool calls pass through `SafeguardEnforcer` before execution |
| Setup | `t2000 init` (guided wizard — wallet + MCP + safeguards in one command) |
| MCP auto-configured during init | Yes — Step 2 of init wizard auto-writes configs for Claude Desktop, Cursor, Windsurf |
| Standalone MCP install | `t2000 mcp install` (for reconfiguring or adding platforms after init) |
| Manual config | `{ "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }` |
| Remove | `t2000 mcp uninstall` |
| Start server | `t2000 mcp` (stdio transport, used by AI platforms) |
