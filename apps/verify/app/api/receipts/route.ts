import { recentAnchors, totalAnchors } from "@/lib/anchor";

// GET /api/receipts — the public feed of anchored confidential receipts +
// the running total. Hashes only (no prompts, no identities). Cached briefly.
export async function GET() {
  const [receipts, total] = await Promise.all([
    recentAnchors(50),
    totalAnchors(),
  ]);
  return Response.json(
    { receipts, total: total.count, capped: total.capped },
    {
      headers: {
        "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}
