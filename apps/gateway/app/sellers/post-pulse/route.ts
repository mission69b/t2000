import { round } from '@/lib/seed-kit';
import { paymentRequired, verifyDelivery } from '@/lib/sellers';
import { fetchXPost, parseXPostUrl } from '@/lib/x-proof';

// Gateway-hosted seller: X post engagement read (S.624 Shelf v4).
// Reads X's public syndication CDN (same keyless lane as the x-proof tasks) —
// no login, no API key, public posts only.
export const dynamic = 'force-dynamic';

async function handle(req: Request): Promise<Response> {
  if (!verifyDelivery(req)) {
    return paymentRequired();
  }

  let postUrl = new URL(req.url).searchParams.get('postUrl') ?? '';
  if (!postUrl && req.method === 'POST') {
    try {
      const body = (await req.json()) as { postUrl?: string };
      postUrl = body.postUrl ?? '';
    } catch {
      // fall through to the input error
    }
  }
  const postId = parseXPostUrl(postUrl);
  if (!postId) {
    return Response.json(
      { error: 'Pass a post: {"postUrl":"https://x.com/user/status/…"}.' },
      { status: 400 },
    );
  }

  const post = await fetchXPost(postId);
  if (!post) {
    return Response.json(
      { error: 'Could not read that post — it must be public (not deleted, not a protected account).' },
      { status: 400 },
    );
  }

  // Engagement counts ride the same syndication payload fetchXPost parses —
  // fetch the raw counts directly for the fields x-proof doesn't need.
  let likes: number | null = null;
  let replies: number | null = null;
  try {
    const token = ((Number(postId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${postId}&token=${token}`,
      { headers: { accept: 'application/json' }, next: { revalidate: 60 } },
    );
    if (res.ok) {
      const raw = (await res.json()) as {
        favorite_count?: number;
        conversation_count?: number;
      };
      likes = raw.favorite_count ?? null;
      replies = raw.conversation_count ?? null;
    }
  } catch {
    // counts stay null → gap
  }
  const gaps = likes === null ? ['engagement counts unavailable'] : [];

  const ageHours = post.createdAt
    ? Math.max((Date.now() - post.createdAt.getTime()) / 3_600_000, 0.1)
    : null;
  const likesPerHour =
    likes !== null && ageHours !== null ? round(likes / ageHours, 2) : null;

  let performance: 'quiet' | 'steady' | 'hot' | 'viral' | 'unknown';
  if (likesPerHour === null) {
    performance = 'unknown';
  } else if (likesPerHour >= 500) {
    performance = 'viral';
  } else if (likesPerHour >= 50) {
    performance = 'hot';
  } else if (likesPerHour >= 5) {
    performance = 'steady';
  } else {
    performance = 'quiet';
  }

  return Response.json({
    report: 'post-pulse',
    generatedAt: new Date().toISOString(),
    method:
      'X public syndication data for one post: likes + replies, age, likes-per-hour velocity. Performance: viral ≥ 500 likes/h, hot ≥ 50, steady ≥ 5, else quiet. Velocity favors young posts by construction (disclosed); retweet/bookmark counts are not public on this lane and are NOT estimated. Public posts only.',
    source: 'X public syndication data',
    performance,
    post: {
      author: `@${post.handle}`,
      postedAt: post.createdAt?.toISOString() ?? null,
      ageHours: ageHours === null ? null : round(ageHours, 1),
      textPreview: post.text.slice(0, 140),
    },
    engagement: {
      likes,
      replies,
      likesPerHour,
    },
    dataGaps: gaps,
    read:
      likes === null
        ? `Post by @${post.handle} read, but engagement counts were unavailable — no performance call made.`
        : `@${post.handle}'s post: ${likes} likes, ${replies ?? 'n/a'} replies in ${ageHours === null ? 'n/a' : round(ageHours, 1)}h (${likesPerHour}/h) → ${performance}.`,
  });
}

export function GET(req: Request) {
  return handle(req);
}
export function POST(req: Request) {
  return handle(req);
}
