# @t2000/sdk

The complete TypeScript SDK for AI agent bank accounts on Sui. Send USDC, earn yield via NAVI Protocol, swap on Cetus DEX, borrow against collateral — all from a single class.

[![npm](https://img.shields.io/npm/v/@t2000/sdk)](https://www.npmjs.com/package/@t2000/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[CLI](https://www.npmjs.com/package/@t2000/cli)** · **[x402](https://www.npmjs.com/package/@t2000/x402)**

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

// Save (earn yield via NAVI Protocol)
await agent.save({ amount: 50, asset: 'USDC' });

// Swap USDC → SUI (via Cetus DEX)
await agent.swap({ from: 'USDC', to: 'SUI', amount: 5 });

// Borrow against savings
await agent.borrow({ amount: 20, asset: 'USDC' });
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
| `agent.save({ amount, asset })` | Deposit USDC to NAVI Protocol (earn APY). `amount` can be `'all'`. | `SaveResult` |
| `agent.withdraw({ amount, asset })` | Withdraw USDC from savings. `amount` can be `'all'`. | `WithdrawResult` |
| `agent.swap({ from, to, amount, maxSlippage? })` | Swap via Cetus CLMM DEX. `maxSlippage` in % (default: 3). | `SwapResult` |
| `agent.swapQuote({ from, to, amount })` | Get swap quote without executing | `SwapQuote` |
| `agent.borrow({ amount, asset })` | Borrow USDC against collateral | `BorrowResult` |
| `agent.repay({ amount, asset })` | Repay outstanding borrows. `amount` can be `'all'`. | `RepayResult` |
| `agent.exportKey()` | Export private key (bech32 format) | `string` |

### Query Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.healthFactor()` | Lending health factor | `HealthFactorResult` |
| `agent.earnings()` | Yield earned to date | `EarningsResult` |
| `agent.rates()` | Current save/borrow APYs | `RatesResult` |
| `agent.positions()` | All open DeFi positions | `PositionsResult` |
| `agent.fundStatus()` | Complete savings summary | `FundStatusResult` |
| `agent.maxWithdraw()` | Max safe withdrawal amount | `MaxWithdrawResult` |
| `agent.maxBorrow()` | Max safe borrow amount | `MaxBorrowResult` |
| `agent.deposit()` | Wallet address + funding instructions | `DepositInfo` |
| `agent.history({ limit? })` | Transaction history (default: all) | `TransactionRecord[]` |

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
agent.suiClient;   // SuiClient instance
agent.signer;      // Ed25519Keypair
```

## Gas Abstraction

Every operation (send, save, borrow, repay, withdraw, swap) routes through a 3-step gas resolution chain via `executeWithGas()`. The agent never fails due to low gas if it has USDC or the Gas Station is reachable:

| Step | Strategy | Condition | How it works |
|------|----------|-----------|--------------|
| 1 | **Self-funded** | SUI ≥ 0.05 | Uses the agent's own SUI for gas |
| 2 | **Auto-topup** | SUI < 0.05, USDC ≥ $2 | Swaps $1 USDC → SUI (swap is gas-sponsored), then self-funds |
| 3 | **Sponsored** | Steps 1 & 2 fail | Gas Station sponsors the full transaction |
| 4 | **Error** | All fail | Throws `INSUFFICIENT_GAS` |

Every transaction result includes a `gasMethod` field (`'self-funded'` | `'auto-topup'` | `'sponsored'`) indicating which strategy was used.

**Architecture:** Each protocol operation (NAVI, Cetus, send) exposes a `buildXxxTx()` function that returns a `Transaction` without executing it. `executeWithGas()` then handles execution with the fallback chain. This separation ensures gas management is consistent across all operations.

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `T2000_API_URL` | t2000 API base URL | `https://api.t2000.ai` |

Options like `pin`, `keyPath`, and `rpcUrl` are passed directly to `T2000.create()` or `T2000.init()`. The CLI handles env vars like `T2000_PIN` — see the [CLI README](https://www.npmjs.com/package/@t2000/cli).

## Supported Assets

| Asset | Type | Decimals |
|-------|------|----------|
| USDC | `0xdba3...::usdc::USDC` | 6 |
| SUI | `0x2::sui::SUI` | 9 |

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
# Run all SDK unit tests (122 tests)
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
| `serialization.test.ts` | Transaction JSON serialization roundtrip |

## Protocol Fees

| Operation | Fee | Notes |
|-----------|-----|-------|
| Save (deposit) | 0.10% | Protocol fee on deposit |
| Borrow | 0.05% | Protocol fee on loan |
| Swap | **Free** | Only standard Cetus pool fees |
| Withdraw | Free | |
| Repay | Free | |
| Send | Free | |
| Pay (x402) | Free | Agent pays the API price, no t2000 surcharge |

Fees are collected by the t2000 protocol treasury on-chain.

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
