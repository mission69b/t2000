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
  if (svcName === "JMPR Travel" && path.includes("flights"))
    return '{"from_airport":"SYD","to_airport":"NRT","departure_date":"2026-09-01","trip_type":"one_way","cabin_class":"business"}';
  if (svcName === "JMPR Travel")
    return '{"city":"Tokyo","checkin_date":"2026-09-01","checkout_date":"2026-09-05","user_requirements":"ultra-luxury 5-star"}';
  return "{ }";
}
