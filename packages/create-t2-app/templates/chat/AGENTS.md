# chat

A Next.js streaming chat on the t2000 router (`api.t2000.ai/v1`, model
`t2000/auto`). Deliberately dependency-light: the SSE relay and parser are
hand-written and visible — keep them that way unless a feature genuinely
needs an SDK.

## Ground rules

- `T2000_API_KEY` is server-only (`.env.local`, read in the route handler) —
  never expose it to the client bundle.
- Model stays `t2000/auto`; the router picks the cheapest capable model per
  call and `x-t2000-served-model` reports which.
- This repo's privacy mode is pinned in `.t2000/config.json` — do not
  override it in code.
- App Router conventions: server components by default, `"use client"` only
  where interaction demands it.

## Plans

`plans/` holds written work plans (advisor → executor). See
`plans/README.md` for the plan-expensive / execute-cheap recipe.
