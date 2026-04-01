import type Anthropic from '@anthropic-ai/sdk';
import { getDisplayPrice } from '@/lib/service-pricing';

export interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface NormalizedResponse {
  content?: string;
  tool_calls?: ToolCall[];
}

export interface ToolExecutor {
  type: 'read' | 'service' | 'raw-service';
  serviceId?: string;
  estimatedCost?: number;
  transform?: (args: Record<string, unknown>) => Record<string, string>;
}

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  get_balance: { type: 'read' },
  get_rates: { type: 'read' },
  get_history: { type: 'read' },
  get_positions: { type: 'read' },
  get_health: { type: 'read' },
  discover_services: { type: 'read' },
  use_service: { type: 'raw-service', estimatedCost: 0.05 },

  web_search: {
    type: 'service',
    serviceId: 'brave-search',
    estimatedCost: 0.005,
    transform: (a) => ({ q: String(a.query) }),
  },
  get_news: {
    type: 'service',
    serviceId: 'newsapi',
    estimatedCost: 0.005,
    transform: (a) => ({ q: String(a.topic) }),
  },
  get_crypto_price: {
    type: 'service',
    serviceId: 'coingecko-price',
    estimatedCost: 0.005,
    transform: (a) => ({ ids: String(a.coins) }),
  },
  get_stock_quote: {
    type: 'service',
    serviceId: 'alphavantage-quote',
    estimatedCost: 0.005,
    transform: (a) => ({ symbol: String(a.symbol) }),
  },
  convert_currency: {
    type: 'service',
    serviceId: 'exchangerate-convert',
    estimatedCost: 0.005,
    transform: (a) => ({ from: String(a.from), to: String(a.to), amount: String(a.amount) }),
  },
  translate: {
    type: 'service',
    serviceId: 'translate',
    estimatedCost: 0.005,
    transform: (a) => ({ text: String(a.text), target: String(a.target_language) }),
  },
  send_email: {
    type: 'service',
    serviceId: 'resend-email',
    estimatedCost: 0.005,
    transform: (a) => ({ to: String(a.to), subject: String(a.subject), body: String(a.body) }),
  },
  shorten_url: {
    type: 'service',
    serviceId: 'shortio',
    estimatedCost: 0.005,
    transform: (a) => ({ originalURL: String(a.url) }),
  },
  generate_qr: {
    type: 'service',
    serviceId: 'qrcode',
    estimatedCost: 0.005,
    transform: (a) => ({ data: String(a.data) }),
  },
  run_code: {
    type: 'service',
    serviceId: 'e2b-execute',
    estimatedCost: 0.005,
    transform: (a) => ({ code: String(a.code), language: String(a.language ?? 'python') }),
  },
  ask_ai: {
    type: 'service',
    serviceId: 'openai-chat',
    estimatedCost: 0.01,
    transform: (a) => ({ prompt: String(a.prompt), model: String(a.model ?? 'openai') }),
  },
  search_flights: {
    type: 'service',
    serviceId: 'serpapi-flights',
    estimatedCost: 0.01,
    transform: (a) => ({ departure: String(a.from), arrival: String(a.to), date: String(a.date) }),
  },
  take_screenshot: {
    type: 'service',
    serviceId: 'screenshot',
    estimatedCost: 0.01,
    transform: (a) => ({ url: String(a.url) }),
  },
  security_scan: {
    type: 'service',
    serviceId: 'virustotal',
    estimatedCost: 0.01,
    transform: (a) => ({ url: String(a.url) }),
  },
  generate_image: {
    type: 'service',
    serviceId: 'fal-flux',
    estimatedCost: 0.03,
    transform: (a) => ({ prompt: String(a.prompt) }),
  },
  text_to_speech: {
    type: 'service',
    serviceId: 'elevenlabs-tts',
    estimatedCost: 0.05,
    transform: (a) => ({ text: String(a.text) }),
  },
  send_postcard: {
    type: 'service',
    serviceId: 'lob-postcard',
    estimatedCost: 1.0,
    transform: (a) => {
      const fields: Record<string, string> = {
        to_name: String(a.to_name),
        to_address_line1: String(a.to_address_line1),
        to_city: String(a.to_city),
        to_state: String(a.to_state),
        to_zip: String(a.to_zip),
        to_country: String(a.to_country ?? 'US'),
        message: String(a.message),
      };
      if (a.to_address_line2) fields.to_address_line2 = String(a.to_address_line2);
      return fields;
    },
  },
  send_letter: {
    type: 'service',
    serviceId: 'lob-letter',
    estimatedCost: 1.5,
    transform: (a) => {
      const fields: Record<string, string> = {
        to_name: String(a.to_name),
        to_address_line1: String(a.to_address_line1),
        to_city: String(a.to_city),
        to_state: String(a.to_state),
        to_zip: String(a.to_zip),
        to_country: String(a.to_country ?? 'US'),
        body: String(a.body),
      };
      if (a.to_address_line2) fields.to_address_line2 = String(a.to_address_line2);
      return fields;
    },
  },
  verify_address: {
    type: 'service',
    serviceId: 'lob-verify',
    estimatedCost: 0.01,
    transform: (a) => {
      const fields: Record<string, string> = { primary_line: String(a.primary_line) };
      if (a.secondary_line) fields.secondary_line = String(a.secondary_line);
      if (a.city) fields.city = String(a.city);
      if (a.state) fields.state = String(a.state);
      if (a.zip_code) fields.zip_code = String(a.zip_code);
      return fields;
    },
  },
  browse_products: {
    type: 'service',
    serviceId: 'printful-browse',
    estimatedCost: 0.005,
    transform: (a) => {
      const fields: Record<string, string> = {};
      if (a.product_id) fields.id = String(a.product_id);
      if (a.category) fields.category = String(a.category);
      return fields;
    },
  },
  estimate_order: {
    type: 'service',
    serviceId: 'printful-estimate',
    estimatedCost: 0.005,
    transform: (a) => ({
      recipient_name: String(a.recipient_name),
      address1: String(a.address1),
      city: String(a.city),
      state_code: String(a.state_code),
      country_code: String(a.country_code ?? 'US'),
      zip: String(a.zip),
      items_json: String(a.items_json),
    }),
  },
  place_order: {
    type: 'service',
    serviceId: 'printful-order',
    estimatedCost: 15.0,
    transform: (a) => {
      const fields: Record<string, string> = {
        recipient_name: String(a.recipient_name),
        address1: String(a.address1),
        city: String(a.city),
        state_code: String(a.state_code),
        country_code: String(a.country_code ?? 'US'),
        zip: String(a.zip),
        items_json: String(a.items_json),
      };
      if (a.address2) fields.address2 = String(a.address2);
      return fields;
    },
  },
};

export function getEstimatedCost(toolName: string, args?: Record<string, unknown>): number {
  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) return 0;
  if (executor.type === 'read') return 0;
  if (executor.estimatedCost) return executor.estimatedCost;
  if (executor.serviceId) return parseFloat(getDisplayPrice(executor.serviceId));
  return 0.01;
}

export function getAnthropicTools(): Anthropic.Messages.Tool[] {
  return [
    {
      name: 'get_balance',
      description: 'Get the user\'s current balance: cash, savings, debt, and gas reserve.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'get_rates',
      description: 'Get current USDC savings and borrow APY rates from NAVI (and other configured lending protocols). Returns per-protocol USDC rates with protocolId, plus bestSaveRate (highest USDC supply APY). Use for yield questions in a USDC-only product — no cross-asset moves.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'get_history',
      description: 'Get the user\'s recent transaction history.',
      input_schema: {
        type: 'object' as const,
        properties: { limit: { type: 'number', description: 'Number of transactions to return (default 10)' } },
        required: [],
      },
    },
    {
      name: 'get_positions',
      description: 'Get lending positions with savings breakdown across protocols.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'get_health',
      description: 'Get health factor and borrow safety metrics.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'web_search',
      description: 'Search the web using Brave Search. Returns web results with snippets. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: { query: { type: 'string', description: 'Search query' } },
        required: ['query'],
      },
    },
    {
      name: 'get_news',
      description: 'Get breaking news from 150,000+ sources. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: { topic: { type: 'string', description: 'News topic to search' } },
        required: ['topic'],
      },
    },
    {
      name: 'get_crypto_price',
      description: 'Get live cryptocurrency prices from CoinGecko. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: { coins: { type: 'string', description: 'Comma-separated coin IDs (e.g. "bitcoin,ethereum,sui")' } },
        required: ['coins'],
      },
    },
    {
      name: 'get_stock_quote',
      description: 'Get real-time stock quote from AlphaVantage. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: { symbol: { type: 'string', description: 'Stock ticker (e.g. "AAPL")' } },
        required: ['symbol'],
      },
    },
    {
      name: 'convert_currency',
      description: 'Convert between 160+ fiat currencies. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: {
          from: { type: 'string', description: 'Source currency code (e.g. "USD")' },
          to: { type: 'string', description: 'Target currency code (e.g. "EUR")' },
          amount: { type: 'number', description: 'Amount to convert' },
        },
        required: ['from', 'to', 'amount'],
      },
    },
    {
      name: 'translate',
      description: 'Translate text to another language via Google Translate. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          target_language: { type: 'string', description: 'ISO 639-1 language code: "es" for Spanish, "ja" for Japanese, "fr" for French, "de" for German, "zh" for Chinese, "ko" for Korean, "pt" for Portuguese, "it" for Italian, "ar" for Arabic, "hi" for Hindi' },
        },
        required: ['text', 'target_language'],
      },
    },
    {
      name: 'send_email',
      description: 'Send an email via Resend. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body text' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
    {
      name: 'shorten_url',
      description: 'Create a short URL with click analytics. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: { url: { type: 'string', description: 'URL to shorten' } },
        required: ['url'],
      },
    },
    {
      name: 'generate_qr',
      description: 'Generate a QR code for any URL or text. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: { data: { type: 'string', description: 'URL or text to encode' } },
        required: ['data'],
      },
    },
    {
      name: 'run_code',
      description: 'Execute code in Python, JavaScript, TypeScript, Go, or Rust. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: {
          code: { type: 'string', description: 'Source code to execute' },
          language: { type: 'string', description: 'Language: python, javascript, typescript, go, rust' },
        },
        required: ['code', 'language'],
      },
    },
    {
      name: 'ask_ai',
      description: 'Send a prompt to GPT-4o or another AI model. Cost: $0.01.',
      input_schema: {
        type: 'object' as const,
        properties: {
          prompt: { type: 'string', description: 'Prompt to send to the AI' },
          model: { type: 'string', description: 'Model: openai, anthropic, gemini, groq, deepseek, mistral, perplexity' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'search_flights',
      description: 'Search for flights between airports. Cost: $0.01. IMPORTANT: You MUST use 3-letter IATA airport codes, NOT city names. Convert cities: NYC=JFK, Tokyo=NRT, London=LHR, Bangkok=BKK, Hong Kong=HKG, Paris=CDG, Sydney=SYD, LA=LAX, SF=SFO, Singapore=SIN, Seoul=ICN, Dubai=DXB, Delhi=DEL, Beijing=PEK, Shanghai=PVG.',
      input_schema: {
        type: 'object' as const,
        properties: {
          from: { type: 'string', description: 'IATA airport code (3 letters, e.g. "JFK", "BKK", "SYD")' },
          to: { type: 'string', description: 'IATA airport code (3 letters, e.g. "NRT", "HKG", "LHR")' },
          date: { type: 'string', description: 'Departure date in YYYY-MM-DD format (e.g. "2026-04-15")' },
        },
        required: ['from', 'to', 'date'],
      },
    },
    {
      name: 'take_screenshot',
      description: 'Capture a webpage as an image. Cost: $0.01.',
      input_schema: {
        type: 'object' as const,
        properties: { url: { type: 'string', description: 'URL to capture' } },
        required: ['url'],
      },
    },
    {
      name: 'security_scan',
      description: 'Scan a URL for security threats via VirusTotal. Cost: $0.01.',
      input_schema: {
        type: 'object' as const,
        properties: { url: { type: 'string', description: 'URL to scan' } },
        required: ['url'],
      },
    },
    {
      name: 'generate_image',
      description: 'Generate an image from a text prompt via Flux. Cost: $0.03.',
      input_schema: {
        type: 'object' as const,
        properties: { prompt: { type: 'string', description: 'Image description' } },
        required: ['prompt'],
      },
    },
    {
      name: 'text_to_speech',
      description: 'Convert text to natural-sounding audio via ElevenLabs. Cost: $0.05.',
      input_schema: {
        type: 'object' as const,
        properties: { text: { type: 'string', description: 'Text to convert to speech' } },
        required: ['text'],
      },
    },
    {
      name: 'verify_address',
      description: 'Verify a US address before sending mail. Cost: $0.01. Returns deliverability status and standardized address. ALWAYS call this before send_postcard for US addresses.',
      input_schema: {
        type: 'object' as const,
        properties: {
          primary_line: { type: 'string', description: 'Street address (e.g. "185 Berry St Suite 6100")' },
          secondary_line: { type: 'string', description: 'Apt/Suite if separate' },
          city: { type: 'string', description: 'City name' },
          state: { type: 'string', description: 'State code (e.g. "CA")' },
          zip_code: { type: 'string', description: 'ZIP code' },
        },
        required: ['primary_line'],
      },
    },
    {
      name: 'send_postcard',
      description: 'Mail a physical postcard to any address worldwide via Lob. Cost: ~$1.00. The front shows a t2000 branded design, the back has your message. Lob returns thumbnails and expected delivery date. MUST confirm with user before calling.',
      input_schema: {
        type: 'object' as const,
        properties: {
          to_name: { type: 'string', description: 'Recipient full name' },
          to_address_line1: { type: 'string', description: 'Street address line 1' },
          to_address_line2: { type: 'string', description: 'Apartment, suite, etc. (optional)' },
          to_city: { type: 'string', description: 'City' },
          to_state: { type: 'string', description: 'State/province code' },
          to_zip: { type: 'string', description: 'ZIP/postal code' },
          to_country: { type: 'string', description: 'Country code (e.g. "US", "AU", "GB"). Defaults to US.' },
          message: { type: 'string', description: 'Message for the back of the postcard (max ~350 chars)' },
        },
        required: ['to_name', 'to_address_line1', 'to_city', 'to_state', 'to_zip', 'message'],
      },
    },
    {
      name: 'send_letter',
      description: 'Mail a physical letter to any address worldwide via Lob. Cost: ~$1.50. Printed on standard letter paper, mailed in an envelope. MUST confirm with user before calling.',
      input_schema: {
        type: 'object' as const,
        properties: {
          to_name: { type: 'string', description: 'Recipient full name' },
          to_address_line1: { type: 'string', description: 'Street address line 1' },
          to_address_line2: { type: 'string', description: 'Apartment, suite, etc. (optional)' },
          to_city: { type: 'string', description: 'City' },
          to_state: { type: 'string', description: 'State/province code' },
          to_zip: { type: 'string', description: 'ZIP/postal code' },
          to_country: { type: 'string', description: 'Country code (e.g. "US", "AU", "GB"). Defaults to US.' },
          body: { type: 'string', description: 'The letter body text. Can be multiple paragraphs. Will be printed on standard letter paper.' },
        },
        required: ['to_name', 'to_address_line1', 'to_city', 'to_state', 'to_zip', 'body'],
      },
    },
    {
      name: 'browse_products',
      description: 'Browse Printful product catalog (t-shirts, hoodies, mugs, posters, etc.). Cost: $0.005. Returns available products with variant IDs and pricing. Use to find product/variant IDs before estimating or ordering.',
      input_schema: {
        type: 'object' as const,
        properties: {
          product_id: { type: 'string', description: 'Specific product ID to get details + variants' },
          category: { type: 'string', description: 'Category ID to filter (optional)' },
        },
        required: [],
      },
    },
    {
      name: 'estimate_order',
      description: 'Get a cost estimate for a Printful merch order before placing it. Cost: $0.005. Returns itemized costs (subtotal, shipping, tax, total). Call this to show the user the price before confirming.',
      input_schema: {
        type: 'object' as const,
        properties: {
          recipient_name: { type: 'string', description: 'Recipient full name' },
          address1: { type: 'string', description: 'Street address' },
          city: { type: 'string', description: 'City' },
          state_code: { type: 'string', description: 'State/province code (e.g. "CA")' },
          country_code: { type: 'string', description: 'Country code (e.g. "US"). Defaults to US.' },
          zip: { type: 'string', description: 'ZIP/postal code' },
          items_json: { type: 'string', description: 'JSON array of items, each with variant_id, quantity, and files array. Example: [{"variant_id":4011,"quantity":1,"files":[{"url":"https://..."}]}]' },
        },
        required: ['recipient_name', 'address1', 'city', 'state_code', 'zip', 'items_json'],
      },
    },
    {
      name: 'place_order',
      description: 'Place a Printful merch order (t-shirts, hoodies, mugs, posters, etc.). Cost: dynamic ($5-$50+). Order is placed with Printful and shipped to recipient. MUST call estimate_order first and confirm with user before placing.',
      input_schema: {
        type: 'object' as const,
        properties: {
          recipient_name: { type: 'string', description: 'Recipient full name' },
          address1: { type: 'string', description: 'Street address line 1' },
          address2: { type: 'string', description: 'Apartment, suite, etc. (optional)' },
          city: { type: 'string', description: 'City' },
          state_code: { type: 'string', description: 'State/province code (e.g. "CA")' },
          country_code: { type: 'string', description: 'Country code (e.g. "US"). Defaults to US.' },
          zip: { type: 'string', description: 'ZIP/postal code' },
          items_json: { type: 'string', description: 'JSON array of items, each with variant_id, quantity, and files array. Example: [{"variant_id":4011,"quantity":1,"files":[{"url":"https://..."}]}]' },
        },
        required: ['recipient_name', 'address1', 'city', 'state_code', 'zip', 'items_json'],
      },
    },
    {
      name: 'discover_services',
      description: 'Discover all available paid MPP services with endpoints, prices, and descriptions. Call this if the user asks about available services or if you need to find the right endpoint for use_service.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'use_service',
      description: 'Call ANY MPP service by URL. Use this for services not covered by specific tools (weather, maps, scraping, additional AI models, etc.). The full service catalog is in your system prompt. Cost varies by service.',
      input_schema: {
        type: 'object' as const,
        properties: {
          url: { type: 'string', description: 'Full MPP gateway URL (e.g. "https://mpp.t2000.ai/openweather/v1/weather")' },
          body: { type: 'string', description: 'JSON request body as string (e.g. \'{"city":"Tokyo"}\')' },
          maxPrice: { type: 'number', description: 'Max price in USD you expect (for confirmation). Default 0.05' },
        },
        required: ['url', 'body'],
      },
    },
  ];
}

const TIMEZONE_COUNTRY_MAP: Record<string, string> = {
  'Australia': 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'America/Buenos_Aires': 'AR',
  'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
  'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
  'Europe/Rome': 'IT', 'Europe/Madrid': 'ES', 'Europe/Amsterdam': 'NL',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Istanbul': 'TR',
  'Europe/Moscow': 'RU', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT',
  'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Brussels': 'BE',
  'Europe/Prague': 'CZ', 'Europe/Bucharest': 'RO', 'Europe/Athens': 'GR',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Singapore': 'SG',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Bangkok': 'TH',
  'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Manila': 'PH', 'Asia/Karachi': 'PK', 'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA', 'Asia/Jerusalem': 'IL', 'Asia/Dhaka': 'BD',
  'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Cairo': 'EG',
  'Africa/Johannesburg': 'ZA', 'Africa/Accra': 'GH', 'Africa/Casablanca': 'MA',
};

const LOCALE_COUNTRY_MAP: Record<string, string> = {
  'en-AU': 'AU', 'en-US': 'US', 'en-GB': 'GB', 'en-CA': 'CA', 'en-NZ': 'NZ',
  'en-IE': 'IE', 'en-SG': 'SG', 'en-IN': 'IN', 'de-DE': 'DE', 'fr-FR': 'FR',
  'es-ES': 'ES', 'it-IT': 'IT', 'pt-BR': 'BR', 'ja-JP': 'JP', 'ko-KR': 'KR',
  'zh-CN': 'CN', 'zh-TW': 'TW', 'nl-NL': 'NL', 'sv-SE': 'SE', 'da-DK': 'DK',
  'nb-NO': 'NO', 'fi-FI': 'FI', 'pl-PL': 'PL', 'tr-TR': 'TR', 'th-TH': 'TH',
  'id-ID': 'ID', 'ms-MY': 'MY', 'vi-VN': 'VN', 'ar-SA': 'SA', 'he-IL': 'IL',
};

export function countryFromTimezoneAndLocale(timezone?: string, locale?: string): string {
  if (timezone) {
    if (TIMEZONE_COUNTRY_MAP[timezone]) return TIMEZONE_COUNTRY_MAP[timezone];
    const prefix = timezone.split('/')[0] + '/' + timezone.split('/')[1]?.split('/')[0];
    if (prefix && TIMEZONE_COUNTRY_MAP[prefix]) return TIMEZONE_COUNTRY_MAP[prefix];
    const region = timezone.split('/')[0];
    if (region === 'Australia') return 'AU';
  }
  if (locale) {
    if (LOCALE_COUNTRY_MAP[locale]) return LOCALE_COUNTRY_MAP[locale];
    const parts = locale.split('-');
    if (parts[1] && parts[1].length === 2) return parts[1].toUpperCase();
  }
  return 'US';
}

export function buildSystemPrompt(
  address: string,
  email: string,
  balanceSummary?: string,
  locale?: string,
  timezone?: string,
): string {
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeOfDay = now.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  const country = countryFromTimezoneAndLocale(timezone, locale);
  return `You are t2000, a financial assistant built into a smart wallet on Sui blockchain.

## About the user
- Email: ${email}
- Wallet: ${address}
- Balance: ${balanceSummary ?? 'unknown'}
- Country: ${country}
- Today: ${currentDate}, ${timeOfDay}

## Your capabilities
You have 6 read tools (free), 22 specific service tools, and 1 generic use_service tool:
- Read: balance, rates, history, positions, health factor, discover_services
- Specific services: web search, news, crypto prices, stock quotes, flights, email, translate, image gen, image edit, screenshots, postcards, letters, TTS, code execution, QR codes, short URLs, currency conversion, security scans, AI chat, address verification, merch browse/estimate/order
- Generic: use_service can call ANY of the 40+ MPP gateway services below

## MPP Service Catalog (for use_service tool)
Base: https://mpp.t2000.ai — Use these when no specific tool exists:
- Weather: /openweather/v1/weather {"city":"Tokyo"} $0.005 | /openweather/v1/forecast {"city":"London"} $0.005
- Maps: /googlemaps/v1/geocode {"address":"..."} $0.01 | /googlemaps/v1/directions {"origin":"...","destination":"..."} $0.01 | /googlemaps/v1/places {"query":"..."} $0.01
- Scrape: /firecrawl/v1/scrape {"url":"..."} $0.01 | /firecrawl/v1/extract {"url":"...","prompt":"..."} $0.02
- Read URL: /jina/v1/read {"url":"..."} $0.005
- Semantic search: /exa/v1/search {"query":"..."} $0.01
- Google search: /serper/v1/search {"q":"..."} $0.005
- PDF: /pdfshift/v1/convert {"source":"<html>..."} $0.01
- AI models: /gemini/v1beta/models/gemini-2.5-flash {"contents":[...]} $0.005 | /groq/v1/chat/completions {"model":"llama-3.3-70b-versatile","messages":[...]} $0.005 | /perplexity/v1/chat/completions {"model":"sonar","messages":[...]} $0.01 | /deepseek/v1/chat/completions {"model":"deepseek-chat","messages":[...]} $0.005
- Transcribe: /assemblyai/v1/transcribe {"audio_url":"..."} $0.02
- Email find: /hunter/v1/search {"domain":"..."} $0.02 | /hunter/v1/verify {"email":"..."} $0.02
- IP lookup: /ipinfo/v1/lookup {"ip":"..."} $0.005
- Push notify: /pushover/v1/push {"message":"...","title":"..."} $0.005
- Print: /printful/v1/products {} $0.005 | /printful/v1/order {"items":[...]} dynamic
- Image: /stability/v1/generate {"prompt":"..."} $0.03 | /replicate/v1/predictions {"model":"...","input":{}} $0.02
- Embeddings: /cohere/v1/embed {"texts":["..."]} $0.005 | /together/v1/embeddings {"input":"..."} $0.001
Always prepend https://mpp.t2000.ai to relative paths when calling use_service.

## DeFi Integration
Savings and lending are **USDC-only** on **NAVI** (and the app’s configured protocols). For rates or yield, use **get_rates** (USDC supply/borrow APYs). Do not suggest moving between stablecoins or cross-asset “rebalance” — that flow is not available.

## Rules
- Be ULTRA concise. Every word must earn its place. No fluff, no disclaimers, no "I'd be happy to help." Just do the thing.
  Simple answers: 1-2 sentences max.
  Reports/recaps: Use stat blocks for key numbers, then a 1-2 line assessment. Skip sections with nothing meaningful to report.
  Yield comparisons: Only list rates BETTER than the user's current rate. Don't waste space showing worse options.
  General: If you can say it in fewer words, do. Short beats a paragraph.
- STAT BLOCKS for financial data: ALWAYS use stat blocks for ANY response containing numeric financial data. NEVER fall back to plain text lines like "Cash: $51" or bullet points with numbers. Syntax — each on its own line:
  <<stat label="Label" value="$123" status="safe">>
  Status values: "safe" (green — good/positive), "warning" (yellow — needs attention), "danger" (red — urgent), "neutral" (white — informational).
  Use "safe" for: positive balances, savings > 0, good health factors, low debt, good rates, protocols. Use "neutral" for: cash amounts, totals, informational values. Use "warning" for: moderate debt, low health. Use "danger" for: high debt, near liquidation.
  Consecutive stats auto-group into a 2-column grid. Use 2-6 stats per response. After the stats, add a 1-2 line text assessment + action buttons.

  MANDATORY templates — follow these patterns for every financial response:

  BALANCE CHECK ("show balance", "how much do I have"):
  <<stat label="Cash" value="$51.38" status="neutral">>
  <<stat label="Savings" value="$12.97" status="neutral">>
  <<stat label="Debt" value="$0.00" status="safe">>
  <<stat label="Total" value="$64.35" status="neutral">>
  Then 1-line summary + buttons like [Save $50].

  HEALTH / RISK CHECK ("check health", "borrowing risk", "liquidation"):
  <<stat label="Health Factor" value="49,967" status="safe">>
  <<stat label="Debt" value="$0.0002" status="safe">>
  <<stat label="Available Borrow" value="$9.73" status="neutral">>
  <<stat label="Collateral" value="$12.97" status="neutral">>
  Then 1-line risk assessment.

  YIELD / RATE COMPARISON ("best yield", "compare rates", "am I getting best rate"):
  <<stat label="Your Rate" value="4.5% APY" status="neutral">>
  <<stat label="Best Available" value="6.39% APY" status="safe">>
  <<stat label="Extra Earnings" value="+$1.20/yr" status="safe">>
  Then a one-line USDC yield note + [Save $X] if idle cash can capture the rate.

  POSITIONS ("show positions", "what do I have saved"):
  <<stat label="USDC on NAVI" value="$51.38" status="neutral">>
  <<stat label="SUI" value="36.59 ($36.59)" status="neutral">>
  <<stat label="Savings" value="$12.97" status="neutral">>
  <<stat label="Net Worth" value="$100.94" status="neutral">>
  Then 1-line diversification note.

  WEEKLY RECAP:
  <<stat label="Cash" value="$29.93" status="neutral">>
  <<stat label="Savings" value="$0.001" status="neutral">>
  <<stat label="Sent" value="$11.37" status="neutral">>
  <<stat label="Yield" value="4.5% APY" status="neutral">>
  Then 2-3 line summary + action buttons.

  LIQUIDATION THRESHOLDS ("how far from liquidation", "price drop"):
  <<stat label="Health Factor" value="49,967" status="safe">>
  <<stat label="Liquidation At" value="HF < 1.0" status="danger">>
  <<stat label="SUI Drop Buffer" value="99.99%" status="safe">>
  <<stat label="Current Debt" value="$0.0002" status="safe">>
  Then 1-line explanation of what it means.

  TRANSACTION SUMMARY (after get_history):
  Use stat blocks ONLY for totals (e.g. Total Sent, Tx Count, Gas Cost). Use bullet points for the individual transaction list.

  EMAIL CONFIRMATION (after send_email):
  <<stat label="Sent to" value="user@email.com" status="safe">>
  <<stat label="Status" value="Delivered" status="safe">>
  <<stat label="Subject" value="Flight options: SYD → NRT" status="neutral">>
  No extra text needed — the card is the confirmation.

  CRITICAL: If ANY tool returns numbers, amounts, rates, or financial metrics — use stat blocks. NEVER output plain text like "Cash: $51" or "Total: $64.35" or "Health Factor: 49966". Those MUST be stat blocks. Plain text numbers are a UX failure and look broken to the user.
- Do NOT use markdown headers (#, ##, ###). Use **bold text** instead for section titles.
- When the user asks to perform a banking action (save, send, borrow, repay, withdraw), DO NOT use tools. Instead, respond with a brief confirmation and include an action button using bracket syntax: [Save $500], [Repay $50], [Withdraw $100], [Borrow $50], [Send $10 to 0x...]. The user can tap these to execute. Always include the dollar amount in the bracket.
- CRITICAL for action buttons: Keep the response SHORT — just confirm what you'll do and provide the button. Do NOT give manual step-by-step instructions like "open your wallet, enter the address, select token...". The button handles everything. Example: "Sending 1 USDC to that address. Gas is sponsored.\n\n[Send $1]" — that's it.
- For [Send] buttons, if the user provides a recipient address, include it: [Send $10 to 0xabc...]. The system will parse it.
- CRITICAL: Action button amounts MUST match the user's actual balances. Never suggest saving more than available cash, repaying more than actual debt, or withdrawing more than savings. If debt is under $0.10, skip the repay suggestion. Round to practical amounts (e.g. leave ~$0.50 buffer for gas when suggesting save-all).
- When the user asks to do something with "all" their funds (e.g. "withdraw all", "save everything", "repay all debt"), use the word "all" in the button: [Withdraw all], [Save all], [Repay all]. The system handles "all" correctly by using the exact on-chain balance. Do NOT substitute a dollar amount for "all" — the on-chain amount may differ from the rounded display value.
- For reports and multi-tool responses: lead with stat blocks for the key numbers, then 1-2 lines of assessment, then 1-2 [Buttons]. Only include sections with actionable info. The user should always have a clear next step. Don't pad with empty context or recap what they already know.
- For paid services (web search, flights, crypto prices, translate, image gen, etc.), ALWAYS call the tool directly. Don't ask permission for cheap calls (<$0.50). Never refuse to call a service tool — the user expects you to use them.
- GIFT GIVING: You can help users send thoughtful gifts. When someone mentions a gift, birthday, holiday, or person they want to buy for — think creatively.
  GIFT CHAINS — combine tools for a thoughtful result:
  - **Creative gift**: generate_image (custom design) → send_postcard (mailed with the AI art). Great for birthdays, thank-yous, thinking-of-you.
  - **Custom merch gift**: generate_image → browse_products → estimate_order → place_order (custom mug, shirt, poster shipped to them). The ultimate personalized gift.
  - **Multi-person**: For "gifts for the whole family" — work through each person one at a time.
  ALWAYS suggest the next step: "I can generate a custom design and put it on a mug — want to see?" Chain tools naturally.
  SEASONAL AWARENESS — check today's date and proactively think about upcoming events:
  - Dec 1–25: Christmas/holiday gifts. Custom merch, postcards.
  - Feb 1–14: Valentine's Day. Postcard, creative gift.
  - May (2nd Sunday): Mother's Day. Postcard + custom merch combo.
  - Jun (3rd Sunday): Father's Day. Same pattern.
  - Birthdays: Go all out — this is the most personal gift-giving moment.
- PHYSICAL MAIL (postcards + letters): You can mail a real postcard (~$1) or letter (~$1.50) anywhere in the world. Postcards: t2000 branded front, user's message on back. Letters: printed on letter paper in an envelope — good for longer messages, formal notes, or anything that doesn't fit a postcard. Choose the right format for the user's intent: "send a birthday card" → postcard, "write a letter to my landlord" → letter.
  Flow (MUST follow):
    STEP 1 — Collect details: Get recipient name, full address (street, city, state, zip, country), and the message. Parse addresses intelligently — "123 Main St, Sydney NSW 2000, Australia" → line1: "123 Main St", city: "Sydney", state: "NSW", zip: "2000", country: "AU". For US addresses, call verify_address first ($0.01) to check deliverability.
    STEP 2 — Confirm: Show a summary: "Sending a postcard to **Name** at City, State. Message: '...' — Cost: ~$1.05. Send it?" Do NOT call send_postcard yet.
    STEP 3 — Send (only after user confirms): call send_postcard.
  After success, the result contains expected_delivery_date and thumbnails. Render using this EXACT syntax on its own line:
  <<postcard to="Name — City, State" message="The message text" delivery="Apr 5, 2026" tracking="psc_xxx" front="thumbnail_url" back="thumbnail_url">>
  If thumbnails are in result.thumbnails (array of objects with large/medium/small URLs), use the "medium" size. If not available, omit front/back attrs.
- MERCH ORDERS (Printful): You can order custom printed merchandise — t-shirts, hoodies, mugs, posters, phone cases, etc. — shipped to any address. Prices vary by product ($5-$50+).
  Flow (MUST follow):
    STEP 1 — Browse: Call browse_products to see what's available. If user wants a specific product, get the product details to find variant_ids (size, color).
    STEP 2 — Estimate: Call estimate_order with the shipping address and items to get a price quote. Show the user: "T-shirt (L, Black) shipped to **Name** in City, State — estimated total: $18.50 (incl. shipping). Order it?"
    STEP 3 — Order (only after user confirms): Call place_order. This uses deliver-first — Printful is called before payment, so if anything fails you won't be charged.
  Items format: each item needs variant_id (from browse), quantity, and files array with design URLs. Example: [{"variant_id":4011,"quantity":1,"files":[{"url":"https://example.com/design.png"}]}]
- TOOL FAILURE HANDLING: When ANY tool returns an error, tell the user IMMEDIATELY and clearly. Do NOT silently move on to other tools or change the subject.
  - Say what failed: "Couldn't send the postcard" / "Flight search hit an error"
  - Include the reason if the error message is user-friendly. Skip raw technical errors — just say "a service error occurred."
  - Offer to retry: "Want me to try again?" — keep it short.
  - NEVER call get_balance, get_rates, or any other unrelated tool after a purchase failure. The user wants to know their purchase failed, not their balance.
- NEVER pad responses with filler like "Sure!", "I'd be happy to help!", "Great choice!", "Let me help you with that!". Get straight to the action.
- When the user says "email me" or "send me", use their email: ${email}
- Show prices in USD. Show crypto amounts with appropriate precision.
- If you don't know something, say so. Don't make up data.
- Keep tool calls minimal. Don't call tools you don't need.
- NEVER generate large code blocks, full programs, or act as a coding assistant. You are a financial assistant. If someone asks you to write code, politely decline: "I'm t2000, a financial assistant — I can help with your money, not code. Try asking me about your balance, savings, or payments." Keep responses under 300 words max.
- When chaining tools, pipe the output of one into the next. Don't ask the user to confirm intermediate steps for cheap calls — just execute.
- CRITICAL: When using dates (flights, events, etc.), always use the CURRENT year from "Today" above. If the user says "April 22nd" and today is in 2026, use 2026-04-22. Never default to a past year.
- FLIGHTS: If the user does NOT specify a date, departure city, or one-way vs return, ASK before searching. Do NOT assume dates or airports. Example: "Where are you flying from, and when? One-way or return?" Keep it to one quick question. Once you have the info, search immediately without further confirmation.

## Contacts
The user has a contacts system. After sending to a new address, the app automatically prompts to save it as a contact. Saved contacts can be used by name when sending (e.g. "send $5 to Alice"). Do NOT say you can't save contacts — the feature exists. If the user asks to save a contact manually, tell them it happens automatically after a send, or they can manage contacts in Settings (gear icon).

## Capability overview (only when explicitly asked)
ONLY show this list when the user's ENTIRE message is a generic question like "what can you do?" or "what features do you have?". NEVER show this for messages that contain a specific task — "help me send an email" means SEND AN EMAIL, "help me search for flights" means SEARCH FLIGHTS. The word "help" followed by a task is ALWAYS a task request. Execute the task.
- Banking: Save, Send, Borrow, Repay (via action buttons, NAVI Protocol)
- Free: Check balance, rates, positions, health factor, transaction history
- Paid ($0.005-$0.05): Web search, news, crypto/stock prices, flights, email, translate, image gen, TTS, code execution, QR, URL shortening, currency conversion, security scans
- Extended (via use_service): Weather, maps, web scraping, PDF gen, semantic search, IP lookup, push notifications, transcription, email finding, 10+ AI models
- Premium ($1+): Postcards, print-on-demand merch
Keep it to 4-5 lines. End with: "Try 'search for flights to Tokyo' or 'what's my balance?'"

## First-time users
If the user's balance is $0 or unknown, they're likely new. Welcome them briefly and suggest sending funds to their address to get started. Don't overwhelm with features.`;
}

export function normalizeAnthropicResponse(
  response: Anthropic.Messages.Message,
): NormalizedResponse {
  let content: string | undefined;
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      content = block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
  }

  return {
    content: content || undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

interface InternalMessage {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export function toAnthropicMessages(
  messages: InternalMessage[],
): Anthropic.Messages.MessageParam[] {
  const result: Anthropic.Messages.MessageParam[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content ?? '' });
      i++;
    } else if (msg.role === 'assistant') {
      const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
      }
      result.push({ role: 'assistant', content: contentBlocks });
      i++;
    } else if (msg.role === 'tool') {
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      while (i < messages.length && messages[i].role === 'tool') {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: messages[i].tool_call_id!,
          content: messages[i].content ?? '',
        });
        i++;
      }
      result.push({ role: 'user', content: toolResults });
    } else {
      i++;
    }
  }

  return result;
}
