import { describe, it, expect } from 'vitest';
import {
  parseProactiveMarker,
  stripProactiveMarkers,
  extractAllProactiveMarkers,
} from '../proactive-marker.js';

describe('parseProactiveMarker', () => {
  it('returns null when no marker is present', () => {
    expect(parseProactiveMarker('Your USDC balance is $42.')).toBeNull();
    expect(parseProactiveMarker('')).toBeNull();
  });

  it('parses a single valid marker with all four allowed types', () => {
    for (const t of ['idle_balance', 'hf_warning', 'apy_drift', 'goal_progress']) {
      const text = `<proactive type="${t}" subjectKey="USDC">Body for ${t}.</proactive>`;
      const result = parseProactiveMarker(text);
      expect(result).not.toBeNull();
      expect(result?.proactiveType).toBe(t);
      expect(result?.subjectKey).toBe('USDC');
      expect(result?.body).toBe(`Body for ${t}.`);
      expect(result?.markerCount).toBe(1);
    }
  });

  it('reports the violation count when multiple markers are present, picking the first valid', () => {
    const text = `
<proactive type="idle_balance" subjectKey="USDC">First insight.</proactive>
Some chatter in the middle.
<proactive type="hf_warning" subjectKey="1.45">Second insight.</proactive>
    `;
    const result = parseProactiveMarker(text);
    expect(result?.markerCount).toBe(2);
    expect(result?.proactiveType).toBe('idle_balance');
    expect(result?.body).toBe('First insight.');
  });

  it('rejects markers with an invalid type (allow-list closed)', () => {
    const text = `<proactive type="random_thoughts" subjectKey="USDC">Body.</proactive>`;
    expect(parseProactiveMarker(text)).toBeNull();
  });

  it('rejects markers missing the type attribute', () => {
    const text = `<proactive subjectKey="USDC">Body.</proactive>`;
    expect(parseProactiveMarker(text)).toBeNull();
  });

  it('rejects markers missing the subjectKey attribute', () => {
    const text = `<proactive type="idle_balance">Body.</proactive>`;
    expect(parseProactiveMarker(text)).toBeNull();
  });

  it('rejects markers with an empty body after trim', () => {
    const text = `<proactive type="idle_balance" subjectKey="USDC">   </proactive>`;
    expect(parseProactiveMarker(text)).toBeNull();
  });

  it('rejects markers with an empty subjectKey after trim', () => {
    const text = `<proactive type="idle_balance" subjectKey="   ">Body.</proactive>`;
    expect(parseProactiveMarker(text)).toBeNull();
  });

  it('falls through to a later valid marker when the first is malformed', () => {
    // First marker has invalid type; second is valid. Parser returns the
    // second one with markerCount=2 (both counted toward the violation
    // counter even though only one is parseable).
    const text = `
<proactive type="bogus_type" subjectKey="A">Will be skipped.</proactive>
<proactive type="hf_warning" subjectKey="1.45">Health factor warning.</proactive>
    `;
    const result = parseProactiveMarker(text);
    expect(result?.proactiveType).toBe('hf_warning');
    expect(result?.subjectKey).toBe('1.45');
    expect(result?.markerCount).toBe(2);
  });

  it('tolerates attribute order variation', () => {
    const text = `<proactive subjectKey="USDC" type="idle_balance">Body.</proactive>`;
    const result = parseProactiveMarker(text);
    expect(result?.proactiveType).toBe('idle_balance');
    expect(result?.subjectKey).toBe('USDC');
  });

  it('tolerates whitespace and newlines inside the body', () => {
    const text = `<proactive type="idle_balance" subjectKey="USDC">

  Multi-line body
  with indentation.

</proactive>`;
    const result = parseProactiveMarker(text);
    expect(result?.body).toBe('Multi-line body\n  with indentation.');
  });

  it('tolerates extra whitespace inside the opening tag', () => {
    const text = `<proactive   type="idle_balance"   subjectKey="USDC"  >Body.</proactive>`;
    const result = parseProactiveMarker(text);
    expect(result?.proactiveType).toBe('idle_balance');
  });

  it('handles long subject keys including dots, hyphens, and numbers', () => {
    const text = `<proactive type="goal_progress" subjectKey="save-500-by-2026-05-31">120 to go.</proactive>`;
    const result = parseProactiveMarker(text);
    expect(result?.subjectKey).toBe('save-500-by-2026-05-31');
  });
});

describe('stripProactiveMarkers', () => {
  it('returns the text unchanged when no markers are present', () => {
    const text = 'Your USDC balance is $42.';
    expect(stripProactiveMarkers(text)).toBe(text);
  });

  it('strips a single marker leaving the body in place', () => {
    const text = `<proactive type="idle_balance" subjectKey="USDC">You have idle USDC.</proactive>`;
    expect(stripProactiveMarkers(text)).toBe('You have idle USDC.');
  });

  it('strips multiple markers (cooldown-hit case where LLM violated 1-per-turn)', () => {
    const text = `
<proactive type="idle_balance" subjectKey="USDC">First.</proactive>
And then:
<proactive type="hf_warning" subjectKey="1.45">Second.</proactive>
    `;
    expect(stripProactiveMarkers(text)).toBe(`
First.
And then:
Second.
    `);
  });

  it('leaves malformed markers (no attrs at all) visible — defensive', () => {
    // The regex requires attributes, so `<proactive>` (no attrs) does NOT
    // match. We deliberately leave malformed markers in place so they're
    // visible during dev/QA — silently stripping broken markup would hide
    // model-compliance issues. The parser rejects this case too (no
    // type/subjectKey attrs), so this code path is reached only on the
    // cooldown-suppression branch with a parser-accepted input — and the
    // parser only accepts well-formed input. Belt-and-braces.
    const text = `<proactive>Body without attrs</proactive>`;
    expect(stripProactiveMarkers(text)).toBe(text);
  });
});

describe('extractAllProactiveMarkers', () => {
  it('returns [] when no marker is present', () => {
    expect(extractAllProactiveMarkers('Your USDC balance is $42.')).toEqual([]);
    expect(extractAllProactiveMarkers('')).toEqual([]);
  });

  it('returns every (proactiveType, subjectKey) pair in document order', () => {
    const text = `
<proactive type="idle_balance" subjectKey="USDC">First.</proactive>
chatter
<proactive type="hf_warning" subjectKey="1.45">Second.</proactive>
    `;
    expect(extractAllProactiveMarkers(text)).toEqual([
      { proactiveType: 'idle_balance', subjectKey: 'USDC' },
      { proactiveType: 'hf_warning', subjectKey: '1.45' },
    ]);
  });

  it('skips markers whose attrs are unparseable but keeps the well-formed ones around them', () => {
    const text = `
<proactive type="idle_balance">missing subjectKey</proactive>
<proactive type="goal_progress" subjectKey="save-500">valid</proactive>
    `;
    expect(extractAllProactiveMarkers(text)).toEqual([
      { proactiveType: 'goal_progress', subjectKey: 'save-500' },
    ]);
  });

  it('does NOT filter on the VALID_TYPES allow-list (lenient — extra entries are inert in the cooldown set)', () => {
    // Cooldown rehydrate is keyed on string `${type}:${subjectKey}` regardless
    // of whether `type` is in the allow-list. Including invalid types here
    // costs nothing because future valid emits never share the key — and
    // it keeps this helper decoupled from emit-side validation policy.
    const text = `<proactive type="future_unknown" subjectKey="X">body</proactive>`;
    expect(extractAllProactiveMarkers(text)).toEqual([
      { proactiveType: 'future_unknown', subjectKey: 'X' },
    ]);
  });

  it('drops entries with empty subjectKey', () => {
    const text = `<proactive type="idle_balance" subjectKey="">body</proactive>`;
    expect(extractAllProactiveMarkers(text)).toEqual([]);
  });

  it('trims whitespace from subjectKey', () => {
    const text = `<proactive type="idle_balance" subjectKey="  USDC  ">body</proactive>`;
    expect(extractAllProactiveMarkers(text)).toEqual([
      { proactiveType: 'idle_balance', subjectKey: 'USDC' },
    ]);
  });
});
