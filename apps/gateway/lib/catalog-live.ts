// [SPEC_CATALOG_SELF_LISTING] The merged catalog view: static services
// (lib/services.ts — proxied + hand-curated) ⊕ live dynamic direct-seller
// entries (Redis). Public catalog surfaces (/api/services, llms.txt,
// /services UI) read THIS, never the store directly.
//
// Degrades to static-only if Redis is unreachable — a KV outage must never
// take down the catalog that every installed agent queries.
import { services, type Service } from './services';
import { listLiveServices } from './catalog-store';

export async function getCatalog(): Promise<Service[]> {
  let dynamic: Service[] = [];
  try {
    dynamic = await listLiveServices();
  } catch (err) {
    console.error('[catalog] dynamic entries unavailable, serving static only:', err);
  }
  const staticIds = new Set(services.map((s) => s.id));
  return [...services, ...dynamic.filter((s) => !staticIds.has(s.id))];
}
