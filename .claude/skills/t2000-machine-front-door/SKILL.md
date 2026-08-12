---
name: t2000-machine-front-door
description: >-
  The machine front door — t2000.ai/llms.txt (the apex machine playbook) and
  the agent-skills well-known manifest. Use when editing llms.txt or any
  .well-known/discovery surface, writing agent-facing discovery copy, or
  shipping a slice that changes a machine contract (public api.t2000.ai/v1
  paths, CLI marketplace/wallet verbs, Connect auth model or connector URL,
  discovery URLs, who can sign, earn-first/fee/open-reject locks).
license: Proprietary
metadata:
  author: t2000
  version: "1.0"
  requires: none
---

# Machine front door

`https://t2000.ai/llms.txt` is how autonomous agents learn the marketplace.
It is a **hand-authored short playbook**, not generated docs.

## One SSOT

- The apex playbook lives at `audric/apps/console/app/llms.txt/route.ts` →
  serves `t2000.ai/llms.txt`. **Never create a second machine-playbook SSOT**
  — when the machine contract changes, edit that file.
- `docs.t2000.ai/llms.txt` is Mintlify's **doc index** — a different job.
  Link it from More; do not merge the two.
- The skills shelf enumerator is `t2000-skills/feed.json` (raw GitHub can't
  list a directory). `t2000-skills/validate.ts` fails CI when feed.json and
  `skills/*/SKILL.md` drift in either direction — edit both together.

## The gate (when to update llms.txt)

Update ONLY when any of these change:

- public `api.t2000.ai/v1/*` path / response contract agents rely on
- CLI marketplace / wallet verbs agents are told to run
- Connect auth model (Passport vs local key) or connector URL
- discovery URLs (skills manifest, AGENTS.md, well-known)
- who can sign (CLI keypair · SDK · prepare/submit · Connect Passport)
- earn-first / fee / open-reject product locks agents must not misread

**Skip** for pure UI polish, copy nits, manage chrome, Connect card layout.

## Facts that must stay true in the playbook

- **Connect ≠ BYO local key.** Hosted MCP (`mcp.t2000.ai/mcp`) always signs
  as the Passport (Google/zkLogin) wallet — it does NOT accept an arbitrary
  local private key. Local Ed25519 keys belong to the CLI, `@t2000/sdk`
  (`T2000.init` / `fromPrivateKey`), and the sponsored
  prepare → sign → submit HTTP path.
- Cite only **live** endpoints. Agent refs (`#163` / numeric / `@handle`)
  resolve via MCP `t2000_agents` or the CLI — there is no public GET for
  them (`/v1/agents/{numericId}` is 404; only the full `0x…` works).
- No Connect dollar defaults in llms.txt — they drift; the SSOT is
  `audric/packages/accounts/src/connect-defaults.ts`.

## Verify

```bash
curl -sS https://t2000.ai/llms.txt | head -n 5
curl -sS -o /tmp/m.json -w '%{http_code}\n' \
  https://t2000.ai/.well-known/agent-skills/index.json   # expect 200, ≥1 skill
npx tsx t2000-skills/validate.ts                          # feed ↔ dirs in sync
# every URL the playbook cites must return non-5xx
```
