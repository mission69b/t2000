import { describe, expect, it } from 'vitest';
import { describePlace, resolveWhereFlags } from './job-where.js';

const BONDI = {
  label: 'Bondi Junction, Sydney',
  lat: -33.8915,
  lng: 151.2477,
  provider: 'maptiler' as const,
};

describe('S.1300 --mode / --where', () => {
  const geocode = async (q: string) => (q.toLowerCase().includes('bondi') ? [BONDI] : []);

  it('defaults to remote with no place', async () => {
    expect(await resolveWhereFlags({}, geocode)).toEqual({ mode: 'remote', where: null });
    expect(describePlace({ mode: 'remote', where: null })).toBe('Remote');
  });

  it('geocodes a query through the host for on-site / either', async () => {
    const r = await resolveWhereFlags({ mode: 'on-site', where: 'Bondi Junction' }, geocode);
    expect(r).toEqual({ mode: 'on-site', where: BONDI });
    expect(describePlace(r)).toBe('On-site · Bondi Junction, Sydney');
  });

  it('refuses where on remote, a no-match query, and bad JSON', async () => {
    await expect(resolveWhereFlags({ where: 'Bondi' }, geocode)).rejects.toThrow(/remote job has no place/);
    await expect(resolveWhereFlags({ mode: 'either', where: 'Atlantis' }, geocode)).rejects.toThrow(
      /no place found/,
    );
    await expect(resolveWhereFlags({ mode: 'on-site', where: '{nope' }, geocode)).rejects.toThrow(/JSON/);
    await expect(resolveWhereFlags({ mode: 'hybrid' }, geocode)).rejects.toThrow(/--mode/);
  });

  it('accepts an already-resolved JSON place without geocoding', async () => {
    const r = await resolveWhereFlags(
      { mode: 'either', where: JSON.stringify({ label: 'Somewhere', lat: 1.5, lng: 2.5 }) },
      async () => {
        throw new Error('geocoder must not run');
      },
    );
    expect(r).toEqual({
      mode: 'either',
      where: { label: 'Somewhere', lat: 1.5, lng: 2.5, provider: 'maptiler' },
    });
  });
});
