# @t2000/x402

x402 payment protocol client and facilitator for AI agents on Sui. Pay for API resources with USDC micropayments — the first x402 implementation on Sui.

[![npm](https://img.shields.io/npm/v/@t2000/x402)](https://www.npmjs.com/package/@t2000/x402)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**[Website](https://t2000.ai)** · **[GitHub](https://github.com/mission69b/t2000)** · **[SDK](https://www.npmjs.com/package/@t2000/sdk)** · **[CLI](https://www.npmjs.com/package/@t2000/cli)**

## What is x402?

The [x402 protocol](https://www.x402.org/) enables machine-to-machine payments for API access. When a server returns HTTP `402 Payment Required`, the client automatically pays with USDC and retries — no API keys, no subscriptions, no human approval.

t2000 is the **first x402 client on Sui**, built on the [Sui Payment Kit](https://docs.sui.io/standards/payment-kit) for on-chain payment verification with Move-level replay protection.

## Installation

```bash
npm install @t2000/x402
# or
pnpm add @t2000/x402
# or
yarn add @t2000/x402
```

**Requirements:** Node.js 18+ · `@t2000/sdk` (peer dependency)

## Quick Start — Client

```typescript
import { x402Client } from '@t2000/x402';
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ pin: 'my-secret' });

const client = new x402Client(agent);

// Fetch a paid API — handles the full 402 handshake
const response = await client.fetch('https://api.example.com/data', {
  maxPrice: 0.10,    // max USDC per request (default: $1.00)
  timeout: 30_000,   // request timeout in ms (default: 30s)
});
const data = await response.json();
```

## Quick Start — CLI

```bash
# Pay for an API request (handles 402 automatically)
t2000 pay https://api.example.com/data

# With max price limit
t2000 pay https://api.example.com/premium --max-price 0.10

# POST request with JSON body
t2000 pay https://api.example.com/analyze --method POST --data '{"text":"hello"}'
```

## How It Works

```
Agent                    API Server               Facilitator (t2000)
  │                          │                          │
  │── GET /data ────────────>│                          │
  │<── 402 Payment Required ─│                          │
  │    (amount, recipient)   │                          │
  │                          │                          │
  │── Sign & broadcast ─────────────────────────────────│
  │   USDC payment on Sui    │                          │
  │                          │                          │
  │── GET /data ────────────>│                          │
  │   + X-PAYMENT header     │── POST /x402/verify ────>│
  │                          │<── { valid: true } ──────│
  │<── 200 OK + data ────────│                          │
  │                          │── POST /x402/settle ────>│
  │                          │<── { settled: true } ────│
```

Total round-trip: ~820ms.

## Client API

### `new x402Client(wallet)`

Creates an x402 client with the given wallet. Per-request options like `maxPrice` and `timeout` are passed to `client.fetch()`.

```typescript
const client = new x402Client(wallet);
```

### `client.fetch(url, init?)`

Makes an HTTP request, automatically handling `402 Payment Required` responses.

```typescript
const res = await client.fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'hello' }),
});
```

### `parsePaymentRequired(headerValue, maxPrice?)`

Parses the `PAYMENT-REQUIRED` header from a 402 response into structured payment terms. Validates network (must be `sui`), asset (must be `USDC`), expiry, and price limit.

```typescript
import { parsePaymentRequired } from '@t2000/x402';

const headerValue = response.headers.get('payment-required');
const terms = parsePaymentRequired(headerValue, 1.0);
// { amount: '0.01', payTo: '0x...', network: 'sui', nonce: '...', expiresAt: 1709... }
```

## Facilitator API (Server-Side)

For API providers who want to accept x402 payments:

### `verifyPayment(client, request)`

Verify that an on-chain payment transaction is valid. Checks the transaction for a `PaymentReceipt` event and validates amount, recipient, and nonce.

```typescript
import { verifyPayment } from '@t2000/x402';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

const result = await verifyPayment(client, {
  txHash: 'ABC123...',
  amount: '0.01',
  asset: 'USDC',
  payTo: '0x...',
  nonce: 'unique-nonce',
  expiresAt: 1709500000,
  network: 'sui',
});

if (result.verified) {
  // Payment verified — serve the resource
}
```

### Settlement

Settlement (marking payments as used) is handled server-side by the t2000 facilitator API. The `/x402/settle` endpoint records the payment in the database to prevent double-use. See the [server source](https://github.com/mission69b/t2000/tree/main/apps/server) for implementation details.

## Payment Kit Integration

Payments are executed on-chain via the [Sui Payment Kit](https://docs.sui.io/standards/payment-kit), which provides:

- **Atomic payments** — pay and verify in a single Sui transaction
- **Move-level nonce enforcement** — `EDuplicatePayment` abort prevents replay attacks
- **On-chain receipts** — `PaymentReceipt` events for auditing

```typescript
import { buildPaymentTransaction } from '@t2000/x402';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

// Build a payment transaction (advanced usage)
const tx = await buildPaymentTransaction(client, senderAddress, {
  nonce: 'unique-nonce',
  amount: '0.01',           // USDC as string (converted to raw internally)
  payTo: '0x...',
});
```

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `PAYMENT_KIT_PACKAGE` | Payment Kit Move package ID | Mainnet default |
| `T2000_PAYMENT_REGISTRY_ID` | PaymentRegistry object ID | t2000 mainnet registry |
| `X402_FACILITATOR_URL` | Facilitator base URL | `https://api.t2000.ai/x402` |

## Safety

- **Price limits** — payments refused if amount exceeds `maxPrice` (default $1.00)
- **Network validation** — only Sui payments are accepted
- **Replay protection** — on-chain nonce enforcement via Sui Payment Kit
- **Timeout** — requests abort after configurable timeout (default 30s)

## Wallet Interface

Any wallet implementing `X402Wallet` can be used as a payment source:

```typescript
interface X402Wallet {
  client: SuiClient;
  keypair: Ed25519Keypair;
  address(): string;
  signAndExecute(tx: unknown): Promise<{ digest: string }>;
}
```

The `T2000` class from `@t2000/sdk` implements this interface.

## Testing

```bash
# Unit tests (27 tests)
pnpm --filter @t2000/x402 test

# Integration tests (requires funded mainnet wallet)
T2000_PRIVATE_KEY='suiprivkey1q...' INTEGRATION=true pnpm --filter @t2000/x402 test
```

Integration tests execute real on-chain transactions to verify the full payment flow and replay protection. See the [root README](https://github.com/mission69b/t2000#integration-tests-local-only) for details.

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
