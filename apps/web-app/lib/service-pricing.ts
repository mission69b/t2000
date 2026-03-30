/**
 * Shared service pricing logic.
 *
 * Single source of truth for price calculations displayed to users.
 * The gateway's 402 challenge is the actual charge — these are client-side
 * estimates that must stay in sync with gateway pricing.
 */

export function getDisplayPrice(serviceId: string): string {
  const STATIC_PRICES: Record<string, string> = {
    'openai-chat': '0.005',
    'elevenlabs-tts': '0.05',
    'translate': '0.005',
    'fal-flux': '0.03',
    'stability-edit': '0.03',
    'brave-search': '0.005',
    'serpapi-flights': '0.01',
    'newsapi': '0.005',
    'resend-email': '0.005',
    'lob-postcard': '1.00',
    'coingecko-price': '0.005',
    'alphavantage-quote': '0.005',
    'exchangerate-convert': '0.005',
    'screenshot': '0.01',
    'shortio': '0.005',
    'qrcode': '0.005',
    'e2b-execute': '0.005',
    'virustotal': '0.01',
  };

  return STATIC_PRICES[serviceId] ?? '0.01';
}
