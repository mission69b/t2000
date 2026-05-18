# SPEC 25 — MPP Single-Source-of-Truth (Root-Cause Refactor)

> **Status: ⏸ DEFERRED 2026-05-12 ~08:00 AEST by founder.** SPEC 25 was scoped + locked v0.2 in the same morning session that closed SPEC 24 audit fix; founder caught the scope drift ("we havent even finished spec 23 and we are talking about spec 25") and parked the spec to refocus on the actual unfinished commitments: SPEC 23B remaining items (N3/N4/N5 + HealthSummary + StakingCard polish + B-MPP5 + B-MPP6) → SPEC 23C → SPEC 24 founder smoke + SPEC 24 F5 (deferred-but-still-owned-by-SPEC-24) → SPEC 11.
>
> **Reactivation criteria.** SPEC 25 only earns un-park if **at least one** of:
> 1. A new MPP drift incident actually fires in production (not a future risk — a real bug)
> 2. SPEC 23 + SPEC 11 + SPEC 11.5 all close and there's slack
> 3. Founder explicitly elects to ship the `record_capability_gap` demand-signal capture standalone for product-roadmap data
>
> The L1 fix from SPEC 24 (audric prompt port at `093ad63` + 12-assertion test pin) is the current line of defense. It works. It's pinned. No production incidents. The 8-place drift class SPEC 25 was designed to eliminate is a future risk, not a present bug. **Spec content below is preserved verbatim** — D-question locks, phase plan, all of it — for the day this is picked up. Don't re-litigate the design when reactivating; just execute it.
>
> ---
>
> **Original v0.2 status (preserved for posterity, no longer driving):** v0.2 LOCKED 2026-05-12 ~07:35 AEST. All 11 D-questions resolved (4 founder-locked: D-4 required, D-5 weekly Mondays 09:00 UTC, D-6 new #capability-gaps channel, D-11 sweep legacy UI catalog too; 7 default-confirmed to recommendations).
>
> **Local-only, gitignored** — same convention as SPEC 23 series, SPEC 24, AUDRIC_HARNESS_*_SPEC, audric-roadmap, audric-build-tracker.
>
> **Predecessor:** SPEC 24 (closed 2026-05-12 with engine `1.29.1` + audric `093ad63`). SPEC 24 fixed the symptoms — wrong vendor list in audric's prompt — by porting engine 1.29.1's MPP block into `apps/web/lib/engine/engine-context.ts` and pinning it with a 12-assertion test. SPEC 25 fixes the **root cause** SPEC 24 surfaced: Audric's MPP integration has no engine-enforced single source of truth for what's supported, so the supported-vendor set lives in (and can drift across) eight different places.
>
> **Trigger:** SPEC 24 audit hit drift between engine 1.29.1's `DEFAULT_SYSTEM_PROMPT` and audric's `STATIC_SYSTEM_PROMPT` — the engine prompt rewrite was dead-on-arrival because audric overrides it. This was the second drift incident in the SPEC 23B → SPEC 24 arc (the first: the audric `MPP_SERVICE_RENDERERS` registry carried 7 dead vendor entries because nothing kept it in sync with the locked supported set). Both incidents have the same root cause.
>
> **Founder framing 2026-05-12 ~07:18 AEST:** *"And this is the best way to handle services it cant use? […] I thought a part of our coding disciplines and engineering principle we should be building the best solutions and solving issues at root for scale?"*
>
> SPEC 25 is the answer.

---

## 1. Background

### 1.1 The drift surface SPEC 24 left behind

After SPEC 24 closed, the locked 5-service supported set (`openai`, `elevenlabs`, `pdfshift`, `lob`, `resend`) is documented in **eight different places**, every one of which can drift independently:

| # | Location | What it carries |
|---|---|---|
| 1 | `packages/engine/src/prompt/index.ts` `DEFAULT_SYSTEM_PROMPT` | 5-service table + intent map + costs |
| 2 | `apps/web/lib/engine/engine-context.ts` `STATIC_SYSTEM_PROMPT` | Same table, hand-ported from #1 |
| 3 | `apps/web/lib/engine/engine-factory.ts` `buildUnauthPrompt` | Vendor list in one paragraph |
| 4 | `packages/engine/src/tools/pay.ts` `description` | Service list in tool description |
| 5 | `packages/engine/src/tools/pay.ts` `SERVICE_PRICES` | Endpoint-keyed price map |
| 6 | `apps/web/components/engine/cards/mpp/registry.tsx` `MPP_SERVICE_RENDERERS` | Vendor → renderer map |
| 7 | `apps/web/components/engine/AgentStep.tsx` `getPayApiGlyph` | URL-prefix → glyph map (8 glyphs across 5 vendors) |
| 8 | `spec/SPEC_24_GATEWAY_INVENTORY.md` §8 | Locked supported set + add-back recipe |

The new 12-assertion test pin (`apps/web/lib/engine/__tests__/engine-context.test.ts`) protects against drift between #1 and #2 *for the listed assertions only* — it doesn't catch new edge cases, doesn't constrain #3–#8, and doesn't notice if #1 and #2 both drift in the same wrong direction together.

### 1.2 The runtime safety gap SPEC 24 didn't address

The `pay_api` engine tool today accepts ANY URL the LLM passes. If the LLM hallucinates and calls `pay_api({ url: 'https://mpp.t2000.ai/deepl/...' })`, the tool dispatches the call. The gateway either:
- Has the dropped service deployed → user gets charged $0.005 for a service Audric doesn't support → result falls through to `<GenericMppReceipt>` (no useful UI) → silent regression
- Has the dropped service NOT deployed → 404 → typed error surfaces → user-visible failure

Either way, the safety gate is "the LLM follows the prompt." That's L1 defense. SPEC 24 strengthened L1. **L2 (runtime contract enforcement at the engine layer) does not exist.** This violates `safeguards-defense-in-depth.mdc` which mandates engine-side preflight on every write tool.

### 1.3 The product signal gap

Every time the LLM declines a capability ("Audric doesn't have weather APIs today"), that's a product signal — a user wanted X, we said no. Today we **throw away every one of those signals.** When the founder picks the next vendor to add, it's a guess based on intuition rather than data.

### 1.4 What "fix at the root" actually means here

`engineering-principles.mdc` Principle 4: *"Fix at the root, not the symptom. When a fix requires changes in 3+ places or multiple retry attempts, the architecture is wrong."*

SPEC 24 changed five places to add one vendor (which is what an "add-back" requires today). That's the architectural smell. The fix is to collapse the eight drift sites to **one constant** in the engine package, with every consumer importing or interpolating from it.

---

## 2. Scope

### 2.1 In scope

- Define `SUPPORTED_MPP_VENDORS` in `packages/engine/src/mpp/` as the single source of truth (locked 5-service set + 11 endpoints + per-endpoint price + label + supported renderer hint).
- Add a runtime allow-list gate in the engine `pay_api` tool: validates the URL prefix against `SUPPORTED_MPP_VENDORS`, rejects unsupported vendors with a typed error that the LLM can recover from.
- Annotate `mpp_services` results with `supportedByAudric: boolean` derived from the constant.
- Convert both prompts (`DEFAULT_SYSTEM_PROMPT` in engine + `STATIC_SYSTEM_PROMPT` + `buildUnauthPrompt` in audric) to **interpolate** the constant at module load time, the same way `${TOTAL_COUNT}` / `${READ_COUNT}` / `${WRITE_COUNT}` already do.
- Add `record_capability_gap` engine tool (write, `auto`-permission, no on-chain side effect — just inserts a `MissingCapabilityRequest` row). Sytem prompt teaches the LLM to call it after every honest decline.
- Add `MissingCapabilityRequest` Prisma model + migration to the audric `prisma/schema.prisma`.
- Add a weekly cron job that aggregates the table and emits a summary (Discord webhook + log entry) so the founder sees "users wanted X (N times this week)" without running SQL.
- Add a compile-time check in audric `MPP_SERVICE_RENDERERS` that every entry in `SUPPORTED_MPP_VENDORS` has a registered renderer (catches "added a vendor to the constant, forgot to add a renderer" before the build ships).
- Fold the SPEC 24 Phase 3 F5 smoke harness into SPEC 25: `apps/web/scripts/smoke-mpp.ts` iterates `SUPPORTED_MPP_VENDORS`, generating one probe per endpoint. Adding a vendor automatically adds smoke coverage. The hardcoded probe list never re-appears.
- Replace the audric-side test pin's hardcoded G1/G2/G3 wording assertions with structural assertions that "the prompt interpolates the constant correctly" (so the test surface scales as the constant grows).
- Refactor `SPEC_24_GATEWAY_INVENTORY.md` §8 to be **generated** from the constant via a script (`scripts/generate-mpp-inventory.ts`), with the manual content reduced to add-back recipe + reasoning history.

### 2.2 Out of scope (deferred or owned elsewhere)

- **Adding vendors.** SPEC 25 is a refactor; it ships with the same 5-service set SPEC 24 locked. Adding a 6th vendor (e.g. Suno when Phase 5 lands) is a 5-minute follow-up using the SPEC 25 add-back recipe, not a SPEC.
- **Gateway-side changes.** The MPP gateway (`apps/gateway`) keeps serving all ~40 services to anyone who calls it. SPEC 25 only constrains what *Audric* exposes to the LLM. Other consumers of the gateway are unaffected.
- ~~**Migration of the legacy UI catalog** (`apps/web/lib/service-gateway.ts`, `service-pricing.ts`, `service-catalog.ts`). These are button-driven, not LLM-driven, and out of scope for the LLM safety surface SPEC 24/25 owns. Optional cleanup tracked separately as `spec_legacy_catalog_sweep` placeholder.~~ — **MOVED TO IN-SCOPE per D-11 lock 2026-05-12 ~07:35 AEST. See § 3 Phase 5b for the sweep plan.**
- **Runtime telemetry beyond `MissingCapabilityRequest`**. SPEC 24 P3 already locked `MppTelemetry` as the per-`pay_api`-call observability table; SPEC 25 doesn't expand it.
- **Self-hosted LLM strategy** (`spec/SELF_HOSTED_LLM_STRATEGY.md`) — independent thread.
- **`@cetusprotocol/aggregator-sdk` swap layer.** Cetus has its own constant set + tests. Same architectural pattern but different domain.
- **Move-side allow-list on `mppx`.** The on-chain payment contract accepts any recipient; SPEC 25 does NOT add a move-side allow-list (would require a contract upgrade). Engine-layer enforcement is sufficient because every `pay_api` call originates from the engine.

### 2.3 What stays after SPEC 25 ships

Of the eight drift sites in §1.1:
- #1, #2, #3 (the three prompts) → all interpolate from the constant; drift impossible
- #4 (pay_api description) → interpolates from the constant; drift impossible
- #5 (SERVICE_PRICES) → derived from the constant at module load (becomes a getter, not a literal); drift impossible
- #6 (MPP_SERVICE_RENDERERS) → audric-side, but compile-time check fails the build if any supported slug is missing a renderer
- #7 (getPayApiGlyph) → audric-side, gets the same compile-time check
- #8 (SPEC_24_GATEWAY_INVENTORY.md §8) → generated from the constant via script; manual section is just history

Net: **all 8 drift sites collapse to 1.** Adding a vendor becomes a 1-line change to the constant + a renderer entry in audric (which the compile-time check forces you to add). Removing a vendor is a 1-line constant removal + the compile-time check tells you which audric file to edit.

---

## 3. Phases + items

### Phase 1 — The constant + types + helpers (~1h, engine-side)

**Goal:** establish `SUPPORTED_MPP_VENDORS` as the canonical source of truth + ship the helpers that consumers need.

| Item | Description | Output |
|---|---|---|
| **25-C1 — `SUPPORTED_MPP_VENDORS` constant** | Define the typed object in `packages/engine/src/mpp/supported-vendors.ts`. Each entry: vendor slug → endpoint path → `{ price, label, intentHints, rendererKind }`. `as const` + `satisfies SupportedVendorMap` for full TS inference. | `packages/engine/src/mpp/supported-vendors.ts` exporting `SUPPORTED_MPP_VENDORS`, `SupportedVendorSlug`, `SupportedEndpointPath`, `SupportedVendorMap` types. |
| **25-C2 — Validation helpers** | Pure functions: `isSupportedVendor(slug)`, `isSupportedEndpoint(slug, path)`, `getEndpointPrice(slug, path)`, `getEndpointLabel(slug, path)`, `validateMppUrl(url)` (extracts vendor + endpoint from a full `https://mpp.t2000.ai/...` URL and returns `{ supported: boolean, vendor, endpoint, reason? }`). All defensive against undefined / malformed input. | Same file, exported. |
| **25-C3 — Prompt-interpolation helpers** | `formatVendorTable()` returns the multi-line table block (current shape: `openai     — DALL-E images $0.05, …`). `formatVendorList()` returns a comma-separated short list (`openai, elevenlabs, pdfshift, lob, resend`). `formatIntentMap()` returns the intent → service one-liner. All three derive from the constant; if the constant changes, all three outputs change in lockstep. | Same file, exported. |
| **25-C4 — Unit tests** | Pin every helper's output shape; pin the constant's structural invariants (every entry has at least one endpoint; every endpoint has a positive price; every renderer hint is one of the four supported kinds). | `packages/engine/src/mpp/supported-vendors.test.ts` (~15 assertions). |

### Phase 2 — Engine runtime gate + tool annotations (~3h)

**Goal:** make the engine refuse paid calls to unsupported vendors regardless of prompt content. Make `mpp_services` annotate every result.

| Item | Description | Output |
|---|---|---|
| **25-E1 — `pay_api` runtime gate** | In `packages/engine/src/tools/pay.ts`, add a preflight check that calls `validateMppUrl(input.url)`. If `supported: false`, return a recoverable error: `{ error: 'Vendor "<slug>" is not in Audric\'s supported set. Supported: <list>. Decline the request honestly OR use one of these.', recoverable: true, errorCode: 'UNSUPPORTED_VENDOR' }`. The LLM auto-recovery framework already handles `recoverable: true` (see system prompt § Recoverable tool errors). | `pay.ts` + `pay.test.ts` regression tests covering: supported vendor passes, dropped vendor fails with typed error, malformed URL fails gracefully, gateway-prefix-stripped URLs handled, case-sensitivity respected. |
| **25-E2 — `pay_api` description interpolation** | Replace the hardcoded vendor list in `pay.ts` `description` with `formatVendorTable()`. Drop the hand-maintained `SERVICE_PRICES` literal — derive prices from the constant at module load time. | `pay.ts` description test passes; `SERVICE_PRICES` getter delegates to the constant; no hardcoded vendor names remain in `pay.ts`. |
| **25-E3 — `mpp_services` annotation** | In `packages/engine/src/tools/mpp-services.ts`, walk the gateway response and annotate each service: `{ ...service, supportedByAudric: isSupportedVendor(normaliseSlug(service.serviceId)) }`. The existing F2 `_refine` payload still fires on 0-result filtered queries. | `mpp-services.ts` + `aci-constraints.test.ts` extension covering: annotation present on every result, `supportedByAudric: true` for the 5 supported vendors, `supportedByAudric: false` for dropped vendors. |
| **25-E4 — Engine release plan** | Cuts engine `1.30.0` (minor bump because of new tool addition + breaking error-shape change in `pay_api`). audric bumps to consume. | `packages/engine/CHANGELOG.md` 1.30.0 entry; release.yml workflow runs. |

### Phase 3 — Both prompts interpolate the constant (~2h)

**Goal:** kill the prompt-drift class once and for all. Engine prompt + audric prompt both reference the same constant; updating the constant updates both.

| Item | Description | Output |
|---|---|---|
| **25-P1 — Engine prompt interpolation** | In `packages/engine/src/prompt/index.ts`, replace the hardcoded MPP service table + intent map with `${formatVendorTable(SUPPORTED_MPP_VENDORS)}` + `${formatIntentMap(SUPPORTED_MPP_VENDORS)}`. The G1/G2/G3 narrative content stays as literal text (it's the *rules*, not the *vendor list*). | `prompt/index.ts` + `prompt/index.test.ts` updated: rewrites the F1-style "5 services" assertions to assert the **interpolation** rather than the literal text (e.g. `expect(prompt).toContain(formatVendorTable(SUPPORTED_MPP_VENDORS))`). |
| **25-P2 — Audric `STATIC_SYSTEM_PROMPT` interpolation** | In `apps/web/lib/engine/engine-context.ts`, import `SUPPORTED_MPP_VENDORS` + the helpers from `@t2000/engine` + interpolate the same way. The G1/G2/G3 narrative content stays as audric-specific literal text. | `engine-context.ts` + `__tests__/engine-context.test.ts` updated: rewrite the 12-assertion pin's hardcoded G1/G2/G3 wording assertions in two halves: (a) structural assertions ("the table block matches `formatVendorTable()` output exactly"), (b) narrative assertions (G1/G2/G3 wording stays as the literal-text pin we shipped today). |
| **25-P3 — Audric `buildUnauthPrompt` interpolation** | In `apps/web/lib/engine/engine-factory.ts`, replace the hardcoded "5 paid APIs" framing with `formatVendorList(SUPPORTED_MPP_VENDORS)`. | `engine-factory.ts` + a new `__tests__/build-unauth-prompt.test.ts` (~5 assertions) pinning the structural shape. |
| **25-P4 — B3.6 budget gate re-baseline** | The interpolation may shrink the prompt slightly (helpers can produce tighter output than the hand-edited inline form). Re-baseline `harness-metrics.test.ts` ceiling — likely a *reduction*, not a bump. | `harness-metrics.test.ts` ceiling adjusted with a SPEC 25 ceiling-history entry (potentially `10_700` → `10_550`, reclaiming ~150 tokens of prompt budget). |
| **25-P5 — Drift-proof assertion** | New test that imports `formatVendorTable` from the engine and asserts the audric `STATIC_SYSTEM_PROMPT` *literally contains* the helper's output. If the helper changes (because the constant changed) and audric's prompt module isn't re-built, the test fails — catches stale-cache / out-of-date-bundle drift. | `__tests__/spec-25-drift-proof.test.ts` (~3 assertions across the 3 prompt locations). |

### Phase 4 — Demand signal capture (~3h)

**Goal:** stop throwing away the product signal every decline carries.

| Item | Description | Output |
|---|---|---|
| **25-D1 — `MissingCapabilityRequest` Prisma model** | Add to `apps/web/prisma/schema.prisma`. Fields: `id`, `userId` (nullable for unauth), `requestedAt`, `category` (string, e.g. "weather"), `userMessage` (text, the user's actual ask), `suggestedVendor` (nullable, the LLM's guess at what would satisfy), `nativeAlternativeOffered` (boolean — did we degrade to native Claude?). | Migration `2026XXXX_add_missing_capability_request`. |
| **25-D2 — `record_capability_gap` engine tool** | New tool in `packages/engine/src/tools/record-capability-gap.ts`. `permissionLevel: 'auto'` (no payment, no client-side action). Inputs: `category`, `userMessage`, `suggestedVendor?`, `nativeAlternativeOffered?`. Calls back into `audric/api/internal/capability-gap` to insert. Returns `{ success: true, message: 'Logged for product review.' }`. | Tool file + `record-capability-gap.test.ts`. |
| **25-D3 — Audric internal API route** | `apps/web/app/api/internal/capability-gap/route.ts`. Validates internal-API-key header, inserts the row, returns 200. | Route file + integration test. |
| **25-D4 — System prompt teaches the tool** | Add one short line under § MPP services in both prompts: "After every honest decline (CANNOT-do or CAN-do-natively path), call `record_capability_gap` with the category and the user's message. Don't ask permission; just log it. Takes 0ms of perceived latency." | Prompt update; the line is part of the interpolation block so it lives in `formatDeclineRule()` helper, not literal text. |
| **25-D5 — Weekly cron + Discord summary** | `apps/web/cron/capability-gap-weekly.ts`. `SELECT category, COUNT(*) FROM MissingCapabilityRequest WHERE requestedAt >= NOW() - INTERVAL '7 days' GROUP BY category ORDER BY 2 DESC LIMIT 20`. Posts to a Discord webhook (env: `CAPABILITY_GAP_WEBHOOK_URL`) with the rolled-up counts. | Cron file + Vercel cron schedule entry. |
| **25-D6 — Dashboard query script** | `apps/web/scripts/capability-gap-report.ts` — the founder can run on demand to see live counts. | Script file. |

### Phase 5 — Renderer parity + smoke harness fold-in (~3h)

**Goal:** lock the audric-side coverage to the engine constant, fold SPEC 24 P3 F5 into SPEC 25.

| Item | Description | Output |
|---|---|---|
| **25-R1 — Compile-time renderer parity** | In `apps/web/components/engine/cards/mpp/registry.tsx`, add a TS-level assertion that every `SupportedVendorSlug` has an entry in `MPP_SERVICE_RENDERERS`. Pattern: `const _check: Record<SupportedVendorSlug, MppServiceRenderer> = MPP_SERVICE_RENDERERS;` — fails the build if a slug is missing a renderer. | `registry.tsx` + `registry.test.tsx` extension covering the type-level guarantee. |
| **25-R2 — Glyph parity** | Same pattern for `getPayApiGlyph` in `AgentStep.tsx` — every supported endpoint gets a glyph (or an explicit fallback). | `AgentStep.tsx` + `AgentStep.test.ts` extension. |
| **25-R3 — F5 smoke harness fold-in** | Build `apps/web/scripts/smoke-mpp.ts` per SPEC 24 §3 P3, but **iterate `SUPPORTED_MPP_VENDORS`** to generate the probe list. One probe per endpoint, derived from the constant. Real-service initial pinning + stubbed CI version. Adding a vendor to the constant automatically adds a smoke probe. | `apps/web/scripts/smoke-mpp.ts` + GitHub Actions cron `.github/workflows/mpp-smoke.yml`. |
| **25-R4 — Inventory generation** | `scripts/generate-mpp-inventory.ts` reads `SUPPORTED_MPP_VENDORS` and writes the §8 supported-services table into `spec/SPEC_24_GATEWAY_INVENTORY.md`. Manual content (add-back recipe, history) preserved by region markers. | Script + a CI check that the inventory doc is in sync. |

### Phase 5b — Legacy UI catalog sweep (~3h, D-11 lock)

**Goal:** apply the same single-source-of-truth pattern to the audric button-driven UI catalog. These files predate SPEC 24 and carry their own hardcoded service / pricing data — same drift class, different surface.

| Item | Description | Output |
|---|---|---|
| **25-L1 — Audit current usage** | Map every consumer of `apps/web/lib/service-gateway.ts`, `apps/web/lib/service-pricing.ts`, `apps/web/lib/service-catalog.ts`. Identify: (a) which UI surfaces (chips, settings page, marketing pages) read from them, (b) which fields each consumer actually uses, (c) which fields are dead. | Audit doc inline in this spec or `spec/SPEC_25_LEGACY_CATALOG_AUDIT.md`. |
| **25-L2 — Constant-derived re-implementation** | Replace the hardcoded service / pricing arrays in the three files with derivations from `SUPPORTED_MPP_VENDORS`. Where the legacy files carried richer UI metadata (description, icon URL, category copy) that the engine constant doesn't have, EITHER (a) extend the engine constant to include UI metadata fields (recommended if 2+ legacy fields are needed), OR (b) keep a thin audric-side `LEGACY_UI_OVERLAY` map that augments the engine constant with UI-only fields. Decision per-field at audit time. | `service-gateway.ts` + `service-pricing.ts` + `service-catalog.ts` rewritten as derivations. Engine constant possibly extended (counts as engine 1.30.0 change, no re-bump needed). |
| **25-L3 — Visual regression tests** | Snapshot the UI surfaces that consume the legacy catalog BEFORE the sweep, then assert byte-identical render AFTER. Use existing `vitest`-snapshots-against-DOM where applicable; manual screenshot diff where not. Catches "I refactored the data source but the UI changed shape" silently. | Snapshot tests + manual diff log. |
| **25-L4 — Delete dead code** | Any field in the legacy files that no consumer actually uses (per 25-L1 audit) gets deleted in this phase. Not a separate cleanup later — surgical cleanup as part of the sweep. | Deleted lines counted; test suite green. |

**Why this is safe to add to scope (D-11 rationale):** the alternative is shipping SPEC 25 with one drift class fixed (LLM-facing) and another drift class (UI-facing) still live. Both share the same root architecture problem; fixing them together costs ~3h more for one engine release + one audric deploy, vs separately scheduling another spec later that re-touches the same files. The "blast radius unclear" risk is mitigated by 25-L3 visual regression tests catching shape drift before ship.

### Phase 6 — Release + smoke + close (~1h)

| Item | Description | Output |
|---|---|---|
| **25-Z1 — Engine release** | `release.yml` cuts `@t2000/engine@1.30.0` (minor: new tool, new exported constant, breaking error-shape change in `pay_api`). | npm published. |
| **25-Z2 — Audric bump + deploy** | `pnpm add @t2000/engine@1.30.0` in `apps/web`, push, Vercel deploys. | audric main commit. |
| **25-Z3 — Founder smoke** | Re-run the SPEC 24 founder smoke probes (§HANDOFF + new ones for the typed `pay_api` error path: ask for a dropped vendor explicitly, verify the LLM gets the typed error and recovers gracefully). Verify `MissingCapabilityRequest` rows land for every decline. | Smoke transcript captured in `audric-build-tracker.md` S.XXX. |
| **25-Z4 — Backlog table update** | Mark SPEC 25 closed in `audric-build-tracker.md`. Add the SPEC 25 ceiling-history entry. Promote `spec_legacy_catalog_sweep` placeholder if relevant. | Tracker updated. |

---

## 4. Acceptance criteria

SPEC 25 is closed when **all** of the following are true:

1. **Constant is the canonical source.** `SUPPORTED_MPP_VENDORS` exists in `@t2000/engine` exports, importable by audric. Every consumer (4 prompt locations, 2 engine tools, 2 audric registries, 1 inventory doc) derives from it. No hardcoded vendor list survives outside the constant + the audric-side renderer / glyph maps (which are typechecked against the constant).

2. **Runtime gate fires.** Calling `pay_api` with a dropped vendor URL returns the typed `UNSUPPORTED_VENDOR` error within engine preflight — the gateway is never hit, no payment is built, no money is charged. Verified by `pay.test.ts` regression suite.

3. **`mpp_services` annotates every result.** Every gateway service in the response carries `supportedByAudric: boolean`. The 5 supported vendors return `true`; everything else returns `false`. Verified by `aci-constraints.test.ts`.

4. **Both prompts interpolate.** Engine `DEFAULT_SYSTEM_PROMPT` and audric `STATIC_SYSTEM_PROMPT` + `buildUnauthPrompt` all use `${formatVendorTable(...)}` for the service table. Drift-proof assertion (`spec-25-drift-proof.test.ts`) confirms the helper output literally appears in both prompts at module load time.

5. **Demand signal flows.** `record_capability_gap` tool exists, system prompt teaches it, `MissingCapabilityRequest` Prisma table exists, internal API route accepts inserts, weekly cron posts to Discord. Verified by inserting a synthetic decline and watching the row land + the cron summary fire.

6. **Compile-time renderer parity.** Adding a vendor to the constant without adding a renderer / glyph FAILS the audric build (TS compile error, not a runtime test). Removing a vendor from the constant FAILS the build with an "unused renderer" warning.

7. **Smoke harness derived from constant.** `apps/web/scripts/smoke-mpp.ts` iterates `SUPPORTED_MPP_VENDORS` to generate probes. Real-service run hits every supported endpoint. Stubbed CI version runs weekly without errors. Adding a vendor automatically adds a probe (no manual harness edit).

8. **Inventory doc generated.** `SPEC_24_GATEWAY_INVENTORY.md` §8 is generated from the constant via `scripts/generate-mpp-inventory.ts`. CI check fails if the doc and the constant diverge.

9. **Engine 1.30.0 released, audric consumes.** New SemVer minor on the engine; audric bumped + deployed; founder smoke validates end-to-end.

10. **Backlog updated.** SPEC 25 closed in `audric-build-tracker.md`; F5 smoke harness item retired (folded in); placeholder rows for any follow-ups added.

---

## 5. D-questions — all 11 LOCKED 2026-05-12 ~07:35 AEST

| ID | Question | Decision | Notes |
|---|---|---|---|
| **D-1** | Where does `SUPPORTED_MPP_VENDORS` live? | ✅ **(a) New module** `packages/engine/src/mpp/supported-vendors.ts` | default-confirmed to recommendation (single-purpose, easy to find) |
| **D-2** | Constant shape — flat or nested? | ✅ **(a) Nested** by vendor → endpoints map | default-confirmed (mirrors gateway URL hierarchy, makes `validateMppUrl` trivial) |
| **D-3** | `pay_api` error shape | ✅ **(a) Plain object** `{ error, recoverable: true, errorCode: 'UNSUPPORTED_VENDOR' }` | default-confirmed (mirrors existing `swap_quote` ASSET_NOT_SUPPORTED pattern) |
| **D-4** | `record_capability_gap` — required or discretion? | ✅ **(a) Required** — system prompt mandates "ALWAYS call after every CANNOT-do or CAN-do-natively decline" | **founder lock** — captures 100% of signal; data-driven roadmap > LLM judgment latitude |
| **D-5** | Cron schedule for demand summary | ✅ **(a) Weekly Mondays 09:00 UTC** | **founder lock** — matches existing review cadence; one Discord notification per week |
| **D-6** | Discord channel for the summary | ✅ **(b) NEW `#capability-gaps` channel** | **founder lock** — cleaner separation from `#releases`; founder creates + permissions before Phase 4 ship |
| **D-7** | Compile-time check enforcement | ✅ **(a) Hard fail** (TS compile error) | default-confirmed (catches drift at earliest possible moment) |
| **D-8** | F5 smoke harness fold-in | ✅ **(a) Fold into SPEC 25 Phase 5** | default-confirmed (share the constant; building one builds the other) |
| **D-9** | Engine version bump | ✅ **(a) Minor (`1.30.0`)** | default-confirmed (new tool + breaking error-shape change in `pay_api` justifies minor) |
| **D-10** | Inventory doc regeneration | ✅ **(a) Generated by script, manual edits forbidden** | default-confirmed (closes the inventory drift class) |
| **D-11** | Sweep legacy UI catalog (`service-gateway.ts` etc.)? | ✅ **(b) Sweep too** | **founder lock** — adds ~3h via new Phase 5b; eliminates ~3 more drift sites in one ship; visual regression tests in 25-L3 mitigate "blast radius unclear" risk |

**Pre-flight action item from D-6 lock:** founder must create the `#capability-gaps` Discord channel + generate a webhook URL before SPEC 25 Phase 4 ships. Capture the webhook URL in `CAPABILITY_GAP_WEBHOOK_URL` env (Vercel + local `.env.local`). Add to `apps/web/lib/env.ts` Zod schema as required string per `env-validation-gate.mdc`.

---

## 6. Risks + mitigations

| Risk | Mitigation |
|---|---|
| **Engine 1.30.0 breaks audric while migration is in flight.** The new error shape on `pay_api` rejection is a behavior change. | Audric's `executeToolAction.pay_api` already wraps errors in `{ success: false, data: { error } }`, so the shape change is transparent. Smoke verifies. |
| **`record_capability_gap` adds LLM context cost.** New tool descriptor = ~100 tokens of overhead per turn. | The tool description is short (~40 words). Net cost: ~50 tokens. Compare to the value: actionable product signal weekly. Worth it. |
| **The compile-time renderer parity check breaks audric builds the moment engine 1.30.0 ships if audric forgets to add a renderer for a new vendor.** | This is the *intended* behavior — better to fail the build than ship a vendor with no UI. Document in the add-back recipe: "1) Add to constant, 2) Bump engine, 3) Add renderer in audric, 4) Bump audric." |
| **The constant might drift from the actual gateway** — gateway adds/removes a service, constant lags. | F5 smoke harness catches it: every supported endpoint is probed; if the gateway 404s, smoke fails. Weekly CI cron makes it visible within 7 days max. |
| **Discord webhook spam if signal is high.** | Cap the weekly summary at top 20 categories. Single message per week. If volume is high, that's a signal to add a vendor, not to silence the cron. |
| **Add-back recipe is more steps than today's prompt-only approach.** | Today: edit prompt in 2 places, add renderer, add glyph, add SERVICE_PRICES entry, update inventory doc, write tests = 6 places. After SPEC 25: edit constant, add renderer, add glyph (renderer + glyph caught by typecheck if forgotten) = 3 places, all caught by build. **Net reduction.** |
| **Founder context-switching cost for SPEC 25 right after SPEC 24.** | SPEC 25 has no D-question dependencies on the founder smoke results — D-questions are architectural choices. Smoke can run in parallel; SPEC 25 D-questions can be locked while smoke runs. |

---

## 7. Effort + sequencing (revised post-D-11 lock)

| Phase | Item | Effort |
|---|---|---|
| 1 | Constant + types + helpers + tests | ~1h |
| 2 | pay_api gate + mpp_services annotation + tests + engine release plan | ~3h |
| 3 | Both prompts interpolate + drift-proof tests + B3.6 re-baseline | ~2h |
| 4 | Prisma model + tool + API route + weekly cron (Mondays 09:00 UTC) + Discord webhook to NEW #capability-gaps channel + dashboard | ~3h |
| 5 | Compile-time parity + smoke harness fold-in + inventory generation | ~3h |
| **5b** | **Legacy UI catalog sweep — D-11 lock (~3h)** | **~3h** |
| 6 | Engine release + audric bump + smoke + close | ~1h |
| **Total** | | **~16h** |

**Sequencing:** Phase 1 → Phase 2 → Phase 3 strictly (each depends on the previous). Phase 4 can run in parallel with Phase 3 (different files). Phase 5 + Phase 5b can run in parallel with each other after Phases 1–3 complete (different files; both consume the constant). Phase 6 last.

**Calendar:** ~2–2.5 days at normal cadence (was ~1.5–2d before D-11 sweep absorbed Phase 5b). Engine 1.30.0 + audric deploy add ~30 min wall-clock for npm publish + Vercel deploy.

**Sequencing relative to other specs:**
- **After:** SPEC 24 (closed; smoke pending). Both must close before SPEC 25 starts.
- **Parallel-able with:** SPEC 11 PayButton if founder elects (no surface overlap).
- **Before:** any SPEC that adds a 6th MPP vendor (Suno when Phase 5, Fal Recraft for Audric Store creators, etc.). SPEC 25 makes those single-line changes.

---

## 8. Cross-references

- **SPEC 24** — `spec/SPEC_24_MPP_INTEGRATION_AUDIT.md` (predecessor, closed) + `spec/SPEC_24_GATEWAY_INVENTORY.md` (locked supported-set source).
- **Engine 1.29.1** — `packages/engine/CHANGELOG.md` 1.29.1 entry (last release before SPEC 25).
- **`single-source-of-truth.mdc`** — workspace rule that SPEC 25 operationalizes for the MPP domain (currently scoped to portfolio data; SPEC 25 extends the pattern).
- **`safeguards-defense-in-depth.mdc`** — Layer 2 (preflight) + Layer 3 (guards). SPEC 25's `pay_api` runtime gate is canonical Layer 2 work.
- **`engineering-principles.mdc`** Principle 4 — "Fix at the root, not the symptom." SPEC 25 is the root fix; SPEC 24 was the symptom fix.
- **`coding-discipline.mdc`** — "Simplicity First / no abstractions for single-use code" → does not apply because the abstraction (typed constant) is multi-use by definition (8 consumers).
- **Audric prompt** — `apps/web/lib/engine/engine-context.ts` `STATIC_SYSTEM_PROMPT` + `apps/web/lib/engine/engine-factory.ts` `buildUnauthPrompt`.
- **Engine prompt** — `packages/engine/src/prompt/index.ts` `DEFAULT_SYSTEM_PROMPT`.
- **`pay_api` tool** — `packages/engine/src/tools/pay.ts`.
- **`mpp_services` tool** — `packages/engine/src/tools/mpp-services.ts`.
- **Audric MPP renderers** — `apps/web/components/engine/cards/mpp/registry.tsx`.
- **Audric MPP glyphs** — `apps/web/components/engine/AgentStep.tsx` `getPayApiGlyph`.
- **Audric host wrapper** — `apps/web/hooks/useAgent.ts` `payService`.
- **Founder framing 2026-05-12 ~07:18 AEST** — captured at top of this doc.

---

## 9. What we explicitly choose NOT to do

- **No LLM-side capability classifier.** A pre-turn Haiku call to "is this supported?" was considered and rejected — adds 200ms latency for marginal benefit; the prompt already teaches the rule, the runtime gate already enforces it.
- **No user-facing capabilities catalog page.** Marketing problem, not engineering. Wrong layer.
- **No move-side allow-list on the on-chain payment contract.** Engine-side enforcement is sufficient because every `pay_api` call originates from the engine; the gateway accepts payments to its own treasury for any service it serves.
- ~~**No sweep of the legacy UI catalog** (`service-gateway.ts`, `service-pricing.ts`, `service-catalog.ts`) **in this spec.** Those are button-driven, not LLM-driven; out of SPEC 25's safety surface. Tracked separately.~~ — **REVERSED by D-11 lock 2026-05-12 ~07:35 AEST. Now in scope as Phase 5b. Founder rationale: shipping SPEC 25 with one drift class fixed and another live is half-done; both share the same root architecture problem; +3h once now is cheaper than re-scheduling another spec later that re-touches the same files.**
- **No P3 dynamic discovery via gateway HTTP introspection.** Considered (gateway exposes `/services` list which we could parse at runtime instead of hardcoding the constant). Rejected because (a) gateway adds non-Audric-supported services routinely, so we still need a curation layer, (b) the constant + cron-detected drift via F5 smoke is faster + safer than runtime introspection.
- **No retroactive `MissingCapabilityRequest` backfill.** Pre-SPEC-25 declines are gone. We start the dataset on day-one of SPEC 25 ship and iterate forward.

---

## 10. Founder approval checklist

- [x] D-1 through D-11 locked (2026-05-12 ~07:35 AEST — see § 5)
- [x] SPEC 25 row added to `audric-build-tracker.md` Forward backlog as row 7h (2026-05-12 ~07:32 AEST)
- [x] Sequencing slot confirmed: after SPEC 24 founder smoke closes; parallel-able with SPEC 11 (no surface overlap)
- [x] Engine 1.30.0 minor bump approved (D-9 lock)
- [ ] **Pre-Phase-4 action item:** founder creates `#capability-gaps` Discord channel + provides webhook URL → set as `CAPABILITY_GAP_WEBHOOK_URL` env in Vercel + add to `apps/web/lib/env.ts` Zod schema as required string (D-6 lock)
- [ ] Smoke spend budget approved for the F5 real-service run (~$1.20 USDC)
- [ ] Legacy UI catalog sweep blast-radius review (Phase 5b 25-L1 audit catches it; founder reviews audit doc before 25-L2 starts)
