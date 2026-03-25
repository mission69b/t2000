/**
 * Maps web-app service catalog IDs to gateway URLs and request body transformers.
 * The gateway base URL comes from env or defaults to the production gateway.
 */

const GATEWAY_BASE = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://mpp.t2000.ai';

interface GatewayMapping {
  url: string;
  price: string;
  transformBody: (fields: Record<string, string>) => Record<string, unknown>;
}

const SERVICE_MAP: Record<string, GatewayMapping> = {
  'reloadly-giftcard': {
    url: `${GATEWAY_BASE}/reloadly/v1/order`,
    price: 'dynamic',
    transformBody: (f) => ({
      productId: f.productId ?? f.brand,
      quantity: 1,
      unitPrice: parseFloat(f.amount) || 25,
      recipientEmail: f.email,
      countryCode: f.country ?? f.countryCode ?? 'US',
    }),
  },

  'reloadly-browse': {
    url: `${GATEWAY_BASE}/reloadly/v1/products`,
    price: '0.005',
    transformBody: (f) => ({
      countryCode: f.countryCode ?? 'US',
    }),
  },

  'openai-chat': {
    url: `${GATEWAY_BASE}/openai/v1/chat/completions`,
    price: '0.01',
    transformBody: (f) => ({
      model: f.model === 'openai' || !f.model ? 'gpt-4o' : f.model,
      messages: [{ role: 'user', content: f.prompt }],
      max_tokens: 1024,
    }),
  },

  'elevenlabs-tts': {
    url: `${GATEWAY_BASE}/elevenlabs/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
    price: '0.05',
    transformBody: (f) => ({
      text: f.text,
      model_id: 'eleven_monolingual_v1',
    }),
  },

  'translate': {
    url: `${GATEWAY_BASE}/translate/v1/translate`,
    price: '0.005',
    transformBody: (f) => ({
      q: f.text,
      target: f.target,
    }),
  },

  'fal-flux': {
    url: `${GATEWAY_BASE}/fal/fal-ai/flux/dev`,
    price: '0.03',
    transformBody: (f) => ({
      prompt: f.prompt,
    }),
  },

  'stability-edit': {
    url: `${GATEWAY_BASE}/stability/v1/edit`,
    price: '0.03',
    transformBody: (f) => ({
      image_url: f.image_url,
      prompt: f.prompt,
    }),
  },

  'brave-search': {
    url: `${GATEWAY_BASE}/brave/v1/web/search`,
    price: '0.005',
    transformBody: (f) => ({ q: f.q }),
  },

  'serpapi-flights': {
    url: `${GATEWAY_BASE}/serpapi/v1/flights`,
    price: '0.01',
    transformBody: (f) => ({
      departure_id: f.departure,
      arrival_id: f.arrival,
      outbound_date: f.date,
      type: f.type ?? '2',
    }),
  },

  'newsapi': {
    url: `${GATEWAY_BASE}/newsapi/v1/headlines`,
    price: '0.005',
    transformBody: (f) => ({ q: f.q }),
  },

  'resend-email': {
    url: `${GATEWAY_BASE}/resend/v1/emails`,
    price: '0.005',
    transformBody: (f) => ({
      from: 'T2000 <noreply@t2000.ai>',
      to: f.to,
      subject: f.subject,
      text: f.body,
    }),
  },

  'lob-postcard': {
    url: `${GATEWAY_BASE}/lob/v1/postcards`,
    price: '1.00',
    transformBody: (f) => ({
      to: { name: f.to_name, address_line1: f.to_address },
      message: f.message,
    }),
  },

  'coingecko-price': {
    url: `${GATEWAY_BASE}/coingecko/v1/price`,
    price: '0.005',
    transformBody: (f) => ({ ids: f.ids, vs_currencies: 'usd' }),
  },

  'alphavantage-quote': {
    url: `${GATEWAY_BASE}/alphavantage/v1/quote`,
    price: '0.005',
    transformBody: (f) => ({ symbol: f.symbol }),
  },

  'exchangerate-convert': {
    url: `${GATEWAY_BASE}/exchangerate/v1/convert`,
    price: '0.005',
    transformBody: (f) => ({
      from: f.from,
      to: f.to,
      amount: parseFloat(f.amount) || 1,
    }),
  },

  'screenshot': {
    url: `${GATEWAY_BASE}/screenshot/v1/capture`,
    price: '0.01',
    transformBody: (f) => ({ url: f.url }),
  },

  'shortio': {
    url: `${GATEWAY_BASE}/shortio/v1/shorten`,
    price: '0.005',
    transformBody: (f) => ({ originalURL: f.originalURL }),
  },

  'qrcode': {
    url: `${GATEWAY_BASE}/qrcode/v1/generate`,
    price: '0.005',
    transformBody: (f) => ({ data: f.data }),
  },

  'e2b-execute': {
    url: `${GATEWAY_BASE}/judge0/v1/submissions`,
    price: '0.005',
    transformBody: (f) => ({
      source_code: f.code,
      language_id: mapLanguage(f.language),
    }),
  },

  'virustotal': {
    url: `${GATEWAY_BASE}/virustotal/v1/scan`,
    price: '0.01',
    transformBody: (f) => ({ url: f.url }),
  },
};

function mapLanguage(lang: string): number {
  const map: Record<string, number> = {
    python: 71,
    javascript: 63,
    typescript: 74,
    go: 60,
    rust: 73,
  };
  return map[lang?.toLowerCase()] ?? 71;
}

export function getGatewayMapping(serviceId: string): GatewayMapping | null {
  return SERVICE_MAP[serviceId] ?? null;
}

export function getServicePrice(serviceId: string): string {
  return SERVICE_MAP[serviceId]?.price ?? '0.01';
}

export function createRawGatewayMapping(
  url: string,
  body: Record<string, unknown>,
): GatewayMapping {
  const fullUrl = url.startsWith('http') ? url : `${GATEWAY_BASE}${url}`;
  return {
    url: fullUrl,
    price: '0.05',
    transformBody: () => body,
  };
}

export { GATEWAY_BASE };
