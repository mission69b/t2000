# MPP Integration Spec

> Machine Payments Protocol integration for t2000.
> Build `@t2000/mpp-sui` first (Sui payment method), then integrate into SDK/CLI/MCP.
> Deprecate `@t2000/x402` — don't delete (people may depend on it).

---

## Context

MPP (Machine Payments Protocol) is an open standard by Stripe + Tempo for agent payments.
It supersedes x402. t2000 currently uses `@t2000/x402` for paid API requests.

**What changes:** The payment client library and protocol.
**What doesn't change:** Onboarding, DeFi features (save/borrow/invest), Sui as primary chain.

**Key decisions:**
- No Tempo Wallet dependency — t2000 IS the wallet (keys, safeguards, balance mgmt)
- No service registry / merchant portal — agents discover 402 at runtime, like browsers discover paywalls
- No multi-chain for payments — Sui USDC via custom MPP method, no bridging needed
- Landing page at t2000.ai/mpp — not a separate domain

---

## Build Order

Build the Sui payment method FIRST. Then everything else is wiring.
The agent pays from its existing Sui USDC balance — no new keys, no new chain, no new deposits.

1. `@t2000/mpp-sui` package (standalone — usable by anyone on Sui)
2. SDK `agent.pay()` method (wraps mppx + `@t2000/mpp-sui` + safeguards)
3. MCP `t2000_pay` tool (Claude can pay for APIs conversationally)
4. CLI `t2000 pay` refactor (swap x402 for SDK `agent.pay()`)
5. Deprecate `@t2000/x402`, remove from CLI/server deps
6. Update all docs, website, skills, CI
7. Build t2000.ai/mpp landing page
8. Announce + submit to MPP ecosystem

---

## Product Experience

### User flow

```
User: "Generate me a logo using Fal.ai"
  ↓
Claude → t2000_pay MCP tool (url, body, maxPrice)
  ↓
SDK: agent.pay()
  ├─ Safeguard check (maxPrice vs limits)
  ├─ mppx client: fetch(url) → gets 402 → Sui USDC transfer → credential → retry
  ├─ Receipt extracted from response
  └─ Payment logged to transaction history
  ↓
Claude: "Here's your logo. Paid $0.03 from checking."
```

### CLI commands

```bash
# Pay for an API (auto-handles 402 challenge)
t2000 pay https://api.example.com/resource

# With POST data
t2000 pay https://api.example.com/generate --data '{"prompt": "sunset"}'

# Cap how much you're willing to pay
t2000 pay https://api.example.com/resource --max-price 0.50
```

No `t2000 monetize` command. The "accept payments" side is a developer integration —
`npm install @t2000/mpp-sui` and use `server.ts` in your own API. No CLI wrapper needed.

### What gets built (priority order)

| Layer | What | Priority |
|-------|------|----------|
| `@t2000/mpp-sui` | Sui payment method for MPP (client + server) | Now |
| `agent.pay()` | SDK method wrapping mppx + safeguards + history | Now |
| `t2000_pay` MCP tool | Claude/agents can pay for APIs | Now |
| `t2000 pay` CLI | Terminal can pay for APIs | Now |
| Payment history | Payments logged alongside DeFi operations | Now (existing tx history) |
| Safeguards | Max per request, daily limit on API payments | Now (existing safeguards) |
| t2000.ai/mpp page | Landing page for the Sui payment method | After package ships |

### What NOT to build

| Don't build | Why |
|-------------|-----|
| `t2000 monetize` CLI command | Server-side is just `npm install @t2000/mpp-sui` — no wrapper needed |
| Merchant portal / directory | No services accept Sui USDC via MPP yet |
| `t2000_services` discovery tool | No registry exists to query |
| Tempo Wallet integration | t2000 IS the wallet |
| Multi-chain payment support | Sui custom method avoids this entirely |

### Demo video (for launch)

Same format as the t2000 marketing video. Split screen — terminal + Claude Desktop.

```
User: "Generate a logo for a finance app using Fal.ai"
Claude: [calls t2000_pay → 402 → pays $0.03 → returns image]
        "Here's your logo. Paid $0.03 from checking."

User: "How much have I spent on API calls today?"
Claude: [calls t2000_overview]
        "You've spent $0.12 across 4 API calls today."
```

30 seconds. Shows the magic: user never thinks about payments.

---

## Package: `@t2000/mpp-sui`

Standalone npm package. Any MPP server can accept Sui USDC. Any MPP client on Sui can pay.
Not tied to t2000 — reusable by the whole Sui ecosystem.

**This package IS the monetize feature.** The server export replaces the old
`t2000 monetize` / x402 middleware concept. Any developer can `npm install @t2000/mpp-sui`
and accept Sui USDC on their API in 5 lines. No facilitator service needed — MPP
verification happens directly between client and server.

### Structure

```
packages/mpp-sui/
├── src/
│   ├── index.ts          # Re-exports client + server + method
│   ├── method.ts         # Method.from — shared schema (client + server)
│   ├── client.ts         # Method.toClient — build TX, sign, broadcast, return credential
│   ├── server.ts         # Method.toServer — verify TX via Sui RPC, return receipt
│   └── utils.ts          # fetchCoins (paginated), parseAmountToRaw, USDC constants
├── package.json          # deps: mppx, @mysten/sui, zod
├── tsconfig.json
└── tsup.config.ts
```

### method.ts — Shared schema

```typescript
import { Method, z } from 'mppx';

export const suiCharge = Method.from({
  intent: 'charge',
  name: 'sui',
  schema: {
    credential: {
      payload: z.object({
        digest: z.string(),
      }),
    },
    request: z.object({
      amount: z.string(),
      currency: z.string(),     // Sui USDC coin type
      recipient: z.string(),    // Sui address
    }),
  },
});
```

### client.ts — Agent pays

```typescript
import { Method, Credential } from 'mppx';
import { suiCharge } from './method.js';
import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fetchCoins, parseAmountToRaw } from './utils.js';

interface SuiChargeOptions {
  client: SuiClient;
  signer: Ed25519Keypair;
}

export function sui(options: SuiChargeOptions) {
  const address = options.signer.getPublicKey().toSuiAddress();

  return Method.toClient(suiCharge, {
    async createCredential({ challenge }) {
      const { amount, currency, recipient } = challenge.request;

      // Parse amount from string to raw units without floating-point math.
      // "0.01" → 10000n (USDC has 6 decimals)
      const amountRaw = parseAmountToRaw(amount, 6);

      const tx = new Transaction();
      tx.setSender(address);

      // fetchCoins handles pagination (Sui returns max 50 per page)
      const coins = await fetchCoins(options.client, address, currency);
      if (coins.length === 0) {
        throw new Error(`No ${currency.split('::').pop()} balance to pay with`);
      }

      // Check total balance is sufficient before building TX
      const totalBalance = coins.reduce(
        (sum, c) => sum + BigInt(c.balance), 0n
      );
      if (totalBalance < amountRaw) {
        const available = Number(totalBalance) / 1e6;
        const requested = Number(amountRaw) / 1e6;
        throw new Error(
          `Not enough USDC to pay $${requested.toFixed(2)} (available: $${available.toFixed(2)})`
        );
      }

      const primaryCoin = tx.object(coins[0].coinObjectId);
      if (coins.length > 1) {
        tx.mergeCoins(primaryCoin, coins.slice(1).map(c => tx.object(c.coinObjectId)));
      }

      const [payment] = tx.splitCoins(primaryCoin, [amountRaw]);
      tx.transferObjects([payment], recipient);

      let result;
      try {
        result = await options.client.signAndExecuteTransaction({
          signer: options.signer,
          transaction: tx,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Payment transaction failed: ${msg}`);
      }

      await options.client.waitForTransaction({ digest: result.digest });

      return Credential.serialize({
        challenge,
        payload: { digest: result.digest },
      });
    },
  });
}
```

### server.ts — API accepts Sui USDC

```typescript
import { Method, Receipt } from 'mppx';
import { suiCharge } from './method.js';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

interface SuiServerOptions {
  currency: string;        // Sui USDC coin type
  recipient: string;       // Sui address to receive payment
  rpcUrl?: string;         // Defaults to mainnet fullnode
}

export function sui(options: SuiServerOptions) {
  const client = new SuiClient({
    url: options.rpcUrl ?? getFullnodeUrl('mainnet'),
  });

  return Method.toServer(suiCharge, {
    defaults: {
      currency: options.currency,
      recipient: options.recipient,
    },

    async verify({ credential, request }) {
      const tx = await client.getTransactionBlock({
        digest: credential.payload.digest,
        options: { showEffects: true, showBalanceChanges: true },
      });

      if (tx.effects?.status?.status !== 'success') {
        throw new Error('Transaction failed on-chain');
      }

      const payment = (tx.balanceChanges ?? []).find(bc =>
        bc.coinType === options.currency &&
        typeof bc.owner === 'object' &&
        'AddressOwner' in bc.owner &&
        bc.owner.AddressOwner === options.recipient &&
        Number(bc.amount) > 0
      );

      if (!payment) {
        throw new Error('Payment not found in transaction balance changes');
      }

      // Verify amount matches the challenged request (Edge Case #8)
      const decimals = 6; // USDC
      const transferredAmount = Number(payment.amount) / 10 ** decimals;
      const requestedAmount = Number(request.amount);
      if (transferredAmount < requestedAmount) {
        throw new Error(
          `Transferred $${transferredAmount} < requested $${requestedAmount}`
        );
      }

      return Receipt.from({
        method: 'sui',
        reference: credential.payload.digest,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    },
  });
}
```

### utils.ts — Helpers

```typescript
import type { SuiClient, CoinStruct } from '@mysten/sui/client';

export const SUI_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

/**
 * Fetch ALL coins of a given type (handles Sui pagination — max 50 per page).
 */
export async function fetchCoins(
  client: SuiClient,
  owner: string,
  coinType: string,
): Promise<CoinStruct[]> {
  const coins: CoinStruct[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await client.getCoins({ owner, coinType, cursor });
    coins.push(...page.data);
    cursor = page.hasNextPage ? page.nextCursor : undefined;
  } while (cursor);
  return coins;
}

/**
 * Parse a string amount like "0.01" to raw bigint units without
 * floating-point math. USDC has 6 decimals → "0.01" → 10000n.
 */
export function parseAmountToRaw(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFrac);
}
```

### Usage examples

**Server — any API on Sui:**
```typescript
import { Mppx } from 'mppx/server';
import { sui } from '@t2000/mpp-sui/server';

const SUI_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const mppx = Mppx.create({
  methods: [sui({ currency: SUI_USDC, recipient: '0xYOUR_ADDRESS' })],
});

export const GET = mppx.charge({ amount: '0.01' })(
  () => Response.json({ data: 'paid content' })
);
```

**Client — t2000 agent:**
```typescript
import { Mppx } from 'mppx/client';
import { sui } from '@t2000/mpp-sui/client';

const mppx = Mppx.create({
  polyfill: false,
  methods: [sui({ client: suiClient, signer: keypair })],
});

const response = await mppx.fetch('https://api.example.com/resource');
```

**Multi-method server — accepts Sui + Tempo:**
```typescript
import { Mppx, tempo } from 'mppx/server';
import { sui } from '@t2000/mpp-sui/server';

const mppx = Mppx.create({
  methods: [
    sui({ currency: SUI_USDC, recipient: '0xSUI_ADDRESS' }),
    tempo({ currency: PATH_USD, recipient: '0xTEMPO_ADDRESS' }),
  ],
});
```

---

## SDK Integration

### `agent.pay()` method

```typescript
// packages/sdk/src/t2000.ts

interface PayOptions {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  maxPrice?: number;      // Default $1.00
}

interface PayResult {
  status: number;
  body: unknown;
  paid: boolean;
  cost?: number;          // USD amount paid
  receipt?: {
    reference: string;    // TX digest
    timestamp: string;
  };
}

async pay(options: PayOptions): Promise<PayResult> {
  // 1. Safeguard check (against maxPrice, not the actual 402 price)
  this.enforcer.check({ operation: 'pay', amount: options.maxPrice ?? 1.0 });

  // 2. Create mppx client with Sui payment method
  const mppx = Mppx.create({
    polyfill: false,
    methods: [sui({ client: this.client, signer: this.keypair })],
  });

  // 3. Make the request (mppx handles 402 → credential → retry automatically)
  const response = await mppx.fetch(options.url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
  });

  // 4. Extract payment info
  // NOTE: Verify mppx API for receipt extraction during build —
  // may be response header or mppx response wrapper.
  const paid = response.headers.has('x-payment-receipt');
  const receiptHeader = response.headers.get('x-payment-receipt');

  return {
    status: response.status,
    body: await parseBody(response),
    paid,
    cost: paid ? (options.maxPrice ?? undefined) : undefined,
    receipt: receiptHeader ? {
      reference: receiptHeader,
      timestamp: new Date().toISOString(),
    } : undefined,
  };
}
```

### Gas handling

Inside the SDK, `agent.pay()` routes the payment TX through `executeWithGas` for
gas sponsorship and auto top-up. The standalone `@t2000/mpp-sui` package does NOT
handle gas — it assumes the caller has SUI for gas.

### MCP tool

```typescript
// packages/mcp/src/tools/write.ts

't2000_pay',
'Make a paid API request. Automatically handles MPP 402 payment challenges ' +
'using the agent\'s USDC balance. Enforces safeguards. Returns the API response ' +
'and payment receipt.',
{
  url: z.string().describe('URL of the MPP-protected resource'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  body: z.string().optional().describe('JSON request body'),
  maxPrice: z.number().default(1.0).describe('Max USD to pay'),
},
```

**Claude Desktop UX:**
```
User: "Generate a logo using Fal.ai — a minimal icon for a finance app"
Claude: I'll call the Fal.ai API for you.
        [calls t2000_pay]
        Generated your logo. Paid $0.03 from checking.
```

---

## t2000.ai/mpp Landing Page

Simple, clean page — similar aesthetic to mpp.dev. Not a portal. Not a marketplace.
Three sections:

### 1. Hero
> **Sui payments for MPP**
> Accept Sui USDC on any MPP-protected API. One package. Five lines of code.
>
> `npm install @t2000/mpp-sui`

### 2. For API developers (server)
Code snippet: 5-line server setup accepting Sui USDC.

### 3. For agents (client)
"t2000 agents pay automatically" — show the Claude Desktop UX flow.
Link to t2000.ai for the full product.

Build this AFTER the package ships, not before.

---

## x402 Migration Plan

### Don't delete. Deprecate.

People may depend on `@t2000/x402`. Deleting breaks them.

| Action | Details |
|--------|---------|
| `npm deprecate @t2000/x402` | Message: "Deprecated. Use @t2000/mpp-sui instead." |
| Keep `packages/x402/` in repo | Freeze — no new versions |
| Remove from CLI `package.json` | CLI uses SDK `agent.pay()` now |
| Keep Prisma `X402Payment` model | Historical data — don't drop the table |

**Not needed (monetize is now the package itself):**
| Action | Why not needed |
|--------|---------------|
| Remove x402 from server `package.json` | x402 routes stay as legacy, no new server deps needed |
| Add `MppPayment` Prisma model | No facilitator — MPP verification is peer-to-peer |
| New MPP route on t2000 server | t2000 server isn't a merchant — developers use the package directly |
| Server/indexer Dockerfile changes | No server changes at all |

The old `t2000 monetize` CLI command (Phase 12 in roadmap v2) is subsumed by
`@t2000/mpp-sui/server`. Developers just `npm install` the package — no CLI wrapper needed.

### File-by-file migration

**Code changes (now):**

| File | Change |
|------|--------|
| `packages/cli/src/commands/pay.ts` | Replace x402 imports with `agent.pay()` |
| `packages/cli/package.json` | Remove `@t2000/x402` dep |
| `packages/sdk/src/t2000.ts` | Add `pay()` method |

**No server changes needed:**

| File | Status |
|------|--------|
| `apps/server/src/routes/x402.ts` | Keep as legacy — no new routes needed |
| `apps/server/src/index.ts` | No change |
| `apps/server/package.json` | No change — monetize ships via npm package, not the server |

**Docs/copy updates (text):**

| File | Change |
|------|--------|
| `README.md` | x402 section → MPP section |
| `PRODUCT_FACTS.md` | x402 refs → MPP |
| `CLI_UX_SPEC.md` | Update `t2000 pay` output format |
| `SECURITY.md` | x402 → MPP verification |
| `SECURITY_AUDIT.md` | x402 scope → MPP scope |

**Website updates (UI):**

| File | Change |
|------|--------|
| `apps/web/app/page.tsx` | "x402" → "MPP", update steps/labels |
| `apps/web/app/docs/page.tsx` | x402 section → MPP section |
| `apps/web/app/demo/page.tsx` | Meta description update |
| `apps/web/app/demo/CinematicWalkthrough.tsx` | "x402" → "MPP" in animation |
| `apps/web/app/api/stats/route.ts` | Add MPP stats alongside x402 |
| `apps/web/app/stats/StatsView.tsx` | "x402 Payments" → "MPP Payments" |
| `apps/web/app/mpp/page.tsx` | NEW — landing page for @t2000/mpp-sui |

**Skills updates (text):**

| File | Change |
|------|--------|
| `t2000-skills/skills/t2000-pay/SKILL.md` | x402 → MPP |
| `t2000-skills/skills/t2000-send/SKILL.md` | x402 cross-ref → MPP |
| `t2000-skills/skills/t2000-safeguards/SKILL.md` | x402 → MPP |
| `t2000-skills/README.md` | x402 → MPP |

**CI/Infra (now):**

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Add `@t2000/mpp-sui` build/test/typecheck |
| `.github/workflows/publish.yml` | Add `@t2000/mpp-sui` publish step |

**No server/indexer/ECS changes needed.** The indexer never handled x402, and MPP
payments are plain USDC transfers (no custom contract, no events to index).
The t2000 server doesn't need MPP — developers use `@t2000/mpp-sui` directly
in their own servers. No facilitator service needed.

---

## Edge Cases

### 1. USDC coin fragmentation

Agent's USDC may be split across multiple coin objects. The client must merge
coins before splitting the payment amount. `utils.ts` handles this with
`fetchCoins` + merge logic in the Transaction.

### 2. Insufficient USDC

Client checks balance before building the TX. If insufficient, throws
a clear error: "Not enough USDC to pay $X.XX (available: $Y.YY)".

### 3. Gas for payment TXs

The standalone `@t2000/mpp-sui` doesn't handle gas — assumes caller has SUI.
Inside t2000's SDK, `agent.pay()` routes through `executeWithGas` for
gas sponsorship and auto top-up.

### 4. TX confirmation race

Client waits for TX confirmation before sending credential. Server
calls `getTransactionBlock` which returns immediately for confirmed TXs.
No race condition — the client ensures confirmation first.

### 5. Double payment

MPP's challenge/credential model handles this — each challenge has a unique ID,
so replaying a credential against a different challenge fails validation.

### 6. Max price safeguard

`agent.pay()` checks `maxPrice` against safeguards BEFORE making the request.
If the 402 challenge returns a price above `maxPrice`, mppx client should reject.
Need to verify mppx has this built in, or add it in our `createCredential` wrapper.

### 7. Payment Kit contract (x402 legacy)

The x402 implementation used a custom Sui Move contract (Payment Kit).
MPP does NOT need this — it uses plain USDC transfers. The Payment Kit
contract stays on-chain but is no longer used by new code.

### 8. Server-side amount verification

The server `verify` function checks the actual on-chain transfer amount
matches the challenged request amount. Implemented in `server.ts` above —
compares `transferredAmount >= requestedAmount`.

### 9. Coin pagination

Sui's `getCoins` RPC returns max 50 coin objects per page. If the agent
has >50 USDC fragments, we'd miss some and potentially underpay. `fetchCoins`
in `utils.ts` paginates until all coins are fetched before merging.

---

## Tests

### `@t2000/mpp-sui` — unit tests (~15 tests)

**`parseAmountToRaw`** (5 tests):
- `"1"` → `1000000n`
- `"0.01"` → `10000n`
- `"0.000001"` → `1n` (smallest USDC unit)
- `"100.50"` → `100500000n`
- `"0.0000001"` → `0n` (below precision, truncated)

**`fetchCoins`** (3 tests, mock SuiClient):
- Returns all coins from single page
- Paginates across multiple pages (mock `hasNextPage: true`)
- Returns empty array when no coins exist

**`server.ts` verify** (5 tests, mock `getTransactionBlock`):
- Accepts valid TX with correct amount and recipient
- Rejects failed TX (`effects.status !== 'success'`)
- Rejects TX where payment not sent to recipient
- Rejects TX where amount is less than requested
- Rejects TX with no balance changes

**`client.ts` createCredential** (3 tests, mock SuiClient):
- Builds valid TX with single coin
- Merges multiple coins before splitting
- Throws on insufficient balance with clear error message

### SDK — unit tests (~5 tests)

**`agent.pay()`** (3 tests, mock mppx):
- Safeguard blocks payment above limit
- Returns `paid: true` with receipt on successful payment
- Returns `paid: false` when endpoint isn't 402-gated

**MCP `t2000_pay` tool** (2 tests):
- Schema validates required params (url)
- Maps to `agent.pay()` with correct args

### Integration test (1 test, optional — requires testnet)

- Client pays a local test server, server verifies, receipt returned.
  Only run manually or in CI with testnet keys.

**Total: ~21 tests. Covers every code path without testing mppx internals.**

---

## Rollout

| Step | Time | What |
|------|------|------|
| 1 | Days 1-3 | Build `@t2000/mpp-sui` (method, client, server, utils, tests) |
| 2 | Day 4 | Integrate into SDK (`agent.pay()`, safeguards, history logging) |
| 3 | Day 5 | Add `t2000_pay` MCP tool + refactor CLI `pay.ts` |
| 4 | Day 6 | Update docs, website copy, skills, CI |
| 5 | Day 7 | Publish `@t2000/mpp-sui` + updated SDK/CLI/MCP |
| 6 | Day 7 | Deprecate `@t2000/x402` on npm |
| 7 | Day 8 | Build t2000.ai/mpp landing page |
| 8 | Day 9 | Announce: tweet, submit to MPP ecosystem, post demo video |

**No server/indexer/ECS changes needed.** Agent payments are entirely client-side
(SDK → mppx → Sui TX). Monetize ships as `@t2000/mpp-sui/server` — no separate phase.

---

## Open Questions

1. **Does mppx enforce maxPrice on the client?** If the 402 challenge says
   "pay $50" but user set maxPrice to $1, does mppx reject automatically?
   If not, add the check in `createCredential` before building the TX.

2. **MPP ecosystem listing** — Can `@t2000/mpp-sui` be listed as an official
   MPP payment method alongside Tempo, Stripe, Lightning? Submit PR to
   mpp.dev docs / payment-methods. Gives Sui visibility in MPP ecosystem.

3. **Session/streaming intents** — MPP supports `session` and `stream` intents
   beyond `charge`. Not for v1 — start with `charge` (one-time payments)
   and add session later if there's demand for pay-as-you-go APIs.

4. **Amount precision** — ✅ Resolved. `parseAmountToRaw()` in `utils.ts` converts
   string amounts to bigint raw units via string splitting, not `Number()` multiplication.
   `"0.01"` → `10000n` with zero floating-point risk.
