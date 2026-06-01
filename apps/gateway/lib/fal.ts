import { chargeProxy } from './gateway';
import { env } from '@/lib/env';

/**
 * Shared wiring for every fal.run model proxy: fal auth + the catalog price.
 * fal's output assets (`*.fal.media` URLs) are re-hosted to the artifact store
 * by the universal `normalizeResponse` chokepoint (see `artifact-store.ts`), so
 * there is nothing fal-specific to do here beyond auth — one entry point keeps
 * the 6 fal routes tidy.
 */
export function falProxy(model: string) {
  return chargeProxy(`https://fal.run/${model}`, { authorization: `Key ${env.FAL_KEY}` });
}
