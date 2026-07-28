import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBrief } from './open.js';

// `t2 open` helper coverage — the command wiring itself is exercised by
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
