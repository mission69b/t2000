---
name: mpp-transcription
description: >-
  Transcribe audio to text via `t2000 pay` against the MPP-protected
  OpenAI Whisper endpoint at https://mpp.t2000.ai/openai/v1/audio/transcriptions.
  Use when asked to transcribe a podcast, voice memo, meeting recording,
  interview, video soundtrack, or any audio → text task. Pay-per-request
  (~$0.01 USDC). Accepts a public URL or base64. No API key, no account.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npx @t2000/cli init) + funded USDC balance + publicly accessible audio URL
---

# MPP Recipe: Transcribe Audio

## When to use

The user asks for any of:

- "Transcribe this audio / podcast / meeting / voice memo …"
- "What did they say in this recording?"
- "Convert this voice file to text"
- "Pull a transcript from this MP3/WAV/M4A/MP3 URL"

For text → speech use the `/openai/v1/audio/speech` recipe under `mpp-index`. For speaker-diarized transcripts (who said what) consider AssemblyAI or Fal.ai Whisper in `mpp-index` — OpenAI Whisper doesn't diarize.

## Rules

1. **Audio must be reachable by a public URL** (or supplied as base64). The gateway can't read your local files — host them first (Vercel Blob, S3, IPFS, Walrus).
2. **Whisper handles up to 25 MB / ~30 min.** Longer recordings need to be split client-side. The gateway returns 400 above the limit and you're charged.
3. **One paid request = one transcription.** No partial / streaming refunds.
4. **Pass `language` if you know it.** Auto-detection works but uses a few extra seconds; explicit ISO-639-1 (`en`, `es`, `ja`) is faster and more accurate for short clips.
5. **For long-form (podcasts, meetings), AssemblyAI is a better fit** — set `mpp-index` AssemblyAI ($0.02 + diarization + chapter detection).

## The fast path

```bash
t2000 pay https://mpp.t2000.ai/openai/v1/audio/transcriptions \
  --data '{
    "file": "https://example.com/podcast-episode.mp3",
    "model": "whisper-1",
    "language": "en"
  }'
```

## Returns

```json
{
  "text": "In this episode we discuss the future of agentic finance on Sui..."
}
```

**Key field:** `text` — the full transcript as a single string. No timestamps, no diarization (Whisper doesn't do those). For timestamped output use `response_format: "verbose_json"` (still $0.01).

## Tuning knobs

| Field | Default | When to set |
|---|---|---|
| `file` | — (required) | Public URL to MP3, WAV, M4A, MP4, MPEG, MPGA, WEBM, OGG, or FLAC. ≤25 MB. |
| `model` | `whisper-1` | Only option today. Pass it explicitly for clarity. |
| `language` | auto-detect | ISO-639-1 code. Always pass when known (faster + more accurate). |
| `prompt` | none | Glossary / proper-noun hint string. Useful for jargon-heavy audio: `"Sui, NAVI, Cetus, USDC, zkLogin"`. |
| `response_format` | `json` | Pass `"verbose_json"` for word-level timestamps. |
| `temperature` | `0` | Leave at 0 (deterministic). |

## Common patterns

**Plain transcript:**
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/audio/transcriptions \
  --data '{"file": "https://example.com/clip.mp3"}' \
  | jq -r '.text'
```

**Transcript with timestamps:**
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/audio/transcriptions \
  --data '{
    "file": "https://example.com/interview.mp3",
    "response_format": "verbose_json",
    "language": "en"
  }'
```

Returns `{ text, segments: [{ start, end, text }, ...] }`.

**Transcript with domain vocabulary (DeFi audio):**
```bash
t2000 pay https://mpp.t2000.ai/openai/v1/audio/transcriptions \
  --data '{
    "file": "https://example.com/defi-podcast.mp3",
    "language": "en",
    "prompt": "Sui, NAVI Protocol, Cetus, USDC, USDsui, zkLogin, Enoki, Walrus, Mysten Labs"
  }'
```

The `prompt` field biases Whisper toward known proper nouns. Massively improves accuracy on jargon.

**Transcribe → summarize (two paid calls):**
```bash
# Step 1: transcribe ($0.01)
TRANSCRIPT=$(t2000 pay https://mpp.t2000.ai/openai/v1/audio/transcriptions \
  --data '{"file":"https://example.com/meeting.mp3","language":"en"}' \
  --json | jq -r '.text')

# Step 2: summarize via GPT-4o ($0.01)
t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --data "$(jq -nc --arg t "$TRANSCRIPT" '{
    model: "gpt-4o-mini",
    max_tokens: 400,
    messages: [
      {role: "system", content: "Summarize this meeting as 5 bullets + action items."},
      {role: "user", content: $t}
    ]
  }')"
```

Total cost: ~$0.02 USDC.

**Transcribe + diarize (use AssemblyAI instead):**

OpenAI Whisper has no speaker labels. For "Speaker 1 said X, Speaker 2 said Y" use:

```bash
t2000 pay https://mpp.t2000.ai/assemblyai/v1/transcribe \
  --max-price 0.05 \
  --data '{
    "audio_url": "https://example.com/interview.mp3",
    "speaker_labels": true
  }'
```

Two-leg flow — AssemblyAI returns `{ id }`, then poll `/assemblyai/v1/result` ($0.005 each). See `mpp-index` for the full AssemblyAI shape.

## Cost guard

- **Per-transcription pricing is fixed at $0.01** in MPP, regardless of audio length (within the 25 MB / 30 min limit).
- **Default `--max-price`**: `$1.00`. Plenty.
- For batch jobs (transcribe a backlog of N episodes), expect `$0.01 × N`. Surface the total to the user before starting.

## Errors

- `INSUFFICIENT_BALANCE` — `t2000 fund` to top up.
- `400 invalid_request_error: file is too large` — split the audio. You're charged for failed requests.
- `400 invalid_request_error: could not fetch URL` — make the URL public. The gateway needs `GET` access without auth.
- `400 invalid_request_error: file format not supported` — convert to MP3 or M4A first.

## What NOT to do

- Don't try `file: "/path/to/local.mp3"`. Whisper needs a URL or base64; local paths don't traverse the gateway.
- Don't transcribe the same audio twice "to compare" — Whisper is deterministic at `temperature: 0`.
- Don't pay AssemblyAI ($0.02) when Whisper ($0.01) is enough — only diarize when the user needs speaker labels.

## Related recipes

- `mpp-image-gen` — generate images via OpenAI.
- `mpp-gpt4o` — chat / summarization after transcription.
- `mpp-index` — AssemblyAI, Fal.ai Whisper, Groq Whisper for alternatives.
- `t2000-pay` — generic `t2000 pay` reference.
