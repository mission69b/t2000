// [SPEC_AGENTIC_STACK Phase 3 — 2026-05-25]
// Serves the Agent Skills manifest at
// `t2000.ai/.well-known/agent-skills/index.json` — a Circle-compatible
// directory of every skill in `t2000-skills/skills/`.
//
// Generated at build time (force-static + revalidate) by reading SKILL.md
// frontmatter from the canonical source. No yaml dependency — parsed with
// a tiny regex that's sufficient for our flat frontmatter shape.
//
// Used by:
//   - AI clients that discover available skills via .well-known/
//   - The one-prompt install flow (LLM hits this manifest to know what
//     skills exist beyond the t2000-setup entry point).
import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";

interface SkillManifestEntry {
  name: string;
  description: string;
  url: string;
  version: string;
  license: string;
}

interface SkillsManifest {
  version: string;
  name: string;
  description: string;
  homepage: string;
  generated: string;
  skills: SkillManifestEntry[];
}

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(here, "..", "..", "..", "..", "..", "..", "t2000-skills", "skills");
const BASE_URL = "https://t2000.ai";

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET(): Promise<NextResponse> {
  try {
    const entries = await readdir(SKILLS_DIR);
    const skills: SkillManifestEntry[] = [];

    for (const slug of entries.sort()) {
      const skillPath = join(SKILLS_DIR, slug);
      const skillFile = join(skillPath, "SKILL.md");
      let s;
      try {
        s = await stat(skillPath);
      } catch {
        continue;
      }
      if (!s.isDirectory()) continue;

      let raw: string;
      try {
        raw = await readFile(skillFile, "utf-8");
      } catch {
        continue;
      }

      const parsed = parseFrontmatter(raw);
      if (!parsed) continue;

      skills.push({
        name: parsed.name ?? slug,
        description: parsed.description ?? "",
        url: `${BASE_URL}/skills/${slug}`,
        version: parsed.version ?? "1.0",
        license: parsed.license ?? "MIT",
      });
    }

    const manifest: SkillsManifest = {
      version: "1",
      name: "t2000-skills",
      description:
        "Agent Skills for the t2000 Agentic Wallet on Sui. Install once and your AI agent gains the ability to check balances, send payments, earn yield, borrow, swap, and pay for MPP API services — all on Sui.",
      homepage: BASE_URL,
      generated: new Date().toISOString(),
      skills,
    };

    return NextResponse.json(manifest, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Robots-Tag": "all",
      },
    });
  } catch (err) {
    console.error("[.well-known/agent-skills/index.json] read failed:", err);
    return NextResponse.json(
      { error: "manifest_unavailable" },
      { status: 500 },
    );
  }
}

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  license?: string;
}

function parseFrontmatter(raw: string): ParsedFrontmatter | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const body = match[1];
  const out: ParsedFrontmatter = {};
  const lines = body.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!kv) {
      i += 1;
      continue;
    }
    const key = kv[1];
    const rawValue = kv[2].trim();

    if (key === "metadata") {
      i += 1;
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        const meta = lines[i].match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
        if (meta && meta[1] === "version") {
          out.version = stripQuotes(meta[2].trim());
        }
        i += 1;
      }
      continue;
    }

    let value: string;
    if (rawValue === "" || rawValue === ">-" || rawValue === ">") {
      const folded: string[] = [];
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        if (/^\S/.test(next)) break;
        folded.push(next.trim());
        i += 1;
      }
      value = folded.join(" ").trim();
    } else {
      value = stripQuotes(rawValue);
      i += 1;
    }

    if (key === "name") out.name = value;
    if (key === "description") out.description = value;
    if (key === "license") out.license = value;
  }

  return out;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
