// ---------------------------------------------------------------------------
// test-load-skills.ts — load SKILL.md files from disk for vitest
// ---------------------------------------------------------------------------
//
// At PRODUCTION runtime, `getBakedSkills()` reads from the `__BAKED_SKILLS__`
// define-injection that tsup performs at build time (see `tsup.config.ts`).
// During vitest, tsup never runs, so the define is absent and the symbol
// resolves to `[]`. This helper mirrors the baker logic so tests can pass
// the SAME data to `registerPrompts({ skills })` and
// `registerSkillPrompts(server, skills)`.
//
// NOT exported from `src/index.ts` — test-only utility. Keeping it next
// to its consumers (prompts.test.ts, integration.test.ts) avoids
// publishing test infrastructure to npm.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import type { SkillData } from './skills-prompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load every `t2000-skills/skills/*‍/SKILL.md` body. Same parsing rules
 * as `tsup.config.ts:bakeSkills()` — kept in sync by convention; if
 * they ever drift, the integration test will catch it because the
 * baked-bundle smoke probe runs the same way.
 */
export function loadSkillsFromDisk(): SkillData[] {
  const skillsDir = resolve(__dirname, '../../../t2000-skills/skills');
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const out: SkillData[] = [];
  for (const dir of dirs) {
    const path = join(skillsDir, dir, 'SKILL.md');
    const content = readFileSync(path, 'utf8');
    const fmMatch = /^---\n([\s\S]*?)\n---/.exec(content);
    if (!fmMatch) {
      throw new Error(`[test-load-skills] ${dir}/SKILL.md missing frontmatter`);
    }

    const fm = fmMatch[1]!;
    const bodyStart = content.indexOf('---', 4);
    const body = content.slice(bodyStart + 3).trim();

    let name = '';
    let description = '';
    const lines = fm.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.startsWith('name:')) {
        name = line.slice(5).trim();
      } else if (line.startsWith('description:')) {
        const after = line.slice(12).trim();
        if (after === '>-' || after === '>') {
          const acc: string[] = [];
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j]!.startsWith('  ')) acc.push(lines[j]!.trim());
            else break;
          }
          description = acc.join(' ');
        } else {
          description = after;
        }
      }
    }

    if (!name) throw new Error(`[test-load-skills] ${dir}/SKILL.md missing name`);
    if (!description) throw new Error(`[test-load-skills] ${dir}/SKILL.md missing description`);

    out.push({ name, description, body });
  }
  return out;
}
