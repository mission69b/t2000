// Serves t2000-skills/AGENTS.md at t2000.ai/AGENTS.md.
//
// The cross-cutting agent-ops layer (payment-error recovery, free-first
// ordering, limits, no-charge-on-failure, async semantics) that the per-skill
// SKILL.md playbooks assume. Single source of truth: reads the repo file at
// request time; `next.config.ts`'s `outputFileTracingIncludes` pulls it into
// the Vercel function bundle. Raw markdown so `curl -sL` / LLMs ingest it.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";

const here = dirname(fileURLToPath(import.meta.url));
const AGENTS_PATH = join(here, "..", "..", "..", "..", "t2000-skills", "AGENTS.md");

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET(): Promise<NextResponse> {
  try {
    const content = await readFile(AGENTS_PATH, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Robots-Tag": "all",
      },
    });
  } catch (err) {
    console.error("[AGENTS.md] read failed:", err);
    return new NextResponse("Internal error.\n", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
