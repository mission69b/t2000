# sui-dapp

Sui dApp starter on the t2000 router — wallet connect (dapp-kit), gRPC
balance reads, and a streaming AI copilot that knows your holdings.

```bash
npm install
cp .env.example .env.local   # add your key — free at agents.t2000.ai/manage
npm run dev                  # localhost:3000
```

- `app/api/balance/route.ts` — reads via `SuiGrpcClient` (**gRPC only** —
  Sui JSON-RPC is deactivated on mainnet July 31, 2026), display
  amounts floored to never exceed on-chain balances.
- `app/api/agent/route.ts` — the AI backend: relays chat + wallet context
  to `api.t2000.ai/v1` with `model: t2000/auto` and streams SSE back. No AI
  SDK; your key never reaches the browser.
- `app/page.tsx` — ConnectButton, holdings panel, and the copilot with a
  ~30-line SSE parser.

The copilot badge shows `x-t2000-served-model` — which model the router
actually picked, so every charge is auditable. The copilot explains; the
wallet signs — the AI is never wired to move funds.

## Recommended: official Sui Agent Skills

For deep Move / PTB / object-model guidance in any coding agent:

```bash
npx skills add mystenlabs/skills --all
```

## Privacy

This repo is pinned via `.t2000/config.json`. `private` keeps every call on
open models with zero data retention. Coding agents like `t2 code` honor the
same pin — work on this repo with `npm i -g @t2000/code && t2code`
(docs: [developers.t2000.ai/t2-code](https://developers.t2000.ai/t2-code)).
