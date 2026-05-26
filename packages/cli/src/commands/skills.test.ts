// [SPEC_AGENTIC_STACK P3 followup / S.325 — 2026-05-26]
// Unit tests for the pure helpers of `t2000 skills install`. The fetch /
// fs-touching action handlers are integration-level — exercise the parser
// + path-resolution logic that's the bug-prone surface.
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
} from './skills.js';

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
  it('agents (local) → <cwd>/.agents/skills', () => {
    expect(resolveTargetDir('agents', false, '/tmp/proj')).toBe('/tmp/proj/.agents/skills');
  });

  it('agents (global) → ~/.agents/skills', () => {
    expect(resolveTargetDir('agents', true)).toBe(join(homedir(), '.agents', 'skills'));
  });

  it('cursor (local) → <cwd>/.cursor/rules', () => {
    expect(resolveTargetDir('cursor', false, '/tmp/proj')).toBe('/tmp/proj/.cursor/rules');
  });

  it('cursor (global) → ~/.cursor/rules', () => {
    expect(resolveTargetDir('cursor', true)).toBe(join(homedir(), '.cursor', 'rules'));
  });

  it('claude-code (local) → <cwd>/.claude/skills', () => {
    expect(resolveTargetDir('claude-code', false, '/tmp/proj')).toBe('/tmp/proj/.claude/skills');
  });

  it('claude-code (global) → ~/.claude/skills', () => {
    expect(resolveTargetDir('claude-code', true)).toBe(join(homedir(), '.claude', 'skills'));
  });
});

describe('filenameForTarget', () => {
  it('agents → <slug>/SKILL.md (agentskills.io standard)', () => {
    expect(filenameForTarget('t2000-borrow', 'agents')).toBe(join('t2000-borrow', 'SKILL.md'));
  });

  it('claude-code → <slug>/SKILL.md', () => {
    expect(filenameForTarget('t2000-borrow', 'claude-code')).toBe(join('t2000-borrow', 'SKILL.md'));
  });

  it('cursor → <slug>.mdc (flat file, Cursor convention)', () => {
    expect(filenameForTarget('t2000-borrow', 'cursor')).toBe('t2000-borrow.mdc');
  });
});

describe('transformForTarget', () => {
  const sample = [
    '---',
    'name: t2000-borrow',
    'description: >-',
    '  Borrow USDC...',
    'license: MIT',
    '---',
    '',
    '# Borrow body',
    'Some content.',
  ].join('\n');

  it('agents passes content through unchanged', () => {
    expect(transformForTarget(sample, 'agents', 'desc')).toBe(sample);
  });

  it('claude-code passes content through unchanged', () => {
    expect(transformForTarget(sample, 'claude-code', 'desc')).toBe(sample);
  });

  it('cursor strips agentskills frontmatter and prepends Cursor .mdc header', () => {
    const out = transformForTarget(sample, 'cursor', 'My description');
    expect(out).toMatch(/^---\n/);
    expect(out).toContain('description: "My description"');
    expect(out).toContain('alwaysApply: false');
    expect(out).toContain('# Borrow body');
    expect(out).not.toContain('license: MIT');
    expect(out).not.toContain('name: t2000-borrow');
  });

  it('cursor preserves the body verbatim (no markdown corruption)', () => {
    const out = transformForTarget(sample, 'cursor', 'desc');
    expect(out).toContain('# Borrow body\nSome content.');
  });

  it('cursor escapes quotes in description via JSON.stringify', () => {
    const out = transformForTarget(sample, 'cursor', 'Has "quotes" inside');
    expect(out).toContain('description: "Has \\"quotes\\" inside"');
  });

  it('cursor handles CRLF line endings', () => {
    const crlf = sample.replace(/\n/g, '\r\n');
    const out = transformForTarget(crlf, 'cursor', 'desc');
    expect(out).toContain('# Borrow body');
    expect(out).not.toContain('license: MIT');
  });
});

describe('isManagedSkillName', () => {
  it('recognizes t2000- prefixed skills', () => {
    expect(isManagedSkillName('t2000-borrow')).toBe(true);
    expect(isManagedSkillName('t2000-save')).toBe(true);
    expect(isManagedSkillName('t2000-setup')).toBe(true);
  });

  it('recognizes mpp- prefixed skills (P4 — MPP recipes)', () => {
    expect(isManagedSkillName('mpp-image-gen')).toBe(true);
    expect(isManagedSkillName('mpp-gpt4o')).toBe(true);
    expect(isManagedSkillName('mpp-transcription')).toBe(true);
    expect(isManagedSkillName('mpp-index')).toBe(true);
  });

  it('rejects unrelated names (uninstall safety)', () => {
    expect(isManagedSkillName('my-custom-skill')).toBe(false);
    expect(isManagedSkillName('SKILL.md')).toBe(false);
    expect(isManagedSkillName('node_modules')).toBe(false);
    expect(isManagedSkillName('audric-foo')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isManagedSkillName('')).toBe(false);
  });
});
