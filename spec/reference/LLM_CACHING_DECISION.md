# LLM Response Caching

> **Status:** LOCKED — no Redis response cache; AI Gateway prompt cache covers the safe layer
> **Closes:** `SPEC_AI_SDK_HARDENING.md` P4.6
> **Tracked by:** `audric-build-tracker.md` S.308 (2026-05-24)
> **Last reviewed:** 2026-05-24

---

## The decision in one paragraph

The [Vercel caching doc](https://ai-sdk.dev/docs/advanced/caching) recommends two patterns for LLM response caching: (a) `wrapLanguageModel` middleware backed by Redis (caches raw `streamText` / `generateText` response per `JSON.stringify(params)` key), and (b) `onFinish` lifecycle callback caching (caches the final text after generation). **Audric will adopt NEITHER.** Caching LLM responses to finance content is structurally unsafe — a cached "your balance is $X" served 5 minutes after a withdrawal is wrong, and cache invalidation for "any prompt that includes balance / position / price data" is effectively every prompt (which defeats caching). Audric already has the SAFE caching layer via `providerOptions.gateway.caching: 'auto'` (Anthropic prompt cache via the AI Gateway) — it caches the system prompt + tool schemas + stable conversation prefix (the parts that DON'T contain user-specific stale data) while always regenerating the variable suffix (latest user message + tool results). That's the correct trade-off: speed wins on the heavy static prefix (~80% of tokens), correctness preserved on the dynamic suffix.

---

## Why response caching is unsafe for Audric

### The core problem: every chat answer references stale-able state

Audric's chat is a financial agent. Every meaningful answer references:

- Wallet balances (change with every transaction)
- DeFi positions / health factor (change with every borrow / withdraw / liquidation)
- Live APY (changes with NAVI pool utilization, sometimes minute-by-minute)
- Token prices (change every block)
- Recent activity (changes with every send / receive)

Caching the LLM response means: serve the SAME ANSWER twice in a row for the SAME PROMPT — even if the underlying state changed.

```
[10:00] User: "How much can I withdraw safely?"
        Agent: "You can withdraw up to $487 while keeping HF > 2.0"
        [Cached at key = hash(prompt + messages + tools)]

[10:05] User executes "withdraw $300"  → on-chain, HF drops to 1.4

[10:08] User: "How much can I withdraw safely?"  → SAME prompt hash
        Cache hit → Agent: "You can withdraw up to $487 while keeping HF > 2.0"
                              ^^^ now catastrophically wrong; HF would drop below 1.0
```

This is not a theoretical risk. It's the default failure mode of response caching applied to a financial agent. A single cache hit at the wrong time can produce advice that gets a user liquidated.

### Cache invalidation would be "every prompt"

The natural fix is "invalidate the cache when state changes." But:

1. Every chat turn ends with a tool call that returns wallet / position / price state.
2. The cache key includes the tool result history (otherwise turns N+1 reuse turn N's pre-write state).
3. Therefore every cache key is unique by tool-result content.
4. Which means: zero cache hits in practice, full machinery cost (Redis I/O, key construction, serialization) with zero speed benefit.

A cache with 0% hit rate isn't a cache. It's a tax.

### The "but read-only prompts could cache" argument is wrong

One might argue: "Cache only when the prompt is provably read-only and the state references are stable (e.g., 'explain how NAVI lending works')."

Three problems:

1. **Determining 'provably read-only' from a free-text prompt is the hard problem.** The LLM doesn't tell us pre-hoc which tools it'll use. We'd need a classifier to gate the cache — and a classifier that misclassifies a state-dependent prompt as "read-only" is exactly the worst failure mode.
2. **Anthropic prompt cache already handles this for educational prompts.** "Explain how NAVI lending works" sends a prompt with a heavily-cached system prefix; the LLM regenerates the variable answer. Speed wins via prompt cache (~30-50% input cost reduction) without correctness risk.
3. **The cardinality is too low to matter.** Most "explain X" prompts have phrasing diversity that defeats cache keys — `explain NAVI lending` vs `how does NAVI lending work` vs `tell me about NAVI lending` are all different cache keys but should return similar answers. Embedding-similarity caching solves this but adds another layer of complexity and correctness risk.

---

## What we DO have today (the safe layer)

### Anthropic prompt cache via AI Gateway

`audric/apps/web-v2/app/api/chat/route.ts` line 1281+ uses:

```ts
providerOptions: {
  gateway: { caching: 'auto' },
}
```

This routes through the AI Gateway, which auto-applies Anthropic's prompt caching `cache_control` headers on:

- The system prompt (~3-8K tokens — largely static across turns within a session)
- The tool schema definitions (~2-4K tokens — fully static)
- The stable conversation prefix (turn 1 messages stay cacheable through turn N)

What does NOT get cached (correctly):
- The latest user message (variable)
- The latest tool result content (variable per turn)
- The model's output (always freshly generated)

This produces the right behavior:
- **Speed**: ~30-50% input token cost reduction on cache-eligible portions
- **Correctness**: every answer is freshly generated; only the prompt cache is reused
- **Zero invalidation logic**: Anthropic + AI Gateway manage the cache lifecycle

### Prisma message persistence

Separately, audric persists every chat turn to the `Message` Prisma table:

- Provides chat history hydration on session resume
- Powers `getMessageText`, edit/regenerate flows, vote thumbs
- This is NOT "response caching" — it's session persistence. Same DB write per turn regardless.

The chatbot template's `onFinish`-based "caching" is actually this same pattern (a Drizzle row of finished messages). Calling it caching obscures what it is: just message persistence. Audric already does it via Prisma.

---

## What a Redis response cache would buy / cost

### Hypothetical Redis `wrapLanguageModel` cache

```ts
// NOT building this. Showing what we're declining.
const cachedModel = wrapLanguageModel({
  model: anthropic('claude-sonnet-4.6'),
  middleware: {
    transformParams: async ({ params }) => params,
    wrapStream: async ({ doStream, params }) => {
      const key = sha256(JSON.stringify(params));
      const cached = await redis.get(`llm:${key}`);
      if (cached) return cached; // ← THIS LINE IS THE BUG
      const stream = await doStream();
      await redis.set(`llm:${key}`, await streamToText(stream), 'EX', 60);
      return stream;
    },
  },
});
```

| Property | Reality |
|---|---|
| Cache hit rate (estimated) | <5% — most prompts unique by tool result content |
| Token cost reduction at 5% hit rate | ~5% × cost-per-turn = small |
| Latency reduction on cache hits | Real — saves 500-1500ms TTFT |
| Latency tax on cache misses (95% of turns) | ~5-20ms Redis I/O on every turn |
| **Correctness risk** | **Critical — stale state served as live advice** |
| Debug complexity | "Why is the answer stale? Is it the gateway cache or the Redis cache? Is it tool-result drift?" — debugging maze. |

The trade is: <5% hit rate + ~5% cost savings + small latency win on cache hits, at the price of **structural correctness risk + a second cache layer to debug**. Not worth it.

---

## When to revisit this decision

Re-read this doc when ANY of these lands:

1. **Anthropic deprecates prompt caching** OR the AI Gateway drops `caching: 'auto'` support. The safe layer disappears; we'd need to bring caching in-house. Even then, response caching is still wrong — we'd build a thin prompt-cache equivalent, not a response cache.
2. **A new tool whose result is PROVABLY static for a defined window** (e.g., a stable-coin price feed with a documented 60-min freshness budget, OR a permissionless protocol metadata tool whose output is immutable per address). That ONE tool could get a per-tool Redis cache at the SDK / engine layer (not the LLM response layer). Out of P4.6 scope; would be its own narrow decision.
3. **Traffic costs cross a threshold where the 5% savings become material** (e.g., 10x our current volume + sustained for >1 month). The math changes; revisit. But correctness risk doesn't change, so the answer is still likely no — instead, optimize the prompt cache hit rate (P3.1's activeTools narrowing already helps this).
4. **AI SDK ships a typed "safe cache" pattern that handles the staleness problem** — e.g., a middleware that takes a freshness predicate and refuses to serve cached responses when state-dependent tools were called. If such a primitive lands, revisit with a clean mental model.

---

## What we DO commit to (today, without response caching)

- **Anthropic prompt cache via AI Gateway** — stays as the primary speed-win layer. `providerOptions.gateway.caching: 'auto'` is the canonical config.
- **Prisma message persistence** — every chat turn writes to `Message`. Powers history hydration + edit / regenerate / vote.
- **Per-tool result budgeting** (`maxResultSizeChars` per tool) — already shipped, separate concern from response caching but related to "manage what tokens flow into the LLM."
- **P3.1 activeTools narrowing** — reduces per-turn context by ~3-5K tokens, indirectly improves prompt-cache hit rate by stabilizing the tool schema portion of cacheable prefix.

---

## Anti-pattern flag for future agents

If a future agent proposes "let's cache the LLM response in Redis for performance," the answer is no. Point them at this doc. The conversation has been had + the trade is structurally bad for our domain.

Caveats this doc does NOT cover (separate concerns, not "response caching"):

- Caching tool RESULTS (not LLM responses) — e.g., `getPortfolio(address)` cached for 60s. This is wallet-data caching, already shipped via `lib/portfolio.ts`. Doesn't have the same correctness problem because tool results are timestamped + invalidated post-write per S.301 (P3.4 `onStepFinish` cache invalidation).
- Caching the AI Gateway response cache layer itself — that's Vercel's job, transparent to us.
- Embedding cache (if we ever ship embeddings) — different primitive, different decision.

---

## Cross-references

- `audric/apps/web-v2/app/api/chat/route.ts:1281` — the `providerOptions.gateway.caching: 'auto'` config that ships the safe layer.
- `audric/apps/web-v2/lib/portfolio.ts` — the per-tool RESULT cache that's a distinct concern (60s wallet data cache, invalidated post-write via P3.4).
- `.cursor/rules/safeguards-defense-in-depth.mdc` — stale data as a correctness risk (cross-references this doc).
- `.cursor/rules/engineering-principles.mdc` — "trace the full path" (don't add cache layers without tracing failure modes; cross-references this doc).
- `spec/active/shipping/SPEC_AI_SDK_HARDENING.md` P4.6 — the SPEC item this doc closes.
- `audric-build-tracker.md` S.308 — ship record.
- [ai-sdk.dev/docs/advanced/caching](https://ai-sdk.dev/docs/advanced/caching) — the AI SDK caching doc.
- `t2000/CLAUDE.md` — cross-reference for future agents who might re-ask the question.
