---
name: t2000-financial-amounts
description: >-
  Money and token-metadata safety — floor display amounts (never round up),
  per-token decimal precision, preset/chip amount math, and the canonical token
  registry that owns every coin type and decimal count. Use when formatting or
  displaying a balance, computing a max/percentage/preset amount, converting
  between display and raw on-chain units, passing an amount into an SDK builder
  (send / swap / pay), adding or resolving a token, or debugging an unexpected
  "Insufficient balance" error.
---

# Financial Amount + Token Data Safety

`CLAUDE.md` rules 6 and the constants section state the invariants. This is the
detail.

## Floor display amounts — never round up

Any amount shown to users or passed to an SDK transaction builder must be **≤**
the actual on-chain balance. `Math.round` can round *up*, producing more raw units
than the user holds → "Insufficient balance".

```typescript
// ❌ BAD — Math.round(1.1286 * 100) / 100 = 1.13 (more than on-chain!)
const amount = Math.round(rawAmount * 100) / 100;

// ✅ GOOD — Math.floor always produces amount <= actual
const amount = Math.floor(rawAmount * 10000) / 10000;
```

## Token decimal precision

Floor to the token's on-chain decimals, capped at 8:

| Token | On-chain decimals | Display floor |
|---|---|---|
| SUI | 9 | 4 dp |
| USDC | 6 | 2 dp |
| GOLD (XAUM) | 9 | 8 dp |
| anything else | — | `Math.min(decimals, 8)` dp |

**Never hardcode these at a call site** — read them from the registry (below).

## SDK transaction amounts

Any SDK builder taking an amount converts via `amount * 10^decimals`. A display
amount that was rounded UP produces more raw units than the user has → the tx
fails. The live write surface is **send · swap · pay**; the floor-not-round rule
applies to every one of them.

## Preset amounts for chip flows

For assets with tiny balances (< 0.01), use dynamic precision:

```typescript
const dp = held >= 1 ? 100 : held >= 0.01 ? 10000 : 100000000;
const preset = Math.floor(held * fraction * dp) / dp;
```

---

## Token data — canonical sources

| Data | Export | Location |
|------|--------|----------|
| Swap-supported names → coin types | `TOKEN_MAP` | `packages/sdk/src/token-registry.ts` (derived from `COIN_REGISTRY`) |
| Token metadata (coin types, decimals, symbols) | `SUPPORTED_ASSETS` | `packages/sdk/src/constants.ts` |
| Resolvers (`resolveSymbol`, `resolveTokenType`, `getDecimalsForCoinType`) | `COIN_REGISTRY` | `packages/sdk/src/token-registry.ts` |

### Rules

1. **Never create a new token map.** Import from the canonical source above.
2. **Adding a token** = update `TOKEN_MAP` in the SDK. Everything downstream
   (system prompt, swap resolution) derives from it automatically.
3. **Decimals are registry data, not call-site literals.** USDSUI, USDe, suiUSDT
   are all 6 decimals — encoded in `COIN_REGISTRY` / `SUPPORTED_ASSETS`.
4. **Frontend token lists** import from the SDK registry; don't duplicate
   coin-type maps outside the canonical files.

There is no token "tier" gate — USDC is the settlement stable; everything else is
holdable/swappable.

## Related

- Gasless-send amount floors (min 0.01, dust-remainder rule) → `t2000-sui-platform` skill
- Single-source-of-truth principle → `t2000-engineering` skill §2
