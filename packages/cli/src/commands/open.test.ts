import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBrief, resolveClaimPolicyFlags, resolveMinSellerLevelFlag } from './open.js';

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

describe('resolveClaimPolicyFlags (S.1190 — --claim-policy 0|1|2, --proven alias)', () => {
  it('defaults to 0 (Anyone)', () => {
    expect(resolveClaimPolicyFlags({})).toBe(0);
    expect(resolveClaimPolicyFlags({ proven: false })).toBe(0);
  });

  it('maps the DEPRECATED --proven to policy 1 for one release', () => {
    expect(resolveClaimPolicyFlags({ proven: true })).toBe(1);
  });

  it('accepts --claim-policy 0|1|2, which always wins over --proven', () => {
    expect(resolveClaimPolicyFlags({ claimPolicy: '0' })).toBe(0);
    expect(resolveClaimPolicyFlags({ claimPolicy: '1' })).toBe(1);
    expect(resolveClaimPolicyFlags({ claimPolicy: '2' })).toBe(2);
    expect(resolveClaimPolicyFlags({ claimPolicy: '2', proven: true })).toBe(2);
    expect(resolveClaimPolicyFlags({ claimPolicy: '0', proven: true })).toBe(0);
  });

  it('refuses anything outside 0|1|2 with the three labels', () => {
    for (const bad of ['3', '-1', '1.5', 'proven', '']) {
      expect(() => resolveClaimPolicyFlags({ claimPolicy: bad })).toThrow(
        /0 \(Anyone\), 1 \(Proven\) or 2/,
      );
    }
  });
});

describe('resolveMinSellerLevelFlag (S.1192 — --min-seller-level 1|2|3|4)', () => {
  it('defaults to 0 (no floor) when absent', () => {
    expect(resolveMinSellerLevelFlag(undefined)).toBe(0);
  });

  it('accepts 1 through 4', () => {
    for (const lvl of ['1', '2', '3', '4']) {
      expect(resolveMinSellerLevelFlag(lvl)).toBe(Number(lvl));
    }
  });

  it('refuses 0, 5, garbage and empty (strict digit — Number("") is 0)', () => {
    for (const bad of ['0', '5', '-1', '2.5', 'two', '']) {
      expect(() => resolveMinSellerLevelFlag(bad)).toThrow(/1, 2, 3 or 4/);
    }
  });
});
