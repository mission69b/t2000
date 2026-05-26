// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 5 — 2026-05-26]
// Tests for the pure helpers of `t2 skills`. Migrated from the
// pre-pivot `commands/skills.test.ts` (deleted) — same coverage
// targeting the new module location.

import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  resolveTargetDir,
  filenameForTarget,
  transformForTarget,
  resolveSkillTarget,
  isManagedSkillName,
  SKILL_TARGETS,
} from './lib.js';

describe('resolveSkillTarget', () => {
  it('defaults to agents when input is omitted', () => {
    expect(resolveSkillTarget(undefined)).toBe('agents');
  });

  it('accepts agents', () => {
    expect(resolveSkillTarget('agents')).toBe('agents');
  });

  it('accepts cursor', () => {
    expect(resolveSkillTarget('cursor')).toBe('cursor');
  });

  it('accepts claude-code', () => {
    expect(resolveSkillTarget('claude-code')).toBe('claude-code');
  });

  it('throws for unknown targets with a clear list', () => {
    expect(() => resolveSkillTarget('vim')).toThrow(/agents, cursor, claude-code/);
    expect(() => resolveSkillTarget('windsurf')).toThrow(/agents, cursor, claude-code/);
  });

  it('SKILL_TARGETS contains exactly agents + cursor + claude-code', () => {
    expect(SKILL_TARGETS).toEqual(['agents', 'cursor', 'claude-code']);
  });
});

describe('resolveTargetDir', () => {
  it('agents target resolves under .agents/skills/', () => {
    expect(resolveTargetDir('agents', false, '/some/cwd')).toBe('/some/cwd/.agents/skills');
  });

  it('cursor target resolves under .cursor/rules/', () => {
    expect(resolveTargetDir('cursor', false, '/some/cwd')).toBe('/some/cwd/.cursor/rules');
  });

  it('claude-code target resolves under .claude/skills/', () => {
    expect(resolveTargetDir('claude-code', false, '/some/cwd')).toBe('/some/cwd/.claude/skills');
  });

  it('--global resolves under homedir', () => {
    expect(resolveTargetDir('agents', true)).toBe(join(homedir(), '.agents', 'skills'));
  });
});

describe('filenameForTarget', () => {
  it('agents uses <slug>/SKILL.md', () => {
    expect(filenameForTarget('t2000-balance', 'agents')).toBe(join('t2000-balance', 'SKILL.md'));
  });

  it('claude-code uses <slug>/SKILL.md', () => {
    expect(filenameForTarget('t2000-balance', 'claude-code')).toBe(
      join('t2000-balance', 'SKILL.md'),
    );
  });

  it('cursor uses flat <slug>.mdc', () => {
    expect(filenameForTarget('t2000-balance', 'cursor')).toBe('t2000-balance.mdc');
  });
});

describe('transformForTarget', () => {
  const body = '---\nname: t2000-balance\ndescription: Show your wallet balance\n---\n\nUse `t2 balance`.';

  it('passes content through for agents target', () => {
    expect(transformForTarget(body, 'agents', 'desc')).toBe(body);
  });

  it('passes content through for claude-code target', () => {
    expect(transformForTarget(body, 'claude-code', 'desc')).toBe(body);
  });

  it('rewrites frontmatter for cursor with the supplied description', () => {
    const result = transformForTarget(body, 'cursor', 'Show wallet balance');
    expect(result).toMatch(/^---\ndescription: "Show wallet balance"\nalwaysApply: false\n---\n/);
    expect(result).toContain('Use `t2 balance`.');
  });

  it('escapes quotes in description (JSON-stringified)', () => {
    const result = transformForTarget(body, 'cursor', 'Has "quotes"');
    expect(result).toMatch(/description: "Has \\"quotes\\""/);
  });
});

describe('isManagedSkillName', () => {
  it('returns true for t2000- prefix', () => {
    expect(isManagedSkillName('t2000-balance')).toBe(true);
    expect(isManagedSkillName('t2000-send')).toBe(true);
  });

  it('returns true for mpp- prefix', () => {
    expect(isManagedSkillName('mpp-image-gen')).toBe(true);
  });

  it('returns false for unrelated names', () => {
    expect(isManagedSkillName('audric-skill')).toBe(false);
    expect(isManagedSkillName('other')).toBe(false);
    expect(isManagedSkillName('')).toBe(false);
  });
});
