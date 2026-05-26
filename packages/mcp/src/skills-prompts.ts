import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Skill data baked into the bundle at build time by `tsup.config.ts`.
 *
 * The published `@t2000/mcp` npm package carries every
 * `t2000-skills/skills/*‍/SKILL.md` body inline as a JSON string —
 * no runtime filesystem reads, no `files: [...]` gymnastics, no
 * sibling-directory path resolution. Cursor / Claude Desktop /
 * claude-code CLI pull `@t2000/mcp@latest` via npx and get every
 * skill registered as an MCP prompt named `skill-<short-name>`.
 *
 * Schema: `[{ name, description, body }]`.
 *
 * SPEC v0.7a Phase 6 (6C) — locked at HYBRID (D-2 c + D-4 a). This was
 * originally the companion to a hand-rolled `prompts.ts` workflow prompt
 * set; that file was deleted in S.336 (every workflow prompt composed
 * against deleted v3 DeFi skills). Auto-registered `skill-<name>` prompts
 * are now the entire prompt surface — one per local SKILL.md.
 */
declare const __BAKED_SKILLS__: string;

export interface SkillData {
  /** Frontmatter `name:` field, e.g. `t2000-borrow`. */
  name: string;
  /** Frontmatter `description:` block (folded `>-` resolved to single line). */
  description: string;
  /** Markdown body BELOW the `---` frontmatter — the prompt content. */
  body: string;
}

let cachedSkills: SkillData[] | null = null;

/**
 * Read the baked skills array from the bundle's define-injected JSON.
 * Returns `[]` during typecheck / dev runs that don't go through tsup
 * (the `__BAKED_SKILLS__` symbol won't exist).
 */
export function getBakedSkills(): SkillData[] {
  if (cachedSkills) return cachedSkills;
  const raw = typeof __BAKED_SKILLS__ === 'string' ? __BAKED_SKILLS__ : '[]';
  cachedSkills = JSON.parse(raw) as SkillData[];
  return cachedSkills;
}

/**
 * Convert a skill name like `t2000-send` to the MCP prompt name
 * `skill-send`. The `t2000-` prefix is stripped because every skill
 * already lives in the `@t2000/mcp` server's namespace — doubling it
 * produces clunky slash-commands like `/skill-t2000-send`. The
 * `skill-` prefix originally avoided collision with hand-rolled workflow
 * prompts (deleted in S.336); it's retained for stable client UX
 * (existing slash-command bindings keep working post-pivot).
 */
export function toPromptName(skillName: string): string {
  return `skill-${skillName.replace(/^t2000-/, '')}`;
}

/**
 * Register every baked skill as an MCP prompt. Each prompt resolves to
 * the skill body markdown wrapped in a `user`-role text message, which
 * is what the MCP `prompts/get` JSON-RPC method returns to the client.
 *
 * Pass a custom `skills` array for tests; defaults to the baked data.
 *
 * Naming: skill `t2000-borrow` → prompt `skill-borrow`. See
 * `toPromptName` for the rule.
 */
export function registerSkillPrompts(
  server: McpServer,
  skills: SkillData[] = getBakedSkills(),
): void {
  for (const skill of skills) {
    const promptName = toPromptName(skill.name);
    server.prompt(
      promptName,
      skill.description,
      async () => ({
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: skill.body },
        }],
      }),
    );
  }
}
