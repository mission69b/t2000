---
name: t2000-code-delegate
description: >-
  Delegate well-specified coding grunt work to t2 code, the private coding
  agent on the t2000 rail, instead of burning frontier tokens on it. Use when
  a task is mechanical and verifiable — sweeps, renames, test-fix loops,
  applying a written plan, doc updates across many files — and you (the host
  agent) can review the diff afterwards. Runs `t2code exec` headlessly in the
  terminal; open-model pricing, private by default.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: "@t2000/code installed (npm install -g @t2000/code) and a t2000 console key"
---

# t2000: Delegate Coding Work to t2 code

## Purpose

You are an expensive frontier agent. Most coding work does not need you: once a
task is well-specified, the multi-file editing loop is mechanical. Hand that
loop to **t2 code** — it runs the whole thing on open models via the t2000
router (private by default, never a closed lab), while you stay on
orchestration and review. That split is what moves the bill.

Your job when delegating: **specify, dispatch, supervise, review, report.**

## When to delegate (and when not)

Delegate when ALL of these hold:
- The task is **well-specified**: you can state the goal, the scope (which
  files/areas), and a verification step (tests pass, grep comes back empty,
  build is green).
- It is **mechanical at execution time**: sweeps, renames, applying an
  agreed-on plan, fixing tests to green, dependency bumps with known fallout,
  repetitive doc/comment updates. This includes executing a self-contained
  plan file written by a planning skill (e.g. shadcn/improve's `plans/*.md` —
  point the spec at the plan file and its verification gates).
- You can **verify the result from the diff + the verification step** without
  re-deriving every decision.

Do NOT delegate:
- Ambiguous or architectural work (multiple valid interpretations, API design,
  trade-off calls) — that is your job.
- Anything where a wrong-but-plausible edit would be hard to catch in review.
- Tasks the user asked YOU to do interactively.

## How to dispatch

Run t2 code headlessly in the terminal, in the same working tree:

```bash
t2code exec "<task spec>"
```

- The final answer streams to stdout; progress (tool calls, subagents) goes to
  stderr. Add `--json` if you want the raw NDJSON event stream to supervise
  programmatically.
- Exit code 0 = clean finish, 1 = error.
- **Auth is not your problem**: t2code reads the user's persisted console key
  (or `T2000_API_KEY`) itself. If it prints "Not logged in", tell the user to
  run `t2code login` once.
- **Privacy is not your problem either**: t2 code applies the repo's pinned
  privacy mode (`.t2000/config.json`) or the user's global choice. Do not
  override it.

### Writing the task spec

The spec is the whole game. Include, in one prompt string:
1. **Goal** — what done looks like, one sentence.
2. **Scope** — directories/files in bounds, anything out of bounds.
3. **Constraints** — conventions to follow, things not to touch.
4. **Verification** — the exact command(s) that must pass (`bun test`,
   `pnpm typecheck`, a grep that must return nothing).

Example:

```bash
t2code exec "Rename getCwd to getCurrentWorkingDirectory across src/ and
update all call sites. Do not touch vendored code under src/vendor/. When
done, run 'pnpm typecheck' and fix any errors it reports. Verification:
'rg -n \"getCwd\\b\" src/' must return no matches and typecheck must pass."
```

## Supervising the run

- Watch stderr for progress. If the run goes quiet for a long time or loops on
  the same failing action, kill it and re-dispatch with a tighter spec.
- For risky or parallel work, dispatch in a separate git worktree and merge
  after review instead of running in the main tree.

## Reviewing and reporting

After the run exits:
1. Run `git diff` (or use your host's diff UI) and actually read it.
2. Run the verification step yourself — do not trust "done" claims.
3. If the diff is wrong in a bounded way, fix it yourself or re-dispatch with
   the correction named explicitly.
4. Report back to the user: what was delegated, what changed, verification
   result, anything you corrected.

You own the result. Delegation changes who types, not who is accountable.
