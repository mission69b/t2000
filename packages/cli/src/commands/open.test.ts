import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBrief, resolveTrustFlag } from './open.js';

// Open-verb helper coverage — the command wiring itself is exercised by
// program.integration.test.ts (every group's --help resolves).

describe('resolveBrief (open-job briefs are PUBLIC board text)', () => {
  it('passes literal text through, trimmed', async () => {
    await expect(resolveBrief('  Three logo concepts, PNG.  ')).resolves.toBe(
      'Three logo concepts, PNG.',
    );
  });

  it('reads a file when the input is a path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 't2-open-'));
    const file = join(dir, 'brief.md');
    await writeFile(file, '# Logo\n\nThree concepts.\n');
    await expect(resolveBrief(file)).resolves.toBe('# Logo\n\nThree concepts.');
  });

  it('rejects briefs over the 16 KiB board cap with guidance', async () => {
    await expect(resolveBrief('x'.repeat(16 * 1024 + 1))).rejects.toThrow(
      /16 KiB/,
    );
  });

  it('rejects non-UTF-8 file contents (the board holds text only)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 't2-open-'));
    const file = join(dir, 'brief.bin');
    await writeFile(file, Buffer.from([0xff, 0xfe, 0x00, 0xc3]));
    await expect(resolveBrief(file)).rejects.toThrow(/UTF-8/);
  });
});

describe('resolveTrustFlag (S.1209 — the ONE --trust knob)', () => {
  it('defaults to open when absent', () => {
    expect(resolveTrustFlag(undefined)).toBe('open');
  });

  it('accepts the four requirements, case-insensitive, trimmed', () => {
    expect(resolveTrustFlag('open')).toBe('open');
    expect(resolveTrustFlag('established')).toBe('established');
    expect(resolveTrustFlag('top')).toBe('top');
    expect(resolveTrustFlag('veteran')).toBe('veteran');
    expect(resolveTrustFlag(' Established ')).toBe('established');
    expect(resolveTrustFlag('TOP')).toBe('top');
  });

  it('refuses legacy numbers, Proven vocabulary, and empty', () => {
    for (const bad of ['0', '1', '2', 'proven', 'anyone', 'level 2', '']) {
      expect(() => resolveTrustFlag(bad)).toThrow(
        /open \(default\), established, top or veteran/,
      );
    }
  });
});

// S.1223 — the 1h SLA product floor at the CLI gate: sub-1h refuses in
// English BEFORE wallet load; 1h passes the parse+floor pair.
import { describe as describe1223, expect as expect1223, it as it1223 } from 'vitest';
import { MIN_JOB_SLA_MINUTES } from '@t2000/sdk';
import { parseDuration } from './job.js';

describe1223('S.1223 — SLA floor helper pair', () => {
  it1223('30m parses under the floor; 1h and the ladder clear it', () => {
    expect1223(Math.round(parseDuration('30m') / 60_000)).toBeLessThan(MIN_JOB_SLA_MINUTES);
    for (const d of ['1h', '4h', '12h', '24h', '3d', '7d']) {
      expect1223(
        Math.round(parseDuration(d) / 60_000),
      ).toBeGreaterThanOrEqual(MIN_JOB_SLA_MINUTES);
    }
  });
});
