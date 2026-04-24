import { describe, it, expect, vi, beforeEach } from 'vitest';

import { defillamaYieldPoolsTool } from '../tools/defillama.js';
import { transactionHistoryTool } from '../tools/history.js';
import { mppServicesTool } from '../tools/mpp-services.js';

const baseCtx = {
  walletAddress: '0xtest',
  suiRpcUrl: 'https://stub',
} as Parameters<typeof defillamaYieldPoolsTool.call>[1];

describe('[v1.4 ACI] defillama_yield_pools — refinement when no chain/project', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { pool: 'a', chain: 'Sui', project: 'navi', symbol: 'USDC', tvlUsd: 5e6, apy: 8 },
            { pool: 'b', chain: 'Sui', project: 'cetus', symbol: 'SUI/USDC', tvlUsd: 2e6, apy: 12 },
            { pool: 'c', chain: 'Ethereum', project: 'aave', symbol: 'USDC', tvlUsd: 1e8, apy: 5 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as typeof fetch;
  });

  it('returns _refine + chain summary when called with no filters', async () => {
    const res = await defillamaYieldPoolsTool.call({}, baseCtx);
    const data = res.data as {
      _refine: { reason: string; availableChains: { chain: string }[] };
    };
    expect(data._refine).toBeDefined();
    expect(data._refine.reason).toMatch(/chain/i);
    expect(data._refine.availableChains.map((c) => c.chain)).toContain('Sui');
  });

  it('returns actual pools when chain is supplied', async () => {
    const res = await defillamaYieldPoolsTool.call({ chain: 'Sui', minTvl: 0 }, baseCtx);
    expect(Array.isArray(res.data)).toBe(true);
    const arr = res.data as Array<{ chain: string }>;
    expect(arr.length).toBeGreaterThan(0);
    for (const p of arr) expect(p.chain).toBe('Sui');
  });
});

describe('[v1.4 ACI] transaction_history — action filter + 30-day default', () => {
  beforeEach(() => {
    const now = Date.now();
    const recent = (offsetDays: number, action: string) => ({
      digest: `0x${action}${offsetDays}`,
      timestampMs: String(now - offsetDays * 86_400_000),
      effects: { gasUsed: { computationCost: '0', storageCost: '0', storageRebate: '0' } },
      transaction: {
        data: {
          transaction: {
            commands:
              action === 'send'
                ? [{ TransferObjects: {} }]
                : [{ MoveCall: { package: 'p', module: 'navi', function: 'borrow' } }],
          },
        },
      },
      balanceChanges: [],
    });

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            data: [
              recent(1, 'send'),
              recent(5, 'send'),
              recent(10, 'lending'),
              recent(45, 'send'),    // outside 30-day window
            ],
            nextCursor: null,
            hasNextPage: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as typeof fetch;
  });

  it('drops transactions older than 30 days when no date is supplied', async () => {
    const res = await transactionHistoryTool.call({ limit: 10 }, baseCtx);
    const data = res.data as { transactions: Array<{ digest: string }>; lookbackDays: number };
    expect(data.lookbackDays).toBe(30);
    expect(data.transactions.find((t) => t.digest.endsWith('45'))).toBeUndefined();
  });

  it('filters by action when supplied', async () => {
    const res = await transactionHistoryTool.call({ limit: 10, action: 'lending' }, baseCtx);
    const data = res.data as { transactions: Array<{ action: string }>; action: string };
    expect(data.action).toBe('lending');
    for (const t of data.transactions) expect(t.action).toBe('lending');
  });
});

describe('[v1.4 ACI] mpp_services — category summary + filter', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: 'wx', name: 'Weather', serviceUrl: 'x', description: '', categories: ['weather'],
            endpoints: [{ method: 'GET', path: '/now', description: '', price: '0.01' }],
          },
          {
            id: 'tr', name: 'Translate', serviceUrl: 'x', description: '', categories: ['language'],
            endpoints: [{ method: 'POST', path: '/translate', description: '', price: '0.02' }],
          },
          {
            id: 'wx2', name: 'Weather Pro', serviceUrl: 'x', description: '', categories: ['weather'],
            endpoints: [{ method: 'GET', path: '/forecast', description: '', price: '0.03' }],
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as typeof fetch;
  });

  // [v0.46.7] Default behavior changed: no-args now returns the FULL catalog
  // as a renderable card, not a `_refine` payload. This kills the "DISCOVER
  // SERVICES called 15 times in a turn" loop and the "Available Services /
  // 0 total" empty-card regression where the model called with a category
  // guess that matched nothing.
  it('returns the full catalog as a card when no filters supplied (v0.46.7 default)', async () => {
    const res = await mppServicesTool.call({}, baseCtx);
    const data = res.data as {
      services: { id: string }[];
      total: number;
      mode: string;
      _refine?: unknown;
    };
    expect(data._refine).toBeUndefined();
    expect(data.mode).toBe('full');
    expect(data.total).toBe(3);
    expect(data.services.map((s) => s.id).sort()).toEqual(['tr', 'wx', 'wx2']);
  });

  it('returns the category summary only when mode:"summary" is explicitly requested', async () => {
    const res = await mppServicesTool.call({ mode: 'summary' }, baseCtx);
    const data = res.data as {
      _refine: { reason: string };
      categories: { category: string; services: number }[];
      totalServices: number;
    };
    expect(data._refine).toBeDefined();
    const weather = data.categories.find((c) => c.category === 'weather');
    expect(weather?.services).toBe(2);
    expect(data.totalServices).toBe(3);
  });

  it('filters by category when supplied', async () => {
    const res = await mppServicesTool.call({ category: 'weather' }, baseCtx);
    const data = res.data as { services: { id: string }[]; total: number };
    expect(data.total).toBe(2);
    expect(data.services.map((s) => s.id).sort()).toEqual(['wx', 'wx2']);
  });
});
