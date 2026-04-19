# Self-Hosted LLM Strategy

> Feasibility analysis and migration plan for replacing Anthropic API with a fine-tuned, self-hosted open-source LLM for the Audric engine.
>
> Last updated: 2026-02-19

---

## Executive Summary

Audric's engine currently uses Anthropic Claude (Sonnet) via API for every user interaction. This works at low volume but creates three scaling problems: **cost** (~$3-15/M input tokens), **latency** (network round-trip to Anthropic), and **vendor lock-in** (our entire product depends on a single provider's API stability and pricing).

Our use case is highly structured — the LLM primarily performs **tool-calling** (14 financial tools) with natural language wrapping. This is an ideal candidate for fine-tuning a smaller open-source model that outperforms a general frontier model on our specific domain.

**The play:** Collect conversation data now, fine-tune a compact model on DeFi tool-calling, deploy on AWS, and cut inference costs 10-50x while reducing latency to <500ms.

---

## Why This Matters

| Problem | Today (Anthropic API) | Self-Hosted |
|---------|----------------------|-------------|
| **Cost per request** | ~$0.01-0.05 (Sonnet, multi-turn) | ~$0.001-0.005 |
| **Latency (TTFT)** | 800-2000ms (network + queue) | 100-400ms (local GPU) |
| **Vendor lock-in** | 100% dependent on Anthropic | Zero — swap models freely |
| **Rate limits** | Anthropic-imposed | Only limited by GPU fleet |
| **Data privacy** | All conversations sent to Anthropic | Stays on our infra |
| **Customization** | Prompt engineering only | Full fine-tuning on our data |
| **Competitive moat** | None — anyone can use same API | Fine-tuned model = proprietary edge |

---

## Our Workload Profile

Understanding what the LLM actually does in Audric is critical for choosing the right model.

### Tool Inventory (14 tools)

| Tool | Type | Frequency | Complexity |
|------|------|-----------|------------|
| `balance_check` | Read | Very High | Low — single RPC call |
| `savings_check` | Read | High | Low |
| `health_check` | Read | Medium | Low |
| `rates_check` | Read | Medium | Low |
| `transaction_history` | Read | Medium | Low |
| `save_deposit` | Write | High | Medium — amount parsing, confirmation |
| `save_withdraw` | Write | High | Medium |
| `transfer` | Write | Medium | Medium — address validation |
| `borrow` | Write | Low | High — health factor awareness |
| `repay` | Write | Low | Medium |
| `claim_rewards` | Write | Low | Low |
| `pay_api` | Write | Medium | High — MPP service selection, URL construction |
| `swap_quote` | Read | Low | Medium |
| `navi_info` | Read | Low | Low |

### What the LLM Actually Decides

1. **Tool selection**: Which tool(s) to call given a user request
2. **Parameter extraction**: Parsing amounts, addresses, service URLs from natural language
3. **Multi-tool orchestration**: Calling balance_check before save_deposit, or multiple reads in parallel
4. **Safety checks**: Refusing to drain accounts, warning on low health factors
5. **Response generation**: Formatting results as concise financial summaries
6. **MPP routing**: Mapping "what's the weather" to the correct MPP endpoint with correct parameters

### Conversation Characteristics

- Average turns per session: 3-8
- Average tools per turn: 1-3
- Context window needed: ~8K tokens (most sessions), ~32K (long sessions with history)
- Languages: English (primary), potential multilingual later
- Structured output: Tool calls are JSON — strict schema adherence required

---

## Model Candidates

### Tier 1: Best Fit (Recommended)

| Model | Params (Total/Active) | Tool-Calling | License | Min Hardware | Estimated Cost |
|-------|----------------------|--------------|---------|-------------|----------------|
| **Qwen3.5-35B-A3B** | 35B / 3B active | Excellent | Apache 2.0 | 1x H100 80GB | ~$3/hr (spot) |
| **MiMo-V2-Flash** | 309B / 15B active | Best-in-class | MIT | 2x H100 | ~$6/hr |
| **GLM-4.7-Flash** | 30B MoE | Strong agentic | Open | 1x H100 | ~$3/hr |

**Qwen3.5-35B-A3B is the top pick.** Only 3B active parameters means blazing inference speed, yet it outperforms models 10x its active size. Fine-tuned on our 14 tools, it would be surgical.

### Tier 2: Maximum Capability

| Model | Params | Why Consider | Hardware | Cost |
|-------|--------|-------------|----------|------|
| **DeepSeek-V3.2** | 671B MoE | Frontier reasoning, MIT license | 8x H200 | ~$24/hr |
| **Kimi-K2.5** | 1T / 32B active | Agent Swarm, 256K context | 4x H100 | ~$12/hr |
| **Qwen3.5-397B-A17B** | 397B / 17B active | Flagship, 262K context | 4-8x H100 | ~$12-24/hr |

These are overkill for our use case unless we expand into complex multi-step financial planning.

### Tier 3: Ultra-Lightweight (Edge/Mobile)

| Model | Params | Use Case |
|-------|--------|----------|
| **Qwen3.5-4B** | 4B | On-device inference, mobile app |
| **Qwen3.5-9B** | 9B | Lightweight server, quick responses |

Could serve as a "fast path" for simple queries (balance checks) while routing complex ones to the larger model.

---

## Architecture

### Current Architecture

```
User → Audric Web → API Route → QueryEngine → Anthropic API → Response
                                     ↓
                              14 Financial Tools
```

### Target Architecture

```
User → Audric Web → API Route → QueryEngine → LLM Router → Response
                                     ↓              ↓
                              14 Financial Tools    ├── Self-Hosted (95% of requests)
                                                    │   (vLLM on AWS, fine-tuned model)
                                                    └── Anthropic Fallback (5%)
                                                        (complex/ambiguous queries)
```

### Provider Abstraction (Already Exists)

The engine already has a clean `LLMProvider` interface:

```typescript
interface LLMProvider {
  chat(params: ChatParams): AsyncGenerator<ProviderEvent>;
}

interface ChatParams {
  messages: Message[];
  systemPrompt: string;
  tools: ToolDefinition[];
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}
```

Swapping Anthropic for a self-hosted model means implementing a new `LLMProvider` that points at our vLLM endpoint. The `QueryEngine`, tools, and all business logic stay identical. This is a <100 line change.

### Serving Stack

```
AWS ECS/EKS
├── vLLM (inference server)
│   ├── Model: fine-tuned Qwen3.5-35B-A3B
│   ├── GPU: 1x NVIDIA H100 80GB
│   ├── Features: continuous batching, prefix caching, speculative decoding
│   └── API: OpenAI-compatible /v1/chat/completions
├── Load Balancer (ALB)
│   └── Health checks, autoscaling triggers
└── Autoscaling
    ├── Min: 1 instance (always warm)
    ├── Max: 4 instances (peak hours)
    └── Metric: request queue depth + P95 latency
```

---

## Fine-Tuning Plan

### Data Collection (Start Now)

Every Audric conversation is gold. We need to capture:

```typescript
interface TrainingExample {
  messages: Message[];        // Full conversation history
  tools: ToolDefinition[];    // Available tools for this turn
  systemPrompt: string;       // System prompt used
  outcome: {
    toolsCalled: string[];    // Which tools the model chose
    toolInputs: unknown[];    // Parameters it extracted
    userSatisfied: boolean;   // Did the user complete the flow?
    errorOccurred: boolean;   // Did a tool error happen?
  };
}
```

**Collection strategy:**
1. Log every completed conversation to a training data store (S3 or DB)
2. Filter for successful interactions (user completed their intent)
3. Include negative examples (errors, corrections) for robustness
4. Anonymize addresses and amounts (replace with templates)

**Target:** 10,000 quality conversations before fine-tuning. At current usage, estimate 2-4 months.

### Fine-Tuning Approach

**Method:** Supervised Fine-Tuning (SFT) + DPO (Direct Preference Optimization)

1. **SFT Phase**: Train on successful conversation traces
   - Input: user message + conversation history + available tools
   - Output: assistant response (tool calls + text)
   - Focus: tool selection accuracy, parameter extraction, response quality

2. **DPO Phase**: Train on preference pairs
   - Preferred: conversations that completed successfully
   - Rejected: conversations with errors, corrections, or user frustration
   - Focus: safety, not hallucinating amounts, appropriate tool selection

3. **Tool-Call Specific Training**:
   - Generate synthetic tool-calling examples covering edge cases
   - "Save all my money" → balance_check first, then save_deposit with correct amount
   - "What's the weather in Sydney?" → pay_api with correct OpenWeather endpoint
   - "Send $100 to 0xabc..." → validate address, check balance, transfer
   - Amount parsing: "five bucks", "$5", "5 USDC", "5 sui worth of usdc" → all resolve correctly

### Evaluation Criteria

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Tool selection accuracy | >98% | Does it pick the right tool(s)? |
| Parameter extraction accuracy | >99% | Are amounts, addresses correct? |
| Safety compliance | 100% | Never fabricates balances or executes without confirmation |
| Response quality | Parity with Sonnet | Human eval on 200 samples |
| Latency (TTFT) | <400ms | Benchmark on target hardware |
| Throughput | >100 tok/s | vLLM benchmark |

---

## Cost Analysis

### Current (Anthropic API)

| Volume | Monthly Input Tokens | Monthly Output Tokens | Monthly Cost |
|--------|--------------------|--------------------|-------------|
| 100 users/day | ~30M | ~15M | ~$135 |
| 1,000 users/day | ~300M | ~150M | ~$1,350 |
| 10,000 users/day | ~3B | ~1.5B | ~$13,500 |

*Based on Sonnet pricing: $3/M input, $15/M output. Average 3K input + 1.5K output per session.*

### Self-Hosted (Qwen3.5-35B-A3B on AWS)

| Setup | Hardware | Monthly Cost | Capacity |
|-------|----------|-------------|----------|
| Min viable | 1x p5.xlarge (H100) spot | ~$1,100/mo | ~5,000 sessions/day |
| Growth | 2x p5.xlarge spot + autoscale | ~$2,200/mo base | ~15,000 sessions/day |
| Scale | 4x p5.xlarge on-demand | ~$8,800/mo | ~40,000 sessions/day |

### Break-Even Point

```
Anthropic monthly cost = Self-hosted monthly cost
$1,350/mo (API) ≈ $1,100/mo (1x H100 spot)

Break-even: ~1,000 users/day (~30,000 sessions/month)
```

After break-even, self-hosted cost stays roughly flat while API cost scales linearly. At 10,000 users/day, self-hosted is **~6x cheaper**.

---

## Migration Plan

### Phase 0: Instrumentation (Now — 0 effort)

**Goal:** Start collecting training data immediately.

- [ ] Add conversation logging to the engine (messages, tool calls, outcomes)
- [ ] Store in S3 or a dedicated table (anonymized)
- [ ] Track success/failure signals per conversation
- [ ] No model changes, no infrastructure changes

**Timeline:** 1 day of work, then runs passively.

### Phase 1: Evaluation (Month 2-3)

**Goal:** Benchmark open models against Anthropic on our workload.

- [ ] Build an eval harness: 200 real conversation traces, measure tool accuracy
- [ ] Test Qwen3.5-35B-A3B, MiMo-V2-Flash, GLM-4.7-Flash (zero-shot, no fine-tuning)
- [ ] Test with our exact system prompt and tool definitions
- [ ] Measure: tool selection accuracy, parameter extraction, latency, cost
- [ ] Identify gaps vs Anthropic (if any)

**Timeline:** 1-2 weeks. Can use cloud GPU rental (Lambda, RunPod) — no AWS commitment yet.

### Phase 2: Fine-Tuning (Month 3-4)

**Goal:** Fine-tune the best candidate on our collected data.

- [ ] Prepare training dataset (clean, deduplicate, format for SFT)
- [ ] Fine-tune on cloud GPUs (Lambda Labs or similar — 4x H100 for a few hours)
- [ ] Run eval harness against fine-tuned model
- [ ] Iterate until tool accuracy >98%
- [ ] Generate synthetic edge cases for robustness

**Timeline:** 2-3 weeks of iterative training/eval.

### Phase 3: Deployment (Month 4-5)

**Goal:** Deploy fine-tuned model on AWS behind the existing engine.

- [ ] Set up vLLM on AWS ECS (or EKS if we need autoscaling)
- [ ] Implement `VllmProvider` (new `LLMProvider` implementation, ~80 lines)
- [ ] Implement `RouterProvider` that routes between self-hosted and Anthropic
- [ ] Deploy behind ALB with health checks
- [ ] Shadow mode: run both providers, compare results, log discrepancies

**Timeline:** 2 weeks for infra, 1 week for the provider implementation.

### Phase 4: Gradual Rollout (Month 5-6)

**Goal:** Shift traffic from Anthropic to self-hosted.

- [ ] 10% traffic → self-hosted (monitor error rates, user satisfaction)
- [ ] 50% traffic → self-hosted (1 week soak)
- [ ] 90% traffic → self-hosted (Anthropic fallback for failures only)
- [ ] Keep Anthropic as fallback indefinitely (graceful degradation)

**Timeline:** 4 weeks of gradual rollout with monitoring.

### Phase 5: Optimization (Ongoing)

- [ ] Implement prefix caching for system prompt (saves ~40% on input tokens)
- [ ] Speculative decoding with a smaller draft model
- [ ] Explore two-tier routing: lightweight model for simple queries, full model for complex
- [ ] Continuous fine-tuning as more data accumulates
- [ ] Evaluate new model releases (the open-source landscape moves fast)

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fine-tuned model hallucinates amounts | Medium | Critical | Extensive eval on financial accuracy; keep Anthropic fallback |
| Tool-calling format breaks | Low | High | Constrained decoding in vLLM; strict JSON schema validation |
| GPU instance unavailable (spot) | Medium | Medium | On-demand fallback; multi-AZ; Anthropic fallback |
| Model degrades on new tool additions | Medium | Medium | Re-fine-tune when adding tools; eval harness catches regressions |
| Open model licensing changes | Low | Low | MIT/Apache models; keep copies of model weights |
| Latency worse than expected | Low | Medium | Benchmark before committing; vLLM optimizations |

---

## Decision Framework

**Use Anthropic API when:**
- < 1,000 sessions/day (not cost-effective to run GPUs)
- Rapid prototyping / changing tools frequently
- Need frontier reasoning for a new capability

**Use self-hosted when:**
- > 1,000 sessions/day (break-even point)
- Tool set is stable and well-defined
- Latency matters (real-time financial operations)
- Data privacy requirements increase
- Want a competitive moat via fine-tuned specialization

**Current recommendation:** Stay on Anthropic. Start Phase 0 (logging) today. Revisit at 500+ daily active users.

---

## References

- [vLLM](https://github.com/vllm-project/vllm) — High-throughput LLM serving
- [Qwen3.5 Model Family](https://qwenlm.github.io/blog/qwen3.5/) — Model card and benchmarks
- [MiMo-V2-Flash](https://github.com/XiaoMi/MiMo) — Xiaomi's agent-optimized model
- [DeepSeek-V3.2](https://github.com/deepseek-ai/DeepSeek-V3) — MIT-licensed frontier model
- [BentoML LLM Guide](https://www.bentoml.com/blog/navigating-the-world-of-open-source-large-language-models) — Open-source LLM landscape 2026
- [AWS GPU Instances](https://aws.amazon.com/ec2/instance-types/p5/) — P5 (H100) pricing
