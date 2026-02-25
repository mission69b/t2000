# @t2000/x402

x402 payment protocol client for AI agents on Sui. Pay for API resources with USDC micropayments.

## Install

```bash
npm install @t2000/x402
```

## What is x402?

The [x402 protocol](https://www.x402.org/) enables machine-to-machine payments for API access. When a server returns HTTP `402 Payment Required`, the client automatically pays and retries — no API keys, no subscriptions, no human approval.

t2000 is the **first x402 client on Sui**.

## Quick Start

```typescript
import { x402Fetch } from '@t2000/x402';
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ passphrase: 'my-secret' });

// Fetch a paid API — handles 402 handshake automatically
const response = await x402Fetch('https://api.example.com/data', {
  agent,
  maxPrice: 0.10, // max USDC per request
});

const data = await response.json();
```

## CLI Usage

```bash
# Pay for an API request
t2000 pay https://api.example.com/data

# With max price limit
t2000 pay https://api.example.com/premium --max-price 0.10

# POST request with data
t2000 pay https://api.example.com/analyze --method POST --data '{"text":"hello"}'
```

## How It Works

1. Agent makes HTTP request to the URL
2. Server returns `402 Payment Required` with payment terms
3. t2000 signs and broadcasts USDC payment via Sui Payment Kit
4. Facilitator verifies payment on-chain
5. Server returns the API response

Total round-trip: ~820ms.

## Server-Side (Facilitator)

```typescript
import { verifyPayment, settlePayment } from '@t2000/x402';

// Verify a payment transaction
const result = await verifyPayment({
  txDigest: '...',
  expectedAmount: 10000, // 0.01 USDC in raw units
  expectedRecipient: '0x...',
});

// Settle (mark as used)
await settlePayment({ txDigest: '...' });
```

## Safety

- Payments only broadcast after 402 terms are validated
- Default max price: $1.00 USDC per request
- On-chain nonce enforcement prevents replay attacks (Sui Payment Kit `EDuplicatePayment`)

## License

MIT
