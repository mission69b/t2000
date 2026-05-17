// ---------------------------------------------------------------------------
// compose-skills.test.ts — composition helper unit tests
// ---------------------------------------------------------------------------
//
// SPEC v0.7a Phase 6G. Covers:
//   - Full-body composition
//   - Section extraction (single + multiple, preserves skill order)
//   - Unknown skill throws with available-list
//   - Unknown section throws with available-list
//   - Empty headers array rejected
//   - H3+ nested correctly inside H2 blocks (no premature split)
//   - Top-of-body H1 + intro discarded (parser starts at first H2)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { composeSkillBody, composeSkillSections } from './compose-skills.js';
import type { SkillData } from './skills-prompts.js';

const FIXTURE_SKILLS: SkillData[] = [
  {
    name: 't2000-test-multi',
    description: 'Test skill with multiple sections',
    body: [
      '# t2000: Test Multi',
      '',
      'Intro paragraph that lives ABOVE the first H2 and should be',
      'dropped by the section parser.',
      '',
      '## Purpose',
      'Render a test report.',
      '',
      '## Engine orchestration',
      'Call `tool_a` then `tool_b` in parallel.',
      '',
      '### Sub-detail',
      'Sub-section content stays inside the parent H2 block.',
      '',
      '## CLI quick command',
      '```bash',
      't2000 test',
      '```',
      '',
      '## Notes',
      'Final notes.',
    ].join('\n'),
  },
  {
    name: 't2000-test-single',
    description: 'Test skill with only one section',
    body: ['# Single', '', '## Only', 'One section.'].join('\n'),
  },
];

describe('composeSkillBody', () => {
  it('returns the full body verbatim', () => {
    const body = composeSkillBody('t2000-test-multi', { skills: FIXTURE_SKILLS });
    expect(body).toBe(FIXTURE_SKILLS[0]!.body);
  });

  it('throws with available-list on unknown skill', () => {
    expect(() =>
      composeSkillBody('t2000-does-not-exist', { skills: FIXTURE_SKILLS }),
    ).toThrow(
      /Unknown skill 't2000-does-not-exist'. Available skills: t2000-test-multi, t2000-test-single/,
    );
  });
});

describe('composeSkillSections', () => {
  it('extracts a single named section', () => {
    const out = composeSkillSections(
      't2000-test-multi',
      ['Purpose'],
      { skills: FIXTURE_SKILLS },
    );
    expect(out).toBe('## Purpose\nRender a test report.');
  });

  it('preserves SKILL source order (NOT caller-supplied order)', () => {
    // Caller asked Notes BEFORE Purpose; result is in skill order.
    const out = composeSkillSections(
      't2000-test-multi',
      ['Notes', 'Purpose'],
      { skills: FIXTURE_SKILLS },
    );
    expect(out).toBe(
      [
        '## Purpose',
        'Render a test report.',
        '## Notes',
        'Final notes.',
      ].join('\n'),
    );
  });

  it('keeps H3+ subsections nested inside the parent H2', () => {
    const out = composeSkillSections(
      't2000-test-multi',
      ['Engine orchestration'],
      { skills: FIXTURE_SKILLS },
    );
    expect(out).toContain('### Sub-detail');
    expect(out).toContain('Sub-section content stays inside the parent H2 block.');
    // And it does NOT bleed into the next H2.
    expect(out).not.toContain('## CLI quick command');
    expect(out).not.toContain('t2000 test');
  });

  it('drops content above the first H2 (the H1 title + intro)', () => {
    const out = composeSkillSections(
      't2000-test-multi',
      ['Purpose'],
      { skills: FIXTURE_SKILLS },
    );
    expect(out).not.toContain('# t2000: Test Multi');
    expect(out).not.toContain('Intro paragraph');
  });

  it('throws on unknown section with available-list', () => {
    expect(() =>
      composeSkillSections(
        't2000-test-multi',
        ['Nope'],
        { skills: FIXTURE_SKILLS },
      ),
    ).toThrow(
      /Skill 't2000-test-multi' is missing sections: Nope. Available sections: Purpose, Engine orchestration, CLI quick command, Notes/,
    );
  });

  it('throws when any one of multiple requested sections is missing', () => {
    expect(() =>
      composeSkillSections(
        't2000-test-multi',
        ['Purpose', 'Nope', 'Notes'],
        { skills: FIXTURE_SKILLS },
      ),
    ).toThrow(/missing sections: Nope/);
  });

  it('throws on empty headers array', () => {
    expect(() =>
      composeSkillSections('t2000-test-multi', [], { skills: FIXTURE_SKILLS }),
    ).toThrow(/pass at least one header/);
  });

  it('throws on unknown skill', () => {
    expect(() =>
      composeSkillSections('nope', ['x'], { skills: FIXTURE_SKILLS }),
    ).toThrow(/Unknown skill 'nope'/);
  });

  it('handles a skill with only one section', () => {
    const out = composeSkillSections(
      't2000-test-single',
      ['Only'],
      { skills: FIXTURE_SKILLS },
    );
    expect(out).toBe('## Only\nOne section.');
  });
});
