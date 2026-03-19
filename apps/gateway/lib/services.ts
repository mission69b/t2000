export interface Endpoint {
  method: string;
  path: string;
  description: string;
  price: string;
}

export interface Service {
  id: string;
  name: string;
  serviceUrl: string;
  description: string;
  chain: string;
  currency: string;
  categories: string[];
  endpoints: Endpoint[];
}

const BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://mpp.t2000.ai';

export const services: Service[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    serviceUrl: `${BASE_URL}/openai`,
    description: 'Chat, embeddings, images, and audio.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai', 'media'],
    endpoints: [
      { method: 'POST', path: '/v1/chat/completions', description: 'Chat completions (GPT-4o, o1, etc.)', price: '0.01' },
      { method: 'POST', path: '/v1/embeddings', description: 'Create embeddings', price: '0.001' },
      { method: 'POST', path: '/v1/images/generations', description: 'Generate images with DALL-E', price: '0.05' },
      { method: 'POST', path: '/v1/audio/transcriptions', description: 'Transcribe audio with Whisper', price: '0.01' },
      { method: 'POST', path: '/v1/audio/speech', description: 'Text-to-speech', price: '0.02' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    serviceUrl: `${BASE_URL}/anthropic`,
    description: 'Claude models — Sonnet, Opus, Haiku.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai'],
    endpoints: [
      { method: 'POST', path: '/v1/messages', description: 'Chat completions (Sonnet, Opus, Haiku)', price: '0.01' },
    ],
  },
  {
    id: 'fal',
    name: 'fal.ai',
    serviceUrl: `${BASE_URL}/fal`,
    description: 'Image generation with Flux models.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai', 'media'],
    endpoints: [
      { method: 'POST', path: '/fal-ai/flux/dev', description: 'Flux Dev image generation', price: '0.03' },
      { method: 'POST', path: '/fal-ai/flux-pro', description: 'Flux Pro image generation', price: '0.05' },
      { method: 'POST', path: '/fal-ai/flux-realism', description: 'Flux Realism (photorealistic)', price: '0.03' },
      { method: 'POST', path: '/fal-ai/recraft-20b', description: 'Recraft 20B image generation', price: '0.03' },
      { method: 'POST', path: '/fal-ai/whisper', description: 'Speech-to-text transcription', price: '0.01' },
    ],
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    serviceUrl: `${BASE_URL}/firecrawl`,
    description: 'Scrape and crawl any website.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['web', 'data'],
    endpoints: [
      { method: 'POST', path: '/v1/scrape', description: 'Scrape a URL to structured data', price: '0.01' },
      { method: 'POST', path: '/v1/crawl', description: 'Crawl a website', price: '0.05' },
      { method: 'POST', path: '/v1/map', description: 'Discover URLs on a site', price: '0.01' },
      { method: 'POST', path: '/v1/extract', description: 'Extract structured data with LLM', price: '0.02' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    serviceUrl: `${BASE_URL}/gemini`,
    description: 'Gemini chat, reasoning, and embeddings.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai'],
    endpoints: [
      { method: 'POST', path: '/v1beta/models/gemini-2.0-flash', description: 'Gemini 2.0 Flash (fast, multimodal)', price: '0.005' },
      { method: 'POST', path: '/v1beta/models/gemini-2.5-pro', description: 'Gemini 2.5 Pro (reasoning)', price: '0.02' },
      { method: 'POST', path: '/v1beta/models/embedding-001', description: 'Text embeddings', price: '0.001' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    serviceUrl: `${BASE_URL}/groq`,
    description: 'Ultra-fast LLM inference — Llama, Mixtral, Gemma.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai'],
    endpoints: [
      { method: 'POST', path: '/v1/chat/completions', description: 'Chat completions (Llama 3, Mixtral, Gemma)', price: '0.005' },
      { method: 'POST', path: '/v1/audio/transcriptions', description: 'Audio transcription (Whisper)', price: '0.005' },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    serviceUrl: `${BASE_URL}/perplexity`,
    description: 'AI search with real-time web citations.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai', 'search'],
    endpoints: [
      { method: 'POST', path: '/v1/chat/completions', description: 'Sonar search (web-grounded answers)', price: '0.01' },
    ],
  },
  {
    id: 'brave',
    name: 'Brave Search',
    serviceUrl: `${BASE_URL}/brave`,
    description: 'Web search and AI summarization.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['search'],
    endpoints: [
      { method: 'POST', path: '/v1/web/search', description: 'Web search results', price: '0.005' },
      { method: 'POST', path: '/v1/images/search', description: 'Image search', price: '0.005' },
      { method: 'POST', path: '/v1/news/search', description: 'News search', price: '0.005' },
      { method: 'POST', path: '/v1/videos/search', description: 'Video search', price: '0.005' },
      { method: 'POST', path: '/v1/summarizer/search', description: 'AI-summarized search', price: '0.01' },
    ],
  },
  {
    id: 'resend',
    name: 'Resend',
    serviceUrl: `${BASE_URL}/resend`,
    description: 'Transactional email delivery.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['communication'],
    endpoints: [
      { method: 'POST', path: '/v1/emails', description: 'Send an email', price: '0.005' },
      { method: 'POST', path: '/v1/emails/batch', description: 'Send batch emails (up to 100)', price: '0.01' },
    ],
  },
];
