// Serves t2000-skills/brand/<file> at t2000.ai/skills/brand/<file> — the
// project marks referenced by feed.json. Third parties PR their mark next to
// their SKILL.md; no console deploy needed.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";

const FILE_PATTERN = /^[a-z0-9-]+\.(png|jpg|jpeg|svg|webp)$/;
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const here = dirname(fileURLToPath(import.meta.url));
const BRAND_DIR = join(here, "..", "..", "..", "..", "..", "..", "t2000-skills", "brand");

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<NextResponse> {
  const { file } = await params;
  if (!FILE_PATTERN.test(file)) {
    return new NextResponse("Not found.\n", { status: 404 });
  }
  try {
    const bytes = await readFile(join(BRAND_DIR, file));
    const ext = file.split(".").pop() as string;
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext],
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Not found.\n", { status: 404 });
  }
}
