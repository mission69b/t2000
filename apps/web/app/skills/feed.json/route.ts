// Serves t2000-skills/feed.json at t2000.ai/skills/feed.json — the machine-
// readable skills shelf (projects → skills) that agents.t2000.ai renders.
// Same single-source pattern as /skills/[slug]: read from the repo folder at
// request time; `outputFileTracingIncludes` bundles it for Vercel.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";

const here = dirname(fileURLToPath(import.meta.url));
const FEED_PATH = join(here, "..", "..", "..", "..", "..", "t2000-skills", "feed.json");

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET(): Promise<NextResponse> {
  try {
    const content = await readFile(FEED_PATH, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Feed unavailable." }, { status: 500 });
  }
}
