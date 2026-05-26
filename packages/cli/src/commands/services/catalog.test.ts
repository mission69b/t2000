// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 4 — 2026-05-26]
// Tests for the shared MPP-catalog fetcher + filter + URL match.

import { describe, it, expect } from 'vitest';
import {
  fetchCatalog,
  filterCatalog,
  findByUrl,
  getGatewayUrl,
  type CatalogService,
} from './catalog.js';

const FIXTURE: CatalogService[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    serviceUrl: 'https://mpp.t2000.ai/openai',
    description: 'Chat, embeddings, images, and audio.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai', 'media'],
    logo: '/logos/openai.svg',
    endpoints: [
      { method: 'POST', path: '/v1/chat/completions', description: 'Chat completions', price: '0.01' },
      { method: 'POST', path: '/v1/images/generations', description: 'Image generation', price: '0.05' },
    ],
  },
  {
    id: 'fal',
    name: 'fal.ai',
    serviceUrl: 'https://mpp.t2000.ai/fal',
    description: 'Image and audio generation.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['ai', 'media'],
    logo: '/logos/fal.svg',
    endpoints: [
      { method: 'POST', path: '/fal-ai/flux/dev', description: 'Flux Dev image gen', price: '0.03' },
    ],
  },
  {
    id: 'openweather',
    name: 'OpenWeather',
    serviceUrl: 'https://mpp.t2000.ai/openweather',
    description: 'Current weather + forecasts.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['data'],
    logo: '/logos/openweather.svg',
    endpoints: [
      { method: 'GET', path: '/v1/weather', description: 'Current weather lookup', price: '0.005' },
    ],
  },
];

describe('getGatewayUrl', () => {
  it('uses the explicit override first', () => {
    expect(getGatewayUrl('https://local.example')).toBe('https://local.example');
  });

  it('strips trailing slash', () => {
    expect(getGatewayUrl('https://local.example/')).toBe('https://local.example');
  });

  it('falls back to the public gateway when nothing is set', () => {
    const prior = process.env.T2000_GATEWAY_URL;
    delete process.env.T2000_GATEWAY_URL;
    try {
      expect(getGatewayUrl()).toBe('https://mpp.t2000.ai');
    } finally {
      if (prior !== undefined) process.env.T2000_GATEWAY_URL = prior;
    }
  });

  it('reads T2000_GATEWAY_URL when no override is passed', () => {
    const prior = process.env.T2000_GATEWAY_URL;
    process.env.T2000_GATEWAY_URL = 'http://localhost:3000';
    try {
      expect(getGatewayUrl()).toBe('http://localhost:3000');
    } finally {
      if (prior !== undefined) {
        process.env.T2000_GATEWAY_URL = prior;
      } else {
        delete process.env.T2000_GATEWAY_URL;
      }
    }
  });
});

describe('filterCatalog', () => {
  it('returns all services for an empty query', () => {
    expect(filterCatalog(FIXTURE, '')).toHaveLength(3);
  });

  it('matches on name (case-insensitive)', () => {
    expect(filterCatalog(FIXTURE, 'openai').map((s) => s.id)).toEqual(['openai']);
    expect(filterCatalog(FIXTURE, 'OPENAI').map((s) => s.id)).toEqual(['openai']);
  });

  it('matches on description', () => {
    expect(filterCatalog(FIXTURE, 'forecasts').map((s) => s.id)).toEqual(['openweather']);
  });

  it('matches on category', () => {
    const ai = filterCatalog(FIXTURE, 'ai').map((s) => s.id).sort();
    expect(ai).toEqual(['fal', 'openai']);
  });

  it('matches on endpoint description', () => {
    expect(filterCatalog(FIXTURE, 'image').map((s) => s.id).sort()).toEqual(['fal', 'openai']);
  });

  it('matches on endpoint path', () => {
    expect(filterCatalog(FIXTURE, 'chat/completions').map((s) => s.id)).toEqual(['openai']);
  });

  it('returns empty array on no match', () => {
    expect(filterCatalog(FIXTURE, 'cobol-quotes')).toEqual([]);
  });
});

describe('findByUrl', () => {
  it('matches a service base URL exactly', () => {
    const result = findByUrl(FIXTURE, 'https://mpp.t2000.ai/openai');
    expect(result?.service.id).toBe('openai');
    expect(result?.endpoint).toBeUndefined();
  });

  it('matches a base URL with trailing slash', () => {
    const result = findByUrl(FIXTURE, 'https://mpp.t2000.ai/openai/');
    expect(result?.service.id).toBe('openai');
  });

  it('matches a full endpoint URL', () => {
    const result = findByUrl(FIXTURE, 'https://mpp.t2000.ai/openai/v1/chat/completions');
    expect(result?.service.id).toBe('openai');
    expect(result?.endpoint?.path).toBe('/v1/chat/completions');
  });

  it('returns the service (no endpoint) when a non-listed path is given', () => {
    const result = findByUrl(FIXTURE, 'https://mpp.t2000.ai/openai/v1/some-future-endpoint');
    expect(result?.service.id).toBe('openai');
    expect(result?.endpoint).toBeUndefined();
  });

  it('returns null for an unknown service URL', () => {
    expect(findByUrl(FIXTURE, 'https://other.example/foo')).toBeNull();
  });
});

describe('fetchCatalog', () => {
  it('GETs /api/services and returns the array', async () => {
    let calledUrl: string | undefined;
    const fakeFetch: typeof fetch = async (input) => {
      calledUrl = String(input);
      return new Response(JSON.stringify(FIXTURE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await fetchCatalog({
      gatewayUrl: 'http://local.test',
      fetchImpl: fakeFetch,
    });
    expect(calledUrl).toBe('http://local.test/api/services');
    expect(result).toHaveLength(3);
  });

  it('throws when the response is not ok', async () => {
    const fakeFetch: typeof fetch = async () => new Response('', { status: 500, statusText: 'oops' });
    await expect(
      fetchCatalog({ gatewayUrl: 'http://local.test', fetchImpl: fakeFetch }),
    ).rejects.toThrow(/Service catalog fetch failed: 500/);
  });

  it('throws when the response is not an array', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ services: [] }), { status: 200 });
    await expect(
      fetchCatalog({ gatewayUrl: 'http://local.test', fetchImpl: fakeFetch }),
    ).rejects.toThrow(/not an array/);
  });
});
