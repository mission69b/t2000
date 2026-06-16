# Gateway Rules (apps/gateway)

## What it is

MPP API gateway at mpp.t2000.ai. Proxies 40+ AI/search/commerce services with Sui USDC micropayments via the Machine Payments Protocol (MPP).

## Key patterns

- Uses `@suimpp/mpp` server plugin for payment verification
- `onPayment` callback receives on-chain data (digest, amount, sender, recipient, currency, network); the gateway captures it via `pendingReports: Map<digest, PaymentReport>` and joins it with HTTP context (service, endpoint) inside `chargeProxy` / `chargeCustom` for `logPayment()`
- Recipient address: `0xb012ac774bee4ee6e4e571a13457eeb7a75c4f2319551bf9d436fd497d57aca1` (rotated S.457; the prior `0x76d70cf9…` treasury key was unrecoverable — funds there (~$20.87) are stranded until/unless the key surfaces)
- No external registry — `suimpp.dev` is now a spec + docs site (no `/api/report` endpoint). Payment logging is gateway-local to its NeonDB.

## When modifying

- Test payment flow end-to-end (402 challenge → pay → retry → success)
- Check `openapi.json` reflects changes
- Run `npx @suimpp/discovery check mpp.t2000.ai` to validate
