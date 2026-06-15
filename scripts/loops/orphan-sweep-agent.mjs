#!/usr/bin/env node
/**
 * Cursor harness for the orphan-sweep loop (Phase 1: local, manual-first).
 *
 * Runs ONE maker pass via the Cursor SDK against the full workspace (so it sees
 * BOTH the t2000 public repo AND the mounted `spec/` private repo — the loop
 * sweeps code orphans in t2000 and doc-staleness in spec/, which a single-repo
 * CI checkout cannot do; see .cursor/rules/orphan-sweep.mdc "Harness").
 *
 * The maker reads the skill + state, sweeps, and runs the objective gate
 * (scripts/loops/orphan-sweep-gate.sh) until green. You then REVIEW the diff in
 * both repos and commit (the human approval gate). Auto-PR + scheduling = Phase 2.
 *
 * Setup (once):
 *   pnpm add -Dw @cursor/sdk          # or: npm i -g @cursor/sdk
 *   export CURSOR_API_KEY=cursor_...  # Cursor Dashboard -> Integrations
 * Run (from the workspace root that contains spec/):
 *   node scripts/loops/orphan-sweep-agent.mjs
 *
 * Exit codes (SDK skill convention): 0 finished · 1 never-started (auth/config/
 * network, retryable flag logged) · 2 ran-but-failed.
 */

const apiKey = process.env.CURSOR_API_KEY;
if (!apiKey) {
  console.error('CURSOR_API_KEY is not set. Get one at https://cursor.com/dashboard/integrations');
  process.exit(1);
}
const model = process.env.CURSOR_MODEL ?? 'composer-2.5';

// Dynamic import so a missing dep gives a clear message instead of a stack trace.
let Agent, CursorAgentError;
try {
  ({ Agent, CursorAgentError } = await import('@cursor/sdk'));
} catch {
  console.error('@cursor/sdk is not installed. Run:  pnpm add -Dw @cursor/sdk');
  process.exit(1);
}

const PROMPT = `You are the MAKER for t2000's orphan-sweep loop. Work surgically and stop at the gate.

1. Read .cursor/rules/orphan-sweep.mdc (the procedure) and spec/loops/orphan-sweep-STATE.md (memory) in full. Also skim the newest entries of spec/audric-build-tracker.md for what was recently removed/refactored.
2. Sweep for orphans + doc-staleness per the skill: dead imports / unused exports, deleted dirs/symbols/deps still referenced, stale CI steps, and stale version numbers / tool counts / S.N tags / package lists in docs (t2000 AND spec/).
3. Make SURGICAL fixes only — every changed line must trace to an orphan of a removal. Do NOT refactor adjacent code (coding-discipline.mdc #3).
4. Run \`bash scripts/loops/orphan-sweep-gate.sh\` and iterate until it exits 0. The gate is the objective check; do not declare done until it is green.
5. Append a one-line lesson and update "Last run" in spec/loops/orphan-sweep-STATE.md.

HARD RULES (non-negotiable):
- NEVER touch the money path: send/swap/pay/guards, packages/sdk/src/wallet/* execution logic, anything in packages/sdk that builds or signs a transaction.
- NEVER make an architecture or judgment-call change. If you find a money-path or judgment issue, write it under "Open items / candidates" in spec/loops/orphan-sweep-STATE.md and STOP — do not fix it.
- Keep the diff minimal. A human reviews and commits; you do not commit or push.`;

try {
  console.log(`[orphan-sweep] launching maker agent (local, model=${model})…`);
  const result = await Agent.prompt(PROMPT, {
    apiKey,
    model: { id: model },
    local: { cwd: process.cwd() },
  });
  console.log(`[orphan-sweep] agent=${result.id ?? '?'} status=${result.status}`);
  if (result.status === 'error') {
    console.error('[orphan-sweep] run started but failed mid-flight — inspect the transcript + git state.');
    process.exit(2);
  }
  console.log('[orphan-sweep] done. Review `git status` / `git diff` in BOTH t2000 and spec/, then run the gate yourself and commit if green.');
  process.exit(0);
} catch (err) {
  if (CursorAgentError && err instanceof CursorAgentError) {
    console.error(`[orphan-sweep] startup failed: ${err.message} (retryable=${err.isRetryable})`);
    process.exit(1);
  }
  throw err;
}
