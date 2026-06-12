import { describe, expect, it } from 'vitest';
import { USDC } from '@suimpp/mpp/server';
import { generateX402Manifest } from './x402-manifest';
import { services } from './services';

describe('generateX402Manifest — Bazaar-v2-shaped discovery catalog', () => {
  const manifest = generateX402Manifest();

  it('lists every fixed-price endpoint and skips dynamic ones', () => {
    const fixed = services.flatMap((s) =>
      s.endpoints.filter((e) => {
        const n = Number.parseFloat(e.price);
        return Number.isFinite(n) && n > 0;
      }),
    );
    expect(manifest.items).toHaveLength(fixed.length);
    expect(manifest.pagination.total).toBe(fixed.length);
    expect(manifest.x402Version).toBe(2);
    // No dynamic-priced resource leaked in with a bogus amount.
    for (const item of manifest.items) {
      expect(Number.parseInt(item.accepts[0].amount, 10)).toBeGreaterThan(0);
    }
  });

  it('emits spec-correct accepts entries (atomic amounts, dual fields)', () => {
    const serper = manifest.items.find((i) =>
      i.resource.endsWith('/serper/v1/search'),
    );
    expect(serper).toBeDefined();
    const accepts = serper?.accepts[0];
    expect(accepts?.scheme).toBe('exact');
    expect(accepts?.network).toBe('sui:mainnet');
    expect(accepts?.asset).toBe(USDC.type);
    // $0.02 at 6dp — and the Bazaar (`amount`) + wire (`maxAmountRequired`)
    // fields must agree.
    expect(accepts?.amount).toBe('20000');
    expect(accepts?.maxAmountRequired).toBe(accepts?.amount);
    expect(accepts?.payTo).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('builds absolute resource URLs + carries metadata', () => {
    for (const item of manifest.items.slice(0, 5)) {
      expect(item.resource).toMatch(/^https?:\/\//);
      expect(item.type).toBe('http');
      expect(item.metadata.description.length).toBeGreaterThan(0);
      expect(item.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
