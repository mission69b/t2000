import "server-only";

// The public anchor ledger, read over Sui GraphQL. (Public JSON-RPC
// `suix_queryEvents` is dead — deprecated ahead of the 2026-07-31 mainnet
// shutdown, it returns "Method not found", and the old error-swallowing rpc()
// made that look like an empty ledger.)
//
// The deployed confidential_anchor package (mainnet). Overridable via env, but
// this app has no OTHER required env (a public read-only explorer), so the
// known-good default keeps it zero-config (S.227 inline-validation carve-out).
const PKG =
  process.env.CONFIDENTIAL_ANCHOR_PACKAGE_ID ??
  "0x2a109ad35281eb41b556500164f6a2f264afb6710883d922114db2347e6eb6ba";
const EVENT_TYPE = `${PKG}::anchor::ReceiptAnchored`;
const GRAPHQL_URL =
  process.env.SUI_GRAPHQL_URL ?? "https://graphql.mainnet.sui.io/graphql";
const NETWORK = process.env.SUI_NETWORK ?? "mainnet";

export type AnchoredReceipt = {
  receiptId: string;
  wireHash: string;
  workloadId: string;
  anchoredAtMs: number;
  txDigest: string;
  explorer: string;
};

type EventNode = {
  timestamp?: string | null;
  transaction?: { digest?: string | null } | null;
  contents?: {
    json?: {
      receipt_id?: string;
      wire_hash?: string;
      workload_id?: string;
      anchored_at_ms?: string;
    } | null;
  } | null;
};

type EventsPage = {
  data?: {
    events?: {
      nodes?: EventNode[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    };
  };
  errors?: { message?: string }[];
};

/** One GraphQL events page. `last:` reads the tail (newest events);
 *  `first:`+`after:` walks forward for counting. Errors → null (the ledger
 *  degrades to empty, never throws into the page). */
async function fetchEvents(
  args: string,
  vars: Record<string, unknown>
): Promise<EventsPage["data"] | null> {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query Anchors($type: String!${vars.after != null ? ", $after: String" : ""}) {
  events(${args}, filter: { type: $type }) {
    nodes {
      timestamp
      contents { json }
      transaction { digest }
    }
    pageInfo { hasNextPage endCursor }
  }
}`,
        variables: { type: EVENT_TYPE, ...vars },
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    const page = (await res.json()) as EventsPage;
    if (page.errors?.length) {
      return null;
    }
    return page.data ?? null;
  } catch {
    return null;
  }
}

function mapEvent(e: EventNode): AnchoredReceipt {
  const json = e.contents?.json ?? {};
  const digest = e.transaction?.digest ?? "";
  const tsMs = e.timestamp ? Date.parse(e.timestamp) : 0;
  return {
    receiptId: json.receipt_id ?? "",
    wireHash: json.wire_hash ?? "",
    workloadId: json.workload_id ?? "",
    anchoredAtMs: Number(json.anchored_at_ms ?? tsMs ?? 0),
    txDigest: digest,
    explorer: `https://suiscan.xyz/${NETWORK}/tx/${digest}`,
  };
}

/** The most recent anchored confidential receipts (newest first). */
export async function recentAnchors(limit = 50): Promise<AnchoredReceipt[]> {
  const data = await fetchEvents(`last: ${Math.min(Math.max(limit, 1), 50)}`, {});
  const nodes = data?.events?.nodes ?? [];
  // `last:` returns oldest→newest within the tail — reverse to newest-first.
  return [...nodes]
    .reverse()
    .map(mapEvent)
    .filter((a) => a.receiptId);
}

let countCache: { value: number; at: number } = { value: 0, at: 0 };

/** Total anchored responses — paginated (capped) + cached 60s. It's a public
 *  credibility counter, so an approximate "at least N" is fine at the cap. */
export async function totalAnchors(): Promise<{
  count: number;
  capped: boolean;
}> {
  if (countCache.value && Date.now() - countCache.at < 60_000) {
    return { count: countCache.value, capped: false };
  }
  let count = 0;
  let cursor: string | null = null;
  let pages = 0;
  const MAX_PAGES = 40; // 40 × 50 = 2000 cap
  let capped = false;
  do {
    const data = await fetchEvents(
      cursor ? "first: 50, after: $after" : "first: 50",
      cursor ? { after: cursor } : {}
    );
    const events = data?.events;
    count += events?.nodes?.length ?? 0;
    cursor = events?.pageInfo?.hasNextPage
      ? (events.pageInfo.endCursor ?? null)
      : null;
    pages += 1;
    if (cursor && pages >= MAX_PAGES) {
      capped = true;
      break;
    }
  } while (cursor);
  countCache = { value: count, at: Date.now() };
  return { count, capped };
}
