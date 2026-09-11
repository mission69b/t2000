// Buyer custom-hire spec envelope (S.978) — the ONE write shape for
// buyer-authored jobs across every surface: console hire-custom-prepare,
// Connect t2000_job_hire (S.977), `t2 job hire`, and (S.1299) the open /
// batch-open posts the API composes — all upload `t2-acp-custom@1`
// {type, title, brief, createdAtMs, images?}. Raw-text READ fallbacks stay
// forever for history; nothing should EMIT raw anymore.
// Behavior is byte-stable with the S.977 mcp builder it canonicalizes
// (audric apps/mcp/lib/hire-order.ts imports this once the version bumps).
//
// S.1299 — job images. Two kinds, never conflated:
//   REFERENCE images ride INSIDE the spec envelope (buyer: open / hire /
//   batch-open / repost) → they are part of the bytes behind spec_hash.
//   PROOF images ride INSIDE the delivery payload (seller: deliver) →
//   `t2-acp-delivery@1` → part of the bytes behind delivery_hash.
// Same rules for both: max 6, first = cover, HTTPS only. The `images` key
// is written ONLY when there are images, so every existing call site stays
// byte-identical (a job with no images hashes exactly as before).

const TITLE_PREFIX_RE = /^title\s*:\s*(.+)$/i;
const ENVELOPE_TITLE_MAX = 80;

/** Max images per job (reference) and per delivery (proof). */
export const MAX_JOB_IMAGES = 6;

export type JobImagesValidation =
  | { valid: true; images: string[] }
  | { valid: false; error: string };

/** Validate a candidate image list: a list of HTTPS URLs, at most
 *  MAX_JOB_IMAGES, blanks dropped, duplicates collapsed (first wins —
 *  it is the cover). `undefined` / `null` / `[]` are valid and empty. */
export function validateJobImages(input: unknown): JobImagesValidation {
  if (input === undefined || input === null) {
    return { valid: true, images: [] };
  }
  if (!Array.isArray(input)) {
    return { valid: false, error: 'images must be a list of HTTPS URLs.' };
  }
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      return { valid: false, error: 'images must be a list of HTTPS URLs.' };
    }
    const url = raw.trim();
    if (!url) {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { valid: false, error: `Not a URL: ${url}` };
    }
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: `Images must be HTTPS URLs: ${url}` };
    }
    if (url.length > 2048) {
      return { valid: false, error: 'Image URLs must be under 2048 characters.' };
    }
    if (!out.includes(url)) {
      out.push(url);
    }
  }
  if (out.length > MAX_JOB_IMAGES) {
    return {
      valid: false,
      error: `Up to ${MAX_JOB_IMAGES} images per job (the first is the cover).`,
    };
  }
  return { valid: true, images: out };
}

/** validateJobImages that throws — for write paths. */
export function normalizeJobImages(input: unknown): string[] {
  const v = validateJobImages(input);
  if (!v.valid) {
    throw new Error(v.error);
  }
  return v.images;
}

// ── Mode + where (S.1300) ─────────────────────────────────────────────────
// Work MODE (`remote` | `on-site` | `either`, default remote) and ONE
// structured WHERE — the only persisted place shape, every door:
//   { label, lat, lng, placeId?, provider: "maptiler" }
// Console picks it from MapTiler autocomplete; agents (Connect / Audric /
// CLI) pass a place query string that the HOST geocodes once via MapTiler
// into this same shape — never free text on the board, never a raw lat/lng
// asked of a model. Both keys ride INSIDE the spec envelope (part of
// spec_hash) and are written ONLY when non-default, so a remote job with
// no place hashes byte-identically to before S.1300. Remote + where is
// refused (a remote job has no place). Discovery only — a pin never says
// the worker showed up.
//
// `mode` here is the WORK mode. It is deliberately not the hire
// discriminator (`listing` vs `custom`) — those never share a type.

export const JOB_MODES = ['remote', 'on-site', 'either'] as const;
export type JobMode = (typeof JOB_MODES)[number];
export const DEFAULT_JOB_MODE: JobMode = 'remote';
/** The ONE human label per mode (chips, bylines, cards). */
export const JOB_MODE_LABELS: Record<JobMode, string> = {
  remote: 'Remote',
  'on-site': 'On-site',
  either: 'Either',
};

export type JobWhere = {
  /** Human place label as the geocoder returned it ("Bondi Junction, Sydney"). */
  label: string;
  lat: number;
  lng: number;
  /** MapTiler feature id — optional, informational. */
  placeId?: string;
  provider: 'maptiler';
};

export const WHERE_LABEL_MAX = 200;

export function isJobMode(value: unknown): value is JobMode {
  return typeof value === 'string' && (JOB_MODES as readonly string[]).includes(value);
}

export type JobModeValidation =
  | { valid: true; mode: JobMode }
  | { valid: false; error: string };

/** `undefined` / `null` / '' → remote. Anything else must be a mode. */
export function validateJobMode(input: unknown): JobModeValidation {
  if (input === undefined || input === null || input === '') {
    return { valid: true, mode: DEFAULT_JOB_MODE };
  }
  if (typeof input === 'string') {
    const m = input.trim().toLowerCase();
    // Tolerate the common spellings agents type; the stored value is canonical.
    const canon = m === 'onsite' || m === 'on_site' || m === 'in-person' || m === 'in person' ? 'on-site' : m;
    if (isJobMode(canon)) {
      return { valid: true, mode: canon };
    }
  }
  return {
    valid: false,
    error: `mode must be one of ${JOB_MODES.join(' | ')} (default remote).`,
  };
}

export type JobWhereValidation =
  | { valid: true; where: JobWhere | null }
  | { valid: false; error: string };

/** Validate an already-STRUCTURED where. `undefined` / `null` → none. A
 *  string is NOT accepted here — that is a place query for the host's
 *  geocoder (see `geocodePlace`), never a stored value. */
export function validateJobWhere(input: unknown): JobWhereValidation {
  if (input === undefined || input === null) {
    return { valid: true, where: null };
  }
  if (typeof input === 'string') {
    return {
      valid: false,
      error: 'where must be a geocoded place {label, lat, lng, provider: "maptiler"} — pass the text to the host geocoder first.',
    };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'where must be a place object {label, lat, lng, placeId?, provider}.' };
  }
  const o = input as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  if (!label) {
    return { valid: false, error: 'where.label is required (the place name).' };
  }
  if (label.length > WHERE_LABEL_MAX) {
    return { valid: false, error: `where.label must be under ${WHERE_LABEL_MAX} characters.` };
  }
  const lat = typeof o.lat === 'number' ? o.lat : Number.NaN;
  const lng = typeof o.lng === 'number' ? o.lng : Number.NaN;
  if (!(Number.isFinite(lat) && lat >= -90 && lat <= 90)) {
    return { valid: false, error: 'where.lat must be a number between -90 and 90.' };
  }
  if (!(Number.isFinite(lng) && lng >= -180 && lng <= 180)) {
    return { valid: false, error: 'where.lng must be a number between -180 and 180.' };
  }
  if (o.provider !== undefined && o.provider !== 'maptiler') {
    return { valid: false, error: 'where.provider must be "maptiler" (the one place vendor).' };
  }
  const placeId =
    typeof o.placeId === 'string' && o.placeId.trim() ? o.placeId.trim().slice(0, 120) : undefined;
  return {
    valid: true,
    where: {
      label,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      ...(placeId ? { placeId } : {}),
      provider: 'maptiler',
    },
  };
}

export type JobPlaceValidation =
  | { valid: true; mode: JobMode; where: JobWhere | null }
  | { valid: false; error: string };

/** The pair rule every write path runs: mode validated, where validated,
 *  and remote + where refused — a remote job has no place. */
export function validateJobPlace(modeInput: unknown, whereInput: unknown): JobPlaceValidation {
  const m = validateJobMode(modeInput);
  if (!m.valid) {
    return m;
  }
  const w = validateJobWhere(whereInput);
  if (!w.valid) {
    return w;
  }
  if (m.mode === 'remote' && w.where) {
    return {
      valid: false,
      error: 'A remote job has no place — set mode to on-site or either, or drop where.',
    };
  }
  return { valid: true, mode: m.mode, where: w.where };
}

/** validateJobPlace that throws — for write paths. */
export function normalizeJobPlace(modeInput: unknown, whereInput: unknown): { mode: JobMode; where: JobWhere | null } {
  const v = validateJobPlace(modeInput, whereInput);
  if (!v.valid) {
    throw new Error(v.error);
  }
  return { mode: v.mode, where: v.where };
}

/** READ the mode off any spec content — fail-soft: missing / junk → remote. */
export function parseSpecMode(content: string): JobMode {
  try {
    const parsed = JSON.parse(content) as { mode?: unknown };
    const v = validateJobMode(parsed.mode);
    return v.valid ? v.mode : DEFAULT_JOB_MODE;
  } catch {
    return DEFAULT_JOB_MODE;
  }
}

/** READ the structured where off any spec content — fail-soft null. */
export function parseSpecWhere(content: string): JobWhere | null {
  try {
    const parsed = JSON.parse(content) as { where?: unknown };
    const v = validateJobWhere(parsed.where);
    return v.valid ? v.where : null;
  } catch {
    return null;
  }
}

/** Distance between two places in km (haversine) — the board's near-me
 *  radius math, shared so the API and the console never disagree. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** The board's one near-me radius (D1b lock). */
export const NEAR_ME_RADIUS_KM = 10;

export type SpecEnvelopeOptions = {
  /** S.1299 — reference images (≤6 HTTPS; first = cover). Validated. */
  images?: readonly string[] | null;
  /** S.1300 — work mode (default remote; written only when not remote). */
  mode?: JobMode | string | null;
  /** S.1300 — structured place (on-site / either only; written only when set). */
  where?: JobWhere | null;
};

/** Title rules: an explicit title wins; otherwise the brief's first
 *  non-empty line (a leading "Title: …" prefix is stripped for the title
 *  field — the FULL text always stays in the brief, lossless), hard-capped
 *  at 80 chars. Empty derive → "Custom job". */
export function customHireEnvelope(
  brief: string,
  title: string | undefined,
  now: number,
  opts: SpecEnvelopeOptions = {},
): string {
  const body = brief.trim();
  let t = title?.trim() ?? '';
  if (!t) {
    const first = body.split('\n').find((l) => l.trim())?.trim() ?? '';
    const prefixed = TITLE_PREFIX_RE.exec(first);
    t = (prefixed ? prefixed[1] : first).trim();
  }
  if (t.length > ENVELOPE_TITLE_MAX) {
    t = `${t.slice(0, ENVELOPE_TITLE_MAX - 1).trimEnd()}…`;
  }
  const images = normalizeJobImages(opts.images);
  const place = normalizeJobPlace(opts.mode, opts.where);
  return JSON.stringify({
    type: 't2-acp-custom@1',
    title: t || 'Custom job',
    brief: body,
    createdAtMs: now,
    // Written only when present — byte-stable for every image-less job.
    ...(images.length > 0 ? { images } : {}),
    // S.1300 — mode only when not remote; where only when set. Appended
    // AFTER images so every S.1299 envelope stays byte-identical too.
    ...(place.mode !== DEFAULT_JOB_MODE ? { mode: place.mode } : {}),
    ...(place.where ? { where: place.where } : {}),
  });
}

/** The open-board / batch-open twin (S.1299): SAME envelope, title
 *  required (the board names the row). The API composes this at post so
 *  the bytes behind the opening's spec_hash carry the images. */
export function openPostEnvelope(
  title: string,
  brief: string,
  now: number,
  opts: SpecEnvelopeOptions = {},
): string {
  return customHireEnvelope(brief, title.trim() || undefined, now, opts);
}

/** Idempotency guard: text that already IS a custom envelope (current or
 *  legacy name) with a usable brief must upload as-is, never double-wrap. */
export function isCustomHireEnvelope(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { type?: unknown; brief?: unknown };
    return (
      (parsed.type === 't2-acp-custom@1' ||
        parsed.type === 't2-acp-invite@1') &&
      typeof parsed.brief === 'string' &&
      parsed.brief.trim().length > 0
    );
  } catch {
    return false;
  }
}

/** READ the reference images off any spec content — fail-soft: raw text,
 *  listing specs, legacy envelopes, or junk all read as no images. Only
 *  HTTPS strings count, capped at MAX_JOB_IMAGES. */
export function parseSpecImages(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as { images?: unknown };
    const v = validateJobImages(
      Array.isArray(parsed.images) ? parsed.images.slice(0, MAX_JOB_IMAGES) : undefined,
    );
    return v.valid ? v.images : [];
  } catch {
    return [];
  }
}

// ── Delivery payload (S.1299 — proof images) ─────────────────────────────

export const DELIVERY_ENVELOPE_TYPE = 't2-acp-delivery@1';

/** Wrap a delivery body for the spec store. With NO proof images the body
 *  uploads RAW — byte-identical to every delivery ever pinned. With images
 *  it becomes the `t2-acp-delivery@1` envelope {type, body, images,
 *  createdAtMs}, so the bytes behind delivery_hash carry the proof. */
export function deliveryEnvelope(
  body: string,
  now: number,
  opts: SpecEnvelopeOptions = {},
): string {
  const images = normalizeJobImages(opts.images);
  if (images.length === 0) {
    return body;
  }
  return JSON.stringify({
    type: DELIVERY_ENVELOPE_TYPE,
    body,
    images,
    createdAtMs: now,
  });
}

export type DeliveryContent = {
  /** The delivery text the buyer reads (the whole content when raw). */
  body: string;
  /** Proof images (≤6 HTTPS; first = cover) — empty on raw deliveries. */
  images: string[];
  /** Whether the content was a `t2-acp-delivery@1` envelope. */
  enveloped: boolean;
};

/** READ a delivery: envelope → body + images; anything else is the raw
 *  body with no images (every pre-S.1299 delivery, and hash-only misses). */
export function parseDeliveryContent(content: string): DeliveryContent {
  try {
    const parsed = JSON.parse(content) as {
      type?: unknown;
      body?: unknown;
      images?: unknown;
    };
    if (parsed.type === DELIVERY_ENVELOPE_TYPE && typeof parsed.body === 'string') {
      const v = validateJobImages(
        Array.isArray(parsed.images) ? parsed.images.slice(0, MAX_JOB_IMAGES) : undefined,
      );
      return { body: parsed.body, images: v.valid ? v.images : [], enveloped: true };
    }
  } catch {
    // raw text
  }
  return { body: content, images: [], enveloped: false };
}
