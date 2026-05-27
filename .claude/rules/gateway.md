# Gateway Rules (apps/gateway)

## What it is

MPP API gateway at mpp.t2000.ai. Proxies 40+ AI/search/commerce services with Sui USDC micropayments via the Machine Payments Protocol (MPP).

## Key patterns

- Uses `@suimpp/mpp` server plugin for payment verification
- `onPayment` callback receives on-chain data (digest, amount, sender, recipient, currency, network); the gateway captures it via `pendingReports: Map<digest, PaymentReport>` and joins it with HTTP context (service, endpoint) inside `chargeProxy` / `chargeCustom` for `logPayment()`
- Recipient address: `0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012`
- No external registry — `suimpp.dev` is now a spec + docs site (no `/api/report` endpoint). Payment logging is gateway-local to its NeonDB.

## When modifying

- Test payment flow end-to-end (402 challenge → pay → retry → success)
- Check `openapi.json` reflects changes
- Run `npx @suimpp/discovery check mpp.t2000.ai` to validate
