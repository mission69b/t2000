import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  customHireEnvelope,
  deliveryEnvelope,
  isCustomHireEnvelope,
  MAX_JOB_IMAGES,
  normalizeJobImages,
  openPostEnvelope,
  parseDeliveryContent,
  parseSpecImages,
  validateJobImages,
} from './job-spec-envelope.js';

// S.978 — the ONE write shape for buyer custom jobs. These pins mirror the
// S.977 mcp suite so the SDK builder stays byte-stable with what Connect
// already ships; the CLI wraps through this exact function.

describe('customHireEnvelope', () => {
  it('derives the title from the first non-empty line; brief is lossless', () => {
    const brief =
      '\nWrite a launch tweet thread for my Sui project.\nAudience: degens.';
    const parsed = JSON.parse(customHireEnvelope(brief, undefined, 1_700_000_000_000));
    expect(parsed.type).toBe('t2-acp-custom@1');
    expect(parsed.title).toBe('Write a launch tweet thread for my Sui project.');
    expect(parsed.brief).toBe(brief.trim());
    expect(parsed.createdAtMs).toBe(1_700_000_000_000);
  });

  it('explicit title wins; Title: prefix strips; 80 cap holds; empty → Custom job', () => {
    expect(JSON.parse(customHireEnvelope('body', 'Name my boat', 1)).title).toBe(
      'Name my boat',
    );
    const prefixed = JSON.parse(
      customHireEnvelope('Title: Naming ceremony\nFive candidates.', undefined, 1),
    );
    expect(prefixed.title).toBe('Naming ceremony');
    expect(prefixed.brief.startsWith('Title: Naming ceremony')).toBe(true);
    const long = JSON.parse(
      customHireEnvelope(`${'x'.repeat(200)} end`, undefined, 1),
    );
    expect(long.title.length).toBe(80);
    expect(long.title.endsWith('…')).toBe(true);
    expect(JSON.parse(customHireEnvelope('   ', undefined, 1)).title).toBe(
      'Custom job',
    );
  });
});

describe('isCustomHireEnvelope', () => {
  it('accepts current + legacy envelopes with a usable brief; rejects the rest', () => {
    expect(
      isCustomHireEnvelope(
        JSON.stringify({ type: 't2-acp-custom@1', title: 'T', brief: 'B' }),
      ),
    ).toBe(true);
    expect(
      isCustomHireEnvelope(
        JSON.stringify({ type: 't2-acp-invite@1', title: 'T', brief: 'B' }),
      ),
    ).toBe(true);
    expect(
      isCustomHireEnvelope(
        JSON.stringify({ type: 't2-acp-custom@1', brief: '  ' }),
      ),
    ).toBe(false);
    expect(
      isCustomHireEnvelope(JSON.stringify({ type: 't2-acp-job-spec@1' })),
    ).toBe(false);
    expect(isCustomHireEnvelope('plain text brief')).toBe(false);
  });

  it('round-trip: the builder output never double-wraps', () => {
    expect(isCustomHireEnvelope(customHireEnvelope('a real brief', undefined, 1))).toBe(
      true,
    );
  });
});

// ── S.1299 — job images ────────────────────────────────────────────────────

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const IMG = ['https://res.cloudinary.com/t/a.jpg', 'https://res.cloudinary.com/t/b.jpg'];

describe('validateJobImages', () => {
  it('empty / absent is valid and empty; blanks drop; duplicates collapse (first = cover)', () => {
    expect(validateJobImages(undefined)).toEqual({ valid: true, images: [] });
    expect(validateJobImages([])).toEqual({ valid: true, images: [] });
    expect(validateJobImages([' ', IMG[0], IMG[0], IMG[1]])).toEqual({
      valid: true,
      images: [IMG[0], IMG[1]],
    });
  });
  it('HTTPS only; junk and non-lists refuse; more than 6 refuses', () => {
    expect(validateJobImages(['http://x.test/a.jpg']).valid).toBe(false);
    expect(validateJobImages(['not a url']).valid).toBe(false);
    expect(validateJobImages('https://x.test/a.jpg').valid).toBe(false);
    expect(validateJobImages([1]).valid).toBe(false);
    const seven = Array.from({ length: MAX_JOB_IMAGES + 1 }, (_, i) => `https://x.test/${i}.jpg`);
    const r = validateJobImages(seven);
    expect(r.valid).toBe(false);
    expect(r.valid ? '' : r.error).toMatch(/Up to 6/);
    expect(() => normalizeJobImages(seven)).toThrow(/Up to 6/);
  });
});

describe('customHireEnvelope / openPostEnvelope with images', () => {
  it('no images → byte-identical to the pre-S.1299 envelope (no images key)', () => {
    const a = customHireEnvelope('brief', 'T', 1);
    const b = customHireEnvelope('brief', 'T', 1, { images: [] });
    expect(a).toBe(b);
    expect(JSON.parse(a)).not.toHaveProperty('images');
  });
  it('images ride inside the envelope — the hash CHANGES when they change', () => {
    const none = customHireEnvelope('brief', 'T', 1);
    const one = customHireEnvelope('brief', 'T', 1, { images: [IMG[0]] });
    const two = customHireEnvelope('brief', 'T', 1, { images: IMG });
    expect(JSON.parse(one).images).toEqual([IMG[0]]);
    expect(sha(none)).not.toBe(sha(one));
    expect(sha(one)).not.toBe(sha(two));
    expect(parseSpecImages(two)).toEqual(IMG);
    expect(parseSpecImages(none)).toEqual([]);
    expect(parseSpecImages('raw brief text')).toEqual([]);
  });
  it('refuses more than 6 or non-HTTPS at write time', () => {
    expect(() => customHireEnvelope('b', 'T', 1, { images: ['http://x.test/a.jpg'] })).toThrow(/HTTPS/);
  });
  it('openPostEnvelope = the same shape with the post title', () => {
    const e = JSON.parse(openPostEnvelope('Bins out', 'Two bins…', 5, { images: [IMG[0]] }));
    expect(e).toMatchObject({ type: 't2-acp-custom@1', title: 'Bins out', brief: 'Two bins…', images: [IMG[0]] });
    expect(isCustomHireEnvelope(openPostEnvelope('Bins out', 'Two bins…', 5))).toBe(true);
  });
});

describe('deliveryEnvelope / parseDeliveryContent', () => {
  it('no proof images → the RAW body, byte-identical to every past delivery', () => {
    expect(deliveryEnvelope('done.md contents', 1)).toBe('done.md contents');
    expect(parseDeliveryContent('done.md contents')).toEqual({
      body: 'done.md contents',
      images: [],
      enveloped: false,
    });
  });
  it('proof images → t2-acp-delivery@1; the hash changes; round-trips', () => {
    const raw = 'Both bins in place.';
    const env = deliveryEnvelope(raw, 7, { images: IMG });
    expect(JSON.parse(env)).toMatchObject({ type: 't2-acp-delivery@1', body: raw, images: IMG, createdAtMs: 7 });
    expect(sha(env)).not.toBe(sha(raw));
    expect(parseDeliveryContent(env)).toEqual({ body: raw, images: IMG, enveloped: true });
  });
  it('a JSON delivery that is not the envelope stays raw text', () => {
    const other = JSON.stringify({ hello: 'world' });
    expect(parseDeliveryContent(other)).toEqual({ body: other, images: [], enveloped: false });
  });
});
