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

export type SpecEnvelopeOptions = {
  /** S.1299 — reference images (≤6 HTTPS; first = cover). Validated. */
  images?: readonly string[] | null;
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
  return JSON.stringify({
    type: 't2-acp-custom@1',
    title: t || 'Custom job',
    brief: body,
    createdAtMs: now,
    // Written only when present — byte-stable for every image-less job.
    ...(images.length > 0 ? { images } : {}),
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
