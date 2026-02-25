# @t2000/sdk

The complete TypeScript SDK for AI agent wallets on Sui. Send USDC, earn yield via NAVI Protocol, swap on Cetus DEX, borrow against collateral — all from a single class.

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

// Create or load a wallet
const agent = await T2000.create({ passphrase: 'my-secret' });

// Check balance
const balance = await agent.balance();
console.log(`$${balance.available} USDC available`);

// Send USDC
await agent.send({ to: '0x...', amount: 10 });

// Save (earn yield via NAVI Protocol)
await agent.save({ amount: 50 });

// Swap USDC → SUI (via Cetus DEX)
await agent.swap({ from: 'USDC', to: 'SUI', amount: 5 });

// Borrow against savings
await agent.borrow({ amount: 20 });
```

## API Reference

### `T2000.create(options)`

Creates a new wallet or loads an existing one.

```typescript
const agent = await T2000.create({
  passphrase: 'my-secret',        // Required — encrypts/decrypts the key
  network: 'mainnet',             // 'mainnet' | 'testnet' (default: 'mainnet')
  rpcUrl: 'https://...',          // Custom RPC endpoint (optional)
  keyPath: '~/.t2000/wallet.key', // Custom key file path (optional)
});
```

### Core Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `agent.balance()` | Available USDC + savings + gas reserve | `BalanceResponse` |
| `agent.send({ to, amount })` | Transfer USDC to any Sui address | `SendResult` |
| `agent.save({ amount })` | Deposit USDC to NAVI Protocol (earn APY) | `SaveResult` |
| `agent.withdraw({ amount })` | Withdraw USDC from savings | `WithdrawResult` |
| `agent.swap({ from, to, amount })` | Swap via Cetus CLMM DEX | `SwapResult` |
| `agent.borrow({ amount })` | Borrow USDC against collateral | `BorrowResult` |
| `agent.repay({ amount })` | Repay outstanding borrows | `RepayResult` |

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
| `agent.depositInfo()` | Wallet address + funding instructions | `DepositInfo` |
| `agent.history()` | Transaction history | `TransactionRecord[]` |

### Key Management

```typescript
import {
  generateKeypair,
  keypairFromPrivateKey,
  exportPrivateKey,
  getAddress,
} from '@t2000/sdk';

// Generate a new keypair
const keypair = generateKeypair();

// Import from private key (bech32 or hex)
const imported = keypairFromPrivateKey('suiprivkey1...');

// Export private key (bech32 format)
const privkey = exportPrivateKey(keypair);

// Get the Sui address
const address = getAddress(keypair);
```

### Events

```typescript
agent.on('balanceChange', (e) => {
  console.log(`${e.cause}: ${e.asset} changed`);
});

agent.on('healthWarning', (e) => {
  console.log(`Health factor: ${e.healthFactor}`);
});

agent.on('yield', (e) => {
  console.log(`Earned: $${e.earned}`);
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
formatUsd(1234.5);              // "$1,234.50"
truncateAddress('0xabcd...1234'); // "0xabcd...1234"
validateAddress('0x...');        // throws if invalid
```

## Gas Abstraction

Gas is handled automatically with three strategies:

1. **Self-funded** — uses the agent's SUI balance
2. **Auto-topup** — swaps $1 USDC → SUI when gas runs low (< 0.05 SUI)
3. **Sponsored** — Gas Station fallback for bootstrapping (first 10 transactions)

Every transaction result includes a `gasMethod` field indicating which strategy was used.

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `T2000_PASSPHRASE` | Wallet passphrase | — |
| `T2000_NETWORK` | `mainnet` or `testnet` | `mainnet` |
| `T2000_RPC_URL` | Custom Sui RPC URL | Sui public fullnode |
| `T2000_KEY_PATH` | Path to encrypted key file | `~/.t2000/wallet.key` |
| `T2000_API_URL` | t2000 API base URL | `https://api.t2000.ai` |

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

Error codes: `INSUFFICIENT_BALANCE` · `INVALID_ADDRESS` · `INVALID_AMOUNT` · `HEALTH_FACTOR_TOO_LOW` · `NO_DEBT` · `WALLET_NOT_FOUND` · `SIMULATION_FAILED` · `TRANSACTION_FAILED` · `PAUSED`

## Protocol Fees

| Operation | Fee |
|-----------|-----|
| Save (deposit) | 0.10% |
| Swap | 0.10% |
| Borrow | 0.05% |

Fees are collected by the t2000 protocol treasury on-chain.

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
