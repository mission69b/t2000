# @mppsui/mpp

Sui USDC payment method for the [Machine Payments Protocol (MPP)](https://mpp.dev). Accept and make payments on any API — the first MPP implementation on Sui.

[![npm](https://img.shields.io/npm/v/@mppsui/mpp)](https://www.npmjs.com/package/@mppsui/mpp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai/mpp)** · **[GitHub](https://github.com/mission69b/t2000)** · **[SDK](https://www.npmjs.com/package/@t2000/sdk)** · **[CLI](https://www.npmjs.com/package/@t2000/cli)**

> **Migrated from `@t2000/mpp-sui`.** If you were using the old package, switch your imports to `@mppsui/mpp`.

## What is MPP?

The [Machine Payments Protocol](https://mpp.dev) is an open standard by Stripe and Tempo Labs for agent-to-service payments. When a server returns HTTP `402 Payment Required`, the client pays automatically and retries — no API keys, no subscriptions, no human approval.

`@mppsui/mpp` adds **Sui USDC** as a payment method. It works with any MPP-compatible client or server via the `mppx` SDK.

## Installation

```bash
npm install @mppsui/mpp mppx
```

## Accept Payments (Server)

Add payments to any API in 5 lines:

```typescript
import { sui } from '@mppsui/mpp/server';
import { Mppx } from 'mppx';

const SUI_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const mppx = Mppx.create({
  methods: [sui({ currency: SUI_USDC, recipient: '0xYOUR_ADDRESS' })],
});

export const GET = mppx.charge({ amount: '0.01' })(
  () => Response.json({ data: 'paid content' })
);
```

No webhooks. No Stripe dashboard. No KYC. USDC arrives directly in your wallet.

## Make Payments (Client)

```typescript
import { sui } from '@mppsui/mpp/client';
import { Mppx } from 'mppx/client';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const client = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl('mainnet'),
  network: 'mainnet',
});
const signer = Ed25519Keypair.deriveKeypair('your mnemonic');

const mppx = Mppx.create({
  methods: [sui({ client, signer })],
});

const response = await mppx.fetch('https://api.example.com/resource');
// If the API returns 402, mppx pays automatically via Sui USDC.
```

## With t2000 SDK

If you're using the [t2000 SDK](https://www.npmjs.com/package/@t2000/sdk), payments are even simpler:

```typescript
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ pin: 'my-secret' });

const result = await agent.pay({
  url: 'https://api.example.com/generate',
  body: { prompt: 'a sunset' },
  maxPrice: 0.05,
});
// Handles 402 → pay → retry automatically.
// Safeguards enforced (max per tx, daily limits).
```

### CLI

```bash
t2000 pay https://api.example.com/data --max-price 0.10

t2000 pay https://api.example.com/analyze \
  --method POST \
  --data '{"text":"hello"}' \
  --max-price 0.05
```

## How It Works

```
Agent                    API Server
  │                          │
  │── GET /resource ────────>│
  │<── 402 Payment Required ─│
  │    {amount, currency,    │
  │     recipient}           │
  │                          │
  │── USDC transfer on Sui ──│  (~400ms finality)
  │                          │
  │── GET /resource ────────>│
  │   + payment credential   │── verify TX on-chain via RPC
  │   (Sui tx digest)        │
  │<── 200 OK + data ────────│
```

No facilitator. No intermediary. The server verifies the Sui transaction directly via RPC.

## Server API

### `sui(options)`

Creates a Sui USDC payment method for the server.

```typescript
import { sui } from '@mppsui/mpp/server';

const method = sui({
  currency: SUI_USDC,         // Sui coin type for USDC
  recipient: '0xYOUR_ADDR',   // Where payments are sent
  rpcUrl: '...',               // Optional: custom RPC endpoint
  network: 'mainnet',         // Optional: 'mainnet' | 'testnet' | 'devnet'
});
```

Verification checks:
- Transaction succeeded on-chain
- Payment sent to correct recipient (address-normalized comparison)
- Amount >= requested (BigInt precision, no floating-point)

## Client API

### `sui(options)`

Creates a Sui USDC payment method for the client.

```typescript
import { sui } from '@mppsui/mpp/client';

const method = sui({
  client: suiJsonRpcClient,    // SuiJsonRpcClient instance
  signer: ed25519Keypair,      // TransactionSigner (Ed25519Keypair works)
  execute: async (tx) => {     // Optional: custom execution (gas sponsor, etc.)
    return myGasManager.execute(tx);
  },
});
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `client` | `SuiJsonRpcClient` | Yes | Sui RPC client instance |
| `signer` | `TransactionSigner` | Yes | Any object with `getAddress()` and `signTransaction()` — `Ed25519Keypair` works |
| `execute` | `(tx: Transaction) => Promise<{ digest: string }>` | No | Override transaction execution (e.g. gas sponsor/manager) |

The client:
- Fetches all USDC coins (handles Sui pagination, max 50 per page)
- Checks balance before building the transaction
- Merges fragmented coins into a single payment
- Signs and broadcasts the transaction (or delegates to `execute` if provided)
- Returns the digest as the payment credential

## Utilities

### `SUI_USDC_TYPE`

The Sui coin type for Circle-issued USDC on mainnet.

```typescript
import { SUI_USDC_TYPE } from '@mppsui/mpp';
// '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
```

### `fetchCoins(client, owner, coinType)`

Fetches all coins of a given type, handling Sui's pagination (max 50 per page).

### `parseAmountToRaw(amount, decimals)`

Converts a string amount to BigInt raw units without floating-point math.

```typescript
parseAmountToRaw('0.01', 6);  // 10000n
parseAmountToRaw('1.50', 6);  // 1500000n
```

## Why Sui?

MPP is chain-agnostic. We chose Sui because agent payments need:

| | Sui |
|---|---|
| **Finality** | ~400ms |
| **Gas** | <$0.001 per payment |
| **USDC** | Circle-issued, native |
| **Verification** | Direct RPC — no facilitator |

## Testing

```bash
pnpm --filter @mppsui/mpp test    # 16 tests
pnpm --filter @mppsui/mpp typecheck
```

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
