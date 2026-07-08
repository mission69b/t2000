import { upstreamDown } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';

// Gateway-hosted seller: the HN front page as 12 CLEAN stories (S.670 —
// the §6b quality pass; replaces the raw-Algolia wrap so the delivery
// matches the listing copy: title · url · points · comments, no noise).
export const dynamic = 'force-dynamic';

const HN_API =
  'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=12';

type Hit = {
  title?: string;
  url?: string | null;
  points?: number;
  num_comments?: number;
  objectID?: string;
};

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  let hits: Hit[];
  try {
    const res = await fetch(HN_API, { next: { revalidate: 120 } });
    if (!res.ok) {
      throw new Error(`algolia ${res.status}`);
    }
    const json = (await res.json()) as { hits?: Hit[] };
    hits = json.hits ?? [];
  } catch {
    return upstreamDown('Hacker News (Algolia)');
  }
  if (hits.length === 0) {
    return upstreamDown('Hacker News (Algolia) — empty front page');
  }

  const stories = hits.slice(0, 12).map((h, i) => ({
    rank: i + 1,
    title: h.title ?? '(untitled)',
    // Ask HN / Show HN posts have no external URL — link the discussion.
    url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
    points: h.points ?? 0,
    comments: h.num_comments ?? 0,
    discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
  }));

  return Response.json({
    report: 'hn-front-page',
    generatedAt: new Date().toISOString(),
    method:
      'Hacker News front page (official Algolia API), shaped to rank/title/url/points/comments. Snapshot at call time.',
    stories,
    read: `Top of HN: "${stories[0]?.title}" (${stories[0]?.points} points, ${stories[0]?.comments} comments).`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
