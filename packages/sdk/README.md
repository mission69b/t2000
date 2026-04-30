# @t2000/sdk

The complete TypeScript SDK for AI agent bank accounts on Sui. Send USDC, earn yield via NAVI, and borrow against collateral — all from a single class. USDC in, USDC out.

In Audric, this SDK powers **Audric Passport** (wallet, signing), **Audric Finance** (NAVI lending/borrowing builders, Cetus swap), and **Audric Pay** (USDC transfers, payment links, invoices), and is wrapped by `@t2000/engine` to implement **Audric Intelligence**'s Agent Harness.

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

Creates a new bank account (generates keypair, encrypts, and saves to disk). Fund the returned address with a small amount of SUI for gas (Mercuryo: https://exchange.mercuryo.io/?widget_id=89960d1a-8db7-49e5-8823-4c5e01c1cea2) plus USDC to transact.

```typescript
const { agent, address } = await T2000.init({
  pin: 'my-secret',                // Required — encrypts the key
  keyPath: '~/.t2000/wallet.key',  // Optional — custom key file path
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
| `agent.receive({ amount?, currency?, memo?, label? })` | Generate payment request with Payment Kit URI (`sui:pay?...`), nonce for duplicate prevention | `PaymentRequest` |
| `agent.save({ amount, asset?, protocol? })` | Deposit **USDC or USDsui** to NAVI savings (v0.51.0+). `asset` defaults to `'USDC'`. Auto-selects best rate or specify `protocol`. `amount` can be `'all'`. | `SaveResult` |
| `agent.withdraw({ amount, asset? })` | Withdraw from savings. `amount` can be `'all'`. Optional `asset` (default: USDC; also supports USDsui plus legacy USDe / SUI). | `WithdrawResult` |
| `agent.borrow({ amount, asset? })` | Borrow **USDC or USDsui** against collateral (v0.51.0+). `asset` defaults to `'USDC'`. | `BorrowResult` |
| `agent.repay({ amount, asset? })` | Repay outstanding **USDC or USDsui** debt (v0.51.1+). Pass `asset` to target a specific debt; omit for highest-APY repay. **Symmetry enforced:** USDsui debt is repaid with USDsui coins (and USDC with USDC). `amount` can be `'all'`. | `RepayResult` |
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

## Gas

Every transaction is self-funded by the agent's wallet. Keep at least ~0.05 SUI on hand. If gas runs out the SDK throws `INSUFFICIENT_GAS` — top up via Mercuryo (https://exchange.mercuryo.io/?widget_id=89960d1a-8db7-49e5-8823-4c5e01c1cea2) or any Sui exchange.

> **Audric web app exception:** Audric web users transact under Enoki gas sponsorship (zkLogin), so `INSUFFICIENT_GAS` is not a user-facing concern there. The SDK itself is sponsorship-agnostic — sponsorship is wired in at the host layer (Audric web), not inside `@t2000/sdk`.

**Architecture:** Each protocol operation (NAVI, send) exposes both `buildXxxTx()` (standalone transaction) and `addXxxToTx()` (composable PTB) functions. Multi-step flows compose multiple protocol calls into a single atomic PTB. If any step within a PTB fails, the entire transaction reverts — no funds left in intermediate states.

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `T2000_API_URL` | t2000 API base URL | `https://api.t2000.ai` |

Options like `pin`, `keyPath`, and `rpcUrl` are passed directly to `T2000.create()` or `T2000.init()`. The CLI handles env vars like `T2000_PIN` — see the [CLI README](https://www.npmjs.com/package/@t2000/cli).

## Supported Assets

Token metadata and **tiers** live in `token-registry.ts` (`COIN_REGISTRY`). **17 tokens** total:

- **Tier 1 (saveable / borrowable):** USDC, USDsui — save, borrow, send, swap. USDsui is a strategic exception (v0.51.0+) because NAVI runs a separate USDsui pool that often quotes a different APY than USDC. Repay symmetry is enforced (USDsui debt → USDsui repay).
- **Tier 2 (15):** SUI, wBTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, haSUI, afSUI, LOFI, MANIFEST — send and swap only (not for new save/borrow deposits).
- **Legacy (no tier):** USDT, USDe, USDSUI — display and withdraw of existing positions; still send/swap where applicable.

Six tokens were removed from the registry (FDUSD, AUSD, BUCK, BLUB, SCA, TURBOS). `STABLE_ASSETS = ['USDC']` (the canonical USD unit for balance aggregation), but **`OPERATION_ASSETS.save` and `OPERATION_ASSETS.borrow` accept both `'USDC'` and `'USDsui'`** (v0.51.0+). Use `isAllowedAsset(op, asset)` / `assertAllowedAsset(op, asset)` to validate.

```typescript
import {
  COIN_REGISTRY,
  TOKEN_MAP,
  isTier1,
  isTier2,
  isSupported,
  getTier,
  getDecimalsForCoinType,
  resolveSymbol,
  resolveTokenType,
  SUI_TYPE,
  USDC_TYPE,
  USDT_TYPE,
  IKA_TYPE,
  LOFI_TYPE,
  MANIFEST_TYPE,
} from '@t2000/sdk';

isTier1(USDC_TYPE); // true
isTier2(SUI_TYPE); // true
isSupported(USDT_TYPE); // false (legacy — no tier)
getTier(SUI_TYPE); // 2
```

Swap uses Cetus Aggregator V3. Per-call `overlayFee` is opt-in — the SDK and CLI never charge fees by default. Consumer apps that want to charge an overlay (e.g. Audric) pass `overlayFee: { rate: 10n, receiver: T2000_OVERLAY_FEE_WALLET }` to `findSwapRoute` / `buildSwapTx`. Use `COIN_REGISTRY`, `getDecimalsForCoinType()`, `resolveSymbol()`, and `resolveTokenType()` for token data.

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

Common error codes: `INSUFFICIENT_BALANCE` · `INVALID_ADDRESS` · `INVALID_AMOUNT` · `INVALID_ASSET` · `HEALTH_FACTOR_TOO_LOW` · `NO_COLLATERAL` · `WALLET_NOT_FOUND` · `WALLET_LOCKED` · `WALLET_EXISTS` · `SIMULATION_FAILED` · `TRANSACTION_FAILED` · `PROTOCOL_PAUSED` · `INSUFFICIENT_GAS` · `WITHDRAW_WOULD_LIQUIDATE` · `SWAP_NO_ROUTE` · `SWAP_FAILED`

## Protocol Integration

t2000 uses an MCP-first integration model: NAVI MCP for reads, thin transaction builders for writes. No protocol SDK dependencies needed.

| Protocol | Integration | Used for |
|----------|------------|----------|
| NAVI | MCP (reads) + thin tx builders (writes) | Lending positions, deposits, withdrawals, borrows, rewards |
| Cetus Aggregator V3 | `@cetusprotocol/aggregator-sdk` (isolated) | Multi-DEX swap routing — overlay fee on swaps (`cetus-swap.ts`) |
| VOLO | Thin tx builders (direct Move calls) | Stake SUI → vSUI, unstake vSUI → SUI |

## Testing

```bash
# Run all SDK unit tests
pnpm --filter @t2000/sdk test

# Run smoke tests against mainnet RPC (read-only, no transactions)
SMOKE=1 pnpm --filter @t2000/sdk test -- src/__smoke__
```

## Protocol Fees

> **The SDK and CLI are fee-free by design (as of `@t2000/sdk@1.1.0`, B5 v2 / 2026-04-30).** Direct SDK / CLI calls — `t2000 save`, `t2000 borrow`, `t2000 swap`, plus `T2000.save()` / `T2000.borrow()` / `swapExecute()` from any third-party integrator — never charge a t2000 protocol fee. The CLI is dev-focused tooling and intentionally has no monetization.

Fees only apply when the **Audric** consumer app calls these primitives. Audric layers a fee transfer step (`addFeeTransfer`) inside the same PTB and routes the USDC to `T2000_OVERLAY_FEE_WALLET`.

| Operation | Audric fee | SDK / CLI fee | Notes |
|-----------|-----------|--------------|-------|
| Save (deposit) | 0.10% | Free | USDC only; USDsui save is free in Audric too |
| Borrow | 0.05% | Free | USDC only; USDsui borrow is free in Audric too |
| Swap | 0.10% | Free | Audric passes Cetus `overlayFee`. CLI omits it. Cetus Aggregator network fees still apply both ways. |
| Withdraw / Repay / Send / Receive / Stake / Unstake / Pay (MPP) | Free | Free | No surcharge anywhere. |

How Audric collects fees: `prepare/route.ts` calls `addFeeTransfer(tx, paymentCoin, FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount)` for save/borrow and passes `overlayFee.receiver = T2000_OVERLAY_FEE_WALLET` for swaps. Both flows produce a USDC transfer to the treasury wallet inside the same atomic PTB. The t2000 server-side indexer detects the on-chain USDC inflow and records a `ProtocolFeeLedger` row — no off-chain submission is involved.

Need to charge an overlay fee in your own consumer app? Import `addFeeTransfer` and `T2000_OVERLAY_FEE_WALLET` from `@t2000/sdk` (or use your own receiver address — the SDK never assumes the t2000 treasury).

## MCP Server

The SDK powers the [`@t2000/mcp`](https://www.npmjs.com/package/@t2000/mcp) server for Claude Desktop, Cursor, and any MCP-compatible AI platform. Run `t2000 mcp` to start.

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
