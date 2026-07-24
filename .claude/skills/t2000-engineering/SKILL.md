---
name: t2000-engineering
description: >-
  The deep version of the t2000 engineering discipline — trace-the-full-path
  debugging, verifiable success criteria, simplicity/surgical-change rules,
  complete-removal (no orphans), and the Musk product algorithm. CLAUDE.md
  carries the one-line assertions; read this for the worked examples, the
  ask-vs-proceed test, the ESLint flat-config override trap, and the test-file
  location convention. Use when scoping a feature or spec, planning a multi-step
  change, debugging something that has already taken more than one attempt,
  removing a feature/package/dependency, deciding whether to factor an
  abstraction, or adding an ESLint flat-config rule.
---

# t2000 Engineering Discipline

Merged 2026-07-24 from four Cursor rules that were `alwaysApply: true`
(`engineering-principles`, `goal-driven-execution`, `coding-discipline`,
`product-build-algorithm`). The load-bearing assertions live in `CLAUDE.md §
Engineering Discipline` and apply every turn; this file is the depth behind them.

---

## 1. Trace the full path BEFORE writing code

Before fixing any bug, trace the ACTUAL execution path from user action → API route
→ handler → SDK → on-chain → response → UI render. Verify which functions/routes/
handlers are actually called. Never assume.

**What went wrong once:** spent 4 iterations fixing `sdk.swap()` balance-change
parsing when the Audric web app uses a sponsored transaction flow
(`/api/transactions/prepare` → sign → `/api/transactions/execute`) that never calls
`sdk.swap()` directly. The fix needed to be in the client-side `handleExecuteAction`,
not the SDK.

**Checklist before implementing a fix:**
1. What is the ACTUAL data flow? (trace it, don't guess)
2. Where does the data first become wrong? (that's where to fix)
3. Does this fix introduce duplication? (if yes, rethink)
4. Will this fix survive adding a new token/asset/feature? (if no, rethink)

## 2. Single source of truth — never duplicate

If data exists in one place, import it. Never copy token maps, decimal maps, or
config into multiple files.

```typescript
// ❌ BAD — hardcoded list that gets stale
const COMMON_TOKENS = 'SUI, USDC, USDT, USDSUI';

// ✅ GOOD — derived from canonical source
const { TOKEN_MAP } = await import('@t2000/sdk');
const supportedTokens = Object.keys(TOKEN_MAP).join(', ');
```

## 3. Ask "does this scale?" before every implementation

Before hardcoding any list, map, or constant: "Where is the source of truth? Can I
derive this dynamically? Will someone have to manually update this when things
change?" If the answer to the last question is yes, the approach is wrong.

## 4. Fix at the root, not the symptom

When a fix requires changes in 3+ places or multiple retry attempts, the
architecture is wrong. Step back and find the single point of failure.

## 5. Understand which layer you're in

Fixes in the wrong layer waste time. Identify the owning layer before coding:

| Layer | Runs where | Ships how |
|-------|-----------|-----------|
| `@t2000/sdk` | Server, or client via the sponsored flow | npm release |
| `@t2000/cli` · `@t2000/mcp` · `@t2000/id` · `@t2000/serve` | User machine / MCP client | npm release |
| `apps/gateway` (mpp.t2000.ai) | Vercel | deploy |
| Audric `web-v3` client components | Browser | Vercel deploy |
| Audric API routes | Vercel serverless | Vercel deploy |

## 6. Factor when the LOGIC duplicates, not when the SHAPE does

A shared interface shape (CRUD + injectors) is not a reason to extract a base
abstraction. If each implementation still owns most of its own logic, extraction
buys ~30 LoC and costs every future reader one more indirection.

**The principle:** factor when the duplication is the LOGIC, not just the SHAPE.
Consistent with Simplicity First below — *"no abstractions for single-use code"*
extends to *"no abstractions whose shape is shared but whose logic isn't."*

*(The original worked example was the retired engine's 5 cache modules — see
`spec/archive/engine-era/cursor-rules/` for the full write-up.)*

---

## 7. Goal-driven execution — verifiable success criteria

**Transform tasks into verifiable goals.** Strong criteria let you loop
independently. Weak criteria ("make it work") require constant clarification.

| Vague task | Verifiable goal |
|---|---|
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug" | "Write a test that reproduces it, then make it pass" |
| "Refactor X" | "Ensure tests pass before and after" |
| "Speed it up" | "Add a benchmark, baseline N ms, target ≤ N/2 ms" |
| "Make it more reliable" | "Add a test for the failure mode I just hit, watch it fail, fix until it passes" |

### For multi-step tasks, state the plan first

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Each verify step must be runnable — a test, a lint, a curl against the dev server,
a screenshot match. Anything that proves the step is done.

### When to ask vs. when to proceed

**Ask when:**
- Multiple valid interpretations of the goal exist (e.g. "make the chip flow nicer").
- The goal touches a system you're not 100% sure about (architectural ambiguity).
- The fix requires changing a load-bearing API signature.

**Proceed when:**
- The goal is unambiguous and the verify step is obvious.
- Existing tests + conventions tell you which approach matches the codebase.
- The change is local to one file with one obvious entry point.

### Banned

- "Done!" without running the verify step.
- "I think this works" without running tests.
- "Should be fine" without re-reading the diff.
- Closing the loop on a partial fix because "the user can tell me if anything's wrong."

---

## 8. Coding discipline

### Think before coding

State assumptions explicitly. If multiple interpretations exist, present them —
don't pick silently. If a simpler approach exists, say so. If something is unclear,
stop and name what's confusing.

### Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.

**The test:** every changed line should trace directly to the request.

### Remove completely — no orphans, no stale

**When you remove a feature, remove ALL of it. Stale/dead code is a defect, not a
keepsake.** A removal's blast radius IS "related code", so the surgical-changes rule
does NOT shield the remnants of the thing you're deleting. Sweep every layer in the
same pass:

- Source (functions, types, constants, error codes), tests, and their imports.
- Deps in `package.json` / `pnpm.overrides` / `patchedDependencies` + empty `patches/` entries.
- Docs, READMEs, rules, specs, CI steps, and export barrels (`index.ts` / `browser.ts`).
- Empty directories and config subpaths (e.g. `exports` map entries).

Don't leave a type "in case someone needs it," a dep "to be safe," or a doc section
"for history" — that's what the build tracker and git history are for. If it has no
live caller, it goes. *(Reference: the NAVI/DeFi + `@t2000/engine` removal swept
source, types, errors, deps, patches, CI, docs, and rules together.)*

### ESLint flat config — array-valued rules OVERRIDE across blocks

In flat config (`eslint.config.mjs`), if the same rule key appears in multiple
blocks, the LATER block fully replaces the earlier value. For rules taking an array
(`no-restricted-syntax`, `no-restricted-imports`, `no-restricted-properties`,
`no-magic-numbers`), the first block's selectors are silently dropped.

```js
// ❌ BUG — second block overrides the first; the first set of bans vanishes
[
  { rules: { 'no-restricted-syntax': ['error', { selector: 'A', message: '…' }] } },
  { rules: { 'no-restricted-syntax': ['error', { selector: 'B', message: '…' }] } },
]

// ✅ FIX — consolidate every selector into ONE rule entry
const combined = [
  { selector: 'A', message: '…' },
  { selector: 'B', message: '…' },
];
[{ rules: { 'no-restricted-syntax': ['error', ...combined] } }]
```

If you need different selectors per file glob, scope the WHOLE block with `files:`.

**Audit:**
```bash
rg "no-restricted-syntax|no-restricted-imports|no-restricted-properties" --glob 'eslint.config.mjs'
```

Live ESLint configs in this repo: `apps/gateway/eslint.config.mjs`,
`apps/web/eslint.config.mjs`. Audric's `web-v3` uses Biome, not ESLint.

### Test file location — inline, next to source

`Foo.ts` + `Foo.test.ts` in the same folder. This is the canonical convention across
the monorepo (SDK / CLI / MCP all follow it).

Why: tests live next to the code they exercise → easier to find, keep in sync, and
delete when the source is deleted. `tsup` / `tsc` exclude `*.test.ts` from publish
output regardless of layout.

**Forbidden:** adding a new `__tests__/` folder to a package that doesn't have one;
mass-moving inline tests into `__tests__/` "for consistency" — inline IS the
convention, so that move is the inconsistency.

```bash
find packages -name '*.test.ts' -not -path '*/node_modules/*' -not -path '*/dist/*'
```

---

## 9. Product build algorithm

### The thesis (orients every product decision)

**t2000 is for Machines AND Humans.** Every surface, API, and flow must work for an
autonomous agent *and* a person. If a design only serves one, it's half-built. The
rail (MPP / USDC / Passport) is the shared substrate both call.

### The algorithm — run it IN ORDER, before building

Adapted from Musk. The order is load-bearing: never optimize a step you should have
deleted, never automate a process that shouldn't exist.

1. **Make the requirements less dumb.** Question every requirement — especially from
   a senior person or a spec. Requirements are guilty until proven innocent. A
   requirement with no owner who'll defend it is a dumb requirement. *(Step 1
   because most wasted work is building the wrong thing well.)*
2. **Delete the part or process step.** If you're not adding back ≥10% of what you
   delete, you didn't delete enough. Prefer removing a surface over building one.
3. **Optimize / simplify** — but only what survived steps 1–2.
4. **Accelerate cycle time** — only after the above. Going fast on the wrong thing
   is the most expensive mistake.
5. **Automate** — last. Automating an undeleted process locks the flaw in.

### How this binds behavior here

- **Before scoping a plan or asking a gate question:** run step 1. Read the owning
  spec fully first — a scoping question built on an assumed requirement is itself
  dumb work.
- **Default to deletion.** When a spec adds a surface (card, button, flow, config),
  ask "what happens if we delete it?" before "how do we build it?" Surface every
  deletion candidate you find, even outside the immediate task.
- **Name the fork, don't paper over it.** If a "simpler" path conflicts with a
  locked constraint (e.g. non-custodial), surface the trade-off and let the founder
  decide — don't silently pick the constrained path because a spec said so.
- **Machines-and-Humans test.** For any new flow, state how an agent uses it AND how
  a human uses it. If you can't, the requirement isn't done being thought through.

---

## Why this matters here

Fixes have taken 4+ iterations because the first attempt went in the wrong layer
(didn't trace the path), included "while I'm here" refactors that introduced a new
bug (failed surgical), or added a "flexibility" config nobody asked for (failed
simplicity). Time spent thinking before coding is faster than time spent unwinding
the wrong fix.

**Working signals:** fewer unnecessary changes in diffs · fewer rewrites from
overcomplication · clarifying questions arrive BEFORE implementation · each PR
summarizes in 1–2 sentences without weasel words.

## Related

- Amount flooring on any on-chain leg → `t2000-financial-amounts` skill
- Env contract validation → `t2000-env-gate` skill
- Karpathy's original → https://github.com/forrestchang/andrej-karpathy-skills
