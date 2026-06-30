import { T2000Error } from './errors.js';

// Private Inference API client (SPEC_AUDRIC_API — agent-native layer, S.575).
// Key-based access to the t2000 Private API (OpenAI-compatible) at
// `api.t2000.ai/v1`. The x402 pay-per-call (no-key) path is a later add; this
// is the key-based distribution surface used by `t2 chat` + the MCP `t2000_chat`
// tool. Browser-safe (fetch + ReadableStream only — no wallet/Node deps).

export const DEFAULT_API_BASE = 'https://api.t2000.ai/v1';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  /** Private API key (`sk-…`). Falls back to `T2000_API_KEY` env. */
  apiKey?: string;
  /** Override the API base (default `api.t2000.ai/v1`; e.g. for testing). */
  apiBase?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: ChatUsage;
  /** The verbatim OpenAI-shaped response body. */
  raw: unknown;
}

export interface ApiModel {
  id: string;
  contextWindow?: number;
  inputPer1M?: number;
  outputPer1M?: number;
  /** Privacy tier surfaced by the API (e.g. `zdr`, `confidential`). */
  privacy?: string;
}

function envApiKey(): string | undefined {
  return typeof process !== 'undefined' ? process.env?.T2000_API_KEY : undefined;
}

function resolveApiKey(apiKey?: string): string {
  const key = apiKey ?? envApiKey();
  if (!key) {
    throw new T2000Error(
      'INVALID_KEY',
      'No Private API key. Pass `apiKey` or set T2000_API_KEY. Generate one at platform.t2000.ai (Pro/Max).',
    );
  }
  return key;
}

async function failBody(res: Response): Promise<never> {
  const text = await res.text().catch(() => '');
  let msg = text.slice(0, 300);
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string };
    msg =
      (typeof j.error === 'object' ? j.error?.message : j.error) ?? msg;
  } catch {
    // keep the raw text
  }
  throw new T2000Error(
    'INFERENCE_FAILED',
    `Inference request failed (${res.status}): ${msg}`,
    { status: res.status },
    res.status >= 500,
  );
}

function usageOf(raw: unknown): ChatUsage | undefined {
  const u = (raw as { usage?: Record<string, number> })?.usage;
  if (!u) {
    return;
  }
  return {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    totalTokens: u.total_tokens,
  };
}

function body(params: ChatParams, stream: boolean): string {
  return JSON.stringify({
    model: params.model,
    messages: params.messages,
    ...(stream ? { stream: true } : {}),
    ...(params.maxTokens != null ? { max_tokens: params.maxTokens } : {}),
    ...(params.temperature != null ? { temperature: params.temperature } : {}),
  });
}

/** Non-streaming chat completion. Returns the assistant text + usage + the
 *  verbatim OpenAI response body. */
export async function chatCompletion(params: ChatParams): Promise<ChatResult> {
  const key = resolveApiKey(params.apiKey);
  const base = params.apiBase ?? DEFAULT_API_BASE;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: body(params, false),
  });
  if (!res.ok) {
    await failBody(res);
  }
  const raw = await res.json();
  const content =
    (raw as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content ?? '';
  return {
    content,
    model: (raw as { model?: string })?.model ?? params.model,
    usage: usageOf(raw),
    raw,
  };
}

/** Streaming chat completion — yields assistant text deltas as they arrive
 *  (parses the OpenAI SSE `data:` frames). */
export async function* chatCompletionStream(
  params: ChatParams,
): AsyncGenerator<string, void, unknown> {
  const key = resolveApiKey(params.apiKey);
  const base = params.apiBase ?? DEFAULT_API_BASE;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: body(params, true),
  });
  if (!(res.ok && res.body)) {
    await failBody(res);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') {
        return;
      }
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          yield delta;
        }
      } catch {
        // keep-alive or partial frame — ignore
      }
    }
  }
}

/** List the Private API model catalog (`GET /v1/models`). The key is sent when
 *  available but not required (the catalog may be public). */
export async function listModels(opts?: {
  apiKey?: string;
  apiBase?: string;
}): Promise<ApiModel[]> {
  const base = opts?.apiBase ?? DEFAULT_API_BASE;
  const key = opts?.apiKey ?? envApiKey();
  const res = await fetch(`${base}/models`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
  if (!res.ok) {
    await failBody(res);
  }
  const json = (await res.json()) as {
    data?: {
      id: string;
      context_window?: number;
      context_length?: number;
      privacy?: string;
      privacy_tier?: string;
      pricing?: {
        input_per_1m?: number;
        output_per_1m?: number;
        prompt?: number;
        completion?: number;
      };
    }[];
  };
  const data = Array.isArray(json.data) ? json.data : [];
  return data.map((m) => ({
    id: m.id,
    contextWindow: m.context_window ?? m.context_length,
    inputPer1M: m.pricing?.input_per_1m ?? m.pricing?.prompt,
    outputPer1M: m.pricing?.output_per_1m ?? m.pricing?.completion,
    privacy: m.privacy ?? m.privacy_tier,
  }));
}
