// ---------------------------------------------------------------------------
// compose-skills.ts — skill-composition helpers for workflow prompts
// ---------------------------------------------------------------------------
//
// SPEC v0.7a Phase 6G — `prompts.ts` workflow prompts compose against the
// 14 baked SKILL.md bodies in `skills-prompts.ts`, eliminating the prose
// duplication that existed pre-6G (where "how to call balance_check +
// savings_info + health_check" lived in both `t2000-account-report/SKILL.md`
// AND inline in the `financial-report` prompt).
//
// Two helpers, intentionally narrow:
//
// • `composeSkillBody(name)` — returns the full markdown body for a skill
//   by its FULL frontmatter name (`t2000-account-report`). Used when the
//   workflow prompt wants the whole skill substance (e.g. `safeguards`
//   prompt IS basically the `t2000-safeguards` skill).
//
// • `composeSkillSections(name, headers)` — returns only the requested
//   `## Header` blocks in skill order, concatenated. Used when the
//   workflow prompt only needs a specific slice (e.g. `risk-check`
//   needs the borrow skill's "Pre-borrow safety check" section but
//   not the CLI command syntax).
//
// Failure mode: both helpers throw on unknown skill / unknown section.
// Workflow prompts SHOULD let the throw propagate — a missing skill
// signals a typo or a deleted skill that the prompt forgot to update,
// which we want to fail loudly at MCP server start (the skill list is
// known at boot via `getBakedSkills()`).
// ---------------------------------------------------------------------------

import { getBakedSkills, type SkillData } from './skills-prompts.js';

// ---------------------------------------------------------------------------
// Internal — skill lookup with helpful error message
// ---------------------------------------------------------------------------

function findSkill(name: string, skills: SkillData[]): SkillData {
  const skill = skills.find((s) => s.name === name);
  if (!skill) {
    const available = skills.map((s) => s.name).sort().join(', ');
    throw new Error(
      `[compose-skills] Unknown skill '${name}'. Available skills: ${available}.`,
    );
  }
  return skill;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComposeOptions {
  /**
   * Pass a custom skills array (used by tests to inject fixtures
   * without touching the baked bundle).
   */
  skills?: SkillData[];
}

/** Return the full markdown body for `skillName`. Throws if unknown. */
export function composeSkillBody(
  skillName: string,
  opts: ComposeOptions = {},
): string {
  const skills = opts.skills ?? getBakedSkills();
  return findSkill(skillName, skills).body;
}

/**
 * Return only the requested `## Header` blocks from `skillName`, in
 * skill source order (NOT in the order the caller listed them — that
 * way the result reads top-to-bottom like the original skill).
 *
 * Header matching is case-sensitive on the trimmed header text. So
 * `'Engine orchestration'` matches `## Engine orchestration` but
 * NOT `## Engine Orchestration` or `### Engine orchestration`.
 *
 * Throws if `skillName` is unknown OR if any requested header isn't
 * present in the skill body (typos should fail loudly at boot, not
 * silently emit an empty prompt).
 */
export function composeSkillSections(
  skillName: string,
  headers: string[],
  opts: ComposeOptions = {},
): string {
  const skills = opts.skills ?? getBakedSkills();
  const skill = findSkill(skillName, skills);
  if (headers.length === 0) {
    throw new Error(
      `[compose-skills] composeSkillSections('${skillName}', []): pass at least one header.`,
    );
  }

  // Parse body into { header, content } blocks. Anything BEFORE the
  // first `## ` line is dropped (it's usually the `# Title` H1 + a
  // brief intro). H3+ stay nested inside their parent H2 block.
  const sections = parseSections(skill.body);
  const headerSet = new Set(headers);
  const missing = headers.filter(
    (h) => !sections.some((s) => s.header === h),
  );
  if (missing.length > 0) {
    const available = sections.map((s) => s.header).join(', ');
    throw new Error(
      `[compose-skills] Skill '${skillName}' is missing sections: ${missing.join(', ')}. Available sections: ${available}.`,
    );
  }

  return sections
    .filter((s) => headerSet.has(s.header))
    .map((s) => `## ${s.header}\n${s.content}`)
    .join('\n')
    .trimEnd();
}

// ---------------------------------------------------------------------------
// Internal — split a skill body into `## Header` blocks
// ---------------------------------------------------------------------------

interface Section {
  /** Trimmed header text — `'Engine orchestration'` for `## Engine orchestration`. */
  header: string;
  /** Body BELOW the header line, up to (but not including) the next `## ` line. */
  content: string;
}

function parseSections(body: string): Section[] {
  const lines = body.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    // Match `## Header text` but NOT `### Subheader` or `#Header` (no space).
    const match = /^## (?!#)(.+)$/.exec(line);
    if (match) {
      if (current) sections.push(current);
      current = { header: match[1]!.trim(), content: '' };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line;
    }
  }
  if (current) sections.push(current);

  // Trim trailing blank lines per block so concatenation doesn't
  // accumulate runs of empty lines between sections.
  return sections.map((s) => ({
    header: s.header,
    content: s.content.replace(/\n+$/, ''),
  }));
}
