# @t2000/docs — `developers.t2000.ai`

Source for the Mintlify-hosted developer documentation site at [`developers.t2000.ai`](https://developers.t2000.ai).

Nav groups (`docs.json` is the SSOT): **Getting Started** · **Commerce** ·
**Wallet** · **Trading** · **Reference**, plus the Changelog tab.

Models are not documented here. Private Inference and Confidential AI are
[Audric](https://audric.ai) products (SPEC_PI_TO_AUDRIC, 2026-08-01); old
`/private-inference`, `/confidential-ai/*` and `/api-reference/*` URLs redirect
out to `audric.ai`.

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
> jq . apps/docs/docs.json     # JSON valid
> # every nav page exists, and no redirect shadows a live page:
> jq -r '.navigation.tabs[].groups[]?.pages[]?, .navigation.tabs[].pages[]?' apps/docs/docs.json |
>   while read p; do test -f "apps/docs/$p.mdx" || echo "✗ MISSING $p.mdx"; done
> jq -r '.redirects[].source' apps/docs/docs.json |
>   while read s; do test -f "apps/docs/${s#/}.mdx" && echo "✗ SHADOWED $s"; done
> ```
>
> A redirect whose `source` is also a live page silently hides that page — the
> jq check above is the guard.

## Source of truth

Each page is a curated, Mintlify-flavored view of the canonical package README:

| Page | Pulls from |
|---|---|
| `index.mdx` | repo `README.md` top-level value prop |
| `agent-wallet.mdx` | `packages/cli/README.md` + `packages/mcp/README.md` + `t2000-skills/README.md` |
| `pay-any-api.mdx` | `packages/cli/README.md` (pay section) + `packages/serve/README.md` |
| `agent-sdk.mdx` | `packages/sdk/README.md` |

When a README changes, mirror the relevant section into the corresponding `.mdx`. Don't fork — keep the README the source-of-truth.

## Deployment

Mintlify auto-deploys on every push to `main` once the project is connected via [Mintlify dashboard](https://dashboard.mintlify.com/). CNAME `developers.t2000.ai` → `cname.mintlify.app`.

## Brand

- Primary color: `#00D395` (matches the README docs badge across packages).
- Voice: Circle-style — short value prop, table-driven sections, code blocks as the verb.
- "Agent" not "Agentic" in consumer-facing copy (per `SPEC_AGENT_WALLET_GREENFIELD.md` locked decision 8).
