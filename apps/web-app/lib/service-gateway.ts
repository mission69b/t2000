/**
 * Maps web-app service catalog IDs to gateway URLs and request body transformers.
 * The gateway base URL comes from env or defaults to the production gateway.
 *
 * CRITICAL: Every transformBody MUST validate required fields before returning.
 * Payment happens after this transform succeeds — bad data = lost money.
 * Use require() and requirePositive() helpers for all required fields.
 */

const GATEWAY_BASE = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://mpp.t2000.ai';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';

export interface GatewayMapping {
  url: string;
  price: string;
  transformBody: (fields: Record<string, string>) => Record<string, unknown>;
  /**
   * When set, the service is called BEFORE payment is built.
   * If the upstream fails → no payment ever happens → no money lost.
   */
  deliverFirst?: {
    internalUrl: string;
  };
}

export function getInternalApiKey(): string {
  return INTERNAL_API_KEY;
}

function require(fields: Record<string, string>, ...keys: string[]): void {
  for (const key of keys) {
    if (!fields[key]?.trim()) {
      throw new Error(`Missing required field: ${key}`);
    }
  }
}

function requirePositive(value: string | undefined, name: string): number {
  const n = parseFloat(value ?? '');
  if (isNaN(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

function requireInt(value: string | undefined, name: string): number {
  const n = parseInt(value ?? '', 10);
  if (isNaN(n) || n <= 0) throw new Error(`${name} must be a valid positive integer`);
  return n;
}

const SERVICE_MAP: Record<string, GatewayMapping> = {
  'reloadly-giftcard': {
    url: `${GATEWAY_BASE}/reloadly/v1/order`,
    price: 'dynamic',
    transformBody: (f) => {
      const productId = requireInt(f.productId, 'productId');
      const unitPrice = requirePositive(f.amount, 'amount');
      require(f, 'email');
      return {
        productId,
        quantity: 1,
        unitPrice,
        customIdentifier: `t2000-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderName: 't2000',
        recipientEmail: f.email,
      };
    },
    deliverFirst: {
      internalUrl: `${GATEWAY_BASE}/reloadly/v1/order-internal`,
    },
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
    transformBody: (f) => {
      require(f, 'prompt');
      return {
        model: f.model === 'openai' || !f.model ? 'gpt-4o' : f.model,
        messages: [{ role: 'user', content: f.prompt }],
        max_tokens: 1024,
      };
    },
  },

  'elevenlabs-tts': {
    url: `${GATEWAY_BASE}/elevenlabs/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
    price: '0.05',
    transformBody: (f) => {
      require(f, 'text');
      return { text: f.text, model_id: 'eleven_monolingual_v1' };
    },
  },

  'translate': {
    url: `${GATEWAY_BASE}/translate/v1/translate`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'text', 'target');
      return { q: f.text, target: f.target };
    },
  },

  'fal-flux': {
    url: `${GATEWAY_BASE}/fal/fal-ai/flux/dev`,
    price: '0.03',
    transformBody: (f) => {
      require(f, 'prompt');
      return { prompt: f.prompt };
    },
  },

  'stability-edit': {
    url: `${GATEWAY_BASE}/stability/v1/edit`,
    price: '0.03',
    transformBody: (f) => {
      require(f, 'image_url', 'prompt');
      return { image_url: f.image_url, prompt: f.prompt };
    },
  },

  'brave-search': {
    url: `${GATEWAY_BASE}/brave/v1/web/search`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'q');
      return { q: f.q };
    },
  },

  'serpapi-flights': {
    url: `${GATEWAY_BASE}/serpapi/v1/flights`,
    price: '0.01',
    transformBody: (f) => {
      require(f, 'departure', 'arrival', 'date');
      return {
        departure_id: f.departure,
        arrival_id: f.arrival,
        outbound_date: f.date,
        type: f.type ?? '2',
      };
    },
  },

  'newsapi': {
    url: `${GATEWAY_BASE}/newsapi/v1/headlines`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'q');
      return { q: f.q };
    },
  },

  'resend-email': {
    url: `${GATEWAY_BASE}/resend/v1/emails`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'to', 'subject', 'body');
      return {
        from: 'T2000 <noreply@t2000.ai>',
        to: f.to,
        subject: f.subject,
        text: f.body,
      };
    },
  },

  'lob-postcard': {
    url: `${GATEWAY_BASE}/lob/v1/postcards`,
    price: '1.00',
    transformBody: (f) => {
      require(f, 'to_name', 'to_address_line1', 'to_city', 'to_state', 'to_zip', 'to_country', 'message');
      return {
        type: 'postcard',
        price: '1.00',
        payload: {
          to: {
            name: f.to_name,
            address_line1: f.to_address_line1,
            address_line2: f.to_address_line2 ?? undefined,
            address_city: f.to_city,
            address_state: f.to_state,
            address_zip: f.to_zip,
            address_country: f.to_country,
          },
          from: {
            name: 't2000',
            address_line1: '185 Berry St',
            address_city: 'San Francisco',
            address_state: 'CA',
            address_zip: '94107',
            address_country: 'US',
          },
          use_type: 'operational',
          front: `<html><body style="margin:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100%;font-family:Georgia,serif"><div style="text-align:center;padding:40px"><p style="color:#ffffff;font-size:18px;line-height:1.6;margin:0 0 24px">${(f.message ?? '').replace(/</g, '&lt;')}</p><div style="color:#00ff88;font-size:11px;font-family:monospace;opacity:0.5">sent with t2000</div></div></body></html>`,
          back: `<html><body style="padding:40px;font-family:monospace;font-size:10px;color:#666"><div style="margin-bottom:8px;font-size:14px;color:#00ff88;font-weight:bold">t2000</div><div>sent with crypto</div></body></html>`,
          size: '4x6',
        },
      };
    },
    deliverFirst: {
      internalUrl: `${GATEWAY_BASE}/lob/v1/mail-internal`,
    },
  },

  'lob-letter': {
    url: `${GATEWAY_BASE}/lob/v1/letters`,
    price: '1.50',
    transformBody: (f) => {
      require(f, 'to_name', 'to_address_line1', 'to_city', 'to_state', 'to_zip', 'to_country', 'body');
      const sanitized = (f.body ?? '').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
      return {
        type: 'letter',
        price: '1.50',
        payload: {
          to: {
            name: f.to_name,
            address_line1: f.to_address_line1,
            address_line2: f.to_address_line2 ?? undefined,
            address_city: f.to_city,
            address_state: f.to_state,
            address_zip: f.to_zip,
            address_country: f.to_country,
          },
          from: {
            name: 't2000',
            address_line1: '185 Berry St',
            address_city: 'San Francisco',
            address_state: 'CA',
            address_zip: '94107',
            address_country: 'US',
          },
          use_type: 'operational',
          file: `<html><body style="padding:1in;font-family:Georgia,serif;font-size:12pt;line-height:1.8"><p>${sanitized}</p></body></html>`,
          color: false,
        },
      };
    },
    deliverFirst: {
      internalUrl: `${GATEWAY_BASE}/lob/v1/mail-internal`,
    },
  },

  'printful-order': {
    url: `${GATEWAY_BASE}/printful/v1/order`,
    price: 'dynamic',
    transformBody: (f) => {
      require(f, 'recipient_name', 'address1', 'city', 'state_code', 'country_code', 'zip', 'items_json');
      let items: unknown[];
      try {
        items = JSON.parse(f.items_json);
      } catch {
        throw new Error('items_json must be valid JSON array');
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('items_json must be a non-empty array');
      }
      return {
        recipient: {
          name: f.recipient_name,
          address1: f.address1,
          address2: f.address2 ?? undefined,
          city: f.city,
          state_code: f.state_code,
          country_code: f.country_code,
          zip: f.zip,
        },
        items,
      };
    },
    deliverFirst: {
      internalUrl: `${GATEWAY_BASE}/printful/v1/order-internal`,
    },
  },

  'printful-browse': {
    url: `${GATEWAY_BASE}/printful/v1/products`,
    price: '0.005',
    transformBody: (f) => ({
      id: f.id ?? undefined,
      category: f.category ?? undefined,
    }),
  },

  'printful-estimate': {
    url: `${GATEWAY_BASE}/printful/v1/estimate`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'recipient_name', 'address1', 'city', 'state_code', 'country_code', 'zip', 'items_json');
      let items: unknown[];
      try {
        items = JSON.parse(f.items_json);
      } catch {
        throw new Error('items_json must be valid JSON array');
      }
      return {
        recipient: {
          name: f.recipient_name,
          address1: f.address1,
          city: f.city,
          state_code: f.state_code,
          country_code: f.country_code,
          zip: f.zip,
        },
        items,
      };
    },
  },

  'lob-verify': {
    url: `${GATEWAY_BASE}/lob/v1/verify`,
    price: '0.01',
    transformBody: (f) => {
      require(f, 'primary_line');
      return {
        primary_line: f.primary_line,
        secondary_line: f.secondary_line ?? undefined,
        city: f.city ?? undefined,
        state: f.state ?? undefined,
        zip_code: f.zip_code ?? undefined,
      };
    },
  },

  'coingecko-price': {
    url: `${GATEWAY_BASE}/coingecko/v1/price`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'ids');
      return { ids: f.ids, vs_currencies: 'usd' };
    },
  },

  'alphavantage-quote': {
    url: `${GATEWAY_BASE}/alphavantage/v1/quote`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'symbol');
      return { symbol: f.symbol };
    },
  },

  'exchangerate-convert': {
    url: `${GATEWAY_BASE}/exchangerate/v1/convert`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'from', 'to');
      return {
        from: f.from,
        to: f.to,
        amount: requirePositive(f.amount || '1', 'amount'),
      };
    },
  },

  'screenshot': {
    url: `${GATEWAY_BASE}/screenshot/v1/capture`,
    price: '0.01',
    transformBody: (f) => {
      require(f, 'url');
      return { url: f.url };
    },
  },

  'shortio': {
    url: `${GATEWAY_BASE}/shortio/v1/shorten`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'originalURL');
      return { originalURL: f.originalURL };
    },
  },

  'qrcode': {
    url: `${GATEWAY_BASE}/qrcode/v1/generate`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'data');
      return { data: f.data };
    },
  },

  'e2b-execute': {
    url: `${GATEWAY_BASE}/judge0/v1/submissions`,
    price: '0.005',
    transformBody: (f) => {
      require(f, 'code');
      return {
        source_code: f.code,
        language_id: mapLanguage(f.language),
      };
    },
  },

  'virustotal': {
    url: `${GATEWAY_BASE}/virustotal/v1/scan`,
    price: '0.01',
    transformBody: (f) => {
      require(f, 'url');
      return { url: f.url };
    },
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

const ALLOWED_SEGMENT_RE = /^[a-z0-9\-]+$/i;

export function createRawGatewayMapping(
  path: string,
  body: Record<string, unknown>,
): GatewayMapping | null {
  try {
    const parsed = new URL(path);
    path = parsed.pathname;
  } catch { /* not a full URL — treat as path */ }
  const stripped = path.replace(/^\/+/, '');
  const segments = stripped.split('/');
  if (segments.length < 2 || segments.some((s) => !ALLOWED_SEGMENT_RE.test(s))) return null;
  const safePath = '/' + segments.join('/');
  const gatewayUrl = new URL(GATEWAY_BASE);
  gatewayUrl.pathname = safePath;
  return {
    url: gatewayUrl.toString(),
    price: '0.05',
    transformBody: () => body,
  };
}

export { GATEWAY_BASE };
