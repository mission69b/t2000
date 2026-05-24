# Canvas vs Artifact

> **Status:** LOCKED — canvases stay; artifacts deferred to Audric Store Phase 5
> **Closes:** `SPEC_AI_SDK_HARDENING.md` P4.2
> **Tracked by:** `audric-build-tracker.md` S.305 (2026-05-24)
> **Last reviewed:** 2026-05-24

---

## The decision in one paragraph

Audric uses 9 fixed React canvas templates (`packages/engine/src/tools/canvas.ts` — `activity_heatmap`, `portfolio_timeline`, `yield_projector`, `health_simulator`, `dca_planner`, `spending_breakdown`, `watch_address`, `full_portfolio`, `receive_address`) rendered inline in chat via the `render_canvas` tool. The AI SDK chatbot template offers a different primitive: [artifacts](https://chatbot.ai-sdk.dev/docs/customization/artifacts) — a side-panel workspace with create/update lifecycle, version diff, document persistence (text/code/image/sheet). **Audric will NOT migrate canvases to artifacts.** They serve fundamentally different UX: canvases are read-only data views; artifacts are editable documents with version history. When Audric Store (Phase 5 of `audric-roadmap.md`) ships generated content (ebooks, music, art), it will introduce `render_artifact` as a SEPARATE tool alongside `render_canvas` — not a replacement.

---

## Why canvases and artifacts are different primitives

| Property | Canvas (today) | Artifact (chatbot template) |
|---|---|---|
| Lifecycle | Generated once per turn, inline | Created, then updated across turns |
| Mutability | Read-only — re-render produces new instance | Editable — versions diffed, history preserved |
| Persistence | Ephemeral (rendered HTML in the chat row) | Persistent (Drizzle `Document` rows by document_id) |
| UX surface | Inline in chat (~600px width, modal-expandable) | Side panel (~50% viewport, dedicated workspace) |
| Cardinality | Many per turn | Typically one focal artifact per chat session |
| Use cases | Charts, portfolio snapshots, health sims | Generated essays, code editors, spreadsheets |
| Tool shape | `render_canvas({ template, params })` returns inline | Two tools: `create_document` + `update_document` (long-lived state machine) |

A health-factor simulator is not a document the user edits. A spending breakdown chart is not something you version-diff. A watch-address dashboard is data being projected, not authored. Forcing canvases through an artifact lifecycle would introduce mutation semantics + version history + side-panel chrome that the canvas use case does not need and would actively confuse users.

Conversely, an Audric Store-generated 12-chapter ebook IS a document the user wants to: edit chapter 3, regenerate chapter 7 with a different prompt, see what chapter 5 looked like 3 hours ago. That's exactly what artifacts are for.

---

## What the chatbot template's artifacts buy

The AI SDK chatbot template's artifacts (`/artifact/{text,code,image,sheet}/server.ts` + matching client renderers) provide:

1. **Generative UI with state**: a tool stream emits `data-textDelta` / `data-codeDelta` / etc. parts that the client merges into the current artifact. Streaming-friendly authoring UX.
2. **Document persistence**: every artifact create/update writes a `Document` row keyed by `(id, createdAt)`. Version diff is free.
3. **Side-panel viewport**: artifacts open in a dedicated workspace separate from the chat scroll. Long-form content gets the screen real estate it deserves.
4. **Bidirectional editing**: user can edit the artifact directly, and the next assistant turn sees the edits.

None of those benefits matter for canvases. All of them matter for generated long-form content.

---

## What canvases buy (that artifacts don't)

1. **Inline data density**: a portfolio canvas slots into the chat row alongside text. The user reads the answer + sees the visualization without context-switching to a side panel.
2. **Cardinality**: a single turn can render 3-4 canvases (portfolio + health-factor + yield-projection) without overwhelming any single surface. Artifacts assume "one focal artifact per chat" and side-panel scarcity makes 3-4 unwieldy.
3. **No state machine**: the canvas tool is a pure function of `(template, params)`. No `id`, no `createdAt`, no version history. Simplicity is a feature for read-only views.
4. **Server cost**: zero — canvas HTML is generated once per turn and embedded in the message row. Artifacts need additional Document rows + version queries.

---

## Migration cost vs benefit (if we WERE to migrate)

| Migration cost | Magnitude |
|---|---|
| Refactor `canvas.ts` from string templating → per-template `create_X_document` + `update_X_document` tools | ~2-3 weeks |
| Add `Document` table + Prisma migration | 1 day |
| Rewrite `tool-result-router.tsx` canvas branch → artifact-pane renderer | 3-5 days |
| Side-panel layout, mobile responsive, keyboard shortcuts (artifact UX) | 1-2 weeks |
| Migrate ~9 inline canvas use cases that work fine today | Risk of UX regression on every chip |
| **Total** | **5-7 weeks for zero user-facing improvement** |

| Migration benefit | Reality |
|---|---|
| "Standardize on chatbot template patterns" | We already use `Experimental_Agent`, `useChat`, prepare-step, repair-tool-call, onStepFinish, onError. Canvases are an Audric primitive that PRE-DATES the chatbot template's artifact pattern. Adopting artifacts doesn't make us "more standard"; it forces a read-only primitive through an editable-document pattern. |
| Version history on canvases | Nobody asked for it. Canvas content is derived from live portfolio state — re-renders are cheap, "diffing" a portfolio chart across two days is not a user need. |
| Edit a canvas | Canvases aren't edited. They're read. The user "edits" by re-running the tool with different params. |
| Side-panel workspace | Wrong for inline data viz. Right for long-form authoring. |

---

## What we DO commit to (the alternative future)

When **Audric Store** (Phase 5 of `audric-roadmap.md` — creator marketplace for AI-generated ebooks, music, art) ships, it introduces `render_artifact` as a separate tool from `render_canvas`. Specifically:

```ts
// Future shape (Audric Store Phase 5 — not built yet)
render_artifact({
  kind: 'ebook' | 'song' | 'image' | 'listing',
  documentId: string,  // create-on-first-call, update-on-subsequent
  delta: { ... },      // stream incremental content
})
```

This tool would adopt the chatbot template's artifact pattern:
- Document persistence in Prisma (`Artifact` table)
- Streaming `data-artifactDelta` parts via `Experimental_Agent`'s data-message surface
- Side-panel renderer for long-form content
- Version diff for "regenerate chapter 3"

The two tools coexist:

- `render_canvas` — read-only data visualization, inline (the 9 templates we have)
- `render_artifact` — editable generated content, side-panel (Audric Store)

No `render_canvas` template ever becomes an artifact. No `render_artifact` document ever becomes a canvas. They serve different user verbs and stay distinct.

---

## When to revisit this decision

Re-read this doc when ANY of these lands:

1. **Audric Store Phase 5 kickoff** — `render_artifact` design + Document table schema + side-panel layout become real work. This doc becomes the playbook reference; the binary "wire up artifacts? what about canvases?" should resolve to "ship `render_artifact`, leave canvases untouched."
2. **A canvas template legitimately wants mutation** — e.g. an interactive DCA planner where the user slides a "monthly amount" knob and the chart updates without re-running the tool. That's still NOT an artifact (the user isn't authoring a document), but it's a sign canvases want client-side reactivity beyond their current static-render model. Triggers a separate "Interactive Canvases" SPEC, not an artifact migration.
3. **Chatbot template ships an evolved primitive** — e.g. a unified "rich content tool result" that subsumes both canvas-style inline rendering and artifact-style side-panel. Re-evaluate.

---

## Cross-references

- `packages/engine/src/tools/canvas.ts` — the 9 canvas templates + CANVAS_TEMPLATES export.
- `audric/apps/web-v2/components/audric/tool-result-router.tsx` — the canvas branch that renders inline.
- `audric/audric-roadmap.md` — Audric Store Phase 5 description.
- `spec/active/shipping/SPEC_AI_SDK_HARDENING.md` P4.2 — the SPEC item this doc closes.
- [chatbot.ai-sdk.dev/docs/customization/artifacts](https://chatbot.ai-sdk.dev/docs/customization/artifacts) — the chatbot template's artifact pattern.
- `audric-build-tracker.md` S.305 — ship record.
- `t2000/CLAUDE.md` — Audric Intelligence + Audric Store sections both cross-reference this doc.
