// [SPEC_AGENTIC_STACK Phase 3 — 2026-05-25]
// Serves t2000-skills/skills/<slug>/SKILL.md at t2000.ai/skills/<slug>.
//
// Single source of truth: reads from the repo's `t2000-skills/` folder at
// request time. NO copies, NO sync script — `next.config.ts`'s
// `outputFileTracingIncludes` pulls the markdown files into the Vercel
// function bundle so this read works in production.
//
// Content-Type is `text/markdown; charset=utf-8` so `curl -sL` returns raw
// markdown that LLMs can ingest directly via the one-prompt install flow.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";

const SKILL_SLUG_PATTERN = /^[a-z0-9-]+$/;

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(here, "..", "..", "..", "..", "..", "t2000-skills", "skills");

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;

  if (!SKILL_SLUG_PATTERN.test(slug)) {
    return new NextResponse("Skill not found.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const path = join(SKILLS_DIR, slug, "SKILL.md");
    const content = await readFile(path, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Robots-Tag": "all",
      },
    });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return new NextResponse(
        `Skill "${slug}" not found.\n\nBrowse the manifest: https://t2000.ai/.well-known/agent-skills/index.json\n`,
        {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }
    console.error(`[skills/${slug}] read failed:`, err);
    return new NextResponse("Internal error.\n", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
