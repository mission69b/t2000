import { describe, expect, it } from 'vitest';
import {
  customHireEnvelope,
  distanceKm,
  openPostEnvelope,
  parseSpecMode,
  parseSpecWhere,
  validateJobMode,
  validateJobPlace,
  validateJobWhere,
} from './job-spec-envelope.js';
import { placeParams } from './open-jobs.js';

// S.1300 — mode + where on the spec envelope. Same doctrine as S.1299
// images: optional keys, written only when non-default, so a remote job
// with no place hashes byte-identically to before.

const BONDI = {
  label: 'Bondi Junction, Sydney',
  lat: -33.8915,
  lng: 151.2477,
  placeId: 'municipality.123',
  provider: 'maptiler' as const,
};

describe('validateJobMode', () => {
  it('defaults to remote and accepts the three modes (plus common spellings)', () => {
    expect(validateJobMode(undefined)).toEqual({ valid: true, mode: 'remote' });
    expect(validateJobMode('')).toEqual({ valid: true, mode: 'remote' });
    expect(validateJobMode('on-site')).toEqual({ valid: true, mode: 'on-site' });
    expect(validateJobMode('ONSITE')).toEqual({ valid: true, mode: 'on-site' });
    expect(validateJobMode('either')).toEqual({ valid: true, mode: 'either' });
    expect(validateJobMode('hybrid').valid).toBe(false);
    expect(validateJobMode(3).valid).toBe(false);
  });
});

describe('validateJobWhere', () => {
  it('accepts the structured shape only — a string is a geocoder query, not a place', () => {
    expect(validateJobWhere(null)).toEqual({ valid: true, where: null });
    const v = validateJobWhere(BONDI);
    expect(v).toEqual({ valid: true, where: BONDI });
    const s = validateJobWhere('Bondi Junction');
    expect(s.valid).toBe(false);
    expect(!s.valid && s.error).toMatch(/geocod/);
  });
  it('refuses out-of-range coordinates, a missing label, and a second vendor', () => {
    expect(validateJobWhere({ ...BONDI, lat: 91 }).valid).toBe(false);
    expect(validateJobWhere({ ...BONDI, lng: -181 }).valid).toBe(false);
    expect(validateJobWhere({ ...BONDI, label: '  ' }).valid).toBe(false);
    expect(validateJobWhere({ ...BONDI, provider: 'google' }).valid).toBe(false);
  });
  it('normalizes: trims the label, rounds to 1e-6, fills the provider', () => {
    const v = validateJobWhere({ label: '  Bondi  ', lat: -33.89151234567, lng: 151.2 });
    expect(v).toEqual({
      valid: true,
      where: { label: 'Bondi', lat: -33.891512, lng: 151.2, provider: 'maptiler' },
    });
  });
});

describe('validateJobPlace', () => {
  it('refuses a place on a remote job', () => {
    const v = validateJobPlace('remote', BONDI);
    expect(v.valid).toBe(false);
    expect(!v.valid && v.error).toMatch(/remote job has no place/);
    expect(validateJobPlace(undefined, BONDI).valid).toBe(false);
  });
  it('on-site / either may carry a place, or none', () => {
    expect(validateJobPlace('on-site', BONDI)).toEqual({ valid: true, mode: 'on-site', where: BONDI });
    expect(validateJobPlace('either', null)).toEqual({ valid: true, mode: 'either', where: null });
  });
});

describe('envelopes with mode + where', () => {
  it('remote + no where is byte-identical to the pre-S.1300 envelope', () => {
    const before = customHireEnvelope('Brief', 'T', 1);
    const after = customHireEnvelope('Brief', 'T', 1, { mode: 'remote', where: null });
    expect(after).toBe(before);
    expect(after).not.toContain('"mode"');
  });
  it('writes mode only when not remote, where only when set, AFTER images', () => {
    const e = openPostEnvelope('T', 'Brief', 1, {
      images: ['https://x/a.jpg'],
      mode: 'on-site',
      where: BONDI,
    });
    expect(e).toBe(
      JSON.stringify({
        type: 't2-acp-custom@1',
        title: 'T',
        brief: 'Brief',
        createdAtMs: 1,
        images: ['https://x/a.jpg'],
        mode: 'on-site',
        where: BONDI,
      }),
    );
    expect(parseSpecMode(e)).toBe('on-site');
    expect(parseSpecWhere(e)).toEqual(BONDI);
    expect(openPostEnvelope('T', 'Brief', 1, { mode: 'either' })).toContain('"mode":"either"');
  });
  it('throws on remote + where', () => {
    expect(() => openPostEnvelope('T', 'B', 1, { where: BONDI })).toThrow(/remote job has no place/);
  });
  it('readers fail soft: raw text and junk read remote / null', () => {
    expect(parseSpecMode('just a brief')).toBe('remote');
    expect(parseSpecWhere('just a brief')).toBeNull();
    expect(parseSpecWhere(JSON.stringify({ where: 'Bondi' }))).toBeNull();
    expect(parseSpecMode(JSON.stringify({ mode: 'hybrid' }))).toBe('remote');
  });
});

describe('placeParams (write inputs)', () => {
  it('passes a query string through for the host to geocode, mode required non-remote', () => {
    expect(placeParams({ mode: 'on-site', where: 'Bondi Junction' })).toEqual({
      mode: 'on-site',
      where: 'Bondi Junction',
    });
    expect(() => placeParams({ where: 'Bondi Junction' })).toThrow(/remote job has no place/);
    expect(placeParams({ mode: 'either', where: '   ' })).toEqual({ mode: 'either' });
  });
  it('validates a structured where and omits defaults', () => {
    expect(placeParams({})).toEqual({});
    expect(placeParams({ mode: 'remote' })).toEqual({});
    expect(placeParams({ mode: 'on-site', where: BONDI })).toEqual({ mode: 'on-site', where: BONDI });
    expect(() => placeParams({ mode: 'on-site', where: { label: 'x', lat: 1, lng: 999 } as never })).toThrow(/lng/);
  });
});

describe('distanceKm', () => {
  it('Bondi Junction → Sydney Opera House is ~5–6 km', () => {
    const d = distanceKm(BONDI, { lat: -33.8568, lng: 151.2153 });
    expect(d).toBeGreaterThan(4.5);
    expect(d).toBeLessThan(6.5);
    expect(distanceKm(BONDI, BONDI)).toBe(0);
  });
});
