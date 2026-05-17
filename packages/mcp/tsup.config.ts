import { defineConfig } from 'tsup';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

// SPEC v0.7a Phase 6 (6C) — bake every t2000-skills/skills/*/SKILL.md into
// the bundle as a JSON string injected via `define`. The published npm
// package is fully self-contained — no runtime filesystem reads, no
// `__dirname` juju, no `files: [...]` gymnastics to copy markdown out
// of the sibling t2000-skills/ directory. Mirror of the `__MCP_PKG_VERSION__`
// pattern.
//
// Output shape: [{ name, description, body }] — see `skills-prompts.ts`.
// The parser handles `description: >-` multi-line folded scalars and the
// nested `metadata:` block in skill frontmatter; same shape as
// `t2000-skills/validate.ts`.
interface BakedSkill {
  name: string;
  description: string;
  body: string;
}

function bakeSkills(): BakedSkill[] {
  const skillsDir = resolve(__dirname, '../../t2000-skills/skills');
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const out: BakedSkill[] = [];
  for (const dir of dirs) {
    const path = join(skillsDir, dir, 'SKILL.md');
    const content = readFileSync(path, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      throw new Error(`[mcp/tsup] ${dir}/SKILL.md missing frontmatter`);
    }

    const fm = fmMatch[1];
    const bodyStart = content.indexOf('---', 4);
    const body = content.slice(bodyStart + 3).trim();

    // Extract `name:` and folded `description: >-` block.
    let name = '';
    let description = '';
    const lines = fm.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('name:')) {
        name = line.slice(5).trim();
      } else if (line.startsWith('description:')) {
        const after = line.slice(12).trim();
        if (after === '>-' || after === '>') {
          const acc: string[] = [];
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].startsWith('  ')) acc.push(lines[j].trim());
            else break;
          }
          description = acc.join(' ');
        } else {
          description = after;
        }
      }
    }

    if (!name) throw new Error(`[mcp/tsup] ${dir}/SKILL.md missing name`);
    if (!description) throw new Error(`[mcp/tsup] ${dir}/SKILL.md missing description`);
    if (body.length < 50) throw new Error(`[mcp/tsup] ${dir}/SKILL.md body too short`);

    out.push({ name, description, body });
  }
  return out;
}

const bakedSkills = bakeSkills();

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  // Inject the published package version so the MCP `serverInfo.version`
  // handshake reports the real npm version instead of a hardcoded string.
  define: {
    __MCP_PKG_VERSION__: JSON.stringify(pkg.version),
    __BAKED_SKILLS__: JSON.stringify(JSON.stringify(bakedSkills)),
  },
  // Bundle ALL deps so the MCP server is a self-contained binary. Mirrors the
  // CLI pattern. Critical because @t2000/sdk pulls in @naviprotocol/lending,
  // whose published ESM dist imports SuiClient/getFullnodeUrl from
  // @mysten/sui/client — names that don't exist in @mysten/sui@2.x. The
  // monorepo patches lending via pnpm but npm/npx consumers never get the
  // patch, so we bake the (patched) sources into our published bundle.
  noExternal: [/.*/],
  banner: {
    js: [
      `import { createRequire as __createRequire } from 'module';`,
      `import { fileURLToPath as __fileURLToPath } from 'url';`,
      `import { dirname as __pathDirname } from 'path';`,
      `const require = __createRequire(import.meta.url);`,
      `const __filename = __fileURLToPath(import.meta.url);`,
      `const __dirname = __pathDirname(__filename);`,
    ].join(' '),
  },
  onSuccess: `node -e "
    const fs = require('fs');
    const f = 'dist/bin.js';
    const code = fs.readFileSync(f, 'utf8').replace(/^#!.*\\n/gm, '');
    fs.writeFileSync(f, '#!/usr/bin/env node\\n' + code);
  "`,
});
