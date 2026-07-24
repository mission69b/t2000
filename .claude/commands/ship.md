---
description: Walk the ship checklist for a feature — surfaces, docs, and the catalog-from-live-truth rule
argument-hint: [feature or slice name]
---

Run the ship checklist for: **$ARGUMENTS**

Work through each item. For each, either do it, or state explicitly why it doesn't
apply to this slice. Don't silently skip.

## Surfaces

- [ ] SDK implementation + tests (`packages/sdk/src/`)
- [ ] CLI command + tests (`packages/cli/src/commands/`)
- [ ] MCP tool/prompt + tests (`packages/mcp/src/`)
- [ ] Agent Skill (`t2000-skills/skills/`)
- [ ] Mintlify docs (`apps/docs/*.mdx`) — auto-deploys to developers.t2000.ai
- [ ] Root `README.md`
- [ ] Package `README.md`s
- [ ] Version bump + build all packages (`/release`)

Tests live **inline next to source** (`Foo.ts` + `Foo.test.ts`) — never add a new
`__tests__/` folder.

## Docs cadence — two tiers, not "dump as you go"

- **Per-slice (now):** keep developers.t2000.ai *factually correct* only — version,
  command surface, behavior (limits-on, no-charge-on-failure). Cheap; prevents the
  staleness class.
- **Per-phase (later):** a dedicated structured-docs task turning the phase's specs
  into a story-driven product + technical section (features → benefits → how it
  works), not a textbook manual.

## Catalog tables come from live truth, never from memory

Any docs table enumerating services / models / tools / skills MUST be written
against the live source:

- Gateway catalog → `mpp.t2000.ai/api/services`
- Model catalog → `api.t2000.ai/v1/models`
- MCP tools → `packages/mcp/src/tools/`
- Skills → `t2000-skills/skills/`
- CLI defaults → the CLI source

Hand-written "should exist" lists are how the 2026-07-02 agent-payments fiction
shipped (Bing / Kagi / Midjourney / BlockVision — none of them on the rail).
Cross-check before writing, and prefer linking the live endpoint over duplicating it.

## Positioning capture

- [ ] Append the slice's feature + proof point to `SITE_REPOSITIONING_BRIEF.md` §6
- [ ] Land the developers.t2000.ai factual delta if the dev-facing contract changed

## Then

- [ ] Log the slice in `audric-build-tracker.md` — use `/tracker`
