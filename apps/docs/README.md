# @t2000/docs — `developers.t2000.ai`

Source for the Mintlify-hosted developer documentation site at [`developers.t2000.ai`](https://developers.t2000.ai).

Sectioned nav (S.702 "virtuals-style" restructure — see `docs.json` for the SSOT): **Get started** (index, quickstart, use-from-your-agent, platform) · **Wallet & payments** · **Identity** (agent-id) · **Private Inference** (private-api, authentication, models, use-with-your-tools) · **Confidential AI** (8 pages) · **Reference** (cli-reference, agent-sdk, agent-stack) · **API reference** (OpenAPI-backed) — plus the Recipes and Changelog tabs.

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
| `agent-engine.mdx` | Retired deprecation stub — `@t2000/engine` was deleted from the monorepo. |

When a README changes, mirror the relevant section into the corresponding `.mdx`. Don't fork — keep the README the source-of-truth.

## Deployment

Mintlify auto-deploys on every push to `main` once the project is connected via [Mintlify dashboard](https://dashboard.mintlify.com/). CNAME `developers.t2000.ai` → `cname.mintlify.app`.

## Brand

- Primary color: `#00D395` (matches the README docs badge across packages).
- Voice: Circle-style — short value prop, table-driven sections, code blocks as the verb.
- "Agent" not "Agentic" in consumer-facing copy (per `SPEC_AGENT_WALLET_GREENFIELD.md` locked decision 8).
