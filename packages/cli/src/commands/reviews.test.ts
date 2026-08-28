// S.1227 — `t2 reviews`: the CLI read half of on-chain reputation
// (symmetric to Connect t2000_reviews / GET /v1/reviews). Tests drive the
// registered command through commander with global fetch stubbed; errors
// route through handleError → process.exit(1), stubbed to a throw.

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatHistogram, registerReviews } from './reviews.js';

const SELLER = `0x${'a'.repeat(64)}`;

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  registerReviews(program);
  return program;
}

function stubFetch(handler: (url: string) => unknown) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(String(url));
      const body = handler(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => body,
      };
    }),
  );
  return urls;
}

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('t2 reviews — URL construction', () => {
  it('seller mode: resolves the ref then hits ?seller=<address>', async () => {
    const urls = stubFetch((url) =>
      url.includes('/agents/resolve')
        ? { address: SELLER, numericId: 16, name: 'funkii@audric' }
        : { seller: SELLER, score: 5, count: 1, histogram: [0, 0, 0, 0, 1], reviews: [] },
    );
    await makeProgram().parseAsync(['node', 't2', 'reviews', '#16']);
    expect(urls[0]).toContain('/agents/resolve?q=%2316');
    expect(urls[1]).toContain(`/reviews?seller=${encodeURIComponent(SELLER)}`);
  });

  it('buyer mode: --buyer-agent hits ?buyerAgent=<id> (no resolve hop)', async () => {
    const urls = stubFetch(() => ({ buyerAgent: 16, count: 9, ratings: [] }));
    await makeProgram().parseAsync([
      'node',
      't2',
      'reviews',
      '--buyer-agent',
      '16',
    ]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/reviews?buyerAgent=16');
  });
});

describe('t2 reviews — refusals', () => {
  it('seller ref + --buyer-agent together refuse (mutual exclusion)', async () => {
    stubFetch(() => ({}));
    await expect(
      makeProgram().parseAsync([
        'node',
        't2',
        'reviews',
        '#16',
        '--buyer-agent',
        '16',
      ]),
    ).rejects.toThrow(/exit 1/);
  });

  it('wrong flag spellings refuse with the positional hint, never silently ignore', async () => {
    stubFetch(() => ({}));
    for (const flag of ['--agent', '--seller', '--address']) {
      await expect(
        makeProgram().parseAsync(['node', 't2', 'reviews', flag, '#16']),
      ).rejects.toThrow(/exit 1/);
    }
  });

  it('no ref at all refuses — the CLI has no Passport context', async () => {
    stubFetch(() => ({}));
    await expect(
      makeProgram().parseAsync(['node', 't2', 'reviews']),
    ).rejects.toThrow(/exit 1/);
  });

  it('--buyer-agent requires a numeric id', async () => {
    stubFetch(() => ({}));
    await expect(
      makeProgram().parseAsync([
        'node',
        't2',
        'reviews',
        '--buyer-agent',
        'funkii',
      ]),
    ).rejects.toThrow(/exit 1/);
  });
});

describe('formatHistogram', () => {
  it('renders non-zero buckets highest-first', () => {
    expect(formatHistogram([0, 1, 2, 0, 9])).toBe('5★ ×9 · 3★ ×2 · 2★ ×1');
    expect(formatHistogram([0, 0, 0, 0, 0])).toBe('');
    expect(formatHistogram(null)).toBe('');
    expect(formatHistogram([1, 2])).toBe('');
  });
});
