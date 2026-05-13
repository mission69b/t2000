import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

const MPP_GATEWAY = 'https://mpp.t2000.ai';

// SPEC 24 (locked 2026-05-11) — endpoint-aware pricing for the 5 supported services.
// Order matters: most-specific patterns first (e.g. lob postcards $1.00 before any
// generic /lob/ pattern). The default fall-through ($0.005) only fires for unknown
// services — those are dropped per SPEC 24 §8 and the system prompt should keep the
// LLM from calling them, but the safe default keeps the cost estimate honest if it
// somehow happens.
const SERVICE_PRICES: [RegExp, number][] = [
  // openai (3 supported endpoints)
  [/\/openai\/v1\/images\//, 0.05],          // DALL-E
  [/\/openai\/v1\/audio\/transcriptions/, 0.01], // Whisper
  [/\/openai\/v1\/chat\//, 0.01],            // GPT-4o
  // elevenlabs (2 supported endpoints, both $0.05)
  [/\/elevenlabs\//, 0.05],
  // lob (3 supported endpoints, distinct prices)
  [/\/lob\/v1\/letters/, 1.50],
  [/\/lob\/v1\/postcards/, 1.00],
  [/\/lob\//, 0.01],                         // address-verify and any future single-cent endpoint
  // pdfshift
  [/\/pdfshift\//, 0.01],
  // resend
  [/\/resend\//, 0.005],
];

export function estimatePayApiCost(url: string): number {
  for (const [pattern, price] of SERVICE_PRICES) {
    if (pattern.test(url)) return price;
  }
  return 0.005;
}

export const payApiTool = buildTool({
  name: 'pay_api',
  description: `Execute one of Audric's 5 supported MPP gateway services via on-chain USDC micropayment. Payment is handled automatically. Supported services (11 endpoints):

  openai      — DALL-E images $0.05, Whisper transcription $0.01, GPT-4o chat $0.01
  elevenlabs  — premium TTS $0.05, sound effects $0.05
  pdfshift    — HTML/URL → PDF conversion $0.01
  lob         — postcards $1.00, letters $1.50, address verify $0.01
  resend      — transactional email $0.005, batch email $0.01

The gateway at ${MPP_GATEWAY} also exposes other services (Fal, Anthropic, Gemini, Suno, etc.) that Audric does NOT support. If the user asks for one of those, decline honestly — DO NOT route through pay_api hoping the result will render. The full list of unsupported intents lives in the system prompt's § MPP services block.

Use mpp_services tool first to discover the exact endpoint URL, required body parameters, and pricing for the chosen service. Then call this tool with the full URL and JSON body.

Always use POST. Construct the URL from the gateway base + service path. Pass parameters as a JSON string in body.

CRITICAL — non-retryable errors: If the result contains "doNotRetry": true or "paymentConfirmed": true, the user has ALREADY been charged. NEVER call pay_api again for the same request. Report the error to the user.

RETRYABLE — free-retry signal (SPEC 26 settle-on-success): If pay_api result has "paymentConfirmed": false AND status is 402, the upstream service failed but you were NOT charged. You may retry with corrected parameters. Each retry-after-no-charge is free. The result body's "settleReason" field (when present) tells you what the upstream rejected — use it to decide whether the same request can succeed (transient: rate-limit, 5xx — retry as-is) or whether parameters need correction (4xx: invalid model / size / prompt — fix the param then retry).

CRITICAL — abort the chain on dependency failure: If a pay_api call fails AND the failed output was the input to a planned downstream tool (e.g. you were going to feed the image URL into compose_pdf, compose_image_grid, pay_api(lob/postcards), or any tool whose name starts with compose_/bind_/merge_/package_), STOP. Do NOT substitute a placeholder, stub, or "[image: description]" text. Report exactly what failed, what was charged, and what the user can do (retry once Audric publishes a fix; contact support for refund). The user asked for X-with-Y; delivering X-without-Y is a worse outcome than delivering nothing and being clear about it. Only continue the chain if the failed output was independent of subsequent steps (e.g. parallel image + email request — email can ship even if image failed; but report the failure).

OpenAI image models — current valid models: gpt-image-1 (drop-in for legacy dall-e-3, $0.05) or gpt-image-1-mini (cost-efficient, $0.05). Do NOT use "dall-e-3" or "dall-e-2" — both shut down 2026-05-12 and the gateway will reject the request pre-charge. The deprecation runway for gpt-image-1 itself is 2026-10-23; until then it is the recommended default.

OpenAI image sizes — gpt-image-* only accepts: "1024x1024" (default, square), "1024x1536" (portrait), "1536x1024" (landscape), or "auto". Do NOT pass "256x256", "512x512", "1024x1024" with "hd" quality, or any other DALL-E 2/3 legacy values — they will be rejected pre-charge. When the user says "small image" or "thumbnail", default to 1024x1024 (omit the size field) — the gateway has no smaller option, and post-render the image can be displayed at any size. Only override the default when the user explicitly asks for portrait or landscape composition.

Lob (postcards/letters) — MULTI-STEP, NEVER skip:
1. Generate design image FIRST via openai/v1/images/generations (model "gpt-image-1", $0.05). Show the image to the user as markdown ![design](url).
2. Ask the user to confirm before mailing ("Here's the design. Print and mail for $1.00?").
3. ONLY after user confirms: call lob/v1/postcards with the image URL in the front HTML (<img src="URL" style="width:100%;height:100%;object-fit:cover"/>).
Always use ISO-3166 country codes (GB not UK, US not USA). A return address ("from") is added automatically — do not include one.

PDFShift (pdfshift/v1/convert) — composition guidance:
- Text-only PDFs: call pdfshift directly with HTML content.
- PDFs with images (eBook covers, illustrated guides, colouring books): generate images first via openai/v1/images/generations ($0.05 each), then call pdfshift with HTML that includes the image URLs as <img src="..."/> tags. Quote the total cost (N images × $0.05 + $0.01) before starting.`,
  inputSchema: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
    body: z.string().optional(),
    headers: z.record(z.string()).optional(),
    maxPrice: z.number().positive().optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full MPP endpoint URL (e.g. https://mpp.t2000.ai/openai/v1/images/generations)' },
      method: { type: 'string', description: 'HTTP method (always POST for MPP gateway)' },
      body: { type: 'string', description: 'JSON request body as string' },
      headers: { type: 'object', description: 'Additional HTTP headers' },
      maxPrice: { type: 'number', description: 'Maximum price in USD willing to pay (default: service price)' },
    },
    required: ['url'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true, requiresBalance: true, costAware: true, producesArtifact: true, maxRetries: 1 },
  preflight: (input) => {
    if (!input.url.startsWith(MPP_GATEWAY)) {
      return { valid: false, error: `URL must start with ${MPP_GATEWAY}. Got: "${input.url}"` };
    }
    if (input.body) {
      try {
        JSON.parse(input.body);
      } catch {
        return { valid: false, error: 'body must be valid JSON.' };
      }
      if (input.url.includes('lob/')) {
        const body = JSON.parse(input.body) as Record<string, unknown>;
        const to = body.to as Record<string, unknown> | undefined;
        const country = to?.address_country;
        if (typeof country === 'string' && country.length !== 2) {
          return { valid: false, error: `Country must be ISO-3166 2-letter code (got "${country}")` };
        }
      }
    }
    return { valid: true };
  },

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.pay({
      url: input.url,
      method: input.method,
      body: input.body,
      headers: input.headers,
      maxPrice: input.maxPrice,
    });

    return {
      data: {
        status: result.status,
        body: result.body,
        paid: result.paid,
        cost: result.cost,
        receipt: result.receipt,
      },
      displayText: result.paid
        ? `API call completed — paid $${result.cost?.toFixed(4) ?? '?'} (status: ${result.status})`
        : `API call completed — free (status: ${result.status})`,
    };
  },
});
