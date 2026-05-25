# SPEC_SDK_v3_SMOKE — `@t2000/sdk@3.1.0` Smoke Checklist

> **Status:** ACTIVE · drafted 2026-05-25 · target: any developer with a funded Sui devnet/mainnet keypair · est. 8-10 min
> **Build smoked:** `@t2000/sdk@3.1.0` (post-S.245/S.269/S.277 — 8 write tools, Volo retained for non-Audric consumers)
> **Live npm:** `npm view @t2000/sdk version` should print `3.1.0`
> **Pre-req:** Node 18+ · a Sui keypair holding ≥$3 USDC + ≥0.1 SUI (gas) on mainnet (or devnet equivalents)

---

## Why this exists

SDK v3.0.0 / v3.1.0 didn't change the SDK's public API — the version bump was driven by `@t2000/engine` migrating to native AI SDK `tool()`. But the SDK is the bottom of the import chain for `@t2000/engine`, `@t2000/cli`, `@t2000/mcp`, and `audric/apps/web-v2`. If a published SDK 3.1.0 broke `T2000.create()` or a tx builder, every downstream package is broken too.

This is a lean **API-surface canary** — install fresh from npm, run the 5 most important call sites, confirm none of them crashes or returns the wrong shape. Anything more would duplicate what audric SMOKE-1 already exercises end-to-end.

---

## Setup (2 min)

```bash
mkdir /tmp/sdk-smoke && cd /tmp/sdk-smoke
pnpm init -y
pnpm add @t2000/sdk@latest
node -e "console.log(require('@t2000/sdk/package.json').version)"
# expect: 3.1.0
```

Export the funded keypair's private key (Sui suiprivkey format) as `SDK_SMOKE_KEY`:

```bash
export SDK_SMOKE_KEY="suiprivkey1..."
```

---

## SDK-SMOKE-1 — Install + version (1 min)

```bash
node -e "const sdk = require('@t2000/sdk'); console.log(Object.keys(sdk).sort().join('\n'))"
```

### Verifiable signal

- ✅ Output includes ≥ all of: `T2000`, `composeTx`, `addFeeTransfer`, `SUPPORTED_ASSETS`, `OVERLAY_FEE_RATE`, `BORROW_FEE_BPS`, `SAVE_FEE_BPS`, `T2000_OVERLAY_FEE_WALLET`, `deserializeCetusRoute`, `assertAllowedAsset`.
- ✅ No `LLMProvider` / `AISDKAnthropicProvider` exports (those live in engine, deleted in v3.1.0 — but a stray SDK re-export would indicate a build regression).

---

## SDK-SMOKE-2 — `T2000.fromPrivateKey()` + `balance()` (2 min)

```bash
cat > smoke.ts <<'EOF'
import { T2000 } from '@t2000/sdk';
const agent = await T2000.fromPrivateKey(process.env.SDK_SMOKE_KEY!);
console.log('address:', agent.address());
const b = await agent.balance();
console.log('balance:', JSON.stringify(b, null, 2));
EOF
pnpm tsx smoke.ts
```

### Verifiable signals

- ✅ `agent.address()` returns a `0x`-prefixed 64-char hex.
- ✅ `balance()` returns `{ sui, usdc, available, savings, ... }` — every field a number or 0 (not undefined / NaN).
- ✅ Console does NOT print "Cannot find module '@t2000/sdk/...'" or unresolved dynamic import warnings.

---

## SDK-SMOKE-3 — `composeTx({ steps })` builds a single-write PTB (2 min)

Exercises the canonical write path (S.7 v0.4 canonical-write contract). Build but DO NOT execute.

```bash
cat > compose.ts <<'EOF'
import { T2000, composeTx } from '@t2000/sdk';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const agent = await T2000.fromPrivateKey(process.env.SDK_SMOKE_KEY!);
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet') });

const composed = await composeTx({
  sender: agent.address(),
  client,
  sponsoredContext: false,
  steps: [{ toolName: 'send_transfer', input: { to: agent.address(), amount: 0.01, asset: 'USDC' } }],
});

console.log('txKindBytes len:', composed.txKindBytes.byteLength);
console.log('allowedAddresses:', composed.derivedAllowedAddresses);
console.log('perStepPreviews:', JSON.stringify(composed.perStepPreviews, null, 2));
EOF
pnpm tsx compose.ts
```

### Verifiable signals

- ✅ `txKindBytes` is a `Uint8Array` with length > 0.
- ✅ `derivedAllowedAddresses` includes the sender's own address.
- ✅ `perStepPreviews[0].toolName === 'send_transfer'`.
- ✅ No errors thrown. (If `insufficient balance` fires that's still a SUCCESS — the SDK reached the chain, validated, and refused — confirming the canonical write path works.)

---

## SDK-SMOKE-4 — Chain-mode `composeTx` with `inputCoinFromStep` (Phase 7 P7.2) (2 min)

Verifies the SDK consumes `WriteStep.inputCoinFromStep` and threads the producer's output coin into the consumer's input. Tests the SAME path Audric's prepare-route uses for chain-mode bundles.

```bash
cat > chainmode.ts <<'EOF'
import { T2000, composeTx } from '@t2000/sdk';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const agent = await T2000.fromPrivateKey(process.env.SDK_SMOKE_KEY!);
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet') });

const composed = await composeTx({
  sender: agent.address(),
  client,
  sponsoredContext: false,
  steps: [
    { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 0.5, slippage: 0.005 } },
    { toolName: 'save_deposit', input: { amount: 0.5, asset: 'USDsui' }, inputCoinFromStep: 0 },
  ],
});

console.log('chain-mode composed; bytes len:', composed.txKindBytes.byteLength);
console.log('perStepPreviews:', composed.perStepPreviews.length);
EOF
pnpm tsx chainmode.ts
```

### Verifiable signals

- ✅ Composes without throwing `CHAIN_MODE_INVALID` (forward-only reference, asset-aligned).
- ✅ `perStepPreviews.length === 2`.
- ✅ No "no coins for type X owned by …" error — the consumer's `selectAndSplitCoin` IS being suppressed because `inputCoinFromStep` rewires the input.

---

## SDK-SMOKE-5 — `deserializeCetusRoute` roundtrip (Phase 7 P7.3) (1 min)

Verifies the SDK's serialize → JSON → deserialize → consume path doesn't drop data. **Must use the standalone `getSwapQuote` function** — the instance method `agent.swapQuote()` is a thinner CLI-facing wrapper that does NOT return `serializedRoute` (only `getSwapQuote` does, per `SwapQuoteResult` shape).

```bash
cat > route.ts <<'EOF'
import { T2000, getSwapQuote, deserializeCetusRoute } from '@t2000/sdk';
const agent = await T2000.fromPrivateKey(process.env.SDK_SMOKE_KEY!);
const quote = await getSwapQuote({
  walletAddress: agent.address(),
  from: 'USDC',
  to: 'USDsui',
  amount: 0.5,
});
console.log('quote shape:', Object.keys(quote).sort().join(', '));
const serialized = quote.serializedRoute!;
const json = JSON.parse(JSON.stringify(serialized));
const rehydrated = deserializeCetusRoute(json);
console.log('rehydrated amountIn:', rehydrated.amountIn.toString());
console.log('rehydrated amountOut:', rehydrated.amountOut.toString());
EOF
pnpm tsx route.ts
```

### Verifiable signals

- ✅ `quote.serializedRoute` is defined and is an object with `routerData`, `amountIn`, `amountOut`, `byAmountIn`.
- ✅ `JSON.stringify` → `JSON.parse` → `deserializeCetusRoute` rehydrates without throwing.
- ✅ `rehydrated.amountIn.toString()` yields a positive number string (BN serialized as digits).

### Why `getSwapQuote` not `agent.swapQuote`

`agent.swapQuote()` (instance method in `t2000.ts:519-566`) returns a simplified `SwapQuoteResult` with only `fromAmount` / `toAmount` / `priceImpact` / `route` — no `serializedRoute`. The standalone `getSwapQuote()` (in `swap-quote.ts:9-104`) IS the canonical engine-facing variant: it calls `serializeCetusRoute()` and pins the route onto the result so the engine can stamp it on `pending_action.cetusRoute` for SPEC 20.2 fast-path. The duplication between the two is an SDK-ARCH-REVIEW finding (S.318).

---

## Wrap-up

If all 5 items pass, SDK 3.1.0 is shippable from npm. The downstream impact surface is now safe to consume from `@t2000/engine`, `@t2000/cli`, `@t2000/mcp`, and audric.

If any item fails:

1. Re-install `@t2000/sdk@latest` (could be a stale local cache).
2. Print the actual error + the step number into `audric-build-tracker.md` as the new S.NNN entry.
3. Stop the smoke and triage — don't proceed to dependent SMOKE checklists.

## Done?

Move this file to `spec/archive/<version>/SPEC_SDK_v3_SMOKE.md` after the founder confirms PASSED. Same convention as `SPEC_AI_SDK_HARDENING_PHASE_5_SMOKE.md`.
