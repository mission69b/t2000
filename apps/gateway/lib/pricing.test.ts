import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getEndpointPrice, services } from './services';

/**
 * Price SSOT regression suite.
 *
 * Guards the 2026-06 collapse: routes pass NO price; `chargeProxy` /
 * `chargeCustom` resolve it from `lib/services.ts` via `getEndpointPrice`.
 * If a future route hardcodes a price again, or the catalog loses an entry a
 * route depends on, the coverage test below flips red — so the dual-SSOT drift
 * that produced the dogfood discrepancies cannot silently return.
 */

describe('getEndpointPrice', () => {
  it('resolves exact (service, method, path) entries', () => {
    expect(getEndpointPrice('openai', 'POST', '/v1/chat/completions')).toBe('0.02');
    expect(getEndpointPrice('openai', 'POST', '/v1/images/generations')).toBe('0.10');
    expect(getEndpointPrice('anthropic', 'POST', '/v1/messages')).toBe('0.02');
  });

  it('matches :param template segments against concrete paths', () => {
    // elevenlabs catalog path is /v1/text-to-speech/:voiceId
    expect(
      getEndpointPrice('elevenlabs', 'POST', '/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM'),
    ).toBe('0.10');
  });

  it('is method-sensitive and returns undefined for unknowns', () => {
    expect(getEndpointPrice('openai', 'GET', '/v1/chat/completions')).toBeUndefined();
    expect(getEndpointPrice('nope', 'POST', '/v1/x')).toBeUndefined();
    expect(getEndpointPrice('openai', 'POST', '/v1/does-not-exist')).toBeUndefined();
  });
});

describe('100% margin applied uniformly (price = 2x upstream base)', () => {
  it('has no pre-100%-margin prices left in the catalog', () => {
    const prices = services.flatMap((s) => s.endpoints.map((e) => e.price));
    // The +20% tier values must be gone...
    expect(prices).not.toContain('0.012'); // was 0.01 base
    expect(prices).not.toContain('0.036'); // was 0.03 base
    expect(prices).not.toContain('0.24'); // was 0.20 base
    // ...replaced by 2x-base values.
    expect(prices).toContain('0.02'); // 0.01 base * 2
    expect(prices).toContain('0.06'); // 0.03 base * 2
    expect(prices).toContain('0.10'); // 0.05 base * 2
    expect(prices).toContain('0.40'); // 0.20 base * 2
  });
});

describe('route <-> catalog coverage (no dual SSOT, no orphans)', () => {
  const appDir = join(__dirname, '..', 'app');

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (name === 'route.ts') out.push(full);
    }
    return out;
  }

  function normPath(p: string): string {
    return p
      .split('/')
      .filter(Boolean)
      .map((s) =>
        s.startsWith(':') ||
        (s.startsWith('{') && s.endsWith('}')) ||
        (s.startsWith('[') && s.endsWith(']'))
          ? '*'
          : s,
      )
      .join('/');
  }

  // A route "charges" if it calls chargeProxy/chargeCustom directly OR via a
  // thin wrapper that does (falProxy → chargeProxy). New charging wrappers must
  // be added here so their routes are covered by the orphan/coverage checks.
  const routeFiles = walk(appDir).filter((f) =>
    /charge(Proxy|Custom)\(|\bfalProxy\(/.test(readFileSync(f, 'utf8')),
  );

  it('every paid route resolves a catalog price', () => {
    const failures: string[] = [];
    for (const file of routeFiles) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(appDir, file).replace(/\/route\.ts$/, '');
      const segs = rel.split('/');
      const service = segs[0];
      const endpointPath = '/' + segs.slice(1).join('/');
      const verbs = [
        ...src.matchAll(/export\s+(?:const|async\s+function)\s+(GET|POST|PUT|DELETE|PATCH)\b/g),
      ].map((m) => m[1]);
      for (const verb of verbs.length ? verbs : ['POST']) {
        if (!getEndpointPrice(service, verb, endpointPath)) {
          failures.push(`${service} ${verb} ${endpointPath} (${relative(appDir, file)})`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('no route still hardcodes a price (the collapse holds)', () => {
    const offenders = routeFiles.filter((f) =>
      /chargeProxy\(\s*['"][\d.]+['"]/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => relative(appDir, f))).toEqual([]);
  });

  it('every catalog endpoint is backed by a route file (no orphan prices)', () => {
    const routeKeys = new Set<string>();
    for (const file of routeFiles) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(appDir, file).replace(/\/route\.ts$/, '');
      const segs = rel.split('/');
      const service = segs[0];
      const normEndpoint = normPath('/' + segs.slice(1).join('/'));
      const verbs = [
        ...src.matchAll(/export\s+(?:const|async\s+function)\s+(GET|POST|PUT|DELETE|PATCH)\b/g),
      ].map((m) => m[1]);
      for (const verb of verbs.length ? verbs : ['POST']) {
        routeKeys.add(`${service} ${verb} ${normEndpoint}`);
      }
    }
    const orphans: string[] = [];
    for (const svc of services) {
      for (const ep of svc.endpoints) {
        const key = `${svc.id} ${ep.method.toUpperCase()} ${normPath(ep.path)}`;
        if (!routeKeys.has(key)) orphans.push(key);
      }
    }
    expect(orphans).toEqual([]);
  });
});
