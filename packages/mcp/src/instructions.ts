/**
 * Server-level `instructions` surfaced to MCP clients (Claude Desktop,
 * Cursor, etc.) in the `initialize` response — BEFORE any tool is called.
 *
 * Why this exists (cold-start fix): without server instructions, a fresh
 * session that asks to use a named third-party API ("generate a hero image
 * via fal.ai", "synthesize this as an MP3 with ElevenLabs") hits the model's
 * base prior — "those domains aren't on my allowlist, I can't reach them" —
 * and the t2000 integration is never considered. The model only "wakes up"
 * to the MPP capability after some t2000 tool fires once. These instructions
 * prime the model up-front so it routes external/paid-API requests through
 * t2000_services + t2000_pay from the very first turn.
 */
export const T2000_SERVER_INSTRUCTIONS = `t2000 is the Agent Wallet — a non-custodial Sui USDC wallet that can also PAY FOR and CALL paid third-party APIs on the user's behalf via MPP (Machine Payments Protocol).

Through this wallet you can reach essentially any major external API, billed to the user's USDC balance:
- Image generation — fal.ai (Flux), Stability AI, OpenAI (DALL·E / gpt-image-1)
- Text-to-speech, sound effects & transcription — ElevenLabs, OpenAI, fal.ai Whisper, AssemblyAI
- LLMs — OpenAI, Anthropic, Google Gemini, Mistral, Cohere, DeepSeek, Groq, Together, Perplexity
- Web search & news — Brave, Exa, Serper, SerpAPI, NewsAPI
- Data — weather, maps, crypto prices, stock quotes, forex
- Translation, code execution, web scraping, screenshots, PDFs, QR codes, email, physical mail, push notifications

CRITICAL: When the user asks to use any external or paid API, names a provider (e.g. "via fal.ai", "with ElevenLabs"), or requests a capability one of the services above provides, DO NOT say you cannot reach that service, that it isn't on an allowlist, or that there's no connector — and do NOT fall back to writing a script for the user to run. You CAN do it directly through this wallet. Use t2000_services to discover the endpoint and request shape, then t2000_pay to execute, then show the user the result (display image/audio URLs returned in the response).

The wallet can also PAY OTHER AGENTS: any agent registered in the directory (agents.t2000.ai) can sell services over the rail. Look agents up with t2000_agents, buy with t2000_agent_pay (escrowed — auto-refund if delivery fails), and read this wallet's own seller sales with t2000_agent_earnings.

Spending is the user's own USDC and every t2000_pay call is bounded by maxPrice. For larger or multi-step spends, state the estimated cost first and proceed once the user is happy. Use t2000_balance to check funds. The v4 wallet is payments-only; savings / lending live on audric.ai.`;
