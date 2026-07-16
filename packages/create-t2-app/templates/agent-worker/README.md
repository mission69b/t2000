# agent-worker

The smallest useful agent: a headless TypeScript worker on the t2000 router.

```bash
npm install
export T2000_API_KEY=sk-...   # free key: agents.t2000.ai/manage
npm start                      # or: npm start -- "your task here"
```

Every call goes through `t2000/auto` — routine work runs on cheap open
models, hard steps escalate, and the `x-t2000-served-model` header (printed
after each run) names the model that served so you can audit every charge.

## Privacy

This repo is pinned via `.t2000/config.json`. `private` keeps every call on
open models with zero data retention — change the pin (or commit it) to make
that the team default. Coding agents like `t2 code` honor the same pin.

## Grow it

- Wrap `run()` in a loop or cron for a standing worker.
- Split planning from execution — the recipe is in `plans/README.md`.
- Work on this repo privately: `npm i -g @t2000/code && t2code`
  (docs: [developers.t2000.ai/t2-code](https://developers.t2000.ai/t2-code)).
