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
  if (svcName === "JMPR Travel" && path.includes("flights"))
    return '{"origin":"SYD","destination":"NRT","depart_date":"2026-09-01","cabin":"business"}';
  if (svcName === "JMPR Travel")
    return '{"destination":"Tokyo","check_in":"2026-09-01","check_out":"2026-09-05","tier":"ultra-luxury"}';
  return "{ }";
}
