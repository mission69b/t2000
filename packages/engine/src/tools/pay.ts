import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

const MPP_GATEWAY = 'https://mpp.t2000.ai';

export const payApiTool = buildTool({
  name: 'pay_api',
  description: `Call any MPP (Machine Payment Protocol) service via on-chain USDC micropayment. The gateway at ${MPP_GATEWAY} hosts 40+ services (88 endpoints). All endpoints accept POST with JSON body. Payment is handled automatically.

Popular services and their URLs:
- Weather: ${MPP_GATEWAY}/openweather/v1/weather (body: {"city":"London"}) — $0.005
- Forecast: ${MPP_GATEWAY}/openweather/v1/forecast (body: {"city":"London"}) — $0.005
- Web search: ${MPP_GATEWAY}/brave/v1/web/search (body: {"q":"search query"}) — $0.005
- AI search: ${MPP_GATEWAY}/perplexity/v1/chat/completions (body: {"model":"sonar","messages":[...]}) — $0.01
- Google search: ${MPP_GATEWAY}/serper/v1/search (body: {"q":"query"}) — $0.005
- News headlines: ${MPP_GATEWAY}/newsapi/v1/headlines (body: {"country":"us"}) — $0.005
- Crypto prices: ${MPP_GATEWAY}/coingecko/v1/price (body: {"ids":"bitcoin,sui","vs_currencies":"usd"}) — $0.005
- Stock quotes: ${MPP_GATEWAY}/alphavantage/v1/quote (body: {"symbol":"AAPL"}) — $0.005
- FX rates: ${MPP_GATEWAY}/exchangerate/v1/rates (body: {"base":"USD"}) — $0.005
- Translate: ${MPP_GATEWAY}/deepl/v1/translate (body: {"text":["hello"],"target_lang":"ES"}) — $0.005
- Scrape URL: ${MPP_GATEWAY}/firecrawl/v1/scrape (body: {"url":"https://..."}) — $0.01
- Read URL: ${MPP_GATEWAY}/jina/v1/read (body: {"url":"https://..."}) — $0.005
- Geocode: ${MPP_GATEWAY}/googlemaps/v1/geocode (body: {"address":"..."}) — $0.01
- Directions: ${MPP_GATEWAY}/googlemaps/v1/directions (body: {"origin":"...","destination":"..."}) — $0.01
- Places: ${MPP_GATEWAY}/googlemaps/v1/places (body: {"query":"restaurants in Sydney"}) — $0.01
- Image gen: ${MPP_GATEWAY}/fal/fal-ai/flux/dev (body: {"prompt":"..."}) — $0.03
- Send email: ${MPP_GATEWAY}/resend/v1/emails (body: {"from":"...","to":"...","subject":"...","html":"..."}) — $0.005
- Flights: ${MPP_GATEWAY}/serpapi/v1/flights (body: {"departure_id":"SYD","arrival_id":"NRT","outbound_date":"2026-03-01"}) — $0.01

Always use POST. Construct the URL from the gateway base + path. Pass parameters in JSON body string.`,
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
