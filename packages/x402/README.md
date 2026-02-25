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

const agent = await T2000.create({ passphrase: 'my-secret' });

const client = new x402Client({
  wallet: agent,
  maxPrice: 0.10,    // max USDC per request (default: $1.00)
  timeout: 30_000,   // request timeout in ms (default: 30s)
});

// Fetch a paid API — handles the full 402 handshake
const response = await client.fetch('https://api.example.com/data');
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

### `new x402Client(options)`

```typescript
interface X402ClientOptions {
  wallet: X402Wallet;           // T2000 instance or compatible wallet
  maxPrice?: number;            // Max USDC per request (default: 1.0)
  timeout?: number;             // Request timeout in ms (default: 30000)
  facilitatorUrl?: string;      // Facilitator URL (default: api.t2000.ai/x402)
  registryId?: string;          // Payment Kit registry object ID
}
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

### `parsePaymentRequired(response)`

Parses a 402 response into structured payment terms.

```typescript
import { parsePaymentRequired } from '@t2000/x402';

const terms = parsePaymentRequired(response);
// { amount: 10000, recipient: '0x...', network: 'sui', ... }
```

## Facilitator API (Server-Side)

For API providers who want to accept x402 payments:

### `verifyPayment(params)`

Verify that an on-chain payment transaction is valid.

```typescript
import { verifyPayment } from '@t2000/x402';

const result = await verifyPayment({
  txDigest: 'ABC123...',
  expectedAmount: 10000,       // 0.01 USDC in raw units (6 decimals)
  expectedRecipient: '0x...',
  client: suiClient,          // SuiClient instance
});

if (result.valid) {
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

// Build a payment transaction (advanced usage)
const tx = buildPaymentTransaction({
  registryId: '0x...',
  recipient: '0x...',
  amount: 10000n,          // raw USDC units
  nonce: 'unique-nonce',
  coinObjectId: '0x...',
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
  getAddress(): string;
  signAndExecuteTransaction(params: {
    transaction: Transaction;
    options?: { showObjectChanges?: boolean };
  }): Promise<{ digest: string; effects?: { status: { status: string } } }>;
  getSuiClient(): SuiClient;
}
```

The `T2000` class from `@t2000/sdk` implements this interface.

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE)
