# MCP Prompts Integration Decision

> **Status:** LOCKED — dormant strategic seam, no production wiring today
> **Closes:** `SPEC_AI_SDK_HARDENING.md` P3.3
> **Tracked by:** `audric-build-tracker.md` S.303 (2026-05-24)
> **Last reviewed:** 2026-05-24

---

## The decision in one paragraph

The engine ships an `McpPromptAdapter` (`packages/engine/src/mcp/prompt-adapter.ts`, ~100 LoC, 6 unit tests) and a `skillRecipeBlock` slot on `EngineConfig` (`packages/engine/src/types.ts`, Layer 4 of the F-4 5-layer system prompt). Audric web-v2 carries the matching plumbing (`buildAudricSystemPrompt({ skillRecipeBlock?: string })`) and a chat-route call site that passes `skillRecipeBlock: undefined`. **None of it is consumed today and the dormancy is intentional.** The seam stays in tree because (a) it's the canonical "speak any Sui protocol's MCP" extension point per `WHY_v07a.md` §3, (b) it costs ~100 LoC and ~5 tests to keep, (c) deleting it would be a tactical win that forecloses a strategic option, and (d) AI SDK marks MCP prompts as `experimental_` — the adapter shields callers from upstream API churn.

---

## Why the original P3.3 binary was wrong

`SPEC_AI_SDK_HARDENING.md` originally framed P3.3 as:

> *Wire McpPromptAdapter to populate `skillRecipeBlock` (or delete `t2000-skills/` — decide during implementation; recommendation: wire it, it's the moat we advertise)*

The binary is wrong on both options:

- **"Wire it"** — what gets wired? Today, the only available prompt source is `t2000-skills/skills/*/SKILL.md` baked into `@t2000/mcp`. Those skills are CLI-flavored (`t2000 save 80`, suiscan URLs, `t2000 supply` alias). Web-v2's existing `apps/web-v2/lib/audric/system-prompt.ts` already contains operational guidance for the same flows in audric-flavored language. Wiring t2000-skills/ into web-v2 would duplicate guidance, add ~100-200 tokens per turn (right after P3.1 spent effort SUBTRACTING tokens via activeTools), and create two sources of truth for "how should the LLM handle save?" — a drift trap. A real audric-side skill migration would want the system prompt SHRUNK in lockstep (move guidance OUT of `system-prompt.ts` INTO skills) — that's a multi-file refactor outside P3.3's scope.
- **"Delete t2000-skills/"** — the `Earns Its Keep` audit (`spec/archive/v07e/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md`) concluded **all 14 skills KEEP today** because they're real CLI/MCP product surface (Cursor, Claude Desktop, Codex CLI consume them via `@t2000/mcp`). Deleting `t2000-skills/` would break a shipped npm package.

The implicit third option — *delete the engine plumbing but keep the skills directory* — is also wrong: it cuts a strategic seam (per `WHY_v07a.md` §3 below) to win back ~80-120 LoC. That's optimizing for short-term tidiness at the cost of long-term optionality.

The actual right answer is the fourth option: **document the dormancy, ship no code change, close the SPEC item**.

---

## Strategic anchor — WHY_v07a.md §3

`spec/archive/v07a/WHY_v07a.md` §3 — *Standards adoption → cross-tool composability*:

> *MCP prompts adapter → audric becomes the "speak any Sui protocol's MCP" agent. When DeepBook V2 / Cetus / Volo ships an MCP, audric absorbs it via 1 registry entry, ZERO engine changes. This is what makes Audric Intelligence a moat that strengthens over time — every new Sui protocol's MCP makes Audric more capable without any audric work.*

The McpPromptAdapter was never built for `t2000-skills/` alone. It was built as the **PROMPTS counterpart** to `McpClientManager` (the TOOLS counterpart, already wired against the NAVI MCP server via `audric/apps/web-v2/lib/audric/navi-mcp.ts`). The tools side proves the pattern in production; the prompts side is intentionally dormant until a partner protocol's MCP exposes prompts.

§23 — *Bridge layer as lasting abstraction boundary* — calls out exactly this kind of thin contract surface as something that "quietly compounds value" even before exercised.

---

## AI SDK best-practice alignment

Per [ai-sdk.dev/docs/ai-sdk-core/mcp-tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools):

- `@ai-sdk/mcp`'s `createMCPClient` is the recommended path for MCP integration → both `McpClientManager` and `McpPromptAdapter` wrap it.
- Tools via `client.tools()` → already wired against NAVI MCP (`McpClientManager` in production).
- Prompts via `client.experimental_listPrompts()` / `client.experimental_getPrompt()` → wrapped by `McpPromptAdapter`, dormant.
- AI SDK explicitly notes: *"MCP Prompts is an experimental feature and may change in the future."* — the adapter is exactly the kind of abstraction that absorbs this churn risk so call sites don't have to track `experimental_` API renames.

We are aligned with AI SDK's recommended posture: thin adapters over `@ai-sdk/mcp`, HTTP transport for production, separation of TOOLS / PROMPTS / RESOURCES surfaces.

---

## What's in tree today

### Engine side (`@t2000/engine`)

| File | What it is | Status |
|---|---|---|
| `packages/engine/src/mcp/prompt-adapter.ts` | `McpPromptAdapter` class — wraps `experimental_listPrompts` + `experimental_getPrompt` from `@ai-sdk/mcp`'s `MCPClient`. Exposes `listPrompts()` + `getPromptText({ name, arguments })`. ~100 LoC. | Built, exported from `@t2000/engine` (via `packages/engine/src/index.ts`). No production consumer. |
| `packages/engine/src/mcp/prompt-adapter.test.ts` | 6 unit tests (list / empty list / getText join / non-text content drop / args forwarding / empty result). | Passing. |
| `packages/engine/src/types.ts` `EngineConfig.skillRecipeBlock?: string` | Optional config field. Engine inserts as Layer 4 of the F-4 5-layer system prompt at `buildPrepareStepHook`. Empty string when undefined. | Built. No consumer passes a non-undefined value. |
| `packages/engine/src/v2/engine.ts` Layer 4 wiring | `volatileLayers[2] = this.config.skillRecipeBlock ?? ''` inside the `prepareStep` builder. Filters out empty segments. | Built. No-op when undefined. |
| `packages/engine/src/memory/five-layer-ordering.test.ts` | Locks the layer ordering against regression. | Passing. |

### Audric web-v2 side

| File | What it is | Status |
|---|---|---|
| `apps/web-v2/lib/audric/system-prompt.ts` `BuildAudricSystemPromptInput.skillRecipeBlock?: string` | Mirrors the engine's optional layer-4 slot for the web-v2 host that composes its own `instructions` string. | Built. Always passed `undefined`. |
| `apps/web-v2/app/api/chat/route.ts` ~L1145 | `buildAudricSystemPrompt({ ..., skillRecipeBlock: undefined })` | Passes `undefined`. Comment to be updated to reference this doc. |
| `apps/web-v2/lib/audric/navi-mcp.ts` | `McpClientManager` connecting to NAVI MCP for TOOLS (separate seam). | **In production.** Proves the MCP integration pattern works end-to-end. |

### t2000-skills / @t2000/mcp (separate product, separate decision)

| Path | What it is | Status |
|---|---|---|
| `t2000-skills/skills/*/SKILL.md` | 14 skill markdowns. Source of truth. | KEEP (Earns Its Keep audit verdict, 2026-05-23). |
| `packages/mcp/` (`@t2000/mcp`) | Published npm package. Bakes the 14 skills at build time, exposes via MCP `server.prompt(...)`. Consumed by Cursor / Claude Desktop / Codex CLI. | Shipping. Not consumed by audric web-v2. |

---

## Why we keep the seam dormant (instead of wiring or deleting)

### Why not wire today

1. **Audience mismatch.** t2000-skills/ content uses CLI vocabulary (`t2000 save 80`, suiscan tx URL templates, `supply` alias). Web-v2 users don't see a CLI; surfacing CLI-flavored guidance in the system prompt invites the LLM to reference flows the user can't execute.
2. **Duplicate guidance.** `apps/web-v2/lib/audric/system-prompt.ts` is the canonical source of operational guidance for web-v2 today. Injecting skill bodies on top would create two sources of truth.
3. **Token cost regression.** P3.1 (S.302) just landed activeTools narrowing to SHRINK per-turn token spend. Skills would re-inflate it.
4. **AI SDK MCP prompts marked `experimental_`.** Wiring a path that depends on an experimental upstream API for content the system prompt already covers is a churn risk with no offsetting value.
5. **A real wiring would want a system-prompt refactor in lockstep** (move guidance from `system-prompt.ts` → skills, then inject dynamically). That's a multi-file effort outside the AI SDK Hardening SPEC's scope and triggers its own SPEC when justified.

### Why not delete the engine plumbing

1. **Forecloses the v0.7a §3 strategic option** ("speak any Sui protocol's MCP"). When (not if) a partner protocol exposes prompts via MCP, the wiring is one config entry; without the seam, it's an engine release.
2. **The plumbing is cheap.** ~100 LoC + 6 tests. Periodic maintenance ≈ zero — `experimental_getPrompt` / `experimental_listPrompts` are stable AI SDK methods with semver protection.
3. **Pattern symmetry with `McpClientManager`.** Tools and prompts are the two primary MCP surfaces. Keeping both adapters means future "absorb-a-protocol" tasks have a complete, symmetric extension point.
4. **Re-adding later costs more than keeping.** A future re-build would need re-discovery (which methods? what shape? how to test?), re-review, re-publish. The version-control "save" via deletion is dwarfed by the rebuild cost.

### Why "dormant + documented" beats "dormant + undocumented"

- The undocumented state had cost multiple agent passes asking *"should we wire this?"* This doc closes that loop.
- The activation criteria (below) tell future agents WHEN to flip the seam from dormant → active, so the next session reaches for this doc instead of re-litigating the binary.
- The dormancy is now a deliberate engineering position, not an accident of un-finished v0.7d work.

---

## Activation criteria — when to actually wire

Wire the seam (audric web-v2 starts passing a non-`undefined` `skillRecipeBlock`) when ANY of these land:

1. **A partner Sui protocol's MCP server exposes prompts** (not just tools). Example: Cetus ships `cetus_3_pool_swap_guide` as an MCP prompt with usage walkthrough text. Wiring path: register the protocol's MCP via `McpClientManager.connect()` (same posture as NAVI), then `await new McpPromptAdapter(mgr.getConnection('cetus').client).getPromptText({ name: 'cetus_3_pool_swap_guide' })` at chat-time when intent suggests Cetus relevance.
2. **An audric-skills migration SPEC opens.** That SPEC moves operational guidance OUT of `system-prompt.ts` and INTO `t2000-skills/skills/*/SKILL.md` (rewriting CLI-flavored content into audric-flavored content), then uses P3.1's intent classifier to pick the matching skill body per turn. Both moves are in-scope for that SPEC, not for P3.3.
3. **Slash-command UX adoption** (post-v0.7c chatbot template). If web-v2 ships a slash-command surface (`/save`, `/borrow`, etc.) that maps to specific skills, the skill body becomes a per-command system-prompt prefix.
4. **A third-party MCP integration request** (a partner asks audric to natively support their MCP). Same posture as #1.

If a future agent reaches an activation criterion and starts the wiring, they should also:
- Pick a connection strategy (per-request short-lived vs. module-scoped long-lived). Mirror `navi-mcp.ts` for the long-lived case.
- Add a smoke test against a stubbed MCP server end-to-end (list → get → inject → run one chat turn).
- Update this doc with the new active consumer + remove the "dormant" framing.

---

## What this decision does NOT change

- `t2000-skills/skills/*/SKILL.md` — STAYS (CLI/MCP product earns its keep).
- `@t2000/mcp` published npm package — STAYS (Cursor / Claude Desktop / Codex CLI consume it).
- `McpClientManager` + NAVI MCP integration — STAYS (production tools surface).
- Engine v0.7a thesis (standards adoption, AI SDK as platform, MemWal alignment) — UNCHANGED.

---

## Cross-references

- `spec/archive/v07a/WHY_v07a.md` §3 — the strategic case for the MCP prompts seam.
- `spec/archive/v07a/WHY_v07a.md` §23 — bridge layer as lasting abstraction boundary.
- `spec/archive/v07e/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md` §3.4 — `t2000-skills/` audit verdict.
- `spec/active/shipping/SPEC_AI_SDK_HARDENING.md` P3.3 — the SPEC item this doc closes.
- `audric-build-tracker.md` S.303 — the ship record.
- `audric/.cursor/rules/audric-context-assembly.mdc` — the audric-side context-builder rule that already states "There is no audric-side analog to engine layer 4 (`skillRecipeBlock`)".
- `packages/engine/src/mcp/prompt-adapter.ts` — the adapter code.
- `packages/engine/src/mcp/client.ts` — the TOOLS counterpart (production-wired).
- `audric/apps/web-v2/lib/audric/navi-mcp.ts` — the proven production MCP integration pattern.
- [ai-sdk.dev/docs/ai-sdk-core/mcp-tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) — AI SDK MCP docs.

---

## When to revisit this doc

- An activation criterion above is met → re-read, then wire.
- AI SDK promotes MCP prompts out of `experimental_` (loses the `experimental_` prefix on the methods) → re-read, decide whether to rename or unwrap the adapter.
- A new SPEC for audric-skills migration opens → re-read, this doc becomes the activation playbook's reference.
- A future agent asks *"why is `skillRecipeBlock: undefined`?"* → answer is this doc; close the loop.
