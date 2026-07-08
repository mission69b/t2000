import { describe, expect, it } from 'vitest';
import { classifyContent, slugFromEntry } from './check.js';

describe('skills check (S.674 freshness contract)', () => {
  it('classifies identical content as up-to-date (whitespace-insensitive at the edges)', () => {
    expect(classifyContent('# Skill\nbody\n', '# Skill\nbody')).toBe('up-to-date');
  });

  it('classifies edited content as drifted', () => {
    expect(classifyContent('# Skill\nbody\nstale edit', '# Skill\nbody')).toBe('drifted');
  });

  it('classifies skills missing from the manifest as retired', () => {
    expect(classifyContent('# Skill\nbody', null)).toBe('retired');
  });

  it('derives slugs per target layout', () => {
    expect(slugFromEntry('t2000-pay', 'agents')).toBe('t2000-pay');
    expect(slugFromEntry('t2000-pay.mdc', 'cursor')).toBe('t2000-pay');
    expect(slugFromEntry('t2000-pay', 'claude-code')).toBe('t2000-pay');
  });
});
