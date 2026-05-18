# Self-Hosted LLM Strategy

> Feasibility analysis and migration plan for replacing Anthropic API with a fine-tuned, self-hosted open-weights LLM for the Audric engine.
>
> **v0.3 — Last updated: 2026-05-13 ~18:00 AEST (Phase 1 promoted to SPEC 28)**
> **Status**: working notes, internal-only. Not approved roadmap. Phase 1 (Eval Harness) is now part of the canonical forward backlog as **SPEC 28 REGRESSION_HARNESS_v1** (slots after SPEC 26 closes).

---

## What changed since v0.1 (2026-02-19)

The original draft was written before SPEC 7, 8, 9, 10, the SPEC 23 harness UX cycle, the B-MPP series, harness intelligence v1.4 (BlockVision migration), harness correctness v1.4.2 (attemptId), and ~14 `@t2000/engine` releases. v0.2 reflects the actual May-2026 codebase state.

The thesis is unchanged: **eventually self-host, start collecting training data now.** What changed is that the data collection is already running, prompt caching is already shipped, two-tier model routing is already in production, and the tool inventory is ~2.6× larger than the original draft assumed. Several "future phases" are already done. The break-even point is later than v0.1 claimed.

---

## Executive Summary

Audric's engine uses Anthropic Claude Sonnet 4.6 as its primary model with two-tier routing to Claude Haiku 4.5 for low-effort turns. This works well at current volume but creates three structural exposures: **vendor concentration** (one provider for the entire reasoning surface), **inference cost** scaling linearly with usage, and **inability to specialize** the model on Audric-specific output formats (canvas templates, MPP receipt schemas, eval/proactive markers).

Our workload is a textbook fine-tuning candidate: **structured tool-calling** over 37 tools with natural-language wrapping, served from a stable orchestration shell (recipes, guards, financial context) that lives outside the LLM. That makes the LLM swappable in principle. In practice, the swap is bounded by streaming-protocol parity (extended thinking, eval/proactive markers, prompt caching) and by the engine's specific output conventions.

**The play:** keep using Anthropic at current volume; complete the eval and fine-tuning pipeline in parallel; re-evaluate the cutover when sustained traffic crosses ~3,000 sessions/day OR when a write-tool family (e.g. payment intents) demands a custom-trained safety profile we can't get from a frontier API.

---

## Why This Matters

| Problem | Today (Anthropic API) | Self-Hosted |
|---------|----------------------|-------------|
| **Cost per request (effective, with cache)** | ~$0.003-0.020 | ~$0.001-0.005 |
| **Latency (TTFT)** | 600-1,500ms | 100-400ms (local GPU) |
| **Vendor concentration** | 100% on one provider | Multi-tier: own infra primary, Anthropic fallback |
| **Rate limits** | Anthropic-imposed (org-wide) | Bounded by GPU fleet only |
| **Output specialization** | Prompt engineering + system prompt | Fine-tuning on canvas / MPP / marker conventions |
| **Data privacy** | API contract: no training, but data leaves our infra | Stays on our infra |
| **Competitive moat** | Equal access to anyone with an API key | Proprietary fine-tuned weights |

**On data privacy:** Anthropic's commercial API terms exclude API customer data from training. The privacy claim in v0.1 ("conversations sent to Anthropic") overstates the risk. The real concern is data residency / processor enumeration for compliance regimes that come with growth, not training-data leakage.

---

## Already Shipped (Don't Re-Plan)

The original v0.1 listed several items as "future phases." They are live in production today:

| v0.1 phase | Status today | Where |
|---|---|---|
| Phase 0 — Conversation logging | **DONE** | `ConversationLog` Prisma model writes role/content/toolCalls/tokens/cost per message |
| Phase 0 — Per-turn instrumentation | **DONE** | `TurnMetrics` table — effort, model, wallTime, firstTokenMs, toolsCalled, guardsFired, tokens, cost, cacheHit, cacheRead/Write, attemptId, sessionSpend, mutableToolDedupes, cacheSavingsUsd, synthetic flag, writeToolDurationMs |
| Phase 5 — Prompt caching | **DONE** | `packages/engine/src/prompt/cache.ts` — `cache_control: { type: 'ephemeral' }` on every static system block |
| Phase 5 — Two-tier routing | **DONE** | `packages/engine/src/classify-effort.ts` routes per-turn; `audric/web` uses Sonnet 4.6 default + Haiku 4.5 for `low` effort (factory at `apps/web/lib/engine/engine-factory.ts:138-140`) |

Net effect: we have a multi-month head start on a structured training corpus. We do not need to "start collecting data" — we need to start using what we have.

---

## Workload Profile

### Tool Inventory (37 tools)

Source of truth: `packages/engine/src/tools/index.ts` (READ_TOOLS + WRITE_TOOLS) plus opt-in `updateTodoTool` and `addRecipientTool`.

| Category | Tools | Frequency |
|---|---|---|
| **Wallet reads** | `balance_check`, `savings_info`, `health_check`, `portfolio_analysis`, `token_prices`, `pending_rewards` | Very High |
| **Market reads** | `rates_info`, `swap_quote`, `volo_stats`, `protocol_deep_dive` | Medium |
| **History / analytics** | `transaction_history`, `spending_analytics`, `yield_summary`, `activity_summary`, `explain_tx` | Medium |
| **Discovery / utility** | `mpp_services`, `web_search`, `resolve_suins`, `render_canvas` | Medium |
| **Receive surface (read)** | `list_payment_links`, `cancel_payment_link`, `list_invoices`, `cancel_invoice`, `create_payment_link`, `create_invoice` | Medium |
| **Save / borrow writes** | `save_deposit`, `withdraw`, `borrow`, `repay_debt` | High |
| **Yield writes** | `claim_rewards`, `harvest_rewards` (compound: claim → swap each non-USDC reward to USDC → deposit) | Low |
| **Pay / transfer writes** | `send_transfer`, `pay_api`, `swap_execute` | Medium-High |
| **Volo SUI staking writes** | `volo_stake`, `volo_unstake` | Low |
| **Misc writes** | `save_contact` | Low |
| **Opt-in (host wires)** | `update_todo` (SPEC 8), `add_recipient` (SPEC 9, yields `pending_input`) | Variable |

**Implications for fine-tuning:**
1. The model must learn ~37 tool schemas, not 14. Synthetic example coverage scales accordingly.
2. `pay_api` is special — its `url` parameter selects from a **dynamic, growing MPP catalog** of 40+ services exposed via `mpp_services`. The model must learn the meta-pattern (call `mpp_services` → pick → call `pay_api`), not memorize a fixed catalog. A snapshot-trained model would degrade as MPP grows; in-context tool discovery is load-bearing.
3. `harvest_rewards` is a compound write — single PTB, multiple legs, model must understand it's atomic.
4. `add_recipient` and `update_todo` emit structured events the model must format correctly.

### What the LLM Actually Decides

1. **Tool selection** — given the user message + recipe match (if any) + financial context
2. **Parameter extraction** — amounts, addresses, asset symbols, MPP service URLs, free-text descriptions
3. **Multi-tool orchestration** — parallel reads where safe (engine's `EarlyToolDispatcher` dispatches read-only + concurrency-safe tools mid-stream); serial writes under `TxMutex`
4. **Narration** — formatting tool results into financial summaries, including canvas HTML emission
5. **Markers** — `<eval_summary>` (inside thinking blocks), `<proactive>` (inside text blocks)

### What the LLM Doesn't Need to Decide (Engine handles)

- **Recipe scaffolding** — 6 YAML recipes (`audric/apps/web/lib/engine/recipes.ts`: `swap_and_save`, `safe_borrow`, `send_to_contact`, `portfolio_rebalance`, `account_report`, `emergency_withdraw`) provide deterministic step sequencing
- **Safety gating** — 14 guards across 3 priority tiers (safety / financial / ux) in `packages/engine/src/guards.ts` block invalid intents independently of model output
- **Permission tiering** — `resolvePermissionTier()` decides auto / confirm / explicit dispatch per write based on USD value × per-op rule × user preset (conservative/balanced/aggressive)
- **Microcompact** — duplicate tool calls in conversation history are dedup'd before re-prompting
- **Financial context** — `<financial_context>` block is built deterministically from a daily snapshot

### Conversation Characteristics

- Average turns per session: 3-8 (per `TurnMetrics` aggregation)
- Average tools per turn: 1-3 (cap 5; parallel reads count as one batch)
- System prompt size: ~12-18K tokens (identity + tool defs + active recipes + intelligence layer outputs)
- Per-turn dynamic context: 1-3K tokens (`<financial_context>` + AdviceLog + Chain Memory)
- Cache hit rate on a warm session: typically 70-85% on input tokens
- Output: structured tool calls (JSON with strict schemas) + narrative text + occasional canvas HTML

---

## Engine Intelligence Layers (the surrounding stack)

The LLM is one component in a 5-system stack. A self-hosted model swap **does not change** any of these layers — they all live in the engine and host code, and they consume / produce engine events that any provider must emit. Worth understanding because they shape what the model has to learn (and importantly, what it doesn't).

| System | What it does | Lives in |
|---|---|---|
| **Agent Harness** | Orchestrator: TxMutex serializes writes, `EarlyToolDispatcher` parallelizes reads mid-stream, microcompact dedups identical tool calls | `packages/engine/src/orchestration.ts` |
| **Reasoning Engine** | `classifyEffort()` heuristic routing, recipe matcher, 14 guards, preflight per write tool | `packages/engine/src/{classify-effort,guards,recipes}.ts` |
| **Silent Profile** | Daily Claude-inferred user financial profile, baked into `<financial_context>` block | `UserFinancialProfile` Prisma model + `buildProfileContext()` |
| **Chain Memory** | On-chain pattern facts (recurring sends, idle balances, position changes) | 7 chain classifiers + `ChainFact` rows + `buildMemoryContext()` |
| **AdviceLog** | Cross-session record of what the agent told the user, hydrated each turn | `AdviceLog` Prisma model + `buildAdviceContext()` (last 30 days) |

**Key implication for fine-tuning:** the model needs to learn to **respond to** these context blocks (read them and weave them into responses), not generate them. That's an easier learning task than building the intelligence itself.

---

## Defense-in-Depth (Why LLM Hallucinations Aren't Catastrophic)

Per `.cursor/rules/safeguards-defense-in-depth.mdc`, a write traverses **6 independent gates** before settling on-chain:

1. **UI gate** (host) — chip / drawer surfaces don't expose every operation freely
2. **Preflight** (engine) — every write tool implements `preflight(input)` returning `{valid, error}` synchronously, BEFORE the LLM round-trip completes
3. **Guards** (engine) — 14 guards across safety / financial / UX tiers run around every write; can `block`, `warn`, `hint`, or `pass`
4. **User confirmation** (host) — tap-to-confirm on every write at or above the user's permission threshold
5. **Server validation** (host) — `/api/transactions/prepare` re-validates amounts, addresses, asset whitelisting
6. **On-chain enforcement** — Sui contracts + NAVI / Cetus protocol invariants

Even if a fine-tuned model hallucinated "send 1M USDC to 0xdead", it would fail preflight (amount > 1M cap), then be blocked by the large-transfer guard, then never render a confirm card without correct USD pricing, then be rejected at the server-prep route. **The LLM is one defensive layer of six.**

This matters for the self-hosted analysis because it shifts the risk calculus: model accuracy still matters for UX (fewer corrections, less user friction), but model errors don't translate to catastrophic outcomes the way "LLM picks wrong tool → user loses money" framing implies.

---

## Model Candidates (May 2026)

Open-weights landscape moves quickly. Refresh this section quarterly.

### Tier 1: Best Fit (Primary candidates as of 2026-05-13)

| Model | Released | Params (Total/Active) | License | Why consider | Min hardware |
|-------|----------|----------------------|---------|--------------|-------------|
| **Qwen3.6-27B (Dense)** | 2026-04-22 | 27B dense | Apache 2.0 | Outperforms 397B MoE on agentic coding benchmarks; "Agentic Coding" optimization for repo-level reasoning | 1× H100 80GB |
| **Qwen3-Coder-Next** | 2026-02 | 80B / 3B active | Apache 2.0 | Tool-call optimized; XML-style tool format reduces JSON escaping overhead; trained on ~800K verifiable agentic tasks | 1× H100 |
| **DeepSeek V4 Flash** | 2026-04-24 | 284B / 13B active | MIT | Hybrid thinking/non-thinking, 1M context, agentic-leaning training, MIT license; #2 open-weights reasoning behind Kimi K2.6 | 2× H100 |

**Top pick to evaluate first: Qwen3-Coder-Next (80B/3B active).** The 3B active footprint means inference at Sonnet-Haiku speed range, the tool-call training is exactly our use case, and the XML-style tool format avoids a class of JSON-escaping failures we already see at the edges with current Sonnet output.

### Tier 2: Maximum Capability (overkill unless flagship reasoning needed)

| Model | Released | Params | Why consider | Hardware |
|-------|----------|--------|--------------|----------|
| **Kimi K2.6** | 2026-04-20 | MLA, 384 routed experts | #1 open-weights reasoning index; multimodal (vision + video); SWE-bench Pro leader | 4-8× H100 |
| **DeepSeek V4 Pro** | 2026-04-24 | 1.6T / 49B active | LiveCodeBench leader (93.5%); MIT; 1M context | 8× H200 |

Worth tracking but probably more capability than our agentic workload needs. Reconsider if we add complex multi-step financial planning.

### Tier 3: Fast Path (already partially served by Haiku 4.5)

A separate small-model fast-path is what `classifyEffort()` already does in production (Haiku 4.5 for `low` effort turns — single-fact reads like balance / rate / HF). If we self-host, the equivalent would be a 4-9B Qwen variant or distilled Qwen3-Coder-Next for the same routed cohort.

### Reasoning Models (Specifically Worth Evaluating)

Audric uses Anthropic's extended thinking on every turn. Open-weights reasoning models that emit thinking traces include:

- **DeepSeek V4 Pro/Flash hybrid mode** — toggleable thinking
- **Qwen3 thinking variants** — extended-thinking compatible
- **DeepSeek R1 family** — reasoning specialists

Worth evaluating these specifically for stream-event compatibility (see §Streaming Protocol Parity below).

---

## Architecture

### Today

```
User → Audric Web → /api/engine/chat → createEngine(SONNET_MODEL) → AnthropicProvider
                                                ↓
                            classifyEffort() → low → HAIKU_MODEL → AnthropicProvider
                                                ↓
                       agent loop ─ EarlyToolDispatcher (parallel reads)
                                  ─ TxMutex (serial writes)
                                  ─ recipes / guards / preflight
                                  ─ microcompact / context budgeting
                                                ↓
                       37 tools  +  <financial_context>  +  AdviceLog  +  Chain Memory
```

### Target

```
User → Audric Web → /api/engine/chat → createEngine(LLMRouter) → ┬→ VllmProvider     (≥80% of traffic)
                                                                  │   (fine-tuned model
                                                                  │    on our infra)
                                                                  │
                                                                  └→ AnthropicProvider (fallback)
                                                                      (complex / ambiguous /
                                                                       circuit-breaker open)
```

The orchestration layer (recipes / guards / dispatcher / mutex / context) is unchanged. Only the provider swaps.

### Provider Abstraction

`packages/engine/src/types.ts:1001`:

```typescript
interface LLMProvider {
  chat(params: ChatParams): AsyncGenerator<ProviderEvent>;
}
```

The interface is genuinely clean. But the **stream event contract** is not trivial — see next section.

### Serving Stack

```
AWS ECS or EKS
├── vLLM (inference server) — recommended
│   ├── Model: fine-tuned Qwen3-Coder-Next or Qwen3.6-27B
│   ├── GPU: 1× NVIDIA H100 80GB (per replica)
│   ├── Features: continuous batching, prefix caching, speculative decoding,
│   │             XGrammar / Outlines for constrained JSON tool inputs
│   └── API: OpenAI-compatible /v1/chat/completions + streaming
├── ALB w/ health checks
└── Autoscaling
    ├── Min: 1 instance (always warm)
    ├── Max: 4 instances (peak hours)
    └── Metric: request queue depth + P95 latency
```

---

## Streaming Protocol Parity (the underestimated work)

The "drop-in `LLMProvider`" estimate from v0.1 (~80 lines) was optimistic. The realistic implementation is **300-500 lines** because the engine consumes a richer event stream than vLLM's OpenAI-compat endpoint emits natively. Specifically, every provider must produce these `ProviderEvent` types (`packages/engine/src/types.ts:1026`):

| Event | Anthropic emits | vLLM OpenAI-compat | Mapping work |
|---|---|---|---|
| `text_delta` | ✓ | ✓ | Trivial |
| `text_done` | ✓ (with `proactive_marker` if `<proactive>` parsed) | ✗ — needs custom marker parsing | Buffer text, parse markers at content_block_stop equivalent |
| `thinking_delta` | ✓ (extended thinking) | Partial — varies by model + endpoint | Need reasoning-mode endpoint OR text-with-prefix convention |
| `thinking_done` | ✓ (with `eval_summary` parsing inside thinking) | ✗ | Custom parser; signature stub |
| `redacted_thinking` | ✓ | ✗ | Optional — emit if model supports |
| `tool_use_start` / `tool_use_delta` / `tool_use_done` | ✓ | ✓ (function calls) | Map function-call deltas to our schema |
| `usage` (with `cacheReadTokens` / `cacheWriteTokens`) | ✓ | Partial — vLLM reports prefix cache hits in newer versions | Map vLLM's prefix_cache_hit_tokens → cacheReadTokens |
| `message_start` / `stop` | ✓ | ✓ | Trivial |

The **`text_done` proactive marker parsing** and **`thinking_done` eval_summary parsing** are Audric-specific conventions baked into the AnthropicProvider. They have to be re-implemented in any new provider.

**Constrained decoding (XGrammar / Outlines)** in vLLM is the right answer to the "tool call format breaks" risk. Pass each tool's `input_schema` as a JSON-schema constraint and the decoder cannot emit invalid tool inputs at all. This is a feature, not a footnote.

---

## Cost Analysis

### What we actually pay (with caching)

Per `TurnMetrics`, our effective input rate is ~$0.30-1.00/M (cache hits at $0.30/M Sonnet, occasional misses at $3/M). Output stays at $15/M Sonnet, $5/M Haiku. Real per-session cost is **lower than v0.1's $0.01-0.05** estimate by 3-5×.

| Volume | Sessions/mo | Estimated cost (Sonnet+Haiku, with caching) |
|--------|-------------|---------------------------------------------|
| 100 users/day | ~3,000 | ~$45-90/mo |
| 1,000 users/day | ~30,000 | ~$450-900/mo |
| 3,000 users/day | ~90,000 | ~$1,400-2,700/mo |
| 10,000 users/day | ~300,000 | ~$4,500-9,000/mo |

*(Aggregate from `TurnMetrics.estimatedCostUsd` will give the exact current number for whatever volume we're at.)*

### Self-hosted (Qwen3-Coder-Next on AWS, May 2026 estimates)

| Setup | Hardware | Monthly cost (spot/on-demand mix) | Capacity (rough) |
|-------|----------|-----------------------------------|------------------|
| Min viable | 1× p5.xlarge spot | ~$1,100/mo | ~5,000 sessions/day |
| Growth | 2× p5.xlarge spot + autoscale | ~$2,200/mo base | ~15,000 sessions/day |
| Scale | 4× p5.xlarge mixed | ~$8,800/mo | ~40,000 sessions/day |

*(Verify current p5.xlarge spot pricing — values from v0.1 carry over but spot markets shift.)*

### Break-Even (Revised)

```
Anthropic monthly cost (with caching) = Self-hosted monthly cost
$1,400-2,700/mo ≈ $1,100-2,200/mo (1-2× H100 spot)

Revised break-even: ~3,000 sessions/day (~90,000 sessions/month)
```

v0.1 placed break-even at ~1,000 sessions/day because it ignored prompt caching. Real break-even is ~3× higher. After break-even, self-hosted stays roughly flat while API cost scales linearly. At 10,000 sessions/day, self-hosted is **~3-4× cheaper**, not 6×.

The break-even number is sensitive to cache-hit rate. A regression in cache hit rate (e.g., from frequent system-prompt changes) shifts break-even earlier.

---

## Fine-Tuning Plan

### Data Collection (already running)

`ConversationLog` + `TurnMetrics` already capture every turn in production. To convert to a training dataset:

1. **Filter** — successful conversations (no error rows, no user-initiated reset within 5 minutes), exclude `synthetic=true` rows
2. **Anonymize** — addresses, exact amounts, contact names → templated (`<addr_1>`, `<amount_usd>`, `<contact_name>`)
3. **Reconstruct** — assemble (system_prompt, message_history, tool_definitions) → assistant_response per turn
4. **Bucket** — by tool category, recipe match, effort level

**Target:** 10,000-50,000 quality turns (not conversations) before first fine-tune. At current TurnMetrics volume this is achievable in weeks, not months.

### Training Methodology

#### 1. Distillation from Anthropic (primary signal)

Take the existing `ConversationLog` corpus, replay the prompts through Sonnet 4.6 at `high`/`max` thinking effort, capture the higher-effort outputs as the supervised target. The teacher model exists; the data exists. This is more leverage than waiting for organic high-quality conversations.

#### 2. SFT — Supervised Fine-Tuning

Train on (input_context, ideal_output) pairs from distillation + filtered organic conversations:
- Tool selection accuracy (which tool given the user message + financial context + recipe)
- Parameter extraction (amounts in any phrasing; address validation; asset symbol resolution)
- Audric-specific output formats (canvas HTML, MPP card schemas, eval/proactive markers)

#### 3. DPO — Direct Preference Optimization

Pairs from `TurnMetrics` outcomes:
- **Preferred**: turn that landed (`pendingActionOutcome=approved` + no error in subsequent turn)
- **Rejected**: turn that was rejected, errored, or user re-prompted to correct

#### 4. LLM-as-Judge for Eval

Use Sonnet 4.6 / Opus 4.6 as a judge to grade fine-tuned model outputs on a 1,000-sample eval set. Cheaper than human eval, scales to thousands. Validate against a 50-sample human-graded subset for calibration.

#### 5. Constrained Decoding Bake-In

Train with XGrammar / Outlines constraints active during inference-time eval, so the model learns to operate within constrained-decode bounds rather than fighting them.

### Eval Criteria

| Metric | Target | How |
|--------|--------|-----|
| Tool selection accuracy | ≥ 98% | LLM-judge on 1,000 conversations |
| Parameter extraction accuracy | ≥ 99% | LLM-judge + exact-match for amounts/addresses |
| Safety compliance | 100% | Adversarial eval set (prompt-injection attempts, drain-account asks) — must hit guard or refuse |
| Marker emission correctness | ≥ 99% | Regex parse of `<eval_summary>`, `<proactive>` blocks; structured tool inputs validate against schema |
| Response quality | Within 5% of Sonnet | LLM-judge pairwise preference, calibrated against human ranking |
| Latency (TTFT) | ≤ 400ms p95 | vLLM benchmark on target hardware |
| Throughput | ≥ 100 tok/s | vLLM benchmark |

---

## Migration Plan

Numbered phases, with current status. Items marked **DONE** are already shipped.

### Phase 0 — Instrumentation (DONE)

`ConversationLog` + `TurnMetrics` write per-message and per-turn rows in production. No further action required.

### Phase 1 — Eval Harness (PROMOTED 2026-05-13 → SPEC 28 REGRESSION_HARNESS_v1)

> **Status update (2026-05-13 ~18:00 AEST):** This phase has been **merged with the original SPEC 24 F5 MPP smoke harness** to form **SPEC 28 — REGRESSION_HARNESS_v1** (`spec/SPEC_28_REGRESSION_HARNESS_v1.md` — to be drafted post-SPEC-26). Founder framing: combine MPP smoke (catches infra regressions like dall-e-3 deprecation, gpt-image-1 unsupported sizes) with LLM eval suite (catches prompt regressions like "LLM picked wrong tool" / "LLM hallucinated unsupported model" / "LLM auto-retried after vendor 4xx") so the next Founder smoke that catches a new bug class becomes a regression test before the fix ships. Closes the "whack-a-mole" pattern structurally; running them sequentially would be ~5d more total. **The original Phase 1 scope below stays canonical** — SPEC 28 imports it wholesale, plus the SPEC 24 F5 smoke probes, plus a cross-cutting test runner. See SPEC 28 for the integration plan.
>
> **Scope inherited by SPEC 28 (unchanged from original Phase 1):**

- Build eval harness over 200-500 real conversation traces from `ConversationLog`
- Implement LLM-judge scoring (Sonnet/Opus as judge)
- Test current Tier 1 candidates **zero-shot** (no fine-tuning) against our system prompt + tool definitions
- Identify the gap-to-Sonnet baseline per model
- **Bonus (now NOT bonus, it's the spec):** this harness composes with the old SPEC 24 F5 smoke probe set as a single SPEC 28 deliverable.

Cloud-rent GPUs (Lambda Labs / RunPod) for evals — no AWS commitment yet.

**Sequencing:** SPEC 28 ships AFTER SPEC 26 (MPP_SETTLE_ON_SUCCESS) so the eval harness has the post-26 charge contract to test against. Without SPEC 26, the smoke probes would only validate the broken charge-then-fail behavior. Order: Bug C/B disclaimer (✅ done) → SPEC 26 → **SPEC 28 (this phase)** → SPEC 11 → SPEC 11.5 → SPEC 16 → SPEC 27 → Audric Store launch.

### Phase 2 — Distillation + Fine-Tuning (Not Started, ~3 weeks)

- Build distillation pipeline (replay prompts through Sonnet 4.6 high-effort, capture as targets)
- Anonymize + dedupe + format SFT dataset (~10K-50K turns)
- Fine-tune top Tier 1 candidate on cloud GPUs (4× H100 for hours, not days)
- Run eval harness; iterate to ≥ 98% tool accuracy
- Synthetic edge cases (adversarial inputs, MPP catalog edge cases, multi-token amount phrasings)

### Phase 3 — Provider Implementation + Deployment (Not Started, ~3-4 weeks)

- Implement `VllmProvider` (~300-500 lines) — handles stream-event mapping, marker parsing, cache token reporting
- Implement `RouterProvider` — routes between `VllmProvider` and `AnthropicProvider` with circuit-breaker semantics
- Set up vLLM on AWS ECS with constrained-decoding enabled
- Deploy behind ALB with health checks + autoscaling
- **Shadow mode**: run both providers in parallel for a representative cohort, log discrepancies, no user-facing routing change

### Phase 4 — Gradual Rollout (Not Started, ~4 weeks)

- 5% traffic → self-hosted (closed cohort, paid users only — controlled blast radius)
- 25% → self-hosted (1 week soak; monitor `TurnMetrics` deltas vs Anthropic baseline)
- 75% → self-hosted (Anthropic for explicitly-routed complex turns + circuit-breaker fallback)
- Keep Anthropic indefinitely as fallback (graceful degradation, vendor-redundancy)

### Phase 5 — Continuous Optimization (Ongoing)

- Speculative decoding with a 4B draft model
- Two-tier self-hosted: small fast-path model + flagship for `medium`+ effort
- Monthly re-fine-tuning as `ConversationLog` accumulates
- Model refresh policy: re-eval Tier 1 quarterly (the open-weights landscape moves fast — Qwen3.6-27B in April was a step-change over Qwen3.5)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fine-tuned model hallucinates amounts | Medium | Bounded by 6-layer defense-in-depth | Eval harness + adversarial test set; preflight + guards catch independently |
| Tool-call format breaks | Low | High | **XGrammar / Outlines constrained decoding** in vLLM — model literally cannot emit invalid JSON |
| Stream-event mapping bugs | Medium | Medium | Shadow mode catches discrepancies before user-facing routing |
| GPU instance unavailable (spot) | Medium | Medium | On-demand fallback; multi-AZ; Anthropic fallback |
| MPP catalog drift degrades model | Medium | Medium | In-context tool discovery via `mpp_services` (already shipped); monthly re-fine-tune |
| Open model licensing changes | Low | Low | Stick to MIT / Apache 2.0; archive weights |
| Cache-hit regression shifts break-even earlier | Low | Medium | Track `cacheSavingsUsd` in `TurnMetrics`; alert on regression |
| New tool addition (SPEC 23 native content tools, etc.) breaks fine-tuned model | High while tool set is changing | Medium | Don't fine-tune until tool set has been stable for ≥ 1 quarter |

---

## Decision Framework

### Use Anthropic API today (current recommendation)

- We're below the ~3,000 sessions/day break-even.
- We're still actively adding tools (SPEC 23 native content tools next; SPEC 11 PayButton after; SPEC 24 gateway inventory).
- Frontier reasoning still matters for `harvest_rewards`, multi-leg recipes, and any new compound write we ship.

### Move toward self-hosted when (any one)

- Sustained traffic ≥ 3,000 sessions/day for 4+ weeks.
- Tool inventory stable for 1+ quarter (no new write families landing).
- A specific use case requires data residency that the API can't satisfy.
- A specific output convention (e.g. a domain-specific canvas DSL) needs custom-trained behavior.
- Anthropic has a sustained outage / pricing event that breaks the unit economics.

### Don't move when

- Tool set is changing (every new tool needs eval coverage; fine-tuning churn is expensive).
- Daily-active users < 1,000 (GPU min-instance cost dominates; net negative).
- Ahead of an adjacent capability launch (e.g. multimodal, voice) where Anthropic's roadmap is plausibly ahead.

**Today's call:** stay on Anthropic. Phase 1 (eval harness) is now **SPEC 28 REGRESSION_HARNESS_v1** — promoted out of "opportunistic" status into the canonical post-SPEC-26 slot. Defer Phase 2-4 until break-even threshold is in sight OR a specific data-residency / specialization need lands.

---

## References

- [vLLM](https://github.com/vllm-project/vllm) — inference server
- [Qwen3.6-27B announcement](https://www.marktechpost.com/2026/04/22/alibaba-qwen-team-releases-qwen3-6-27b-a-dense-open-weight-model-outperforming-397b-moe-on-agentic-coding-benchmarks/) — agentic-coding-optimized dense model
- [Qwen3-Coder-Next technical report](https://arxiv.org/html/2603.00729v1) — tool-call training methodology, XML-style tool format
- [DeepSeek V4 Pro/Flash](https://artificialanalysis.ai/articles/deepseek-is-back-among-the-leading-open-weights-models-with-v4-pro-and-v4-flash) — hybrid thinking, MIT, 1M context
- [Kimi K2.6](https://www.llmreference.com/compare/deepseek-v4/kimi-k2-6) — multimodal reasoning leader (April 2026)
- [XGrammar](https://github.com/mlc-ai/xgrammar) — constrained decoding for tool inputs
- [Outlines](https://github.com/dottxt-ai/outlines) — alternative constrained-decoding library
- Internal: `.cursor/rules/safeguards-defense-in-depth.mdc` — 6-layer safety stack
- Internal: `.cursor/rules/agent-harness-spec.mdc` — Spec 1 + Spec 2 contracts (attemptId, financial_context)
- Internal: `packages/engine/src/types.ts:1001` — `LLMProvider` interface canonical definition
- Internal: `packages/engine/src/classify-effort.ts` — current per-turn routing heuristic
- Internal: `apps/web/lib/engine/engine-factory.ts:138-140` — current Sonnet 4.6 + Haiku 4.5 model wiring
