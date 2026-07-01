import "server-only";

// The deployed confidential_anchor package (mainnet). Overridable via env, but
// this app has no OTHER required env (a public read-only explorer), so the
// known-good default keeps it zero-config (S.227 inline-validation carve-out).
const PKG =
  process.env.CONFIDENTIAL_ANCHOR_PACKAGE_ID ??
  "0x2a109ad35281eb41b556500164f6a2f264afb6710883d922114db2347e6eb6ba";
const EVENT_TYPE = `${PKG}::anchor::ReceiptAnchored`;
const FULLNODE = process.env.SUI_FULLNODE ?? "https://fullnode.mainnet.sui.io";
const NETWORK = process.env.SUI_NETWORK ?? "mainnet";

export type AnchoredReceipt = {
  receiptId: string;
  wireHash: string;
  workloadId: string;
  anchoredAtMs: number;
  txDigest: string;
  explorer: string;
};

type SuiEvent = {
  id: { txDigest: string };
  timestampMs?: string;
  parsedJson?: {
    receipt_id?: string;
    wire_hash?: string;
    workload_id?: string;
    anchored_at_ms?: string;
  };
};

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(FULLNODE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()).result as T;
  } catch {
    return null;
  }
}

function mapEvent(e: SuiEvent): AnchoredReceipt {
  return {
    receiptId: e.parsedJson?.receipt_id ?? "",
    wireHash: e.parsedJson?.wire_hash ?? "",
    workloadId: e.parsedJson?.workload_id ?? "",
    anchoredAtMs: Number(e.parsedJson?.anchored_at_ms ?? e.timestampMs ?? 0),
    txDigest: e.id.txDigest,
    explorer: `https://suiscan.xyz/${NETWORK}/tx/${e.id.txDigest}`,
  };
}

/** The most recent anchored confidential receipts (newest first). */
export async function recentAnchors(limit = 50): Promise<AnchoredReceipt[]> {
  const r = await rpc<{ data?: SuiEvent[] }>("suix_queryEvents", [
    { MoveEventType: EVENT_TYPE },
    null,
    limit,
    true,
  ]);
  return (r?.data ?? []).map(mapEvent).filter((a) => a.receiptId);
}

let countCache: { value: number; at: number } = { value: 0, at: 0 };

/** Total anchored responses — paginated (capped) + cached 60s. It's a public
 *  credibility counter, so an approximate "at least N" is fine at the cap. */
export async function totalAnchors(): Promise<{ count: number; capped: boolean }> {
  if (countCache.value && Date.now() - countCache.at < 60_000) {
    return { count: countCache.value, capped: false };
  }
  let count = 0;
  let cursor: unknown = null;
  let pages = 0;
  const MAX_PAGES = 40; // 40 × 50 = 2000 cap
  let capped = false;
  do {
    const r = await rpc<{
      data?: SuiEvent[];
      hasNextPage?: boolean;
      nextCursor?: unknown;
    }>("suix_queryEvents", [{ MoveEventType: EVENT_TYPE }, cursor, 50, false]);
    count += r?.data?.length ?? 0;
    cursor = r?.hasNextPage ? r.nextCursor : null;
    pages += 1;
    if (cursor && pages >= MAX_PAGES) {
      capped = true;
      break;
    }
  } while (cursor);
  countCache = { value: count, at: Date.now() };
  return { count, capped };
}
