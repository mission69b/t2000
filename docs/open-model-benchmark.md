# Open Model Benchmark Report — Audric Tool Set

> Phase F.2 — April 2026
>
> **⚠️ Stale tool count, model evaluation still current.** Report was written
> against the pre-simplification 50-tool engine. Post-April-2026 simplification
> the engine first dropped to 40 (29 read, 11 write) — deleting 9 tools
> (`allowance_status`, `toggle_allowance`, `update_daily_limit`,
> `update_permissions`, `create_schedule`, `list_schedules`, `cancel_schedule`,
> `pause_pattern`, `pattern_status`) and reclassifying 1 (`record_advice` moved
> to audric-side). The April-2026 v1.4 BlockVision swap then removed 7
> `defillama_*` tools and added 1 (`token_prices`); the SPEC 10 identity
> wave (May 2026) then added 1 read tool (`resolve_suins`), bringing the
> engine to its current shape: **35 tools (24 read, 11 write)**. None of
> these changes materially affect the open-weight comparison: tier mix is
> roughly the same,
> tool-selection accuracy requirement is the same, no nested-schema tool was
> removed. Treat the model rankings as still current; subtract from the absolute
> counts.

## Executive Summary

Audric's tool set consists of 35 tools (24 read, 11 write — post-v1.4 BlockVision swap + SPEC 10 `resolve_suins`) spanning balance checks, DeFi operations, payment processing, and analytics. This report evaluates open-weight models against these requirements to determine feasibility for cost reduction or self-hosting.

**Verdict:** No open model today can replace Sonnet for write flows (multi-step DeFi transactions). However, **Qwen 3.5 32B** or **Llama 4 Scout** could replace Haiku for read-only queries within 1–2 months of integration work via LiteLLM.

---

## Audric Tool Requirements

### Tool complexity tiers

| Tier | Count | Examples | Required model capability |
|------|-------|---------|--------------------------|
| Simple (empty or 1 param) | 18 | `balance_check {}`, `savings_info {}`, `health_check {}` | Basic tool selection |
| Medium (2–5 params, flat) | 25 | `send_transfer {to, amount}`, `borrow {amount}`, DeFiLlama tools | Accurate argument filling |
| Complex (nested/arrays) | 7 | `pay_api {url, method, body, headers}`, `create_invoice {items[]}`, `record_advice {advice[]}` | Structured output + nested schemas |

### Critical capabilities

1. **Tool selection accuracy** — choosing the right tool from 40 options
2. **Schema adherence** — filling arguments matching JSON Schema exactly
3. **Multi-turn reasoning** — executing 3–5 tool chain recipes (check → evaluate → execute)
4. **Permission awareness** — understanding auto vs. confirm tool boundaries
5. **Financial precision** — not hallucinating amounts, respecting decimals

---

## Model Evaluation

### Tier 1: Production-ready for read flows (Haiku replacement)

| Model | Params | Tool calling | Multi-turn | Latency | Cost (self-hosted) | Verdict |
|-------|--------|-------------|-----------|---------|---------------------|---------|
| **Qwen 3.5 32B** | 32B | BFCL 70.3% · strong schema adherence | Good for 2-turn chains | ~800ms (A100) | ~$0.15/M tokens | Best candidate — native tool calling, good at structured output |
| **Llama 4 Scout** | 109B (17B active MoE) | BFCL ~84% (70B class) · reliable | Solid | ~600ms (2xA100) | ~$0.10/M tokens | Fast MoE, good tool calling but needs more VRAM |
| **Mistral Small 4** | 24B | Good native FC | Good | ~500ms (A100) | ~$0.12/M tokens | Fast, but weaker on complex schemas than Qwen |

**Recommendation:** Qwen 3.5 32B via vLLM + LiteLLM proxy. Route identical to current Haiku path (low-effort only, read tools).

### Tier 2: Promising but not ready for Audric

| Model | Params | Blocker |
|-------|--------|---------|
| **Qwen 3.5 397B** | 397B (MoE) | Requires multi-GPU; BFCL not tested but likely strong |
| **Llama 4 Maverick** | 400B (MoE) | High infra cost, limited real-world FC testing |
| **DeepSeek V3** | 671B (MoE) | Strong reasoning but tool-calling quality inconsistent in benchmarks |
| **Gemma 4 27B** | 27B | Claims 50–80% better FC but limited independent verification |

### Tier 3: Not suitable

| Model | Reason |
|-------|--------|
| Sub-7B models | BFCL < 60%, fail on multi-tool selection from 50+ tools |
| Phi-4 | Good reasoning but tool calling not native; requires heavy prompt engineering |
| Code-focused models (Codestral, StarCoder) | Optimized for code generation, not tool orchestration |

---

## Audric-Specific Compatibility Concerns

### 1. Anthropic → OpenAI format translation

The engine uses Anthropic's message format (tool_result content blocks inside user messages). Open models use OpenAI's format (separate tool role messages). **LiteLLM handles this translation** but a recent fix (April 2026) was needed for vLLM-hosted models — ensure LiteLLM ≥ v1.72.

### 2. Tool count scalability

Audric presents 50+ tools per request. Open models below 32B struggle with selection accuracy at this scale. Mitigation: use the engine's `applyToolFlags` to filter tools contextually per query (e.g., exclude DeFiLlama tools for balance queries).

### 3. Multi-step recipes

The `RecipeRegistry` orchestrates 3–5 tool chains (e.g., borrow: health_check → rates_info → borrow). Open models handle 2-step chains reliably but degrade on 3+ steps. **This is why Sonnet remains required for write flows.**

### 4. Extended thinking

Haiku and open models skip `thinking.type: 'adaptive'`. This is correct — read-only queries don't benefit from extended thinking.

### 5. Permission handling

Open models sometimes ignore `permission: 'confirm'` instructions and attempt to provide tool results directly. The engine's `pending_action` mechanism catches this at the infrastructure level, but it wastes tokens on the failed attempt.

---

## Integration Architecture

```
User message
  │
  ├─ classifyEffort() → 'low'  → LiteLLM proxy → vLLM (Qwen 3.5 32B)
  │                     'medium' → Anthropic API → Sonnet 4.6
  │                     'high'   → Anthropic API → Sonnet 4.6
  │                     'max'    → Anthropic API → Opus 4.6
  │
  └─ All write tools still route to Sonnet/Opus (no change)
```

### Required changes

1. **LiteLLM proxy deployment** — Docker container, ~30 min setup
2. **New provider in `@t2000/engine`** — `OpenAICompatibleProvider` implementing `LLMProvider` interface
3. **Engine factory routing** — swap `HAIKU_MODEL` for `litellm/qwen3.5-32b` when `OPEN_MODEL_URL` env var is set
4. **Tool filtering** — for open model requests, reduce tool set to read-only subset (~18 simple tools)

### Estimated effort

| Task | Time |
|------|------|
| LiteLLM + vLLM deployment | 0.5 days |
| OpenAI-compatible provider | 1 day |
| Engine factory routing update | 0.5 days |
| Integration testing (all read flows) | 1 day |
| **Total** | **3 days** |

---

## Cost Comparison

| Configuration | Read query cost | Write query cost | Monthly estimate (1000 users, 20 queries/day) |
|--------------|----------------|-----------------|-----------------------------------------------|
| Current (Haiku + Sonnet) | ~$0.0008 | ~$0.006 | ~$800 |
| Open model + Sonnet | ~$0.0002 | ~$0.006 | ~$520 |
| Savings | | | **~35% on read queries** |

Self-hosted GPU cost (A100 80GB, ~$2/hr) amortizes well above ~500 active users.

---

## Recommendation

1. **Now:** Keep current Haiku + Sonnet routing. It works, it's tested, and volume doesn't yet justify infra.
2. **At 500+ users:** Deploy vLLM + Qwen 3.5 32B for read-only queries via LiteLLM.
3. **At 2000+ users:** Evaluate Qwen 3.5 397B (MoE) for medium-effort queries, potentially replacing Sonnet for simple write operations (save, withdraw).
4. **Never (with current models):** Replace Sonnet for multi-step write recipes (borrow, swap, pay_api). The accuracy gap is too large for financial transactions.

---

## Appendix: Test Matrix

If implementing open model routing, validate these flows:

| Flow | Tools involved | Pass criteria |
|------|---------------|--------------|
| Balance check | `balance_check` | Correct tool selected, empty args |
| Rate query | `rates_info` | Correct tool, formatted response |
| Savings info | `savings_info` | Correct tool, APY displayed |
| Health check | `health_check` | Correct tool, HF interpreted |
| Price lookup | `token_prices` | Correct token symbols passed (BlockVision-backed; replaced `defillama_token_prices` in v1.4) |
| TX history | `transaction_history` | Optional limit param correct |
| Web search | `web_search` | Query string passed, results summarized |
| Portfolio | `portfolio_analysis` | Correct tool selection from 50+ options |
| "What is my balance?" | No tool (if prefetched) | Model uses context, doesn't re-call tool |
| "Hi" / "Thanks" | No tool | Model responds without tool call |
