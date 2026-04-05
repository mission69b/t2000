# @t2000/sdk

The complete TypeScript SDK for AI agent bank accounts on Sui. Send USDC, earn yield via NAVI, and borrow against collateral — all from a single class. USDC in, USDC out.

[![npm](https://img.shields.io/npm/v/@t2000/sdk)](https://www.npmjs.com/package/@t2000/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[CLI](https://www.npmjs.com/package/@t2000/cli)** · **[MPP](https://www.npmjs.com/package/@suimpp/mpp)** · **[MCP](https://www.npmjs.com/package/@t2000/mcp)**

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

// Save (earn yield — auto-selects best rate via NAVI)
await agent.save({ amount: 50 });

// Borrow USDC against your collateral
await agent.borrow({ amount: 25 });

// Withdraw from savings (USDC)
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
| `agent.save({ amount, asset?, protocol? })` | Deposit to savings (earn APY). Auto-selects best rate or specify `protocol`. `amount` can be `'all'`. Optional `asset` for multi-asset NAVI deposits (default: USDC). | `SaveResult` |
| `agent.withdraw({ amount, asset? })` | Withdraw from savings. `amount` can be `'all'`. Optional `asset` for multi-asset withdrawals (default: USDC). | `WithdrawResult` |
| `agent.borrow({ amount })` | Borrow USDC against collateral | `BorrowResult` |
| `agent.repay({ amount })` | Repay outstanding debt in USDC. `amount` can be `'all'`. | `RepayResult` |
| `agent.swap({ from, to, amount, slippage? })` | Swap tokens via Cetus Aggregator (20+ DEXs). User-friendly names or full coin types. | `SwapResult` |
| `agent.stakeVSui({ amount })` | Stake SUI for vSUI via VOLO liquid staking (min 1 SUI) | `StakeVSuiResult` |
| `agent.unstakeVSui({ amount })` | Unstake vSUI back to SUI. `amount` can be `'all'`. | `UnstakeVSuiResult` |
| `agent.exportKey()` | Export private key (bech32 format) | `string` |

### Query Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.healthFactor()` | Lending health factor | `HealthFactorResult` |
| `agent.earnings()` | Yield earned to date | `EarningsResult` |
| `agent.rates()` | Best save/borrow APYs across protocols | `RatesResult` |
| `agent.allRatesAcrossAssets()` | Per-protocol rate data across assets | `Array<{ protocol, asset, rates }>` |
| `agent.positions()` | All open DeFi positions | `PositionsResult` |
| `agent.fundStatus()` | Complete savings summary | `FundStatusResult` |
| `agent.maxWithdraw()` | Max safe withdrawal amount | `MaxWithdrawResult` |
| `agent.maxBorrow()` | Max safe borrow amount | `MaxBorrowResult` |
| `agent.deposit()` | Wallet address + funding instructions | `DepositInfo` |
| `agent.history({ limit? })` | Transaction history (default: all) | `TransactionRecord[]` |
| `agent.swapQuote({ from, to, amount })` | Preview swap route, output amount, and price impact (no execution) | `SwapQuoteResult` |

### Contacts Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.contacts.add(name, address)` | Save a named contact | `void` |
| `agent.contacts.remove(name)` | Remove a contact | `void` |
| `agent.contacts.list()` | List all saved contacts | `Contact[]` |
| `agent.contacts.get(name)` | Get a contact by name | `Contact` |
| `agent.contacts.resolve(nameOrAddress)` | Resolve name to address (passthrough if already an address) | `string` |

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

For integrations (like `@suimpp/mpp`), the agent exposes:

```typescript
agent.suiClient;   // SuiJsonRpcClient instance
agent.signer;      // Ed25519Keypair
```

## Gas Abstraction

Every operation (send, save, borrow, repay, withdraw) routes through a 3-step gas resolution chain via `executeWithGas()`. The agent never fails due to low gas if it has USDC or the Gas Station is reachable:

| Step | Strategy | Condition | How it works |
|------|----------|-----------|--------------|
| 1 | **Self-funded** | SUI ≥ 0.05 | Uses the agent's own SUI for gas |
| 2 | **Auto-topup** | SUI < 0.05, USDC ≥ $2 | Converts $1 USDC → SUI (currently disabled, falls back to step 3) |
| 3 | **Sponsored** | Steps 1 & 2 fail | Gas Station sponsors the full transaction |
| 4 | **Error** | All fail | Throws `INSUFFICIENT_GAS` |

Every transaction result includes a `gasMethod` field (`'self-funded'` | `'auto-topup'` | `'sponsored'`) indicating which strategy was used.

**Architecture:** Each protocol operation (NAVI, send) exposes both `buildXxxTx()` (standalone transaction) and `addXxxToTx()` (composable PTB) functions. Multi-step flows compose multiple protocol calls into a single atomic PTB. `executeWithGas()` handles execution with the gas fallback chain. If any step within a PTB fails, the entire transaction reverts — no funds left in intermediate states.

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `T2000_API_URL` | t2000 API base URL | `https://api.t2000.ai` |

Options like `pin`, `keyPath`, and `rpcUrl` are passed directly to `T2000.create()` or `T2000.init()`. The CLI handles env vars like `T2000_PIN` — see the [CLI README](https://www.npmjs.com/package/@t2000/cli).

## Supported Assets

Multi-asset support via `token-registry.ts` — 24 tokens with full type, decimals, and symbol metadata. Key assets:

| Asset | Decimals | Send | Save | Borrow | Swap |
|-------|----------|------|------|--------|------|
| USDC  | 6        | ✅   | ✅   | ✅     | ✅   |
| SUI   | 9        | ✅   | ✅   | —      | ✅   |
| USDSUI | 6       | ✅   | ✅   | —      | ✅   |
| USDe  | 6        | ✅   | ✅   | —      | ✅   |
| WAL   | 9        | ✅   | ✅   | —      | ✅   |
| ETH   | 8        | ✅   | ✅   | —      | ✅   |

Swap supports any token pair via Cetus Aggregator V3. Use `COIN_REGISTRY`, `getDecimalsForCoinType()`, `resolveSymbol()`, and `resolveTokenType()` from `@t2000/sdk` for token data.

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

Common error codes: `INSUFFICIENT_BALANCE` · `INVALID_ADDRESS` · `INVALID_AMOUNT` · `HEALTH_FACTOR_TOO_LOW` · `NO_COLLATERAL` · `WALLET_NOT_FOUND` · `WALLET_LOCKED` · `WALLET_EXISTS` · `SIMULATION_FAILED` · `TRANSACTION_FAILED` · `PROTOCOL_PAUSED` · `INSUFFICIENT_GAS` · `WITHDRAW_WOULD_LIQUIDATE` · `AUTO_TOPUP_FAILED` · `GAS_STATION_UNAVAILABLE` · `SWAP_NO_ROUTE` · `SWAP_FAILED`

## Protocol Integration

t2000 uses an MCP-first integration model: NAVI MCP for reads, thin transaction builders for writes. No protocol SDK dependencies needed.

| Protocol | Integration | Used for |
|----------|------------|----------|
| NAVI | MCP (reads) + thin tx builders (writes) | Lending positions, deposits, withdrawals, borrows, rewards |
| Cetus Aggregator V3 | `@cetusprotocol/aggregator-sdk` (isolated) | Multi-DEX swap routing — any token pair with liquidity |
| VOLO | Thin tx builders (direct Move calls) | Stake SUI → vSUI, unstake vSUI → SUI |

## Testing

```bash
# Run all SDK unit tests
pnpm --filter @t2000/sdk test

# Run smoke tests against mainnet RPC (read-only, no transactions)
SMOKE=1 pnpm --filter @t2000/sdk test -- src/__smoke__
```

## Protocol Fees

| Operation | Fee | Notes |
|-----------|-----|-------|
| Save (deposit) | 0.10% | Protocol fee on deposit |
| Borrow | 0.05% | Protocol fee on loan |
| Withdraw | Free | |
| Repay | Free | |
| Send | Free | |
| Swap | Free | Cetus Aggregator network fees only |
| Stake (vSUI) | Free | VOLO protocol fees only |
| Unstake (vSUI) | Free | |
| Pay (MPP) | Free | Agent pays the API price, no t2000 surcharge |

Fees are collected by the t2000 protocol treasury on-chain.

## MCP Server

The SDK powers the [`@t2000/mcp`](https://www.npmjs.com/package/@t2000/mcp) server for Claude Desktop, Cursor, and any MCP-compatible AI platform. Run `t2000 mcp` to start.

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
