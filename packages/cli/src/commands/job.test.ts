import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSellerJobs, parseDuration, resolveCommitment } from './job.js';

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

describe('resolveCommitment', () => {
  it('passes 0x hex hashes through untouched', async () => {
    expect(await resolveCommitment('0xdeadbeef')).toBe('0xdeadbeef');
  });

  it('hashes file contents when the arg is a readable path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 't2-job-'));
    const file = join(dir, 'spec.md');
    await writeFile(file, 'deliver a market report');
    const expected = `0x${createHash('sha256').update('deliver a market report').digest('hex')}`;
    expect(await resolveCommitment(file)).toBe(expected);
  });

  it('hashes literal text when the arg is not a file', async () => {
    const expected = `0x${createHash('sha256').update('inline spec text').digest('hex')}`;
    expect(await resolveCommitment('inline spec text')).toBe(expected);
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
