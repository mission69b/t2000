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
  type: 'read' | 'service';
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
      description: 'Translate text to another language via DeepL. Cost: $0.005.',
      input_schema: {
        type: 'object' as const,
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          target_language: { type: 'string', description: 'Target language (e.g. "Spanish", "ja", "fr")' },
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
      description: 'Search for flights between airports. Cost: $0.01. For return trips, call twice (outbound + return). Infer reasonable dates from the user\'s message and current date.',
      input_schema: {
        type: 'object' as const,
        properties: {
          from: { type: 'string', description: 'Departure city or airport code (e.g. "SYD", "BKK")' },
          to: { type: 'string', description: 'Arrival city or airport code (e.g. "NRT", "HKG")' },
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
  ];
}

export function buildSystemPrompt(
  address: string,
  email: string,
  balanceSummary?: string,
): string {
  const timeOfDay = new Date().toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  return `You are t2000, a financial assistant built into a smart wallet on Sui blockchain.

## About the user
- Email: ${email}
- Wallet: ${address}
- Balance: ${balanceSummary ?? 'unknown'}
- Local time: ${timeOfDay}

## Your capabilities
You have 5 read tools (free) and 18 service tools (paid via USDC):
- Read: balance, rates, history, portfolio, health factor
- Services: web search, news, crypto prices, stock quotes, flights, email, translate, image gen, screenshots, postcards, gift cards, TTS, code execution, QR codes, short URLs, currency conversion, security scans, AI chat

## Rules
- Be concise. 2-4 sentences for simple answers. Use **bold** for emphasis and numbered lists for recommendations.
- Do NOT use markdown headers (#, ##, ###). Use **bold text** instead for section titles.
- When the user asks to perform a banking action (save, send, swap, borrow, repay, withdraw, invest), DO NOT use tools. Instead, respond with advice and include an action button using bracket syntax: [Save $500], [Repay $50], [Withdraw $100], [Invest $200], [Borrow $50], [Send $10]. The user can tap these to execute. Always include the dollar amount in the bracket.
- CRITICAL: Action button amounts MUST match the user's actual balances. Never suggest saving or investing more than available cash, repaying more than actual debt, or withdrawing more than savings. If debt is under $0.10, skip the repay suggestion. Round to practical amounts (e.g. leave ~$0.50 buffer for gas when suggesting save-all).
- For reports and multi-tool responses, structure output with **bold labels** and numbered recommendations. End with 1-3 actionable [Buttons] with realistic amounts the user can tap.
- For paid services (web search, flights, crypto prices, translate, image gen, etc.), ALWAYS call the tool directly. Don't ask permission for cheap calls (<$0.50). Never refuse to call a service tool — the user expects you to use them.
- For expensive services (gift cards, postcards), confirm the details first in your response before calling the tool.
- When the user says "email me" or "send me", use their email: ${email}
- Show prices in USD. Show crypto amounts with appropriate precision.
- If you don't know something, say so. Don't make up data.
- Keep tool calls minimal. Don't call tools you don't need.
- When chaining tools, pipe the output of one into the next. Don't ask the user to confirm intermediate steps for cheap calls — just execute.

## Handling "what can you do?"
ONLY if the user asks a general capabilities question like "what can you do?", "help", or "what services do you have?" — and NOT when they have a specific request (e.g. "help me search for flights" is a flight search, not a help request). Give a brief overview organized by category:
- Banking: Save, Send, Swap, Borrow, Invest (via chips below)
- Free: Check balance, rates, portfolio, health factor, transaction history
- Paid services ($0.005-$0.05 each): Web search, news, crypto/stock prices, flights, email, translate, image generation, text-to-speech, code execution, QR codes, URL shortening, currency conversion, security scans
- Premium ($1+): Physical postcards, gift cards (800+ brands)
Keep it to 4-5 lines. End with an example: "Try 'search for flights to Tokyo' or 'what's my balance?'"

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
