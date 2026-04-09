import { describe, it, expect } from 'vitest';
import { payApiTool, estimatePayApiCost } from '../tools/pay.js';

describe('pay_api tool — contract', () => {
  it('name is pay_api', () => {
    expect(payApiTool.name).toBe('pay_api');
  });

  it('requires user approval (confirm permission)', () => {
    expect(payApiTool.permissionLevel).toBe('confirm');
  });

  it('is a write tool', () => {
    expect(payApiTool.isReadOnly).toBe(false);
  });

  it('requires url in JSON schema', () => {
    const required = payApiTool.jsonSchema.required as string[];
    expect(required).toContain('url');
  });
});

describe('pay_api tool — safety requirements in description', () => {
  const desc = payApiTool.description;

  it('warns about non-retryable errors (doNotRetry / DO NOT call again)', () => {
    expect(desc).toMatch(/DO NOT call pay_api again|doNotRetry/);
  });

  it('mentions paymentConfirmed flag', () => {
    expect(desc).toContain('paymentConfirmed');
  });

  it('includes ISO country code guidance (GB)', () => {
    expect(desc).toContain('GB');
    expect(desc).toMatch(/ISO/i);
  });

  it('mentions return address is auto-added', () => {
    expect(desc).toMatch(/return address/i);
  });
});

describe('estimatePayApiCost', () => {
  it('returns known price for fal', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/fal/fal-ai/flux/dev')).toBe(0.03);
  });

  it('returns known price for brave', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/brave/v1/web/search')).toBe(0.005);
  });

  it('returns default 0.005 for unknown service', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/unknown/v1/thing')).toBe(0.005);
  });
});
