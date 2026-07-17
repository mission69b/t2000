import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseDuration, resolveCommitment } from './job.js';

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
