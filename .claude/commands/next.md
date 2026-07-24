---
description: Read the forward backlog and propose the next task to work on
---

Figure out what to work on next.

## Read these, in this order

1. **`audric/HANDOFF_NEXT_AGENT.md` → "Active backlog" table** — this is the
   canonical, ranked list for product / agent-ownable tasks (with effort + notes)
   plus founder ops.
2. **`HANDOFF_NEXT_AGENT.md`** (this repo) — the infra forward window and
   cross-repo cleanup. It defers the product backlog to the audric one, so don't
   treat a gap here as "nothing to do."
3. **`PRODUCT.md`** — the product map SSOT (2 products: Private Inference · x402
   gateway; one customer + one path each). Use it to sanity-check that a candidate
   task actually serves a live product rather than a retired surface.
4. **Top of `audric-build-tracker.md`** — the last few `S.N` entries, to see what
   just landed and whether it left "founder ops owed" or "held for founder nod"
   items that are now unblocked.

All of these are local-only (gitignored, mounted from the private
`mission69b/t2000-internal` repo at `spec/`).

## Then

Propose **one** next task. For it, state:

- What it is and which backlog row it came from.
- Why it's next (rank, or a dependency that just cleared).
- Rough effort.
- The **verifiable acceptance criteria** — what runnable check proves it's done.
- Which surfaces it touches (SDK / CLI / MCP / skills / docs — see `/ship`).

Then run the product algorithm on it before writing any code: is the requirement
actually sound, and is there a version of this task that *deletes* something
instead of adding it? Say so if there is.

**Do not start implementing until the user picks.** List the runner-up briefly so
they can redirect in one word.
