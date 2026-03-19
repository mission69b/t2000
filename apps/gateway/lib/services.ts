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
    description: 'Chat completions, embeddings, image generation, and audio via Sui USDC.',
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
    description: 'Claude chat completions (Sonnet, Opus, Haiku) via Sui USDC.',
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
    description: 'Image and video generation with Flux models via Sui USDC.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai', 'media'],
    endpoints: [
      { method: 'POST', path: '/fal-ai/flux/dev', description: 'Flux Dev image generation', price: '0.03' },
      { method: 'POST', path: '/fal-ai/flux-pro', description: 'Flux Pro image generation', price: '0.05' },
    ],
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    serviceUrl: `${BASE_URL}/firecrawl`,
    description: 'Web scraping and crawling for AI agents via Sui USDC.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['web', 'data'],
    endpoints: [
      { method: 'POST', path: '/v1/scrape', description: 'Scrape a URL to structured data', price: '0.01' },
      { method: 'POST', path: '/v1/crawl', description: 'Crawl a website', price: '0.05' },
    ],
  },
];
