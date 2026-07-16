# plans/

Written work plans live here — the plan-expensive / execute-cheap split:

1. A strong model writes the plan (in Cursor, Claude Code, or
   `t2code` with `/skill:improve`) → `plans/<topic>.md`, including
   verification gates (tests, greps, builds).
2. A cheap executor runs it headlessly:

   ```bash
   git worktree add ../run-<topic>
   cd ../run-<topic>
   t2code exec "execute plans/<topic>.md"
   ```

3. You review the diff and run the verification gates yourself.

The executor runs on open-model prices; the expensive model only wrote the
plan. That split is what moves the bill.
