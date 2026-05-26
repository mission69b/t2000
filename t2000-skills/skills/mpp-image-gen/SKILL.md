---
name: mpp-image-gen
description: >-
  Generate an image via `t2000 pay` against the MPP-protected OpenAI
  gpt-image-1 endpoint at https://mpp.t2000.ai/openai/v1/images/generations.
  Use when asked to make/generate/create an image, illustration, banner,
  thumbnail, profile pic, logo, mockup, or "draw" something. Pay-per-image
  (~$0.05 USDC, no API key, no account). Returns a permanent URL hosted
  on Vercel Blob — safe to embed in chat or hand to downstream tools.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init) + funded USDC balance
---

# MPP Recipe: Generate an Image

## When to use

The user asks for any of:

- "Generate an image of …"
- "Make me a thumbnail / banner / hero / illustration of …"
- "Draw / paint / render …"
- "Create a profile picture / avatar of …"

For text-to-text generation use `mpp-gpt4o`. For audio → text use `mpp-transcription`. For voice (TTS) use the direct `/openai/v1/audio/speech` recipe under `mpp-index`.

## Rules

1. **One paid request per image.** Don't loop "make 5 variants" into 5 separate calls — pass `n: 4` (max 4) inside one request. You still pay per-image but it's atomic.
2. **Confirm the prompt before paying.** Generation is paid + irreversible. Surface the prompt + estimated cost (`$0.05 × n`) and let the user approve.
3. **Don't auto-upscale or re-style.** If the result isn't quite right, ASK before regenerating — each retry is another $0.05.
4. **Use the returned URL directly.** The gateway uploads each image to Vercel Blob and rewrites the response to `{ data: [{ url }] }` shape. Don't try to decode base64 — that path is invalid for `gpt-image-1`.
5. **Size matters.** Default is `1024x1024` (~$0.05). Larger sizes (`1024x1792`, `1792x1024`) cost the same per image but render slower. Pick `1024x1024` unless the user explicitly needs portrait/landscape.

## The fast path

```bash
t2000 pay https://mpp.t2000.ai/openai/v1/images/generations \
  --data '{
    "prompt": "a serene mountain lake at dawn, cinematic lighting, photorealistic",
    "size": "1024x1024"
  }'
```

That's it. The MPP 402 challenge is handled automatically; payment broadcasts to Sui mainnet; OpenAI generates; gateway uploads to Blob; you get back JSON with a URL.

## Returns

```json
{
  "data": [
    {
      "url": "https://<blob-store>.public.blob.vercel-storage.com/<id>.png"
    }
  ]
}
```

**Key field:** `data[0].url` — permanent CDN URL. Survives indefinitely. Embed in markdown as `![](url)` for chat surfaces.

## Tuning knobs

| Field | Default | When to set |
|---|---|---|
| `model` | `gpt-image-1` | Pass `"gpt-image-1-mini"` for cheaper/faster (still $0.05 in gateway pricing today, but quality lower; consider for low-stakes thumbnails). |
| `size` | `1024x1024` | Use `1024x1792` for portrait (story / book cover / phone wallpaper). Use `1792x1024` for landscape (banner / hero image). |
| `n` | `1` | Set up to 4 to get variants in one call. Cost is `0.05 × n`. |

## Common patterns

**Banner with text overlay** (the gateway can't add text; ask the model):
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/images/generations \
  --data '{
    "prompt": "Modern tech conference banner, bold text \"AGENTIC FINANCE\" centered, blue and white palette, minimalist",
    "size": "1792x1024"
  }'
```

**4 variants of a profile pic**:
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/images/generations \
  --max-price 0.25 \
  --data '{
    "prompt": "Pixar-style 3D portrait of a friendly cyberpunk fox, blue accent lighting",
    "n": 4
  }'
```

Note the `--max-price 0.25` — you must raise the cap above $0.05 since the request charges `0.05 × 4 = 0.20` USDC.

**Generate then describe** (image → caption via two paid calls):
```bash
# Step 1: generate
IMG_URL=$(t2000 pay https://mpp.t2000.ai/openai/v1/images/generations --json \
  --data '{"prompt": "futuristic neon-lit Tokyo alley"}' | jq -r '.data[0].url')

# Step 2: describe via GPT-4o vision
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data "{\"model\":\"gpt-4o\",\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"Caption this image in one sentence.\"},{\"type\":\"image_url\",\"image_url\":{\"url\":\"$IMG_URL\"}}]}]}"
```

## Cost guard

- **Default `--max-price`**: `$1.00`. A single 1024x1024 image is $0.05, so the default covers up to 20 images. For batch jobs > 4 images, set explicitly.
- **Per-image pricing is fixed at $0.05** regardless of size or model in current MPP pricing.

## Errors

- `PRICE_EXCEEDS_LIMIT` — your `--max-price` is below the requested cost. Bump it.
- `INSUFFICIENT_BALANCE` — not enough USDC in the wallet. Run `t2000 fund` to top up.
- `400 invalid_prompt` — OpenAI refused the prompt (safety filter). Reword and retry; you'll be charged again on retry — this is OpenAI's behavior, not ours.

## What NOT to do

- Don't ask the agent to "generate 100 images" without surfacing the cost ($5 USDC). The user should approve any batch > 4.
- Don't poll-loop on a failed generation. If OpenAI returns a 400, the gateway already collected payment; retrying without changing the prompt repeats the same charge.
- Don't try to fetch the image URL through `t2000 pay` again. The returned URL is public CDN and free to GET.

## Related recipes

- `mpp-gpt4o` — text generation, summarization, vision (image understanding).
- `mpp-index` — discovery page for every other MPP service (40 total).
- `t2000-pay` — generic technical reference for the `t2000 pay` command.
