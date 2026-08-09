import { describe, expect, it } from 'vitest';
import {
  customHireEnvelope,
  isCustomHireEnvelope,
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
