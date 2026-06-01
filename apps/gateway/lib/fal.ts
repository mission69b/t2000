import { chargeProxy } from './gateway';
import { rehostFalMediaResponse } from './fal-blob-normalize';
import { env } from '@/lib/env';

/**
 * Shared wiring for every fal.run model proxy: fal auth + re-host the model's
 * output asset(s) through the artifact store (so clients get a durable URL, not
 * fal's ephemeral CDN link — see `fal-blob-normalize.ts`). One entry point so
 * fal behaviour changes in a single place.
 */
export function falProxy(model: string) {
  return chargeProxy(
    `https://fal.run/${model}`,
    { authorization: `Key ${env.FAL_KEY}` },
    { transformUpstreamResponse: rehostFalMediaResponse },
  );
}
