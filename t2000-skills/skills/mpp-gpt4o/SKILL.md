---
name: mpp-gpt4o
description: >-
  Call GPT-4o (or any OpenAI chat model) via `t2000 pay` against the
  MPP-protected endpoint at https://mpp.t2000.ai/openai/v1/chat/completions.
  Use when asked to "ask GPT", summarize text, answer a question, extract
  structured data, classify, translate (when DeepL is overkill), or chain
  reasoning through a hosted LLM. Pay-per-request (~$0.01 USDC). No API
  key, no account. Returns standard OpenAI Chat Completions response shape.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init) + funded USDC balance
---

# MPP Recipe: GPT-4o Chat Completions

## When to use

The user asks for any of:

- "Ask GPT / ask ChatGPT / ask 4o …"
- "Summarize this article …"
- "Extract names from this text …"
- "Classify these support tickets …"
- "Translate (and DeepL isn't right — e.g., needs context, idiom, or chain-of-thought)"

For image generation use `mpp-image-gen`. For audio → text use `mpp-transcription`. For cheaper text models see Together AI / Mistral / DeepSeek in `mpp-index`.

## Rules

1. **Don't pay for a chat call you can do with Claude (the local LLM you're running inside) for free.** Use `t2000 pay` against `/openai/v1/chat/completions` only when the user EXPLICITLY wants GPT-4o, or when the local model can't see the content (e.g., a URL that requires GPT-4o vision).
2. **Always pass `model` explicitly.** Default upstream selection drifts. Common: `gpt-4o`, `gpt-4o-mini` (10x cheaper but still $0.01 per call in MPP pricing), `o1-mini`.
3. **Bound `max_tokens` for unbounded prompts.** Without it, GPT can run 4096 tokens and you pay full price for filler. Set 200-500 for summarization, 50-100 for classification.
4. **No streaming over `t2000 pay`.** The CLI returns the final JSON; if you need a streaming UX, switch to direct SDK use (`mppx`).
5. **One request = one paid call.** Multi-turn conversations cost $0.01 per turn — surface this if you expect > 10 turns.

## The fast path

```bash
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Summarize the Sui consensus algorithm in 3 sentences."}
    ],
    "max_tokens": 200
  }'
```

## Returns

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1716700000,
  "model": "gpt-4o-2024-08-06",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "Sui uses ..."},
      "finish_reason": "stop"
    }
  ],
  "usage": {"prompt_tokens": 14, "completion_tokens": 87, "total_tokens": 101}
}
```

**Key field:** `choices[0].message.content` — the assistant reply. Extract with `jq -r '.choices[0].message.content'` for piping.

## Tuning knobs

| Field | Default | When to set |
|---|---|---|
| `model` | `gpt-4o` | `gpt-4o-mini` for cost-sensitive batches (same $0.01 in MPP, but faster). `o1-preview` / `o1-mini` for reasoning tasks. |
| `temperature` | `1.0` | `0` for deterministic (classification, extraction). `0.7` for creative. |
| `max_tokens` | upstream default (long!) | Always set for predictable spend + latency. |
| `messages[].role` | — | Standard `system` / `user` / `assistant` chain. Multi-turn supported. |

## Common patterns

**Classify support tickets (deterministic):**
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data '{
    "model": "gpt-4o-mini",
    "temperature": 0,
    "max_tokens": 20,
    "messages": [
      {"role": "system", "content": "Classify the ticket as one of: BILLING, BUG, FEATURE, OTHER. Reply with one word."},
      {"role": "user", "content": "My card was charged twice last week"}
    ]
  }'
```

**Vision — describe an image URL:**
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data '{
    "model": "gpt-4o",
    "max_tokens": 300,
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image? Be specific about the architectural style."},
        {"type": "image_url", "image_url": {"url": "https://example.com/building.jpg"}}
      ]
    }]
  }'
```

**Structured extraction (JSON mode):**
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data '{
    "model": "gpt-4o",
    "max_tokens": 500,
    "messages": [
      {"role": "system", "content": "Extract every person mentioned. Reply with valid JSON only: {\"people\": [{\"name\": \"...\", \"role\": \"...\"}]}"},
      {"role": "user", "content": "Alice (CEO) and Bob (CTO) met with Carol from Acme."}
    ]
  }'
```

Then `jq '.choices[0].message.content | fromjson'` to parse.

**Summarize a scraped page (chain with Firecrawl):**
```bash
# Step 1: scrape ($0.01)
CONTENT=$(t2000 pay https://mpp.t2000.ai/firecrawl/v1/scrape \
  --data '{"url":"https://example.com/article"}' \
  --json | jq -r '.data.markdown')

# Step 2: summarize ($0.01)
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data "$(jq -nc --arg c "$CONTENT" '{
    model: "gpt-4o",
    max_tokens: 300,
    messages: [
      {role: "system", content: "Summarize in 5 bullets."},
      {role: "user", content: $c}
    ]
  }')"
```

## Cost guard

- **Per-call pricing is fixed at $0.01** in MPP regardless of input/output tokens. The gateway absorbs token-level variance.
- **Default `--max-price`**: `$1.00`. Covers 100 calls. For chat sessions, batch within a single request when possible (pass the full message history rather than re-paying per turn).

## Errors

- `PRICE_EXCEEDS_LIMIT` — `--max-price` < $0.01. Default $1.00 should never hit this.
- `INSUFFICIENT_BALANCE` — top up with `t2000 fund`.
- `400 content_policy_violation` — OpenAI safety filter. You're still charged (OpenAI behavior). Reword.
- `429 rate_limit_exceeded` — OpenAI upstream is rate-limited. Wait 10s and retry. Payment is one-shot per request.

## What NOT to do

- Don't chain GPT-4o calls for tasks Claude (local) handles well — wastes USDC on commodity reasoning.
- Don't poll for streaming. The MPP gateway is request/response.
- Don't pass secrets in `messages` content. Treat every paid call as if logged.

## Related recipes

- `mpp-image-gen` — image generation via OpenAI.
- `mpp-transcription` — audio → text via OpenAI Whisper.
- `mpp-index` — discovery for cheaper alternatives (Together AI, Mistral, Groq).
- `t2000-pay` — generic `t2000 pay` reference.
