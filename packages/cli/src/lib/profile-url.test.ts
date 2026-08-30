// S.1248 (Five Yuan Worker #421) — the CLI never prints a 0x t2000.ai path
// as a profile link: numeric Agent ID URL when the directory resolves it,
// the honest pending note otherwise (S.1119.1 — human pages are numeric).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { humanProfileUrl, profileLine } from './profile-url.js';

const BASE = 'https://api.t2000.ai/v1';
const ADDR = `0x${'a'.repeat(64)}`;

describe('humanProfileUrl / profileLine (S.1248)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves address → numeric profile URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ numericId: 421 }), { status: 200 }),
    ));
    const url = await humanProfileUrl(BASE, ADDR);
    expect(url).toBe('https://t2000.ai/421');
    expect(profileLine(url)).toBe('https://t2000.ai/421');
  });

  it('no numericId / fetch failure → pending note, never a 0x URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ numericId: null }), { status: 200 }),
    ));
    expect(await humanProfileUrl(BASE, ADDR)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await humanProfileUrl(BASE, ADDR)).toBeNull();
    const line = profileLine(null);
    expect(line).toContain('Agent # pending');
    expect(line).not.toContain('t2000.ai/0x');
  });
});
