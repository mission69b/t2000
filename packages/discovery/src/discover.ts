import { VALIDATION_CODES } from './constants.js';
import type {
  OpenApiDocument,
  DiscoverResult,
  DiscoveredEndpoint,
  ValidationIssue,
} from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export async function fetchOpenApi(origin: string): Promise<OpenApiDocument> {
  const url = new URL('/openapi.json', origin).toString();
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`GET ${url} returned ${res.status}`);
  }
  return (await res.json()) as OpenApiDocument;
}

export function extractEndpoints(doc: OpenApiDocument): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || !op['x-payment-info']) continue;

      endpoints.push({
        path,
        method: method.toUpperCase(),
        operationId: op.operationId,
        summary: op.summary,
        paymentInfo: op['x-payment-info'],
        hasRequestBody: !!op.requestBody,
        has402Response: !!op.responses?.['402'],
      });
    }
  }

  return endpoints;
}

export function validateOpenApi(
  doc: OpenApiDocument,
  endpoints: DiscoveredEndpoint[],
  origin: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!doc.openapi?.startsWith('3.1')) {
    issues.push({
      code: VALIDATION_CODES.OPENAPI_VERSION_INVALID,
      severity: 'error',
      message: `Expected OpenAPI 3.1.x, got "${doc.openapi}"`,
    });
  }

  if (endpoints.length === 0) {
    issues.push({
      code: VALIDATION_CODES.NO_PAID_ENDPOINTS,
      severity: 'error',
      message: 'No operations with x-payment-info found',
    });
    return issues;
  }

  if (endpoints.length > 80) {
    issues.push({
      code: VALIDATION_CODES.HIGH_ROUTE_COUNT,
      severity: 'warning',
      message: `High route count (${endpoints.length}) may exceed agent token budgets for zero-hop injection`,
    });
  }

  if (!doc.info?.['x-guidance'] && !doc['x-service-info']) {
    issues.push({
      code: VALIDATION_CODES.MISSING_GUIDANCE,
      severity: 'warning',
      message: 'No x-guidance in info or x-service-info at root — agents may lack context',
    });
  }

  for (const ep of endpoints) {
    const loc = `${ep.method} ${ep.path}`;

    if (!ep.has402Response) {
      issues.push({
        code: VALIDATION_CODES.MISSING_402_RESPONSE,
        severity: 'error',
        message: `Missing 402 response definition`,
        path: ep.path,
        method: ep.method,
      });
    }

    if (['POST', 'PUT', 'PATCH'].includes(ep.method) && !ep.hasRequestBody) {
      issues.push({
        code: VALIDATION_CODES.MISSING_REQUEST_BODY,
        severity: 'warning',
        message: `${loc} — POST/PUT/PATCH without requestBody schema`,
        path: ep.path,
        method: ep.method,
      });
    }

    const pi = ep.paymentInfo;

    if (!pi.protocols || pi.protocols.length === 0) {
      issues.push({
        code: VALIDATION_CODES.MISSING_PROTOCOLS,
        severity: 'warning',
        message: `${loc} — x-payment-info missing "protocols" field`,
        path: ep.path,
        method: ep.method,
      });
    } else if (!pi.protocols.includes('mpp')) {
      issues.push({
        code: VALIDATION_CODES.PROTOCOL_NOT_MPP,
        severity: 'error',
        message: `${loc} — protocols ${JSON.stringify(pi.protocols)} does not include "mpp"`,
        path: ep.path,
        method: ep.method,
      });
    }

    const mode = pi.pricingMode;
    if (mode === 'fixed' && !pi.price) {
      issues.push({
        code: VALIDATION_CODES.MISSING_PRICING,
        severity: 'error',
        message: `${loc} — pricingMode "fixed" but no price specified`,
        path: ep.path,
        method: ep.method,
      });
    }

    if (pi.price && !/^\$?\d+(\.\d+)?$/.test(pi.price)) {
      issues.push({
        code: VALIDATION_CODES.INVALID_PRICE_FORMAT,
        severity: 'warning',
        message: `${loc} — price "${pi.price}" may not be parseable`,
        path: ep.path,
        method: ep.method,
      });
    }
  }

  return issues;
}

export async function discover(origin: string): Promise<DiscoverResult> {
  const normalizedOrigin = origin.startsWith('http') ? origin : `https://${origin}`;
  const specUrl = new URL('/openapi.json', normalizedOrigin).toString();

  try {
    const doc = await fetchOpenApi(normalizedOrigin);
    const endpoints = extractEndpoints(doc);
    const issues = validateOpenApi(doc, endpoints, normalizedOrigin);

    const hasErrors = issues.some(i => i.severity === 'error');

    return {
      ok: !hasErrors,
      origin: normalizedOrigin,
      specUrl,
      title: doc.info?.title ?? 'Unknown',
      version: doc.info?.version ?? '0.0.0',
      guidance: doc.info?.['x-guidance'] as string | undefined,
      endpoints,
      totalEndpoints: Object.keys(doc.paths ?? {}).length,
      paidEndpoints: endpoints.length,
      issues,
    };
  } catch (err) {
    return {
      ok: false,
      origin: normalizedOrigin,
      specUrl,
      title: 'Unknown',
      version: '0.0.0',
      endpoints: [],
      totalEndpoints: 0,
      paidEndpoints: 0,
      issues: [
        {
          code: VALIDATION_CODES.OPENAPI_FETCH_FAILED,
          severity: 'error',
          message: `Failed to fetch OpenAPI: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}
