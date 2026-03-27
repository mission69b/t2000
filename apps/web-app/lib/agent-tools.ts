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
  get_portfolio: { type: 'read' },
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
    transform: (a) => ({
      to_name: String(a.to_name),
      to_address: String(a.to_address),
      message: String(a.message),
    }),
  },
  buy_gift_card: {
    type: 'service',
    serviceId: 'reloadly-giftcard',
    estimatedCost: 25,
    transform: (a) => ({
      brand: String(a.brand),
      amount: String(a.amount),
      email: String(a.email),
      country: String(a.country ?? 'US'),
    }),
  },
};

export function getEstimatedCost(toolName: string): number {
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
      description: 'Get the user\'s current balance: cash, investments, savings, debt, and per-asset holdings.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'get_rates',
      description: 'Get current yield rates across DeFi protocols (NAVI, Suilend, etc.).',
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
      name: 'get_portfolio',
      description: 'Get investment portfolio with P&L and allocations.',
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
      description: 'Search for flights between airports. Cost: $0.01. For return trips, call twice (outbound + return). Infer reasonable dates from the user\'s message and current date. IMPORTANT: You MUST use 3-letter IATA airport codes, NOT city names. Convert cities: NYC=JFK, Tokyo=NRT, London=LHR, Bangkok=BKK, Hong Kong=HKG, Paris=CDG, Sydney=SYD, LA=LAX, SF=SFO, Singapore=SIN, Seoul=ICN, Dubai=DXB, Delhi=DEL, Beijing=PEK, Shanghai=PVG.',
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
      name: 'send_postcard',
      description: 'Mail a physical postcard to any address via Lob. Cost: ~$1.00.',
      input_schema: {
        type: 'object' as const,
        properties: {
          to_name: { type: 'string', description: 'Recipient full name' },
          to_address: { type: 'string', description: 'Full mailing address' },
          message: { type: 'string', description: 'Postcard message text' },
        },
        required: ['to_name', 'to_address', 'message'],
      },
    },
    {
      name: 'buy_gift_card',
      description: 'Buy a gift card from 800+ brands (Amazon, Uber Eats, Netflix, etc.) via Reloadly. Cost: face value + 5% fee. ALWAYS confirm details with the user before calling this tool.',
      input_schema: {
        type: 'object' as const,
        properties: {
          brand: { type: 'string', description: 'Brand name (e.g. "Amazon")' },
          amount: { type: 'number', description: 'Gift card face value in USD' },
          email: { type: 'string', description: 'Recipient email address' },
          country: { type: 'string', description: 'Country code (e.g. "US", "GB", "AU")' },
        },
        required: ['brand', 'amount', 'email', 'country'],
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

export function buildSystemPrompt(
  address: string,
  email: string,
  balanceSummary?: string,
): string {
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeOfDay = now.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  return `You are t2000, a financial assistant built into a smart wallet on Sui blockchain.

## About the user
- Email: ${email}
- Wallet: ${address}
- Balance: ${balanceSummary ?? 'unknown'}
- Today: ${currentDate}, ${timeOfDay}

## Your capabilities
You have 6 read tools (free), 18 specific service tools, and 1 generic use_service tool:
- Read: balance, rates, history, portfolio, health factor, discover_services
- Specific services: web search, news, crypto prices, stock quotes, flights, email, translate, image gen, screenshots, postcards, gift cards, TTS, code execution, QR codes, short URLs, currency conversion, security scans, AI chat
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

## Rules
- Be concise. 2-4 sentences for simple answers. Use **bold** for emphasis and numbered lists for recommendations.
- Do NOT use markdown headers (#, ##, ###). Use **bold text** instead for section titles.
- When the user asks to perform a banking action (save, send, swap, borrow, repay, withdraw, invest), DO NOT use tools. Instead, respond with a brief confirmation and include an action button using bracket syntax: [Save $500], [Repay $50], [Withdraw $100], [Invest $200], [Borrow $50], [Send $10 to 0x...], [Swap $5 to SUI], [Buy $10 BTC], [Sell 1.0 ETH]. The user can tap these to execute. Always include the dollar amount in the bracket.
- The app has BUILT-IN swapping. Users can swap USDC to SUI, BTC, ETH, or GOLD (and sell them back to USDC) directly in the app. When the user asks "can I buy SUI?" or "how do I get BTC?", the answer is YES — suggest a swap button. NEVER tell users to go to an external exchange for assets we support.
- CRITICAL for action buttons: Keep the response SHORT — just confirm what you'll do and provide the button. Do NOT give manual step-by-step instructions like "open your wallet, enter the address, select token...". The button handles everything. Example: "Sending 1 USDC to that address. Gas is sponsored.\n\n[Send $1]" — that's it.
- For [Send] buttons, if the user provides a recipient address, include it: [Send $10 to 0xabc...]. The system will parse it.
- CRITICAL: Action button amounts MUST match the user's actual balances. Never suggest saving or investing more than available cash, repaying more than actual debt, or withdrawing more than savings. If debt is under $0.10, skip the repay suggestion. Round to practical amounts (e.g. leave ~$0.50 buffer for gas when suggesting save-all).
- For reports and multi-tool responses, structure output with **bold labels** and numbered recommendations. End with 1-3 actionable [Buttons] with realistic amounts the user can tap.
- For paid services (web search, flights, crypto prices, translate, image gen, etc.), ALWAYS call the tool directly. Don't ask permission for cheap calls (<$0.50). Never refuse to call a service tool — the user expects you to use them.
- For expensive services (gift cards, postcards), confirm the details first in your response before calling the tool.
- When the user says "email me" or "send me", use their email: ${email}
- Show prices in USD. Show crypto amounts with appropriate precision.
- If you don't know something, say so. Don't make up data.
- Keep tool calls minimal. Don't call tools you don't need.
- NEVER generate large code blocks, full programs, or act as a coding assistant. You are a financial assistant. If someone asks you to write code, politely decline: "I'm t2000, a financial assistant — I can help with your money, not code. Try asking me about your balance, savings, or investments." Keep responses under 300 words max.
- When chaining tools, pipe the output of one into the next. Don't ask the user to confirm intermediate steps for cheap calls — just execute.
- CRITICAL: When using dates (flights, events, etc.), always use the CURRENT year from "Today" above. If the user says "April 22nd" and today is in 2026, use 2026-04-22. Never default to a past year.

## Contacts
The user has a contacts system. After sending to a new address, the app automatically prompts to save it as a contact. Saved contacts can be used by name when sending (e.g. "send $5 to Alice"). Do NOT say you can't save contacts — the feature exists. If the user asks to save a contact manually, tell them it happens automatically after a send, or they can manage contacts in Settings (gear icon).

## Capability overview (only when explicitly asked)
ONLY show this list when the user's ENTIRE message is a generic question like "what can you do?" or "what features do you have?". NEVER show this for messages that contain a specific task — "help me send an email" means SEND AN EMAIL, "help me search for flights" means SEARCH FLIGHTS. The word "help" followed by a task is ALWAYS a task request. Execute the task.
- Banking: Save, Send, Swap, Borrow, Invest (via action buttons)
- Free: Check balance, rates, portfolio, health factor, transaction history
- Paid ($0.005-$0.05): Web search, news, crypto/stock prices, flights, email, translate, image gen, TTS, code execution, QR, URL shortening, currency conversion, security scans
- Extended (via use_service): Weather, maps, web scraping, PDF gen, semantic search, IP lookup, push notifications, transcription, email finding, 10+ AI models
- Premium ($1+): Postcards, gift cards (800+ brands), print-on-demand
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
