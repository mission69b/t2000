# sui-dapp

A Sui dApp on the t2000 router: dapp-kit wallet connect, gRPC balance
reads, and a streaming AI copilot on `t2000/auto` (`api.t2000.ai/v1`).

## Sui ground rules

- **gRPC only for reads/writes.** Sui JSON-RPC is deactivated on mainnet
  July 31, 2026. Every read goes through `SuiGrpcClient`
  (`@mysten/sui/grpc`) in `app/api/balance/route.ts` — never add
  `SuiJsonRpcClient` code. (The JSON-RPC client inside `app/providers.tsx`
  is dapp-kit-internal wallet plumbing only; do not use it for app reads.)
- **Floor, never round, displayed amounts.** A shown amount must be `<=` the
  on-chain balance or a downstream transaction builder overdraws — see the
  BigInt flooring in `app/api/balance/route.ts`.
- Validate addresses with `isValidSuiAddress()` before any chain call.
- Transactions: build with `Transaction` from `@mysten/sui/transactions`,
  sign with dapp-kit's `useSignAndExecuteTransaction`, simulate before
  signing.
- **Install the official Sui Agent Skills** for deep Move/PTB/object-model
  guidance: `npx skills add mystenlabs/skills --all` (by Mysten Labs,
  maintained against docs.sui.io).

## App ground rules

- `T2000_API_KEY` is server-only (`.env.local`, read in the route handler) —
  never expose it to the client bundle.
- Model stays `t2000/auto`; the router picks the cheapest capable model per
  call and `x-t2000-served-model` reports which.
- This repo's privacy mode is pinned in `.t2000/config.json` — do not
  override it in code.
- The copilot explains; the wallet signs. Never wire the AI to move funds.

## Plans

`plans/` holds written work plans (advisor → executor). See
`plans/README.md` for the plan-expensive / execute-cheap recipe.
