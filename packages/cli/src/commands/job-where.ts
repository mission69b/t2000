// S.1300 — `--mode` + `--where` on the buyer job verbs (open / batch-open /
// hire custom). The SDK owns the shape: mode ∈ remote | on-site | either
// (default remote) and ONE structured place {label, lat, lng, placeId?,
// provider: "maptiler"} that rides INSIDE the spec envelope (part of
// spec_hash). `--where` takes a place query ("Bondi Junction, Sydney") that
// the HOST geocodes once via MapTiler (`GET /v1/geo/search`) — the CLI
// binary never holds a map key — or an already-resolved JSON object.
// Remote + where refuses; a query with no match refuses (never a pin-less
// pretend); a host without place search refuses in its own English.
import {
  geocodePlace,
  JOB_MODES,
  type JobMode,
  type JobWhere,
  normalizeJobPlace,
  validateJobMode,
  validateJobWhere,
} from '@t2000/sdk';

export const MODE_FLAG_HELP = `Work mode: ${JOB_MODES.join(' | ')} (default remote)`;
export const WHERE_FLAG_HELP =
  'Place for on-site / either work — a query ("Bondi Junction, Sydney"; the host geocodes it via MapTiler) or a resolved JSON place {label, lat, lng}';

export type ResolvedPlace = { mode: JobMode; where: JobWhere | null };

/** Turn the two flags into the SDK's structured pair. `geocode` is
 *  injectable for tests; production passes `(q) => geocodePlace(base, q)`. */
export async function resolveWhereFlags(
  opts: { mode?: string; where?: string },
  geocode: (query: string) => Promise<JobWhere[]>,
): Promise<ResolvedPlace> {
  const m = validateJobMode(opts.mode);
  if (!m.valid) {
    throw new Error(`--mode: ${m.error}`);
  }
  const raw = opts.where?.trim() ?? '';
  if (!raw) {
    return { mode: m.mode, where: null };
  }
  if (m.mode === 'remote') {
    throw new Error('--where goes with --mode on-site or either — a remote job has no place.');
  }
  if (raw.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('--where: not valid JSON — pass a place query, or {label, lat, lng}.');
    }
    const v = validateJobWhere(parsed);
    if (!v.valid) {
      throw new Error(`--where: ${v.error}`);
    }
    return normalizeJobPlace(m.mode, v.where);
  }
  const hits = await geocode(raw);
  if (hits.length === 0) {
    throw new Error(`--where: no place found for "${raw}" — try a suburb + city, or pass {label, lat, lng}.`);
  }
  return normalizeJobPlace(m.mode, hits[0]);
}

/** Production geocoder: the host's MapTiler-backed search. */
export function hostGeocoder(base: string): (query: string) => Promise<JobWhere[]> {
  return (query) => geocodePlace(base, query, { limit: 1 });
}

/** One line for receipts: "On-site · Bondi Junction, Sydney" / "Either". */
export function describePlace(place: ResolvedPlace): string {
  const label = place.mode === 'on-site' ? 'On-site' : place.mode === 'either' ? 'Either' : 'Remote';
  return place.where ? `${label} · ${place.where.label}` : label;
}
