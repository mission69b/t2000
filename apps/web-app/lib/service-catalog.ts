/**
 * Consumer-friendly service catalog for the web app.
 * Mapped from the gateway's raw service list into categories
 * the user understands: Gift Cards, AI, Search, etc.
 *
 * No API call needed — static at build time.
 * Pricing: see lib/service-pricing.ts for shared calculation logic.
 */
import { GIFT_CARD_FEE_RATE } from '@/lib/service-pricing';

export interface ServiceItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: ServiceCategory;
  inputType: ServiceInputType;
  fields?: ServiceField[];
  startingPrice: string;
}

export interface ServiceField {
  name: string;
  label: string;
  placeholder: string;
  type: 'text' | 'email' | 'number' | 'select' | 'textarea';
  required: boolean;
  options?: { label: string; value: string }[];
}

export type ServiceCategory =
  | 'gift-cards'
  | 'ai'
  | 'image'
  | 'search'
  | 'communication'
  | 'finance'
  | 'tools';

export type ServiceInputType =
  | 'amount-email'
  | 'prompt'
  | 'query'
  | 'form';

export const CATEGORY_META: Record<ServiceCategory, { label: string; icon: string }> = {
  'gift-cards': { label: 'Gift Cards', icon: '🎁' },
  'ai': { label: 'AI & Chat', icon: '🤖' },
  'image': { label: 'Image Gen', icon: '🖼' },
  'search': { label: 'Search', icon: '🔍' },
  'communication': { label: 'Communication', icon: '📮' },
  'finance': { label: 'Finance', icon: '💹' },
  'tools': { label: 'Tools', icon: '🔧' },
};

export const SERVICE_CATALOG: ServiceItem[] = [
  // Gift Cards
  {
    id: 'reloadly-giftcard',
    name: 'Gift Cards',
    icon: '🎁',
    description: 'Amazon, Uber Eats, Netflix, Spotify, and 800+ brands',
    category: 'gift-cards',
    inputType: 'amount-email',
    fields: [
      { name: 'brand', label: 'Brand', placeholder: 'Search brands...', type: 'text', required: true },
      { name: 'amount', label: 'Amount', placeholder: '$25', type: 'number', required: true },
      { name: 'email', label: 'Send to (email)', placeholder: 'sarah@gmail.com', type: 'email', required: true },
    ],
    startingPrice: `Face value + ${GIFT_CARD_FEE_RATE * 100}%`,
  },

  // AI & Chat
  {
    id: 'openai-chat',
    name: 'Ask AI',
    icon: '🤖',
    description: 'Chat with GPT-4o, Claude, Gemini, and more',
    category: 'ai',
    inputType: 'prompt',
    fields: [
      { name: 'prompt', label: 'Ask anything', placeholder: 'What would you like to know?', type: 'textarea', required: true },
      { name: 'model', label: 'Model', placeholder: 'GPT-4o', type: 'select', required: false, options: [
        { label: 'GPT-4o (OpenAI)', value: 'openai' },
        { label: 'Claude (Anthropic)', value: 'anthropic' },
        { label: 'Gemini (Google)', value: 'gemini' },
        { label: 'Llama (Groq)', value: 'groq' },
        { label: 'DeepSeek', value: 'deepseek' },
        { label: 'Mistral', value: 'mistral' },
        { label: 'Perplexity (with web)', value: 'perplexity' },
      ]},
    ],
    startingPrice: '$0.005',
  },
  {
    id: 'elevenlabs-tts',
    name: 'Text to Speech',
    icon: '🔊',
    description: 'Convert text to natural-sounding audio',
    category: 'ai',
    inputType: 'prompt',
    fields: [
      { name: 'text', label: 'Text', placeholder: 'Enter text to speak...', type: 'textarea', required: true },
    ],
    startingPrice: '$0.05',
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: '🌐',
    description: 'Translate text across 130+ languages',
    category: 'ai',
    inputType: 'form',
    fields: [
      { name: 'text', label: 'Text', placeholder: 'Enter text to translate', type: 'textarea', required: true },
      { name: 'target', label: 'To language', placeholder: 'Spanish', type: 'text', required: true },
    ],
    startingPrice: '$0.005',
  },

  // Image Generation
  {
    id: 'fal-flux',
    name: 'Image Gen',
    icon: '🖼',
    description: 'Generate images from text prompts',
    category: 'image',
    inputType: 'prompt',
    fields: [
      { name: 'prompt', label: 'Describe your image', placeholder: 'A sunset over mountains with a lake', type: 'textarea', required: true },
    ],
    startingPrice: '$0.03',
  },
  {
    id: 'stability-edit',
    name: 'Edit Image',
    icon: '✏️',
    description: 'Search-and-replace editing on images',
    category: 'image',
    inputType: 'form',
    fields: [
      { name: 'image_url', label: 'Image URL', placeholder: 'https://...', type: 'text', required: true },
      { name: 'prompt', label: 'What to change', placeholder: 'Replace the car with a bus', type: 'text', required: true },
    ],
    startingPrice: '$0.03',
  },

  // Search
  {
    id: 'brave-search',
    name: 'Web Search',
    icon: '🔍',
    description: 'Search the web with AI summaries',
    category: 'search',
    inputType: 'query',
    fields: [
      { name: 'q', label: 'Search', placeholder: 'Search anything...', type: 'text', required: true },
    ],
    startingPrice: '$0.005',
  },
  {
    id: 'serpapi-flights',
    name: 'Flight Search',
    icon: '✈️',
    description: 'Search flights, prices, and airlines',
    category: 'search',
    inputType: 'form',
    fields: [
      { name: 'departure', label: 'From', placeholder: 'NYC', type: 'text', required: true },
      { name: 'arrival', label: 'To', placeholder: 'Tokyo', type: 'text', required: true },
      { name: 'date', label: 'Date', placeholder: 'April 12', type: 'text', required: true },
    ],
    startingPrice: '$0.01',
  },
  {
    id: 'newsapi',
    name: 'News',
    icon: '📰',
    description: 'Breaking news from 150,000+ sources',
    category: 'search',
    inputType: 'query',
    fields: [
      { name: 'q', label: 'Topic', placeholder: 'What news are you looking for?', type: 'text', required: true },
    ],
    startingPrice: '$0.005',
  },

  // Communication
  {
    id: 'resend-email',
    name: 'Send Email',
    icon: '📧',
    description: 'Send emails to anyone',
    category: 'communication',
    inputType: 'form',
    fields: [
      { name: 'to', label: 'To', placeholder: 'recipient@email.com', type: 'email', required: true },
      { name: 'subject', label: 'Subject', placeholder: 'Email subject', type: 'text', required: true },
      { name: 'body', label: 'Message', placeholder: 'Type your message...', type: 'textarea', required: true },
    ],
    startingPrice: '$0.005',
  },
  {
    id: 'lob-postcard',
    name: 'Send Postcard',
    icon: '📮',
    description: 'Mail a physical postcard to any address',
    category: 'communication',
    inputType: 'form',
    fields: [
      { name: 'to_name', label: 'Recipient name', placeholder: 'Jane Doe', type: 'text', required: true },
      { name: 'to_address', label: 'Address', placeholder: '123 Main St, City, State, ZIP', type: 'text', required: true },
      { name: 'message', label: 'Message', placeholder: 'Wish you were here!', type: 'textarea', required: true },
    ],
    startingPrice: '$1.00',
  },

  // Finance
  {
    id: 'coingecko-price',
    name: 'Crypto Prices',
    icon: '📈',
    description: 'Live prices for any cryptocurrency',
    category: 'finance',
    inputType: 'query',
    fields: [
      { name: 'ids', label: 'Coin', placeholder: 'bitcoin, ethereum, sui', type: 'text', required: true },
    ],
    startingPrice: '$0.005',
  },
  {
    id: 'alphavantage-quote',
    name: 'Stock Quotes',
    icon: '📊',
    description: 'Real-time stock prices and market data',
    category: 'finance',
    inputType: 'query',
    fields: [
      { name: 'symbol', label: 'Ticker', placeholder: 'AAPL, TSLA, GOOG', type: 'text', required: true },
    ],
    startingPrice: '$0.005',
  },
  {
    id: 'exchangerate-convert',
    name: 'Currency Convert',
    icon: '💱',
    description: 'Convert between 160+ currencies',
    category: 'finance',
    inputType: 'form',
    fields: [
      { name: 'from', label: 'From', placeholder: 'USD', type: 'text', required: true },
      { name: 'to', label: 'To', placeholder: 'EUR', type: 'text', required: true },
      { name: 'amount', label: 'Amount', placeholder: '100', type: 'number', required: true },
    ],
    startingPrice: '$0.005',
  },

  // Tools
  {
    id: 'screenshot',
    name: 'Screenshot',
    icon: '📸',
    description: 'Capture any webpage as an image',
    category: 'tools',
    inputType: 'query',
    fields: [
      { name: 'url', label: 'URL', placeholder: 'https://example.com', type: 'text', required: true },
    ],
    startingPrice: '$0.01',
  },
  {
    id: 'shortio',
    name: 'Shorten URL',
    icon: '🔗',
    description: 'Create short links with click analytics',
    category: 'tools',
    inputType: 'query',
    fields: [
      { name: 'originalURL', label: 'URL', placeholder: 'https://long-url.example.com/...', type: 'text', required: true },
    ],
    startingPrice: '$0.005',
  },
  {
    id: 'qrcode',
    name: 'QR Code',
    icon: '📱',
    description: 'Generate QR codes for any URL or text',
    category: 'tools',
    inputType: 'query',
    fields: [
      { name: 'data', label: 'Content', placeholder: 'URL or text to encode', type: 'text', required: true },
    ],
    startingPrice: '$0.005',
  },
  {
    id: 'e2b-execute',
    name: 'Run Code',
    icon: '💻',
    description: 'Execute code in 70+ languages',
    category: 'tools',
    inputType: 'prompt',
    fields: [
      { name: 'code', label: 'Code', placeholder: 'print("hello world")', type: 'textarea', required: true },
      { name: 'language', label: 'Language', placeholder: 'python', type: 'select', required: true, options: [
        { label: 'Python', value: 'python' },
        { label: 'JavaScript', value: 'javascript' },
        { label: 'TypeScript', value: 'typescript' },
        { label: 'Go', value: 'go' },
        { label: 'Rust', value: 'rust' },
      ]},
    ],
    startingPrice: '$0.005',
  },
  {
    id: 'virustotal',
    name: 'Security Scan',
    icon: '🛡️',
    description: 'Scan URLs and files for threats',
    category: 'tools',
    inputType: 'query',
    fields: [
      { name: 'url', label: 'URL to scan', placeholder: 'https://suspicious-site.com', type: 'text', required: true },
    ],
    startingPrice: '$0.01',
  },
];

export function getServicesByCategory(category: ServiceCategory): ServiceItem[] {
  return SERVICE_CATALOG.filter((s) => s.category === category);
}

export function getServiceById(id: string): ServiceItem | undefined {
  return SERVICE_CATALOG.find((s) => s.id === id);
}

export function getAllCategories(): ServiceCategory[] {
  return Object.keys(CATEGORY_META) as ServiceCategory[];
}
