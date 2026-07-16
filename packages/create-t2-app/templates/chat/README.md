# chat

Streaming AI chat on the t2000 router — Next.js, no AI SDK, every byte of
the wiring visible in two files.

```bash
npm install
cp .env.example .env.local   # add your key — free at agents.t2000.ai/manage
npm run dev                  # localhost:3000
```

- `app/api/chat/route.ts` — the whole backend: relays messages to
  `api.t2000.ai/v1` with `model: t2000/auto` and streams the SSE response
  back. Your key never reaches the browser.
- `app/page.tsx` — the whole frontend: a ~30-line SSE parser instead of a
  framework dependency.

The header badge shows `x-t2000-served-model` — which model the router
actually picked for the last answer, so every charge is auditable.

## Privacy

This repo is pinned via `.t2000/config.json`. `private` keeps every call on
open models with zero data retention. Coding agents like `t2 code` honor the
same pin — work on this repo with `npm i -g @t2000/code && t2code`
(docs: [developers.t2000.ai/t2-code](https://developers.t2000.ai/t2-code)).
