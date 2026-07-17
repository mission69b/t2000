import { services, type Service } from './services';
import { formatUsd } from './format';

/**
 * UI-friendly projection of a Service. Computes derived fields the AFI
 * design treatment uses (cheapest price, single category, endpoint count).
 * Pure function of `lib/services.ts` — same SSOT, no fork.
 */
export interface ServiceCard {
  id: string;
  name: string;
  category: string;
  endpointCount: number;
  fromPrice: string;
  description: string;
  serviceUrl: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  ai: 'AI',
  search: 'Search',
  web: 'Web',
  data: 'Data',
  media: 'Media',
  finance: 'Finance',
  translation: 'Translate',
  commerce: 'Commerce',
  messaging: 'Messaging',
  compute: 'Compute',
  security: 'Security',
  communication: 'Communication',
  utility: 'Utility',
};

export function categoryLabel(id: string): string {
  return CATEGORY_LABEL[id] ?? id;
}

function cheapestPrice(s: Service): string {
  const numeric = s.endpoints
    .map((e) => parseFloat(e.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numeric.length === 0) return 'dynamic';
  return formatUsd(Math.min(...numeric));
}

export function toServiceCard(s: Service): ServiceCard {
  return {
    id: s.id,
    name: s.name,
    category: categoryLabel(s.categories[0] ?? 'utility'),
    endpointCount: s.endpoints.length,
    fromPrice: cheapestPrice(s),
    description: s.description,
    serviceUrl: s.serviceUrl,
  };
}

// Every aggregate below takes an optional service list so pages that render
// the merged catalog (static ⊕ dynamic direct sellers, via getCatalog()) can
// pass it in. Defaulting to the static list keeps build-time callers
// (home-page metrics, metadata) synchronous.
export function allCards(list: Service[] = services): ServiceCard[] {
  return list.map(toServiceCard);
}

export function totalServices(list: Service[] = services): number {
  return list.length;
}

export function totalEndpoints(list: Service[] = services): number {
  return list.reduce((sum, s) => sum + s.endpoints.length, 0);
}

export function totalCategories(list: Service[] = services): number {
  const set = new Set<string>();
  for (const s of list) {
    for (const c of s.categories) set.add(c);
  }
  return set.size;
}

/**
 * Distinct categories with counts. The catalog filter bar uses this.
 */
export function categoryBuckets(list: Service[] = services): Array<{ id: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of list) {
    const primary = s.categories[0] ?? 'utility';
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, label: categoryLabel(id), count }))
    .sort((a, b) => b.count - a.count);
}
