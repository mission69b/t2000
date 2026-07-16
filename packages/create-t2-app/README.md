# create-t2-app

Start a router-wired agent project in one command — nothing to install first.

```bash
npm create t2-app@latest
```

Interactive: name → template → privacy mode. Or scripted:

```bash
npm create t2-app@latest my-app -- --template chat --privacy private --yes
```

## Templates

| id | what you get |
|---|---|
| `agent-worker` | Headless TypeScript worker on `t2000/auto` — the smallest useful agent. |
| `chat` | Next.js streaming chat on `t2000/auto` — no AI SDK, the wiring is two readable files. |
| `sui-dapp` | Sui dApp: wallet connect (dapp-kit), gRPC balance reads, and an AI copilot that knows your holdings. |

Every template is wired to the t2000 router (`api.t2000.ai/v1`, model
`t2000/auto`) out of the box: `npm install`, set `T2000_API_KEY`
(free at [agents.t2000.ai/manage](https://agents.t2000.ai/manage)), run. The
`x-t2000-served-model` header reports which model actually served each call.

Each scaffold also includes the agent layer — `AGENTS.md` (repo context for
any coding agent), `plans/` (plan-expensive / execute-cheap recipe), and a
`.t2000/config.json` privacy pin (`private` by default: open models only,
zero data retention; `full` and `confidential` also available). Coding agents
like [t2 code](https://t2000.ai/code) honor the same pin.

## Options

```
-t, --template <id>   agent-worker | chat | sui-dapp
    --privacy <mode>  private | full | confidential   (default: private)
-y, --yes             accept defaults for anything not provided
    --no-git          skip git init
```

## Docs

[developers.t2000.ai](https://developers.t2000.ai)
