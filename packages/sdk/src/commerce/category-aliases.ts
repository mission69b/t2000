// S.1358 — the directory thesaurus. Airtasker-style leaf names ("cleaning",
// "property inspection", "removalists") alias INTO one of the 13
// departments in AGENT_CATEGORIES; they are never slugs on the wire. The
// enum is WHAT; mode + where on jobs (S.1300) and homeBase on agents
// (S.1301) are WHERE — never encode a place here (no "sydney-locksmiths").
// Mirror: audric packages/marketplace/src/category-aliases.ts — keep both
// in step. Add keys freely (lowercase phrases + hyphen forms); never invent
// a 14th department here.

import { AGENT_CATEGORIES, type AgentCategory } from './types.js';

export const CATEGORY_ALIASES: Readonly<Record<string, AgentCategory>> = {
  // home — property / household / trades
  cleaning: 'home',
  'general-cleaning': 'home',
  cleaner: 'home',
  cleaners: 'home',
  gardening: 'home',
  gardener: 'home',
  handyperson: 'home',
  handyman: 'home',
  plumbing: 'home',
  plumber: 'home',
  'pest-control': 'home',
  painting: 'home',
  painter: 'home',
  'furniture-assembly': 'home',
  'domestic-help': 'home',
  washing: 'home',
  builder: 'home',
  carpenter: 'home',
  electrician: 'home',
  locksmith: 'home',
  locksmiths: 'home',
  // field — be-there work that is not a trade
  inspection: 'field',
  'property-inspection': 'field',
  'mystery-shopper': 'field',
  'mystery-shop': 'field',
  queue: 'field',
  'on-site-photo': 'field',
  'security-patrol': 'field',
  // logistics — move / carry / deliver
  removalists: 'logistics',
  removalist: 'logistics',
  removals: 'logistics',
  packing: 'logistics',
  couriers: 'logistics',
  courier: 'logistics',
  delivery: 'logistics',
  deliveries: 'logistics',
  'pick-up': 'logistics',
  pickup: 'logistics',
  // events — on-site people for an occasion
  'event-staffing': 'events',
  'event-entertainment': 'events',
  entertainment: 'events',
  wedding: 'events',
  weddings: 'events',
  stunts: 'events',
  // travel — homestays / hotels stay here (no "accommodation" department)
  hotels: 'travel',
  hotel: 'travel',
  flights: 'travel',
  flight: 'travel',
  homestay: 'travel',
  homestays: 'travel',
  accommodation: 'travel',
  // creative — studio / design / video production
  copywriting: 'creative',
  'graphic-design': 'creative',
  design: 'creative',
  logo: 'creative',
  'video-production': 'creative',
  // research
  'market-research': 'research',
  'market-brief': 'research',
  // dev-tools
  'software-development': 'dev-tools',
  'it-support': 'dev-tools',
  // comms
  translation: 'comms',
  tutoring: 'comms',
};

/** Canonical form of a typed category: trim, lower-case, spaces and
 *  underscores → hyphens ("Property inspection" → "property-inspection"). */
export function canonicalCategoryKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/** A slug or an alias → the department slug; anything else → null (the
 *  caller 400s, or treats the word as text search). */
export function resolveDirectoryCategory(raw: string): AgentCategory | null {
  const key = canonicalCategoryKey(raw);
  if (!key) {
    return null;
  }
  if ((AGENT_CATEGORIES as readonly string[]).includes(key)) {
    return key as AgentCategory;
  }
  return CATEGORY_ALIASES[key] ?? null;
}
