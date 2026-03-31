# Gateway Rules (apps/gateway)

## What it is

MPP API gateway at mpp.t2000.ai. Proxies 40+ AI/search/commerce services with Sui USDC micropayments via the Machine Payments Protocol (MPP).

## Key patterns

- Uses `@suimpp/mpp` server plugin for payment verification
- `onPayment` callback enriches on-chain data with HTTP context (service, endpoint)
- Reports payments to `suimpp.dev/api/report` with digest, amount, service, endpoint
- Recipient address: `0x76d70cf9d3ab7f714a35adf8766a2cb25929cae92ab4de54ff4dea0482b05012`

## When modifying

- Test payment flow end-to-end (402 challenge → pay → retry → success)
- Verify reporting reaches suimpp.dev
- Check `openapi.json` reflects changes
- Run `npx @suimpp/discovery check mpp.t2000.ai` to validate
