# @t2000/sdk

The TypeScript SDK for Agent Wallets on Sui. Send USDC + USDsui gasless, swap via Cetus Aggregator, and pay MPP-protected APIs — all from a single class.

In [Audric](https://audric.ai), this SDK powers **Audric Passport** (wallet, signing), **Audric Finance** (NAVI lending/borrowing builders, Cetus swap), and **Audric Pay** (USDC transfers, payment links), and is wrapped by [`@t2000/engine`](https://www.npmjs.com/package/@t2000/engine) to implement **Audric Intelligence**'s Agent Harness.

[![npm @t2000/sdk](https://img.shields.io/npm/v/@t2000/sdk?label=%40t2000%2Fsdk)](https://www.npmjs.com/package/@t2000/sdk)
[![npm @t2000/cli](https://img.shields.io/npm/v/@t2000/cli?label=%40t2000%2Fcli)](https://www.npmjs.com/package/@t2000/cli)
[![docs](https://img.shields.io/badge/docs-t2000.ai-00D395)](https://t2000.ai)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/mission69b/t2000/blob/main/LICENSE)

## Installation

```bash
npm install @t2000/sdk      # or pnpm add / yarn add
```

**Requires** Node.js 18+ · TypeScript 5+ (recommended).

## Quick Start

```typescript
import { T2000 } from '@t2000/sdk';

// Create a new wallet (plain Bech32, 0o600 perms, no PIN)
const { agent, address } = await T2000.init();

// Or load an existing wallet from ~/.t2000/wallet.key
const agent = await T2000.create();

// Or from a Bech32 secret in memory (no file)
const agent = T2000.fromPrivateKey('suiprivkey1…');

// Inspect
const balance = await agent.balance();
console.log(`$${balance.available} USDC available`);

// Send — asset is REQUIRED; USDC + USDsui are gasless via 0x2::balance::send_funds
await agent.send({ to: 'alice.sui', amount: 5, asset: 'USDC' });
await agent.send({ to: '0x8b3e…', amount: 5, asset: 'USDsui' });

// Swap — Cetus Aggregator V3 across 20+ Sui DEXs. Requires SUI for gas.
await agent.swap({ from: 'USDC', to: 'SUI', amount: 100 });

// Pay — MPP-protected API. Gasless USDC; handles HTTP 402 transparently.
const result = await agent.pay({
  url: 'https://mpp.t2000.ai/openai/v1/chat/completions',
  method: 'POST',
  body: JSON.stringify({ model: 'gpt-4o-mini', messages: […] }),
  maxPrice: 0.10,
});
```

## Factory Methods

| Static | Returns | Use when |
|---|---|---|
| `T2000.init({ keyPath?, name? })` | `{ agent, address }` | Generating a brand-new wallet. Writes a plain Bech32 JSON file to `~/.t2000/wallet.key` (override with `keyPath`). |
| `T2000.create({ keyPath?, rpcUrl? })` | `T2000` | Loading the existing wallet from disk. Throws `WALLET_NOT_FOUND` if the file is missing, `WALLET_CORRUPT` if it's a v3 PIN-encrypted file or otherwise malformed. |
| `T2000.fromPrivateKey(secret, { network?, rpcUrl? })` | `T2000` | Synchronous in-memory load from a `suiprivkey1…` Bech32 or hex secret. No filesystem read or write. |

> **v3 → v4.** `T2000.create({ pin })` is gone. The `pin` and `passphrase` fields are accepted (back-compat) but **ignored** — v4 wallets are plain Bech32 JSON with `0o600` perms. If you're upgrading a v3 PIN-encrypted wallet: export the secret from the v3 binary, then `T2000.init` followed by replacing the generated file with one carrying that secret (or just use [`@t2000/cli`](https://www.npmjs.com/package/@t2000/cli)'s `t2 init --import` flow).

## Agent Wallet API

These methods cover the v4 Agent Wallet brand — sending USDC, receiving, swapping, paying for MPP APIs. They mirror the [`@t2000/cli`](https://www.npmjs.com/package/@t2000/cli) surface 1:1.

| Method | Returns | Notes |
|---|---|---|
| `agent.address()` | `string` | Sui address. |
| `agent.balance()` | `BalanceResponse` | USDC / USDsui / SUI + gas reserve + total USD. |
| `agent.history({ limit? })` | `TransactionRecord[]` | Sends / swaps / MPP payments with Suiscan digests. |
| `agent.send({ to, amount, asset })` | `SendResult` | **`asset` is required** (`'USDC'` / `'USDsui'` / `'SUI'`). USDC + USDsui are gasless via Sui foundation's `0x2::balance::send_funds` sponsor; SUI uses standard gas. `to` resolves in priority order: hex address > SuiNS name (`alice.sui`) > `@audric` handle > saved contact. |
| `agent.resolveRecipient(input)` | `{ address, suinsName?, contactName? }` | Public resolver — same lookup `send` uses. Handy for dry-run previews. |
| `agent.swap({ from, to, amount, slippage? })` | `SwapResult` | Cetus Aggregator V3 (20+ DEXs). User-friendly names (`'USDC'`, `'SUI'`, `'CETUS'`, …) or full coin types. Default slippage 1%, max 5%. **Requires SUI for gas** — Cetus is not in the gasless allowlist. |
| `agent.swapQuote({ from, to, amount, slippage? })` | `SwapQuoteResult` | Preview route + output + price impact (no execution). |
| `agent.pay(options)` | `PayResult` | MPP-protected paid API. Handles 402 → quote → USDC payment → retry. USDC transfer is gasless. `options.maxPrice` caps spend (default 1 USDC). |
| `agent.receive({ amount?, currency?, memo?, label? })` | `PaymentRequest` | Builds a Payment Kit `sui:pay?…` URI with a unique nonce. Scannable by any Sui wallet. |
| `agent.exportKey()` | `string` | Print the Bech32 (`suiprivkey1…`) secret for the underlying keypair. |

### Events

```typescript
agent.on('balanceChange', (e) => { /* asset, previous, current, cause, tx? */ });
agent.on('healthWarning', (e) => { /* healthFactor, threshold */ });
agent.on('healthCritical', (e) => { /* healthFactor < 1.2 */ });
agent.on('yield', (e) => { /* earned, total, apy, timestamp */ });
agent.on('error', (e) => { /* T2000Error */ });
```

### Exposed Internals

For integrations (`@suimpp/mpp`, `@t2000/engine`, audric web-v2):

```typescript
agent.suiClient;   // SuiJsonRpcClient
agent.signer;      // TransactionSigner (works for keypair + zkLogin)
agent.keypair;     // Ed25519Keypair (throws for zkLogin instances)
```

## Programmatic DeFi API (no CLI alias)

These methods power [Audric Finance](https://audric.ai) — save (NAVI lend), borrow (NAVI), repay, withdraw, plus the supporting read tools. **They have no `t2` CLI alias in v4** by design: the CLI is a focused Agent Wallet (send / swap / pay); DeFi flows live in consumer apps and the `@t2000/engine` Agent Harness. They are still load-bearing for `@t2000/engine` 4.x and any consumer app building on the SDK.

| Method | Notes |
|---|---|
| `agent.save({ amount, asset?, protocol? })` | Deposit **USDC or USDsui** to NAVI savings (default `'USDC'`). `amount` can be `'all'`. |
| `agent.withdraw({ amount, asset?, protocol? })` | Withdraw from savings (default `'USDC'`; also supports USDsui + legacy USDe / SUI positions). `amount` can be `'all'`. |
| `agent.borrow({ amount, asset?, protocol? })` | Borrow USDC or USDsui against collateral (default `'USDC'`). |
| `agent.repay({ amount, asset?, protocol? })` | Repay outstanding debt. **Symmetry enforced** — USDsui debt is repaid with USDsui (USDC with USDC). `amount` can be `'all'`. |
| `agent.claimRewards()` | Claim pending NAVI rewards. |
| `agent.healthFactor()` | NAVI lending health factor. |
| `agent.maxWithdraw()` · `agent.maxBorrow()` | Safe limits without breaching health factor. |
| `agent.positions()` | Open save + borrow positions across protocols. |
| `agent.rates()` | Best save/borrow APYs across protocols. |
| `agent.earnings()` | Yield earned to date. |
| `agent.fundStatus()` | Complete savings summary. |
| `agent.deposit()` · `agent.fund()` | Wallet address + funding instructions (used by Audric's deposit UI). |

## Utility Exports

```typescript
import {
  // Key management
  generateKeypair, keypairFromPrivateKey, exportPrivateKey, getAddress,
  saveKey, loadKey, walletExists,

  // Token data
  COIN_REGISTRY, TOKEN_MAP, SUI_TYPE, USDC_TYPE,
  isTier1, isTier2, isSupported, getTier,
  getDecimalsForCoinType, resolveSymbol, resolveTokenType,

  // Asset allowlist
  SUPPORTED_ASSETS, SENDABLE_ASSETS, assertAllowedAsset,
  GASLESS_MIN_STABLE_AMOUNT, GASLESS_STABLE_TYPES,

  // Numbers + formatting
  mistToSui, suiToMist, usdcToRaw, rawToUsdc,
  formatUsd, formatSui, truncateAddress, validateAddress,

  // Sui clients
  getSuiClient, getSuiGrpcClient, DEFAULT_GRPC_URL,

  // Fees (consumer apps only — SDK + CLI are fee-free)
  addFeeTransfer, T2000_OVERLAY_FEE_WALLET,
} from '@t2000/sdk';
```

## Supported Assets

Token metadata + tiers live in `COIN_REGISTRY` (`packages/sdk/src/token-registry.ts`). **19 tokens** total.

- **Tier 1 — financial layer (1):** USDC. Save / borrow / receive / yield, marketplace, MPP.
- **Tier 2 — swap assets (15):** SUI, wBTC, ETH, GOLD, DEEP, WAL, NS, IKA, CETUS, NAVX, vSUI, haSUI, afSUI, LOFI, MANIFEST. Hold + swap + send only.
- **Legacy — no tier, display only (3):** USDT, USDe, USDsui. Kept so existing NAVI positions still render accurately.

> **Strategic exception.** `OPERATION_ASSETS.save` and `OPERATION_ASSETS.borrow` accept **both** USDC and USDsui — USDsui is no-tier in the registry but saveable/borrowable via the allowlist (NAVI runs a separate USDsui pool, often at a different APY than the USDC pool, since v0.51.0). Repay symmetry is enforced: USDsui debt must be repaid with USDsui (USDC debt with USDC).

**`OPERATION_ASSETS`** constrains each write:

```typescript
import { OPERATION_ASSETS, assertAllowedAsset } from '@t2000/sdk';

OPERATION_ASSETS.send;   // ['USDC', 'USDsui', 'SUI']
OPERATION_ASSETS.save;   // ['USDC', 'USDsui']
OPERATION_ASSETS.borrow; // ['USDC', 'USDsui']

assertAllowedAsset('send', 'USDY'); // throws — not in the allowlist
```

## Gasless

USDC + USDsui sends and MPP USDC payments are gasless. Build path goes through `SuiGrpcClient` so the SDK's gasless-eligibility resolver detects the `0x2::balance::send_funds` Move call at build time and zeroes out `gasPrice` / `gasBudget` / `gasPayment` automatically. Submission still goes through the JSON-RPC client (hybrid pattern documented at [`docs.sui.io`](https://docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers)).

Other writes (SUI sends, Cetus swaps, NAVI save / borrow / withdraw / repay / claim) require gas. Keep ~0.05 SUI on hand. The SDK throws `INSUFFICIENT_GAS` if you run dry.

> **Consumer apps:** sponsored gas via Enoki / zkLogin is the host's responsibility. The SDK is sponsorship-agnostic — Audric wires Enoki at the host layer (`audric/apps/web-v2`); the SDK doesn't know or care. See `audric/.cursor/rules/audric-transaction-flow.mdc` in the audric repo.

## Fees

The SDK + CLI are **fee-free by design** (`@t2000/sdk@1.1.0+`). No t2000 protocol fees on any operation.

Network gas (SUI) and third-party fees (Cetus routing, NAVI lending spread) still apply at on-chain rates.

Consumer apps that want to charge an overlay fee — Audric does this on save / borrow / swap — call `addFeeTransfer(tx, paymentCoin, FEE_BPS, receiverAddress, amount)` inside the same PTB. The SDK never assumes a t2000 treasury; pass any receiver.

## Configuration

| Env var | Effect |
|---|---|
| `T2000_RPC_URL` | Custom Sui JSON-RPC endpoint. |
| `T2000_GRPC_URL` | Custom Sui gRPC endpoint (defaults to `fullnode.mainnet.sui.io`). Used during gasless USDC/USDsui send + pay build paths. |

Per-call options like `keyPath` and `rpcUrl` are passed to `T2000.create()` / `T2000.init()`.

## Error Handling

```typescript
import { T2000Error } from '@t2000/sdk';

try {
  await agent.send({ to: 'alice.sui', amount: 1000, asset: 'USDC' });
} catch (e) {
  if (e instanceof T2000Error) {
    // e.code + e.message
  }
}
```

Common codes:

`WALLET_NOT_FOUND` · `WALLET_CORRUPT` · `INVALID_KEY` · `INSUFFICIENT_BALANCE` · `INSUFFICIENT_GAS` · `INVALID_ADDRESS` · `INVALID_AMOUNT` · `INVALID_ASSET` · `ASSET_NOT_SUPPORTED` · `SUINS_NOT_REGISTERED` · `CONTACT_NOT_FOUND` · `SWAP_NO_ROUTE` · `SWAP_FAILED` · `HEALTH_FACTOR_TOO_LOW` · `NO_COLLATERAL` · `WITHDRAW_WOULD_LIQUIDATE` · `PROTOCOL_PAUSED` · `SIMULATION_FAILED` · `TRANSACTION_FAILED`

## Architecture

t2000 uses an MCP-first model for DeFi reads + thin transaction builders for writes. No protocol SDK dependencies needed in user code.

| Protocol | Integration | Used for |
|---|---|---|
| Sui foundation gasless | `0x2::balance::send_funds` Move call (built via `SuiGrpcClient`) | USDC + USDsui transfers, MPP USDC payments |
| Cetus Aggregator V3 | `@cetusprotocol/aggregator-sdk` (isolated to `protocols/cetus-swap.ts`) | Multi-DEX swap routing |
| NAVI | NAVI MCP (reads) + thin tx builders (writes) | Save / borrow / withdraw / repay / rewards / positions / rates |
| MPP | `mppx` + `@suimpp/mpp/client` | Paid API access — 40+ services on `mpp.t2000.ai` |

Each NAVI op exposes both `buildXxxTx()` (standalone) and `addXxxToTx()` (composable fragment) so multi-step flows compose atomically as a single Programmable Transaction Block — any step failing reverts the whole bundle.

## Testing

```bash
pnpm --filter @t2000/sdk test                       # unit
SMOKE=1 pnpm --filter @t2000/sdk test -- src/__smoke__   # read-only mainnet smokes
```

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE).
