import { USDC } from '@suimpp/mpp/server';
import { x402Network } from '@suimpp/mpp/x402';
import { services } from './services';
import { getEndpointSchema } from './schemas';
import { TREASURY_ADDRESS } from './constants';
import { env } from '@/lib/env';

const X402_NETWORK = x402Network(
  (env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet',
);

interface OpenApiDocument {
  openapi: string;
  info: Record<string, unknown>;
  'x-discovery'?: Record<string, unknown>;
  paths: Record<string, Record<string, unknown>>;
}

function formatPrice(price: string): string {
  if (price === 'dynamic') return '0.000000';
  const num = parseFloat(price);
  return num.toFixed(6);
}

function pricingMode(price: string): string {
  return price === 'dynamic' ? 'quote' : 'fixed';
}

function toOperationId(serviceId: string, path: string): string {
  return `${serviceId}-${path
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/:/g, '')
    .replace(/\./g, '-')}`;
}

export function generateOpenApiDocument(): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const service of services) {
    for (const endpoint of service.endpoints) {
      const fullPath = `/${service.id}${endpoint.path}`;
      const operationId = toOperationId(service.id, endpoint.path);
      const schema = getEndpointSchema(service.id, endpoint.path);

      const operation: Record<string, unknown> = {
        operationId,
        summary: `${endpoint.description}`,
        tags: service.categories,
        // [1.3] `protocols` gained 'x402' with the dual-dialect gateway;
        // the `x402` block mirrors the static half of the live accepts[]
        // entry (scheme/network/asset/payTo — dynamic fields ride the 402).
        'x-payment-info': {
          pricingMode: pricingMode(endpoint.price),
          ...(endpoint.price !== 'dynamic'
            ? { price: formatPrice(endpoint.price) }
            : {}),
          protocols: ['mpp', 'x402'],
          x402: {
            scheme: 'exact',
            network: X402_NETWORK,
            asset: USDC.type,
            payTo: TREASURY_ADDRESS,
          },
        },
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          '402': { description: 'Payment Required' },
        },
      };

      if (schema) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: schema.requestBody,
            },
          },
        };
      }

      paths[fullPath] = {
        [endpoint.method.toLowerCase()]: operation,
      };
    }
  }

  const totalEndpoints = services.reduce((sum, s) => sum + s.endpoints.length, 0);

  return {
    openapi: '3.1.0',
    info: {
      title: 't2000 MPP Gateway',
      version: '1.0.0',
      description: `${services.length} MPP-enabled API services (${totalEndpoints} endpoints) payable with Sui USDC. No API keys. No accounts. Just pay per request.`,
      'x-guidance': [
        'All endpoints accept POST requests with JSON bodies.',
        'Payment is handled via MPP (Machine Payments Protocol) using Sui USDC.',
        'On first request, the gateway returns a 402 with a WWW-Authenticate header containing payment instructions.',
        'Pay the requested amount in USDC on Sui, then retry with the payment receipt.',
        'Use the @t2000/sdk or mppx SDK to handle the 402 challenge automatically.',
        `Recipient address: ${TREASURY_ADDRESS}`,
        'See /llms.txt for natural-language usage examples.',
        'See /api/services for the full service catalog as JSON.',
      ].join(' '),
    },
    'x-discovery': {
      ownershipProofs: [],
      // [1.3] Machine-readable pointer to the x402 discovery manifest.
      x402Manifest: '/.well-known/x402.json',
    },
    paths,
  };
}
