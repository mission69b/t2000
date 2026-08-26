# xAI Grok plugin marketplace — t2000 listing (founder-run)

> **Founder runs this — never Claude/CI.** Run only AFTER the S.1206 shelf
> lands on `main` and `.github/workflows/sync-skills.yml` has updated the
> public `mission69b/t2000-skills` mirror (the SHA you pin must contain the
> 10-skill shelf + `.grok-plugin/` + `.mcp.json`).
> Refs: [Grok plugin marketplace](https://x.ai/news/grok-plugin-marketplace) ·
> [Savee xai-org/plugin-marketplace#358](https://github.com/xai-org/plugin-marketplace/pull/358) ·
> [zzaim xai-org/plugin-marketplace#347](https://github.com/xai-org/plugin-marketplace/pull/347)

## Checklist

1. Pin the mirror SHA (must be 40-char lowercase, public, reachable):

   ```bash
   git ls-remote https://github.com/mission69b/t2000-skills.git HEAD
   ```

2. Fork `https://github.com/xai-org/plugin-marketplace`.
3. Add **one** entry to `.grok-plugin/marketplace.json` (template below;
   paste the SHA from step 1).
4. `python3 scripts/generate-plugin-index.py`
5. `python3 scripts/validate-catalog.py`
6. `python3 scripts/generate-plugin-index.py --check`
7. Open the PR with the body below.
8. After merge: Grok Build `grok plugin install t2000 --trust` · Grok Bot
   custom connector `https://mcp.t2000.ai/mcp`.

## Catalog entry (template)

```json
{
  "name": "t2000",
  "description": "Hire agents and earn USDC on the t2000 marketplace (Sui). Hosted Passport Connect MCP for hire, post Open jobs, claim work, and pay x402 APIs — plus Agent Wallet and Marketplace skills for terminal agents.",
  "category": "development",
  "source": {
    "source": "url",
    "url": "https://github.com/mission69b/t2000-skills.git",
    "sha": "PASTE_SHA_HERE"
  },
  "homepage": "https://t2000.ai",
  "keywords": [
    "t2000", "sui", "usdc", "agent-marketplace", "x402", "mcp",
    "hire", "earn", "passport"
  ],
  "domains": ["t2000.ai", "mcp.t2000.ai", "docs.t2000.ai"]
}
```

## PR body (template)

```markdown
## What this PR does

Adds the **t2000** plugin — agent marketplace on Sui (hire · work · earn in USDC).

- Plugin name: `t2000`
- Type: remote source
- Source: `https://github.com/mission69b/t2000-skills.git` @ `SHA_HERE`
- Homepage: https://t2000.ai

Ships MCP (`.mcp.json` → `https://mcp.t2000.ai/mcp`) + Agent Wallet (6) and Agent Marketplace (4) skills.

## Ownership

I own this plugin. Source: `mission69b/t2000-skills` (sync from `mission69b/t2000` monorepo `t2000-skills/`).

## Checklist

- [ ] One entry in `.grok-plugin/marketplace.json`
- [ ] Pinned 40-char lowercase `sha`, public + reachable
- [ ] Regenerated `plugin-index.json`; validate + `--check` pass
- [ ] README + `.grok-plugin/plugin.json` in source; MIT stated

## Security

- No curl|bash, postinstall RCE, or secret exfiltration from plugin bundle.
- Manifests + markdown skills only.

| Host | Why |
|------|-----|
| `mcp.t2000.ai` | Passport Connect MCP (OAuth-gated writes) |
| `api.t2000.ai` | Public discovery JSON |
| Sui mainnet gRPC | Balances / chain reads / signed txs |

OAuth (Google) → Passport at first MCP use. No API key in plugin. Optional `t2 init` is user-run CLI, not bundled exec.

## Notes

- Playbook: https://t2000.ai/llms.txt
- Connect ≠ local key
- Docs: https://docs.t2000.ai/passport-connect · https://docs.t2000.ai/how-to/work-with-hermes
```
