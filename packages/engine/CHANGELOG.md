# Changelog

## 2.0.0 (PENDING — 2026-05-17 target) — Engine v2.0.0: AISDKEngine is the only engine

**Breaking release.** The legacy `QueryEngine` (~21,800 LoC of custom orchestration) is deleted. `AISDKEngine` (~4,500 LoC wrapper around Vercel AI SDK v6 native primitives) is the only engine. Net **~17.3k LoC removed** from the package.

This is the v0.7a end-state shipped after 4 weeks of Phase 1 (provider swap), Phase 2 (tool migration to `defineTool`), and Phase 3 (V2 card rollout + AISDKEngine global flip). See SPEC 37 (`SPIKE_FINDINGS_v07a.md` + `ENGINE_V2_ROLLOUT_PLAN_v07a.md`) for the full rationale.

### Why the major version bump

`QueryEngine` is a deleted symbol. Any consumer importing it from `@t2000/engine` fails at build time. `@t2000/cli` and `@t2000/mcp` are unaffected (they don't depend on `@t2000/engine`). The only impacted consumer is `audric/apps/web` — see migration guide below.

### Removed

- `QueryEngine` class (`src/engine.ts`) — replaced by `AISDKEngine` (`src/v2/engine.ts`)
- `AnthropicProvider` (`src/providers/anthropic.ts`) — `AISDKEngine` takes `anthropicApiKey: string` directly; no provider abstraction needed
- `pollForIndexerCatchup` + `PostWritePoll*` types (`src/post-write-poll.ts`) — `AISDKEngine` has its own post-write refresh path (no Sui-RPC poll)
- `validateHistory` (was a `QueryEngine` static helper) — `AISDKEngine.loadMessages` validates inline
- Test suites: `engine.test.ts`, `confirmation.test.ts`, `regenerate.test.ts`, `post-write-refresh.test.ts`, `pending-input.test.ts`, `engine-bundle.test.ts`, `multi-block-thinking.test.ts`, `spec9-canonical-eval.test.ts`, `haiku-routing.test.ts`, `update-todo.test.ts`, `canonical-route-text.test.ts`, `harness-shape.test.ts`, `proactive-text-cooldown.test.ts`, `post-write-poll.test.ts` — all `QueryEngine`-keyed; AISDKEngine equivalents live in `src/v2/`

### Changed

- `regenerateBundle(engine, ...)` parameter type narrowed from `QueryEngine` to `AISDKEngine`. Function body unchanged (uses `engine.getMessages` / `engine.getTools` / `engine.invokeReadTool` / `engine.loadMessages` — all present on `AISDKEngine` with identical signatures).

### Kept (no consumer impact)

- `AISDKAnthropicProvider` — still exported for hosts that want the AI SDK-backed `LLMProvider` shape without instantiating an engine (audric uses it nowhere now but the SPEC 37 Phase 1 soak proved its stability; cheap to keep)
- `serializeSSE` / `parseSSE` / `engineToSSE` / `withStreamState` — audric routes wrap `AISDKEngine` stream with these
- Every tool / NAVI / BlockVision / Sui / canvas / recipe / guard export — shared with AISDKEngine

### Migration guide (audric/apps/web — the only consumer that breaks)

```typescript
// REMOVE these imports:
import { QueryEngine, AISDKAnthropicProvider } from '@t2000/engine';
import { isAddressAllowlisted } from './wallet-allowlist';

// REPLACE the engine instantiation:
- const useAiSdkNativeEngine =
-   isAddressAllowlisted(address, env.USE_AI_SDK_NATIVE_ENGINE_WALLETS) ||
-   env.USE_AI_SDK_NATIVE_ENGINE === '1' ||
-   env.USE_AI_SDK_NATIVE_ENGINE === 'true';
- const engine = useAiSdkNativeEngine
-   ? new AISDKEngine({ ...sharedConfig, anthropicApiKey: API_KEY, mcpManager: mgr }) as unknown as QueryEngine
-   : new QueryEngine({ ...sharedConfig, provider: new AISDKAnthropicProvider({ apiKey: API_KEY }), mcpManager: mgr });
+ const engine = new AISDKEngine({
+   ...sharedConfig,
+   anthropicApiKey: API_KEY,
+   mcpManager: mgr,
+ });

// REMOVE from lib/env.ts schema:
- USE_AI_SDK_NATIVE_ENGINE
- USE_AI_SDK_NATIVE_ENGINE_WALLETS

// DELETE these files:
- lib/engine/wallet-allowlist.ts
- lib/engine/wallet-allowlist.test.ts

// REMOVE from Vercel env (no longer read):
- USE_AI_SDK_NATIVE_ENGINE
- USE_AI_SDK_NATIVE_ENGINE_WALLETS
```

Total audric-side diff: ~50 LoC removal in `engine-factory.ts`, ~20 LoC removal in `env.ts`, 2 file deletions, 2 Vercel env var removals.

### Known issues (deferred to v2.0.1)

1. **HF preview renders `∞ → ∞` for borrow against existing collateral.** Cosmetic safety annoyance — borrow still executes correctly, the receipt shows the real HF. Root cause under diagnostic in v1.38.5 logs (`enrich-hf-debug` log lines). Workaround: trust the receipt, not the preview.
2. **BlockVision wallet cache may serve stale balance for ~60s after a withdraw confirms.** Recovers on follow-up read. Agent may make an incorrect "insufficient funds" call in that window. Workaround: ask "are you sure?" to force a re-fetch; or wait 60s.

### Operational impact

- **npm publish**: `@t2000/sdk`, `@t2000/engine`, `@t2000/cli`, `@t2000/mcp` all bump to `2.0.0` (monorepo lockstep — `release.yml` workflow). CLI + MCP don't import `@t2000/engine` so the bump is a no-op for them.
- **Audric deploy**: bump `@t2000/sdk` + `@t2000/engine` to `2.0.0`, apply the migration guide diff, push. Vercel auto-deploys. After verifying the deploy is stable, remove `USE_AI_SDK_NATIVE_ENGINE*` from Vercel env.
- **Rollback path**: `@t2000/engine@1.38.5` stays on npm. If v2.0.0 surfaces a regression, audric can pin to `1.38.5` and re-set `USE_AI_SDK_NATIVE_ENGINE=1` to keep AISDKEngine without the deletion.

## 1.38.5 (2026-05-17) — Day 14e diagnostic: HF preview debug logging

Single-purpose release. Adds production logging to `enrichPendingActionWithLiveData` so we can see the actual inputs to `projectHF` per emit for `borrow` and `save_deposit` previews.

### Why

The 2026-05-17 re-smoke of v1.38.4 showed mixed results:

- **`save 6 USDC` preview** → `Health factor ∞ → ∞` (CORRECT — `coerceCurrentHF` fixed the dust-borrow case; v1.38.4 IS deployed).
- **`borrow $0.5` preview** → `Health factor ∞ → ∞` (STILL WRONG — should render `∞ → ~16.5` against $13.71 collateral with 0 prior debt).

Two failure paths could produce `∞ → ∞` for borrow:

1. `coerceAmount` returns `0` (LLM emitted unexpected shape) — `projectHF` returns `undefined`, arrow shouldn't render. But it DOES, so this isn't the path.
2. `projectHF` reaches the `newBorrowed <= DEBT_DUST_USD` dust check and returns `null` — but for borrow, `newBorrowed = 0 + 0.5 = 0.5`, which is `> 0.01`. So this shouldn't be the path either.

Neither expected path explains the observed behavior. Rather than ship another patch-by-guess, this release surfaces the exact inputs so we can fix the root cause with certainty on the next iteration.

### Added

- **`enrich-hf-debug` log line** emitted whenever `enrichPendingActionWithLiveData` runs for `borrow` or `save_deposit`. JSON shape, single-line, grep-friendly: `{ tag, toolName, rawAmount, rawAmountType, coercedAmount, supplied, borrowed, liquidationThreshold, healthFactor, projected, currentHF, projectedHF }`.
- **`enrich-hf-debug-error` log line** emitted when `fetchHealthFactor` rejects (previously a silent `.catch(() => {})`). Logs `{ tag, toolName, error }` so we know if NAVI is failing silently in prod.

### Removal plan

Both log lines are tagged with `[Day 14e]` and a TODO marking them for removal in `Day 14f` once Bug 2 root cause is confirmed and the targeted fix lands. Estimated lifetime: 1-2 days.

### Operational impact

- **Audric**: bump `@t2000/engine` from `1.38.4` → `1.38.5`. No code changes — pure diagnostic.
- **Log volume**: ~1-3 lines per write-preview emit. Negligible.
- **No behavioral change** — pure observability addition.

## 1.38.4 (2026-05-17) — Day 14d HF preview fixes (string-amount coercion + post-write cache bypass)

Two surgical fixes to `enrichPendingActionWithLiveData` that close the prod-observed Health-Factor preview gaps surfaced during the WRITE_PREVIEWS_V2 rollout smoke (2026-05-17).

The previews shipped two misleading states on borrow / save confirm cards:
1. **`borrow $X` preview showed `Health factor ∞ → ∞`** when the projected HF should drop to a finite number (e.g. ∞ → ~16.5 for $0.5 borrow against $9.72 collateral). Root cause: `cached.input.amount` reached `projectHF` BEFORE the tool's Zod schema validates it — the LLM occasionally emits numeric fields as strings (`"0.5"` not `0.5`), the strict `typeof === 'number'` check coerced these to `0`, and `projectHF` then returned `null` (no-borrow-change projection).
2. **`save $X` preview showed `Health factor 0.00 → ∞`** (looks like liquidation imminent) for users with no real debt. Root cause: NAVI's indexer leaves residual sub-dust borrow rows for ~30-60s after a repay. The cached HF read returned `borrowed: 0.001` + `healthFactor: 0`, and `transformHealthFactor`'s fallthrough `(borrowed === 0 ? Infinity : 0)` returned `0` because `0.001 !== 0`. `Number.isFinite(0)` then gated `currentHF` to `0`.

HF is the user's primary risk signal on borrows. Shipping `USE_AI_SDK_NATIVE_ENGINE=1` globally with these gaps would let every borrow up to ~$10 (auto-confirm threshold) render with wrong HF projection. Patching before the global engine flip.

### Changed

- **`enrich-pending-action.ts` — `coerceAmount(raw: unknown)`** — new defensive helper that handles `string`, `number`, and non-numeric inputs. Replaces the strict `typeof === 'number' ? raw : 0` ternary. Returns `0` for invalid inputs, which `projectHF`'s first guard `!(amount > 0)` then catches and returns `undefined` from — hiding the HF row entirely (preferable to silently rendering a misleading `∞ → ∞`).
- **`enrich-pending-action.ts` — `coerceCurrentHF(healthFactor, borrowed)`** — new helper that treats `borrowed <= DEBT_DUST_USD` as no-debt for the preview display, returning `null` (∞) regardless of NAVI's literal `healthFactor` field. Fixes the post-repay indexer-lag edge case where NAVI returns `0` instead of `Infinity`.
- **`enrich-pending-action.ts` — `fetchHealthFactor` now called with `{ skipCache: true }`** for preview enrichment. The preview is shown ONCE before the user taps Approve; the latency cost (~100-300ms cache miss vs <5ms cache hit) is worth correctness on the single most safety-critical pre-write surface. Without this, a preview emitted within the 30s naviKey.health TTL reads stale position data (residual dust borrow / pre-deposit supplied), which poisons both `currentHF` and `projectedHF`.

### Added

- **5 new regression tests** in `enrich-pending-action.test.ts`:
  - LLM emits `amount` as string `"0.5"` → coerced to 0.5, projection computed correctly (`∞ → 16.524` for $0.5 borrow against $9.72 collateral at 0.85 LT)
  - Invalid string amount (`"not-a-number"`) → `projectedHF` undefined, no misleading null
  - Dust borrow (NAVI indexer lag after repay) → `currentHF` coerced to `null` (∞)
  - Above-dust borrow still reports real `currentHF` (over-correction guard)
  - Preview HF read bypasses the NAVI cache (`{ skipCache: true }`)

### What this preserves

- Every existing happy-path test (28 pre-existing) continues to pass — the coercion helpers are strictly additive.
- `transformHealthFactor` is unchanged. The fix is at the enrichment-layer boundary (where NAVI data meets preview rendering), not at the transform layer. Keeping the transform untouched preserves its contract for `health_check` tool consumers.
- `BORROW_APY_TOOLS` / `HF_TOOLS` / `DEBT_DUST_USD` / `projectHF` signature all unchanged. Only the enrichment-call-site behavior changed.

### Operational impact

- **Audric**: bump `@t2000/engine` from `1.38.3` → `1.38.4`. No code changes needed on the audric side — the V2 preview-body components (`BorrowPreviewBody`, `SavePreviewBody`, `RepayPreviewBody`, `WithdrawPreviewBody`) consume `currentHF` + `projectedHF` from the PendingAction without further transformation.
- **Other consumers (@t2000/cli, @t2000/mcp)**: not affected — they don't surface V2 preview cards.
- **NAVI MCP load**: +1 GET_HEALTH_FACTOR call per write-tool preview that we'd previously cache-served. Estimated <2 RPS additional load on NAVI's open-api gateway based on prod write volume.

## 1.29.1 (2026-05-11) — SPEC 24 audit-gap patches (G1, G2, G3) — pre-smoke prompt polish

Three surgical prompt edits closing audit gaps surfaced during the pre-ship review of 1.29.0. Together they prevent three predictable LLM failure modes that the F1 prompt didn't cover:

- **G1 — GPT-4o ambiguity.** Pre-1.29.1 the intent map said `"draft a guide" → openai GPT-4o ($0.01)` with no instruction on when to spend vs. write natively. Audric IS Claude — the LLM had no signal to default to free native output. Likely failure: needlessly billing the user $0.01 for content Claude could write for free, OR ignoring the GPT-4o option entirely making it dead capability. Fix: changed the mapping to `default to writing natively (FREE — you are Claude); only call openai GPT-4o ($0.01) when the user EXPLICITLY asks for GPT-4o output, names a different model, or wants a second-opinion voice. Default = native, paid = explicit-request only.`
- **G2 — "What services do you offer?" leak.** Pre-1.29.1 the LLM might call `mpp_services` (no args), get the full 40-service gateway catalog, and faithfully enumerate all 40 — even though Audric supports only 5. Likely failure: user sees "Audric supports Suno, Fal, Anthropic, Gemini, OpenWeather…" and gets 0 results when they ask for any of them. Fix: added an explicit intent-map entry teaching the LLM to list ONLY the 5 supported services in response to "what services" questions, and that the catalog is for URL/schema discovery (its job), not enumeration to the user.
- **G3 — Translation/research conflated with "decline outright."** Pre-1.29.1 the "DO NOT support" list lumped things Audric genuinely can't do (weather, music, web search) with things Audric CAN do natively but doesn't have a paid API for (translation, summarization, "research-as-explain"). Telling the LLM to "decline honestly" for translation was wrong — Claude can translate. Likely failure: user gets refused for something that's a 2-token continuation away. Fix: split the unsupported list into two distinct buckets — `What we CANNOT do` (genuinely unavailable; decline honestly) and `What Audric CAN do natively` (no MPP call needed; just answer). Translation, summarization, comparing concepts, drafting prose all moved into the CAN-natively block. The "ONLY use resend when the user wants the email SENT via SMTP" clarification was added to prevent the LLM from billing a $0.005 send when the user only asked for a draft.

**Why now (vs. fold into 1.29.2 follow-up).** Three 1-line edits, each independently catches a likely failure mode. Bundling avoids a second engine release after F5 smoke surfaces the same gaps.

### Added

- **System prompt § MPP services intent map** — new "What services do you offer?" entry teaching the LLM to list ONLY the 5 supported services and never enumerate the full catalog.
- **System prompt § What Audric CAN do natively** — new dedicated block listing translation, summarization, research-as-explain, comparing concepts, drafting copy, math, coding help, DeFi protocol explanations, drafting emails/messages/scripts as native abilities — answer directly, never call pay_api.
- **10 new regression tests** in `prompt/index.test.ts` (G1: 2, G2: 2, G3: 6) pinning every audit-gap edit. Including a structural test that asserts "Translation" lives in the CAN-natively block, NOT in the CANNOT-do block (so a future refactor that moves it back fails immediately).

### Changed

- **System prompt § MPP services intent map** — GPT-4o entry rewritten to "default to writing natively (FREE — you are Claude); only call openai GPT-4o ($0.01) when the user EXPLICITLY asks for GPT-4o output, names a different model, or wants a second-opinion voice. Default = native, paid = explicit-request only."
- **System prompt unsupported list** renamed from "What we DO NOT support" to "What we CANNOT do (genuinely unavailable: neither a paid API nor native ability)." Translation removed from this list (moved to the new CAN-natively block). Web search / weather / forex prefixed with "Live" to clarify the gap is real-time data, not the concept itself. "Alternative chat models" list now reads `(Gemini, Mistral, Llama, etc.)` instead of `(Claude, Gemini, Mistral, etc.)` — Claude is no longer mis-listed as something we don't support, since Audric IS Claude.

### What this preserves

- **F1 + F2 (1.29.0)** — the 5-service lock, intent map, multi-step composition guidance, mpp_services 0-result `_refine` recovery, and `SERVICE_PRICES` map are all unchanged.
- **All other prompt sections** (Response rules, Caption rules, Execution rule, Before acting, Tool usage, Savings = USDC or USDsui, Fees, Multi-step flows, Recoverable tool errors, Authentication, Safety, Proactive insights) — untouched.
- **No tool surface changes** — `pay_api` and `mpp_services` source code is unchanged from 1.29.0.

### Test results

- 1154/1154 engine tests passing (was 1144/1144 in 1.29.0 — +10 audit-gap tests).
- 0 new lint errors / 0 type errors.
- ESM + DTS build green.

## 1.29.0 (2026-05-11) — SPEC 24 Phase 2 F1+F2: lock 5-service MPP set + 0-result auto-recovery

Locks the supported MPP gateway service set to **5 services (11 endpoints)** and teaches the LLM to recover from 0-result discovery instead of giving up silently. Replaces the pre-SPEC-24 prompt that lied about music availability and the pay_api tool description that hardcoded a dropped vendor (`fal/fal-ai/flux/dev`) in its postcard workflow.

**Why it shipped now.** Founder smoke 2026-05-11 ~19:15 AEST: `create a song about sui` and `make me a PDF colouring book about whales` both returned `0 services available` from `mpp_services` despite Suno + PDFShift being in the gateway. Root cause was a 4-layer mismatch — the gateway serves 40 services, but the engine only supports a few, the prompt lies about the rest, and `mpp_services` returns `0` silently when the LLM picks an invented category like `music`. SPEC 24 §1–§4 traced the failure end-to-end (`spec/SPEC_24_GATEWAY_INVENTORY.md`); this minor bump ships F1 (prompt + tool description rewrite) + F2 (`mpp_services` 0-result auto-recovery). F3 + F4 (audric registry cleanup + per-vendor glyphs) ship next as an audric commit.

### Added

- **System prompt now contains a dedicated `## MPP services (pay_api)` block.** Enumerates the locked 5 services + their costs (~12 lines, ~120 prompt tokens) and the intent → service mapping for every supported lane (image gen → openai DALL-E, transcription → openai Whisper, etc.). Includes explicit "what we DO NOT support" enumeration so the LLM declines honestly for music / Fal / Claude chat / search / weather / translation / maps / etc. Source: `packages/engine/src/prompt/index.ts`.
- **Multi-step composition guidance baked into both the prompt and `pay_api` description.** Teaches the LLM to chain `openai DALL-E` × N + `pdfshift` for "colouring book" / "illustrated eBook" intents, and to quote total cost upfront ("10 images × $0.05 + $0.01 PDF = $0.51"). The Lob postcard flow stays as the canonical baked example.
- **`mpp_services` 0-result auto-recovery via `_refine` payload.** When a category- or query-filtered call returns 0 services, the response now includes `_refine: { reason, validCategories, suggestion }` so the LLM can self-correct in the same turn. The reason text differentiates "category doesn't exist" from "query matched nothing"; the suggestion includes explicit decline guidance for unsupported intents. Source: `packages/engine/src/tools/mpp-services.ts`.
- **31 new regression tests** across 3 test files:
  - `prompt/index.test.ts` (NEW) — 11 tests pinning the supported service set + intent map + decline list + 0-result recovery guidance in the prompt. Fails if "40+ paid APIs" / "music" / "fal" creep back in.
  - `__tests__/aci-constraints.test.ts` — 6 new tests pinning the F2 `_refine` payload shape (validCategories alphabetized + lowercased, decline guidance present, no `_refine` on happy paths or no-args full catalog).
  - `__tests__/pay.test.ts` — 14 new tests pinning the locked 5-service description + endpoint-aware `SERVICE_PRICES` map (DALL-E $0.05, Whisper $0.01, GPT-4o $0.01, ElevenLabs $0.05, PDFShift $0.01, Lob postcards $1.00 / letters $1.50 / verify $0.01, Resend $0.005, unsupported services fall to safe $0.005 default).

### Changed

- **`pay_api` tool description rewritten** to enumerate the 5 supported services up front and explicitly call out that the gateway hosts other services (Fal, Anthropic, Gemini, Suno, etc.) Audric does NOT support — declines honestly instead of routing through hoping the result will render. Source: `packages/engine/src/tools/pay.ts`.
- **`SERVICE_PRICES` map rewritten** to endpoint-aware pricing for the locked 5-service set. Pre-1.29.0 the map advertised stale prices for 14 dropped services (fal $0.03, perplexity $0.01, brave $0.005, etc.) and missed every supported one — meaning DALL-E calls were estimated at the $0.005 default and surprised the user with a 10x cost overshoot at confirmation. Now pins:
  - openai images (DALL-E) = $0.05
  - openai transcriptions (Whisper) = $0.01
  - openai chat (GPT-4o) = $0.01
  - elevenlabs (TTS + sound-gen, both $0.05)
  - pdfshift = $0.01
  - lob postcards = $1.00, lob letters = $1.50, lob anything else = $0.01 (address-verify)
  - resend = $0.005
  - unsupported services fall through to the safe $0.005 default
- **Lob postcard multi-step flow updated** in the `pay_api` description: was `fal/fal-ai/flux/dev ($0.03)` for the design-image step (a service we no longer support), is now `openai/v1/images/generations` (model "dall-e-3", $0.05). The 3-step pattern (generate → confirm → mail) is unchanged.
- **System prompt header** no longer claims "40+ paid APIs (music, image, research, translation, weather, fulfilment)" — replaced with the actual 7 supported intents (image generation, transcription, content generation, premium audio, PDF binding, physical mail, transactional email). Removes the longstanding "music available" lie.
- **System prompt § Tool usage** no longer says "for real-world questions (weather, search, news, prices), use pay_api" — replaced with the actual 5-service framing pointing to the new § MPP services block.

### Removed

- Pre-SPEC-24 system prompt language that advertised music / web search / news / weather / forex / translation as available via pay_api. None of those services are in the supported set; advertising them caused the LLM to call `mpp_services` with invented category labels (`music`, `audio`, `pdf`) that exact-matched zero gateway services.

### What this preserves

- **All write-tool flows (save, swap, borrow, repay, send, withdraw)** are untouched — only the MPP `pay_api` and `mpp_services` surfaces changed.
- **The `mpp_services` no-args full-catalog default** (added in 0.46.7) is unchanged. The `_refine` recovery only fires when the LLM explicitly filters and gets 0 results.
- **Cost-quoting requirement** for write tools is unchanged. The prompt's MPP block explicitly tells the LLM to "always quote the cost first."
- **The `payApiTool.preflight` URL + JSON validation** is unchanged; it still validates the URL starts with `${MPP_GATEWAY}` and the body is valid JSON.

### Test results

- 1144/1144 engine tests passing (was 1113/1113 in 1.28.3 — +31 SPEC 24 tests).
- 0 new lint errors / 0 type errors.
- ESM + DTS build green.

### Cross-references

- SPEC 24 master doc: `spec/SPEC_24_MPP_INTEGRATION_AUDIT.md`
- SPEC 24 inventory + locked supported set: `spec/SPEC_24_GATEWAY_INVENTORY.md` §8 + §9
- Audric F3 + F4 ship (next, after this engine release): registry cleanup + per-vendor glyphs in audric

## 1.28.3 (2026-05-11) — Fix: PWR `BalanceCard` staleness, take 2 (cache-busting query param)

1.28.2 attempted to fix PWR `BalanceCard` staleness by sending `Cache-Control: no-cache` as a request header from `fetchAudricPortfolio` + `fetchAudricHistory`. **Production smoke 2026-05-11 ~16:11 AEST proved that fix INEFFECTIVE** — the same byte-identical staleness pattern reproduced (Prompt 1 swap+save bundle PWR `BalanceCard` `$78.73 wallet / $20.79 savings`, Prompt 2 withdraw-all-USDC PWR `BalanceCard` STILL `$78.73 wallet / $20.79 savings`, while `SavingsCard` correctly showed `$16.89 USDsui-only`).

Empirical verification (3 sequential probes against `https://audric.ai/api/portfolio?address=0x000...000` from outside Vercel, 2026-05-11 06:13 UTC):
- **Bare request**: `x-vercel-cache: STALE`, age 17s
- **`Cache-Control: no-cache` header**: `x-vercel-cache: STALE`, age 17s (no change)
- **`x-vercel-cache: bypass` header**: `x-vercel-cache: STALE`, age 17s (no change)

Vercel's Edge Network ignores ALL request-side cache headers. Per Vercel's own documentation, the cache key is the URL itself — the only documented bypass is a unique URL per request.

### Fixed

- **`fetchAudricPortfolio` now appends `_engineNoCache=<unix-ms>` to the request URL.** Vercel keys its cache on the FULL URL (including query params) so each engine fetch gets a unique cache key → always a CDN miss → always forwards to origin → engine sees the freshly-invalidated wallet cache.
- **`fetchAudricHistory` mirrors the same posture symmetrically.**
- **The audric route only reads `address` from `searchParams`**, so the extra query param is ignored by the handler (no behaviour change inside the route).
- **The `Cache-Control: no-cache` header from 1.28.2 is kept as defence in depth** — does nothing today against Vercel's CDN, but is harmless and documents intent.

### What this preserves

- **Browser-side hooks (`useBalance`, `FullPortfolioCanvas`, `WatchAddressCanvas`) keep their CDN caching benefit.** They use plain `?address=...` URLs without the `_engineNoCache` param, so their cache key matches across users and across requests, hitting the same edge-cached entry.
- **Engine cache pollution is bounded.** Each PWR write injects ~1 cache entry per refresh tool. At Vercel's ~1MB cache limit per route, 100k entries before eviction — far above any realistic write rate.

### Updated tests

- `audric-api.test.ts` — both regression tests now assert (a) the URL contains the `_engineNoCache=<unix-ms>` query param within the call window AND (b) the `Cache-Control: no-cache` header is sent.

### Test results

- 1113/1113 engine tests passing (no count change vs 1.28.2; same two regression tests, expanded assertions).
- 0 lint errors / 0 type errors.
- ESM + DTS build green.

## 1.28.2 (2026-05-11) — Fix: PWR `BalanceCard` staleness (Vercel CDN bypass)

Fixes a data correctness regression where `balance_check` returned stale wallet + savings values inside the post-write refresh cluster, while `savings_info` (rendered immediately above it in the same cluster) showed correct fresh values from the same write.

Symptom in production (smoke 2026-05-11, Prompt 2): user withdrew 21 USDC from savings. PWR cluster fired ~5s later. The `BalanceCard` returned BYTE-IDENTICAL `wallet=$61.78 / savings=$37.96` to the prior turn's PWR — pre-withdraw values. The `SavingsCard` (which goes through `positionFetcher` directly, never the audric API) showed the correct post-withdraw `$16.89`. The narration was also fresh (LLM read from `savings_info`'s correct values, not the stale `balance_check`).

Root cause is upstream of the engine's own caches. The audric `/api/portfolio` route ships `Cache-Control: public, s-maxage=15, stale-while-revalidate=30` so its three browser-side consumers (`useBalance`, `FullPortfolioCanvas`, `WatchAddressCanvas`) get free Vercel CDN caching during normal browsing. The engine's `fetchAudricPortfolio` issued a vanilla `fetch()` without any cache-bypass, so within the 15s s-maxage window the CDN returned the prior turn's cached response WITHOUT EVER REACHING the audric route — meaning the engine's own `clearPortfolioCacheFor()` call inside `runPostWriteRefresh` (which correctly invalidated the shared Upstash wallet cache) never had a chance to take effect on the request path.

`savings_info` is unaffected because it calls `context.positionFetcher(addr)` directly (in-process, never crosses the audric API boundary, never touches the CDN).

### Fixed

- **`fetchAudricPortfolio` now sends `Cache-Control: no-cache` request header** to bypass Vercel Edge cache. Vercel's CDN respects this directive by forwarding the request to the origin route handler instead of returning a cached response.
- **`fetchAudricHistory` gets the same posture symmetrically.** `/api/history` is uncached today, but pinning the same primitive prevents a future operator who adds caching to `/api/history` for browser perf from silently regressing engine-side freshness.
- **The browser-side cache is preserved.** `useBalance`, `FullPortfolioCanvas`, `WatchAddressCanvas` continue to benefit from the 15s edge cache during normal dashboard browsing — the bypass header is only sent by the engine.

### Added

- **2 new regression tests** in `audric-api.test.ts`: pin that both `fetchAudricPortfolio` and `fetchAudricHistory` send the `Cache-Control: no-cache` request header. Failing the test means the staleness regression is back.

### Why we used the header, not the `cache` fetch option

The `cache: 'no-store'` fetch option is a browser/Next.js convenience that maps to a `Cache-Control: no-store` request header. Node's undici `RequestInit` does NOT expose `cache` (it's on `Request` as a read-only field, not on the init type), so it's not a portable primitive for an engine package that runs on Node. The `Cache-Control: no-cache` request header is the standard, portable, and CDN-respected mechanism. `no-cache` (force revalidation) is also semantically safer than `no-store` (don't cache at all) — every CDN treats `no-cache` as cache-bypass, while `no-store` semantics vary.

### Test results

- 1113/1113 engine tests passing (was 1111 in 1.28.1; +2 from new cache-bypass regression tests).
- 0 lint errors / 0 type errors.
- ESM + DTS build green.

## 1.28.1 (2026-05-11) — Fix: emit `tool_start` for PWR refreshes (silent-drop regression)

Fixes a contract regression where `runPostWriteRefresh` emitted only `tool_result` events for the reads it injected (`balance_check`, `savings_info`, `health_check`), never the corresponding `tool_start`. Hosts that build a chronological timeline by registering blocks on `tool_start` and updating them on `tool_result` (audric SPEC 8 v0.5.1) silently dropped every PWR result because no matching block existed for the `findLastIndex(toolUseId)` lookup.

Symptom in production: the audric `<PostWriteRefreshSurface>` cluster never rendered after a successful save / withdraw / borrow / repay / send / swap, despite the engine running the refresh tools correctly and the LLM narrating from the fresh data. Net effect: the entire SPEC 23A-A6 grouped-refresh UI was 50% missing — fresh data flowed into the model context, but never reached the UI.

The engine's own doc-comment on `runPostWriteRefresh` (line 1075) always specified that BOTH `tool_start` and `tool_result` were the contract; the implementation drifted before any host adopted the grouping pattern, so the regression sat dormant until SPEC 23A-A6 (audric 1.28.0) tried to consume it.

### Fixed

- **`runPostWriteRefresh` now emits `tool_start` BEFORE every `tool_result`**, mirroring the auto-tier dispatch path at `engine.ts:1659`. Each `tool_start` carries `source: 'pwr'` so timeline grouping rules can identify the cluster from the very first event, before any result lands. Both events share the same `toolUseId` (`pwr_${action.toolUseId.slice(-6)}_${idx}_${tool.name}`) so hosts can pair them.

### Added

- **New regression test** in `post-write-refresh.test.ts`: `[v1.28.1 — silent-PWR-drop fix] emits a tool_start with source: "pwr" BEFORE every tool_result, paired by toolUseId`. Pins all four invariants:
  1. `tool_start` fires once per refresh tool (count parity with `tool_result`)
  2. Each `tool_start` carries `source: 'pwr'` so hosts can route from event one
  3. `tool_start` and `tool_result` are paired by `toolUseId` and `toolName`
  4. `tool_start` ALWAYS precedes its matching `tool_result` in stream order

### Notes

- **No wire-format change.** `tool_start` events were already typed and serializable; they just weren't being emitted from this path. Hosts that ignore `tool_start` (or `source === 'pwr'`) on PWR continue to work — the only behavior change is hosts that register on `tool_start` now correctly see the PWR blocks instead of dropping them.
- **No behavior change for the LLM.** The synthetic `assistant(tool_use)` / `user(tool_result)` ContentBlocks pushed into `this.messages` are unchanged — model context remains identical. The fix is purely additive on the `EngineEvent` stream.
- **Telemetry unchanged.** `engine.pwr.tool_ms` / `engine.pwr.refresh_total_ms` / `engine.pwr.total_ms` already cover per-tool and aggregate timing; no new histograms needed.

### Test results

- 1110/1110 engine tests passing (was 1109 in 1.28.0; +1 from new PWR `tool_start` regression test).
- 0 lint errors / 0 type errors.
- ESM + DTS build green.

## 1.28.0 (2026-05-11) — SPEC 23A-Q-source: tool event provenance

Adds an optional `source: 'pwr' | 'llm' | 'user'` field to `tool_start` and `tool_result` events (`EngineEvent` and the SSE-mirror `SSEEvent`) so hosts can route tool blocks by origin without re-deriving it from heuristics. Engine ALWAYS stamps this in production at every yield site; the field is `?` only to keep test fixtures and pre-1.28 hosts type-compatible.

This is the prereq for SPEC 23A item A6 in the audric host (`<PostWriteRefreshSurface>` wrapper), where reads silently re-fired by the engine after a successful write need to render under a single grouped surface instead of stacking as standalone tool blocks. Pre-1.28 hosts inferred PWR-ness from the `wasPostWriteRefresh: true` boolean — that flag stays in the payload for one cycle as a deprecated alias.

### Added

- **`source?: 'pwr' | 'llm' | 'user'` on `EngineEvent.tool_start` + `EngineEvent.tool_result`** — typed in `packages/engine/src/types.ts`. Engine stamps every yield site in production; values are:
  - `'pwr'` — emitted by `runPostWriteRefresh` after a successful write to refresh affected reads (`balance_check`, `savings_info`, `health_check`). Currently 1 yield site.
  - `'llm'` — emitted in response to an LLM-issued `tool_use` block (default path). Currently 12 yield sites in `engine.ts` (incl. cache-hit, deduped, guard-blocked, bundle-cap, and early-dispatch `tool_start`/`tool_result` paths) + 5 in `orchestration.ts` + 2 in `early-dispatcher.ts`.
  - `'user'` — emitted by the regenerate flow (user-initiated quote refresh from the permission card). 2 yield sites in `regenerate.ts`.
- **`source: 'user'` is REQUIRED on `RegenerateTimelineEvent`** (not optional) — every regenerate event is user-initiated by construction. Hosts consuming `RegenerateTimelineEvent[]` arrays gain a literal-typed `source` field with no breakage (consumers were never constructing this type).
- **`source` mirrored on `SSEEvent.tool_start` + `SSEEvent.tool_result`** in `packages/engine/src/streaming.ts` — wire shape unchanged (`source` serializes naturally as a string, absent on pre-1.28 emissions).
- **3 new test assertions** covering all three source values:
  - `post-write-refresh.test.ts` — asserts PWR-injected `tool_result` events carry `source: 'pwr'` AND the original write tool's result carries `source: 'llm'`.
  - `regenerate.test.ts` — asserts every `RegenerateTimelineEvent` carries `source: 'user'`.
  - `early-dispatcher.test.ts` — asserts early-dispatched read `tool_result` events carry `source: 'llm'` (the LLM emitted the tool_use; the engine just chose to dispatch it before stream end — semantically still LLM-driven).

### Deprecated

- **`tool_result.wasPostWriteRefresh: boolean`** — superseded by `source === 'pwr'`. Engine continues to set both fields for one minor cycle so 1.27.x hosts keep working unchanged. Hosts upgrading to 1.28.0+ should consume `source === 'pwr'` going forward; the boolean will be removed in 1.29.0.

### Notes

- **Wire-format back-compat:** SSE payloads from a 1.28.0 engine to a 1.27.x host serialize cleanly — the new `source` field is silently ignored by older consumers. SSE payloads from a 1.27.x engine to a 1.28.0 host are also fine — `source` is `undefined`, hosts must defensively handle that during the transition.
- **Why optional on `EngineEvent` but required on `RegenerateTimelineEvent`:** keeping `source` optional on the wider `EngineEvent` union avoids a forced refactor of dozens of internal test fixtures that construct events without it. Required on `RegenerateTimelineEvent` because that type is narrower (only ever emitted by the regenerate flow), and hosts already consume rather than construct.
- **Audric host adoption** lands separately as SPEC 23A item A6 — `BlockRouter` will switch from `wasPostWriteRefresh`-based grouping to a `source === 'pwr'` check, then collapse PWR results under `<PostWriteRefreshSurface>`. Engine ships the contract first.

### Test results

- 1109/1109 engine tests passing (was 1108 in 1.27.2; +1 from new PWR source test).
- 0 lint errors / 0 type errors.
- ESM + DTS build green (422 KB / 184 KB unchanged).

## 1.14.0 (2026-05-04) — SPEC 13 Phase 2: 3-op atomic bundles

Raises `MAX_BUNDLE_OPS` from 2 to 3. The chain-handoff primitive shipped in 1.13.0 (`PendingActionStep.inputCoinFromStep` + `composeTx` orchestration) was always N-step generic — Phase 1 capped at 2 to soak. Phase 2 lifts the cap and enforces strict-adjacency: every consecutive `(i, i+1)` pair must be in `VALID_PAIRS`. No new pairs added; `swap_execute → swap_execute` (Demo 1 unlock) defers to Phase 3.

The chain-mode population loop in `composeBundleFromToolResults` already iterates every `(i, i+1)` since 1.13.0, so 3-op flows like `withdraw → swap → send` thread two coin handles end-to-end in one PTB without code changes — zero wallet round-trips between steps.

### Changed

- **`MAX_BUNDLE_OPS` raised from 2 → 3** in `compose-bundle.ts`. Hosts importing this constant for system-prompt construction get the new cap automatically.
- **Engine pair-whitelist check is now an N-pair loop** (was: hardcoded `length === 2` single check). Iterates `i in 0..N-2`, validates each `(steps[i], steps[i+1])` pair against `VALID_PAIRS`, fails the entire bundle on the first non-whitelisted pair (atomic — no salvage-prefix path). Telemetry tag `pair` reports the FIRST bad pair encountered. Engine over-cap rejection message updates from "capped at 2" to "capped at 3."

### Added

- **8 new Phase 2 engine tests** in `engine-bundle.test.ts`:
  - 3 cap tests: 2-op accepted, 3-op accepted (new cap line), 4-op rejected with `_gate: 'max_bundle_ops'`.
  - 3 happy-path 3-op composition tests: `withdraw → swap → send` (asset-aligned chain, both `inputCoinFromStep` populated), `withdraw → swap → save` (asset-aligned chain), and a documented dead-end note for terminal-producer permutations.
  - 3 invalid-topology 3-op tests: bad first pair (`send_transfer → withdraw → swap`), bad second pair (`withdraw → swap → withdraw`), all-bad (`send → send → send`). Each refuses the full bundle and reports the first bad pair in telemetry.
  - 1 chain-mode telemetry test: 3-op asset-aligned flow fires `engine.bundle_chain_mode_set` twice with correct `{producer, consumer}` labels, in adjacency order.
- **1 new SDK orchestration test** in `composeTx.test.ts`: 3-op `withdraw → swap → send` end-to-end. Asserts zero wallet `getCoins` calls (every consumer chains), zero `transferObjects` to sender (every producer's output is consumed downstream), exactly one `transferObjects` to recipient. Locks the producer-mid-chain orchestration loop behaviour where step 1 is both consumer of step 0 AND producer for step 2.

### SDK changes (`@t2000/sdk` 1.14.0, lockstep)

- **Zero functional changes.** `composeTx` orchestration was already N-step generic in 1.13.0; the validator iterates `opts.steps.length` and `priorOutputs[]` is indexed by step number. The 3-op SDK test confirms this — no shape changes were required, only test coverage.

### Audric host changes (audric repo, separate ship)

- **System prompt updated** in `audric/apps/web/lib/engine/engine-context.ts`: "atomic bundles capped at 3 ops, strict adjacency: every consecutive pair must be whitelisted" + a 3-op example (`withdraw 5 USDC → swap to SUI → send 1 SUI`). Token budget 10,193 / 10,200.
- **Bundle confirm cards** already iterate `steps[]` so 3-step rows render without UI changes.

### Test results

- 899/899 engine tests passing (was 891 in 1.13.1; +8 Phase 2 tests).
- 477/477 SDK tests passing (was 476; +1 Phase 2 3-op orchestration test).
- 1033/1033 audric tests passing.

### What's not in this ship (intentional)

- **`swap_execute → swap_execute`** stays out of `VALID_PAIRS`. Demo 1 ("Swap 10% to SUI, swap 50% to USDsui, save it, then send $1") still cap-splits. Phase 3 work — see SPEC 13 §"Phase 3".
- **DAG-aware validator.** Strict adjacency is the spec for Phase 2. Loosening (where non-chained adjacent steps can be any tool) is a Phase 3 follow-up, gated on production data showing common 3-op flows that fail strict adjacency.
- **Cap raise to 4.** Tied to Phase 3's `swap → swap` whitelist + DAG validator. Don't pre-emptively bump `MAX_BUNDLE_OPS` past 3 without those landing.

### Notes

- Phase 2 ships engine `1.14.0` + sdk `1.14.0` together. Audric host system-prompt update lands in audric after this publish completes.
- SPEC 13 doc bumped to v0.3 with Phase 2 status.
- SPEC 8 corpus extended to 7 P0-* prompts with P0-6 (`withdraw → swap → send`) and P0-7 (`withdraw → swap → save`) as Phase 2 acceptance gates. Each asserts ONE `txDigest` covers all 3 legs and `engine.bundle_chain_mode_set` fires twice.

## 1.13.1 (2026-05-04) — Chain-mode observability + bundle-card asset honesty

Patch follow-up to the SPEC 13 Phase 1 ship. Adds the production observability signal we couldn't infer from existing telemetry, and fixes a cosmetic bundle-card label bug surfaced during the P0-* corpus soak.

### Added

- **`engine.bundle_chain_mode_set` counter** — fired inside `composeBundleFromToolResults` whenever `shouldChainCoin` returns true and a step's `inputCoinFromStep` is populated. Tags: `{ producer, consumer }`. Lets hosts confirm chain-mode is actually firing per pair in production rather than silently falling back to wallet-mode for assets that happen to live in the wallet. Critical input for sizing Phase 2's "raise cap to 3" decision — without this counter, Phase 2 ships blind.
- **3 new chain-mode telemetry tests** in `engine-bundle.test.ts` covering: counter fires once with correct labels for an aligned whitelisted pair, counter does NOT fire for asset-misaligned pairs (wallet-mode fallback), counter does NOT fire for non-whitelisted pairs.

### Fixed

- **`describeAction` save_deposit** rendered "Save 4.997 USDC into lending" for a USDsui save (the on-chain action correctly deposited USDsui — only the bundle confirm-card label was wrong). Now reads `input.asset` and renders "Save 4.997 USDsui into lending". Per the savings-usdc-only.mdc strategic exception, save_deposit accepts both USDC and USDsui.
- **`describeAction` borrow** had the same class of bug — hardcoded `$X against collateral` with no asset surfaced. Now renders `Borrow $X USDC|USDsui against collateral`.
- **`describeAction` repay_debt** had the same class of bug — hardcoded `$X of outstanding debt` with no asset surfaced. Repay must use the same asset as the borrow per `savings-usdc-only.mdc`; surfacing the asset on the confirm card makes that constraint legible to the user.

### Notes

- All three asset-aware fixes default to `USDC` when `input.asset` is absent — matches the SDK's `resolveSaveableAsset` default, so behaviour is identical for the dominant USDC path.
- 891/891 engine tests passing (was 888/889). Type fix on `vi.fn` generic signature for compatibility with vitest 3.x's narrower mock types.

## 1.13.0 (2026-05-03 night) — SPEC 13 Phase 1: chained-coin handoff foundation

Lifts SPEC 13's central restriction. Multi-write bundles can now thread a producer's output coin handle directly into a downstream consumer's input slot inside one PTB — no wallet round-trip between steps. The May 3 production failures (`swap_execute(USDC→USDsui) + save_deposit(USDsui)` reverting at PREPARE because USDsui didn't exist in the wallet yet) become impossible by construction for the 7 whitelisted producer→consumer pairs when assets align.

The day-1 spike (`spec/SPEC_13_PHASE1_SPIKE_REPORT.md`) found every SDK builder was already structurally chain-ready (consumers accept `coin: TransactionObjectArgument`, producers return the handle, `addSwapToTx` already exposes both modes). Phase 1 is therefore a pure orchestration-layer change in `composeTx` plus one optional field on `PendingActionStep`.

### Added

- **`PendingActionStep.inputCoinFromStep?: number`** — optional index of an earlier step whose output coin handle is consumed as THIS step's input. Auto-populated by `composeBundleFromToolResults` for whitelisted producer→consumer pairs whose assets align.
- **`shouldChainCoin(producer, consumer)`** — exported from `@t2000/engine`. Returns `true` when the pair is in `VALID_PAIRS` AND producer output asset == consumer input asset (case-insensitive symbol comparison).
- **`inferProducerOutputAsset(toolName, input)`** + **`inferConsumerInputAsset(toolName, input)`** — exported helpers backing `shouldChainCoin`. Producer output: `swap.to`, `withdraw.asset`, `borrow.asset` (default `USDC`). Consumer input: `send.asset` / `save.asset` / `repay.asset` (default `USDC`), `swap.from`.
- **19 SPEC 13 chain-mode engine tests** in `engine-bundle.test.ts` covering inferProducerOutputAsset, inferConsumerInputAsset, shouldChainCoin gating (whitelisted+aligned, whitelisted+misaligned, non-whitelisted, case-insensitive), and `composeBundleFromToolResults` populating `inputCoinFromStep` for all 7 whitelisted aligned pairs.

### SDK changes (`@t2000/sdk` 1.13.0, lockstep)

- **`WriteStep.inputCoinFromStep?: number`** added to the consumer/dual variants (`save_deposit`, `repay_debt`, `send_transfer`, `swap_execute`, `volo_stake`, `volo_unstake`). Producer-only tools (`withdraw`, `borrow`, `claim_rewards`) don't accept it.
- **`AppenderContext.chainedCoin`** — passed by the orchestration loop to consumer appenders. When set, the consumer skips wallet pre-fetch via `selectAndSplitCoin` / `selectSuiCoin` and consumes the handle directly.
- **`AppenderContext.isOutputConsumed`** — set when a downstream step references this step. Producer appenders skip their terminal `tx.transferObjects([coin], ctx.sender)` when set, so the same handle isn't double-consumed.
- **`composeTx` orchestration loop** rebuilt — first pass validates every `inputCoinFromStep` reference (forward-only integers, terminal-consumer producers rejected) and computes `consumedSteps: Set<number>`; second pass dispatches each step with the appropriate `chainedCoin` / `isOutputConsumed` flags and captures producers' output handles into `priorOutputs[]`.
- **New error code `CHAIN_MODE_INVALID`** in `T2000ErrorCode` covering: forward-only violation, self-reference, future-reference, and "terminal consumer can't be a producer" misuse.
- **10 SPEC 13 chain-mode SDK tests** in `composeTx.test.ts` covering swap+save / withdraw+swap / withdraw+send / borrow+send happy paths, output-suppression invariant in wallet vs chain mode, single-step backward-compat, and all 4 validation error paths.

### Backward compat (locked)

- Single-step `composeTx({ steps: [{...}] })` shape unchanged — no `inputCoinFromStep` means wallet mode, identical to today.
- Multi-step bundles without `inputCoinFromStep` work identically to today (each step pre-fetches its own coin from wallet).
- Engine bundle envelope shape unchanged for hosts that don't yet honour the new field. They fall back to wallet mode at execute time, which remains correct for the 7 whitelisted pairs because every producer in those pairs leaves its output in the wallet via terminal `tx.transferObjects` (Phase 0 trick that lets the whitelist work without chained handoff).

### Notes

- Phase 1 ships engine `1.13.0` + sdk `1.13.0` together. Audric host wiring (forwarding `inputCoinFromStep` from the engine bundle envelope through `useAgent.executeBundle` → `/api/transactions/prepare`) lands in audric after this publish completes — `BundleStep` interface gains the optional field, `executeToolAction.ts`'s wireSteps mapping forwards it.
- SPEC 13 doc bumped to v0.2 with the spike result + revised effort estimate (~10d → ~2.75d).
- `MAX_BUNDLE_OPS=2` and `VALID_PAIRS` whitelist remain in place — Phase 2 will widen.

## 1.12.0 (2026-05-03 evening) — Phase 0: PTB chaining foundation prep + stream instrumentation

Strict-tightening of multi-write bundle composition while SPEC 13 (chained-coin handoff foundation) is being built. Pairs with the May 3 production review that found bundle failures reduce to a missing chain-handoff primitive in `@t2000/sdk` (every appender pre-fetches coins from the wallet via `selectAndSplitCoin`, which fails when the chained asset doesn't exist there yet — e.g. `swap_execute(USDC→USDsui) + save_deposit(USDsui)` reverts at PREPARE).

Also lands streaming instrumentation so we can diagnose the production "Response interrupted · retry" bug from real traffic (the bug is independent of bundles — bites simple flows too).

### Changed

- **`MAX_BUNDLE_OPS` lowered from 5 → 2.** Multi-write bundles are capped at exactly 2 ops in Phase 0. 3+ op compositions get all-step `_gate: 'max_bundle_ops'` errors so the LLM splits sequentially. The cap rises in Phase 2 (3-op chains via SPEC 13 step-graph validator) and Phase 5 (arbitrary). See `compose-bundle.ts:MAX_BUNDLE_OPS` JSDoc for rationale.

### Added

- **`VALID_PAIRS`** — the 7-pair Phase 0 chaining whitelist (`swap_execute → send_transfer | save_deposit | repay_debt`, `withdraw → swap_execute | send_transfer`, `borrow → send_transfer | repay_debt`). Exported from `@t2000/engine` so hosts can advertise the whitelist programmatically. Engine refuses any 2-op bundle whose (producer, consumer) pair is outside the set with `_gate: 'pair_not_whitelisted'`.
- **`checkValidPair(producer, consumer)`** — typed pair lookup helper. Returns `{ ok: true, pair }` on match, `{ ok: false, pair }` otherwise.
- **`engine.turn_outcome` counter** — fired at every `agentLoop` exit point with structured tags `{ entry: 'submit'|'resume', outcome: 'turn_complete' | 'pending_action_single' | 'pending_action_bundle' | 'pending_action_decline' | 'error_aborted' | 'error_budget' | 'max_turns' | 'guard_block_continue' | 'pair_not_whitelisted_continue' | 'max_bundle_ops_continue', stopReason? }`. Pairs with new `engine.turn_duration_ms` histogram and `engine.turn_turns_used` gauge. Hosts pair this with stream-close logging at the chat/resume route boundaries to diagnose the "Response interrupted" bug shape (engine emitted but host stream closed without delivering vs engine returned silently).
- **Engine event regression tests** — 7 whitelisted-pair acceptance tests, 6 non-whitelisted rejection tests (incl. swap+swap, borrow+swap, save+send, send+send, withdraw+save, repay+send), May 3 production-repro test for the 6-op compound flow.

### Notes

- Phase 0 cap+whitelist is paired with audric host system-prompt rules teaching the LLM the new shape (sequential by default, atomic only for whitelisted 2-op pairs). The engine is correct independently — the prompt rules just save round-trips.
- SPEC 13 (`spec/SPEC_13_PTB_CHAINING_FOUNDATION.md`, local-only) lays out the phased rollout to lift the cap. Phase 1 (chained-coin handoff primitive in the SDK) ships next.

## 0.47.0 (2026-04-27)

Audric Harness Intelligence v1.4 — vendor consolidation + harness instrumentation. Tagged `v0.47.0` and published in lockstep with `@t2000/sdk`, `@t2000/cli`, and `@t2000/mcp`.

### Breaking

- **Removed 7 `defillama_*` LLM tools.** `defillama_token_prices`, `defillama_price_change`, `defillama_yield_pools`, `defillama_protocol_info`, `defillama_chain_tvl`, `defillama_protocol_fees`, `defillama_sui_protocols` are gone. `protocol_deep_dive` retains its DefiLlama dependency (narrow scope, no equivalent on BlockVision).
- **Deleted `defillama-prices.ts`** and the inline DefiLlama fallback inside `tools/rates.ts`. Hosts importing `fetchTokenPrices` now get the BlockVision-backed implementation re-exported from `index.ts` — same name, different signature: `fetchTokenPrices(coinTypes, apiKey, cache?)`.
- **`PendingAction.attemptId: string`** is now a required field (UUID v4 stamped at yield time). Hosts that persist or rehydrate `PendingAction` need to round-trip the new field.

### Added

- **`packages/engine/src/blockvision-prices.ts`** — `fetchAddressPortfolio` and `fetchTokenPrices` against the BlockVision Indexer REST API (`api.blockvision.org/v2`). Sub-500ms portfolio fetches in production. Sui-RPC + hardcoded-stable allow-list degraded fallback when the API key is absent or 5xx.
- **`token_prices` tool** — single BlockVision-backed read tool replacing the two deleted `defillama_token_prices` / `defillama_price_change` LLM tools.
- **`balance_check` and `portfolio_analysis` rewired** to `fetchAddressPortfolio()`. Output shape unchanged (UI-compatible). vSUI exchange-rate workaround preserved.
- **`EngineConfig.blockvisionApiKey?: string`** and **`EngineConfig.portfolioCache?: Map<string, AddressPortfolio>`** — host wiring for the BlockVision integration.
- **`EngineConfig.onAutoExecuted` payload extended with `walletAddress?: string`** — populated from `config.walletAddress` so hosts can invalidate cross-session caches keyed by the user's address.
- **`ToolContext.blockvisionApiKey`** and **`ToolContext.portfolioCache`** — forwarded from `EngineConfig` and consumed by the BlockVision tools.
- **`argsFingerprint`** promoted from `__testOnly__` to a public export of `intent-dispatcher.ts` (Audric uses it for resumed-session prefetch dedup).

### Changed

- **Tool count** went from 40 (29 read, 11 write) to **34 (23 read, 11 write)**.

### Removed

- `packages/engine/src/defillama-prices.ts` (~85 lines)
- `packages/engine/src/tools/defillama.ts` (~500 lines, 7 tools)
- `fetchRatesFromDefiLlama` fallback inside `tools/rates.ts`

### Notes

- `protocol_deep_dive` is now the lone production consumer of `api.llama.fi`.
- This release is the engine half of the v1.4 spec (`AUDRIC_HARNESS_INTELLIGENCE_SPEC_v1.4.1.md`). The Audric web app side (`<financial_context>` system-prompt block, `UserFinancialContext` daily snapshot, TurnMetrics integrity columns, resume route instrumentation) ships in `audric/apps/web` and consumes this engine version via lockstep `@t2000/engine` + `@t2000/sdk` pinning.

## 0.1.0 (2026-02-19)

Initial release of `@t2000/engine` — the conversational finance engine powering Audric.

### Phase 1b — Core Engine

- **QueryEngine**: Stateful async-generator conversation loop with multi-turn support, tool dispatch, and abort handling
- **LLM Provider abstraction**: `LLMProvider` interface with `AnthropicProvider` (streaming, tool use, usage reporting)
- **Tool system**: `buildTool()` factory with Zod input validation, JSON schema generation, permission levels (`auto` / `confirm` / `explicit`), and concurrency classification (`isReadOnly`, `isConcurrencySafe`)
- **Orchestration**: `runTools()` executes read-only tools in parallel (`Promise.allSettled`) and write tools serially under `TxMutex`
- **Read tools**: `balance_check`, `savings_info`, `health_check`, `rates_info`, `transaction_history`
- **Write tools**: `save_deposit`, `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `pay_api`
- **Permission flow**: Asynchronous user confirmation for write tools — `permission_request` events with `resolve` callback and `AbortSignal` deadlock prevention
- **Cost tracking**: `CostTracker` with cumulative token usage, USD cost estimation, and configurable budget limits
- **SSE streaming**: `serializeSSE` / `parseSSE` for wire-safe transport, `PermissionBridge` for client-side permission resolution, `engineToSSE` adapter
- **Session store**: `MemorySessionStore` with configurable TTL and `structuredClone` isolation
- **Context window**: `estimateTokens` for rough token counting, `compactMessages` with three-phase strategy (summarize old tool results → drop old messages → truncate recent results) and `sanitizeMessages` to maintain valid tool_use/tool_result pairs
- **MCP server adapter**: `buildMcpTools` / `registerEngineTools` to expose engine tools to Claude Desktop, Cursor, and other MCP clients with `audric_` prefix
- **System prompt**: Default Audric prompt covering capabilities, guidelines, safety rules

### Phase 1d — MCP Client + NAVI Integration

- **MCP client**: `McpClientManager` — multi-server registry supporting `streamable-http` and `sse` transports, with connect/disconnect lifecycle and `isConnected()` checks
- **Response cache**: `McpResponseCache` — client-side TTL cache for read-only MCP responses
- **MCP tool adapter**: `adaptMcpTool` / `adaptAllMcpTools` / `adaptAllServerTools` — convert MCP-discovered tools into engine `Tool` objects with namespacing, passthrough Zod schema, and configurable permissions
- **NAVI MCP config**: `NAVI_MCP_CONFIG`, `NaviTools` enum with all 26 discovered tool names
- **NAVI transforms**: Pure functions (`transformRates`, `transformPositions`, `transformHealthFactor`, `transformBalance`, `transformSavings`, `transformRewards`) converting raw NAVI MCP JSON to typed engine structures with USD price conversion
- **NAVI composite reads**: `fetchRates`, `fetchHealthFactor`, `fetchBalance`, `fetchSavings`, `fetchPositions`, `fetchAvailableRewards`, `fetchProtocolStats` — orchestrate parallel MCP calls with transforms
- **MCP-first read tools**: `balance_check`, `savings_info`, `health_check`, `rates_info` updated with MCP-first strategy and SDK fallback, including SDK response normalization for type compatibility
