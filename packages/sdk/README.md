# @t2000/sdk

The complete TypeScript SDK for AI agent bank accounts on Sui. Send USDC, earn yield via NAVI + Suilend, borrow against collateral, and auto-rebalance for optimal yield — all from a single class. USDC in, USDC out — multi-stablecoin optimization is handled internally by rebalance.

[![npm](https://img.shields.io/npm/v/@t2000/sdk)](https://www.npmjs.com/package/@t2000/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[CLI](https://www.npmjs.com/package/@t2000/cli)** · **[x402](https://www.npmjs.com/package/@t2000/x402)** · **[MCP](https://www.npmjs.com/package/@t2000/mcp)**

## Installation

```bash
npm install @t2000/sdk
# or
pnpm add @t2000/sdk
# or
yarn add @t2000/sdk
```

**Requirements:** Node.js 18+ · TypeScript 5+ (optional but recommended)

## Quick Start

```typescript
import { T2000 } from '@t2000/sdk';

// Create a new bank account
const { agent, address } = await T2000.init({ pin: 'my-secret' });

// Or load an existing one
const agent = await T2000.create({ pin: 'my-secret' });

// Check balance
const balance = await agent.balance();
console.log(`$${balance.available} USDC available`);

// Send USDC
await agent.send({ to: '0x...', amount: 10 });

// Save (earn yield — auto-selects best rate across NAVI + Suilend)
await agent.save({ amount: 50 });

// Borrow USDC against your collateral
await agent.borrow({ amount: 25 });

// Exchange tokens (e.g. USDC ⇌ SUI)
await agent.exchange({ from: 'USDC', to: 'SUI', amount: 5 });

// Rebalance — move savings to the best rate (dry-run first)
const plan = await agent.rebalance({ dryRun: true });
console.log(`+${plan.annualGain.toFixed(2)}/year, break-even: ${plan.breakEvenDays} days`);
await agent.rebalance(); // execute

// Withdraw — always returns USDC (auto-swaps non-USDC positions)
await agent.withdraw({ amount: 25 });
```

## API Reference

### `T2000.init(options)` — Create a new wallet

Creates a new bank account (generates keypair, encrypts, and saves to disk).

```typescript
const { agent, address, sponsored } = await T2000.init({
  pin: 'my-secret',       // Required — encrypts the key
  keyPath: '~/.t2000/wallet.key',  // Optional — custom key file path
  name: 'my-agent',       // Optional — agent name for sponsor registration
  sponsored: true,         // Optional — register with gas station (default: true)
});
```

### `T2000.create(options)` — Load an existing wallet

Loads an existing bank account from an encrypted key file. Throws `WALLET_NOT_FOUND` if no wallet exists.

```typescript
const agent = await T2000.create({
  pin: 'my-secret',                 // Required — decrypts the key
  keyPath: '~/.t2000/wallet.key',   // Optional — custom key file path
  rpcUrl: 'https://...',            // Optional — custom Sui RPC endpoint
});
```

### `T2000.fromPrivateKey(key, options?)` — Load from raw key

Synchronous factory that creates an agent from a raw private key (bech32 `suiprivkey1...` or hex).

```typescript
const agent = T2000.fromPrivateKey('suiprivkey1q...');
```

### Core Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.address()` | Wallet Sui address | `string` |
| `agent.balance()` | Available USDC + savings + gas reserve | `BalanceResponse` |
| `agent.send({ to, amount, asset? })` | Transfer USDC to any Sui address | `SendResult` |
| `agent.save({ amount, protocol? })` | Deposit to savings (earn APY). Auto-converts non-USDC stables. Auto-selects best rate or specify `protocol`. `amount` can be `'all'`. | `SaveResult` |
| `agent.withdraw({ amount })` | Withdraw from savings. Always returns USDC (auto-swaps non-USDC positions). `amount` can be `'all'`. | `WithdrawResult` |
| `agent.borrow({ amount })` | Borrow USDC against collateral | `BorrowResult` |
| `agent.repay({ amount })` | Repay outstanding debt (auto-swaps USDC to borrowed asset if non-USDC). `amount` can be `'all'`. | `RepayResult` |
| `agent.rebalance({ dryRun?, minYieldDiff?, maxBreakEven? })` | Optimize yield — move savings to best rate across protocols/stablecoins internally. Dry-run for preview. | `RebalanceResult` |
| `agent.exchange({ from, to, amount, maxSlippage? })` | Exchange tokens via Cetus DEX (e.g. USDC ⇌ SUI). On-chain slippage protection. | `SwapResult` |
| `agent.exchangeQuote({ from, to, amount })` | Get exchange quote without executing | `{ expectedOutput, priceImpact, poolPrice, fee }` |
| `agent.exportKey()` | Export private key (bech32 format) | `string` |

### Query Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.healthFactor()` | Lending health factor | `HealthFactorResult` |
| `agent.earnings()` | Yield earned to date | `EarningsResult` |
| `agent.rates()` | Best save/borrow APYs across protocols | `RatesResult` |
| `agent.allRatesAcrossAssets()` | All rates for all stablecoins across all protocols | `Array<{ protocol, asset, rates }>` |
| `agent.positions()` | All open DeFi positions | `PositionsResult` |
| `agent.fundStatus()` | Complete savings summary | `FundStatusResult` |
| `agent.maxWithdraw()` | Max safe withdrawal amount | `MaxWithdrawResult` |
| `agent.maxBorrow()` | Max safe borrow amount | `MaxBorrowResult` |
| `agent.deposit()` | Wallet address + funding instructions | `DepositInfo` |
| `agent.history({ limit? })` | Transaction history (default: all) | `TransactionRecord[]` |

### Contacts Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.contacts.add(name, address)` | Save a named contact | `void` |
| `agent.contacts.remove(name)` | Remove a contact | `void` |
| `agent.contacts.list()` | List all saved contacts | `Contact[]` |
| `agent.contacts.get(name)` | Get a contact by name | `Contact` |
| `agent.contacts.resolve(nameOrAddress)` | Resolve name to address (passthrough if already an address) | `string` |

### Sentinel Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.sentinelList()` | List active sentinels with prize pools | `SentinelAgent[]` |
| `agent.sentinelInfo(id)` | Get sentinel details (from API or on-chain) | `SentinelAgent` |
| `agent.sentinelAttack(id, prompt, fee?)` | Full attack flow: request → TEE → settle | `SentinelAttackResult` |

### Safeguards (Enforcer)

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.enforcer.getConfig()` | Get safeguard settings | `SafeguardConfig` |
| `agent.enforcer.set({ maxPerTx?, maxDailySend? })` | Set per-transaction and/or daily send limits | `void` |
| `agent.enforcer.lock()` | Lock agent (freeze all operations) | `void` |
| `agent.enforcer.unlock(pin)` | Unlock agent | `void` |
| `agent.enforcer.check(amount)` | Check if amount is allowed under limits | `void` (throws `SafeguardError` if not) |
| `agent.enforcer.recordUsage(amount)` | Record send for daily limit tracking | `void` |
| `agent.enforcer.isConfigured()` | Whether safeguards are set up | `boolean` |

**Types:** `SafeguardConfig` — `{ maxPerTx?, maxDailySend?, locked? }` · `SafeguardError` — thrown when limits exceeded or agent locked

### Key Management

```typescript
import {
  generateKeypair,
  keypairFromPrivateKey,
  exportPrivateKey,
  getAddress,
  saveKey,
  loadKey,
  walletExists,
} from '@t2000/sdk';

// Generate a new keypair
const keypair = generateKeypair();

// Import from private key (bech32 or hex)
const imported = keypairFromPrivateKey('suiprivkey1...');

// Export private key (bech32 format)
const privkey = exportPrivateKey(keypair);

// Get the Sui address
const address = getAddress(keypair);

// Check if wallet exists on disk
const exists = await walletExists();

// Save/load encrypted key
await saveKey(keypair, 'my-pin');
const loaded = await loadKey('my-pin');
```

### Events

```typescript
agent.on('balanceChange', (e) => {
  console.log(`${e.cause}: ${e.asset} ${e.previous} → ${e.current}`);
});

agent.on('healthWarning', (e) => {
  console.log(`Health factor: ${e.healthFactor} (warning)`);
});

agent.on('healthCritical', (e) => {
  console.log(`Health factor: ${e.healthFactor} (critical — below 1.2)`);
});

agent.on('yield', (e) => {
  console.log(`Earned: $${e.earned}, total: $${e.total}`);
});

agent.on('gasAutoTopUp', (e) => {
  console.log(`Auto-topped up gas: $${e.usdcSpent} USDC → ${e.suiReceived} SUI`);
});

agent.on('gasStationFallback', (e) => {
  console.log(`Gas station fallback: ${e.reason}`);
});

agent.on('error', (e) => {
  console.error(`Error: ${e.code} — ${e.message}`);
});
```

### Utility Functions

```typescript
import {
  mistToSui,
  suiToMist,
  usdcToRaw,
  rawToUsdc,
  formatUsd,
  formatSui,
  validateAddress,
  truncateAddress,
} from '@t2000/sdk';

mistToSui(1_000_000_000n);      // 1.0
usdcToRaw(10.50);               // 10_500_000n
formatUsd(1234.5);              // "$1234.50"
truncateAddress('0xabcdef...1234'); // "0xabcd...1234"
validateAddress('0x...');        // throws if invalid
```

### Advanced: Exposed Internals

For integrations (like `@t2000/x402`), the agent exposes:

```typescript
agent.suiClient;   // SuiJsonRpcClient instance
agent.signer;      // Ed25519Keypair
```

## Gas Abstraction

Every operation (send, save, borrow, repay, withdraw) routes through a 3-step gas resolution chain via `executeWithGas()`. The agent never fails due to low gas if it has USDC or the Gas Station is reachable:

| Step | Strategy | Condition | How it works |
|------|----------|-----------|--------------|
| 1 | **Self-funded** | SUI ≥ 0.05 | Uses the agent's own SUI for gas |
| 2 | **Auto-topup** | SUI < 0.05, USDC ≥ $2 | Swaps $1 USDC → SUI (swap is gas-sponsored), then self-funds |
| 3 | **Sponsored** | Steps 1 & 2 fail | Gas Station sponsors the full transaction |
| 4 | **Error** | All fail | Throws `INSUFFICIENT_GAS` |

Every transaction result includes a `gasMethod` field (`'self-funded'` | `'auto-topup'` | `'sponsored'`) indicating which strategy was used.

**Architecture:** Each protocol operation (NAVI, Suilend, Cetus, send) exposes both `buildXxxTx()` (standalone transaction) and `addXxxToTx()` (composable PTB) functions. Multi-step operations (save with auto-convert, withdraw with auto-swap, rebalance) compose multiple protocol calls into a single atomic PTB. `executeWithGas()` handles execution with the gas fallback chain. If any step within a PTB fails, the entire transaction reverts — no funds left in intermediate states.

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `T2000_API_URL` | t2000 API base URL | `https://api.t2000.ai` |

Options like `pin`, `keyPath`, and `rpcUrl` are passed directly to `T2000.create()` or `T2000.init()`. The CLI handles env vars like `T2000_PIN` — see the [CLI README](https://www.npmjs.com/package/@t2000/cli).

## Supported Assets

User-facing commands are denominated in USDC — the user always thinks in USDC.
Save auto-converts non-USDC wallet stablecoins, withdraw auto-swaps non-USDC
positions back to USDC, and repay auto-swaps USDC to the borrowed asset if
debt is non-USDC (from rebalance). Rebalance optimizes across all stablecoins internally.

| Asset | Display | Type | Decimals | Save | Borrow | Withdraw | Rebalance (internal) |
|-------|---------|------|----------|------|--------|----------|---------------------|
| USDC | USDC | `0xdba3...::usdc::USDC` | 6 | ✅ | ✅ | ✅ (always returns USDC) | ✅ |
| USDT | suiUSDT | `0x375f...::usdt::USDT` | 6 | — (via rebalance) | — | — | ✅ |
| USDe | suiUSDe | `0x41d5...::sui_usde::SUI_USDE` | 6 | — (via rebalance) | — | — | ✅ |
| USDsui | USDsui | `0x44f8...::usdsui::USDSUI` | 6 | — (via rebalance) | — | — | ✅ |
| SUI | SUI | `0x2::sui::SUI` | 9 | — | — | — | — |

## Error Handling

```typescript
import { T2000Error } from '@t2000/sdk';

try {
  await agent.send({ to: '0x...', amount: 1000 });
} catch (e) {
  if (e instanceof T2000Error) {
    console.log(e.code);    // 'INSUFFICIENT_BALANCE'
    console.log(e.message); // Human-readable message
  }
}
```

Common error codes: `INSUFFICIENT_BALANCE` · `INVALID_ADDRESS` · `INVALID_AMOUNT` · `HEALTH_FACTOR_TOO_LOW` · `NO_COLLATERAL` · `WALLET_NOT_FOUND` · `WALLET_LOCKED` · `WALLET_EXISTS` · `SIMULATION_FAILED` · `TRANSACTION_FAILED` · `PROTOCOL_PAUSED` · `INSUFFICIENT_GAS` · `SLIPPAGE_EXCEEDED` · `ASSET_NOT_SUPPORTED` · `WITHDRAW_WOULD_LIQUIDATE` · `AUTO_TOPUP_FAILED` · `GAS_STATION_UNAVAILABLE`

## Testing

```bash
# Run all SDK unit tests (367 tests)
pnpm --filter @t2000/sdk test
```

| Test File | Coverage |
|-----------|----------|
| `format.test.ts` | `mistToSui`, `suiToMist`, `usdcToRaw`, `rawToUsdc`, `rawToDisplay`, `displayToRaw`, `bpsToPercent`, `formatUsd`, `formatSui`, `formatLargeNumber` |
| `sui.test.ts` | `validateAddress`, `truncateAddress` |
| `simulate.test.ts` | `throwIfSimulationFailed` (success, failure, missing error, metadata) |
| `hashcash.test.ts` | PoW generation and verification |
| `keyManager.test.ts` | Key generation, encryption, decryption, import/export |
| `errors.test.ts` | `T2000Error` construction, serialization, `mapWalletError`, `mapMoveAbortCode` |
| `navi.test.ts` | NAVI math utilities (health factor, APY, position calculations) |
| `send.test.ts` | Send transaction building and validation |
| `manager.test.ts` | Gas resolution chain (self-fund, auto-topup, sponsored fallback) |
| `autoTopUp.test.ts` | Auto-topup threshold logic and swap execution |
| `compliance.test.ts` | Adapter contract compliance (49 checks across all adapters) |
| `registry.test.ts` | Best rates, multi-protocol routing, quote aggregation |
| `cetus.test.ts` | Cetus swap adapter (metadata, quotes, transaction building) |
| `suilend.test.ts` | Suilend adapter (rates, positions, obligation lifecycle) |
| `t2000.integration.test.ts` | End-to-end flows (save, withdraw, borrow, repay, rebalance, auto-swap) |
| `protocolFee.test.ts` | Protocol fee calculation and collection |
| `sentinel.test.ts` | Sentinel attack flow, listing, fee parsing |
| `serialization.test.ts` | Transaction JSON serialization roundtrip |

## Protocol Fees

| Operation | Fee | Notes |
|-----------|-----|-------|
| Save (deposit) | 0.10% | Protocol fee on deposit |
| Borrow | 0.05% | Protocol fee on loan |
| Exchange | **Free** | Cetus pool fees only; used internally by rebalance/auto-convert |
| Withdraw | Free | |
| Repay | Free | |
| Send | Free | |
| Pay (x402) | Free | Agent pays the API price, no t2000 surcharge |

Fees are collected by the t2000 protocol treasury on-chain.

## MCP Server

The SDK powers the [`@t2000/mcp`](https://www.npmjs.com/package/@t2000/mcp) server — 17 tools and 5 prompts for Claude Desktop, Cursor, and any MCP-compatible AI platform. Run `t2000 mcp` to start.

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
