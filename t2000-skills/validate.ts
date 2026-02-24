/**
 * Skill validation script.
 * Validates all SKILL.md files have required frontmatter fields and correct structure.
 *
 * Usage: npx tsx validate.ts
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
  status?: string;
  metadata?: {
    author?: string;
    version?: string;
    requires?: string;
    available?: boolean;
  };
}

const REQUIRED_FIELDS = ['name', 'description', 'license'] as const;
const REQUIRED_METADATA = ['author', 'version', 'requires'] as const;

function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = {};
  let inMetadata = false;

  for (const line of yaml.split('\n')) {
    if (line.trim() === '') continue;

    if (line === 'metadata:') {
      inMetadata = true;
      continue;
    }

    if (inMetadata && line.startsWith('  ')) {
      const [key, ...valueParts] = line.trim().split(':');
      const rawValue = valueParts.join(':').trim();
      metadata[key.trim()] = parseYamlValue(rawValue);
    } else {
      inMetadata = false;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const rawValue = line.slice(colonIdx + 1).trim();
      if (key === 'description' && rawValue === '>-') {
        const descLines: string[] = [];
        const allLines = yaml.split('\n');
        const startIdx = allLines.indexOf(line);
        for (let i = startIdx + 1; i < allLines.length; i++) {
          if (allLines[i].startsWith('  ')) {
            descLines.push(allLines[i].trim());
          } else {
            break;
          }
        }
        result[key] = descLines.join(' ');
      } else {
        result[key] = parseYamlValue(rawValue);
      }
    }
  }

  if (Object.keys(metadata).length > 0) {
    result.metadata = metadata;
  }

  return result as SkillFrontmatter;
}

function parseYamlValue(raw: string): string | boolean | number {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  return raw;
}

interface ValidationError {
  skill: string;
  field: string;
  message: string;
}

function validateSkill(skillDir: string, name: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const skillPath = join(skillDir, 'SKILL.md');

  if (!existsSync(skillPath)) {
    errors.push({ skill: name, field: 'file', message: 'SKILL.md file not found' });
    return errors;
  }

  const content = readFileSync(skillPath, 'utf-8');

  if (!content.startsWith('---')) {
    errors.push({ skill: name, field: 'frontmatter', message: 'Missing YAML frontmatter (must start with ---)' });
    return errors;
  }

  const fm = parseFrontmatter(content);
  if (!fm) {
    errors.push({ skill: name, field: 'frontmatter', message: 'Failed to parse YAML frontmatter' });
    return errors;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fm[field]) {
      errors.push({ skill: name, field, message: `Missing required field: ${field}` });
    }
  }

  if (fm.name && fm.name !== name) {
    errors.push({ skill: name, field: 'name', message: `Name mismatch: frontmatter says "${fm.name}" but directory is "${name}"` });
  }

  if (!fm.metadata) {
    errors.push({ skill: name, field: 'metadata', message: 'Missing metadata block' });
  } else {
    for (const field of REQUIRED_METADATA) {
      if (!fm.metadata[field]) {
        errors.push({ skill: name, field: `metadata.${field}`, message: `Missing required metadata field: ${field}` });
      }
    }
  }

  const bodyStart = content.indexOf('---', 4);
  if (bodyStart === -1) {
    errors.push({ skill: name, field: 'body', message: 'No content after frontmatter' });
    return errors;
  }

  const body = content.slice(bodyStart + 3).trim();
  if (body.length < 50) {
    errors.push({ skill: name, field: 'body', message: 'Skill body is too short (< 50 characters)' });
  }

  if (!body.startsWith('#')) {
    errors.push({ skill: name, field: 'body', message: 'Skill body should start with a heading (# ...)' });
  }

  return errors;
}

function validatePaySkillStatus(skillDir: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const skillPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillPath)) return errors;

  const content = readFileSync(skillPath, 'utf-8');
  const fm = parseFrontmatter(content);
  if (!fm) return errors;

  if (fm.status !== 'coming-soon') {
    errors.push({ skill: 't2000-pay', field: 'status', message: `Expected status "coming-soon" but got "${fm.status}"` });
  }

  if (fm.metadata?.available !== false) {
    errors.push({ skill: 't2000-pay', field: 'metadata.available', message: `Expected available: false but got ${fm.metadata?.available}` });
  }

  return errors;
}

function main() {
  const scriptDir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
  const skillsRoot = resolve(scriptDir, 'skills');
  if (!existsSync(skillsRoot)) {
    console.error('❌ skills/ directory not found');
    process.exit(1);
  }

  const skillDirs = readdirSync(skillsRoot).filter(d =>
    existsSync(join(skillsRoot, d, 'SKILL.md'))
  );

  if (skillDirs.length === 0) {
    console.error('❌ No skills found in skills/ directory');
    process.exit(1);
  }

  let totalErrors = 0;
  let totalSkills = 0;

  console.log(`\nValidating ${skillDirs.length} skills...\n`);

  for (const dir of skillDirs) {
    totalSkills++;
    const errors = validateSkill(join(skillsRoot, dir), dir);

    if (dir === 't2000-pay') {
      errors.push(...validatePaySkillStatus(join(skillsRoot, dir)));
    }

    if (errors.length === 0) {
      console.log(`  ✓ ${dir}`);
    } else {
      for (const err of errors) {
        console.error(`  ✗ ${dir} → [${err.field}] ${err.message}`);
        totalErrors++;
      }
    }
  }

  const expectedSkills = [
    't2000-check-balance',
    't2000-send',
    't2000-save',
    't2000-withdraw',
    't2000-swap',
    't2000-borrow',
    't2000-repay',
    't2000-pay',
  ];

  const missing = expectedSkills.filter(s => !skillDirs.includes(s));
  if (missing.length > 0) {
    for (const m of missing) {
      console.error(`  ✗ ${m} → [missing] Expected skill directory not found`);
      totalErrors++;
    }
  }

  console.log(`\n${totalSkills} skills validated, ${totalErrors} error(s)\n`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main();
