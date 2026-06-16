import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchServiceCatalog, deriveCategoryTools, type CatalogService } from './service-catalog.js';

const SERVICES: CatalogService[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    serviceUrl: 'https://mpp.t2000.ai/openai',
    categories: ['ai', 'media'],
    endpoints: [
      { method: 'POST', path: '/v1/chat/completions', price: '0.02' },
      { method: 'POST', path: '/v1/images/generations', price: '0.10' },
    ],
  },
  {
    id: 'brave',
    name: 'Brave',
    serviceUrl: 'https://mpp.t2000.ai/brave',
    categories: ['search'],
    endpoints: [{ method: 'POST', path: '/v1/web/search', price: '0.02' }],
  },
];

describe('deriveCategoryTools (2.4)', () => {
  it('produces one tool per category, alphabetical, with t2000_ prefix', () => {
    const specs = deriveCategoryTools(SERVICES);
    expect(specs.map((s) => s.toolName)).toEqual(['t2000_ai', 't2000_media', 't2000_search']);
  });

  it('counts endpoints per category and builds METHOD url ($price) examples', () => {
    const ai = deriveCategoryTools(SERVICES).find((s) => s.category === 'ai')!;
    expect(ai.endpointCount).toBe(2);
    expect(ai.examples[0]).toBe('POST https://mpp.t2000.ai/openai/v1/chat/completions ($0.02)');
  });

  it('caps examples at maxExamples', () => {
    const ai = deriveCategoryTools(SERVICES, 1).find((s) => s.category === 'ai')!;
    expect(ai.examples).toHaveLength(1);
  });

  it('skips categories that are not a clean tool-name token', () => {
    const specs = deriveCategoryTools([
      { id: 'x', name: 'X', serviceUrl: 'https://mpp.t2000.ai/x', categories: ['ai', 'web 3'], endpoints: [{ method: 'POST', path: '/p' }] },
    ]);
    expect(specs.map((s) => s.category)).toEqual(['ai']);
  });

  it('returns [] for an empty catalog', () => {
    expect(deriveCategoryTools([])).toEqual([]);
  });
});

describe('fetchServiceCatalog (2.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.T2000_MCP_DISABLE_CATEGORY_TOOLS;
  });

  it('returns null (no fetch) when category tools are disabled', async () => {
    process.env.T2000_MCP_DISABLE_CATEGORY_TOOLS = '1';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchServiceCatalog()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the array on a 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(SERVICES), { status: 200 })));
    expect(await fetchServiceCatalog()).toHaveLength(2);
  });

  it('returns null on a non-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await fetchServiceCatalog()).toBeNull();
  });

  it('returns null when the body is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ oops: true }), { status: 200 })));
    expect(await fetchServiceCatalog()).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchServiceCatalog()).toBeNull();
  });
});
