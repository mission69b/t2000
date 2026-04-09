import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

const MPP_GATEWAY = 'https://mpp.t2000.ai';

const SERVICE_PRICES: [RegExp, number][] = [
  [/\/fal\//, 0.03],
  [/\/googlemaps\//, 0.01],
  [/\/perplexity\//, 0.01],
  [/\/firecrawl\//, 0.01],
  [/\/serpapi\//, 0.01],
  [/\/openweather\//, 0.005],
  [/\/brave\//, 0.005],
  [/\/serper\//, 0.005],
  [/\/newsapi\//, 0.005],
  [/\/coingecko\//, 0.005],
  [/\/alphavantage\//, 0.005],
  [/\/exchangerate\//, 0.005],
  [/\/deepl\//, 0.005],
  [/\/jina\//, 0.005],
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
  description: `Execute any MPP gateway service via on-chain USDC micropayment. The gateway at ${MPP_GATEWAY} hosts 40+ services (88 endpoints). Payment is handled automatically.

Use mpp_services tool first to discover available services and get the correct endpoint URL, required body parameters, and pricing. Then call this tool with the full URL and JSON body.

Always use POST. Construct the URL from the gateway base + service path. Pass parameters as a JSON string in body.

CRITICAL — non-retryable errors: If the result contains "doNotRetry": true or "paymentConfirmed": true, the user has ALREADY been charged. NEVER call pay_api again for the same request. Report the error to the user.

Lob (postcards/letters) — MULTI-STEP, NEVER skip:
1. Generate design image FIRST via fal/fal-ai/flux/dev ($0.03). Show the image to the user as markdown ![design](url).
2. Ask the user to confirm before mailing ("Here's the design. Print and mail for $1.00?").
3. ONLY after user confirms: call lob/v1/postcards with the image URL in the front HTML (<img src="URL" style="width:100%;height:100%;object-fit:cover"/>).
Always use ISO-3166 country codes (GB not UK, US not USA). A return address ("from") is added automatically — do not include one.`,
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
      url: { type: 'string', description: 'Full MPP endpoint URL (e.g. https://mpp.t2000.ai/openweather/v1/weather)' },
      method: { type: 'string', description: 'HTTP method (always POST for MPP gateway)' },
      body: { type: 'string', description: 'JSON request body as string' },
      headers: { type: 'object', description: 'Additional HTTP headers' },
      maxPrice: { type: 'number', description: 'Maximum price in USD willing to pay (default: service price)' },
    },
    required: ['url'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

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
