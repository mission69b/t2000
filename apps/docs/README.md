# @t2000/docs — `developers.t2000.ai`

Source for the Mintlify-hosted developer documentation site at [`developers.t2000.ai`](https://developers.t2000.ai).

Five pages, flat nav, mirrors [`developers.circle.com/agent-stack`](https://developers.circle.com/agent-stack):

| Page | Path | What's on it |
|---|---|---|
| Quickstart | `/` (`index.mdx`) | Install + first-send walkthrough + 4-card landing |
| Agent Wallet | `/agent-wallet` | `t2` CLI command surface + MCP integration + Skills inventory |
| Agent Payments | `/agent-payments` | `t2 pay` + MPP gateway service catalog (40+ paid APIs) |
| Agent SDK | `/agent-sdk` | `@t2000/sdk` TypeScript reference — Agent Wallet API + programmatic DeFi |
| Agent Engine | `/agent-engine` | `@t2000/engine` overview — Agent Harness / Reasoning / Memory / AdviceLog |

## Local development

```bash
pnpm install
pnpm --filter @t2000/docs dev
```

Opens `http://localhost:3000` with live reload.

<!-- prettier-ignore -->
> **Node version.** The Mintlify CLI 4.x requires Node LTS (22 or 24). The rest of the monorepo runs on Node 25, so `mintlify dev` / `mintlify validate` will fail with `not supported on node versions 25+` if you don't switch first.
>
> ```bash
> nvm use 22       # or fnm use 22 / brew switch
> pnpm --filter @t2000/docs dev
> ```
>
> Structural validation that runs on any Node version:
>
> ```bash
> jq . apps/docs/docs.json                                                # JSON valid
> jq -r '.navigation.pages[]' apps/docs/docs.json | while read p; do      # nav pages exist
>   test -f "apps/docs/$p.mdx" && echo "✓ $p.mdx" || echo "✗ MISSING $p.mdx"
> done
> ```

## Source of truth

Each page is a curated, Mintlify-flavored view of the canonical package README:

| Page | Pulls from |
|---|---|
| `index.mdx` | `t2000-skills/README.md` quickstart + repo top-level value prop |
| `agent-wallet.mdx` | `packages/cli/README.md` + `packages/mcp/README.md` + `t2000-skills/README.md` |
| `agent-payments.mdx` | `apps/gateway/README.md` + `packages/cli/README.md` (pay section) |
| `agent-sdk.mdx` | `packages/sdk/README.md` |
| `agent-engine.mdx` | `packages/engine/` description + `CLAUDE.md` (Audric Intelligence 4-system model) |

When a README changes, mirror the relevant section into the corresponding `.mdx`. Don't fork — keep the README the source-of-truth.

## Deployment

Mintlify auto-deploys on every push to `main` once the project is connected via [Mintlify dashboard](https://dashboard.mintlify.com/). CNAME `developers.t2000.ai` → `cname.mintlify.app`.

## Brand

- Primary color: `#00D395` (matches the README docs badge across packages).
- Voice: Circle-style — short value prop, table-driven sections, code blocks as the verb.
- "Agent" not "Agentic" in consumer-facing copy (per `SPEC_AGENT_WALLET_GREENFIELD.md` locked decision 8).
