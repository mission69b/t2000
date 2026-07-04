import { env } from '@/lib/env';
import { DELIVERY_AUTH_HEADER, signDelivery } from '@/lib/sellers';

// Shared plumbing for gateway-hosted seed sellers (§II.17 Shelf v4, S.624).
// Factored at 30 seeds because the LOGIC repeats (upstream fetch with braced
// error text, symbol-input parsing, CMC auth) — the report shapes stay
// per-route on purpose (each read IS the product).

/** JSON fetch with upstream-tagged errors + short revalidate cache. */
export async function getJson<T>(
  url: string,
  opts?: { revalidate?: number; headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', ...(opts?.headers ?? {}) },
    next: { revalidate: opts?.revalidate ?? 600 },
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).host} ${res.status}`);
  }
  return (await res.json()) as T;
}

/** CMC Pro API fetch (derived-report usage on our own key — founder decision
 *  of record S.623, §II.17). Throws when the key is unset. */
export async function cmcJson<T>(path: string, revalidate = 900): Promise<T> {
  if (!env.CMC_API_KEY) {
    throw new Error('CMC key not configured');
  }
  const json = await getJson<T & { status?: { error_code?: number | string } }>(
    `https://pro-api.coinmarketcap.com${path}`,
    {
      revalidate,
      headers: { 'X-CMC_PRO_API_KEY': env.CMC_API_KEY },
    },
  );
  const code = json.status?.error_code;
  if (code && String(code) !== '0') {
    throw new Error(`CMC ${path.split('?')[0]} error ${code}`);
  }
  return json;
}

/** OKX public API fetch — unwraps the {code, data} envelope. */
export async function okxJson<T>(path: string, revalidate = 120): Promise<T> {
  const json = await getJson<{ code: string; data: T }>(
    `https://www.okx.com${path}`,
    { revalidate },
  );
  if (json.code !== '0' || json.data === undefined) {
    throw new Error(`OKX ${path.split('?')[0]} code ${json.code}`);
  }
  return json.data;
}

/** Buyer input: read a field from ?k= or the POST JSON body. */
export async function readInput(
  req: Request,
  key: string,
): Promise<string | undefined> {
  const fromQuery = new URL(req.url).searchParams.get(key);
  if (fromQuery) {
    return fromQuery;
  }
  if (req.method === 'POST') {
    try {
      const body = (await req.clone().json()) as Record<string, unknown>;
      const v = body[key];
      return typeof v === 'string' ? v : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Normalize a user-supplied ticker ("eth", "ETHUSDT") → "ETH" or null. */
export function parseAsset(raw: string | undefined, fallback = 'BTC'): string | null {
  const asset = (raw || fallback).trim().toUpperCase().replace(/USDT?$/, '');
  return /^[A-Z0-9]{2,10}$/.test(asset) ? asset : null;
}

export function badSymbol(raw: string | undefined): Response {
  return Response.json(
    { error: `Unsupported symbol "${raw ?? ''}" — pass e.g. {"symbol":"BTC"}.` },
    { status: 400 },
  );
}

export function upstreamDown(what: string): Response {
  return Response.json(
    { error: `${what} unavailable — try again shortly. Nothing was read.` },
    { status: 502 },
  );
}

/** Call a sibling gateway-hosted seller route with a signed delivery header
 *  (composite reports reuse the single-lane sellers as their lanes). Origin
 *  derives from the incoming request so local dev + prod both work. */
export async function callSibling<T>(req: Request, slug: string): Promise<T> {
  const url = `${new URL(req.url).origin}/sellers/${slug}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [DELIVERY_AUTH_HEADER]: signDelivery(url),
    },
    body: '{}',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`${slug} lane ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Percent change helper, guarded against zero denominators. */
export function pct(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / from) * 100;
}

export function round(n: number, dp = 2): number {
  return Number(n.toFixed(dp));
}
