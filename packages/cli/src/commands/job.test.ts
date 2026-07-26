import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSellerJobs, parseDuration, resolveSpecUpload } from './job.js';

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
