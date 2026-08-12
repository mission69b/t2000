import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bucketSellerJob,
  deliverPreflightError,
  fetchSellerJobs,
  type IndexedJob,
  parseDuration,
  resolveHireSpecUpload,
  resolveSpecUpload,
  reviewClosesMs,
  summarizeSellerInbox,
} from './job.js';

describe('parseDuration', () => {
  it('parses minutes, hours, days', () => {
    expect(parseDuration('30m')).toBe(30 * 60_000);
    expect(parseDuration('24h')).toBe(24 * 3_600_000);
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
  });

  it('defaults bare numbers to minutes', () => {
    expect(parseDuration('45')).toBe(45 * 60_000);
  });

  it('rejects junk and non-positive durations', () => {
    expect(() => parseDuration('soon')).toThrow(/Invalid duration/);
    expect(() => parseDuration('0h')).toThrow(/positive/);
    expect(() => parseDuration('-2h')).toThrow(/Invalid duration/);
  });
});

describe('resolveSpecUpload (SPEC_ACP_JOB_SPEC_V1 §4.2 — upload by default)', () => {
  const BASE = 'https://api.example.test/v1';
  const HASH64 = `0x${'a'.repeat(64)}`;

  function mockPutSpec(hash = 'b'.repeat(64)) {
    const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ hash }) }));
    vi.stubGlobal('fetch', fn);
    return { fn, hash };
  }
  afterEach(() => vi.unstubAllGlobals());

  it('passes a bare 0x… sha256 through WITHOUT uploading (confidential path)', async () => {
    const { fn } = mockPutSpec();
    const result = await resolveSpecUpload(BASE, HASH64);
    expect(result).toEqual({ hash: HASH64, uploaded: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it('uploads file contents and pins the store hash', async () => {
    const { fn, hash } = mockPutSpec();
    const dir = await mkdtemp(join(tmpdir(), 't2-job-'));
    const file = join(dir, 'delivery.md');
    await writeFile(file, '# The report\n\nDone.');
    const result = await resolveSpecUpload(BASE, file);
    expect(result).toEqual({ hash: `0x${hash}`, uploaded: true });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('uploads literal text when the arg is not a file', async () => {
    const { hash } = mockPutSpec();
    const result = await resolveSpecUpload(BASE, 'inline delivery text');
    expect(result).toEqual({ hash: `0x${hash}`, uploaded: true });
  });

  it('rejects oversize content BEFORE any network call (16 KiB cap)', async () => {
    const { fn } = mockPutSpec();
    const dir = await mkdtemp(join(tmpdir(), 't2-job-'));
    const file = join(dir, 'big.md');
    await writeFile(file, 'x'.repeat(17 * 1024));
    await expect(resolveSpecUpload(BASE, file)).rejects.toThrow(/16 KiB/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects non-UTF-8 (binary) content with the --hash-only pointer', async () => {
    const { fn } = mockPutSpec();
    const dir = await mkdtemp(join(tmpdir(), 't2-job-'));
    const file = join(dir, 'artifact.bin');
    await writeFile(file, Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28]));
    await expect(resolveSpecUpload(BASE, file)).rejects.toThrow(/not UTF-8/);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('fetchSellerJobs (the provider inbox read)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const row = {
    jobId: '0xjob',
    buyer: '0xbuyer',
    seller: '0xseller',
    amountUsdc: 5,
    state: 'funded',
    deliverByMs: 1_784_431_064_945,
    reviewWindowMs: 3_600_000,
    deliveryHash: null,
    createdAtMs: 1_784_344_665_784,
    updatedAtMs: 1_784_344_665_784,
  };

  it('queries /jobs by seller and returns the rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 1, jobs: [row] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const jobs = await fetchSellerJobs('https://api.example/v1', '0xseller');
    expect(jobs).toEqual([row]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/v1/jobs?seller=0xseller&limit=100',
      expect.anything(),
    );
  });

  it('surfaces API errors instead of returning an empty inbox', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Provide ?seller= and/or ?buyer=.' } }),
      }),
    );
    await expect(fetchSellerJobs('https://api.example/v1', '')).rejects.toThrow(
      /Provide \?seller=/,
    );
  });
});

describe('resolveHireSpecUpload (S.978 — CLI writes the t2-acp-custom@1 envelope)', () => {
  const BASE = 'https://api.example.test/v1';
  const HASH64 = `0x${'a'.repeat(64)}`;

  function mockPutSpec(hash = 'b'.repeat(64)) {
    const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ hash }) }));
    vi.stubGlobal('fetch', fn);
    return { fn, hash };
  }
  afterEach(() => vi.unstubAllGlobals());

  function uploadedBody(fn: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const init = (fn.mock.calls[0] as unknown[])?.[1] as
      | { body?: string }
      | undefined;
    const outer = JSON.parse(init?.body ?? '{}') as { content?: string };
    return JSON.parse(outer.content ?? '{}') as Record<string, unknown>;
  }

  it('wraps an inline brief: envelope type, derived title, lossless brief', async () => {
    const { fn } = mockPutSpec();
    await resolveHireSpecUpload(BASE, 'Write one short OK note.\nMore detail.', undefined);
    const body = uploadedBody(fn);
    expect(body.type).toBe('t2-acp-custom@1');
    expect(body.title).toBe('Write one short OK note.');
    expect(body.brief).toBe('Write one short OK note.\nMore detail.');
    expect(typeof body.createdAtMs).toBe('number');
  });

  it('--title wins; Title: prefix in a file strips for the title only', async () => {
    const { fn } = mockPutSpec();
    await resolveHireSpecUpload(BASE, 'Long brief body.', 'My title');
    expect(uploadedBody(fn).title).toBe('My title');

    vi.unstubAllGlobals();
    const second = mockPutSpec();
    const dir = await mkdtemp(join(tmpdir(), 't2-job-'));
    const file = join(dir, 'brief.md');
    await writeFile(file, 'Title: smoke CLI envelope\nWrite one short OK note.');
    await resolveHireSpecUpload(BASE, file, undefined);
    const body = uploadedBody(second.fn);
    expect(body.title).toBe('smoke CLI envelope');
    expect(String(body.brief).startsWith('Title: smoke CLI envelope')).toBe(true);
  });

  it('idempotent: an input that already IS the envelope uploads as-is, never nested', async () => {
    const { fn } = mockPutSpec();
    const envelope = JSON.stringify({
      type: 't2-acp-custom@1',
      title: 'Pre-wrapped',
      brief: 'Already an envelope.',
      createdAtMs: 1,
    });
    await resolveHireSpecUpload(BASE, envelope, undefined);
    const body = uploadedBody(fn);
    expect(body.title).toBe('Pre-wrapped');
    expect(body.createdAtMs).toBe(1);
    expect(typeof body.brief).toBe('string'); // not a nested envelope string
  });

  it('bare 0x… sha256 stays confidential — no upload, no wrap', async () => {
    const { fn } = mockPutSpec();
    const result = await resolveHireSpecUpload(BASE, HASH64, undefined);
    expect(result).toEqual({ hash: HASH64, uploaded: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it('deliver path contrast: resolveSpecUpload still uploads RAW text, no envelope', async () => {
    const { fn } = mockPutSpec();
    await resolveSpecUpload(BASE, 'plain delivery proof text');
    const init = (fn.mock.calls[0] as unknown[])?.[1] as { body?: string };
    const outer = JSON.parse(init?.body ?? '{}') as { content?: string };
    expect(outer.content).toBe('plain delivery proof text');
  });
});

// [S.1003 — beta #93 B–D] Seller inbox buckets + one-shot deliver preflight.
// Pure helpers only, frozen nowMs — no network, no chain.

const NOW = 1_760_000_000_000; // frozen clock
const HOUR = 3_600_000;

function job(overrides: Partial<IndexedJob>): IndexedJob {
  return {
    jobId: '0x' + 'a'.repeat(64),
    buyer: '0x' + 'b'.repeat(64),
    seller: '0x' + 'c'.repeat(64),
    amountUsdc: 1,
    state: 'funded',
    deliverByMs: NOW + HOUR,
    reviewWindowMs: HOUR,
    deliveryHash: null,
    createdAtMs: NOW - HOUR,
    updatedAtMs: NOW - HOUR,
    ...overrides,
  };
}

describe('bucketSellerJob (S.1003)', () => {
  it('funded with a future deadline → needsYou', () => {
    expect(bucketSellerJob(job({ state: 'funded', deliverByMs: NOW + 1 }), NOW)).toBe('needsYou');
  });

  it('funded past the deadline → fundedLate (chain rejects late delivers)', () => {
    expect(bucketSellerJob(job({ state: 'funded', deliverByMs: NOW - 1 }), NOW)).toBe('fundedLate');
  });

  it('delivered inside the review window → awaitingBuyer', () => {
    expect(
      bucketSellerJob(job({ state: 'delivered', updatedAtMs: NOW - HOUR / 2, reviewWindowMs: HOUR }), NOW),
    ).toBe('awaitingBuyer');
  });

  it('delivered past the review window → releasable', () => {
    expect(
      bucketSellerJob(job({ state: 'delivered', updatedAtMs: NOW - 2 * HOUR, reviewWindowMs: HOUR }), NOW),
    ).toBe('releasable');
  });

  it('prefers deliveredAtMs over updatedAtMs for the review clock when present', () => {
    // updatedAtMs alone would say releasable; the real delivered clock says open.
    expect(
      bucketSellerJob(
        job({ state: 'delivered', updatedAtMs: NOW - 2 * HOUR, deliveredAtMs: NOW - HOUR / 2, reviewWindowMs: HOUR }),
        NOW,
      ),
    ).toBe('awaitingBuyer');
  });

  it('released/rejected/refunded → terminal', () => {
    for (const state of ['released', 'rejected', 'refunded'] as const) {
      expect(bucketSellerJob(job({ state }), NOW)).toBe('terminal');
    }
  });

  it('delivered with missing window fields → awaitingBuyer, never releasable without a clock', () => {
    expect(bucketSellerJob(job({ state: 'delivered', updatedAtMs: 0, reviewWindowMs: HOUR }), NOW)).toBe('awaitingBuyer');
    expect(
      bucketSellerJob(job({ state: 'delivered', reviewWindowMs: 0, updatedAtMs: NOW - 2 * HOUR }), NOW),
    ).toBe('awaitingBuyer');
  });
});

describe('reviewClosesMs', () => {
  it('anchors on deliveredAtMs ?? updatedAtMs + window', () => {
    expect(reviewClosesMs({ deliveredAtMs: 100, updatedAtMs: 50, reviewWindowMs: 10 })).toBe(110);
    expect(reviewClosesMs({ updatedAtMs: 50, reviewWindowMs: 10 })).toBe(60);
  });

  it('null without an honest clock', () => {
    expect(reviewClosesMs({ updatedAtMs: 0, reviewWindowMs: 10 })).toBeNull();
    expect(reviewClosesMs({ updatedAtMs: 50, reviewWindowMs: 0 })).toBeNull();
  });
});

describe('summarizeSellerInbox — the beta false-wake case', () => {
  it('delivered-only workload counts ZERO needsYou', () => {
    const jobs = [
      job({ jobId: '0x' + '1'.repeat(64), state: 'delivered', updatedAtMs: NOW - HOUR / 2 }),
      job({ jobId: '0x' + '2'.repeat(64), state: 'delivered', updatedAtMs: NOW - 3 * HOUR }),
      job({ jobId: '0x' + '3'.repeat(64), state: 'released' }),
      job({ jobId: '0x' + '4'.repeat(64), state: 'refunded' }),
      job({ jobId: '0x' + '5'.repeat(64), state: 'delivered', updatedAtMs: NOW - HOUR / 4 }),
    ];
    const inbox = summarizeSellerInbox(jobs, NOW);
    expect(inbox.counts).toEqual({ total: 5, needsYou: 0, fundedLate: 0, awaitingBuyer: 2, releasable: 1, terminal: 2 });
    expect(inbox.releasable[0]?.jobId).toBe('0x' + '2'.repeat(64));
    // Buckets partition the list — nothing lost, nothing double-counted.
    const sum = inbox.needsYou.length + inbox.fundedLate.length + inbox.awaitingBuyer.length + inbox.releasable.length + inbox.terminal.length;
    expect(sum).toBe(5);
  });
});

describe('deliverPreflightError (S.1003 one-shot honesty)', () => {
  it('already delivered → permanent-hash message, no upload/sign', () => {
    expect(deliverPreflightError('delivered', NOW + HOUR, NOW)).toMatch(/already delivered|cannot be replaced/i);
  });

  it('terminal states → not deliverable', () => {
    for (const state of ['released', 'rejected', 'refunded'] as const) {
      expect(deliverPreflightError(state, NOW + HOUR, NOW)).toMatch(/nothing can be delivered/);
    }
  });

  it('funded past the deadline → refund-path message', () => {
    expect(deliverPreflightError('funded', NOW - 1, NOW)).toMatch(/deadline.*passed|refund/i);
  });

  it('funded before the deadline → null (proceed)', () => {
    expect(deliverPreflightError('funded', NOW + 1, NOW)).toBeNull();
  });
});

// [S.1004] Chain hydrate — the indexer lags; chain is the bucket SSOT.

import type { Job } from '@t2000/sdk';
import { hydrateSellerJobsFromChain, mergeIndexedJobFromChain } from './job.js';

function chainJob(overrides: Partial<Job>): Job {
  return {
    id: '0x' + 'a'.repeat(64),
    buyer: '0x' + 'b'.repeat(64),
    seller: '0x' + 'c'.repeat(64),
    amountUsdc: 1,
    escrowUsdc: 1,
    feeBps: 500,
    specHash: '0x' + 'd'.repeat(64),
    deliverByMs: NOW + HOUR,
    reviewWindowMs: HOUR,
    rejectSplitBps: 8000,
    state: 'funded',
    deliveryHash: null,
    deliveredAtMs: null,
    createdAtMs: NOW - HOUR,
    ...overrides,
  };
}

describe('mergeIndexedJobFromChain (S.1004)', () => {
  it('index funded + chain delivered → delivered with deliveredAtMs carried', () => {
    const merged = mergeIndexedJobFromChain(
      job({ state: 'funded', updatedAtMs: NOW - 2 * HOUR }),
      chainJob({ state: 'delivered', deliveredAtMs: NOW - 60_000, deliveryHash: '0x' + 'e'.repeat(64) }),
    );
    expect(merged.state).toBe('delivered');
    expect(merged.deliveredAtMs).toBe(NOW - 60_000);
    expect(merged.deliveryHash).toBe('0x' + 'e'.repeat(64));
    // Review clock now anchors on the true delivery time, not the stale row.
    expect(merged.updatedAtMs).toBe(NOW - 60_000);
  });

  it('chain released → terminal state wins over a stale index row', () => {
    const merged = mergeIndexedJobFromChain(job({ state: 'delivered' }), chainJob({ state: 'released' }));
    expect(merged.state).toBe('released');
  });
});

describe('hydrateSellerJobsFromChain (S.1004)', () => {
  it('funded lag: API funded + RPC delivered buckets awaitingBuyer, not needsYou', async () => {
    const rows = [job({ state: 'funded' })];
    const hydrated = await hydrateSellerJobsFromChain(rows, () =>
      Promise.resolve(chainJob({ state: 'delivered', deliveredAtMs: NOW - 60_000 })),
    );
    const inbox = summarizeSellerInbox(hydrated, NOW);
    expect(inbox.counts.needsYou).toBe(0);
    expect(inbox.counts.awaitingBuyer).toBe(1);
  });

  it('one failing RPC read keeps that index row; others still hydrate', async () => {
    const bad = '0x' + '9'.repeat(64);
    const rows = [job({ jobId: bad, state: 'funded' }), job({ jobId: '0x' + '8'.repeat(64), state: 'funded' })];
    const hydrated = await hydrateSellerJobsFromChain(rows, (id) =>
      id === bad
        ? Promise.reject(new Error('object not found'))
        : Promise.resolve(chainJob({ id, state: 'delivered', deliveredAtMs: NOW - 1 })),
    );
    expect(hydrated[0]?.state).toBe('funded'); // fail-soft: index row kept
    expect(hydrated[1]?.state).toBe('delivered');
  });

  it('terminal rows never call getJob', async () => {
    const calls: string[] = [];
    const rows = [job({ state: 'released' }), job({ state: 'refunded' }), job({ state: 'rejected' })];
    await hydrateSellerJobsFromChain(rows, (id) => {
      calls.push(id);
      return Promise.resolve(chainJob({}));
    });
    expect(calls).toEqual([]);
  });

  it('maxHydrate caps at the first N non-terminal rows in input order', async () => {
    const calls: string[] = [];
    const rows = Array.from({ length: 26 }, (_, i) =>
      job({ jobId: `0x${String(i).padStart(64, '0')}`, state: 'funded' }),
    );
    await hydrateSellerJobsFromChain(rows, (id) => {
      calls.push(id);
      return Promise.resolve(chainJob({ id, state: 'funded' }));
    });
    expect(calls.length).toBe(25);
    expect(calls[0]).toBe(rows[0]?.jobId);
    expect(calls.at(-1)).toBe(rows[24]?.jobId);
  });
});

// ── S.1016: buyer inbox — the mirror seat ────────────────────────────────

import { bucketBuyerJob, fetchBuyerJobs, hydrateJobsFromChain, summarizeBuyerInbox } from './job.js';

describe('bucketBuyerJob (S.1016)', () => {
  it('delivered → needsYou (grade it), regardless of clocks', () => {
    expect(bucketBuyerJob(job({ state: 'delivered' }), NOW)).toBe('needsYou');
  });

  it('funded past deadline → refundable, never a release steer (S.1015 stands)', () => {
    expect(bucketBuyerJob(job({ state: 'funded', deliverByMs: NOW - 1 }), NOW)).toBe('refundable');
  });

  it('funded in window → waiting', () => {
    expect(bucketBuyerJob(job({ state: 'funded', deliverByMs: NOW + 1 }), NOW)).toBe('waiting');
  });

  it('released/rejected/refunded → terminal', () => {
    for (const state of ['released', 'rejected', 'refunded'] as const) {
      expect(bucketBuyerJob(job({ state }), NOW)).toBe('terminal');
    }
  });
});

describe('summarizeBuyerInbox', () => {
  it('partitions with stable counts', () => {
    const jobs = [
      job({ jobId: '0x' + '1'.repeat(64), state: 'delivered' }),
      job({ jobId: '0x' + '2'.repeat(64), state: 'funded', deliverByMs: NOW - 1 }),
      job({ jobId: '0x' + '3'.repeat(64), state: 'funded', deliverByMs: NOW + HOUR }),
      job({ jobId: '0x' + '4'.repeat(64), state: 'released' }),
    ];
    const inbox = summarizeBuyerInbox(jobs, NOW);
    expect(inbox.counts).toEqual({ total: 4, needsYou: 1, refundable: 1, waiting: 1, terminal: 1 });
    expect(inbox.needsYou[0]?.jobId).toBe('0x' + '1'.repeat(64));
  });
});

describe('fetchBuyerJobs (S.1016)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('queries /jobs by buyer and returns the rows', async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ jobs: [{ jobId: '0xj' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fn);
    const rows = await fetchBuyerJobs('https://api.t2000.ai/v1', '0xBUYER');
    expect(rows).toEqual([{ jobId: '0xj' }]);
    expect(String((fn.mock.calls[0] as unknown[])[0])).toBe('https://api.t2000.ai/v1/jobs?buyer=0xBUYER&limit=100');
  });
});

describe('hydrateJobsFromChain seat-neutral alias (S.1016)', () => {
  it('is the same function the seller inbox uses', async () => {
    const { hydrateSellerJobsFromChain } = await import('./job.js');
    expect(hydrateJobsFromChain).toBe(hydrateSellerJobsFromChain);
  });
});
