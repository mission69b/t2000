/**
 * Illustrative request body for a service/path combo. Used by copy-chip
 * commands. Keep tiny + generic — the canonical body shape lives in
 * /openapi.json (lib/openapi.ts).
 */
export function sampleBodyFor(svcName: string, path: string): string {
  if (svcName === "OpenAI" && path.includes("chat/completions"))
    return '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}';
  if (svcName === "Anthropic" && path.includes("messages"))
    return '{"model":"claude-sonnet-4","messages":[{"role":"user","content":"hi"}],"max_tokens":256}';
  if (svcName === "fal.ai") return '{"prompt":"a sunlit room"}';
  if (svcName === "ElevenLabs")
    return '{"text":"Hello from t2000.","voice_id":"21m00Tcm4TlvDq8ikWAM"}';
  if (svcName === "Firecrawl") return '{"url":"https://example.com"}';
  if (svcName === "Perplexity")
    return '{"model":"sonar","messages":[{"role":"user","content":"sui price today"}]}';
  if (svcName === "CoinGecko") return '{"ids":"sui","vs_currencies":"usd"}';
  if (svcName === "Groq")
    return '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"hi"}]}';
  if (svcName === "Resend")
    return '{"from":"you@example.com","to":["someone@example.com"],"subject":"hi","html":"<p>hi</p>"}';
  if (svcName === "Brave Search") return '{"q":"sui blockchain"}';
  if (svcName === "Stability AI") return '{"prompt":"a sunlit room"}';
  if (svcName === "Replicate")
    return '{"model":"black-forest-labs/flux-schnell","input":{"prompt":"a sunlit room"}}';
  // Field names match JMPR's live openapi.json exactly — their API charges
  // BEFORE validating, so a wrong sample = a paid 422 (learned live, $0.02).
  // Prefix-matched: the self-listed entry (S.748) is named from their OpenAPI
  // title ("JMPR — Luxury Hotels API"), not the old static "JMPR Travel".
  if (svcName.startsWith("JMPR") && path.includes("flights/search"))
    return '{"from_airport":"SYD","to_airport":"NRT","departure_date":"2026-09-01","trip_type":"one_way","cabin_class":"business"}';
  if (svcName.startsWith("JMPR") && path.includes("hotels/search"))
    return '{"city":"Tokyo","checkin_date":"2026-09-01","checkout_date":"2026-09-05","user_requirements":"ultra-luxury 5-star"}';
  return "{ }";
}

interface JsonSchemaProp {
  type?: string | string[];
  description?: string;
  examples?: unknown[];
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
}

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
}

function exampleValue(name: string, p: JsonSchemaProp): unknown {
  if (Array.isArray(p.examples) && p.examples.length > 0) return p.examples[0];
  if (p.default !== undefined) return p.default;
  if (Array.isArray(p.enum) && p.enum.length > 0) return p.enum[0];
  const t = Array.isArray(p.type) ? p.type[0] : p.type;
  if (t === "string") {
    // @t2000/serve schemas embed a usable value in the field description
    // (`e.g. "calm, premium, technical"`) — lift it so the seeded body is
    // payable as-is, not a placeholder the buyer has to rewrite.
    const eg =
      typeof p.description === "string"
        ? p.description.match(/e\.g\.\s*[""]([^""]+)[""]/)
        : null;
    return eg ? eg[1] : `<${name}>`;
  }
  if (t === "number" || t === "integer") return p.minimum ?? 1;
  if (t === "boolean") return true;
  if (t === "array") return [];
  if (t === "object") return {};
  return `<${name}>`;
}

/**
 * Synthesize an illustrative body from an endpoint's request-body JSON
 * schema (required fields only). Covers self-listed direct sellers, whose
 * schemas arrive via their own openapi.json at ingest — no hand-list entry
 * to maintain. Returns undefined when the schema can't seed anything.
 */
export function sampleBodyFromSchema(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const s = schema as JsonSchemaObject;
  if (!s.properties) return undefined;
  const keys =
    Array.isArray(s.required) && s.required.length > 0
      ? s.required
      : Object.keys(s.properties).slice(0, 3);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const prop = s.properties[key];
    if (prop) out[key] = exampleValue(key, prop);
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : undefined;
}
