# Security Founder Checklist (post-SPEC-30)

> Tasks the founder has to do personally — they can't be shipped from
> code. Pair with `t2000/spec/SPEC_30_CROSS_REPO_SECURITY_REVIEW.md`
> (CLOSED at v1.2 on 2026-05-14).
>
> Status: tick boxes as completed. Re-read every 6 months.

---

## 1. Anthropic Data Processing Agreement (DPA)

**Why.** Anthropic processes user prompts, outputs, and tool inputs on
our behalf. A signed DPA is the standard cover for processor
relationships under GDPR / CCPA / PIPEDA. Even pre-launch, signing
early is free and prevents a bottleneck the day the first EU user
asks "where is my data going."

**Steps.**

- [ ] Log in to <https://console.anthropic.com>.
- [ ] Navigate to **Settings → Legal → Data Processing Agreement**.
      (May be under **Settings → Compliance** depending on plan tier.)
- [ ] Sign the DPA. Standard terms — no negotiation needed at our scale.
- [ ] Save the countersigned PDF to a private location (1Password / Vault).
- [ ] Note the date in `audric-build-tracker.md` under
      "Compliance posture".

**Time.** 5–15 minutes.

---

## 2. 2FA matrix verification

**Why.** Single-engineer ops. The blast radius of one credential leak
is the entire stack. 2FA is the single highest-leverage defense and
costs nothing to maintain after the initial 30 minutes.

**Steps.** For each row, confirm 2FA is **enabled with a hardware key
or an authenticator app** (NOT SMS). Record the date.

| Account | Tier | 2FA enabled? | Method | Date checked |
|---|---|---|---|---|
| **Google** (audric.ai admin) | Critical | ☐ | | |
| **Google** (founder personal — owns Vercel/GitHub) | Critical | ☐ | | |
| **Vercel** (deploy keys to prod) | Critical | ☐ | | |
| **GitHub** (commits + releases) | Critical | ☐ | | |
| **npm** (publish access) | Critical | ☐ | | |
| **Anthropic Console** | High | ☐ | | |
| **BlockVision** | High | ☐ | | |
| **Cloudflare** (DNS, if used) | High | ☐ | | |
| **Vercel Postgres / Neon** | High | ☐ | | |
| **Upstash** | High | ☐ | | |
| **Discord** (alerts webhooks live here) | Medium | ☐ | | |
| **Resend / email provider** | Medium | ☐ | | |
| **Domain registrar** | Critical | ☐ | | |

**For each Critical-tier account also do:**
- [ ] Verify the recovery codes are printed and stored in a fire-safe
      location (NOT in 1Password — single point of failure).
- [ ] Confirm the recovery email is one you control AND has 2FA itself.
- [ ] Verify there are no orphan API tokens with admin scope (rotate
      anything older than 6 months).

**Time.** 30–60 minutes one-time, ~5 minutes every 6-month re-check.

---

## 3. Re-check cadence

Schedule a recurring calendar event titled **"Security checklist re-read"**
every 6 months. The event triggers:

- Re-read this file.
- Re-tick the 2FA matrix dates.
- Skim `audric/apps/web/RUNBOOK_incident_response.md` to keep it
  muscle-memory.
- Run `pnpm audit --prod --audit-level=high` against both repos and
  triage anything new (this surfaces above the
  `--audit-level=critical` CI gate baseline).
- Run a smoke matrix against prod (the 5-test matrix from the
  SPEC 30 Phase 1A response — see incident timeline in the audric
  post-mortem for the canonical commands).

---

## 4. When to revisit upgrade paths

These tasks are deferred today but should re-trigger when their
trigger condition fires:

| Item | Trigger | Then do |
|---|---|---|
| Tighten `pnpm audit` CI gate from `critical` → `high` | When `@naviprotocol/lending` is dropped (it's deprecated per CLAUDE.md) | Update both `security.yml` workflows |
| Drop `@naviprotocol/lending` | When all NAVI calls go through MCP for reads + thin tx builders for writes | Remove from `packages/sdk/package.json` deps |
| Implement `delete-my-account` + `export-my-data` | First user request (or first formal GDPR request) | SPEC 32 — privacy-delete-export |
| Tighten CSP from `'unsafe-inline'` to nonces | ~2 weeks before a real launch / traffic ramp | SPEC 36 — csp-perimeter-polish |
| Migrate Vercel rate limit to Upstash | Past ~1k DAU on `mpp.t2000.ai` | SPEC 35 — gateway-hardening |
| HSM/KMS for parent NFT signing key | When parent NFT becomes part of live signing flow (Audric Store launch) | SPEC 33 — ops-2fa-runbooks (or a new SPEC) |

---

## 5. What's already done (don't redo)

For reference — these are SHIPPED, do not re-implement:

- ✅ zkLogin signature verification on every API route (SPEC 30 Phase 1A.5/1A.6)
- ✅ JWT-expiry auto-logout (SPEC 30 Phase 1A.7)
- ✅ CDN cache `private` on auth-gated routes (SPEC 30 Phase 1A.8)
- ✅ Engine write-tool preflight 100% coverage (SPEC 30 follow-up — 2026-05-14)
- ✅ PII redaction module + applied at hottest call sites (SPEC 30 follow-up)
- ✅ `pnpm audit --audit-level=critical` CI gate, both repos (SPEC 30 follow-up)
- ✅ CodeQL on every push, both repos (Phase 1B)
- ✅ Dependabot, both repos (D-6 lock)
- ✅ Public security advisory + post-mortem + incident response runbook (Phase 1C)
- ✅ `security.txt` published on `audric.ai` (D-5)
- ✅ Env validation gate (Zod schema + boot-time fail-fast) on `audric/apps/web` and `t2000-gateway` (D-14)
- ✅ Account-age gate (≥7d) before auto-execute (D-13)
