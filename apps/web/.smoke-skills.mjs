// Smoke test for the path resolution + file existence used by the
// /skills/[slug] route. Cannot import the route module directly because
// it depends on Next.js runtime (NextResponse).
import { readdir, readFile, access, constants } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirror the route file's path resolution:
//   apps/web/app/skills/[slug]/route.ts
// joined with: ../../../../../../t2000-skills/skills
const ROUTE_FILE = resolve('app/skills/[slug]/route.ts');
const ROUTE_DIR = dirname(ROUTE_FILE);
const SKILLS_DIR = join(ROUTE_DIR, '..', '..', '..', '..', '..', 't2000-skills', 'skills');

console.log('Route file:', ROUTE_FILE);
console.log('Skills dir:', SKILLS_DIR);

try {
  await access(SKILLS_DIR, constants.R_OK);
  console.log('✓ Skills directory readable');
} catch (err) {
  console.error('✗ Skills directory NOT readable:', err.message);
  process.exit(1);
}

const slugs = await readdir(SKILLS_DIR);
console.log(`✓ Found ${slugs.length} skill slugs`);

const expectedNew = ['t2000-setup', 't2000-swap', 't2000-stake', 't2000-yields'];
for (const slug of expectedNew) {
  if (!slugs.includes(slug)) {
    console.error(`✗ Missing new skill: ${slug}`);
    process.exit(1);
  }
  const content = await readFile(join(SKILLS_DIR, slug, 'SKILL.md'), 'utf-8');
  const hasFrontmatter = content.startsWith('---\n');
  const hasName = /^name:\s*t2000-/m.test(content);
  console.log(`  ${slug}: ${content.length} chars, frontmatter=${hasFrontmatter}, name=${hasName}`);
}

// Verify the 5 skills that got Rules blocks
const expectedRules = ['t2000-save', 't2000-borrow', 't2000-send', 't2000-repay', 't2000-withdraw'];
for (const slug of expectedRules) {
  const content = await readFile(join(SKILLS_DIR, slug, 'SKILL.md'), 'utf-8');
  const hasRules = /^## Rules$/m.test(content);
  if (!hasRules) {
    console.error(`✗ ${slug} missing Rules block`);
    process.exit(1);
  }
  console.log(`  ${slug}: Rules block ✓`);
}

console.log('\nAll checks passed.');
