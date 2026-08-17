// Omit-safe service upsert merge (S.1083 — the CLI twin of Connect's
// mergeServiceUpsert, S.1048; behavior SSOT: audric/apps/mcp/lib/sell.ts —
// ported, not imported, and the two must not drift).
//
// The signed /v1/agent/service API is a FULL upsert, and Commander supplies
// `--review 24h` / `--split 8000` defaults even when the flags are omitted —
// so a same-slug re-run that only changed the price silently RESET a
// customized review window / reject split. The fix: on an update, omitted
// optionals keep the LIVE values; create (no live row) keeps the defaults.
// `changed` names what actually differs (trim-normalized strings;
// requirements via canonical JSON so key order can't fake a diff) — an
// update with zero changes is the caller's cue to skip the challenge/sign
// entirely. A RETIRED live row is never a no-op — the upsert revives it.

/** Stable stringify — object keys sorted at every depth. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.map(canonicalJson).join(',')}]`;
  }
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'undefined';
}

/** The live listing row as the public seller catalog serves it (the shape
 *  this merge diffs against). */
export type LiveServiceRow = {
  name: string;
  description: string;
  priceUsdc: number;
  slaMinutes: number;
  reviewWindowMinutes: number;
  rejectSplitBps: number;
  requirements: unknown;
  deliverable: string;
  retired?: boolean;
};

export function mergeServiceUpsert(
  args: {
    slug: string;
    name: string;
    description: string;
    priceUsdc: number;
    slaMinutes: number;
    deliverable: string;
    requirements: unknown;
    reviewWindowMinutes?: number;
    rejectSplitBps?: number;
  },
  live: LiveServiceRow | null,
): {
  payload: {
    slug: string;
    name: string;
    description: string;
    priceUsdc: number;
    slaMinutes: number;
    reviewWindowMinutes: number;
    rejectSplitBps: number;
    requirements: unknown;
    deliverable: string;
  };
  created: boolean;
  changed: string[];
} {
  const payload = {
    slug: args.slug,
    name: args.name.trim(),
    description: args.description.trim(),
    priceUsdc: args.priceUsdc,
    slaMinutes: args.slaMinutes,
    reviewWindowMinutes:
      args.reviewWindowMinutes ?? live?.reviewWindowMinutes ?? 1440,
    rejectSplitBps: args.rejectSplitBps ?? live?.rejectSplitBps ?? 8000,
    requirements: args.requirements,
    deliverable: args.deliverable.trim(),
  };
  if (!live) {
    return { payload, created: true, changed: [] };
  }
  const changed: string[] = [];
  const strDiff = (key: string, next: string, prev: unknown) => {
    if (next !== (typeof prev === 'string' ? prev.trim() : '')) {
      changed.push(key);
    }
  };
  const numDiff = (key: string, next: number, prev: unknown) => {
    if (next !== prev) {
      changed.push(key);
    }
  };
  strDiff('name', payload.name, live.name);
  strDiff('description', payload.description, live.description);
  strDiff('deliverable', payload.deliverable, live.deliverable);
  numDiff('priceUsdc', payload.priceUsdc, live.priceUsdc);
  numDiff('slaMinutes', payload.slaMinutes, live.slaMinutes);
  numDiff(
    'reviewWindowMinutes',
    payload.reviewWindowMinutes,
    live.reviewWindowMinutes,
  );
  numDiff('rejectSplitBps', payload.rejectSplitBps, live.rejectSplitBps);
  if (canonicalJson(payload.requirements) !== canonicalJson(live.requirements)) {
    changed.push('requirements');
  }
  if (live.retired) {
    changed.push('relisted');
  }
  return { payload, created: false, changed };
}
