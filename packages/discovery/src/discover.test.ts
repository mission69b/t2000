import { describe, it, expect } from 'vitest';
import { extractEndpoints, validateOpenApi } from './discover.js';
import type { OpenApiDocument } from './types.js';
import { VALIDATION_CODES } from './constants.js';

function makeDoc(overrides: Partial<OpenApiDocument> = {}): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: { title: 'Test', version: '1.0.0' },
    paths: {},
    ...overrides,
  };
}

describe('extractEndpoints', () => {
  it('extracts paid endpoints with x-payment-info', () => {
    const doc = makeDoc({
      paths: {
        '/v1/chat': {
          post: {
            operationId: 'chat',
            summary: 'Chat completions',
            'x-payment-info': { pricingMode: 'fixed', price: '$0.01', protocols: ['mpp'] },
            requestBody: { required: true, content: {} },
            responses: { '200': {}, '402': {} },
          },
        },
        '/v1/models': {
          get: { summary: 'List models', responses: { '200': {} } },
        },
      },
    });

    const endpoints = extractEndpoints(doc);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe('/v1/chat');
    expect(endpoints[0].method).toBe('POST');
    expect(endpoints[0].hasRequestBody).toBe(true);
    expect(endpoints[0].has402Response).toBe(true);
  });

  it('returns empty array when no paid endpoints', () => {
    const doc = makeDoc({
      paths: {
        '/v1/health': { get: { responses: { '200': {} } } },
      },
    });
    expect(extractEndpoints(doc)).toHaveLength(0);
  });

  it('handles multiple methods on the same path', () => {
    const doc = makeDoc({
      paths: {
        '/v1/resource': {
          get: {
            'x-payment-info': { price: '$0.01', protocols: ['mpp'] },
            responses: { '402': {} },
          },
          post: {
            'x-payment-info': { price: '$0.05', protocols: ['mpp'] },
            requestBody: {},
            responses: { '402': {} },
          },
        },
      },
    });

    const endpoints = extractEndpoints(doc);
    expect(endpoints).toHaveLength(2);
  });
});

describe('validateOpenApi', () => {
  it('passes valid document', () => {
    const doc = makeDoc({
      info: { title: 'Test', version: '1.0.0', 'x-guidance': 'Use this API for...' },
    });
    const endpoints = [
      {
        path: '/v1/chat',
        method: 'POST',
        paymentInfo: { pricingMode: 'fixed', price: '$0.01', protocols: ['mpp'] },
        hasRequestBody: true,
        has402Response: true,
      },
    ];

    const issues = validateOpenApi(doc, endpoints, 'https://example.com');
    const errors = issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports error for wrong OpenAPI version', () => {
    const doc = makeDoc({ openapi: '2.0.0' });
    const issues = validateOpenApi(doc, [], 'https://example.com');
    expect(issues.find(i => i.code === VALIDATION_CODES.OPENAPI_VERSION_INVALID)).toBeDefined();
  });

  it('reports error when no paid endpoints', () => {
    const doc = makeDoc();
    const issues = validateOpenApi(doc, [], 'https://example.com');
    expect(issues.find(i => i.code === VALIDATION_CODES.NO_PAID_ENDPOINTS)).toBeDefined();
  });

  it('reports missing 402 response', () => {
    const doc = makeDoc();
    const endpoints = [
      {
        path: '/v1/chat',
        method: 'POST',
        paymentInfo: { protocols: ['mpp'], price: '$0.01' },
        hasRequestBody: true,
        has402Response: false,
      },
    ];
    const issues = validateOpenApi(doc, endpoints, 'https://example.com');
    expect(issues.find(i => i.code === VALIDATION_CODES.MISSING_402_RESPONSE)).toBeDefined();
  });

  it('warns about missing requestBody on POST', () => {
    const doc = makeDoc();
    const endpoints = [
      {
        path: '/v1/chat',
        method: 'POST',
        paymentInfo: { protocols: ['mpp'], price: '$0.01' },
        hasRequestBody: false,
        has402Response: true,
      },
    ];
    const issues = validateOpenApi(doc, endpoints, 'https://example.com');
    expect(issues.find(i => i.code === VALIDATION_CODES.MISSING_REQUEST_BODY)).toBeDefined();
  });

  it('reports when protocols does not include mpp', () => {
    const doc = makeDoc();
    const endpoints = [
      {
        path: '/v1/chat',
        method: 'POST',
        paymentInfo: { protocols: ['stripe'], price: '$0.01' },
        hasRequestBody: true,
        has402Response: true,
      },
    ];
    const issues = validateOpenApi(doc, endpoints, 'https://example.com');
    expect(issues.find(i => i.code === VALIDATION_CODES.PROTOCOL_NOT_MPP)).toBeDefined();
  });

  it('warns on high route count', () => {
    const doc = makeDoc();
    const endpoints = Array.from({ length: 90 }, (_, i) => ({
      path: `/v1/endpoint-${i}`,
      method: 'POST',
      paymentInfo: { protocols: ['mpp'], price: '$0.01' },
      hasRequestBody: true,
      has402Response: true,
    }));
    const issues = validateOpenApi(doc, endpoints, 'https://example.com');
    expect(issues.find(i => i.code === VALIDATION_CODES.HIGH_ROUTE_COUNT)).toBeDefined();
  });

  it('reports missing price for fixed pricingMode', () => {
    const doc = makeDoc();
    const endpoints = [
      {
        path: '/v1/chat',
        method: 'POST',
        paymentInfo: { pricingMode: 'fixed', protocols: ['mpp'] },
        hasRequestBody: true,
        has402Response: true,
      },
    ];
    const issues = validateOpenApi(doc, endpoints, 'https://example.com');
    expect(issues.find(i => i.code === VALIDATION_CODES.MISSING_PRICING)).toBeDefined();
  });
});
