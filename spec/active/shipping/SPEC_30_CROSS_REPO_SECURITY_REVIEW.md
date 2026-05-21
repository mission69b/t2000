# SPEC 30 — Cross-Repo Security Review (v1.2.1 CLOSED + URGENT BLOCK SHIPPED)

> **Status:** v1.2.1 CLOSED 2026-05-14 ~20:25 AEST. All 14 D-questions resolved (12 locked + 2 deferred). Phase 1A + 1A.5 + 1A.6 + 1A.7 + 1A.8 + 1B + 1C SHIPPED, plus the **URGENT post-close block** (1B follow-ups + Phase 3.4 PII log redaction + Phase 4.1 founder 2FA checklist + Phase 6 preflight coverage + Phase 7.1 pnpm audit gate). Phase 2–10 remainder spun out to follow-up SPECs (31–36) for founder triage. **URGENT POST-CLOSE BLOCK SHIPPED 2026-05-14 ~20:25 AEST after 3-Read self-review** — (1) **Engine preflight 100% coverage**: 6 write tools (`withdraw`, `claim_rewards`, `harvest_rewards`, `volo_stake`, `volo_unstake`, `save_contact`) were missing `preflight()` per `safeguards-defense-in-depth.mdc`'s "every write tool MUST implement preflight, no exceptions" rule. Added preflight to all 6 + structural test `packages/engine/src/tools/preflight-coverage.test.ts` (3 invariant assertions: WRITE_TOOLS, OPT_IN_WRITE_TOOLS, ALL_WRITE_TOOLS) so a future write tool added without preflight fails CI immediately. Pre-existing `pending-input.test.ts` updated to accept either `_hostFormValidationFailed` (preflight) or `_hostFormZodFailed` (Zod) as fail-fast key — both satisfy the contract "malformed resume input → error tool_result, not orphan tool_use". (2) **PII log redaction module + selective adoption**: `audric/apps/web/lib/log-redact.ts` (3 typed redactors `redactAddress`/`redactJwt`/`redactEmail` + recursive `redactPII` walker with non-plain-object passthrough so `Error`/`Date`/`Map`/`Buffer` values survive logging unchanged) + 18 unit tests in `lib/log-redact.test.ts`. Adopted at 4 highest-PII surfaces: `lib/portfolio.ts` (4 logs), `app/api/engine/chat/route.ts` ([email-verified-false] + STREAM_CLOSED_SILENTLY), `app/api/internal/memory-extraction/route.ts` (Anthropic error log with userId), `app/api/services/complete/route.ts` (recordPurchase failure log — composed with existing `sanitizeForLog`). Future call sites adopt incrementally per `RUNBOOK_incident_response.md` 3-Read review. (3) **`pnpm audit` CI gate at `--audit-level=critical`**: both repos updated `security.yml` from advisory `pnpm audit --prod || true` to two-step pattern — informational `--audit-level=low || true` (visibility), real gate `--audit-level=critical` (build-failing). Baseline today is 0 critical / 19 high (all transitive via `@naviprotocol/lending` + `@pythnetwork/pyth-sui-js`, both upstream-owned per CLAUDE.md; tightening to `--audit-level=high` requires dropping `@naviprotocol/lending` first — separate cleanup, deferred). (4) **`SECURITY_FOUNDER_CHECKLIST.md`**: at repo root, lists Anthropic DPA sign step (5–15 min) + 2FA matrix verification (~30–60 min one-time, ~5 min per 6-month re-check) + recurring re-check cadence + upgrade triggers for deferred phases. (5) **3-Read self-review caught 4 gaps**: (a) preflight test missed opt-in write tools (`addRecipientTool`, `updateTodoTool`) — both currently have preflight but the test didn't lock them; strengthened. (b) `engine/chat/route.ts` STREAM_CLOSED_SILENTLY logged raw `address` — fixed. (c) `memory-extraction/route.ts` logged raw `userId` — fixed. (d) `services/complete/route.ts` used only `sanitizeForLog` (CRLF defense) without `redactAddress` (truncation) — composed both. **Test status:** engine 1195/1195 pass | 1 skipped (was 1193 — +2 from new preflight invariant assertions); audric 3005/3005 pass (was 2987 pre-block — +16 redactor unit tests + 2 redactor regression tests for non-plain-object passthrough). Typecheck + ESLint clean both repos. **Phase 1C SHIPPED 2026-05-14 ~19:30 AEST** — `audric/apps/web/RUNBOOK_incident_response.md` codifies the incident response playbook (2h ack window, P0/P1/P2/P3 severity tiers with response windows, 3-Read self-review, regression-test-before-fix, post-deploy smoke matrix, public + internal post-mortem split). Public advisory `audric/apps/web/SECURITY_ADVISORY_2026-05-IDOR.md` published, linked from `audric.ai/security` in a new "Recent Advisories" section. Internal post-mortem `audric/apps/web/POST_MORTEM_2026-05-IDOR.md` captures the timeline (24h reporter→all-fixes-shipped), the 3 root-cause patterns (no centralised auth gate, forgeable header convenience pattern, cache headers as auth boundary), the CI gaps, the review gaps, and the structural follow-ups (cache-header lint, forgeable-header lint, SDK-style auth boundary). **Phase 1A.8 SHIPPED 2026-05-14 ~19:20 AEST** — production smoke matrix caught CDN cache-poisoning on `/api/portfolio` (route was returning 200 to unauthenticated requests for 15s windows because `Cache-Control: public, s-maxage=15` instructs Vercel CDN to serve cached authenticated responses to ANY caller). Fix: changed to `Cache-Control: private, max-age=15`. Added `audric/apps/web/__tests__/spec30-cache-header-regression.test.ts` to prevent the pattern from re-landing. Window of exposure: ~2h between IDOR fix going live and cache-header fix landing; no probing observed in logs. **Phase 1A.7 SHIPPED 2026-05-14 ~18:50 AEST** — user reported 401 on every API call after 1A.5/1A.6 went live. Root cause: routes now enforce `jose.jwtVerify` which validates Google OIDC `exp` claim (1h TTL); client-side `useZkLogin` only checked the longer Sui-epoch `maxEpoch` (~7d). Fix: added `isJwtExpired` check in `audric/apps/web/lib/zklogin.ts` with 60s skew tolerance + `useZkLogin` integration that flags session as `'expired'` when JWT is past `exp`, triggering AuthGuard re-login. 8 unit tests in `audric/apps/web/lib/zklogin-jwt-expiry.test.ts`. **D-14 GATEWAY-VERCEL FIX 2026-05-14 ~18:30 AEST** — first 5 t2000-gateway Vercel deploys after the D-14 env-gate landed all errored at build time with `[env] @t2000/gateway: invalid environment configuration` because the schema marked all 41 vendor API keys (ALPHAVANTAGE / ANTHROPIC / FAL / etc.) as `requiredString`. The gateway is by design a multi-vendor router — each vendor key is read in exactly one `chargeProxy` route, and a missing key turns into an upstream 401 at request time (graceful per-vendor degradation). Marking them required forced every key to be set in every Vercel environment before the gateway could boot at all. Fix: relaxed all 41 vendor keys to `optionalString` (still catches the empty-string-bug-class via the optional transform); only `INTERNAL_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` stay `requiredString` (infrastructure the gateway literally cannot run without). Local verification: gateway typecheck clean, 170/170 tests pass, `next build` succeeds with only the 3 required vars set. **Phase 1A.6 SHIPPED locally 2026-05-14 ~18:00 AEST** — pre-commit self-review of Phase 1A.5 surfaced 6 `/api/user/*` routes that were *still* either wide-open by `?address=` or used the forgeable `x-sui-address` header (Phase 1A misses, not a 1A.5 regression). Closed: `/api/user/preferences` GET+POST (CRITICAL — `permissionPreset` mutation was a money-loss vector via raised auto-execute thresholds), `/api/user/preferences/contacts/backfill` POST, `/api/user/memories` GET+DELETE, `/api/user/memories/[id]` DELETE, `/api/user/financial-profile` POST, `/api/user/watch-addresses` GET+POST+DELETE (last forgeable-header user-facing route in the codebase). 4 client fetch sites migrated to `authFetch` (`useContacts.ts` ×5, `MemorySection.tsx` ×4, `SafetySection.tsx` ×3, `dashboard-content.tsx` ×1 — 13 sites total). 6 IDOR regression smoke tests added. `portfolio-shadow-check.mjs` updated for `--jwt` flag. Cross-cutting: 30 routes (18 IDOR + 12 unauthenticated-read) + 6 `/api/user/*` = **36 secured routes** total across SPEC 30 1A + 1A.5 + 1A.6. **Phase 1A.5 SHIPPED 2026-05-14 ~17:10 AEST** — `assertOwnsOrWatched` helper + `authFetch` wrapper + 12 read routes hardened (`/api/portfolio`, `/api/positions`, `/api/activity`, `/api/history`, `/api/swap/quote`, `/api/analytics/{spending,yield-summary,portfolio-history,activity-summary,activity-heatmap,portfolio-multi,weekly-summary}`) + 9 client fetch sites migrated (5 canvases + 2 hooks + dashboard + SafetySection). The unauthenticated-read class is now structurally closed: middleware permissive-mode is unchanged but each affected route mandates a verified zkLogin JWT and either ownership or a `WatchAddress` row. **Test status:** 2986/2986 pass (was 2978 pre-1A.7/1A.8 — added 8 JWT-expiry tests + 1 cache-header regression test, ~2 IDOR-regression deltas).
> 
> **What v1.2 CLOSED means:** Phase 1A (IDOR), 1A.5 (unauthenticated-read), 1A.6 (user-namespace IDOR + forgeable header), 1A.7 (JWT-exp auto-logout), 1A.8 (CDN cache-poisoning), 1B (CodeQL), 1C (advisory + post-mortem + RUNBOOK) are all SHIPPED. The 4 reporter-class bugs and 4 self-found bugs are structurally fixed. The incident response playbook is institutionalised. The remaining work that was originally scoped under SPEC 30 (Phases 2–10: server-env-gate hardening, privacy delete/export, ops 2FA matrix, indexer hardening, engine prompt-injection coverage, dependency hygiene polish, gateway hardening, perimeter polish) is **spun out to follow-up SPECs 31–36** for founder triage by priority. Every "must-do-before-launch" task is done. Everything else is "nice-to-have-or-do-when-trigger-fires" and lives in its own spec. **D-14 GATEWAY-VERCEL FIX 2026-05-14 ~18:30 AEST** — first 5 t2000-gateway Vercel deploys after the D-14 env-gate landed all errored at build time with `[env] @t2000/gateway: invalid environment configuration` because the schema marked all 41 vendor API keys (ALPHAVANTAGE / ANTHROPIC / FAL / etc.) as `requiredString`. The gateway is by design a multi-vendor router — each vendor key is read in exactly one `chargeProxy` route, and a missing key turns into an upstream 401 at request time (graceful per-vendor degradation). Marking them required forced every key to be set in every Vercel environment before the gateway could boot at all. Fix: relaxed all 41 vendor keys to `optionalString` (still catches the empty-string-bug-class via the optional transform); only `INTERNAL_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` stay `requiredString` (infrastructure the gateway literally cannot run without). Local verification: gateway typecheck clean, 170/170 tests pass, `next build` succeeds with only the 3 required vars set. **Phase 1A.6 SHIPPED locally 2026-05-14 ~18:00 AEST** — pre-commit self-review of Phase 1A.5 surfaced 6 `/api/user/*` routes that were *still* either wide-open by `?address=` or used the forgeable `x-sui-address` header (Phase 1A misses, not a 1A.5 regression). Closed: `/api/user/preferences` GET+POST (CRITICAL — `permissionPreset` mutation was a money-loss vector via raised auto-execute thresholds), `/api/user/preferences/contacts/backfill` POST, `/api/user/memories` GET+DELETE, `/api/user/memories/[id]` DELETE, `/api/user/financial-profile` POST, `/api/user/watch-addresses` GET+POST+DELETE (last forgeable-header user-facing route in the codebase). 4 client fetch sites migrated to `authFetch` (`useContacts.ts` ×5, `MemorySection.tsx` ×4, `SafetySection.tsx` ×3, `dashboard-content.tsx` ×1 — 13 sites total). 6 IDOR regression smoke tests added. `portfolio-shadow-check.mjs` updated for `--jwt` flag. Cross-cutting: 30 routes (18 IDOR + 12 unauthenticated-read) + 6 `/api/user/*` = **36 secured routes** total across SPEC 30 1A + 1A.5 + 1A.6. **Phase 1A.5 SHIPPED 2026-05-14 ~17:10 AEST** — `assertOwnsOrWatched` helper + `authFetch` wrapper + 12 read routes hardened (`/api/portfolio`, `/api/positions`, `/api/activity`, `/api/history`, `/api/swap/quote`, `/api/analytics/{spending,yield-summary,portfolio-history,activity-summary,activity-heatmap,portfolio-multi,weekly-summary}`) + 9 client fetch sites migrated (5 canvases + 2 hooks + dashboard + SafetySection). The unauthenticated-read class is now structurally closed: middleware permissive-mode is unchanged but each affected route mandates a verified zkLogin JWT and either ownership or a `WatchAddress` row. **Test status:** 2978/2978 pass (was 2972 pre-1A.6 — added 6 IDOR regression smoke tests + 2 explicit auth tests in `preferences/route.test.ts` net new).
>
> **D-question resolution map at v1.0 lock:**
> - **Pre-locked during Phase 1A design (4):** D-1 (jose+JWKS no session table), D-2 (middleware + per-route assertOwns defense in depth), D-3 (no LinkedWallet read-through), D-4 (no formal bug-bounty program).
> - **Collaboratively locked at v1.0 session (8):** D-5 (security.txt only — defer WAF + honeypot), D-6 (GitHub-native Secret Scanning + Push Protection — skip gitleaks; both repos public so it's free), D-8 (bounded blast radius + D-13 gate; no LLM safety classifier), D-10 (per-IP rate limit on `/api/payments` POST; defer CAPTCHA), D-11 (Vercel-only telemetry; defer Sentry + PostHog), D-12 (ConversationLog 365d + user-toggle / AdviceLog 90d / UserMemory 365d default), D-13 (≥7d account-age gate before auto-execute), D-14 (single SPEC `S+1: cross-app-env-gate` for `apps/server` + `apps/gateway`).
> - **Deferred to separate workstreams (2):** D-7 (2FA enforcement matrix — operational paperwork, revisit when scaling past one dev), D-9 (indexer integrity — folds into a holistic indexer + stats consolidation spec, not piecemeal here).
>
> **Phase 1A + 1B SHIPPED 2026-05-14 ~13:50 AEST** in audric `6990313` — production smoke passed (5 IDOR routes × 2 attack vectors: missing JWT → 401, forged JWT → 401). Reporter PoC class is provably dead. Reporter follow-up sent by founder ~14:00 AEST.
>
> **Phase 2–10 implementation specs ready to spawn at founder triage** — each phase becomes its own SPEC# (downstream of v1.0 lock). Per the locked POST-SPEC-30 RECONSIDER TASK ORDER rule: founder reconsiders the full backlog (SPEC 28/29/11/11.5/16/27 + indexer-stats-consolidation-spec from D-9 deferral + cross-app-env-gate from D-14 lock + Phase 1A.5 unauthenticated-read class + Phase 2-10 implementation specs from this v1.0 lock) before resuming any prior queue item.

## v1.0 lock — what changed from v0.2.4

**Doc-only updates (no code):**
- Part 3 D-questions: 8 collaborative locks added (D-5 / D-6 / D-8 / D-10 / D-11 / D-12 / D-13 / D-14); 2 deferrals tagged (D-7 / D-9) with reactivation criteria.
- Banner moved from v0.2.4 (Phase 1A + 1B SHIPPED, doc-incomplete) to v1.0 LOCKED (all D-questions resolved).
- v1.0 unblocks Phase 2–10 implementation SPEC spawning at founder triage.

**Code-side state (unchanged from v0.2.4 ship):**
- Phase 1A IDOR class structurally closed across 18 audric API routes (audric `6990313`).
- Phase 1B CodeQL error triage shipped same commit (#7+#8 fixed via `escapeForScript`, #5 documented as acceptable trade-off).
- Phase 1C reporter follow-up sent by founder ~14:00 AEST.

**v0.2.4 → v1.0 lock summary:**

> **Phase 1A IDOR hot-patch + Phase 1B CodeQL error triage shipped 2026-05-14 ~13:50 AEST** — audric `6990313` merged to `main` → Vercel auto-deployed. **Production smoke (5 IDOR routes × 2 attack vectors): missing JWT → 401, forged JWT → 401. Reporter PoC class is provably dead.** **Reporter follow-up SENT by founder ~14:00 AEST** confirming structural fix is live, recognition offered per D-4 lock, no payout per case-by-case bug-bounty stance.
>
> **Self-review caught 11 additional IDOR-vulnerable routes that were missed in the initial v0.2.2 sweep — all 11 are now migrated and live in production.** All 4 sub-phases landed:
> - **Phase 1A.1** ✅ `lib/auth.ts` rewritten with `jose.jwtVerify` + Google JWKS + `verifyJwt` + `assertOwns` + `AuthError`. Legacy `decodeJwt`/`validateJwt` preserved as deprecated shims for unmigrated callers. (27 unit tests, all green.)
> - **Phase 1A.2** ✅ `middleware.ts` permissive JWT signature verification on every `/api/**` path (skip-list for `/api/internal/**`, `/api/cron/**`, `/api/services/{complete,retry}`, `/api/transactions/execute`). When JWT is present, signature MUST verify; when absent, request passes through (Phase 1A.5 will tighten to require). Stamps `x-auth-verified-sub` for downstream routes. (14 middleware tests, all green.)
> - **Phase 1A.3** ✅ Per-route `assertOwns` migrated across **18 IDOR-flagged routes** (8 in v0.2.2 initial sweep + 11 caught in self-review):
>   - **v0.2.2 initial sweep (8 endpoint groups):** `/api/user/status` GET, `/api/transactions/prepare` POST, `/api/payments/[slug]` PATCH+DELETE, `/api/payments` POST+GET, `/api/services/prepare` POST, `/api/user/wallets` GET+POST, `/api/user/wallets/[id]` DELETE, `/api/engine/sessions/[id]` GET+DELETE.
>   - **v0.2.3 self-review additions (11 endpoint groups):** `/api/identity/reserve` POST (CRITICAL — was minting on-chain leaves with attacker-controlled labels for victim wallets, burning Audric's gas pre-fund), `/api/identity/change` POST (CRITICAL — was rewriting victim handles), `/api/engine/chat` POST (auth-mode binding — demo mode unchanged), `/api/engine/regenerate` POST, `/api/engine/regen-append` POST, `/api/engine/resume` POST, `/api/engine/resume-with-input` POST, `/api/engine/sessions` GET (LIST), `/api/voice/synthesize` POST, `/api/voice/transcribe` POST, `/api/user/tos-accept` POST.
>   - Pre-Phase-1A `x-sui-address` header trust + structural-decode JWT trust (the EXACT class the reporter exploited via Burp Match-and-Replace) is replaced with verified-JWT-derived identity. Session-id-keyed routes use `404`-collapse rule to prevent enumeration. Voice routes additionally hardened by moving auth BEFORE the env-config + rate-limit checks (closes a tiny info-leak: anonymous callers could probe deployment configuration via 503 responses).
> - **Phase 1A.4** ✅ 27 IDOR regression tests in `__tests__/spec30-idor-regression.test.ts`: 18 deep tests for the original 7 routes (401-on-missing-JWT + 403-on-mismatch + 200-on-match) + 9 smoke tests for the 11 self-review additions (401-on-missing-JWT). The smoke-test rationale is documented in the test file: per-route 403/200 happy paths are already covered by each route's own pre-existing `.test.ts` suite.
>
> **Test-suite status:** 2913/2913 tests pass across 164 test files (was 2904/2904 in v0.2.2 — added 9 new IDOR smoke tests for the additional routes). Typecheck clean. Lint clean on Phase 1A surface.
>
> **Why this v0.2.2 → v0.2.3 expansion happened:** The user's pre-commit prompt — *"Do you want to review your work to ensure its implemented correctly and no issues or bugs before you commit and push and release it?"* — triggered a full grep audit of `validateJwt` callers. The original v0.2.2 sweep correctly closed the routes the reporter's PoC directly demonstrated (wallet/payment writes), but missed 11 additional routes that share the SAME structural bug class (JWT + address with no binding). The expansion is mechanical (~3 lines per route) but closes routes the reporter could trivially have pivoted to once they realized the pattern. Most consequential additions: `identity/reserve` + `identity/change` (on-chain mint griefing); `engine/chat`-family (chat history pollution + silent profile leak — exactly the "private chat history" claim in the reporter's PoC).
>
> **What ships in this lane:** the JWT class of IDOR — the exact attack the live researcher demonstrated. **Phase 1A.5 SHIPPED 2026-05-14 ~17:10 AEST** — the unauthenticated-read class is structurally closed: 12 routes (`/api/portfolio`, `/api/positions`, `/api/activity`, `/api/history`, `/api/swap/quote`, `/api/analytics/{spending,yield-summary,portfolio-history,activity-summary,activity-heatmap,portfolio-multi,weekly-summary}`) now require a verified zkLogin JWT and either ownership or a `WatchAddress` row. New `assertOwnsOrWatched` helper handles the watched-address allowance pattern. New `authFetch` wrapper (`lib/auth-fetch.ts`) migrated 9 client fetch sites (5 canvases + `useBalance` + `useActivityFeed` + `dashboard-content.tsx` + `SafetySection`). Forgeable `x-sui-address` header trust path is gone from every secured route. Tests: 39/39 auth + 7/7 authFetch all green; full suite 2972/2972 pass.
>
> **Phase 1A.6 SHIPPED 2026-05-14 ~18:00 AEST** — pre-commit self-review of 1A.5 caught 6 `/api/user/*` routes that were Phase 1A misses (not a 1A.5 regression — different namespace). The user requested *"do you need to review your work first before to ensure its implemented correctly"* explicitly to surface this class. 6 routes closed:
> - `/api/user/preferences` GET — was leaking contacts list, financial profile, daily limits, account-age, permission preset.
> - **`/api/user/preferences` POST — CRITICAL.** Was wide-open by body `address`; an attacker could overwrite any user's `permissionPreset` to `aggressive`, raising auto-execute thresholds (e.g. swap auto-tier from $5 → $25). Combined with the engine's auto-execute path this was a silent money-loss vector for the next chat session.
> - `/api/user/preferences/contacts/backfill` POST — was wide-open. Attacker could fan out RPC traffic on any victim's contact list.
> - `/api/user/memories` GET+DELETE — was wide-open. GET leaked silent-profile memories (private inferred financial / behavioural data); DELETE wiped them (DoS class).
> - `/api/user/memories/[id]` DELETE — was wide-open. Per-memory wipe.
> - `/api/user/financial-profile` POST — was wide-open. Attacker could overwrite any user's self-reported `style` + `notes`.
> - `/api/user/watch-addresses` GET+POST+DELETE — was using forgeable `x-sui-address` header (the EXACT class the reporter PoC demonstrated via Burp Match-and-Replace). This was the last user-facing route still on the forgeable-header pattern.
>
> 13 client fetch sites migrated to `authFetch` (`useContacts.ts` ×5, `MemorySection.tsx` ×4, `SafetySection.tsx` ×3, `dashboard-content.tsx` ×1). Tests: 6 new IDOR regression smoke tests in `__tests__/spec30-idor-regression.test.ts` + 2 explicit `401-on-missing-JWT` tests added to `app/api/user/preferences/route.test.ts` (one of which asserts that `mockUpsert` is NEVER called on auth failure — preventing future `permissionPreset` mutation regressions). `portfolio-shadow-check.mjs` updated for `--jwt` flag. Full suite: **2978/2978 pass** (was 2972 pre-1A.6). Lint clean. Typecheck clean. **Cumulative SPEC 30 secured-route count: 36 (18 IDOR + 12 unauthenticated-read + 6 user-namespace).**
>
> **Phase 1B (CodeQL error triage) SHIPPED in same commit:**
> - **#7 + #8 (`js/bad-code-sanitization`)** ✅ `lib/theme/script.ts` `escapeForScript()` helper escapes `<`, `>`, `\u2028`, `\u2029` so inline-script JSON cannot break out of the `<script>` tag. +4 unit tests.
> - **#5 (`js/clear-text-storage-of-sensitive-data`)** ✅ `lib/zklogin.ts` JSDoc updated with full trust-model rationale (zkLogin ephemeral keys are time-bounded ~1h via `maxEpoch`, no server-side option, match Mysten reference, rotate per-session). Marked for dismissal as *"documented trade-off"*.
>
> **All 14 D-questions resolved at v1.0:** see resolution map above + Part 3 for full lock detail.
>
> **Predecessors of this revision (v0.1 → v0.2):** v0.1 SCOPE-LOCKED 2026-05-14 ~09:25 AEST. Founder confirmed: scope items A–E in, Phase 1 hot-patch proceeds (implementation-allowed deviation), D-4 bug-bounty pre-locked (no formal program — case-by-case, no payout for this report; offer recognition instead). **After SPEC 30 security tasks close, SPEC 29 stays paused; founder reconsiders task order before resuming any prior queue item.** SPEC# is provisional; founder picks final SPEC# at v1.0 close.
>
> **Founder framing 2026-05-14 ~08:00 AEST (post-SPEC-29 v0.1 lock):** *"crazy spec and im kinda scared. im not working on this yet ... So next logical step is security spec / tasks. CROSS REPO SECURITY REVIEW."*
>
> **Founder lock 2026-05-14 ~09:25 AEST:** *"1) Add Items A–E above — in scope · 2) Phase 1 hot-patch proceed · 3) We should reply but i have no bug bounty program · ALso after security tasks pause spec 29 first and reconsider the task order."*
>
> **🚨 LIVE P0 INPUT (2026-05-14 ~09:20 AEST).** External security researcher report received 2026-05-11 ~09:07 (3 days ago — past the 48h ack window the reporter requested). Reporter "some cokelat" (somecokelat@gmail.com → support@t2000.ai + security@t2000.ai). Concrete claim: address-based IDOR via Burp Suite "Match and Replace" on header + body. Read-only triage during scope-check confirmed plausibility on multiple `address`-keyed routes. **Detail in §0 below + S-IDOR finding lane in Part 2 + Phase 1 hot-patch in Part 5.**
>
> **Trigger.** During the SPEC 26 v1.0.3 smoke (2026-05-13), founder noticed unauthorized scan-style probes hitting audric — `api/v2/config`, `api/env/env.json`, `.env`, `.git/config`, etc. — and queued a security review *"after we finish fixing the mpp."* SPEC 26 closed at v1.0.4; SPEC 29 v0.1 locked design-only on 2026-05-14. **The external IDOR report (above) accelerates the security pivot from "next" to "now with a hot-patch lane."**
>
> **Shape lineage.** Mirrors SPEC 29 structurally — Part 1 current-state audit → Part 2 findings (S-1..S-N with severity tags) → Part 3 D-questions (locked collaboratively) → Part 4 placeholder if any → Part 5 phases with acceptance gates → Part 6 out-of-scope + cross-references. **Deviation from SPEC 29 discipline:** Phase 1 is a hot-patch lane (implementation allowed) for the IDOR class + the 3 audric error-severity CodeQL alerts, given the external report + 48h-window-already-elapsed posture. **Phases 2..N stay doc-only audit + design** (same discipline as SPEC 29); each phase becomes its own implementation SPEC at founder triage.
>
> **Post-SPEC-30 sequencing (founder lock 2026-05-14 ~09:25 AEST).** When SPEC 30 closes at v1.0:
> 1. **PAUSE SPEC 29.** Do NOT auto-resume the previously locked SPEC 29 Phase 1 → SPEC 28 → SPEC 11 → ... sequence.
> 2. **Reconsider task order.** Founder triages the new combined backlog (SPEC 29 phases + SPEC 30 phases + SPEC 11/11.5/16/27/28 + Audric Store master spec) and re-locks priority. Security work may surface new dependencies that reshape the queue.
> 3. The audric-build-tracker.md "Forward backlog" table at the top is the source-of-truth for SPEC numbering at that triage; HANDOFF_NEXT_AGENT.md gets updated with the new locked sequence.
>
> **Local-only, gitignored** — same convention as SPEC 23 series, SPEC 24, SPEC 25, SPEC 26, SPEC 29, AUDRIC_HARNESS_*_SPEC, audric-roadmap, audric-build-tracker, HANDOFF_NEXT_AGENT.
>
> **Predecessors:**
> - SPEC 29 (MPP Cross-Repo Audit) — v0.1 LOCKED 2026-05-14, design-only, deferred per founder lock. Sets the SHAPE template this spec mirrors.
> - SPEC 26 (MPP Settle-on-Success) — SHIPPED v1.0.4. Defense-in-depth lessons (validate hooks, classifier coverage, telemetry events) inform Part 1 perimeter inventory.
>
> **Successors (this audit produces inputs for):**
> - Each Phase in §5 may become its own implementation SPEC at founder triage.
> - Audric Store Phase 5 master spec — security findings on creator-asset access control + buyer payment paths feed it.
>
> **Out of scope (provisional — confirm at scope lock):**
> - Implementation of any finding **except the Phase 1 IDOR hot-patch lane** (founder confirms scope of that lane below).
> - Re-deriving SPEC 29 findings (this audit references but does NOT duplicate F-7 retry parity, F-13 audric orphan, F-11 vendor failover; if a security angle exists on top of those, it gets a separate finding).
> - Audric Store storefront UI security model — owned by Audric Store Phase 5 master spec.
> - **Sui contract / Move-side security** — `t2000::treasury::collect_fee` is **stale / decommissioned** per CLAUDE.md Critical Rule #9 (B5 v2, 2026-04-30). Fees are now an Audric concern (inline `addFeeTransfer` + indexer detection); the deprecated Move treasury contract is no longer on the on-chain critical path. Anything still calling it would be dead code; this audit grep-confirms (Phase 1 §3) but does NOT propose Move-side changes.
> - Mysten contract coordination — out of t2000-repo scope; founder owns conversations.
> - Penetration testing / red-team engagement — this audit identifies the inventory; pen-test is a follow-up if the inventory is too large to self-audit.

---

## Table of contents

**Part 1 — Current State Audit** ✅ DRAFTED v0.2
- §0 Pre-existing security inputs (15 GitHub code-scanning alerts + IDOR researcher report + treasury contract status) — drafted v0.1; seeds Part 2 findings
- §1 Web-perimeter inventory (audric `next.config.ts` headers, `middleware.ts`, public vs auth-required routes, scan-endpoint posture) ✅
- §2 Sponsor-tx + signing surface (Enoki API, `services/prepare` → `services/complete`, zkLogin nonce + ephemeral key, sponsored-tx allow-listing) ✅
- §3 MPP gateway perimeter (gateway env-secret inventory, per-route auth, mppx receipt validation, internal admin endpoints) ✅
- §4 Internal-API + cron contract (**A — locked in scope**) ✅
- §5 Wallet / signing user surface (zkLogin + ephemeral key + sponsored-PTB validation + contact resolver) — **the IDOR class lives here** + **D — locked in scope** ✅
- §6 Data + privacy (Prisma model PII inventory, NeonDB row-level access, GDPR/CCPA delete-my-account) ✅
- §7 Dependency hygiene (`pnpm audit` baseline, supply-chain risk for `@mysten/*` / `@cetusprotocol/*` / `@navi/*` / `@suimpp/*`, `pnpm.overrides` chain, patched dependencies) ✅
- §8 Operational + secret management (2FA matrix, secret-scanning hooks, founder-personal vs org-account separation, agent shell + MCP injection surface, incident response posture) ✅
- §9 Engine / agent surface (**B + C — locked in scope**) ✅
- §10 Indexer + on-chain integrity (**E — locked in scope**) ✅

**Part 2 — Findings** ✅ DRAFTED v0.2 — numbered S-N. Severity tags **P0** production-blocking · **P1** material risk · **P2** quality-of-life · **P3** nice-to-have. ~117 findings total (4 P0, 12 P1, ~55 P2, ~45 P3).

**Part 3 — D-questions** ✅ DRAFTED v0.2 — 12 founder decision points. D-2 + D-3 + D-4 + D-7 pre-locked; D-1, D-5, D-6, D-8, D-9, D-10, D-11, D-12 awaiting v0.2 review locks.

**Part 4 — Deferred / placeholder content** — n/a for v0.2.

**Part 5 — Phases + Acceptance Gates** ✅ DRAFTED v0.2 — 10 phases (1A IDOR hot-patch, 1B CodeQL error triage, 1C reporter follow-up, 2 cross-app env-gate, 3 privacy, 4 operational, 5 indexer hardening, 6 engine prompt-injection, 7 dependency hygiene, 8 gateway hardening, 9 CSP+WAF, 10 final sweep + v1.0 lock).

**Part 6 — Out of scope + cross-references** ✅ DRAFTED v0.2.

---

## §0 — Pre-existing security inputs (drafted at scope-check time, 2026-05-14)

This section enumerates the concrete security inputs that pre-date Part 1 drafting. Each entry seeds a finding in Part 2 (numbered S-N). The IDOR researcher report is the highest-severity input and gates Phase 1 scope.

### §0.1 — External researcher report (P0, 2026-05-11)

**Reporter.** "some cokelat" <somecokelat@gmail.com> → support@t2000.ai + security@t2000.ai
**Date received.** 2026-05-11 ~09:07 (3 days ago — original 48h ack window already elapsed).
**Disclosure posture.** Responsible (not yet public; awaiting acknowledgment). Asked about bug bounty.
**Reporter's classification.** IDOR (Insecure Direct Object Reference) + Broken Access Control + Critical.
**Reporter's PoC.** Burp Suite "Match and Replace" rules on Request Header AND Request Body — auto-swap legitimate sender's address with target address `0x72de...` on every outbound request. Server accepted modified payload as valid.
**Reporter's claimed impact.** (a) Read private chat history of arbitrary addresses; (b) wallet access risk if chat logs contain credentials; (c) direct financial loss.

**Audit triage during scope check (read-only, not exhaustive — Phase 1 does the full inventory):**

The researcher's claim is **structurally real**. Two structural issues compound:

1. **`decodeJwt` in `apps/web/lib/auth.ts` (L27–38) does NOT verify JWT signature.** Comment explicitly says: *"For full security, use a proper JWT library with JWKS verification."* Server trusts whatever a client puts in the JWT body. An attacker can craft any JWT payload and pass `validateJwt`.

2. **Address-keyed routes do NOT bind the request `address` to the authenticated user's `suiAddress`** (the `sub`-derived address from the JWT, which would be the correct binding even if the JWT signature were verified). Concrete examples found in scope-check spot-check (NOT the full inventory — Phase 1 enumerates all 60+ `app/api/**/route.ts` paths):

| Route | Auth check | Address source | Binding to auth | Verdict |
|---|---|---|---|---|
| `GET /api/portfolio?address=0x...` | **None** (no JWT required) | query | n/a | 🔴 Anyone (anonymous) reads any portfolio |
| `GET /api/user/status?address=0x...` | `validateJwt` (signature unverified) | query | **none** | 🔴 Any-JWT reads/upserts ToS state for any address |
| `GET /api/engine/sessions/[id]` | `validateJwt` (signature unverified) | path param | **none** | 🔴 Any-JWT reads any session timeline (private chat) by guessing/discovering session id |
| `POST /api/transactions/prepare` (body `{ type, address, ... }`) | `validateJwt` (signature unverified) | **request body** | **none** at audric layer | 🟡 Audric layer builds + sponsors for the body-supplied address. Enoki may reject if JWT `sub` ≠ sender, but Enoki's checks are not documented in audric's code path. Even if Enoki rejects, the **read-side** is exploited (balance fetch, `composeTx` simulation may run before the Enoki rejection) |
| `POST /api/transactions/execute` | (not yet checked — Phase 1 §2) | (not yet checked) | (not yet checked) | TBD |

**The reporter's "Wallet Access Risk" claim is bounded by zkLogin's ephemeral-key model** — the ephemeral private key never leaves the client's localStorage, so an attacker cannot sign on the victim's behalf even if they swap addresses on `prepare`. The Enoki sponsorship + user signature requirement on `execute` is the floor that prevents fund theft. **However**, the read-side leak is real and severe:
- Wallet portfolio (savings, debt, holdings, HF) → readable.
- Private chat history (engine session timeline) → readable.
- ToS / session usage state → writable (less impactful but still IDOR).
- User memory + advice log + financial profile (per `prisma-models-overview.mdc`) → readable via the engine session route or any other route that surfaces them.

**This is a Critical finding by any standard.** Even if the on-chain-loss path is bounded, the PII + chat-history + financial-context leak for arbitrary addresses is unambiguous.

**Where this lands:**
- **Part 2 S-IDOR (P0)** — full route inventory + structural fix design.
- **Part 5 Phase 1 — Hot-patch lane** — implementation-allowed (deviating from doc-only discipline) to ship the structural fix ASAP. Scope skeleton below.

**Acknowledgment posture (LOCKED 2026-05-14 ~09:25 AEST):**
1. **Reply to reporter** — drafted below for founder review; founder sends from `security@t2000.ai`. Acknowledges receipt, apologizes for delayed ack (3 days late), confirms fix-in-flight, coordinates disclosure timeline.
2. **Bug-bounty posture (D-4 PRE-LOCKED).** No formal bug-bounty program. **No payout for this report.** Offer alternative recognition: public credit in the security advisory + acknowledgment in the fix's release notes (if the reporter consents). Future formal program is a placeholder for post-launch consideration; not part of SPEC 30.
3. **Disclosure timeline** — reporter has been responsible; aim for fix-in-prod-then-coordinate-public-disclosure within 14 days. Fix should ship via Phase 1 hot-patch within 24–36h scoped to known-exploited routes; full inventory + structural fix lands in Phase 1B (~2–4d total).

#### §0.1.1 Reporter reply (DRAFT for founder review — send from `security@t2000.ai`)

> **Send-as.** `security@t2000.ai` (or `support@t2000.ai` cc'd, since reporter sent to both).
> **To.** `somecokelat@gmail.com`
> **Reply-thread.** Reply to the original "[URGENT] Critical Security Vulnerability: Unauthenticated IDOR leading to Wallet & Chat Access on audric.ai" — preserve subject so reporter's filters thread it.
> **Why this draft.** Founder is the only authoritative voice here; AI agent should not send security comms directly. This is a starting draft; founder edits voice before sending.

```
Subject: Re: [URGENT] Critical Security Vulnerability: Unauthenticated IDOR leading to Wallet & Chat Access on audric.ai

Hi,

Thank you for the detailed report and for following responsible-disclosure
principles. I want to start with an apology — your message reached us on
May 11 and we are responding outside the 48-hour window you requested. The
report did not get triaged in time on our side; that's on us, and we'll do
better.

We have validated the IDOR class you described. You are correct that several
of our address-keyed routes do not properly bind the request's `address`
parameter to the authenticated user's identity, and that our JWT validation
path was not verifying token signatures end-to-end. Both gaps trace back to
the same structural cause, and we are fixing them at the root rather than
patching individual endpoints.

What we are doing right now (in priority order):

  1. A scoped hot-patch is going out within the next 24–36 hours covering
     the routes most exposed by the report.
  2. A full inventory of every API route is in progress; the structural
     fix introduces signature-verified JWTs (via Google JWKS) and
     centralized address binding so that no future route can ship without
     it. Target: in production within a few days.
  3. Integration tests that explicitly assert anonymous → 401, cross-user
     → 403, owner → 200 across every address-keyed route, so this class
     can't regress silently.

We will send you a follow-up once the structural fix is live in production.
At that point we'd like to coordinate a public-disclosure date — our
preference is 14 days from your acknowledgment of this email, with
flexibility if testing shows we need longer.

On the bug-bounty question: t2000.ai does not currently run a formal
bug-bounty program, and we do not have a payout for this report. That's a
limitation of where we are as a small team, not a reflection of how
seriously we take what you sent us — your report is exactly the kind of
finding a formal program would reward. What we can offer:

  - Public credit in the security advisory we publish when the fix ships.
  - An acknowledgment in our release notes / changelog (if you'd like
    your handle attributed; also fine if you'd prefer to remain
    anonymous).
  - A direct security channel at security@t2000.ai for any follow-up
    findings.

If a formal bug-bounty program comes online later this year, we will
back-credit this report.

A few clarifying questions to make sure we close the right surface:

  1. Were the only HTTP methods you tested GET (read paths), or did you
     also exercise POST / PATCH (write paths) with the address swap?
  2. The PoC mentions intercepting "private keys, seed phrases, or
     session tokens" inside chat history — could you share which route's
     response surfaced that content? Audric uses zkLogin, so there are
     no seed phrases by design and ephemeral signing keys never leave the
     browser, but if any route is leaking session tokens or other
     sensitive material we want to find it now and fix it alongside the
     IDOR.
  3. Any other endpoints you successfully exercised that aren't named in
     the report — anything you'd like us to add to the fix list?

Please confirm you'd like to be credited (and how — handle / name /
anonymous) and that the 14-day public-disclosure window works on your end.

Thank you again for the responsible disclosure.

Best regards,
[Founder name]
t2000 / audric.ai
```

**Editing notes for founder before sending:**
- Replace `[Founder name]` with your sign-off.
- Tone is intentionally direct + honest about the missed ack window; soften or harden as you prefer. Don't claim "we caught it independently" — the reporter found it.
- The 3 clarifying questions at the bottom are functional intel — they help us scope Phase 1A correctly. If you'd rather not invite further engagement, drop them; otherwise leave them in.
- Attach nothing in this first reply. Save the public-advisory draft for the post-fix follow-up.

---

### §0.2 — GitHub code-scanning backlog (CodeQL, scanned 2026-05-14)

**t2000 — 7 OPEN alerts** (`gh api repos/mission69b/t2000/code-scanning/alerts`):

| # | Severity | Rule | Created |
|---|---|---|---|
| 33 | warning | `js/insufficient-password-hash` | 2026-05-13 |
| 32 | warning | `js/polynomial-redos` | 2026-05-05 |
| 31 | warning | `js/polynomial-redos` | 2026-05-05 |
| 30 | warning | `js/polynomial-redos` | 2026-05-05 |
| 29 | warning | `js/polynomial-redos` | 2026-05-01 |
| 25 | warning | `js/polynomial-redos` | 2026-04-12 |
| 24 | warning | `js/incomplete-url-substring-sanitization` | 2026-04-12 |

**audric — 8 OPEN alerts** (`gh api repos/mission69b/audric/code-scanning/alerts`):

| # | Severity | Rule | Created |
|---|---|---|---|
| 14 | warning | `js/tainted-format-string` | 2026-05-13 |
| 13 | warning | `js/tainted-format-string` | 2026-04-28 |
| 12 | warning | `js/tainted-format-string` | 2026-04-28 |
| 11 | warning | `js/polynomial-redos` | 2026-04-27 |
| 9 | warning | `js/tainted-format-string` | 2026-04-27 |
| **8** | **error** | `js/bad-code-sanitization` | 2026-04-20 |
| **7** | **error** | `js/bad-code-sanitization` | 2026-04-20 |
| **5** | **error** | `js/clear-text-storage-of-sensitive-data` | 2026-04-03 |

**Triage notes:**
- The 3 audric `error`-severity alerts (#5, #7, #8) are non-trivial: `js/bad-code-sanitization` typically indicates an XSS/HTML-injection sink with broken sanitizer; `js/clear-text-storage-of-sensitive-data` typically indicates secret/credential persisted to localStorage / cookie / log. Phase 1 §1 (web perimeter) reads each alert + decides patch vs dismiss-with-justification.
- The 9 `js/polynomial-redos` warnings are likely legitimate (regex worst-case backtracking) but P2-tier — opportunistic fix during Phase 9-equivalent.
- `js/tainted-format-string` (4 audric alerts) suggests user-controlled input flowing into a format string — likely log lines or error messages. P2-tier; check whether attacker-influence is bounded.

**Where this lands:**
- **Part 2 S-CodeQL-N findings** (one per alert OR grouped by rule type with an inventory).
- **Part 5 Phase 1** triages the 3 errors; Phase X-equivalent (low-priority) sweeps the 12 warnings.

---

### §0.3 — Treasury contract status (deprecated)

**Confirmation.** Per CLAUDE.md Critical Rule #9 (B5 v2, 2026-04-30): the `t2000::treasury::collect_fee` Move call and the `addCollectFeeToTx` SDK helper were **removed** as of `@t2000/sdk@1.1.0`. Fees are an Audric-only concern: `audric/apps/web/app/api/transactions/prepare/route.ts` calls `addFeeTransfer(tx, coin, FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount)` inline; the indexer detects USDC inflows to the wallet and writes `ProtocolFeeLedger` rows.

**Implication for this audit.**
- **Out of scope:** any Move-side security review of `t2000::treasury::*` — the contract is dormant on the on-chain critical path.
- **In scope:** Phase 1 §3 grep-confirms zero remaining call sites in t2000 + audric + `@t2000/sdk` (sanity check; if any remain, they're dead code → flag for deletion).
- **In scope (related):** the indexer's `ProtocolFeeLedger` write path (per `audric-canonical-write.mdc` cross-reference) is **on-critical-path** for creator fees at Audric Store launch — covered in §3 + §6 (data integrity if indexer mis-attributes).

### §0.4 — Audric API route inventory (Phase 1A pre-work, 2026-05-14 ~09:50 AEST)

**Why this section exists.** Phase 1A hot-patch needs a route-by-route auth-binding inventory before the structural fix lands. This section is the working-doc inventory; Phase 1A implementation reads it, fixes each row, and ticks the verdict column.

**Scope.** All 62 `audric/apps/web/app/api/**/route.ts` files (Glob, 2026-05-14). Each row captures: route → HTTP method(s) → current auth check → `address` source (if any) → currently-bound-to-authUser? → verdict.

**Verdict legend:**
- `IDOR-VULN-READ` — accepts an address (query / header / body) without binding to auth; reads sensitive data. Phase 1A FIX-REQUIRED.
- `IDOR-VULN-WRITE` — accepts an address without binding; writes/mutates state. Phase 1A FIX-REQUIRED (higher severity than READ).
- `JWT-UNVERIFIED` — calls `validateJwt` but signature isn't verified; payload is attacker-controllable. Phase 1A FIX-REQUIRED via the `jose`+JWKS migration.
- `JWT-OK-ADDR-OK` — JWT signature-verified AND address bound to JWT-derived `suiAddress`. (Will be the post-fix steady state for user-scoped routes.)
- `INTERNAL-OK` — `x-internal-key` gate; backend-to-backend; address comes from cron payload (trusted source). Audit in §4 separately, but NOT IDOR-class.
- `PUBLIC-INTENTIONAL` — no auth by design (build-id, prices, rates, suins/resolve, identity/check, swap/quote, build-id, stats); does NOT take an address OR address is intentionally public (e.g. payment-link `[slug]` lookup).
- `SIG-GATED` — no JWT but ephemeral-key signature on a sponsored-tx payload structurally gates the action (e.g. `transactions/execute`).
- `TBC` — needs deeper read; included for Phase 1A inventory pass.

#### §0.4.1 — Read-only triage matrix (28 address-keyed routes; verified via grep 2026-05-14)

> ⚠️ **Today every route below that is NOT marked `JWT-OK-ADDR-OK` is a Phase 1A fix-required row.** Even the ones marked `JWT-UNVERIFIED` are vulnerable today because `decodeJwt` doesn't verify signatures. Until the `jose`+JWKS migration ships, **every JWT-gated route is structurally bypassable** by crafting a payload with the victim's `sub` claim.

| # | Route | Methods | Auth check today | `address` source | Bound? | Verdict |
|---|---|---|---|---|---|---|
| 1 | `/api/portfolio` | GET | none | query `address` | no | **IDOR-VULN-READ** *(in reporter PoC)* |
| 2 | `/api/activity` | GET | none | query `address` | no | **IDOR-VULN-READ** |
| 3 | `/api/history` | GET | none | TBC | no | **IDOR-VULN-READ** |
| 4 | `/api/positions` | GET | none | TBC | no | **IDOR-VULN-READ** |
| 5 | `/api/analytics/spending` | GET | none | header `x-sui-address` ∥ query `address` | no | **IDOR-VULN-READ** |
| 6 | `/api/analytics/activity-summary` | GET | none | TBC (likely query) | no | **IDOR-VULN-READ** |
| 7 | `/api/analytics/activity-heatmap` | GET | none | TBC | no | **IDOR-VULN-READ** |
| 8 | `/api/analytics/yield-summary` | GET | none | TBC | no | **IDOR-VULN-READ** |
| 9 | `/api/analytics/portfolio-history` | GET | none | TBC | no | **IDOR-VULN-READ** |
| 10 | `/api/analytics/portfolio-multi` | GET | none | TBC | no | **IDOR-VULN-READ** |
| 11 | `/api/analytics/weekly-summary` | GET / POST | INTERNAL-OK *(also takes `address`?)* | TBC | n/a | TBC — confirm cron-only |
| 12 | `/api/user/memories` | GET / POST | none | TBC | no | **IDOR-VULN-READ + WRITE** |
| 13 | `/api/user/memories/[id]` | GET / PATCH / DELETE | none | TBC | no | **IDOR-VULN-WRITE** |
| 14 | `/api/user/preferences` | GET / PATCH | none | TBC | no | **IDOR-VULN-WRITE** |
| 15 | `/api/user/preferences/contacts/backfill` | POST | none | TBC | no | **IDOR-VULN-WRITE** |
| 16 | `/api/user/financial-profile` | GET | none | TBC | no | **IDOR-VULN-READ** *(highly sensitive — financial-context PII)* |
| 17 | `/api/user/watch-addresses` | GET / POST | none | TBC | no | **IDOR-VULN-WRITE** |
| 18 | `/api/user/status` | GET / POST | validateJwt + query `address` (unverified bind) | query / body | partial — JWT taken but signature unverified, address unbound | **JWT-UNVERIFIED + IDOR-VULN-WRITE** *(in reporter PoC)* |
| 19 | `/api/user/wallets` | GET / POST | validateJwt | TBC | TBC | **JWT-UNVERIFIED** |
| 20 | `/api/user/wallets/[id]` | PATCH / DELETE | validateJwt | TBC | TBC | **JWT-UNVERIFIED** |
| 21 | `/api/engine/sessions` | GET / POST | validateJwt | TBC | TBC | **JWT-UNVERIFIED** *(if sessions list filterable by address)* |
| 22 | `/api/engine/sessions/[id]` | GET / DELETE | validateJwt | path `id` | no — session ownership not asserted | **JWT-UNVERIFIED + IDOR-VULN-READ** *(in reporter PoC, session-id enumeration)* |
| 23 | `/api/payments` | GET / POST | validateJwt | TBC | TBC | **JWT-UNVERIFIED** |
| 24 | `/api/payments/[slug]` | GET / DELETE | mixed (public read of slug; JWT-gated cancel?) | path `slug` | n/a (slug is the access token) | TBC — confirm slug entropy + cancel-binding |
| 25 | `/api/voice/synthesize` | POST | validateJwt | TBC (body `address`?) | TBC | **JWT-UNVERIFIED** |
| 26 | `/api/identity/reserve` | POST | validateJwt | body `address` | TBC | **JWT-UNVERIFIED** *(could allow squatting handles for arbitrary addresses)* |
| 27 | `/api/identity/change` | POST | validateJwt | body `address` | TBC | **JWT-UNVERIFIED** |
| 28 | `/api/transactions/prepare` | POST | validateJwt + body `address` (unverified bind) | body | partial | **JWT-UNVERIFIED + IDOR-VULN-WRITE** *(in reporter PoC; bounded by ephemeral-key floor on execute, but read-side leak via simulate is severe)* |

#### §0.4.2 — Non-address-keyed routes (34 routes)

> Inventory'd but lower IDOR-class urgency. Captured here for completeness; Phase 1A reads each to confirm the categorization.

| # | Route | Methods | Auth check today | Verdict |
|---|---|---|---|---|
| 29 | `/api/build-id` | GET | none | PUBLIC-INTENTIONAL |
| 30 | `/api/prices` | GET | none | PUBLIC-INTENTIONAL |
| 31 | `/api/rates` | GET | none | PUBLIC-INTENTIONAL |
| 32 | `/api/quote` | GET | none | PUBLIC-INTENTIONAL *(swap quote, no PII)* |
| 33 | `/api/swap/quote` | GET | none | PUBLIC-INTENTIONAL |
| 34 | `/api/stats` | GET | none | PUBLIC-INTENTIONAL *(global stats)* |
| 35 | `/api/suins/resolve` | GET | none | PUBLIC-INTENTIONAL *(name resolver)* |
| 36 | `/api/identity/search` | GET | none | PUBLIC-INTENTIONAL *(handle → address)* |
| 37 | `/api/identity/check` | GET | none | PUBLIC-INTENTIONAL *(handle availability)* |
| 38 | `/api/voice/status` | GET | none | TBC — confirm no PII |
| 39 | `/api/transactions/execute` | POST | none | **SIG-GATED** *(ephemeral-key signature on sponsored tx; structurally protected)* |
| 40 | `/api/services/prepare` | POST | validateJwt + INTERNAL (mixed) | **JWT-UNVERIFIED** *(MPP service prep flow)* |
| 41 | `/api/services/complete` | POST | INTERNAL | INTERNAL-OK |
| 42 | `/api/services/retry` | POST | TBC | TBC |
| 43 | `/api/payments/[slug]/verify` | POST | none | TBC — confirm slug-bound or ownership-bound |
| 44 | `/api/user/tos-accept` | POST | validateJwt | **JWT-UNVERIFIED** |
| 45 | `/api/engine/chat` | POST | validateJwt | **JWT-UNVERIFIED** |
| 46 | `/api/engine/resume` | POST | validateJwt | **JWT-UNVERIFIED** |
| 47 | `/api/engine/resume-with-input` | POST | validateJwt | **JWT-UNVERIFIED** |
| 48 | `/api/engine/regenerate` | POST | validateJwt | **JWT-UNVERIFIED** |
| 49 | `/api/engine/regen-append` | POST | validateJwt | **JWT-UNVERIFIED** |
| 50 | `/api/voice/transcribe` | POST | validateJwt | **JWT-UNVERIFIED** |
| 51 | `/api/internal/notification-users` | POST | INTERNAL | INTERNAL-OK |
| 52 | `/api/internal/profile-inference` | POST | INTERNAL | INTERNAL-OK |
| 53 | `/api/internal/user-address` | GET | INTERNAL | INTERNAL-OK |
| 54 | `/api/internal/health-factor` | POST | INTERNAL | INTERNAL-OK |
| 55 | `/api/internal/financial-context-snapshot` | POST | INTERNAL | INTERNAL-OK |
| 56 | `/api/internal/payments` | POST | INTERNAL | INTERNAL-OK |
| 57 | `/api/internal/chain-memory` | POST | INTERNAL | INTERNAL-OK |
| 58 | `/api/internal/memory-extraction` | POST | INTERNAL | INTERNAL-OK |
| 59 | `/api/internal/portfolio-snapshot` | POST | INTERNAL | INTERNAL-OK |
| 60 | `/api/internal/app-event` | POST | INTERNAL | INTERNAL-OK |
| 61 | `/api/cron/turn-metrics-cleanup` | POST / GET | TBC (Vercel cron secret?) | TBC |
| 62 | `/api/cron/turn-metrics-pending-sweep` | POST / GET | TBC | TBC |

#### §0.4.3 — Phase 1A summary counts

- **JWT-OK-ADDR-OK today: 0** — no route is fully secure under the new model. Even ones that "validate" the JWT do not verify signatures.
- **IDOR-VULN-READ (no auth, accepts address): 10** — rows 1–10 above. Highest priority.
- **IDOR-VULN-WRITE (no auth, mutates): 6** — rows 12–17. Even higher priority (write impact > read impact).
- **JWT-UNVERIFIED (validates JWT but signature unverified): 19** — affects every route that calls `validateJwt`. Resolved by the `jose`+JWKS migration (single-PR fix in `lib/auth.ts`).
- **TBC: 9** — need a deeper read in Phase 1A pass.
- **PUBLIC-INTENTIONAL: 9** — no fix needed.
- **INTERNAL-OK: 11** — separate audit in §4 (key rotation + idempotency); not IDOR-class.
- **SIG-GATED: 1** — `transactions/execute`; structurally protected by ephemeral-key sig requirement.

#### §0.4.4 — Structural fix design (Phase 1A pre-design)

**Three coordinated changes ship together:**

1. **Replace `decodeJwt` with `jose` + Google JWKS verification** in `apps/web/lib/auth.ts`.
   - Use `jose.createRemoteJWKSet('https://www.googleapis.com/oauth2/v3/certs')` with `cooldownDuration` for cache.
   - `validateJwt` returns the verified payload OR `{ error: 401 }`. No more "decode-trust-payload".
   - Add `jwtPayloadToSuiAddress(payload)` helper that derives the deterministic Sui address from `(sub, salt, audience)` using `@mysten/zklogin/jwtToAddress` — this is what binds JWT identity to on-chain identity.
   - Single PR; touches one file; test surface is contained.

2. **Centralize address binding in `apps/web/middleware.ts`.**
   - For every route under `/api/**` (except `/api/build-id`, `/api/prices`, `/api/rates`, `/api/quote`, `/api/swap/quote`, `/api/stats`, `/api/suins/resolve`, `/api/identity/search`, `/api/identity/check`, `/api/voice/status`, `/api/internal/*`, `/api/cron/*`, `/api/transactions/execute`, `/api/payments/[slug]/verify`):
     - Verify the JWT.
     - Derive the canonical `suiAddress` from the JWT.
     - If the request carries a query / header / body `address` parameter, **assert it matches the JWT-derived address** (D-3 PRE-LOCKED — no LinkedWallet read-through in Phase 1A; primary JWT-derived address only).
     - Inject the verified `authUser = { suiAddress, sub, email, emailVerified }` into request headers (e.g. `x-auth-sui-address`, `x-auth-sub`) so route handlers don't re-verify.
   - Allow-list of public routes is defined explicitly; default-deny for everything else.

3. **Per-route `assertOwns(authUser, resource)` for routes the middleware can't generically gate.**
   - Session-id keyed routes (e.g. `/api/engine/sessions/[id]`, `/api/payments/[slug]` cancel) — middleware can't know the session's owner without a DB lookup.
   - Each such route adds an explicit `await assertOwns(authUser.suiAddress, resourceId, prisma.session.findUnique)` call before any read/write.

**Why this composition:** layered defense — middleware is the cheap default-deny gate; per-route `assertOwns` covers the cases middleware can't see; signature-verified JWTs eliminate the bypass. None of these by itself is sufficient; together they close the IDOR class.

**Test surface:**
- Unit: `decodeJwt` rejects unsigned / wrong-signature / wrong-issuer JWTs.
- Unit: `jwtPayloadToSuiAddress` returns the deterministic Sui address for a given payload.
- Integration (per route): anonymous → 401, cross-user → 403, owner → 200. ~28 address-keyed routes × 3 cases = 84 integration tests.
- E2E smoke: reporter's Burp "Match and Replace" PoC against each of the 4 known-exploited routes returns 403 in dev.

**Effort estimate (refined post-inventory):**
- Step 1 (`lib/auth.ts` migration): ½ day.
- Step 2 (middleware refactor + allow-list): 1 day.
- Step 3 (per-route `assertOwns` pass for ~10 session-keyed routes): 1 day.
- Tests (84 integration + reporter PoC smoke): 1 day.
- **Total: ~3.5 days.** Hot-patch (Steps 1+2 scoped to 4 known-exploited routes only) can ship in ~24h; Step 3 + remaining routes follow within 2–3 more days.

**Cross-references for Phase 1A implementer:**
- Sui zkLogin address derivation → `@mysten/zklogin/jwtToAddress` (already in audric's deps via `@mysten/sui`).
- JWKS verification → `jose` (npm; ~14kb gzipped; battle-tested by Auth0 / Cloudflare).
- Existing JWT plumbing (don't reinvent) → `apps/web/lib/auth.ts` + caller pattern in routes that already use `validateJwt`.
- Audric zkLogin invariants (`zklogin-passport-flow.mdc`) — the JWT-to-suiAddress derivation MUST match what the client computes; mismatch = login break.

---

## Part 1 — Current State Audit

> Drafted 2026-05-14 in 4 passes (mirrors SPEC 29 discipline):
> - **Pass 1 (now)** — §1 web-perimeter + §5 wallet/signing public surface — where the founder-observed scan endpoints + reporter IDOR live; highest-leverage P0-finder. §0.4 already inventoried the route auth-binding matrix.
> - **Pass 2 (this draft)** — §2 sponsor-tx + signing internals + §4 internal-API + cron — highest-leverage attack paths if compromised.
> - **Pass 3 (this draft)** — §3 MPP gateway perimeter — large surface; likely surfaces P1/P2 not P0 given SPEC 29 already covered functional gaps.
> - **Pass 4 (this draft)** — §6 data/privacy + §7 dependency hygiene + §8 operational + §9 engine/agent + §10 indexer/on-chain integrity — inventory-heavy.

---

### §1 — Web-perimeter inventory (audric)

**Scope.** Audric's public-internet HTTP surface: which paths accept which requests, what auth (if any) they enforce, what security headers respond, what attack surface is exposed by error/probe handling.

#### §1.1 — Top-level page tree (`apps/web/app/**/page.tsx`)

15 page routes, classified by auth-required-ness:

| Path | Auth | Notes |
|---|---|---|
| `/` | public | Marketing landing (`apps/web/app/page.tsx`) |
| `/litepaper` | public | Litepaper |
| `/(legal)/disclaimer`, `/(legal)/privacy`, `/(legal)/terms`, `/(legal)/security` | public | Legal pages, route group |
| `/[username]` | public | **Profile page** — anyone can view any handle's public profile (S-Profile-Disclosure, P3) |
| `/pay/[slug]` | public | Payment-link payer view — slug is the access token (analyzed in §5) |
| `/invoice/[slug]` | public | Invoice payer view — slug is the access token (analyzed in §5) |
| `/auth/callback` | public | zkLogin callback (analyzed in §2) |
| `/new` | implicit auth via API gates | Chat home — calls `/api/engine/*` which check JWT |
| `/chat/[sessionId]` | implicit auth via API gates | Chat session view — calls `/api/engine/sessions/[id]` (currently IDOR-vulnerable per §0.4) |
| `/settings` | implicit auth via API gates | Settings panel |
| `/settings/contacts` | implicit auth via API gates | Contacts panel |
| `/(internal)/admin/scaling` | **`x-internal-key` cookie** | Internal scaling dashboard (`apps/web/app/(internal)/admin/scaling/page.tsx`) — analyzed in §1.5 |

**Finding S-Page-Auth-Implicit (P2).** Page routes don't gate themselves at the layout level — they rely on the API routes they call to enforce auth. This is structurally correct for Next.js 15 (auth-on-data-access is the canonical pattern) but means a page with a single mis-gated API call leaks. The IDOR class in §0 hits exactly this — `/chat/[sessionId]` is "implicitly auth-required" but the session API is IDOR-vulnerable, so anyone hitting `/chat/<victim-session-id>` directly gets the victim's chat. **Phase 1A's middleware-level gate fixes this transitively** — once `/api/engine/sessions/[id]` checks ownership, the page is safe.

#### §1.2 — Security headers (`apps/web/next.config.ts:13–75`)

Response headers applied to `/(.*)` (every path):

| Header | Value | Verdict |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | ✅ standard |
| `X-Frame-Options` | `DENY` | ✅ blocks clickjacking; complements CSP `frame-ancestors` (not set — see below) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ standard |
| `X-DNS-Prefetch-Control` | `on` | ✅ perf; not security-critical |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` | ✅ minimal — `microphone=(self)` for voice mode |
| `Content-Security-Policy` | (multi-directive — analyzed below) | mostly ✅ with 2 weakness rows |

**CSP analysis (`next.config.ts:40–73`):**

| Directive | Value | Verdict |
|---|---|---|
| `default-src` | `'self'` | ✅ default-deny |
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com` | ⚠️ **`'unsafe-eval'` + `'unsafe-inline'`** — Next.js + dev-tooling forces this; common but lowers XSS bar. Mitigated by no user-injected `<script>` paths today + by `X-Content-Type-Options: nosniff`. Move to nonces / hashes is a Phase N improvement (S-CSP-UnsafeInline, P2). |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | ⚠️ `'unsafe-inline'` — same Next.js constraint; same low-priority finding. |
| `font-src` | `'self' https://fonts.gstatic.com` | ✅ |
| `img-src` | `'self' data: https:` | ⚠️ `https:` allows any HTTPS source — needed for BlockVision logo URLs + BlockVision token icons. Tightening to specific domains is Phase N (S-CSP-ImgWildcard, P3). |
| `media-src` | `'self' blob: data:` | ⚠️ `data:` widened 2026-05-12 (per source comment) for MPP `pay_api` audio results. Followup tracked: convert base64 → Blob → `URL.createObjectURL` to drop `data:`. (S-CSP-DataMedia, P3 — already captured as a non-security followup.) |
| `connect-src` | `'self' fullnode.mainnet.sui.io fullnode.testnet.sui.io api.enoki.mystenlabs.com prover.mystenlabs.com prover-dev.mystenlabs.com accounts.google.com *.googleapis.com *.upstash.io open-api.naviprotocol.io mpp.t2000.ai *.mvr.mystenlabs.com` | ✅ explicit allow-list; no `*` wildcards on origins, all HTTPS, all current dependencies present |
| `frame-src` | `https://accounts.google.com` | ✅ Google sign-in iframe |
| `base-uri` | `'self'` | ✅ blocks `<base>` injection attacks |
| `form-action` | `'self' https://accounts.google.com` | ✅ |
| `frame-ancestors` | **MISSING** | ⚠️ `X-Frame-Options: DENY` covers modern browsers, but RFC mandates `frame-ancestors 'none'` in CSP for full coverage. (S-CSP-FrameAncestors, P3.) |
| `object-src` | **MISSING** | ⚠️ Should be `'none'` to block legacy `<object>` / `<embed>` flash-style XSS. (S-CSP-ObjectSrc, P3.) |
| `upgrade-insecure-requests` | **MISSING** | Vercel auto-redirects HTTP → HTTPS so this is bounded; still belt-and-suspenders. (S-CSP-UpgradeInsecure, P3.) |

**Headers NOT set today:**
- `Strict-Transport-Security` — Vercel sets it at the edge by default with `max-age=63072000`; verify post-Phase-1 in browser devtools but expected ✅.
- `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy` — Spectre / cross-origin isolation. Not critical; defer to Phase N (S-COOP-COEP, P3).

#### §1.3 — Middleware execution (`apps/web/middleware.ts`)

Runs on edge runtime, matches `/portfolio /activity /pay /goals /contacts /store /api/:path*`. Three jobs today:

1. **Panel rewrite** — six top-level paths (`/portfolio`, `/activity`, `/pay`, `/goals`, `/contacts`, `/store`) get rewritten to `/new?panel=<name>` so the dashboard's chat-first layout owns them.
2. **Stamp `X-App-Version`** on every API response so the client `useVersionCheck` hook can detect deploy drift and auto-reload.
3. **Nothing else.** Does NOT verify JWTs, does NOT enforce auth, does NOT do CSRF, does NOT validate the `Origin` header, does NOT check rate limits.

**Finding S-Middleware-NoAuth (P0).** This is the structural cause of the IDOR class in §0. Audric has no centralized auth gate — every individual API route is responsible for its own validation, and any route that forgets (or whose validation is structurally weak) leaks. Phase 1A migrates middleware into the auth gate (per §0.4.4 Step 2).

**Edge-runtime constraint to note for Phase 1A.** The current middleware bypasses `lib/env.ts` per its source comment (`process-env-bypass` lint exemption — middleware bundle would gain ~50KB from the Zod proxy). Phase 1A's `jose`+JWKS migration must stay edge-compatible: `jose` is WebCrypto-based and edge-safe, but the JWKS fetch + cache (`createRemoteJWKSet`) cold-starts ~50–150ms on first request per edge instance. Cache hit ratio is high (Google rotates keys every few weeks), but worst case adds ~150ms latency to one cold-instance request. Tradeoff acceptable.

#### §1.4 — Probe / scan endpoint posture

Founder noted observed scans 2026-05-13 hitting `/api/v2/config`, `/api/env/env.json`, `/.env`, `/.git/config`, etc. Today's behavior:

- **Next.js fallback** for any `/api/*` path that doesn't match a route returns a JSON 404. No information leak (no stack trace, no env dump).
- **Static-file paths** like `/.env`, `/.git/config` — Vercel's edge serves a 404 because `apps/web/public/` doesn't contain them. ✅
- **`/.well-known/security.txt`** — does not exist. (Finding S-WellKnown-Missing, P3 — RFC 9116 standard for security researchers; the reporter would have used it instead of finding `support@t2000.ai` in our footer; small UX win for future reports.)

**No WAF in front of audric today** — Vercel's project-level firewall rules are not configured (founder confirms). Vercel free tier provides basic DDoS protection but not custom-rule blocking. (S-Vercel-WAF, P2 — D-5 covers the policy decision: ignore / 404 / honeypot / Vercel WAF rules?)

#### §1.5 — Internal admin route (`/admin/scaling`)

`apps/web/app/(internal)/admin/scaling/page.tsx:25–40`:

- Auth gate: cookie `x-internal-key` must match `env.T2000_INTERNAL_KEY`.
- Bootstrap: `?key=<T2000_INTERNAL_KEY>` query param sets the cookie via `cookies().set()`.

**Findings:**
1. **S-AdminKey-CookieSetUnchecked (P3).** Lines 27–34 set the cookie BEFORE checking the key matches. An attacker who sends an arbitrary `?key=...` gets a cookie persisted in their browser. The cookie value is then compared against `T2000_INTERNAL_KEY` on the same and subsequent requests; mismatch returns 403. Net effect is bounded (the cookie doesn't grant access) but the cookie value is now stored in the browser with `httpOnly` + `secure` + `sameSite: strict`. Recommendation: only set the cookie AFTER the key matches; otherwise the response leaks "yes the cookie was set" semantics on every probe.
2. **S-AdminKey-NoRotation (P3).** `T2000_INTERNAL_KEY` is shared between `/admin/scaling` access AND every `/api/internal/*` route. Compromising one compromises both. Phase N could split (`AUDRIC_ADMIN_KEY` separate from `T2000_INTERNAL_KEY`), but the practical risk is bounded (no read tools surface PII; only telemetry).
3. **S-AdminKey-Logged (P2 if true, TBC).** If `T2000_INTERNAL_KEY` is ever logged in cleartext (e.g. when a request fails), it's leaked to Vercel logs. Phase N audit task: grep all `console.log` / `logger.*` calls in `apps/web/app/(internal)/**` for header logging. (Owner: Phase N §8 operational.)

#### §1.6 — Robots + sitemap

`apps/web/public/robots.txt`:
- Allows `/`, `/litepaper`, `/pay/`, `/invoice/`.
- Disallows `/api/`, `/auth/`, `/chat/`, `/new/`, `/settings/`.
- Sitemap declared at `https://audric.ai/sitemap.xml` — not generated today (the URL 404s). Minor finding (S-Sitemap-Missing, P3 — SEO not security).

The disallow list does NOT enforce anything (robots.txt is advisory) but is correctly configured to discourage well-behaved crawlers from indexing private routes.

#### §1.7 — Cross-references for §1

- §0.4 — full route auth-binding inventory (62 routes).
- §2 — sponsor-tx + signing surface continues from `/auth/callback`.
- §5 — wallet/signing user surface deep-dive includes `/pay/[slug]` + `/invoice/[slug]`.
- §8 — operational + secret management deep-dive on `T2000_INTERNAL_KEY` rotation policy.
- Part 2 findings: S-Page-Auth-Implicit (P2), S-Middleware-NoAuth (P0), S-CSP-UnsafeInline (P2), S-CSP-ImgWildcard (P3), S-CSP-DataMedia (P3), S-CSP-FrameAncestors (P3), S-CSP-ObjectSrc (P3), S-CSP-UpgradeInsecure (P3), S-COOP-COEP (P3), S-WellKnown-Missing (P3), S-Vercel-WAF (P2), S-AdminKey-CookieSetUnchecked (P3), S-AdminKey-NoRotation (P3), S-AdminKey-Logged (TBC P2), S-Sitemap-Missing (P3), S-Profile-Disclosure (P3).

---

### §2 — Sponsor-tx + signing surface (zkLogin + Enoki)

**Scope.** The end-to-end signing pipeline: zkLogin client (`lib/zklogin.ts`), `auth/callback` page, `/api/transactions/prepare` (sponsor-tx build + Enoki sponsorship), `/api/transactions/execute` (Enoki co-sign + Sui submit), `/api/services/prepare` + `/api/services/complete` (MPP service write flow). Three trust roots converge here: Google OIDC (issues the JWT), Enoki (sponsors gas + computes user salt + serves zkLogin proofs), Sui mainnet (final settlement).

#### §2.1 — Client-side zkLogin session lifecycle (`apps/web/lib/zklogin.ts`)

Session shape (localStorage `t2000:zklogin`):

```ts
ZkLoginSession {
  jwt: string,                  // Google OIDC ID token
  ephemeralKeyPair: string,     // base64-encoded Ed25519 secret key
  maxEpoch: number,             // Sui epoch when session expires
  salt: string,                 // user's deterministic salt (from Enoki)
  address: string,              // Sui address derived from (sub, salt, aud)
  // ...
}
```

**Lifecycle (`lib/zklogin.ts:190–214 startLogin`, `:241–291 completeLogin`):**
1. Generate ephemeral Ed25519 keypair client-side.
2. Fetch current Sui epoch, compute `maxEpoch = currentEpoch + 7` (~7 days on mainnet — each epoch is ~24h).
3. Compute `nonce = computeNonce(ephemeralPubKey, maxEpoch, randomness)`.
4. Save pre-auth state (ephemeralKey + maxEpoch + nonce + redirect) to **`sessionStorage`** (tab-scoped, ephemeral, per the source comment).
5. Redirect to Google OAuth with the nonce.
6. On callback: extract JWT from URL fragment, fetch salt + address from Enoki (`POST /v1/zklogin/zkp` with the JWT — Enoki returns `{ salt, address }`).
7. Persist final session to **`localStorage`** (cross-tab, persistent across reloads).

**Findings:**

- **S-zkLogin-LocalStorage (P2 — structural).** The session including the ephemeral secret key lives in `localStorage`. Marked `lgtm[js/clear-text-storage-of-sensitive-data]` (`lib/zklogin.ts:46` and `:205`) — this annotation is the source of audric CodeQL alert #5 (which is open in the GitHub UI but suppressed in code by the comment). **This is structural to zkLogin**: a non-custodial wallet must store the user's signing material somewhere the client controls, and Sui zkLogin's design assumes browser-local storage. Alternatives (httpOnly cookie / server-side session) break the non-custodial property — the server would be able to forge signatures. **Recommendation:** Phase 1B explicitly dismisses CodeQL alert #5 with a written justification linking to this finding + `audric/.cursor/rules/zklogin-passport-flow.mdc`. **Compensating controls** (already in place): CSP blocks third-party scripts on most directives (`script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com` is the only XSS sink path); session expires at `maxEpoch` (~7d worst-case theft window); Enoki ZK proof is bound to the ephemeral key + maxEpoch so capture of the localStorage value alone is enough to write but the attacker is rate-limited by Sui epoch advancement.

- **S-zkLogin-XSS-Window (P1).** If a Phase N XSS bug lands (e.g. via the `'unsafe-inline'` CSP directive or a contaminated dependency), the attacker exfiltrates the localStorage session and has up to 7 days of unrestricted write capability against the user's wallet — every confirm-tier and auto-tier write executes without further consent because the ephemeral key signs it. There is no transaction-level user re-prompt for "high-value writes" today. **Recommendation:** Phase N — investigate a "high-value-write requires fresh OAuth" gate (re-prompt Google sign-in for > $X writes) OR shorten `maxEpoch` to + 1 (24h), at the cost of more frequent re-auth UX. Defer the decision.

- **S-zkLogin-MaxEpoch-7Days (P3).** `maxEpoch = currentEpoch + 7` is the upper bound permitted by Enoki (per Mysten zkLogin spec — proof validity is bounded by maxEpoch). Reasonable default. Not a finding; documented for completeness.

- **S-zkLogin-NoTokenRotation (P3).** The JWT is the SAME `id_token` Google issued at sign-in; it has its own `exp` claim (typically 1h). After Google's `exp`, the JWT is technically invalid for OIDC purposes but `decodeJwt` doesn't check `exp` (it's part of the same gap as no-signature-verify). Phase 1A fix: `jose.jwtVerify` enforces `exp` automatically. Closes this finding.

#### §2.2 — `auth/callback` page (`apps/web/app/auth/callback/page.tsx`)

Trivial wrapper that calls `useZkLogin().handleCallback()` then redirects to `/new`. The actual JWT extraction + salt fetch + ZK proof fetch lives in `lib/zklogin.ts:241–291 completeLogin`.

**Finding S-Callback-NoCsrfNonceCheck (P2).** The OAuth `state` parameter is NOT verified on callback today. Audric is currently relying on the OIDC `nonce` claim (cryptographically bound to the ephemeral key) as the CSRF defense — an attacker who tries to inject a JWT into the callback URL would have to also generate an ephemeral key whose nonce matches the JWT's nonce claim, which they can't without the user's session. So while `state` isn't checked, the binding is structural through the nonce. **Net verdict:** OK, but worth documenting the trust path. (Not a fix-required finding; the nonce check IS the CSRF defense by zkLogin design.)

#### §2.3 — `/api/transactions/prepare` flow

Read end-to-end (`apps/web/app/api/transactions/prepare/route.ts`, ~750 lines):

1. **Auth gate (line 351–356):** `validateJwt(request.headers.get('x-zklogin-jwt'))` — JWT signature unverified (covered by S-IDOR / Phase 1A).
2. **Address binding:** `address` extracted from request body (line 367); rate limit keyed `tx:${address}` (line 374). **Address NOT bound to JWT-derived address.**
3. **Compose:** `composeTx({ sender: params.address, sponsoredContext: true, ... })` builds the PTB.
4. **Sponsor (line 654–656):** forwards `sponsorHeaders['zklogin-jwt'] = jwt` if JWT was provided + posts `{ network, transactionBlockKindBytes, sender, allowedAddresses, allowedMoveCallTargets }` to `https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor`.
5. **Response:** Enoki returns `{ data: { bytes, digest } }`, audric forwards to client for signing.

**The structural protection on the write path:** Enoki's `transaction-blocks/sponsor` endpoint, when the optional `zklogin-jwt` header is set, verifies that the JWT-derived Sui address matches the request's `sender` field. Mismatch → Enoki responds with `code: 'jwt_error'` ("no applicable key found in the JSON Web Key Set" — same shape as the post-rotation error already handled in `lib/enoki-error.ts`). Audric's `transactions/prepare` ALWAYS sets the `zklogin-jwt` header when a JWT was present in the request (which the auth gate above requires), so the sponsorship step IS bound to the JWT-derived address.

**Net verdict on the write path:** the prepare route is **JWT-write-IDOR-bounded by Enoki** in practice today. A reporter who replaces `body.address` with a victim's address but keeps their own JWT will have their request rejected by Enoki at the sponsor step. **Phase 1A still fixes this structurally** by binding `address` at audric's middleware (defense in depth — Enoki's binding is policy, not contract; Mysten could change it).

**The READ-SIDE leaks (the actual P0 in this route):**

- **S-Prepare-BalanceLeak (P0).** Lines 270–322 (`validateBalance`) fetch the requested address's wallet portfolio for any preflight check. This leaks per-token balance information for arbitrary addresses. An attacker who replaces `body.address` with a victim's address gets back error messages like `"Insufficient USDC balance: you have 12.3456 but requested 1000000"` — enumerating the victim's USDC balance to 4 decimal places. Phase 1A binding closes this.
- **S-Prepare-RateLimitDoS (P1).** Line 374 `rateLimit('tx:${address}')` — 10 req/min/address. An attacker can lock out a victim by exhausting their per-address rate limit (10 requests trigger lockout). Phase 1A binding (rate limit by JWT-derived address, not body address) closes this.
- **S-Prepare-LogPII (P2).** Lines 156–160, 503, 646, 648 log `address` + tx type + Move-call targets to Vercel logs. Logs persist 30d on Vercel free tier, longer on paid. Cleartext addresses + tx targets in logs = privacy leak vector if Vercel project access is compromised. Phase N: redact addresses to `0xabcd...wxyz` form in logs.

#### §2.4 — `/api/transactions/execute` flow

(`apps/web/app/api/transactions/execute/route.ts`, ~170 lines.)

1. **Auth gate:** none (no JWT check).
2. **Body:** `{ digest, signature }` — both required.
3. **Rate limit:** `rateLimit('exec:${digest.slice(0, 16)}')` — 10 req/min keyed on the prepared-digest prefix (approximates per-user rate limit because each user's prepares produce different digests).
4. **Forward to Enoki:** `POST /v1/transaction-blocks/sponsor/${digest}` with `{ signature }`. Enoki co-signs and submits.
5. **Wait:** `client.waitForTransaction({ digest, options: { showEffects, showBalanceChanges, showObjectChanges } })`.

**Verdict: SIG-GATED.** No JWT required because the signature on the prepared sponsored-tx is the only thing Enoki accepts to co-sign. An attacker without the user's ephemeral private key cannot forge the signature. The route is structurally protected.

**Findings:**
- **S-Execute-NoJwt-AcceptableByDesign (P3 — informational).** The execute route does not verify a JWT. This is correct — the digest+signature pair is the auth token. Phase 1A's middleware allow-list explicitly skips `transactions/execute` (per §0.4.4 Step 2 allow-list).
- **S-Execute-DigestPrefixCollision (P3).** Rate limit uses `digest.slice(0, 16)` — first 16 hex chars of the digest = 64 bits of entropy. Collision probability is negligible (2^32 expected collisions across 2^64 digests). Not a finding.

#### §2.5 — `/api/services/prepare` + `/api/services/complete` (MPP write flow)

**`services/prepare`** (`apps/web/app/api/services/prepare/route.ts:61–...`):
- Same auth + binding shape as `transactions/prepare` — `validateJwt` + body `address` (S-IDOR class applies).
- **Same Enoki write-bound protection** — the ZkLogin JWT is forwarded to Enoki for the sponsor request, mismatch rejects.
- **Same READ-SIDE leaks** — lines ~89 rate limit `svc:${address}` (S-Prepare-RateLimitDoS); spending limits + balance checks query Prisma + Sui RPC for the requested address (S-Prepare-BalanceLeak applies + new variant: spending-history leak).

**`services/complete`** (`apps/web/app/api/services/complete/route.ts`):
- Auth gate: **`x-internal-key`** (audited in §4 internal-API contract). NOT JWT-gated — the cron-shaped completion flow runs server-to-server.
- Verdict: INTERNAL-OK. The IDOR class doesn't apply because the trust root is the shared internal key.

**`services/retry`** (TBC — flagged in §0.4 inventory; Phase 1A reads + categorizes).

#### §2.6 — Enoki sponsorship trust model + key safety

`ENOKI_SECRET_KEY` is a server-side bearer token loaded via `env.ENOKI_SECRET_KEY` (validated by `lib/env.ts` Zod schema). Used in `Authorization: Bearer ${ENOKI_SECRET_KEY}` for every `/v1/transaction-blocks/sponsor` call.

**Findings:**

- **S-Enoki-SecretKey-NoRotation (P2).** No documented rotation policy for `ENOKI_SECRET_KEY`. If leaked (e.g. via Vercel env exposure, npm dependency compromise, etc.), an attacker can sponsor arbitrary transactions and drain the gas budget. **Recommendation:** Phase N — establish quarterly rotation policy + on-leak rotation runbook. Tracked.

- **S-Enoki-Sponsor-MoveCallAllowList (P3 — already mitigated).** Enoki's `allowedMoveCallTargets` (line 664–666 of `transactions/prepare`) restricts the sponsored tx to the specific Move calls extracted from the composed PTB. This is the SDK's `derivedAllowedAddresses` companion + a Move-call allow-list. Defense in depth — even if a malicious client somehow re-signs the bytes, Enoki rejects calls outside the allow-list. ✅ Already correct, documented for completeness.

- **S-Enoki-DryRunFailureModes (P3).** Enoki's sponsor endpoint dry-runs the assembled tx before co-signing. Failures bubble back to the user as `sponsorRes.status` (typically 4xx). The error mapping in `lib/enoki-error.ts` is shared between `prepare` and `execute`; SPEC 26's audit found this surface to be working as designed.

- **S-Enoki-JwtSenderBinding-Verify (P0 verification task).** The audit ASSUMES Enoki enforces JWT-sender binding on the sponsor request (per §2.3 reasoning). **Phase 1A includes a verification task:** intentionally craft a request with a valid JWT but a mismatched `sender` and confirm Enoki returns `code: 'jwt_error'`. If Enoki does NOT enforce this, the write-side IDOR is unbounded today and Phase 1A's hot-patch becomes the SOLE defense (rather than defense-in-depth). Owner: Phase 1A pre-commit smoke.

#### §2.7 — Sponsorship financial limits

`ENOKI_SECRET_KEY` is tied to a single Enoki app config. Within Enoki's UI, allowed Move call list + per-period sponsorship caps + per-user limits are configurable. **TBC — founder confirms Enoki's current limits.** If unbounded → an attacker who triggers many failed sponsorships could exhaust the gas budget. Most failures don't consume gas (dry-run failures don't; only on-chain submitted transactions consume gas) so this is bounded but worth confirming. (S-Enoki-Caps-TBC, P2 — Phase N owner.)

#### §2.8 — Cross-references for §2

- §0.4 — full route auth-binding inventory.
- §1.3 — middleware execution context (edge runtime constraint for Phase 1A).
- §4 — internal-API audit covers `services/complete`.
- §10 — indexer audit covers `ProtocolFeeLedger` writes triggered by sponsored transactions.
- `audric/.cursor/rules/zklogin-passport-flow.mdc` — zkLogin trust model.
- `audric/.cursor/rules/audric-transaction-flow.mdc` — sponsor flow + `allowedAddresses` rule.
- `audric/.cursor/rules/audric-canonical-portfolio.mdc` — `getPortfolio` canonical path used in `validateBalance`.
- Part 2 findings: S-zkLogin-LocalStorage (P2), S-zkLogin-XSS-Window (P1), S-zkLogin-MaxEpoch-7Days (P3), S-zkLogin-NoTokenRotation (P3), S-Callback-NoCsrfNonceCheck (P2), S-Prepare-BalanceLeak (P0), S-Prepare-RateLimitDoS (P1), S-Prepare-LogPII (P2), S-Execute-NoJwt-AcceptableByDesign (P3), S-Execute-DigestPrefixCollision (P3), S-Enoki-SecretKey-NoRotation (P2), S-Enoki-Sponsor-MoveCallAllowList (P3-mitigated), S-Enoki-DryRunFailureModes (P3-mitigated), S-Enoki-JwtSenderBinding-Verify (P0 verification task), S-Enoki-Caps-TBC (P2).

---

### §3 — MPP gateway perimeter (`apps/gateway`, deployed at `mpp.t2000.ai`)

**Scope.** The MPP gateway is t2000's per-route 402-charging proxy fronting 40+ third-party APIs (OpenAI, Anthropic, Replicate, Resend, Lob, etc.). 88 service routes + 4 admin/utility routes + middleware. SPEC 26 v1.0.4 closed the "settle on success" correctness work; this audit covers the SECURITY surface (auth, PII leakage, supply-chain, replay).

#### §3.1 — Architecture summary

- **88 service routes** under `apps/gateway/app/{vendor}/{path}/route.ts` — proxy upstream vendor APIs with per-route 402 USDC charges via `mppx`.
- **4 admin/utility routes**: `/api/mpp/payments`, `/api/mpp/stats`, `/api/mpp/volume`, `/api/services`, `/api/reputation/[walletAddress]`, `/openapi.json`, `/llms.txt`.
- **Middleware** (`apps/gateway/middleware.ts`) — reputation-tiered rate limiting per `x-wallet-address`, fallback to IP.
- **Charging library** — `mppx` (npm `mppx/nextjs`) handles per-route 402 challenges + `Receipt` validation + payment digest replay-protection via Upstash redis store (`lib/upstash-digest-store.ts`).
- **Trust model:** the gateway is intentionally OPEN (anyone with USDC + a valid mppx receipt can call any route). Auth = pay-per-call. Reputation tier = privilege (rate-limit cap).

#### §3.2 — Middleware (`apps/gateway/middleware.ts`)

Reputation-tiered rate-limiting:

| Tier | Limit (req/min) |
|---|---|
| premium | 1000 |
| established | 300 |
| trusted | 60 |
| new | 10 |
| anonymous | 10 |

Mechanism: extract `x-wallet-address` header → fetch tier from `/api/reputation/{walletAddress}` (audric internal call to gateway's own reputation endpoint) → enforce in-memory rate-limit map keyed on wallet address (or IP fallback).

**Findings:**

- **S-Gateway-Middleware-InMemoryRateLimit (P2).** `rateLimitMap` is in-process and per-Vercel-instance. With Vercel's serverless concurrency, the map is split across function instances, so a legitimate user might burst far above their tier cap (multiple cold instances each grant fresh quota). Conversely, sticky region routing means an attacker who pins to one region can DoS-saturate one instance's map. **Recommendation:** Phase N — migrate to Upstash redis-backed rate limit. The Upstash store is already a dependency (`getDigestStore` for receipts), so the migration cost is small.

- **S-Gateway-Middleware-IPFallback (P3).** Anonymous fallback uses `x-forwarded-for` first hop; an attacker can spoof this header in some Vercel configurations (Vercel does set it but trusts upstream proxies). With 10 req/min cap per spoofed IP, the cost of bypassing rate limit is ~10x of the spoofing complexity — bounded but not zero. Recommendation: validate that Vercel strips inbound `x-forwarded-for` before adding its own (per Vercel docs it does). Confirm in Phase N.

- **S-Gateway-Middleware-NoBypassFor402 (P3).** The middleware runs BEFORE the 402-charging handler. An anonymous request gets rate-limited by IP at 10 req/min; if it then proceeds, it hits the 402 challenge and would have to provide a valid receipt to actually invoke the upstream. Net effect: gating is correct, but logging `tier: anonymous` for every probe wastes Vercel log volume (and bandwidth). Phase N: drop pre-402 logging for tier=anonymous.

#### §3.3 — Admin/utility endpoints

| Endpoint | Auth | Verdict |
|---|---|---|
| `GET /api/mpp/payments` | **NONE** | **S-Gateway-PaymentsList-Public (P1)** — exposes every payment record |
| `GET /api/mpp/stats` | NONE | PUBLIC-INTENTIONAL but slow (S-Gateway-Stats-NoLimit, P3) |
| `GET /api/mpp/volume` | NONE | TBC — likely intentional public stats |
| `GET /api/services` | NONE | PUBLIC-INTENTIONAL — service catalog |
| `GET /api/reputation/[walletAddress]` | NONE | PUBLIC-INTENTIONAL by design (reputation must be visible) |
| `GET /openapi.json` | NONE | PUBLIC-INTENTIONAL — gateway OpenAPI spec |
| `GET /llms.txt` | NONE | PUBLIC-INTENTIONAL — LLM-discoverable index |

**S-Gateway-PaymentsList-Public (P1) details.** `apps/gateway/app/api/mpp/payments/route.ts:30–46`:
```ts
prisma.mppPayment.findMany({
  select: { id, service, endpoint, amount, digest, sender, createdAt },
  // ...
})
```
Returns `sender` (full Sui address), `digest` (full digest), `amount`, `service`, `endpoint`. Anyone can call this and enumerate every transaction across every wallet that has used MPP via t2000's gateway. Search params `?service=` + `?search=<digest|sender>` make targeted enumeration trivial.

**Why P1 not P0.** All data is already on-chain (Sui mainnet) — the digest IS public. The gateway's exposure is convenience: a malicious indexer can enumerate the t2000-MPP-specific subset without parsing chain history. Still a P1 because it puts wallet → service-usage attribution at zero discovery cost.

**Recommended fix.** Phase N: gate behind an admin auth (similar pattern to audric's `T2000_INTERNAL_KEY` → cookie). OR redact `sender` to truncated `0xabcd...wxyz`. OR remove the endpoint and surface only via authenticated admin dashboard. D-question for §3.

#### §3.4 — Per-route auth posture (88 service routes — sampled)

All service routes have the same shape: `mppx` 402 challenge → payment receipt validation → upstream API call. Auth = "valid mppx receipt." Per-vendor API keys are in `env.{VENDOR}_API_KEY` — server-side only, never exposed to clients.

**Findings:**

- **S-Gateway-EnvDirectReads (P2 — env-gate violation).** `apps/gateway/lib/gateway.ts:16` reads `process.env.NEXT_PUBLIC_SUI_NETWORK` directly. Per `env-validation-gate.mdc` (cross-app standard ratified post-S.20), every app MUST validate env via a Zod schema + `lib/env.ts` proxy. **Apps/gateway has NOT adopted this pattern.** Recommended fix: Phase N — port `lib/env.ts` from audric's reference implementation. Gateway will need its own schema (vendor keys, treasury address, Sui network). Until then, missing env vars surface as runtime errors in different parts of the app at different times — the exact bug class S.20 was about.

- **S-Gateway-VendorKey-Mixing (P2 verification task).** Different vendor routes use different env names (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, etc.). Each route reads `process.env.{VENDOR}_API_KEY` directly. **No env-gate audit confirms ALL of them are required + non-empty at boot.** A misconfigured deploy could silently log "[anthropic] API key not set" for one route while other routes work, leaving the broken route returning 500s but the rest of gateway healthy → SPEC 26-style "silent partial degradation" risk. Recommended fix: same as above — Phase N env-gate migration with all vendor keys in the schema.

- **S-Gateway-LogPII-VendorBodies (TBC P2).** Some upstream-error paths log the full upstream response body. If an upstream (e.g. OpenAI) ever echoes back user input that contains addresses, payment-link slugs, or other PII, the data lands in Vercel logs. Phase N audit task — grep gateway routes for `console.log/error` that include `body` or response variables. Owner: Phase N §8.

#### §3.5 — Receipt + replay protection (`mppx` library)

`mppx` is the per-route 402 challenge library (npm package by t2000). Receipt validation: `Receipt.deserialize(header)` returns the parsed receipt; the digest store (`upstash-digest-store.ts`) tracks "seen" digests to prevent replay.

**Findings:**

- **S-Gateway-MppxLibraryTrust (P2 supply chain).** `mppx` is a single-vendor npm package. Compromise of the npm publish account or a malicious release would let an attacker bypass charging or steal vendor API keys (since the library handles Receipt validation in-process). Mitigated by: (a) `mppx` is published by t2000's own org; (b) `pnpm.overrides` would let us pin/override quickly. **Recommendation (cross-ref §7):** add `mppx` to the dependency-hygiene watch-list with version-pinning (no `^` ranges) for the gateway.

- **S-Gateway-DigestStoreUpstash-NoBackup (P3).** Replay-protection state is in Upstash redis (free tier). If wiped, every previously-charged receipt becomes "unseen" → next request with a stale receipt is charged again (well, the user gets to use the upstream again, but they DID pay before — so net effect is a "free re-call" not a "double-charge"). Bounded but worth explicit backup policy. Phase N: confirm Upstash backup configuration + document recovery runbook.

- **S-Gateway-Receipt-NoFreshness (P3).** Receipts are valid as long as they're in the digest store + not yet "spent" (single-use). There's no temporal `notAfter` on the receipt itself. An attacker who steals a fresh receipt (e.g. via XSS on an audric user OR via traffic interception on a vendor that ships it back to the user — none today) could replay it. Phase N: confirm `mppx` Receipt structure + add temporal validity if absent.

#### §3.6 — Cross-references for §3

- §1 — audric-side perimeter (separate Vercel deployment).
- §4 — internal-API + cron flow that triggers gateway calls from audric.
- §6 — data + privacy on `MppPayment` table (PII inventory).
- §7 — dependency hygiene (`mppx` watch-list).
- SPEC 26 v1.0.4 closed for behavioral correctness; this §3 covers the SECURITY axis SPEC 26 didn't.
- Part 2 findings: S-Gateway-Middleware-InMemoryRateLimit (P2), S-Gateway-Middleware-IPFallback (P3), S-Gateway-Middleware-NoBypassFor402 (P3), S-Gateway-PaymentsList-Public (P1), S-Gateway-Stats-NoLimit (P3), S-Gateway-EnvDirectReads (P2), S-Gateway-VendorKey-Mixing (P2 verification task), S-Gateway-LogPII-VendorBodies (TBC P2), S-Gateway-MppxLibraryTrust (P2 supply chain), S-Gateway-DigestStoreUpstash-NoBackup (P3), S-Gateway-Receipt-NoFreshness (P3).

---

### §4 — Internal-API + cron contract (Item A — locked in scope)

**Scope.** Two distinct trust roots:
1. **t2000 ECS → audric `/api/internal/*`** authenticated via `x-internal-key` header validated against `env.T2000_INTERNAL_KEY` (audric-side) / `process.env.AUDRIC_INTERNAL_KEY` (t2000-ECS-side).
2. **Vercel cron → audric `/api/cron/*`** authenticated via `Authorization: Bearer ${CRON_SECRET}` — Vercel auto-attaches the header from the project env var.

11 internal routes + 2 cron routes. Per §0.4 inventory, all 11 internal routes use `validateInternalKey`; cron routes use the Bearer pattern.

#### §4.1 — `validateInternalKey` (`apps/web/lib/internal-auth.ts`)

```ts
export function validateInternalKey(headerValue: string | null) {
  const expected = env.T2000_INTERNAL_KEY;
  if (!headerValue || headerValue !== expected) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { valid: true };
}
```

**Findings:**

- **S-Internal-NoConstantTimeCompare (P2).** `headerValue !== expected` is timing-attackable. Modern V8/JIT may render timing analysis difficult in practice, but `crypto.timingSafeEqual(Buffer.from(headerValue), Buffer.from(expected))` is the right primitive. Both buffers must be the same length; pad/short-circuit gracefully. **Recommended fix:** Phase N — single-line replacement in `validateInternalKey`.
- **S-Internal-NoReplayProtection (P2).** A captured `x-internal-key` request can be replayed verbatim against any internal route. Mitigated by HTTPS-only + Vercel's TLS termination, but not eliminated if logs leak the key. **Recommended fix:** Phase N — add request-signing (HMAC over body + timestamp) so replay requires re-signing. The existing `T2000_INTERNAL_KEY` becomes the HMAC key; each request sends `x-internal-key` (key id) + `x-internal-sig` (HMAC) + `x-internal-ts` (timestamp). Server rejects timestamps > 5min old.

#### §4.2 — Cross-repo naming drift (P1 finding)

```
audric/apps/web/lib/internal-auth.ts:17       env.T2000_INTERNAL_KEY
t2000/apps/server/src/cron/scheduler.ts:8     process.env.AUDRIC_INTERNAL_KEY
```

**S-Internal-NamingDrift (P1).** The two sides of the same trust path read DIFFERENT env-var names. They MUST resolve to the same value for cron to work, but no automated check enforces this. Practical risks:

1. **Rotation hazard.** Founder rotates `T2000_INTERNAL_KEY` on audric Vercel → audric works, t2000 ECS suddenly returns "Unauthorized" for every internal call → all background work (profile inference, memory extraction, chain memory, financial-context snapshot, portfolio snapshots — see §6 PII inventory) silently stops. No UI signal until 24–48h of stale data accumulates.
2. **Cognitive overhead.** Engineer onboarding: "which one is the truth?" Both. They must match.
3. **Env-gate bypass.** t2000 ECS doesn't go through audric's `lib/env.ts` Zod gate — it reads `process.env.AUDRIC_INTERNAL_KEY` directly (per `apps/server/src/cron/scheduler.ts:8`). If t2000 ECS is misconfigured (empty value), it silently sends an empty `x-internal-key` header → audric returns 401 → same silent stop.

**Recommended fix.** Phase N — one of:
- **(a)** Rename one side to match (cleaner): introduce a single canonical name (e.g. `T2000_AUDRIC_INTERNAL_KEY`) used by BOTH `audric/apps/web/lib/env.ts` schema + `t2000/apps/server/lib/env.ts` (when that file lands per `env-validation-gate.mdc`). Aliases for backward compat during the rename window.
- **(b)** Add a startup smoke check on t2000 ECS that POSTs a no-op to audric's `/api/internal/health` (new endpoint) at boot and fails-fast if the key doesn't match. Catches the drift in seconds rather than after 24h of stale data.

Option (a) is the structural fix; (b) is the runtime defense.

#### §4.3 — Cron secret pattern (`apps/web/app/api/cron/turn-metrics-cleanup/route.ts`, `…/turn-metrics-pending-sweep/route.ts`)

```ts
const authHeader = req.headers.get('authorization');
if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

`CRON_SECRET` is auto-attached by Vercel cron when the env var is set (per Vercel's contract). Same `!==` pattern as internal-auth.

**Findings:**

- **S-Cron-NoConstantTimeCompare (P2).** Same primitive as S-Internal-NoConstantTimeCompare. Single-line fix.
- **S-Cron-OptionalEnv-FailureMode (P3).** `CRON_SECRET` is `optionalString` in audric's env schema (`apps/web/lib/env.ts:115`). If unset, the comparison `authHeader !== "Bearer undefined"` always fails (cron always 401s — visible failure). If set to empty string, `optionalString` normalizes to `undefined` → same. **Net: safe-fail.** But if Vercel cron is configured WITHOUT setting `CRON_SECRET` in env, the cron silently 401s → no scheduled runs → the same silent-stop class as §4.2.
- **S-Cron-PathDiscoverability (P3).** Cron routes are accessible at `/api/cron/turn-metrics-cleanup` etc. Anyone who knows the path can probe (gets 401). Bounded by the Bearer requirement; not a finding-of-record. Documented because Vercel's "internal cron" badge in the dashboard suggests these paths are private — they're not, they're auth-gated public paths.

#### §4.4 — Idempotency posture per internal route

Per `audric/.cursor/rules/cron-job-architecture.mdc`, internal routes invoked by t2000 ECS jobs MUST be idempotent (the cron retry strategy assumes safe-to-retry). Audit posture:

| Route | Idempotency | Verdict |
|---|---|---|
| `/api/internal/portfolio-snapshot` | Yes — keyed on `(address, snapshotDate)` upsert | ✅ |
| `/api/internal/financial-context-snapshot` | Yes — keyed on `(address, snapshotDate)` upsert | ✅ |
| `/api/internal/health-factor` | Yes — keyed on `(address, observedAt)` upsert | ✅ |
| `/api/internal/profile-inference` | TBC — likely upserts the `UserFinancialProfile` row, but new memory inference runs may emit duplicate `inferredAt` rows | TBC |
| `/api/internal/memory-extraction` | TBC — `UserMemory` rows are append-only? need to confirm | TBC |
| `/api/internal/chain-memory` | TBC — `ChainFact` rows | TBC |
| `/api/internal/payments` | TBC — likely the indexer write path; idempotency is critical here (S-Indexer in §10) | TBC ⚠️ |
| `/api/internal/notification-users` | TBC | TBC |
| `/api/internal/user-address` | Read-only | ✅ |
| `/api/internal/app-event` | TBC — likely append-only by design | TBC |
| `/api/internal/financial-context-snapshot` | Yes — see above | ✅ |

**S-Internal-Idempotency-AuditTBC (P2).** 6 of 11 internal routes need explicit idempotency confirmation. **Recommended fix:** Phase N — single audit pass per route + add a Prisma unique constraint per idempotency key where missing. The §10 ProtocolFeeLedger audit specifically depends on `/api/internal/payments` being idempotent.

#### §4.5 — Body validation per internal route

Spot-checked `profile-inference` (uses Anthropic, takes a JSON body of `{ messages, existingProfile, address }`). It validates the key but does NOT (visible in the read) Zod-validate the body shape. A misconfigured t2000 ECS that posts a malformed body could either:
- Trigger an Anthropic 400 (bounded — fails the cron run gracefully).
- Insert malformed `UserFinancialProfile` data via Prisma type coercion (BAD).

**S-Internal-NoBodyValidation (TBC P2).** Phase N — audit each `/api/internal/*` for explicit Zod body-schema validation. Already enforced for the public `/api/engine/chat` route per existing patterns; should be uniform.

#### §4.6 — Rate limiting on internal routes

None of the `/api/internal/*` routes apply `rateLimit()` (confirmed via grep — they don't import the helper). Reasoning: the trust root is the internal key; if someone has it they can DoS regardless. Rate-limiting is the wrong defense layer.

**S-Internal-NoRateLimit-AcceptableByDesign (P3).** Documented; not a finding.

#### §4.7 — Vercel cron schedule + visibility

`vercel.json` is the source of truth for cron schedules. Per the existing rule `audric/.cursor/rules/cron-job-architecture.mdc`, schedule items map to `/api/cron/*` paths. **TBC: read `vercel.json` to confirm no stale crons / no missing crons.** Phase N owner.

#### §4.8 — Cross-references for §4

- §6 — data + privacy, since most `/api/internal/*` routes WRITE PII to NeonDB.
- §8 — operational + secret management, key rotation policy.
- §10 — indexer + on-chain integrity covers `/api/internal/payments` deeply.
- `audric/.cursor/rules/cron-job-architecture.mdc` + `t2000/.cursor/rules/cron-job-architecture.mdc` — authoritative on idempotency.
- `audric/.cursor/rules/external-call-retries.mdc` — retry semantics for the t2000-ECS → audric fanout.
- Part 2 findings: S-Internal-NoConstantTimeCompare (P2), S-Internal-NoReplayProtection (P2), S-Internal-NamingDrift (P1), S-Cron-NoConstantTimeCompare (P2), S-Cron-OptionalEnv-FailureMode (P3), S-Cron-PathDiscoverability (P3), S-Internal-Idempotency-AuditTBC (P2), S-Internal-NoBodyValidation (TBC P2), S-Internal-NoRateLimit-AcceptableByDesign (P3).

---

### §5 — Wallet/signing user surface + payment-link/invoice/QR (Item D — locked in scope)

**Scope.** The user-facing wallet surface beyond §2's signing pipeline: payment-link + invoice creation/list/cancel/delete/verify, public payer flows at `/pay/[slug]` and `/invoice/[slug]`, slug entropy, IDOR-vuln-write deep-dive on the payments routes, email-injection surface for invoices.

#### §5.1 — Payment-link / invoice data model

`Payment` Prisma model (single table for both `type: 'link' | 'invoice'`, post-2026-04-13 unification migration). Per `apps/web/app/api/payments/route.ts:88–122`:

| Field | Source | Sensitivity |
|---|---|---|
| `slug` | `generateSlug(8 or 10)` | semi-secret (knowledge = access to read) |
| `nonce` | server-generated (used for Payment Kit registry binding) | semi-secret |
| `userId` | derived from `prisma.user.findUnique({ suiAddress: header })` | binding key |
| `suiAddress` | from `x-sui-address` header | **NOT JWT-bound** (S-IDOR class) |
| `type` | request body | tightly typed |
| `amount` | request body | shown on payer page |
| `label`, `memo` | request body (capped 200 / 500 chars) | shown on payer page |
| `recipientEmail`, `recipientName` | request body | invoice metadata; displayed |
| `lineItems` | request body (max 20, 200-char description) | invoice metadata; displayed |
| `senderName` | from `verify` POST body | stored verbatim (cap 100) |
| `status` | `active` | `paid` | `cancelled` | `expired` | server-derived |
| `paidAt`, `paidBy`, `txDigest` | filled by `verify` route on success | on-chain proof |
| `expiresAt`, `dueDate` | request body | invoice metadata |

#### §5.2 — IDOR class on `/api/payments/*` (the reporter's actual class — confirmed)

**This section is the precise vulnerability the external reporter described.** Re-derived from code review, with a worked exploit.

The 4 routes:

| Method+Route | Auth pattern | IDOR? | Severity |
|---|---|---|---|
| `POST /api/payments` | JWT (sig unverified) + `x-sui-address` header | **YES — write** | **P0 — confirmed** |
| `GET /api/payments` | JWT (sig unverified) + `x-sui-address` header | **YES — read** | **P0 — confirmed** |
| `PATCH /api/payments/[slug]` | JWT (sig unverified) + `x-sui-address` + slug→payment match | **YES — write** | **P0 — confirmed** |
| `DELETE /api/payments/[slug]` | JWT (sig unverified) + `x-sui-address` + slug→payment match | **YES — write** | **P0 — confirmed** |

**Worked exploit (PATCH cancel — destructive write IDOR):**

1. Attacker signs into Audric normally. Their JWT is valid (any user's JWT from any Google account).
2. Attacker discovers a victim's `slug` (low-bit guessing of `/pay/[slug]` is impractical — 47 bits — but social engineering, screen-shoulder-surfing, or accidentally-shared screenshots all leak the slug).
3. Attacker sends `PATCH /api/payments/<victim-slug>` with:
   - `x-zklogin-jwt: <attacker's valid JWT>`
   - `x-sui-address: <victim's suiAddress>` (set in Burp Match-and-Replace)
   - body: `{ status: 'cancelled' }`
4. Server side (`apps/web/app/api/payments/[slug]/route.ts:78–113`):
   - `validateJwt(jwt)` passes (attacker's JWT structurally valid).
   - `address = request.headers.get('x-sui-address')` = victim's address.
   - `payment.suiAddress` = victim's address (matches).
   - `address !== payment.suiAddress` is FALSE → request proceeds.
   - `payment.status` set to `cancelled`.
5. **Victim's payment link / invoice is now cancelled. Attacker only needed: a valid JWT + the slug.**

**Worked exploit (POST create — fraudulent identity write):**

1. Attacker signs in normally.
2. Attacker sends `POST /api/payments` with:
   - `x-zklogin-jwt: <attacker's JWT>`
   - `x-sui-address: <victim's suiAddress>`
   - body: `{ type: 'invoice', amount: 99999, label: 'You owe me', recipientEmail: '<spam target>' }`
3. Server side (`route.ts:20–122`):
   - JWT passes.
   - `prisma.user.findUnique({ suiAddress: address })` — finds victim's user (if they have an account).
   - `prisma.payment.create({ data: { userId: victim.id, suiAddress: victim.address, ... } })` — creates the invoice under the victim's userId.
4. **Result.** A fake invoice appears in the victim's account. The fake invoice's `/pay/<slug>` page shows `recipientName: <victim's displayName>` because line 26–29 of the GET route fetches the user's display name from `payment.userId`. The attacker controls the amount, label, and (if email-send ever ships) the email recipient list.

**Why the reporter's PoC went deeper than this:** the reporter wrote the IDOR can read "private chat history." That maps to `/api/engine/sessions/[id]` — which is also IDOR-vulnerable per §0.4 (covered in §9). Same class, different route.

**Phase 1A closes all 4 of these routes.** The middleware-level binding makes `x-sui-address` mismatch-with-JWT-derived a 403 across the board; the per-route `assertOwns` checks are redundant after that but defense-in-depth keeps them.

#### §5.3 — Slug entropy (`apps/web/lib/slug.ts`)

```ts
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // 55 chars

export function generateSlug(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
```

| Type | Length | Entropy |
|---|---|---|
| Payment link | 8 | log2(55^8) ≈ 46.3 bits |
| Invoice | 10 | log2(55^10) ≈ 57.8 bits |

**Findings:**

- **S-Slug-Entropy-Sufficient (P3 — informational).** At 1k requests/sec brute force, expected hit time on an 8-char slug is ~2300 years. Acceptable. Not a finding.
- **S-Slug-ModuloBias (P3).** `bytes[i] % 55` introduces ~4% bias because 256 mod 55 = 36. The first 36 ALPHABET indices map to 5 random bytes; the remaining 19 map to 4. Net effect: entropy reduced from 46.3 → ~46.0 bits. Trivial. Phase N: switch to nanoid (`nanoid(8)` with the same alphabet) to eliminate the bias structurally; effectively zero-cost migration.
- **S-Slug-NoUniqueRetry (TBC P3).** The slug-generate path doesn't show a uniqueness check + retry. If `Payment.slug` has a unique constraint, a collision will throw a Prisma error (caught by no `catch` in the create call). At 47 bits, expected collision after ~12M generations (birthday-paradox). Bounded in practice. Phase N: confirm `slug` has a unique constraint (likely yes — needed for `findUnique({ where: { slug } })` to work) and add a 1-retry path on collision for robustness.
- **S-PaymentLink-PrivateRoute (P3 informational).** `/api/payments/[slug]` returns FULL payment details to anyone who knows the slug — including `recipientEmail`, `recipientName`, `senderName`, `lineItems`, `dueDate`, `paidAt`, `paidBy`, `txDigest`. By design (the payer page renders these), but means the slug IS the access token. A leaked screenshot of `/pay/<slug>` is a leaked invoice. No way to revoke a slug other than `cancelled`. Documented; not a finding.

#### §5.4 — `/api/payments/[slug]/verify` flow

(`apps/web/app/api/payments/[slug]/verify/route.ts`.) Public (no auth) — the payer who isn't the recipient calls this to mark a payment paid.

Two verify paths:
1. **Registry mode** — query Sui's Payment Kit registry for a `PaymentRecord` matching the payment's `nonce`. If found → mark paid.
2. **Digest mode** — verify a specific Sui transaction digest contains a `PaymentReceipt` matching the payment.

**Findings:**

- **S-Verify-NoOwnerCheck (P3 — by design).** The verify route doesn't check that the caller IS the payer. By design — anyone can mark a payment paid IF they can prove on-chain payment occurred. The on-chain proof is the binding (recipient + amount + nonce in the Move event). Net verdict: correct.
- **S-Verify-SenderName-Stored-Unsafe (TBC P2).** `body?.senderName?.slice(0, 100)` is stored directly in `payment.senderName`. Length-capped, NOT sanitized. Rendered by `InvoiceHeader.tsx` — React's JSX escaping handles XSS by default, but Phase N: confirm no `dangerouslySetInnerHTML` paths and add an explicit Zod schema that rejects HTML-control chars.
- **S-Verify-RateLimit-PerSlug (P3 — informational).** `rateLimit('verify:${slug}', 10, 60_000)` — per-slug, not per-IP/JWT. An attacker can verify-spam a victim's slug 10x/min from anywhere; not damaging since no payment-state mutation occurs without on-chain proof, but it does generate Sui RPC calls (`fetch(SUI_RPC, ...)`) and could amplify cost. Phase N: per-IP rate limit additionally.

#### §5.5 — Email-injection surface (Resend / invoice emails)

Audric stores `recipientEmail` on the Payment row but does NOT actively send invoice emails today (verified via grep — no `Resend.send`, no `resend/v1/emails` call from the payments routes). The MPP `pay_api` engine tool can call `mpp.t2000.ai/resend/v1/emails`, but that's a paid agent-driven flow, not invoice automation.

**Findings:**

- **S-Invoice-Email-NotShipped (P3 — observation).** No email-injection surface currently exists. If a future "send invoice via email" feature ships:
  - Validate `recipientEmail` strictly (RFC 5322 plus deny-list of header-injection chars `\r\n`, `;`, etc.).
  - Bind sender name to the user's verified Google email, NOT the user-controlled `senderName`.
  - Rate-limit (max 5 invoices/email/hour to prevent spam).
  - Use Resend's reputation domain (audric.ai) — never let users send from arbitrary `from:` addresses.
  - Make the invoice email un-personalizable enough that abuse doesn't yield a useful spam vector.

This is a Phase N owner; flagged here so it's not forgotten when the feature ships.

#### §5.6 — Public profile page (`/[username]`)

`apps/web/app/[username]/page.tsx` — public, no auth required. Anyone can visit `/funkii` and see the user's public profile (display name, avatar, public bio).

**Finding S-Profile-Disclosure-EnumerableHandles (P3).** Profile pages are publicly indexable (`/audric.ai/funkii` returns 200 if the user exists, 404 if not). An attacker can enumerate registered handles. Mitigated by `robots.txt` Disallowing indexing of non-trivial profiles + by reservation-based handle assignment (no easy `username == suiAddress` mapping). Phase N: confirm the username→user mapping doesn't leak `suiAddress` in the page or its OG metadata.

#### §5.7 — Cross-references for §5

- §0.4 — full route inventory (this section drills into the 4 IDOR-vuln routes).
- §1.1 — `/pay/[slug]` and `/invoice/[slug]` page tree.
- §6 — `Payment` Prisma model PII inventory.
- §10 — indexer + ProtocolFeeLedger writes are NOT triggered by these payment-link flows (different fee path; `Payment.paidAt` is the human-payer convention, while ProtocolFeeLedger is for the audric-overlay fee on save/borrow/swap).
- Reporter PoC (§0.1) — this section's §5.2 worked exploit confirms the reporter's findings end-to-end.
- Part 2 findings: S-Slug-Entropy-Sufficient (P3-informational), S-Slug-ModuloBias (P3), S-Slug-NoUniqueRetry (TBC P3), S-PaymentLink-PrivateRoute (P3-informational), S-Verify-NoOwnerCheck (P3-by-design), S-Verify-SenderName-Stored-Unsafe (TBC P2), S-Verify-RateLimit-PerSlug (P3-informational), S-Invoice-Email-NotShipped (P3-observation), S-Profile-Disclosure-EnumerableHandles (P3).

---

### §6 — Data + privacy

**Scope.** Prisma PII inventory, NeonDB row-level access posture, GDPR/CCPA compliance gaps, third-party telemetry audit, retention policies.

#### §6.1 — Prisma PII inventory (`apps/web/prisma/schema.prisma`)

| Model | PII content | Sensitivity | Notes |
|---|---|---|---|
| `User` | `suiAddress`, `email`, `displayName`, `username`, `tosAcceptedAt` | Medium-High | Email is OAuth-derived (Google), not user-typed |
| `UserPreferences` | `contacts` (JSON), `limits` (JSON) | Medium | `contacts` is the user's contact book per `save_contact` tool |
| `ConversationLog` | Full chat transcript (`role`, `content`, `toolCalls`) | **VERY HIGH** | Every message the user types + every agent response, including amounts/addresses/personal questions |
| `SessionUsage` | Token counts + costs per session | Low | Per-address usage; no content |
| `ServicePurchase` | `serviceId` + `amountUsd` per address | Medium | MPP service purchase history (e.g. "bought a flight search at $0.10") |
| `AppEvent` | `address` + `type` + `details` (Json) + `digest` | Medium-High | Per-event audit trail; `details` Json may include amounts/addresses |
| `AdviceLog` | Full advice text (`adviceText`) + `targetAmount` + `actedOn` | **VERY HIGH** | Every recommendation the agent has ever given — verbatim financial advice |
| `Payment` | `senderName`, `recipientName`, `recipientEmail`, `lineItems`, `paidBy`, `txDigest` | High | Invoice metadata; `recipientEmail` is third-party PII |
| `WatchAddress` | Tracked addresses with optional `label` | Medium | Relationship graph hint (who the user is watching) |
| `PortfolioSnapshot` | Daily `walletValueUsd / savingsValueUsd / debtValueUsd / netWorthUsd / yieldEarnedUsd / healthFactor / savingsRate / allocations` | **VERY HIGH** | Daily net-worth + composition snapshot — top-tier PII |
| `UserFinancialProfile` | `riskAppetite`, `financialLiteracy`, `primaryGoals`, `knownPatterns`, confidence scores | High | Psychographic PII inferred by Claude from chat transcripts |
| `UserMemory` | `content` (extracted facts), `originalQuote`, `confidence`, `memoryType` | **VERY HIGH** | Long-term agent memory of personal facts ("user prefers conservative saves," "user is saving for daughter's university") |
| `LinkedWallet` | `suiAddress` + `verifiedAt` per linked address | Medium | Multi-wallet relationships (D-3 class) |

**Total PII surface:** 13 models, ~6 of which are VERY HIGH sensitivity. NeonDB hosts everything in a single PostgreSQL database via a `DATABASE_URL` connection string.

#### §6.2 — NeonDB access posture

- **Single connection string** (`env.DATABASE_URL`) with full table CRUD access.
- **No PostgreSQL row-level security (RLS) policies** — code-side filters (`where: { userId }`, `where: { suiAddress }`) are the only enforcement.
- **No Prisma middleware-level binding** — every query is independently responsible for including the userId/address predicate.
- **Backup access:** TBC. Neon ships automatic backups; the access policy is a Phase N audit item (cross-ref §8).

**Findings:**

- **S-DB-NoRowLevelSecurity (P2).** Code-side filters are the sole defense against cross-user reads. A single dropped filter (e.g. `prisma.userMemory.findMany({})` instead of `findMany({ where: { userId } })`) leaks every user's memories. The IDOR class in §0/§5 is exactly this bug class realized via mis-bound `address` parameter, but the same risk exists for ANY query in any route. **Recommended fix (Phase N):**
  - **Option A (preferred):** add a Prisma client middleware (`prisma.$use(...)`) that requires user-bound queries on user-scoped tables (`UserMemory`, `AdviceLog`, `ConversationLog`, `Payment`, `PortfolioSnapshot`, `UserFinancialProfile`, `LinkedWallet`) and throws on bypass. Single point of enforcement.
  - **Option B:** PostgreSQL RLS with `SET LOCAL app.user_id = ...` per request via Prisma raw SQL hook. More invasive; defense in depth.
  - **Option C:** scope database connections per-user. Not feasible at scale.

- **S-DB-Backup-AccessTBC (TBC P3).** Neon's automatic backups can be restored to a fresh instance with full access. Whoever holds Neon org admin can dump all PII. Phase N: confirm 2FA on Neon org account + document backup access policy.

#### §6.3 — GDPR/CCPA compliance gaps (P1-class)

Audric collects Google email + chat content + financial profiles. Several mandatory user rights are NOT implemented:

- **S-Privacy-NoGDPRDelete (P1).** **No `/api/user/delete-account` route.** GDPR Art. 17 ("right to erasure") + CCPA §1798.105 ("right to delete") are mandatory for users in those jurisdictions. **Recommended fix (Phase N):**
  - Add `DELETE /api/user/me` (or `POST /api/user/delete-account` with confirmation flow).
  - Cascade delete: `User` → `ConversationLog`, `AdviceLog`, `Payment`, `WatchAddress`, `PortfolioSnapshot`, `UserFinancialProfile`, `UserMemory`, `LinkedWallet`, `UserPreferences`, `SessionUsage` (by address), `ServicePurchase` (by address), `AppEvent` (by address). Note that on-chain transactions cannot be deleted (Sui mainnet is immutable) — the deletion notice MUST clarify this.
  - Confirm via a 24h grace period (give the user a chance to undo) + email confirmation.
  - Update `apps/web/app/(legal)/privacy/page.tsx` to describe the deletion flow.

- **S-Privacy-NoDataExport (P1).** **No data-export endpoint.** GDPR Art. 20 ("right to data portability") + CCPA §1798.110 ("right to know") are mandatory. **Recommended fix (Phase N):** add `GET /api/user/me/export` that streams a JSON blob of all the user's records across all 13 tables.

- **S-Privacy-NoConsentLogging (P3).** `User.tosAcceptedAt` is a single timestamp. No record of WHICH version of the ToS the user accepted. If ToS materially changes, audric can't prove the user agreed to the post-change version. Phase N: add `tosVersion: string` field + log `(version, acceptedAt)` per acceptance.

- **S-Privacy-NoCookieConsent (P3 — depends on jurisdiction).** Audric uses localStorage / sessionStorage for zkLogin session (technically required for the service, exempt from cookie-consent under EU ePrivacy Directive). No third-party analytics cookies (no PostHog / Sentry — see §6.5). **Net verdict:** likely exempt from cookie-banner requirement. Phase N: confirm with legal before EU rollout.

#### §6.4 — Retention policies

| Model | Retention | TTL? |
|---|---|---|
| `TurnMetrics` | 90 days (cron `turn-metrics-cleanup` — already shipped) | ✅ |
| `ConversationLog` | **None** — kept forever until user-delete | ❌ |
| `AdviceLog` | **None** | ❌ |
| `UserMemory` | `expiresAt` field exists but optional; many rows have `null` | partial |
| `Payment` | None — paid invoices retained for tax/audit | by design |
| `PortfolioSnapshot` | None — historical chart data | by design |
| `AppEvent` | None | ❌ |
| `WatchAddress` | None — manual user-delete only | by design |
| `LinkedWallet` | None — manual user-delete only | by design |

**Findings:**

- **S-Privacy-Retention-ConversationLog (P2).** Full chat transcripts retained forever until user-deletes their account (which they can't currently per §6.3). Phase N: add `ConversationLog` retention TTL (e.g. 365 days) OR per-user-controllable retention setting. Cleanup cron similar to `turn-metrics-cleanup`.

- **S-Privacy-Retention-AdviceLog (P2).** Same as above for `AdviceLog`. Note that the `<advice_context>` system-prompt block hydrates only the last 30 days of advice (per CLAUDE.md Engine `AdviceLog` description), so older rows are dead weight from a behavioral standpoint and pure liability from a privacy standpoint. Phase N: align retention with the 30d hydration window OR cap at 90d to match `TurnMetrics`.

- **S-Privacy-Retention-UserMemory-Optional (P3).** `UserMemory.expiresAt` is nullable. Memories without TTL persist indefinitely. Phase N: enforce a default expiry on insert (e.g. 1 year) with explicit override for high-confidence facts.

- **S-Privacy-Retention-AppEvent (P3).** `AppEvent` mirrors on-chain events — could safely truncate after 90d since the chain is the source of truth. Phase N: add cleanup cron.

#### §6.5 — Third-party telemetry posture

`grep -i "sentry\|posthog\|datadog\|segment\|mixpanel"` on `apps/web/package.json`: **no matches**.

Audric uses ONLY Vercel's built-in observability (Vercel Logs + Speed Insights + Web Analytics). No third-party tracking pixels, no client-side analytics SDKs.

**Findings:**

- **S-Telemetry-VercelOnly (P3 — observation).** Net positive for privacy. The trade-off: no third-party error monitoring (Sentry would catch unhandled exceptions in client code that Vercel doesn't); no product analytics (PostHog / Mixpanel funnel tracking is unavailable). Phase N decision: stay Vercel-only OR add Sentry (server-side only, with PII redaction) for better incident triage. **D-question for §6.**

- **S-Telemetry-AnthropicDataPolicy (P2).** Profile-inference + memory-extraction crons send FULL chat content to Anthropic for inference. Per Anthropic's standard API terms, customer data is not used for training. **Recommended fix (Phase N):**
  - Confirm Anthropic API terms current state.
  - Sign a Data Processing Agreement (DPA) if scaling beyond founder usage.
  - Document in `apps/web/app/(legal)/privacy/page.tsx` what data is sent to Anthropic and why.

- **S-Telemetry-VercelLogs-PIIRedaction (P2).** Address + slug + tool-call logs land in Vercel Logs. 30d retention on free, 90d+ on paid. Vercel staff with project access can read them. **Recommended fix (Phase N):** add a `redactAddress(addr: string): string` helper that returns `0xabcd...wxyz` for addresses ≥ 16 chars; apply across all `console.log` paths. Same for digests + slugs.

#### §6.6 — Cross-references for §6

- §1.4 — probe / scan posture (no `.well-known/security.txt`).
- §3 — gateway-side `MppPayment` PII inventory.
- §4 — internal-API write paths to `UserMemory` / `UserFinancialProfile` / `ChainFact`.
- §5 — `Payment` model deep-dive.
- §8 — operational owner of NeonDB org access + 2FA + secret rotation.
- `audric/.cursor/rules/prisma-models-overview.mdc` — model purpose + relationships.
- Part 2 findings: S-DB-NoRowLevelSecurity (P2), S-DB-Backup-AccessTBC (TBC P3), S-Privacy-NoGDPRDelete (P1), S-Privacy-NoDataExport (P1), S-Privacy-NoConsentLogging (P3), S-Privacy-NoCookieConsent (P3-conditional), S-Privacy-Retention-ConversationLog (P2), S-Privacy-Retention-AdviceLog (P2), S-Privacy-Retention-UserMemory-Optional (P3), S-Privacy-Retention-AppEvent (P3), S-Telemetry-VercelOnly (P3-observation), S-Telemetry-AnthropicDataPolicy (P2), S-Telemetry-VercelLogs-PIIRedaction (P2).

---

### §7 — Dependency hygiene

**Scope.** Direct + transitive npm dependencies across t2000 + audric, supply-chain trust posture, `pnpm.overrides` audit, patch-package usage, baseline `pnpm audit` posture.

#### §7.1 — Top-level dep families

| Family | Versions | Trust | Notes |
|---|---|---|---|
| **Sui core** | `@mysten/sui ^2.11.0`, `@mysten/bcs ^2.0.1`, `@mysten/dapp-kit ^1.0.4`, `@mysten/zklogin ^0.8.1`, `@mysten/suins ^1.1.1`, `@mysten/payment-kit ^0.1.6` | Mysten Labs | Pinned via `pnpm.overrides` to `^2.11.0` for `sui` + `^2.0.1` for `bcs`. ⚠️ `@mysten/zklogin` is pre-1.0 |
| **DeFi protocol** | `@cetusprotocol/aggregator-sdk ^1.4.8`, `@naviprotocol/lending 1.4.0` (patched) | Cetus + NAVI | `@naviprotocol/lending` is **PATCHED** locally — see §7.3 |
| **AI** | `@anthropic-ai/sdk ^0.80.0` | Anthropic | Production AI vendor for engine |
| **Infra** | `@prisma/client ^7.5.0`, `@neondatabase/serverless ^1.1.0`, `pg ^8.20.0`, `@upstash/redis ^1.37.0`, `@vercel/analytics ^1.6.1`, `@vercel/blob ^2.3.3` | Prisma + Neon + Vercel + Upstash | All actively maintained; patch-level versioning |
| **MPP / payment** | `@suimpp/mpp ^0.3.1`, `mppx ^0.4.9` | t2000-owned | Internal libraries — release authority = founder + repo collaborators |
| **Cryptography** | `jose ^6.2.2` | Auth0 maintainer | **Already in audric deps but UNUSED today** — Phase 1A migration cost is zero (just import) |
| **Rendering** | `markdown-it ^14.1.1`, `pdf-lib ^1.17.1`, `sharp ^0.34.5`, `qrcode ^1.5.4` | mixed maintainers | Markdown + PDF + image — historical XSS / memory-corruption risk surface |
| **Framework** | `next ^15`, `react ^19`, `react-dom ^19`, `@tanstack/react-query ^5.95.2`, `framer-motion ^12.38.0` | Vercel + React | Major-locked at minimum versions |
| **Validation / utility** | `zod ^3.25.0` (audric) / `^4.3.6` (t2000 root) ⚠️, `cron-parser ^5.5.0`, `clsx`, `tailwind-merge` | mixed | **Zod major-version drift** between t2000 root and audric — see §7.4 |

#### §7.2 — `pnpm.overrides` (root `package.json`)

```json
"overrides": {
  "@mysten/sui": "^2.11.0",
  "@mysten/bcs": "^2.0.1",
  "@pythnetwork/pyth-sui-js": "2.2.0"
}
```

**Findings:**

- **S-Deps-Overrides-Working (P3 — observation).** `@mysten/sui` is pinned across the monorepo; SDK migration v1→v2 (per CLAUDE.md "Sui Integration v2 migration notes") is enforced by this override. ✅
- **S-Deps-Overrides-PythPin (P3).** `@pythnetwork/pyth-sui-js: 2.2.0` is exact-pinned (no `^`). Suggests a known issue with newer versions; Phase N: document why this pin exists.
- **S-Deps-MysenZkLogin-PreV1 (P2).** `@mysten/zklogin ^0.8.1` is pre-1.0 — Mysten's own docs note the library is in transition (`@mysten/sui`'s zkLogin utilities have absorbed some of the API). Breaking changes may land at any time. Phase N: pin to exact version + watch upstream migration guides + cross-ref §2 zkLogin trust model.

#### §7.3 — Patched dependencies

```json
"patchedDependencies": {
  "@naviprotocol/lending@1.4.0": "patches/@naviprotocol__lending@1.4.0.patch"
}
```

**S-Deps-PatchedNaviLending (P2).** A local patch is applied to NAVI's lending SDK. If the patch modifies security-sensitive code (e.g. balance arithmetic, transaction builders), it's effectively a fork that doesn't get the upstream's security fixes. Phase N audit:
1. Read `patches/@naviprotocol__lending@1.4.0.patch` end-to-end.
2. Document in this rule what the patch changes + why.
3. Track upstream releases of `@naviprotocol/lending` and decide on each whether to (a) update + re-apply, (b) update + drop the patch, (c) hold.
4. **CLAUDE.md already says "Do NOT import `@naviprotocol/lending` in new code"** — reads-via-MCP, writes via thin Sui Transaction builders. The patch is legacy. Phase N decision: deprecate the dep entirely.

#### §7.4 — Cross-package version drift

**Zod major-version drift:**
- t2000 root: `zod ^4.3.6`
- audric `apps/web`: `zod ^3.25.0`

**S-Deps-ZodMajorDrift (P2).** Same library, different majors across the monorepo. The t2000 root's Zod 4 is used by `apps/server`, `apps/gateway`. Audric's Zod 3 is the env-validation gate (`apps/web/lib/env.ts`). **Risk:** when audric uses any t2000 package that depends on Zod (e.g. `@t2000/sdk` — needs verification), the dep tree resolves to one Zod or both. If Zod 3 + Zod 4 coexist, schema instances aren't interoperable (Zod 3 schemas don't validate against Zod 4 parsers). Phase N: align both monorepos on Zod 4 OR lock both at Zod 3 with explicit incompatibility documentation.

**Sui major-version drift (audited):**
- All packages on `@mysten/sui ^2.11.0` via `pnpm.overrides`. ✅ No drift.

#### §7.5 — Internally-published packages (supply chain)

**`@suimpp/mpp` and `mppx` are t2000-published packages.** Compromise of the npm publish account = compromise of every audric + gateway deployment that pulls them at install time.

**Findings:**

- **S-Deps-MppxTrust (P2 supply chain).** Same as §3.5's S-Gateway-MppxLibraryTrust — `mppx` runs in audric/web AND apps/gateway. Compromise affects both. Phase N: pin to exact version, enable npm 2FA on the publish account (if not already), maintain an internal fork/mirror as a recovery option.
- **S-Deps-SuimppMpp-Trust (P2 supply chain).** `@suimpp/mpp` is the protocol package consumed by the gateway. Same defense pattern.
- **S-Deps-T2000-Engine-SDK-Trust (P2 supply chain).** `@t2000/engine` and `@t2000/sdk` are t2000-published, pinned to exact versions in audric (`1.30.2`). Compromise = engine+SDK compromise = full Audric exploitation. Phase N: require 2FA on npm publish (cross-ref §8 operational).

#### §7.6 — High-risk transitive surfaces

Without running `pnpm audit`, these dep families are historical XSS / memory-corruption hotspots and warrant a Phase N read:

- **`markdown-it ^14.1.1`** — **likely** the source of CodeQL alerts #7 + #8 (`js/bad-code-sanitization`). Renders chat content + advice content. Phase 1B's CodeQL triage covers this. (S-CodeQL-Errors P1 from §0.2.)
- **`sharp ^0.34.5`** — image processing native module. Historical CVEs in `libvips` (its native dep). Phase N: confirm against current `pnpm audit`.
- **`pdf-lib ^1.17.1`** — PDF generation. Historical XSS via embedded JS. Confirm not parsing untrusted PDFs.
- **`pg ^8.20.0`** — PostgreSQL driver. Used alongside `@neondatabase/serverless`. Both connection paths must be secure. Phase N: confirm only one is used; remove the other.

#### §7.7 — Baseline `pnpm audit` posture

**Not run as part of this audit (doc-only phase).** Phase 1B should run `pnpm audit --json` in both repos and capture the baseline:

```bash
# t2000 root
pnpm audit --json > docs/security/pnpm-audit-baseline.json

# audric/apps/web
cd /Users/funkii/dev/audric/apps/web && pnpm audit --json > docs/security/pnpm-audit-baseline.json
```

After baseline:
- Track delta in CI (fail PR on new high/critical vulns).
- Quarterly cadence to re-baseline (matches `pnpm audit` cadence in industry).

**S-Deps-NoBaseline (P2).** Audit baseline does not exist today. Phase 1B owner.

#### §7.8 — Automated dep updates

**No Dependabot / Renovate / similar configured today** (verified via grep — no `.github/dependabot.yml` in t2000 or audric).

**S-Deps-NoAutoUpdates (P2).** Manual `pnpm up --latest` is the only update path. New CVEs require human watching. Phase N: enable Dependabot for both repos with grouped weekly PRs. Patch + minor auto-merge if CI green; majors require human review.

#### §7.9 — Cross-references for §7

- §3 — gateway-side `mppx` trust.
- §6 — `@anthropic-ai/sdk` data path.
- §8 — npm 2FA + publish-account governance.
- `audric/.cursor/rules/coding-discipline.mdc` — ESLint rule consolidation pattern (cross-cuts dep resolution).
- Part 2 findings: S-Deps-Overrides-Working (P3-observation), S-Deps-Overrides-PythPin (P3), S-Deps-MysenZkLogin-PreV1 (P2), S-Deps-PatchedNaviLending (P2), S-Deps-ZodMajorDrift (P2), S-Deps-MppxTrust (P2 supply chain), S-Deps-SuimppMpp-Trust (P2 supply chain), S-Deps-T2000-Engine-SDK-Trust (P2 supply chain), S-Deps-NoBaseline (P2), S-Deps-NoAutoUpdates (P2).

---

### §8 — Operational + secret management

**Scope.** 2FA matrix across vendor + platform accounts, secret rotation policies, secret-scanning hooks, pre-commit hardening, founder-personal vs. org account hygiene, agent shell + MCP injection surface, incident-response readiness.

#### §8.1 — Secrets inventory (server-side)

From `audric/apps/web/lib/env.ts` server schema + observed code (gateway + t2000 server are NOT yet env-gated per §3.4 / §4.2):

| Secret | Required? | Compromise Impact | Currently 2FA? | Rotation policy? |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | required | LLM cost drain | TBC | none documented |
| `BLOCKVISION_API_KEY` | required | RPC + portfolio degradation; rate-limit DoS | TBC | none documented |
| `DATABASE_URL` (NeonDB) | required | full PII dump | TBC (Neon org) | none documented |
| `ENOKI_SECRET_KEY` | required | sponsor arbitrary tx + drain gas budget | TBC (Mysten Enoki UI) | none documented |
| `T2000_INTERNAL_KEY` | required | bypass internal-API auth → any user's PII | N/A (shared secret) | none documented |
| `UPSTASH_REDIS_REST_TOKEN` | required | session-store dump + replay | TBC (Upstash) | none documented |
| `AUDRIC_PARENT_NFT_PRIVATE_KEY` | required | **mint arbitrary leaves under `audric.sui` SuiNS parent** — domain hijack class | N/A (key) | none documented |
| `CRON_SECRET` | optional | bypass Vercel cron auth | N/A (shared secret) | none documented |
| `BRAVE_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` | optional | per-vendor bill drain | TBC | none documented |
| `BLOB_READ_WRITE_TOKEN` | optional (Vercel-injected) | upload arbitrary blobs to Vercel project | Vercel-managed | rotation = re-link |

Plus gateway-side per-vendor keys (~40 secrets): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `LOB_API_KEY`, `STABILITY_API_KEY`, `PRINTFUL_API_KEY`, … etc. (Phase N audit: full enumerate from `apps/gateway/app/{vendor}/`.)

#### §8.2 — 2FA matrix (P1 audit task)

**S-Op-2FA-Matrix-NotDocumented (P1).** No documented matrix today. Phase N owner: build a `docs/security/2fa-matrix.md` (kept LOCAL-ONLY in t2000-private to avoid leaking attack surface) that lists every platform + the operator's 2FA status:

| Platform | Why it matters | 2FA req'd? | Current status |
|---|---|---|---|
| Vercel | Deploys audric, gateway, t2000 web — full code execution | YES (hard) | TBC |
| GitHub (mission69b org) | Source of truth; secret scanning; CI | YES (hard) | TBC |
| npm (t2000 publishing) | `@t2000/sdk`, `@t2000/engine`, `mppx`, `@suimpp/mpp` | YES (hard) | TBC |
| AWS / ECS | t2000 server cron host (per `apps/server/`) | YES (hard) | TBC |
| NeonDB org | All audric PII | YES (hard) | TBC |
| Upstash | Sessions + receipt-replay store | YES (hard) | TBC |
| Anthropic | LLM cost + DPA | YES | TBC |
| OpenAI | TTS / STT / gateway | YES | TBC |
| ElevenLabs | TTS | YES | TBC |
| BlockVision | RPC + portfolio | YES | TBC |
| Mysten / Enoki | zkLogin sponsor + parent SuiNS NFT custody | YES (hard) | TBC |
| Cloudflare / DNS provider | `audric.ai`, `t2000.ai`, `mpp.t2000.ai`, `suimpp.dev` | YES (hard) | TBC |
| Resend | Gateway email sender | YES | TBC |
| (40+ other vendor accounts) | Per-route gateway billing | mixed | TBC |

**Recommendation:** Phase N owner runs the audit in a single sitting + enables 2FA where missing + documents recovery codes off-cloud (e.g. Yubikey + paper backup in a safe).

#### §8.3 — Secret rotation policies (P1 audit task)

**S-Op-NoSecretRotationRunbook (P1).** No rotation runbook exists for any secret. Each rotation today is operator-improv with no checklist for "where the secret is referenced" + "what redeploys depend on it" + "how to validate post-rotation." Phase N owner: build `docs/security/runbooks/RUNBOOK_secret_rotation_<NAME>.md` per secret family. Minimum content per runbook:
1. Where the secret is stored (Vercel env var name + GitHub Actions secret if applicable).
2. Which deployments / services consume it.
3. Step-by-step rotation procedure (generate new → set in env → redeploy → verify → revoke old).
4. Post-rotation smoke test (a single curl that confirms the path works).
5. Last-rotated date + scheduled cadence (e.g. quarterly for vendor keys, on-leak for high-value).

**Highest-priority targets:**
- `AUDRIC_PARENT_NFT_PRIVATE_KEY` — domain custody, pure asset.
- `ENOKI_SECRET_KEY` — gas drain + sponsor abuse.
- `T2000_INTERNAL_KEY` — IDOR-class risk (cross-ref §4 naming drift).
- `DATABASE_URL` — full PII access.

#### §8.4 — Secret-scanning hooks

**Pre-commit:** `git config --get core.hooksPath` returns nothing today (verified via inspection). No gitleaks / truffle-hog hook configured. **Risk:** an operator who accidentally commits a key (e.g. `ENOKI_SECRET_KEY=enoki-prod-...` in a debug commit) ships it to GitHub before noticing.

**S-Op-PreCommitSecretScan (P2).** Phase N owner: install `gitleaks` as a pre-commit hook (or via `pre-commit` framework) + add a CI-level scan as a fallback. Cost: ~5min setup, near-zero runtime overhead.

**GitHub-native secret scanning + push-protection:** TBC. For private repos, this is part of GitHub Advanced Security (paid). Free private repos get scanning for partner-published patterns (AWS keys, Stripe keys, etc.) but not custom patterns or push-protection.

**S-Op-GitHubSecretScanning-StatusTBC (P2).** Phase N: confirm push-protection is enabled on both `mission69b/t2000` and `mission69b/audric`.

#### §8.5 — Founder-personal vs. org account hygiene

**S-Op-FoundeRPersonalAccount-Risk (P2).** Most vendor accounts are likely tied to the founder's personal email. Risk: if the founder loses access (account compromise, recovery email loss, hardware loss), full operational lockout. Phase N owner: where vendors support it, migrate to org-shared accounts (e.g. `ops@t2000.ai` group). Where they don't, document recovery codes (off-cloud, e.g. paper safe + Yubikey + family member with explicit pass-through instruction).

#### §8.6 — Agent shell + MCP injection surface

**S-Op-AgentShellMcp-Surface (P2).** Coding agents (Claude Code / Cursor) used by the founder have shell + MCP access to the dev machine. A contaminated dependency, malicious npm package, or prompt-injection that reaches the agent's context can:
1. Read local files (including `.env`, `~/.ssh/`, `~/.aws/credentials`).
2. Execute shell commands (including `gh`, `npm publish`, `pnpm publish`).
3. Push to remote repos or publish to npm if 2FA isn't enforced per-action.

**Recommended fix (Phase N):**
1. Audit MCP server allow-list (currently `cursor-ide-browser` + `user-t2000` per the `mcp_file_system_servers` block at the top of every Cursor turn). Each MCP grants additional tools; review whether each is necessary.
2. Enforce npm 2FA-required-per-publish (`npm config set always-auth true` + `OTP-on-publish` policy).
3. Move high-value secrets out of `.env` files into a password manager OR encrypted vault (e.g. `direnv` + `sops` + age).
4. Cross-ref §9 for engine-side prompt-injection (LLM-driven write tools have a parallel surface in the production app, not just dev).

#### §8.7 — Apps/server + apps/gateway env-gate gap

Per §3.4 + §4.2, `apps/gateway` and `apps/server` do NOT yet have `lib/env.ts` Zod-validated boot gates. They read `process.env.X` directly. **Cross-app rule `env-validation-gate.mdc` mandates the gate for every app** — these two apps are out of compliance.

**S-Op-ServerEnvGate-Missing (P2).** Phase N owner: cascade audric's `lib/env.ts` template to:
- `apps/server/src/env.ts` (server cron host).
- `apps/gateway/lib/env.ts` (gateway).
Each schema is small (gateway is dominated by per-vendor keys; server is internal-key + database + cron-misc). Together: ~½ day of work. Findings S-Internal-NamingDrift (P1) and S-Gateway-EnvDirectReads (P2) close as side effects.

#### §8.8 — Incident-response readiness

**S-Op-NoIncidentRunbook (P1).** No documented incident-response process. The IDOR reporter incident (May 2026) revealed this — there was no runbook for "step 1: triage; step 2: scope assessment; step 3: hot-patch; step 4: notify reporter; step 5: public advisory; step 6: post-mortem." SPEC 30 itself starts to codify this for THIS incident, but the general process isn't captured.

**Recommended fix (Phase N):** create `docs/security/RUNBOOK_incident_response.md` with:
1. Triage tree (severity → first-action timing).
2. Communication templates (acknowledgment within 24h; status updates every N days).
3. Disclosure timeline (industry-standard 14d with extensions if mid-fix).
4. CVE filing process (when a published library is affected — e.g. `mppx` regression).
5. Post-mortem template.

#### §8.9 — Cross-references for §8

- §3.4 — gateway env-gate gap.
- §4 — internal-API + cron secret rotation paths.
- §6 — NeonDB backup access.
- §7 — npm publish supply-chain trust.
- §9 — engine-side prompt-injection (related but distinct surface from §8.6 dev-side agent injection).
- `audric/.cursor/rules/env-validation-gate.mdc` + `t2000/.cursor/rules/env-validation-gate.mdc` — canonical contract.
- Part 2 findings: S-Op-2FA-Matrix-NotDocumented (P1), S-Op-AudricParentNftKey-Custody (P1), S-Op-EnokiKey-Custody (P1), S-Op-NoSecretRotationRunbook (P1), S-Op-PreCommitSecretScan (P2), S-Op-GitHubSecretScanning-StatusTBC (P2), S-Op-FoundeRPersonalAccount-Risk (P2), S-Op-AgentShellMcp-Surface (P2), S-Op-ServerEnvGate-Missing (P2), S-Op-NoIncidentRunbook (P1).

---

### §9 — Engine/agent surface (Items B + C — locked in scope)

**Scope.** The `@t2000/engine` agent runtime + its 35 tools + the audric-side prompt-injection surface (UserMemory content, `<financial_context>` block, chat history, BlockVision metadata flowing into LLM context, SuiNS handle resolution). Cross-references the SPEC 1 (correctness) + SPEC 2 (intelligence) harnesses (`agent-harness-spec.mdc` + `safeguards-defense-in-depth.mdc`).

#### §9.1 — Engine tool inventory (35 tools)

Per CLAUDE.md (updated S.245 — `pay_api` + `mpp_services` deleted 2026-05-22):
- **Read (24 tools):** `render_canvas`, `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`, `swap_quote`, `volo_stats`, `web_search`, `explain_tx`, `portfolio_analysis`, `protocol_deep_dive`, `token_prices`, `create_payment_link` ⚠️ (re-classified read in CLAUDE), `list_payment_links`, `cancel_payment_link`, `create_invoice`, `list_invoices`, `cancel_invoice`, `spending_analytics`, `yield_summary`, `activity_summary`, `resolve_suins`, `pending_rewards`.
- **Write (11 tools):** `save_deposit`, `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `harvest_rewards`, `swap_execute`, `volo_stake`, `volo_unstake`, `save_contact`.

Each write tool flows through:
1. **Preflight** (synchronous, no I/O) — input validation per `safeguards-defense-in-depth.mdc` Layer 2.
2. **Permission resolver** (`resolvePermissionTier`) — USD-aware: auto / confirm / explicit per `permission-rules.ts`.
3. **Engine guards** (14 guards: 12 pre-execution + 2 post-execution hints) — Layer 3.
4. **Build sponsored tx** via `composeTx` → `transactions/prepare` (per §2).
5. **User confirms** in audric UI (or auto-executes if `auto` tier resolved).
6. **Execute** via `transactions/execute` (per §2).

#### §9.2 — Permission resolver + USD-aware auto-execute trust model

Per `safeguards-defense-in-depth.mdc`:
- **Active in audric/web today.** P2.6 UC4b confirmed via live run: a 1.27 SUI / ~$1.20 swap auto-executed under `conservative` preset.
- **Three presets:** `conservative` (default new accounts; most writes auto under $5), `balanced` (DEFAULT; most writes auto under $10–$25), `aggressive` (most writes auto under $25–$100).
- `borrow` is always `confirm` (`autoBelow: 0` across every preset) — debt is too consequential to auto-execute.
- Cumulative daily spend > `autonomousDailyLimit` ($100/$200/$500 by preset) downgrades any `auto` to `confirm` as runtime safety net.

**Findings:**

- **S-Engine-AutoExecute-TrustModel (P2 — informational, by design).** Auto-execution does NOT bypass user consent — the user opted into the preset. But it DOES change WHO presses the confirm button (engine vs user). **Compromised system prompt OR poisoned UserMemory CAN trick the engine into auto-executing a malicious write IF it stays under the auto threshold.** With `conservative` preset and $5 threshold, max blast radius per turn is $5. With `aggressive` and $100 threshold, $100 per turn. Daily limit caps cumulative damage at $100/$200/$500. **Recommended fix (Phase N):** add a "no auto-execute on first-week accounts" gate (require ≥7 days of account age before auto-execute kicks in) — limits blast radius for the takeover-while-onboarding scenario.

- **S-Engine-PermissionConfig-PerSession (P3).** `permissionConfig` is loaded from the user's settings each chat request. If a malicious tool result somehow caused the user to "accept" a shift from conservative → aggressive (e.g. a deceptive UI or social-engineering chat), an attacker who later compromises chat would have a wider auto-window. Today's threat model assumes the user's settings are theirs — confirm in Phase N that no UI flow lets the agent change `permissionConfig` mid-session without explicit consent.

- **S-Engine-Borrow-AlwaysConfirm-LoadBearing (P3 — observation).** `borrow` is the only write that's always `confirm` regardless of preset. This is load-bearing — if a future tool refactor accidentally drops it from the always-confirm list, debt could auto-execute. Phase N: add a regression test that asserts `borrow` stays at `autoBelow: 0` across every preset.

#### §9.3 — Prompt-injection surfaces (5 vectors)

The LLM system prompt every turn includes:
1. **System base** — engine policy + tool descriptions (compiled — safe).
2. **`<financial_context>` block** — daily snapshot built from `UserFinancialContext` Prisma model + recent activity.
3. **`<advice_context>` block** — last 30d `AdviceLog` rows (full advice text).
4. **`<memory_context>` block** — `UserMemory` rows (extracted facts from prior conversations).
5. **`<chain_memory>` block** — `ChainFact` rows (classified on-chain events).
6. **Chat history** — full prior turn messages (user + agent + tool results).

**Each block is content the LLM TRUSTS as factual.** If an attacker controls any block, they control LLM behavior.

**Vector V1 — UserMemory poisoning (P2).** A user types "remember that my recovery phrase is `garbage stored in localStorage`" → the memory-extraction cron extracts it as a `UserMemory.content` row → next turn, the LLM sees it in `<memory_context>`. If the user's chat session is shared (e.g. screen-share for a demo), an observer can plant memories that influence future agent behavior. Mitigation: memory extraction has a Claude-driven filter that aims to extract facts/preferences/goals, not arbitrary text. **But the filter isn't a security boundary** — Claude can be tricked. Phase N: add a `memoryType` allow-list rejecting types not in the schema (already mostly enforced; reconfirm) + a max-confidence-cap for LLM-extracted memories.

**Vector V2 — `<financial_context>` snapshot drift (P3).** The 02:00 UTC `financial-context-snapshot` cron writes a row per user. If the cron's input data is ever attacker-controllable (e.g. spoofed BlockVision response), the snapshot ends up wrong → next turn's LLM sees wrong APY / wrong portfolio composition → may make wrong recommendation. **Bounded by:** BlockVision API key is server-side; resilience patterns per `blockvision-resilience.mdc` (cross-ref). Phase N: add cross-validation between BlockVision responses and Sui RPC for high-value fields (savings/debt) to catch divergence.

**Vector V3 — Chat history continuation attack (P2).** A returning attacker who previously chatted (and whose chat is in `ConversationLog`) can "set up" the LLM with prior messages: e.g. "remember I always send $X to address Y on Tuesdays." On a future Tuesday, the LLM sees the history + may auto-suggest the send. **This is exactly the attack that the always-confirm and USD-aware auto-execute gates are supposed to defend.** Defense in depth: the user still has to confirm (unless auto-tier kicks in under threshold). Phase N: investigate whether `ConversationLog` should be quarantined per-session vs cross-session — today every session sees prior sessions' content via the memory-extraction path (`<memory_context>`).

**Vector V4 — BlockVision metadata injection (P3).** Tools like `balance_check` + `portfolio_analysis` fetch BlockVision data including token names + descriptions. A malicious token published to Sui (anyone can publish a coin type) with a name like "USDC (legitimate)" or a description containing prompt-injection text could land in the LLM context via `displayText` or tool result. **Mitigation:** the engine's `<financial_context>` block formats tokens by symbol + balance, not by description. But `portfolio_analysis` does include richer data. Phase N: confirm the data flow doesn't pass user-controllable token metadata into tool results that are then echoed to the LLM.

**Vector V5 — SuiNS handle resolution (P3).** `resolve_suins` resolves a handle (`alice.audric.sui`) to an address. The handle's NFT metadata is on-chain and arbitrary. If a future feature surfaces SuiNS metadata to the LLM (e.g. "verify recipient name"), an attacker who controls the handle's NFT data can plant prompt-injection. Today: only the handle → address mapping is used. Phase N: when (if) richer SuiNS metadata becomes a tool input, sanitize.

#### §9.4 — Tool input validation (preflight) coverage

Per `safeguards-defense-in-depth.mdc`: every write tool MUST implement preflight. **TBC: confirm via grep that all 12 write tools have preflight functions.** Phase 1B owner — small, mechanical audit.

**S-Engine-Preflight-CoverageTBC (P2 audit task).** Phase N: enumerate write tools + confirm preflight presence + add regression test asserting tool factory rejects writes without preflight.

#### §9.5 — Tool result budgeting (B.2)

Per CLAUDE.md: tools can set `maxResultSizeChars` to cap output size. Important defense — without this, a tool returning a 50k-token portfolio response blows context budget AND leaks more PII than necessary into LLM context.

**S-Engine-ResultBudget-CoverageTBC (P3 audit task).** Phase N: confirm every tool sets `maxResultSizeChars` (or relies on the engine's default cap).

#### §9.6 — `record_advice` audit trail

Per CLAUDE.md: `record_advice` is an audric-side tool (NOT exported from `@t2000/engine`). Every recommendation the agent makes gets logged to `AdviceLog`. Used to prevent contradictory advice across sessions.

**Findings:**
- **S-Engine-AdviceLog-Privacy (P2 — cross-ref §6).** AdviceLog is full-text retention, no TTL — privacy concern (covered §6.4).
- **S-Engine-AdviceLog-Tamper (P3).** AdviceLog rows are written by the agent on user's behalf. If the IDOR class extends to `AdviceLog`, an attacker could plant fake advice rows OR delete real ones. Phase 1A's middleware-binding closes the same way it closes other IDOR routes. Cross-ref §0.4.

#### §9.7 — Engine cross-references for §9

- §0 — IDOR class affects engine routes (`/api/engine/sessions/[id]`, etc.).
- §2 — sponsor-tx + signing pipeline (write tools resolve here).
- §6 — UserMemory + AdviceLog retention policies.
- `safeguards-defense-in-depth.mdc` — full guard inventory + permission resolver.
- `agent-harness-spec.mdc` — Spec 1 + Spec 2 contract.
- `engine-tool-development.mdc` — tool factory pattern.
- `blockvision-resilience.mdc` — BlockVision read path defense.
- `goal-driven-execution.mdc` — engineering discipline cross-cuts engine work.
- Part 2 findings: S-Engine-AutoExecute-TrustModel (P2-by-design), S-Engine-PermissionConfig-PerSession (P3), S-Engine-Borrow-AlwaysConfirm-LoadBearing (P3-observation), S-Engine-Memory-Poisoning (P2), S-Engine-FinancialContext-SnapshotDrift (P3), S-Engine-ChatHistory-CrossSession (P2), S-Engine-BlockVision-MetadataInjection (P3), S-Engine-Suins-HandleMetadata (P3-future), S-Engine-Preflight-CoverageTBC (P2-audit), S-Engine-ResultBudget-CoverageTBC (P3-audit), S-Engine-AdviceLog-Privacy (P2), S-Engine-AdviceLog-Tamper (P3).

---

### §10 — Indexer + on-chain integrity (Item E — locked in scope)

**Scope.** The t2000 ECS-hosted indexer (`apps/server/src/indexer/`) that polls Sui mainnet checkpoints, detects USDC inflows to `T2000_OVERLAY_FEE_WALLET`, and writes `ProtocolFeeLedger` rows. This is the revenue-accounting source of truth — tamper paths here directly affect financial reporting + creator payouts (Audric Store).

#### §10.1 — Indexer architecture summary

`apps/server/src/indexer/indexer.ts`:
1. **Cursor**: `IndexerCursor` Prisma table (single row, name='main') tracking `lastCheckpoint`.
2. **Poll loop**: every `INDEXER_POLL_INTERVAL_MS` (default 2s), fetch up to `INDEXER_BATCH_SIZE` (default 10) checkpoints from `getJsonRpcFullnodeUrl('mainnet')`.
3. **Parse**: `parseTreasuryFees(tx, T2000_OVERLAY_FEE_WALLET)` extracts USDC + multi-asset transfers TO the treasury wallet, classified by `moveCall` targets (save / borrow / swap / harvest legs).
4. **Dedup + write**: `findFirst({ where: { txDigest, feeAsset } })` then `create()` — code-side dedup on the pair `(txDigest, feeAsset)`.
5. **Commit cursor**: after batch fully processed, advance `lastCheckpoint` atomically.
6. **Heartbeat**: writes timestamp to `/tmp/indexer-heartbeat` for health monitoring.

#### §10.2 — Findings

- **S-Indexer-NoUniqueConstraint (P2).** `parseTreasuryFees` dedup is `findFirst` + `create` — non-atomic. A race condition (two indexer instances, or restart-mid-batch) can create duplicate `ProtocolFeeLedger` rows. Today the indexer is single-instance per ECS task definition (`infra/indexer-task-definition.json`) so the race is bounded — but ECS scaling or accidental dual-deploy would surface it. **Recommended fix:** add a Prisma `@@unique([txDigest, feeAsset])` to `ProtocolFeeLedger` so dedup is structural. Single migration.

- **S-Indexer-FallbackTreasuryAddr (P2).** `apps/server/src/indexer/indexer.ts:10–11`:
  ```ts
  const T2000_OVERLAY_FEE_WALLET = process.env.T2000_OVERLAY_FEE_WALLET
    ?? '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a';
  ```
  Hardcoded fallback to the production treasury wallet. If the env is unset OR misconfigured (whitespace, wrong case), the indexer silently uses the hardcoded value. Today this matches the SDK constant (intentional), but the dual-source-of-truth pattern is exactly what `engineering-principles.mdc` Principle 2 forbids ("If data exists in one place, import it"). **Recommended fix:** import `T2000_OVERLAY_FEE_WALLET` from `@t2000/sdk` (single source of truth) + remove the fallback + boot-fail if env unset. Catches the env-misconfig class explicitly. Cross-ref §8.7 server-side env-gate work.

- **S-Indexer-EnvDirectReads (P2 — same as §3.4 / §8.7).** `process.env.SUI_RPC_URL`, `process.env.INDEXER_POLL_INTERVAL_MS`, `process.env.INDEXER_BATCH_SIZE` all read directly. Apps/server hasn't adopted `lib/env.ts` per `env-validation-gate.mdc`. Phase N owner: cascade env-gate to apps/server.

- **S-Indexer-RpcTrust (P2).** Indexer trusts whichever Sui RPC node `SUI_RPC_URL` points at. Default = Mysten official (`getJsonRpcFullnodeUrl('mainnet')`) — strong trust. But the env can override to ANY RPC. **Recommended fix:**
  1. Phase N — pin to Mysten official AND/OR BlockVision (audric's read path canonical) with a hard allow-list in code; reject `SUI_RPC_URL` values outside the list.
  2. Phase N+1 — add cross-validation: query 2 RPCs for the same checkpoint, alert on divergence.

  Risk if compromised RPC: the indexer might miss real fee transfers (revenue under-reported) or see fabricated transfers (revenue over-reported). The on-chain Sui consensus prevents OUTRIGHT FABRICATION (a malicious RPC can't invent a checkpoint), but it CAN omit real transactions or lie about which transactions are in a checkpoint until the indexer cross-verifies.

- **S-Indexer-NoSignedFeeRows (P2).** `ProtocolFeeLedger` rows are written to NeonDB without any cryptographic signature — they're trusted because the indexer wrote them. **Anyone with NeonDB write access can plant fake rows OR delete real ones.** Cross-ref §6.2 (no row-level security). The on-chain transactions themselves remain immutable on Sui mainnet, but the LEDGER (which downstream dashboards + creator-payout flows rely on per `audric-build-tracker.md` S.43) is not on-chain. **Recommended fix (Phase N):**
  - Add an HMAC over each row's `(txDigest, feeAsset, feeAmount, feeRate, agentAddress)` using a server-only `INDEXER_SIGNING_KEY` (separate from `T2000_INTERNAL_KEY`). Rows with invalid HMAC are flagged for manual review; downstream consumers (`/api/stats/aggregateFees`) verify HMAC before trusting.
  - This makes ledger tamper detectable without preventing legitimate writes.
  - Cost: one new env var, one HMAC-compute on write, one HMAC-verify on read. Negligible.

- **S-Indexer-CheckpointReplayProtection (P3).** Cursor is committed AFTER batch processing. If the indexer crashes mid-batch (after writing some rows but before cursor commit), on restart it re-processes the batch. Without unique constraints (S-Indexer-NoUniqueConstraint), this creates duplicate rows. **Phase 1 of indexer hardening:** ship the unique constraint. **Phase 2:** make batch processing transactional (cursor + rows in single Prisma `$transaction`).

- **S-Indexer-IndexerCursor-NoBackup (P2).** If `IndexerCursor` is wiped (operator error, restored old backup, NeonDB instance loss), the cursor regenerates at `getLatestCheckpoint(client)` (line 41) — the indexer SKIPS everything between the backup and now. Revenue silently lost. **Recommended fix:** Phase N — establish a runbook for recovery from cursor loss + maintain a daily snapshot of the cursor in a separate persistence layer (e.g. Vercel Blob, S3). On cursor loss, restore from snapshot; then index forward.

- **S-Indexer-SilentSkip-Catch (P2).** Lines 98–102 + 124–126 catch errors and silently `continue` ("FK constraint or transient DB error — skip"). Real errors (constraint violations, type coercions, network blips) are swallowed without observability. Phase N: emit an indexer-error metric (Vercel observability or its server-side equivalent for ECS) and route to a dashboard. Today's silent skip pattern means an indexer that's failing 80% of writes for a real bug looks "healthy" until revenue-accounting checks catch the discrepancy days later.

- **S-Indexer-NoCrossValidation (P3).** No reconciliation flow today: "expected fee = actual ledger" check. Phase N: ship a daily reconciliation cron that:
  1. Re-queries Sui RPC for the previous-day's checkpoints.
  2. Re-parses fees independently.
  3. Compares against `ProtocolFeeLedger` rows for the same window.
  4. Alerts on divergence.

- **S-Indexer-AgentTable-OnlyKnownAgents (P3 — observation).** `getKnownAgents()` filters `parseTransfers` to only known agent addresses. New users register via the audric UI → `Agent` row. If a user makes a save / swap / etc. BEFORE the agent registration completes, the indexer skips their `Transaction` row. (Not the fee row — fees are checked separately against `T2000_OVERLAY_FEE_WALLET`, not the user's address.) Bounded UX nuisance. Documented; not a finding.

- **S-Indexer-Heartbeat-LocalFile (P3).** Heartbeat is `/tmp/indexer-heartbeat`. If the indexer crashes, the heartbeat file stops updating. Whoever monitors the indexer needs to read this file periodically. ECS task health checks could leverage it. Phase N: confirm the ECS task definition reads heartbeat into a HEALTHCHECK (or migrate to a TCP health endpoint).

#### §10.3 — Cross-references for §10

- §3 — gateway-side `MppPayment` is a SEPARATE ledger; not poisoned by §10's `ProtocolFeeLedger` issues.
- §4 — `/api/internal/payments` is the audric-side payment-link write path; doesn't intersect indexer.
- §6 — DB-level integrity (NeonDB RLS, backup access) protects ledger rows.
- §8 — operational ownership of `T2000_OVERLAY_FEE_WALLET` env var rotation.
- `t2000/CLAUDE.md` Critical Rule #9 — "fees are an Audric concern, not a t2000 concern" — establishes the trust model.
- `audric-build-tracker.md` S.43 — original `addFeeTransfer` migration that produced this ledger flow.
- Part 2 findings: S-Indexer-NoUniqueConstraint (P2), S-Indexer-FallbackTreasuryAddr (P2), S-Indexer-EnvDirectReads (P2), S-Indexer-RpcTrust (P2), S-Indexer-NoSignedFeeRows (P2), S-Indexer-CheckpointReplayProtection (P3), S-Indexer-IndexerCursor-NoBackup (P2), S-Indexer-SilentSkip-Catch (P2), S-Indexer-NoCrossValidation (P3), S-Indexer-AgentTable-OnlyKnownAgents (P3-observation), S-Indexer-Heartbeat-LocalFile (P3).

---

## Part 2 — Findings

> Drafted post Part 1 §1–§10. **~117 findings total** across 4 severity tiers. Full SPEC 29 finding shape (What / Why / Pn-because / Evidence / Fix / Owner) for **all P0 + P1 findings** (the founder-decision-density tier). P2 + P3 findings use a condensed table format pointing back to the originating Part 1 section, since each was already justified there with evidence + fix recommendation.

### P0 — Critical (4 findings — fix immediately, Phase 1)

#### S-IDOR (P0) — Address-based IDOR via unverified JWT + unbound `address` parameter

**What.** Audric API routes accept an `address` (in body, query, or `x-sui-address` header) without binding it to the authenticated user's identity, AND `decodeJwt` (`apps/web/lib/auth.ts`) returns the JWT payload without verifying the JWT signature. An attacker with their own valid Google OAuth JWT can substitute any victim's `suiAddress` into the request and bypass per-route authorization.

**Why it matters.** End-to-end exploitation across read + write paths for any user with an account. Reporter PoC + §5.2 worked exploit confirm:
- Read paths leak portfolio / chat history / advice logs.
- Write paths cancel/delete victim's payment links + invoices, create fraudulent invoices on victim's account, accumulate fake AdviceLog rows, etc.

**P0 because:** confirmed external-reporter exploit, write-path realized in §5.2 worked example, takeover-scope for any registered user, no compensating control beyond the not-yet-shipped Phase 1A patch. Reaches every PII surface the audric web app touches.

**Evidence.**
- `apps/web/lib/auth.ts decodeJwt` — base64-decode without `crypto.subtle.verify` or `jose.jwtVerify`.
- `apps/web/middleware.ts` — middleware does not enforce auth (§1.3).
- §0.4 inventory matrix — 12 routes IDOR-vulnerable (writes), 4 IDOR-vulnerable (reads).
- §5.2 worked exploit — `PATCH /api/payments/<victim-slug>` cancels victim's payment link with attacker's JWT + victim's address.

**Recommended fix.** Phase 1A structural fix: (1) replace `decodeJwt` with `jose.jwtVerify` against Google JWKS, (2) middleware-level binding of `x-sui-address` to JWT-derived address, (3) per-route `assertOwns(authUser, resource)` for resource-keyed routes. Per §0.4.4 design.

**Owner.** Phase 1A — this audit (implementation-allowed lane).

---

#### S-Middleware-NoAuth (P0) — Audric middleware enforces no auth gate

**What.** `apps/web/middleware.ts` only stamps `X-App-Version` + rewrites panel paths. Does not verify JWTs, does not enforce auth, does not validate `Origin`, does not check rate limits. Every API route is responsible for its own auth, leading to the IDOR class.

**Why it matters.** Structural cause of S-IDOR. Even after Phase 1A's per-route fix, NEW routes that forget `validateJwt` / `assertOwns` will leak. A centralized middleware gate makes "default-deny" the structural posture rather than per-route discipline.

**P0 because:** root cause of S-IDOR. Without the middleware fix, every future route is a potential IDOR re-introduction.

**Evidence.** `apps/web/middleware.ts:37–65` (full handler).

**Recommended fix.** Phase 1A Step 2 (per §0.4.4): refactor middleware to (a) verify JWT for every `/api/**` except an explicit allow-list (`/api/payments/[slug]` GET, `/api/transactions/execute`, `/api/internal/*`, `/api/cron/*`, `/api/build-id`, `/api/services` catalog, `/api/reputation`), (b) attach `req.authUser` for downstream route consumption, (c) reject mismatched `x-sui-address` header values with 403.

**Owner.** Phase 1A — this audit.

---

#### S-Prepare-BalanceLeak (P0) — `transactions/prepare` server-side balance check leaks any user's balance

**What.** `apps/web/app/api/transactions/prepare/route.ts validateBalance()` (lines 270–322) fetches the requested address's wallet portfolio for ANY tx-prepare request. Even though the write itself is bounded by Enoki's JWT-sender check (per §2.6 verification task), error responses expose precise per-token balances ("Insufficient USDC balance: you have 12.3456 but requested 1000000").

**Why it matters.** Balance enumeration is a pre-cursor to social engineering, recipient-targeting, and KYC-style identity inference. An attacker iterates over candidate addresses + amounts to map balances precisely.

**P0 because:** unauthenticated read-side leak of arbitrary addresses' precise balances. Even though it's "less catastrophic" than the write-IDOR, the read leak is unmitigated today by Enoki's check (Enoki only protects write).

**Evidence.** `apps/web/app/api/transactions/prepare/route.ts:270–322` (`validateBalance`) + line 374 (`rateLimit` keyed on address) + line 367 (address from body).

**Recommended fix.** Phase 1A binding: rate-limit and balance-check use the JWT-derived address, not the body address. Mismatched body-address → 403 BEFORE balance check fires.

**Owner.** Phase 1A — closed transitively by S-IDOR fix.

---

#### S-Enoki-JwtSenderBinding-Verify (P0 — verification task, not bug-of-record)

**What.** §2 audit ASSUMES Enoki's `transaction-blocks/sponsor` endpoint enforces JWT-derived-address ↔ `sender` binding when `zklogin-jwt` header is set. If Enoki does NOT enforce this, the write-side IDOR is unbounded today and Phase 1A's middleware-binding becomes the SOLE defense (rather than defense-in-depth).

**Why it matters.** Confirms whether the audric-side write-IDOR has a backup defender (Enoki) or not.

**P0 because:** if the assumption is wrong, every audric-write-IDOR is currently fully exploitable.

**Evidence.** `apps/web/app/api/transactions/prepare/route.ts:654–656` forwards JWT to Enoki. No client-side audit confirms Enoki enforces the binding.

**Recommended fix.** Phase 1A pre-commit smoke: craft a request with a valid JWT for address-A but `sender: address-B`, post to Enoki sponsor, confirm 4xx with `code: 'jwt_error'`. If Enoki accepts it, escalate Phase 1A urgency + reach out to Mysten for confirmation.

**Owner.** Phase 1A — pre-commit verification.

---

### P1 — High (15 findings — Phase 1B + Phase N priority)

Each of these warrants its own focused-fix or design discussion. Condensed format:

#### S-CodeQL-Errors (P1) — 3 audric `error`-severity CodeQL alerts (#5, #7, #8)

**What.** GitHub Code Scanning reports 3 alerts with `error` severity in audric: alert #5 (`js/clear-text-storage-of-sensitive-data` on `lib/zklogin.ts:46+205`); alerts #7 and #8 (`js/bad-code-sanitization`, likely `markdown-it` rendering paths).

**Why it matters.** Default `error` severity in CodeQL = pushes are blocked once branch protection enforces "no error alerts." Today they're untracked.

**Recommended fix.** Phase 1B triage: alert #5 → dismiss-with-justification (structural to zkLogin per §2.1 S-zkLogin-LocalStorage); alerts #7 + #8 → fix the `markdown-it` sanitization OR dismiss if attacker-influence is bounded.

**Owner.** Phase 1B (parallel-ok with Phase 1A).

---

#### S-zkLogin-XSS-Window (P1) — 7-day XSS-to-write window

**What.** A future XSS bug exfiltrating localStorage gives attacker ~7d (`maxEpoch + 7`) of unrestricted write capability. No transaction-level user re-prompt for high-value writes.

**Why it matters.** Largest blast-radius single-bug class for non-IDOR scenarios. Phase 1A doesn't close this — XSS gives attacker a full session, not just an IDOR.

**Recommended fix.** Phase N — investigate "high-value writes (> $X) require fresh OAuth" gate, OR shorten `maxEpoch` to + 1 (24h).

**Owner.** Phase N (cross-cuts UX + signing surface).

---

#### S-Prepare-RateLimitDoS (P1) — Per-address rate limit DoS

**What.** `rateLimit('tx:${address}')` keyed on body address (not JWT-derived). Attacker can lock victim out at 10 reqs/min by spamming with their own JWT but victim's address.

**Recommended fix.** Phase 1A — rate-limit on JWT-derived address.

**Owner.** Phase 1A (closed transitively by S-IDOR fix).

---

#### S-Gateway-PaymentsList-Public (P1) — `/api/mpp/payments` exposes all sender wallets + digests

**What.** `apps/gateway/app/api/mpp/payments/route.ts` returns full payment records (sender, digest, amount, service) with no auth. Search params enable targeted enumeration.

**Recommended fix.** Phase N — gate behind admin auth OR redact `sender` to truncated form OR remove the endpoint and surface only via authenticated dashboard.

**Owner.** Phase N (gateway hardening SPEC).

---

#### S-Internal-NamingDrift (P1) — `T2000_INTERNAL_KEY` (audric) vs `AUDRIC_INTERNAL_KEY` (t2000 ECS)

**What.** Same trust path read with different env-var names. Rotation requires updating both manually; no automated check.

**Recommended fix.** Phase N — rename one side OR add a t2000-ECS startup smoke check that POSTs `/api/internal/health` to audric and fails-fast on key mismatch.

**Owner.** Phase N (server env-gate SPEC).

---

#### S-Privacy-NoGDPRDelete (P1) — No `/api/user/delete-account`

**What.** GDPR Art. 17 + CCPA §1798.105 mandate the right-to-delete. Audric has no such endpoint.

**Recommended fix.** Phase N — add `DELETE /api/user/me` with cascade across all 13 PII tables + 24h grace period + email confirmation.

**Owner.** Phase N (privacy SPEC).

---

#### S-Privacy-NoDataExport (P1) — No `GET /api/user/me/export`

**What.** GDPR Art. 20 + CCPA §1798.110 mandate the right-to-data-portability.

**Recommended fix.** Phase N — add `GET /api/user/me/export` streaming all user records as JSON.

**Owner.** Phase N (privacy SPEC).

---

#### S-Op-2FA-Matrix-NotDocumented (P1) — No 2FA audit trail

**What.** No documented 2FA matrix per platform (Vercel / GitHub / npm / AWS / NeonDB / Upstash / Anthropic / OpenAI / ElevenLabs / BlockVision / Mysten / Cloudflare / Resend / 40+ vendor accounts).

**Recommended fix.** Phase N — single-sitting audit + enable 2FA where missing + document recovery codes off-cloud.

**Owner.** Phase N (operational SPEC).

---

#### S-Op-AudricParentNftKey-Custody (P1) — SuiNS parent NFT private key stored as Vercel env var

**What.** `AUDRIC_PARENT_NFT_PRIVATE_KEY` controls leaf-mint under `audric.sui` SuiNS parent. Stored as a regular Vercel env var (not Sensitive — per §8.1 source comment to allow build-time validation). High-value asset; trade-off documented.

**Recommended fix.** Phase N — investigate HSM-style storage (e.g. AWS KMS) with on-demand decrypt; separate from env-var path.

**Owner.** Phase N (operational SPEC).

---

#### S-Op-EnokiKey-Custody (P1) — Enoki sponsor key custody

**What.** `ENOKI_SECRET_KEY` compromise = drain gas budget + sponsor arbitrary tx for any wallet (bounded by Enoki's MoveCallTargets allow-list IF that's tightly configured — TBC).

**Recommended fix.** Phase N — confirm Enoki account 2FA + tighten Enoki's per-app allow-lists + rotate ENOKI_SECRET_KEY quarterly.

**Owner.** Phase N (operational SPEC).

---

#### S-Op-NoSecretRotationRunbook (P1) — No rotation runbook for any secret

**What.** Each secret rotation today is operator-improv. No checklist for "where the secret is referenced" + "what redeploys depend on it" + "how to validate post-rotation."

**Recommended fix.** Phase N — `RUNBOOK_secret_rotation_<NAME>.md` per secret family, prioritizing the high-value 4 (parent-NFT key, Enoki, T2000_INTERNAL_KEY, DATABASE_URL).

**Owner.** Phase N (operational SPEC).

---

#### S-Op-NoIncidentRunbook (P1) — No incident-response runbook

**What.** No documented IR process. The IDOR-reporter incident exposed this — no runbook for triage + scope + hot-patch + reporter-comms + public-advisory + post-mortem.

**Recommended fix.** Phase N — `docs/security/RUNBOOK_incident_response.md` + adopt SPEC 30 Part 5 phase plan as the template for "this is how we run a security incident from now on."

**Owner.** Phase N (operational SPEC) — but the work in this SPEC 30 already documents the example case.

---

### P2 — Medium (~55 findings — Phase 2..N implementation SPECs)

Tabular format: see Part 1 cross-references. Each finding's full justification + fix lives in its originating §.

| ID | Origin | One-line | Phase / Owner |
|---|---|---|---|
| S-Page-Auth-Implicit | §1.1 | Page-level auth relies on per-route discipline | Phase 1A transitive |
| S-CSP-UnsafeInline | §1.2 | CSP `'unsafe-inline'` + `'unsafe-eval'` lower XSS bar | Phase N |
| S-Vercel-WAF | §1.4 | No Vercel project-level WAF rules | Phase N (D-5) |
| S-AdminKey-Logged (TBC) | §1.5 | Confirm `T2000_INTERNAL_KEY` not logged | Phase N audit |
| S-zkLogin-LocalStorage | §2.1 | `lgtm[]`-suppressed CodeQL #5; structural to zkLogin | Phase 1B (dismiss) |
| S-Callback-NoCsrfNonceCheck | §2.2 | OAuth `state` param unverified; nonce-bound by zkLogin | Doc only |
| S-Prepare-LogPII | §2.3 | Address logging in Vercel Logs (30d retention) | Phase N (PII redaction) |
| S-Enoki-SecretKey-NoRotation | §2.6 | No documented rotation policy for Enoki key | Phase N (cross-ref S-Op-EnokiKey-Custody) |
| S-Enoki-Caps-TBC | §2.7 | Confirm Enoki sponsor caps configured | Phase N |
| S-CodeQL-Warnings | §0.2 | 12 P2-tier CodeQL warnings across both repos | Phase N (CodeQL triage SPEC) |
| S-Gateway-Middleware-InMemoryRateLimit | §3.2 | In-process rate limit map (per-Vercel-instance) | Phase N (Upstash migration) |
| S-Gateway-EnvDirectReads | §3.4 | Gateway has no `lib/env.ts` Zod gate | Phase N |
| S-Gateway-VendorKey-Mixing | §3.4 | Per-vendor keys not boot-validated | Phase N |
| S-Gateway-LogPII-VendorBodies (TBC) | §3.4 | Confirm vendor responses don't echo PII to logs | Phase N audit |
| S-Gateway-MppxLibraryTrust | §3.5 | `mppx` supply-chain trust | Phase N (cross-ref §7) |
| S-Internal-NoConstantTimeCompare | §4.1 | `!==` timing-attackable for `T2000_INTERNAL_KEY` | Phase N (1-line fix) |
| S-Internal-NoReplayProtection | §4.1 | Captured request can be replayed | Phase N (HMAC over body+ts) |
| S-Cron-NoConstantTimeCompare | §4.3 | Same as above for `Bearer ${CRON_SECRET}` | Phase N |
| S-Internal-Idempotency-AuditTBC | §4.4 | 6 of 11 internal routes need idempotency confirmation | Phase N |
| S-Internal-NoBodyValidation (TBC) | §4.5 | Confirm Zod body schema everywhere | Phase N audit |
| S-Verify-SenderName-Stored-Unsafe (TBC) | §5.4 | `senderName` stored unsanitized; React escapes by default | Phase N audit |
| S-DB-NoRowLevelSecurity | §6.2 | Code-side filters are sole defense | Phase N (Prisma middleware OR PG RLS) |
| S-Privacy-Retention-ConversationLog | §6.4 | Full chat transcripts retained forever | Phase N (cleanup cron) |
| S-Privacy-Retention-AdviceLog | §6.4 | Same; align with 30d hydration window | Phase N |
| S-Telemetry-AnthropicDataPolicy | §6.5 | Confirm Anthropic API non-training; sign DPA at scale | Phase N |
| S-Telemetry-VercelLogs-PIIRedaction | §6.5 | Address logging cleartext in Vercel Logs | Phase N (PII-redact helper) |
| S-Deps-MysenZkLogin-PreV1 | §7.2 | `@mysten/zklogin ^0.8.1` is pre-1.0 | Phase N (pin exact, watch upstream) |
| S-Deps-PatchedNaviLending | §7.3 | Local patch on `@naviprotocol/lending` | Phase N (audit + deprecate dep) |
| S-Deps-ZodMajorDrift | §7.4 | Zod 3 (audric) vs Zod 4 (t2000 root) | Phase N (align) |
| S-Deps-MppxTrust | §7.5 | `mppx` supply chain (cross-ref S-Gateway-Mppx) | Phase N (pin + 2FA on publish) |
| S-Deps-SuimppMpp-Trust | §7.5 | `@suimpp/mpp` supply chain | Phase N |
| S-Deps-T2000-Engine-SDK-Trust | §7.5 | `@t2000/engine` + `@t2000/sdk` supply chain | Phase N |
| S-Deps-NoBaseline | §7.7 | No `pnpm audit` baseline | Phase 1B can run + capture |
| S-Deps-NoAutoUpdates | §7.8 | No Dependabot / Renovate | Phase N |
| S-Op-PreCommitSecretScan | §8.4 | No gitleaks pre-commit hook | Phase N (small) |
| S-Op-GitHubSecretScanning-StatusTBC | §8.4 | Confirm push-protection on private repos | Phase N |
| S-Op-FoundeRPersonalAccount-Risk | §8.5 | Vendor accounts likely tied to founder personal email | Phase N (org migration where supported) |
| S-Op-AgentShellMcp-Surface | §8.6 | Cursor/Claude Code shell + MCP injection vector | Phase N (allow-list audit) |
| S-Op-ServerEnvGate-Missing | §8.7 | apps/server + apps/gateway have no `lib/env.ts` | Phase N |
| S-Engine-AutoExecute-TrustModel | §9.2 | Auto-execute under threshold = small blast radius if compromised | Phase N (≥7d account-age gate) |
| S-Engine-Memory-Poisoning | §9.3 V1 | UserMemory rows written by LLM are trusted as factual | Phase N (memory-type allow-list + confidence cap) |
| S-Engine-ChatHistory-CrossSession | §9.3 V3 | Cross-session content via `<memory_context>` | Phase N (session-quarantine consideration) |
| S-Engine-Preflight-CoverageTBC | §9.4 | Confirm all 12 write tools have preflight | Phase 1B (small audit) |
| S-Engine-AdviceLog-Privacy | §9.6 | Cross-ref §6.4 retention | Phase N |
| S-Indexer-NoUniqueConstraint | §10.2 | `findFirst + create` race; should be `@@unique` | Phase N (small migration) |
| S-Indexer-FallbackTreasuryAddr | §10.2 | Hardcoded fallback to treasury wallet | Phase N (remove fallback) |
| S-Indexer-EnvDirectReads | §10.2 | Same as §3.4 / §8.7 | Phase N |
| S-Indexer-RpcTrust | §10.2 | Trusts `SUI_RPC_URL` configurable env | Phase N (allow-list + cross-validate) |
| S-Indexer-NoSignedFeeRows | §10.2 | Ledger rows unsigned; NeonDB compromise = ledger compromise | Phase N (HMAC) |
| S-Indexer-IndexerCursor-NoBackup | §10.2 | Cursor wipe = revenue silently lost | Phase N (snapshot to Blob/S3) |
| S-Indexer-SilentSkip-Catch | §10.2 | Silent error swallow → undetected indexer failures | Phase N (metric) |

---

### P3 — Low (~45 findings — defer / observe / by-design)

Tabular format: see Part 1 cross-references. Group includes "by-design," "informational," and "future-aware" findings.

| ID | Origin | One-line |
|---|---|---|
| S-Treasury-Stale | §0.3 | Confirm zero call sites of stale `t2000::treasury::collect_fee` |
| S-Profile-Disclosure | §1.1 | `/[username]` profile is public-by-design |
| S-CSP-ImgWildcard | §1.2 | `img-src https:` wildcard |
| S-CSP-DataMedia | §1.2 | `media-src data:` widened for MPP audio |
| S-CSP-FrameAncestors | §1.2 | `frame-ancestors 'none'` not set |
| S-CSP-ObjectSrc | §1.2 | `object-src 'none'` not set |
| S-CSP-UpgradeInsecure | §1.2 | `upgrade-insecure-requests` not set |
| S-COOP-COEP | §1.2 | Cross-origin isolation headers not set |
| S-WellKnown-Missing | §1.4 | No `/.well-known/security.txt` |
| S-AdminKey-CookieSetUnchecked | §1.5 | Cookie set before key-match check |
| S-AdminKey-NoRotation | §1.5 | `T2000_INTERNAL_KEY` shared with admin dashboard |
| S-Sitemap-Missing | §1.6 | `/sitemap.xml` 404s |
| S-zkLogin-MaxEpoch-7Days | §2.1 | 7-day session window — Mysten upper bound |
| S-zkLogin-NoTokenRotation | §2.1 | JWT not rotated within session — closes via `jose.jwtVerify` + `exp` |
| S-Execute-NoJwt-AcceptableByDesign | §2.4 | Sig-gated, not JWT-gated |
| S-Execute-DigestPrefixCollision | §2.4 | 16-char digest prefix sufficient |
| S-Enoki-Sponsor-MoveCallAllowList | §2.6 | Already mitigated |
| S-Enoki-DryRunFailureModes | §2.6 | Already mitigated |
| S-Gateway-Middleware-IPFallback | §3.2 | Confirm Vercel strips inbound `x-forwarded-for` |
| S-Gateway-Middleware-NoBypassFor402 | §3.2 | Anonymous probe logging waste |
| S-Gateway-Stats-NoLimit | §3.3 | `findMany` no limit; degrades at scale |
| S-Gateway-DigestStoreUpstash-NoBackup | §3.5 | Replay-protection backup policy |
| S-Gateway-Receipt-NoFreshness | §3.5 | Receipts have no `notAfter` |
| S-Cron-OptionalEnv-FailureMode | §4.3 | `CRON_SECRET` optional — safe-fail |
| S-Cron-PathDiscoverability | §4.3 | Cron paths probable; bounded by Bearer |
| S-Internal-NoRateLimit-AcceptableByDesign | §4.6 | Internal routes don't rate-limit (correct) |
| S-Slug-Entropy-Sufficient | §5.3 | Informational |
| S-Slug-ModuloBias | §5.3 | Trivial bias; switch to nanoid |
| S-Slug-NoUniqueRetry (TBC) | §5.3 | Confirm unique constraint + collision retry |
| S-PaymentLink-PrivateRoute | §5.3 | Slug = access token by design |
| S-Verify-NoOwnerCheck | §5.4 | By design (on-chain proof is the binding) |
| S-Verify-RateLimit-PerSlug | §5.4 | Per-slug rate limit; per-IP would be belt+suspenders |
| S-Invoice-Email-NotShipped | §5.5 | No email-injection surface today |
| S-Profile-Disclosure-EnumerableHandles | §5.6 | Confirm no `suiAddress` leak in profile metadata |
| S-DB-Backup-AccessTBC | §6.2 | Neon backup access policy |
| S-Privacy-NoConsentLogging | §6.3 | `tosVersion` field not tracked |
| S-Privacy-NoCookieConsent | §6.3 | Likely exempt; confirm with legal pre-EU |
| S-Privacy-Retention-UserMemory-Optional | §6.4 | `expiresAt` should default not-null |
| S-Privacy-Retention-AppEvent | §6.4 | Cleanup cron after 90d |
| S-Telemetry-VercelOnly | §6.5 | Net positive privacy (no third-party trackers) |
| S-Deps-Overrides-Working | §7.2 | Sui pinning enforced |
| S-Deps-Overrides-PythPin | §7.2 | Document why exact-pin |
| S-Engine-PermissionConfig-PerSession | §9.2 | Confirm no agent-driven preset shifts |
| S-Engine-Borrow-AlwaysConfirm-LoadBearing | §9.2 | Add regression test asserting `autoBelow: 0` |
| S-Engine-FinancialContext-SnapshotDrift | §9.3 V2 | Cross-validate BlockVision vs Sui RPC |
| S-Engine-BlockVision-MetadataInjection | §9.3 V4 | Confirm token metadata doesn't reach LLM as text |
| S-Engine-Suins-HandleMetadata | §9.3 V5 | Future-aware: sanitize when richer SuiNS metadata becomes input |
| S-Engine-ResultBudget-CoverageTBC | §9.5 | Confirm `maxResultSizeChars` set everywhere |
| S-Engine-AdviceLog-Tamper | §9.6 | Phase 1A binding closes the IDOR variant |
| S-Indexer-CheckpointReplayProtection | §10.2 | Phase 2 — transactional batch processing |
| S-Indexer-NoCrossValidation | §10.2 | Daily reconciliation cron |
| S-Indexer-AgentTable-OnlyKnownAgents | §10.2 | Bounded UX nuisance |
| S-Indexer-Heartbeat-LocalFile | §10.2 | Confirm ECS HEALTHCHECK leverages it |

---

## Part 3 — D-questions

> 14 founder-decision-points surfaced by Part 1 + Part 2. **ALL LOCKED (or DEFERRED) 2026-05-14 ~14:20 AEST during v1.0 collaborative lock session.** D-1 + D-2 + D-3 + D-4 pre-locked during Phase 1A design. D-5 + D-6 + D-8 + D-10 + D-11 + D-12 + D-13 + D-14 collaboratively locked. **D-7 (2FA enforcement matrix) and D-9 (indexer integrity) DEFERRED** to separate workstreams — D-7 is operational paperwork (revisit when scaling past one dev); D-9 folds into a holistic indexer + stats review (separate spec, not piecemeal).

### Pre-locked

#### ~~D-1 PRE-LOCKED 2026-05-14 ~12:15 AEST~~ — Auth model
**Locked.** **`jose.jwtVerify` + Google JWKS, no session table.** Reasoning: zkLogin's trust model already binds JWT → Sui address deterministically; a session table adds a write path + storage cost without strengthening the trust model (the JWT IS the session, expires at `maxEpoch` = ~7d). `jose` is already a dep (per §7.1) — zero install cost. Phase 1A implements this.

#### ~~D-2 PRE-LOCKED 2026-05-14 ~12:15 AEST~~ — IDOR fix shape
**Locked.** **BOTH (defense in depth).** Middleware does the structural binding for `/api/**` routes; per-route `assertOwns(authUser, resource)` for resource-keyed routes (e.g. `/api/engine/sessions/[id]` where session-id is the resource). Phase 1A §0.4.4 design.

#### ~~D-3 PRE-LOCKED 2026-05-14 ~10:05 AEST~~ — LinkedWallet read-through
**Locked.** **Phase 1A binds strictly to `jwtPayloadToSuiAddress(verifiedPayload)`. No LinkedWallet read-through.** Confirmed via grep: `LinkedWallet` is read/written ONLY by `/api/user/wallets/*` (the wallet-management surface) — no read endpoint today does "show data for this LinkedWallet even though the request is from the primary's JWT." The IDOR fix doesn't need a LinkedWallet allow-list because nothing currently consumes one. If a future product surface wants read-through (e.g. "view my hardware wallet's portfolio inside Audric without it logging in") that becomes Phase 1C with its own threat model (LinkedWallet add/remove must require the linked address's signature, not just the primary's; otherwise an attacker who hijacks the primary's JWT can also plant linked addresses to exfil read data — same IDOR class re-emerging in a new shape). Until that demand surfaces, **JWT-derived address only**.

#### ~~D-4 PRE-LOCKED 2026-05-14 ~09:25 AEST~~ — Bug-bounty program
**Locked.** **No formal bug-bounty program; case-by-case at most.** No payout for this report; offer recognition (security advisory credit + release-notes acknowledgment) instead. Future formal program deferred — re-evaluate post-1k DAU OR post-Audric-Store launch (Phase 5 in the roadmap), whichever comes first.

### Locked at v1.0 collaborative session 2026-05-14 ~14:20 AEST

#### ~~D-5 LOCKED 2026-05-14 ~14:20 AEST~~ ✅ SHIPPED audric `c10ddba` 2026-05-14 ~14:42 AEST — Public scan endpoint posture (cross-ref §1.4)
**Question.** Vercel WAF rules / honeypot / 404 / ignore for the daily scan attempts (`/api/v2/config`, `/.env`, etc.)?

**Locked.** **Ship `/.well-known/security.txt` (RFC 9116) only. Defer WAF rules + honeypot.**

**Implementation:** `audric/apps/web/public/.well-known/security.txt` — 10-line RFC 9116 file, served at `https://audric.ai/.well-known/security.txt` by Next.js public-dir static handler. Declares `Contact: mailto:security@t2000.ai` + GitHub Security Advisory URL + 1-year `Expires` + `Policy: https://audric.ai/security`.

**Reasoning:**
- `security.txt` is a 10-line text file at `apps/web/public/.well-known/security.txt` declaring disclosure email + ack window. Closes S-WellKnown-Missing structurally. Would have shaved 3 days off the current IDOR reporter's email-routing latency.
- Vercel WAF rules require Pro tier — current scan volume doesn't justify the upgrade. Re-evaluate when traffic patterns warrant.
- Honeypot is operational drag with no payoff at our scale.
- GitHub Code Scanning is a static-analysis tool; doesn't see runtime bot traffic. Not applicable here.

**Considerations (preserved for re-evaluation context).**
- **Ignore (current).** Vercel returns 404; no signal collected. Cheap; no actionable telemetry.
- **Vercel WAF rules.** Block known-bad UA strings + path patterns. Cost: low; defense in depth. **Deferred.**
- **Honeypot.** Return fake-looking responses to scan paths to identify scanners + report to abuse contacts. **Out of scope.**
- **`security.txt`.** Surface `/.well-known/security.txt` (RFC 9116) so legitimate researchers find disclosure path easily. **LOCKED.**

#### ~~D-6 LOCKED 2026-05-14 ~14:20 AEST~~ — Secret-scanning enforcement (cross-ref §8.4)
**Question.** Pre-commit hook (gitleaks) only / CI scan only / GitHub native push-protection only / all three?

**Locked.** **Enable GitHub-native Secret Scanning + Push Protection on both `mission69b/audric` and `mission69b/t2000`. Skip pre-commit gitleaks + CI gitleaks entirely.**

**Reasoning:**
- Both repos are PUBLIC, which means GitHub Secret Scanning + Push Protection are FREE (these are paid GHAS features only on private repos).
- GitHub-native scans ~200 known secret patterns server-side at push time; covers full git history. Pre-commit hooks run client-side and are `--no-verify`-bypassable.
- Push Protection blocks the push at the wire if a known-pattern secret is detected. Bypass requires explicit confirmation in GitHub UI (audited).
- Dependabot version updates already configured via `.github/dependabot.yml` on both repos (weekly minor + patch grouped); the separate "Dependabot security updates" toggle stays OFF — weekly cadence already picks up patch-level CVEs. Re-evaluate only if a critical CVE bites between weekly cycles.
- Zero new local tooling. Zero new CI overhead. Zero new vendor.

**Considerations (preserved for re-evaluation context).**
- **Pre-commit only.** Catches at commit time. Bypassable by `--no-verify`. **Skipped.**
- **CI only.** Catches at PR time. Visible signal but key already pushed. **Skipped.**
- **GitHub native push-protection.** Catches at push time. **LOCKED — free for public repos (both audric + t2000 are public).**

#### ~~D-7 DEFERRED 2026-05-14 ~14:18 AEST~~ — 2FA enforcement matrix (cross-ref §8.2)
**Question.** Which platforms get hard-required 2FA (Yubikey-only, no SMS) vs allow-TOTP, vs allow-SMS?

**Deferred.** Operational paperwork at one-dev scale. Founder discipline + intermittent self-audit covers the high-blast-radius surfaces (Vercel deploy, GitHub admin, npm publish, AWS root, NeonDB, Enoki sponsor, DNS, parent-NFT key) for now. **Revisit when:** (a) team grows past one engineer, OR (b) a 2FA-related incident happens, OR (c) Audric Store onboards creators who hold revenue keys. Until then, no formal matrix in this SPEC.

**Recommendation kept on file (not locked):** Yubikey-required for production-secret-holders, TOTP for vendor accounts, no SMS for production. Apply when revisited.

#### ~~D-8 LOCKED 2026-05-14 ~14:20 AEST~~ — Engine prompt-injection bound (cross-ref §9.3)
**Question.** What's the trust model for `UserMemory` + `<financial_context>` content flowing into LLM system prompt? Quarantine / sanitize / accept-bounded-blast-radius?

**Locked.** **Stay with bounded blast radius (current posture). Pair with D-13 ≥7d account-age gate as defense in depth. Do NOT add an LLM safety classifier.**

**Reasoning:**
- Existing per-write USD-aware permission gates already cap damage (small writes auto-execute, big writes require tap-to-confirm via Passport). A real prompt-injection attack would need to: (a) get the LLM to issue a write, (b) keep it under the auto-tier USD cap, (c) target an attacker-controlled address — but the address binding shipped in Phase 1A means the address has to be the user's own. Attack surface is narrow.
- A safety classifier per turn is +1 LLM call (~$0.005) × every turn × every user — adds up fast for marginal gain.
- Quarantine (rebuild memory from raw chat each session) destroys the persistent-memory feature that's part of the Silent Profile system.
- D-13's ≥7d account-age gate further narrows the auto-execute attack window.
- **Revisit if** a real prompt-injection incident happens.

**Considerations (preserved).**
- **Quarantine.** Don't include LLM-extracted UserMemory; rebuild from raw chat each session. Loses persistent memory benefit. **Skipped.**
- **Sanitize.** Apply a safety classifier on memories before inclusion. Cost: per-turn LLM call. **Skipped — too expensive for marginal value today.**
- **Bounded blast radius (current).** Trust extracted memories; rely on per-write USD-aware permission gates to cap damage. **LOCKED.**

#### ~~D-9 DEFERRED 2026-05-14 ~14:18 AEST~~ — Indexer integrity (cross-ref §10.2 S-Indexer-NoSignedFeeRows)
**Question.** Sign `ProtocolFeeLedger` rows with HMAC, OR move ledger to on-chain Move event log, OR accept tamper-detectable-via-cross-validation only?

**Deferred.** Indexer + stats consolidation reviewed as a separate workstream — not piecemeal inside SPEC 30. The indexer surface (`apps/server/src/indexer/`) has 9 findings catalogued in §10.2 (S-Indexer-NoUniqueConstraint, S-Indexer-NoSignedFeeRows, S-Indexer-NoCrossValidation, S-Indexer-EnvDirectReads, S-Indexer-RpcTrust, S-Indexer-CheckpointReplayProtection, S-Indexer-IndexerCursor-NoBackup, S-Indexer-SilentSkip-Catch, S-Indexer-AgentTable-OnlyKnownAgents) plus revenue-accounting + stats + dashboards questions that compound. **Reactivation criteria:** founder triages the indexer + stats consolidation as a standalone spec post-SPEC-30 v1.0 lock. **Until reactivated:** today's indexer keeps writing rows; trust model is "single ECS instance + sole NeonDB admin" (the founder).

**Recommendation kept on file (not locked):** Add Prisma `@@unique([txDigest, feeAsset])` constraint as the lean P2 fix; defer HMAC + cross-validation cron until revenue volume warrants. Apply when indexer + stats spec lands.

#### ~~D-10 LOCKED 2026-05-14 ~14:20 AEST~~ ✅ SHIPPED audric `c10ddba` 2026-05-14 ~14:42 AEST — Public payment-link `/pay/[slug]` abuse posture (cross-ref §5.4)
**Question.** Per-IP rate limit on top of per-slug? CAPTCHA? Abuse-detection threshold for invoice-creation?

**Locked.** **Add per-IP rate limit on `/api/payments` POST. Defer CAPTCHA until first abuse incident.**

**Implementation:** `audric/apps/web/app/api/payments/route.ts` POST — added `rateLimit(\`pay:ip:${ip}\`, 10, 3_600_000)` after auth, before per-address limit. IP extracted from `x-forwarded-for[0]` (Vercel-canonical). Mirrors the IP-extraction pattern already used in `/api/voice/transcribe`. Sliding-window helper from `lib/rate-limit.ts` (already exhaustively unit-tested). 2913/2913 audric tests pass.

**Reasoning:**
- Slug-iteration on the verify side is mathematically bounded (2300 years per §5.3 entropy). Real risk = invoice-creation spam (someone scripting 1000 fake invoices in your name).
- Per-IP rate limit on POST closes the realistic vector. One config var, no UX cost.
- CAPTCHA adds friction the day-1 user doesn't deserve. Premature.
- **Reasonable starting limit:** 10 invoices / hr / IP. Tune from telemetry once shipped.

**Considerations (preserved).**
- Today: per-slug verify-route rate limit; per-address create rate limit.
- An attacker iterating slugs (low-bit) already takes 2300 years per §5.3.
- Bigger concern: invoice-creation spam (S-Verify-RateLimit-PerSlug + S-Slug-Entropy-Sufficient combined).

#### ~~D-11 LOCKED 2026-05-14 ~14:20 AEST~~ — Telemetry posture (cross-ref §6.5)
**Question.** Stay Vercel-only / add Sentry (server-side errors only) / add PostHog (product analytics with PII redaction) / add both?

**Locked.** **Stay Vercel-only. Defer Sentry + PostHog.**

**Reasoning:**
- Vercel logs cover server errors. The empirical question is *"when did Vercel logs last fail at triaging an incident?"* — if the answer is *"they haven't,"* don't add a vendor.
- Sentry adds: vendor cost + DPA + PII-redaction discipline (regex maintenance burden + every new field is a new redaction question). PostHog is heavier still.
- Net positive privacy posture (zero third-party tracking) is part of the Audric trust pitch.
- **Revisit Sentry only when** Vercel-log-based triage actually breaks on a real incident.

**Considerations (preserved).**
- **Vercel-only (current).** Net positive privacy. No third-party tracking. **LOCKED.**
- **Sentry server-side.** Better incident triage for 5xx classes. Cost: + 1 vendor + DPA + PII-redaction discipline. **Deferred.**
- **PostHog.** Product analytics. Higher privacy cost. **Deferred.**

#### ~~D-12 LOCKED 2026-05-14 ~14:20 AEST~~ ✅ SHIPPED audric `6fde2fa` 2026-05-14 ~15:33 AEST — Retention TTL targets (cross-ref §6.4)
**Question.** ConversationLog: 365d / 180d / user-controlled? AdviceLog: 30d (match hydration) / 90d (match TurnMetrics) / 365d? UserMemory: enforce default `expiresAt`?

**Locked.**
- **`ConversationLog`: 365d default + per-user "delete history older than X days" setting** (Privacy pillar).
- **`AdviceLog`: 90d** (matches `TurnMetrics`; one cron handles both).
- **`UserMemory`: enforce default 365d `expiresAt`**, explicit no-expiry only when `confidence > 0.9` (high-conviction extracted facts).

**Implementation:**
- EDIT `/api/cron/turn-metrics-cleanup` — also prunes `AdviceLog` at the same 90d TTL. Returns both counts.
- NEW `/api/cron/conversation-log-retention` (daily 03:30 UTC) — deletes `ConversationLog` rows older than 365d.
- NEW `/api/cron/user-memory-retention` (daily 03:45 UTC) — hard-deletes `UserMemory` rows where `expiresAt < now()`.
- EDIT `memory-extraction` + `chain-memory` write paths — enforce 365d default `expiresAt` when not set AND `confidence ≤ 0.9`. High-confidence extracts (>0.9) leave `expiresAt` null.
- `vercel.json` — 2 new daily cron schedules.
- 2950/2950 audric tests pass (was 2936; +14 cron tests).
- **Per-user retention toggle DEFERRED to D-12.5** — UI + UserPreferences.limits override layer in later without changing this cron's shape.

**Reasoning:**
- 365d is short enough to honor privacy minimization, long enough that Audric "remembers" you.
- User-controllable delete adds the trust beat without operational complexity.
- AdviceLog 90d simplifies cron logic (one TTL covers both AdviceLog and TurnMetrics).
- UserMemory default expiry prevents unbounded growth; high-confidence override preserves load-bearing facts.

**Considerations (preserved).**
- Privacy minimization argues short.
- Audit / debugging argues long (e.g. founder traces a bug in a turn from 6 months ago).
- User trust argues user-controllable (Audric Privacy = user-first).

#### ~~D-13 LOCKED 2026-05-14 ~14:20 AEST~~ ✅ SHIPPED audric `0dc050b` 2026-05-14 ~15:04 AEST — Engine auto-execute hardening (cross-ref §9.2)
**Question.** Add account-age gate (≥7d before auto-execute kicks in)? Per-tool override (`pay_api` always auto, `swap_execute` always confirm)? Adopt sliding-window limits?

**Locked.** **Account-age gate: ≥7d before any auto-tier write fires. Defer per-tool overrides + sliding-window limits.**

**Implementation (Option B — host-side, no engine version bump):**
- NEW `audric/apps/web/lib/engine/account-age-gate.ts` — pure function `applyAccountAgeGate(config, ageDays)` clones the user's `UserPermissionConfig` with every `autoBelow` (per-rule + global) zeroed when `ageDays < 7`. After Day 7 (or `null`/legacy fail-open) returns config unchanged. 20 unit tests cover the primitive + integration with `resolvePermissionTier`.
- `engine-factory.ts` (server leg): query `User.createdAt` alongside existing User select, compute `accountAgeDays`, apply gate to `permissionConfig` before passing to engine. Engine's `resolvePermissionTier` consumes gated config unchanged.
- `/api/user/preferences` GET: returns `accountAgeDays` so client can mirror the gate.
- `dashboard-content.tsx` (client leg): applies `applyAccountAgeGate` to preset config, passes gated config to `<UnifiedTimeline>` AND the `pay_api` regenerate path. **Both server + client legs MUST be in lockstep — without the client leg, server-side gate is bypassable via `shouldClientAutoApprove` auto-resolve.**
- 2936/2936 audric tests pass (was 2913; added 20 gate tests + 3 preferences-route tests).
- Why Option B (host-only) instead of Option A (engine canonical): zero version bump / cross-repo coordination cost. Engine canonicalization is the right move when a 2nd host (CLI/MCP) needs the same gate — `engineering-principles.mdc` "factor when LOGIC duplicates, not when SHAPE does."

**Reasoning:**
- Closes the takeover-while-onboarding window (attacker compromises a Day-1 account and silently drains via $5 auto-swaps).
- Cost to legitimate users: ~7 days of taps-to-confirm for sub-$5 actions, then auto kicks in. Fair trade for "your wallet can't be drained while you're learning."
- Pairs with D-8 bounded-blast-radius for prompt-injection defense in depth.
- Per-tool overrides add cognitive complexity for small wins — defer until evidence calls.
- Sliding-window adds runtime state to permission resolver — defer until justified by data.

**Considerations (preserved).**
- Account-age gate prevents takeover-while-onboarding.
- Per-tool overrides increase cognitive complexity but tighten specific paths.
- Sliding-window adds runtime state to permission resolver.

#### ~~D-14 LOCKED 2026-05-14 ~14:20 AEST~~ — Server env-gate cascade ownership (cross-ref §3.4 / §4.2 / §8.7)
**Question.** Who owns the migration of `apps/server` + `apps/gateway` to `lib/env.ts`? Single SPEC vs per-app SPEC?

**Locked.** **Single SPEC `S+1: cross-app-env-gate` covering both apps in one pass.** Reuse audric's Zod template (~375 lines, well-documented per S.20 incident). ~½ day per app, ~1 day total.

**Reasoning:**
- The pattern is identical; doing them together avoids context-switching cost.
- The audric template is the canonical reference; copy-and-adapt is faster than green-fielding the second app.
- One SPEC, one PR, one ship.

**Considerations (preserved).**
- Per-app SPECs add coordination overhead for what's mechanically the same migration twice.
- Single SPEC keeps the canonical-template pattern visible across both apps.

---

## Part 4 — Deferred content (placeholder if needed)

> Reserved for any D-question that depends on data we don't have yet (e.g. Vercel WAF telemetry, `pnpm audit` baseline, 2FA-status spreadsheet). Same shape as SPEC 29 Section 4 deferral.

---

## Part 5 — Phases + Acceptance Gates (TBD)

> Phases ordered by dependency + risk priority. Provisional Phase 1 scope skeleton:

### Phase 1 — Hot-patch IDOR class (implementation-allowed)

**Goal.** Close the address-binding IDOR class structurally. Reply to the external reporter within 24h with status. Land structural fix in audric main + Vercel deploy.

**Owner.** This audit Phase 1.

**Findings closed.** S-IDOR (P0).

**Scope (provisional — founder confirms before implementation):**
1. **Inventory all 60+ `app/api/**/route.ts` paths in audric** — for each: does it accept an `address` from query/body? Does it bind that to the authenticated user's `suiAddress`? Build a coverage matrix.
2. **Adopt JWT signature verification.** Replace hand-rolled `decodeJwt` (no signature check) with `jose` + Google JWKS. The library exists; the migration is mostly a server-side import + signature-verify call. Boundary: client-side decode (for non-security-decision rendering) can stay base64-only.
3. **Centralize the auth-binding in middleware** — extend `apps/web/middleware.ts` (currently only stamps `X-App-Version` + rewrites panel paths) with a JWT-verify + address-binding gate for every `/api/**` route except the explicit allow-list (`/api/internal/*` uses `x-internal-key`; `/api/payments/[slug]` is intentionally public for payment-link flow; `/api/build-id` is public; etc.).
4. **Per-route binding** — for routes the middleware can't generically gate (e.g. `/api/engine/sessions/[id]` where the session id is the resource and the address is the owner — middleware can't read the session in time), each route adds an explicit `assertOwns(authUser, resource)` check.
5. **Test coverage** — every `address`-keyed route gets an integration test asserting (a) anonymous → 401, (b) auth user A asking for address B → 403, (c) auth user A asking for own address → 200.
6. **Reply to reporter** with patch summary + timeline + bug-bounty disposition (D-4 lock blocks the latter).

**Effort.** ~2–4d depending on how deep the per-route binding has to go (Step 4 is the long pole; Step 3 middleware migration is ~½d). Hot-patch can ship in 24–36h if scoped to just the 4 known-exploited routes (`/api/portfolio`, `/api/user/status`, `/api/engine/sessions/[id]`, `/api/transactions/prepare`) with full inventory landing in Phase 1B.

**Acceptance gate G30-1.**
- All `address`-keyed routes verified or explicitly allow-listed.
- Anonymous PoC against `/api/portfolio?address=<victim>` returns 401.
- Cross-user PoC (auth user A → victim address) returns 403 on read + write paths.
- Reporter acknowledged + given fix-shipped notification.
- Regression tests added; CI green.

### Phase 1B — Triage 3 audric error-severity CodeQL alerts (implementation-allowed)

**Goal.** Read each of audric `error`-severity CodeQL alerts (#5, #7, #8) end-to-end. For each: ship a fix OR dismiss-with-justification. These piggyback on Phase 1 because the auth refactor may resolve some of them (e.g. #5 `js/clear-text-storage-of-sensitive-data` may be a JWT in localStorage finding that's structurally inherent to zkLogin and warrants explicit dismissal with the reasoning documented).

**Owner.** This audit Phase 1B (parallel-ok with Phase 1A).

**Findings closed.** S-CodeQL-Errors (P1).

**Scope.**
1. Read alert #5 (`js/clear-text-storage-of-sensitive-data`, 2026-04-03) — locate the sink + source path; decide fix vs. dismiss-with-reason.
2. Read alerts #7 + #8 (`js/bad-code-sanitization`, 2026-04-20) — typically broken HTML/XSS sanitizer; locate the sink + source path; ship a sanitizer fix or dismiss if attacker-influence is bounded.
3. For each, GitHub UI dismissal MUST cite the reasoning + link to this spec's Phase 1B section.

**Effort.** ~½–1d.

**Acceptance gate G30-1B.**
- 3 alerts state = `fixed` or `dismissed-with-justification`.
- Each dismissal links to a documented reasoning in this spec.

### Phase 1C — Reporter follow-up + post-mortem (post Phase 1A ship)

**Goal.** Close the loop with the external IDOR reporter; publish a public-facing security advisory; run an internal post-mortem.

**Owner.** This audit Phase 1C.

**Findings closed.** (Process — no S-finding directly closes here, but it operationalizes S-Op-NoIncidentRunbook P1.)

**Scope.**
1. Send patch-shipped notification to the reporter referencing this SPEC + G30-1 acceptance.
2. Publish security advisory (`audric/.cursor/rules/...` OR `docs/security/advisories/2026-05-IDOR.md` OR public on-chain via on-chain announcement) — content scoped to: vulnerability class, affected window, fix shipped, no observed exploitation OR observed-and-mitigated-by-X, recognition for the reporter (per D-4 lock).
3. Run a 1h post-mortem internally documenting: how the bug was introduced (likely the gradual evolution from per-route auth → mixed pattern), why it wasn't caught earlier (no centralized middleware gate; no IDOR-class regression test), what process/tooling change prevents recurrence (per D-2 lock + middleware gate now structural).
4. Codify the post-mortem template into `docs/security/RUNBOOK_incident_response.md` (closes S-Op-NoIncidentRunbook).

**Effort.** ~½ day.

**Acceptance gate G30-1C.**
- Reporter notified + acknowledged.
- Public advisory published (form per founder choice in D-5 review).
- Post-mortem written + RUNBOOK seeded.

---

### Phase 2 — Cross-app env-gate + naming drift (P1 + P2 batch)

**Goal.** Close S-Internal-NamingDrift (P1) + S-Op-ServerEnvGate-Missing (P2) + S-Gateway-EnvDirectReads (P2) + S-Indexer-EnvDirectReads (P2) in a single coordinated SPEC. Eliminate the env-misconfig class of silent-degradation bugs across the t2000 monorepo.

**Owner.** Phase 2 SPEC (numbered post-30 by founder).

**Findings closed.** S-Internal-NamingDrift (P1) + 3 P2 + S-Cron-OptionalEnv-FailureMode (P3).

**Scope.**
1. Cascade `audric/apps/web/lib/env.ts` template to `apps/server/src/env.ts` + `apps/gateway/lib/env.ts`. Schema specifies all required + optional vars per app. Boot-fail on misconfig.
2. Resolve naming drift per D-2 / Phase 2 D-question: pick canonical `T2000_AUDRIC_INTERNAL_KEY` (or similar) + add aliases for backward compat during a 1-week migration window.
3. Add ESLint rule `no-restricted-syntax` blocking `process.env.X` outside the env modules in apps/server + apps/gateway (mirror audric).
4. Optional: add t2000-ECS startup smoke check that POSTs to audric `/api/internal/health` (new endpoint) at boot to fail-fast on naming-drift class.

**Effort.** ~1 day.

**Acceptance gate G30-2.**
- All 3 apps pass `lib/env.ts` boot validation.
- ESLint blocks raw `process.env.X` reads in app code.
- Cron + internal-API trust path verified end-to-end with single canonical name.

---

### Phase 3 — Privacy SPEC (P1 + P2 batch)

**Goal.** Close GDPR/CCPA gaps + PII retention + log redaction. The "ship before next 100 users" tier.

**Owner.** Phase 3 SPEC.

**Findings closed.** S-Privacy-NoGDPRDelete (P1) + S-Privacy-NoDataExport (P1) + S-Privacy-Retention-ConversationLog (P2) + S-Privacy-Retention-AdviceLog (P2) + S-Privacy-Retention-UserMemory-Optional (P3) + S-Privacy-Retention-AppEvent (P3) + S-Telemetry-AnthropicDataPolicy (P2) + S-Telemetry-VercelLogs-PIIRedaction (P2) + S-Privacy-NoConsentLogging (P3) + S-DB-NoRowLevelSecurity (P2).

**Scope.**
1. **Delete-my-account** (`DELETE /api/user/me`) with cascade across all 13 PII tables + 24h grace + email confirmation. Per D-13 default UX.
2. **Data export** (`GET /api/user/me/export`) streaming JSON of all user records.
3. **Retention TTLs** per D-12 lock: ConversationLog 365d (cron), AdviceLog 90d (cron), UserMemory default `expiresAt` 365d, AppEvent 90d.
4. **PII-log redaction helper** (`redactAddress` / `redactDigest` / `redactSlug`) applied across all `console.log` paths in audric/web + apps/server + apps/gateway.
5. **Anthropic DPA** sign for production + document data path in `apps/web/app/(legal)/privacy/page.tsx`.
6. **Prisma middleware** OR **PostgreSQL RLS** binding for user-scoped tables per D-21 (sub-decision in this SPEC).
7. **`tosVersion` field** on `User` + log per acceptance.

**Effort.** ~3-5d.

**Acceptance gate G30-3.**
- Delete + export endpoints implemented + tested.
- Retention crons live + dashboard shows row-count delta over time.
- ESLint scans all `console.log` for raw addresses + fails CI on misses.
- Anthropic DPA signed + privacy page updated.

---

### Phase 4 — Operational SPEC (P1 + P2 batch)

**Goal.** Close 2FA + rotation + secret-scanning + agent-injection + incident-response gaps.

**Owner.** Phase 4 SPEC.

**Findings closed.** S-Op-2FA-Matrix-NotDocumented (P1) + S-Op-AudricParentNftKey-Custody (P1) + S-Op-EnokiKey-Custody (P1) + S-Op-NoSecretRotationRunbook (P1) + S-Op-PreCommitSecretScan (P2) + S-Op-GitHubSecretScanning-StatusTBC (P2) + S-Op-FoundeRPersonalAccount-Risk (P2) + S-Op-AgentShellMcp-Surface (P2) + S-Op-NoIncidentRunbook (P1 — already in 1C, reinforced here).

**Scope.**
1. Build `docs/security/2fa-matrix.md` (LOCAL-ONLY) per §8.2.
2. Single-sitting 2FA audit + enable-where-missing + recovery-code archive.
3. Secret rotation runbooks per high-value secret (parent-NFT, Enoki, T2000_INTERNAL_KEY, DATABASE_URL, ENOKI_SECRET_KEY, ANTHROPIC_API_KEY, BLOCKVISION_API_KEY).
4. gitleaks pre-commit hook + CI scan.
5. GitHub Advanced Security investigation (cost benefit; founder decides).
6. MCP allow-list audit + agent-shell-injection-defense documented.
7. Investigate HSM/KMS path for `AUDRIC_PARENT_NFT_PRIVATE_KEY` (Phase 4 OR defer to Phase N).

**Effort.** ~2-3d.

**Acceptance gate G30-4.**
- 2FA matrix complete; all platforms green.
- 4+ rotation runbooks shipped.
- gitleaks active in pre-commit + CI.
- IR runbook reviewed + adopted.

---

### Phase 5 — Indexer hardening (P2 batch)

**Goal.** Close indexer integrity gaps (§10).

**Owner.** Phase 5 SPEC.

**Findings closed.** S-Indexer-NoUniqueConstraint (P2) + S-Indexer-FallbackTreasuryAddr (P2) + S-Indexer-RpcTrust (P2) + S-Indexer-NoSignedFeeRows (P2) + S-Indexer-IndexerCursor-NoBackup (P2) + S-Indexer-SilentSkip-Catch (P2) + S-Indexer-CheckpointReplayProtection (P3) + S-Indexer-NoCrossValidation (P3).

**Scope.** Per D-9 lock: HMAC + cross-validation cron. Plus unique constraint, env-gate (transitive Phase 2), RPC allow-list, cursor backup, error metrics, transactional batch processing.

**Effort.** ~2d.

**Acceptance gate G30-5.**
- HMAC validation in stats reads.
- Unique constraint migrated.
- Daily reconciliation cron live.

---

### Phase 6 — Engine prompt-injection hardening (P2 batch)

**Goal.** Close §9 prompt-injection vectors.

**Owner.** Phase 6 SPEC.

**Findings closed.** S-Engine-AutoExecute-TrustModel (P2) + S-Engine-Memory-Poisoning (P2) + S-Engine-ChatHistory-CrossSession (P2) + S-Engine-Preflight-CoverageTBC (P2) + S-Engine-AdviceLog-Privacy (P2 — already covered in Phase 3) + S-Engine-Borrow-AlwaysConfirm-LoadBearing (P3 — regression test) + S-Engine-FinancialContext-SnapshotDrift (P3) + S-Engine-BlockVision-MetadataInjection (P3).

**Scope.** Per D-13 lock: account-age gate. Plus memory-type allow-list, financial-context cross-validation, preflight coverage audit + regression tests.

**Effort.** ~2d.

**Acceptance gate G30-6.**
- Account-age gate live (auto-execute disabled for accounts < 7d).
- Preflight + auto-tier regression tests in CI.

---

### Phase 7 — Dependency hygiene (P2 batch)

**Goal.** Close §7 supply-chain risks.

**Owner.** Phase 7 SPEC.

**Findings closed.** S-Deps-MysenZkLogin-PreV1 (P2) + S-Deps-PatchedNaviLending (P2) + S-Deps-ZodMajorDrift (P2) + S-Deps-MppxTrust (P2) + S-Deps-SuimppMpp-Trust (P2) + S-Deps-T2000-Engine-SDK-Trust (P2) + S-Deps-NoBaseline (P2) + S-Deps-NoAutoUpdates (P2).

**Scope.**
1. `pnpm audit` baseline captured + tracked in CI.
2. Zod alignment to a single major across the monorepo.
3. Pin internal packages (`mppx`, `@suimpp/mpp`, `@t2000/sdk`, `@t2000/engine`) to exact versions in audric/web.
4. Dependabot config + weekly grouped PRs.
5. Audit + deprecate `@naviprotocol/lending` patch.

**Effort.** ~1-2d.

**Acceptance gate G30-7.**
- Baseline JSON checked into both repos.
- Dependabot live.
- Zod aligned.

---

### Phase 8 — Gateway hardening (P1 + P2 batch)

**Goal.** Close §3 gateway-perimeter gaps.

**Owner.** Phase 8 SPEC.

**Findings closed.** S-Gateway-PaymentsList-Public (P1) + S-Gateway-Middleware-InMemoryRateLimit (P2) + S-Gateway-VendorKey-Mixing (P2 — closed by Phase 2 env-gate) + S-Gateway-LogPII-VendorBodies (TBC P2) + S-Gateway-MppxLibraryTrust (P2 — partially closed by Phase 7 pinning) + S-Gateway-DigestStoreUpstash-NoBackup (P3) + S-Gateway-Receipt-NoFreshness (P3).

**Scope.**
1. `/api/mpp/payments` admin gate (cookie auth like `/admin/scaling`) OR redaction.
2. Migrate gateway middleware rate limit to Upstash.
3. Vendor-body log audit + redaction.
4. Upstash digest-store backup runbook.
5. `mppx` Receipt freshness investigation.

**Effort.** ~2d.

**Acceptance gate G30-8.**
- `/api/mpp/payments` gated OR redacted.
- Rate limit shared across Vercel instances via Upstash.

---

### Phase 9 — CSP + WAF + perimeter polish (P3 batch)

**Goal.** Close §1 P3 findings + ship `security.txt`.

**Owner.** Phase 9 SPEC.

**Findings closed.** All §1 P3 findings (CSP nonces, frame-ancestors, object-src, upgrade-insecure-requests, COOP/COEP, well-known/security.txt, Vercel WAF rules, sitemap, admin-key cookie-set order, profile disclosure).

**Scope.** Per D-5 + D-7 locks: ship `security.txt`, tighten CSP with nonces (replace `'unsafe-inline'`), add missing CSP directives, configure Vercel project firewall rules if Pro tier, generate sitemap.xml, fix admin-key cookie-set order.

**Effort.** ~1-2d.

**Acceptance gate G30-9.**
- All P3 §1 findings closed.
- `securityheaders.com` scan returns A+.

---

### Phase 10 — Final sweep + close SPEC 30 at v1.0

**Goal.** Sweep remaining P3 findings, close TBC verification tasks, lock SPEC 30 at v1.0.

**Owner.** Phase 10 (this audit closure).

**Findings closed.** All remaining P3 + TBC findings not closed by Phases 2-9.

**Scope.**
1. Verify each TBC finding (S-AdminKey-Logged, S-Internal-NoBodyValidation, S-Verify-SenderName-Stored-Unsafe, S-Slug-NoUniqueRetry, S-Engine-ResultBudget-CoverageTBC, S-DB-Backup-AccessTBC, S-Engine-Suins-HandleMetadata, S-Engine-PermissionConfig-PerSession, S-Engine-FinancialContext-SnapshotDrift, etc.).
2. For each: ship a fix OR dismiss with documented reasoning.
3. Lock SPEC 30 at v1.0.
4. Update `audric-build-tracker.md` with the closed-spec entry.
5. Decide post-SPEC-30 task order (per founder lock — SPEC 29 reconsideration).

**Effort.** ~1-2d.

**Acceptance gate G30-10 (= G30-FINAL).**
- Every S-finding has a status: `closed` / `dismissed-with-reason` / `deferred-to-N`.
- SPEC 30 v1.0 locked.
- audric-build-tracker entry updated.

---

### Phase summary table

| Phase | Title | Key findings | Effort | Status |
|---|---|---|---|---|
| 1A | IDOR hot-patch | S-IDOR + S-Middleware-NoAuth + S-Prepare-BalanceLeak + S-Enoki-JwtSenderBinding-Verify (P0) + S-Prepare-RateLimitDoS + S-zkLogin-XSS-Window (P1 partial) | ~3-4d | Pending (next-session start) |
| 1B | CodeQL error triage | S-CodeQL-Errors (P1, 3 alerts) | ~½-1d | Pending (parallel-ok) |
| 1C | Reporter follow-up + post-mortem | S-Op-NoIncidentRunbook seed | ~½d | Pending (post 1A) |
| 2 | Cross-app env-gate | S-Internal-NamingDrift (P1) + 3 P2 | ~1d | Pending |
| 3 | Privacy | 4 P1 + 4 P2 + 4 P3 | ~3-5d | Pending |
| 4 | Operational | 4 P1 + 3 P2 | ~2-3d | Pending |
| 5 | Indexer hardening | 6 P2 + 2 P3 | ~2d | Pending |
| 6 | Engine prompt-injection | 4 P2 + 2 P3 | ~2d | Pending |
| 7 | Dependency hygiene | 8 P2 | ~1-2d | Pending |
| 8 | Gateway hardening | 1 P1 + 4 P2 + 2 P3 | ~2d | Pending |
| 9 | CSP + WAF + perimeter polish | ~10 P3 | ~1-2d | Pending |
| 10 | Final sweep + v1.0 lock | All TBC | ~1-2d | Pending |

**Estimated total effort post-Phase-1:** ~17-25d. Phases 2–10 each become their own implementation SPEC at founder triage. Phase numbering above is provisional within SPEC 30; actual SPEC numbering happens at founder lock per the locked sequence (`audric-build-tracker.md` "Forward backlog" table).

---

## Part 6 — Out of scope + cross-references

### Out of scope for SPEC 30

This audit is intentionally bounded. The following are out of scope and tracked in their own dedicated work streams:

- **Move-side audit.** The `t2000::treasury::collect_fee` confirmation in §0.3 is the only Move-side touch in SPEC 30. A full Move audit (covering `payment-kit`, NAVI Move modules audric depends on, custom Move calls in audric's PTBs) is a separate exercise with different tooling (Sui Move Prover, manual Move review by a chain-side specialist). Tracked as future SPEC: "Move-side security audit."
- **Mysten coordination.** S-Enoki-JwtSenderBinding-Verify (P0 verification task) requires a one-off confirmation with Mysten about Enoki's contract — not a structural audit of Enoki itself, which is out of t2000's hands.
- **External penetration test.** SPEC 30 is an internal review. A third-party pen-test (with bounty-hunters / a CREST-certified firm) is recommended after Phase 1A ships and ideally pre-Phase-5-Audric-Store-launch. Out of scope for this SPEC; future SPEC: "Third-party pen-test program."
- **Compliance certification.** SOC 2 / ISO 27001 / PCI scoping. Premature for current scale; revisit at 1k DAU+. Out of scope.
- **Insurance / bug-bounty program.** Per D-4 lock — no formal program; out of scope until product-launch maturity.
- **Performance / DDoS hardening.** Cloudflare WAF + Vercel WAF (D-5) are in scope for SPEC 30 Phase 9 but full DDoS scenario planning + rate-limit-tuning under load is its own concern.
- **Privacy policy + ToS legal review.** SPEC 30 surfaces privacy gaps (§6.3 GDPR delete + data export); the legal language for the privacy policy / ToS is out of scope and requires legal review (founder owns).
- **Sui chain consensus / validator-side trust.** Audric trusts Sui mainnet's consensus; auditing Sui's consensus mechanism is Mysten's domain.
- **The HANDOFF_NEXT_AGENT.md banner's "SPEC 29 stays paused" lock.** SPEC 29 (MPP cross-repo audit) is paused until SPEC 30 closes at v1.0; founder reconsiders the task order then. Don't touch SPEC 29 work until SPEC 30 is locked.

### Cross-references (full list)

**This SPEC ↔ existing work:**
- `[CLAUDE.md](../CLAUDE.md)` — Critical Rule #8 (env-validation-gate.mdc), #9 (fees are Audric-concern; treasury Move contract stale).
- `[HANDOFF_NEXT_AGENT.md](../HANDOFF_NEXT_AGENT.md)` — original 7-area scope sketch + Phase 1A first-action banner.
- `[spec/SPEC_29_MPP_CROSS_REPO_AUDIT.md](SPEC_29_MPP_CROSS_REPO_AUDIT.md)` — SHAPE template; F-13 (audric pre-settle USDC orphan) overlaps with §2 sponsor-tx surface; F-21 (gateway settle-on-success) overlaps with §3 gateway perimeter.
- `[audric-build-tracker.md](../../audric-build-tracker.md)` — S.20 (BlockVision env empty-string incident, source of env-validation-gate rule), S.43 (T2000 OVERLAY FEE WALLET migration, source of indexer integrity flow).
- `[audric-roadmap.md](../../audric-roadmap.md)` — Phase 5 (Audric Store) is the load-bearing dependency for indexer integrity (creator payouts depend on `ProtocolFeeLedger`).

**This SPEC ↔ rules (always-applied):**
- `[t2000/.cursor/rules/agent-harness-spec.mdc](../.cursor/rules/agent-harness-spec.mdc)` — Spec 1 + Spec 2 contract (attemptId, TurnMetrics, EngineConfig.onAutoExecuted) for §9.
- `[t2000/.cursor/rules/financial-amounts.mdc](../.cursor/rules/financial-amounts.mdc)` — floor display rule; cross-cuts §5 + §10.
- `[t2000/.cursor/rules/safeguards-defense-in-depth.mdc](../.cursor/rules/safeguards-defense-in-depth.mdc)` — engine guards + permission resolver for §9.
- `[t2000/.cursor/rules/goal-driven-execution.mdc](../.cursor/rules/goal-driven-execution.mdc)` — discipline cross-cuts every phase.
- `[t2000/.cursor/rules/savings-usdc-only.mdc](../.cursor/rules/savings-usdc-only.mdc)` — engine save constraint for §9.
- `[t2000/.cursor/rules/engineering-principles.mdc](../.cursor/rules/engineering-principles.mdc)` — Principle 2 (single source of truth) cross-cuts §10 hardcoded-fallback finding.
- `[t2000/.cursor/rules/env-validation-gate.mdc](../.cursor/rules/env-validation-gate.mdc)` — canonical Zod-gate template for §3.4 / §4.2 / §8.7 / §10.2 findings.
- `[t2000/.cursor/rules/single-source-of-truth.mdc](../.cursor/rules/single-source-of-truth.mdc)` — canonical fetcher pattern (cross-cuts §6 PII inventory + §10 indexer trust).
- `[t2000/.cursor/rules/coding-discipline.mdc](../.cursor/rules/coding-discipline.mdc)` — surgical changes; cross-cuts every Phase 2..N implementation.

**This SPEC ↔ rules (audric-side, request-on-demand):**
- `[audric/.cursor/rules/zklogin-passport-flow.mdc](../../audric/.cursor/rules/zklogin-passport-flow.mdc)` — zkLogin trust model + ephemeral key handling for §2.
- `[audric/.cursor/rules/audric-transaction-flow.mdc](../../audric/.cursor/rules/audric-transaction-flow.mdc)` — sponsor flow + `allowedAddresses` rule for §2.
- `[audric/.cursor/rules/audric-canonical-portfolio.mdc](../../audric/.cursor/rules/audric-canonical-portfolio.mdc)` — `getPortfolio` canonical for §2.3 balance-leak path + §6 row-level security.
- `[audric/.cursor/rules/audric-canonical-write.mdc](../../audric/.cursor/rules/audric-canonical-write.mdc)` — write-side canonical for §2.
- `[audric/.cursor/rules/cron-job-architecture.mdc](../../audric/.cursor/rules/cron-job-architecture.mdc)` + `[t2000/.cursor/rules/cron-job-architecture.mdc](../.cursor/rules/cron-job-architecture.mdc)` — internal-API + cron contract for §4.
- `[audric/.cursor/rules/prisma-models-overview.mdc](../../audric/.cursor/rules/prisma-models-overview.mdc)` — PII inventory by model for §6.
- `[audric/.cursor/rules/external-call-retries.mdc](../../audric/.cursor/rules/external-call-retries.mdc)` — retry semantics for §4.
- `[audric/.cursor/rules/blockvision-resilience.mdc](../../audric/.cursor/rules/blockvision-resilience.mdc)` — BlockVision read path resilience for §9.

**External reference dashboards:**
- GitHub Code Scanning dashboards: `https://github.com/mission69b/t2000/security/code-scanning` + `https://github.com/mission69b/audric/security/code-scanning`.
- GitHub Security tab: `https://github.com/mission69b/audric/security` + `https://github.com/mission69b/t2000/security`.
- Vercel project security headers test: `https://securityheaders.com/?q=audric.ai`.
- CSP analyzer: `https://csp-evaluator.withgoogle.com/?csp=https://audric.ai`.
- Mozilla Observatory: `https://observatory.mozilla.org/analyze/audric.ai`.

### v0.2 lock checklist

- [x] Part 1 §0 (scope) drafted (v0.1)
- [x] Part 1 §1–§10 audit drafted (v0.2 — this revision)
- [x] Part 2 findings drafted with severity tags (~117 total: 4 P0, 12 P1, ~55 P2, ~45 P3)
- [x] Part 3 D-questions drafted (12 total: 4 pre-locked, 8 awaiting founder lock at v0.2 review)
- [x] Part 5 phase plan drafted (10 phases: 1A/1B/1C/2/3/4/5/6/7/8/9/10)
- [x] Part 6 out-of-scope + cross-refs drafted
- [ ] Founder reviews v0.2; locks/iterates on D-questions; signs off
- [ ] Update HANDOFF_NEXT_AGENT.md to reflect v0.2 SCOPE-LOCKED state
- [ ] audric-build-tracker.md SPEC 30 entry updated
- [ ] Lock at v0.2 by updating Status block

**End of SPEC 30 v0.2 (DRAFT). Awaiting founder review for v0.2 lock + D-question collaborative locks.**
