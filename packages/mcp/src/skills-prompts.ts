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

// ---------------------------------------------------------------------------
// Live skill content (fresh without a CLI reinstall)
//
// Skill bodies are baked into the published package at build time, so a user
// on an old `@t2000/mcp` would otherwise see stale skills until they reinstall.
// To keep content fresh we fetch the live SKILL.md from t2000.ai when a prompt
// is invoked, and fall back to the baked body on any failure (offline, non-200,
// timeout). The baked body is therefore the floor, never a hard dependency.
//
// Lazy by design: the fetch fires on `prompts/get` (when a user actually runs
// `/skill-<name>`), NOT at server startup — so the wallet MCP has no startup
// network dependency. Cached per process. Opt out with `T2000_SKILLS_OFFLINE=1`.
// ---------------------------------------------------------------------------

const SKILLS_BASE_URL = process.env.T2000_SKILLS_URL ?? 'https://t2000.ai/skills';
const LIVE_FETCH_TIMEOUT_MS = 2500;
const liveBodyCache = new Map<string, string>();

/** Strip a leading YAML frontmatter block (`---\n…\n---`) to match the baked body. */
function stripFrontmatter(md: string): string {
  const m = md.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? md.slice(m[0].length).replace(/^\n+/, '') : md;
}

/**
 * Fetch the live skill body from `t2000.ai/skills/<name>`. Returns `null` on
 * any failure (caller falls back to the baked body). Cached per process.
 */
export async function fetchLiveSkillBody(name: string): Promise<string | null> {
  if (process.env.T2000_SKILLS_OFFLINE === '1') return null;
  const cached = liveBodyCache.get(name);
  if (cached !== undefined) return cached;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS);
    const res = await fetch(`${SKILLS_BASE_URL}/${name}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = stripFrontmatter(await res.text()).trim();
    if (!body) return null;
    liveBodyCache.set(name, body);
    return body;
  } catch {
    return null;
  }
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
      async () => {
        // Prefer the live body (fresh without a CLI reinstall); the baked body
        // is the offline / failure fallback.
        const live = await fetchLiveSkillBody(skill.name);
        return {
          messages: [{
            role: 'user' as const,
            content: { type: 'text' as const, text: live ?? skill.body },
          }],
        };
      },
    );
  }
}
