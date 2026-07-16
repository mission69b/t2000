# agent-worker

A headless agent worker on the t2000 router (`api.t2000.ai/v1`, model
`t2000/auto`). TypeScript, tsx runner, no framework.

## Ground rules

- Keep the worker single-purpose; grow by composing workers, not by adding
  flags to one.
- `T2000_API_KEY` comes from the environment — never commit it, never
  hardcode it.
- Model stays `t2000/auto` unless a task provably needs pinning; the router
  picks the cheapest capable model per call.
- This repo's privacy mode is pinned in `.t2000/config.json` — do not
  override it in code.

## Plans

`plans/` holds written work plans (advisor → executor). See
`plans/README.md` for the plan-expensive / execute-cheap recipe.
