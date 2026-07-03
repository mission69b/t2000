// Keyless X (Twitter) post verification for x-proof tasks. Reads the post's
// text/author/date server-side from X's public syndication CDN — the same
// endpoint react-tweet uses (no API key, no OAuth, no scrape). Nothing here
// trusts the claimant: the post content is fetched fresh and checked
// structurally by the claim route.

/** The mention every x-proof post must contain (case-insensitive). */
export const X_MENTION = '@audricai';

export type XPost = {
  id: string;
  /** Author screen_name, lowercase — the sybil-dedupe dimension. */
  handle: string;
  text: string;
  createdAt: Date | null;
};

const STATUS_URL_RE =
  /(?:^|\/\/|\.)(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status(?:es)?\/(\d{1,25})/i;

/** Extract the numeric status id from an x.com / twitter.com post URL. */
export function parseXPostUrl(raw: string): string | null {
  const match = raw.trim().match(STATUS_URL_RE);
  return match ? match[1] : null;
}

/** react-tweet's token derivation for the public syndication CDN. */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, '');
}

/** Fetch a public post. Returns null when it doesn't exist, is protected,
 *  was deleted, or the response isn't a plain Tweet. */
export async function fetchXPost(id: string): Promise<XPost | null> {
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  let json: {
    __typename?: string;
    text?: string;
    created_at?: string;
    user?: { screen_name?: string };
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return null;
  }
  if (
    json.__typename !== 'Tweet' ||
    typeof json.text !== 'string' ||
    !json.user?.screen_name
  ) {
    return null;
  }
  return {
    id,
    handle: json.user.screen_name.toLowerCase(),
    text: json.text,
    createdAt: json.created_at ? new Date(json.created_at) : null,
  };
}
