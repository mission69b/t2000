import { USDC } from '@suimpp/mpp/server';
import { x402Network } from '@suimpp/mpp/x402';
import { SERVICE_PAY_ADDRESS } from './constants';
import { services } from './services';
import { env } from '@/lib/env';

/**
 * /.well-known/x402 discovery manifest (SPEC_AGENT_PAYMENTS_X402 item 1.3).
 *
 * Shape mirrors the x402 Bazaar v2 paginated catalog (`items[]` of
 * `{ resource, type, x402Version, accepts, lastUpdated, metadata }`) so
 * x402scan-class indexers and Bazaar-style crawlers can ingest it directly.
 * Static requirements only — the LIVE 402 on each endpoint carries the
 * dynamic `extra.suimpp` fields (challengeId, ValidDuring nonce, epoch
 * window) a payer actually signs against.
 *
 * Each accepts entry carries BOTH `amount` (Bazaar v2 catalog field) and
 * `maxAmountRequired` (x402 v1 wire field) with the same atomic value —
 * dual-compat is free and indexers disagree on which they read.
 */

const NETWORK = x402Network(
  (env.NEXT_PUBLIC_SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet',
);

// One timestamp per server instance — the catalog only changes on deploy.
const LAST_UPDATED = new Date().toISOString();

interface ManifestAccepts {
  scheme: 'exact';
  network: string;
  amount: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
}

export interface ManifestItem {
  resource: string;
  type: 'http';
  x402Version: number;
  accepts: ManifestAccepts[];
  lastUpdated: string;
  metadata: {
    description: string;
    method: string;
    categories: string[];
    service: string;
  };
}

export interface X402Manifest {
  x402Version: number;
  items: ManifestItem[];
  pagination: { limit: number; offset: number; total: number };
}

function toAtomicUsdc(price: string): string | null {
  const parsed = Number.parseFloat(price);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(Math.round(parsed * 10 ** USDC.decimals));
}

export function generateX402Manifest(): X402Manifest {
  const baseUrl = env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://mpp.t2000.ai';
  const items: ManifestItem[] = [];

  for (const service of services) {
    for (const endpoint of service.endpoints) {
      // Dynamic-priced endpoints (price computed from the request body)
      // can't advertise a static amount — discovery skips them; their
      // live 402 still quotes the exact price per request.
      const atomic = toAtomicUsdc(endpoint.price);
      if (!atomic) continue;

      items.push({
        resource: `${baseUrl}/${service.id}${endpoint.path}`,
        type: 'http',
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: NETWORK,
            amount: atomic,
            maxAmountRequired: atomic,
            asset: USDC.type,
            payTo: SERVICE_PAY_ADDRESS,
          },
        ],
        lastUpdated: LAST_UPDATED,
        metadata: {
          description: endpoint.description,
          method: endpoint.method,
          categories: service.categories,
          service: service.name,
        },
      });
    }
  }

  return {
    x402Version: 2,
    items,
    pagination: { limit: items.length, offset: 0, total: items.length },
  };
}
