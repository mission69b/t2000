// S.1299 — `--image <url>` (repeatable) on the job verbs: reference images
// on open / batch-open / hire (inside the spec envelope → spec_hash) and
// proof images on deliver (inside the delivery envelope → delivery_hash).
// The SDK owns the rules (HTTPS, max 6, first = cover); this only collects
// the flag and turns the SDK's refusal into CLI wording.
import { MAX_JOB_IMAGES, validateJobImages } from '@t2000/sdk';

/** Commander accumulator for a repeatable `--image <url>`. */
export function collectImage(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export const IMAGE_FLAG_HELP = `Image URL (HTTPS; repeat up to ${MAX_JOB_IMAGES} — the first is the cover)`;

/** Validate the collected list or throw a CLI-flavored error. */
export function resolveImageFlags(values: readonly string[] | undefined): string[] {
  const v = validateJobImages(values ?? []);
  if (!v.valid) {
    throw new Error(`--image: ${v.error}`);
  }
  return v.images;
}
