import { afterEach, describe, expect, it, vi } from 'vitest';
import { mppServicesTool, mppCallTool } from './mpp.js';
import { legacyToolView } from '../__tests__/_helpers/call-tool-body.js';
import type { ToolContext } from '../types.js';

const servicesView = legacyToolView(mppServicesTool, 'mpp_services');
const callView = legacyToolView(mppCallTool, 'mpp_call');

const SAMPLE_CATALOG = [
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
      { method: 'POST', path: '/v1/chat/completions', description: 'Chat', price: '0.02' },
    ],
  },
  {
    id: 'serper',
    name: 'Serper',
    serviceUrl: 'https://mpp.t2000.ai/serper',
    description: 'Google search results.',
    chain: 'sui',
    currency: 'USDC',
    categories: ['data', 'search'],
    logo: '/logos/serper.svg',
    endpoints: [{ method: 'POST', path: '/search', description: 'Search', price: '0.01' }],
  },
];

function mockFetchOk(payload: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mpp_services — policy', () => {
  it('is a read-only, auto-tier, non-cacheable tool', () => {
    expect(servicesView.isReadOnly).toBe(true);
    expect(servicesView.permissionLevel).toBe('auto');
    expect(servicesView.cacheable).toBe(false);
  });
});

describe('mpp_services — catalog fetch', () => {
  it('fetches the live catalog and strips the UI-only logo field', async () => {
    const fetchMock = mockFetchOk(SAMPLE_CATALOG);
    vi.stubGlobal('fetch', fetchMock);

    const res = await servicesView.call({}, {} as ToolContext);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://mpp.t2000.ai/api/services', expect.anything());
    expect(res.data.services).toHaveLength(2);
    expect(res.data.services[0]).not.toHaveProperty('logo');
    expect(res.data.services[0].name).toBe('OpenAI');
    expect(res.displayText).toContain('2 Services available');
  });

  it('uses MPP_GATEWAY_URL from ctx.env (trailing slash trimmed)', async () => {
    const fetchMock = mockFetchOk(SAMPLE_CATALOG);
    vi.stubGlobal('fetch', fetchMock);

    await servicesView.call({}, { env: { MPP_GATEWAY_URL: 'https://gw.example.com/' } } as ToolContext);

    expect(fetchMock).toHaveBeenCalledWith('https://gw.example.com/api/services', expect.anything());
  });

  it('filters by category', async () => {
    vi.stubGlobal('fetch', mockFetchOk(SAMPLE_CATALOG));

    const res = await servicesView.call({ category: 'search' }, {} as ToolContext);

    expect(res.data.services).toHaveLength(1);
    expect(res.data.services[0].id).toBe('serper');
  });

  it('reports an empty catalog gracefully', async () => {
    vi.stubGlobal('fetch', mockFetchOk([]));

    const res = await servicesView.call({ category: 'nope' }, {} as ToolContext);

    expect(res.data.services).toHaveLength(0);
    expect(res.displayText).toContain('No Services found');
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch,
    );

    await expect(servicesView.call({}, {} as ToolContext)).rejects.toThrow(/catalog fetch failed \(503/);
  });
});

describe('mpp_call — policy + flags', () => {
  it('is a confirm-tier write tool flagged mutating', () => {
    expect(callView.isReadOnly).toBe(false);
    expect(callView.permissionLevel).toBe('confirm');
    expect(callView.flags.mutating).toBe(true);
  });
});

describe('mpp_call — preflight', () => {
  it('rejects a non-https url', () => {
    const r = callView.preflight!({ url: 'http://mpp.t2000.ai/openai', body: null, maxPriceUsd: 0.02 });
    expect(r.valid).toBe(false);
  });
  it('rejects non-positive maxPriceUsd', () => {
    const r = callView.preflight!({ url: 'https://mpp.t2000.ai/x', body: null, maxPriceUsd: 0 });
    expect(r.valid).toBe(false);
  });
  it('rejects maxPriceUsd above the single-call ceiling', () => {
    const r = callView.preflight!({ url: 'https://mpp.t2000.ai/x', body: null, maxPriceUsd: 25 });
    expect(r.valid).toBe(false);
    if (!r.valid && 'error' in r) expect(r.error).toMatch(/ceiling/);
  });
  it('accepts a valid https call within the ceiling', () => {
    const r = callView.preflight!({ url: 'https://mpp.t2000.ai/openai/v1/chat/completions', body: '{}', maxPriceUsd: 0.02 });
    expect(r.valid).toBe(true);
  });
});

describe('mpp_call — call body (agent runtime)', () => {
  it('maps input to agent.pay and shapes a paid result', async () => {
    const pay = vi.fn(async () => ({
      status: 200,
      body: { ok: true },
      paid: true,
      cost: 0.02,
      gasCostSui: 0,
    }));
    const ctx = { agent: { pay } } as unknown as ToolContext;

    const res = await callView.call(
      { url: 'https://mpp.t2000.ai/openai/v1/chat/completions', method: 'POST', body: '{"q":1}', maxPriceUsd: 0.05 },
      ctx,
    );

    expect(pay).toHaveBeenCalledWith({
      url: 'https://mpp.t2000.ai/openai/v1/chat/completions',
      method: 'POST',
      body: '{"q":1}',
      maxPrice: 0.05,
    });
    expect(res.data.status).toBe(200);
    expect(res.data.paid).toBe(true);
    expect(res.data.cost).toBe(0.02);
    expect(res.displayText).toContain('paid $0.02');
  });

  it('defaults method to POST and maps null body to undefined', async () => {
    const pay = vi.fn(async () => ({ status: 200, body: {}, paid: false }));
    const ctx = { agent: { pay } } as unknown as ToolContext;

    await callView.call({ url: 'https://mpp.t2000.ai/x', body: null, maxPriceUsd: 0.01 }, ctx);

    expect(pay).toHaveBeenCalledWith({
      url: 'https://mpp.t2000.ai/x',
      method: 'POST',
      body: undefined,
      maxPrice: 0.01,
    });
  });
});
