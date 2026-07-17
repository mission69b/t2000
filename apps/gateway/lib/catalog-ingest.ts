// [SPEC_CATALOG_SELF_LISTING] Seller ingest — the machine gates.
//
// Permissionless entry, moderation-after. The submit route takes ONLY a Sui
// address and needs no signature: authorization is the seller's own on-chain
// Agent ID record (`mcpEndpoint` is set by a seller-signed sponsored tx via
// `t2 agent sell` / the console SellApiCard). Anyone can trigger a
// (re)validation of a registered seller; nobody can list an endpoint the
// seller didn't sign for, and nothing can be listed that pays anyone but the
// seller's registered wallet.
//
// Gates (fail closed, each failure names its gate):
//   1. agent-id  — address has a registry record with an https mcpEndpoint
//   2. probe     — the endpoint answers 402 with a payable Sui challenge
//                  (dual-dialect: x402 accepts[] body OR MPP header)
//   3. payto     — the challenge pays the Agent ID's own wallet
//   4. price-cap — every listed price ≤ CATALOG_MAX_PRICE_USDC
//
// Multi-endpoint enumeration comes from the seller's OpenAPI doc with
// `x-payment-info` extensions (the @suimpp/discovery standard, what JMPR
// serves). No OpenAPI → single-endpoint listing from the probe alone.
import { extractEndpoints, fetchOpenApi } from '@suimpp/discovery';
import { getAgentRecord } from '@t2000/id';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { env } from '@/lib/env';
import {
  getEntry,
  listEntries,
  putEntry,
  removeEntry,
  type DynamicCatalogEntry,
} from './catalog-store';
import { probeSellerEndpoint, type SellerProbeResult } from './seller-probe';
import { services, type Endpoint, type Service } from './services';

export interface GateResult {
  gate: 'agent-id' | 'probe' | 'payto' | 'price-cap';
  ok: boolean;
  detail: string;
}

export interface IngestResult {
  ok: boolean;
  gates: GateResult[];
  /** Set on success — the catalog row id (mpp.t2000.ai/services/<id>). */
  serviceId?: string;
  /** True when the call removed an existing entry (on-chain endpoint cleared). */
  removed?: boolean;
}

interface IngestDeps {
  getRecord: typeof getAgentRecord;
  probe: (url: string) => Promise<SellerProbeResult>;
  fetchSpec: typeof fetchOpenApi;
}

const DEFAULT_DEPS: IngestDeps = {
  getRecord: getAgentRecord,
  probe: probeSellerEndpoint,
  fetchSpec: fetchOpenApi,
};

function priceCap(): number {
  const parsed = parseFloat(env.CATALOG_MAX_PRICE_USDC ?? '5');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

/** Deterministic catalog slug from the seller origin (agent.jmpr.world →
 *  "jmpr"); suffixed with the address head when a static row owns the slug. */
export function slugForSeller(origin: string, address: string): string {
  const host = new URL(origin).hostname;
  const parts = host.split('.');
  const label = (parts.length >= 2 ? parts[parts.length - 2] : parts[0])
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  const base = label || 'seller';
  const staticIds = new Set(services.map((s) => s.id));
  return staticIds.has(base) ? `${base}-${address.slice(2, 8)}` : base;
}

/** Resolve `$ref`s in an OpenAPI schema fragment against the doc's
 *  components (depth/cycle-guarded), so the stored per-endpoint schema is
 *  self-contained. Sellers like JMPR wrap request bodies in
 *  `anyOf: [$ref, null]` — callers need the dereferenced shape. */
function derefSchema(
  node: unknown,
  doc: Record<string, unknown>,
  depth = 0,
): unknown {
  if (depth > 8 || node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => derefSchema(n, doc, depth + 1));
  const obj = node as Record<string, unknown>;
  if (typeof obj.$ref === 'string') {
    const m = obj.$ref.match(/^#\/components\/schemas\/(.+)$/);
    const target = m
      ? (doc.components as { schemas?: Record<string, unknown> } | undefined)?.schemas?.[m[1]]
      : undefined;
    return target ? derefSchema(target, doc, depth + 1) : {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = derefSchema(v, doc, depth + 1);
  return out;
}

/** The endpoint's application/json request-body schema, dereferenced. */
function requestSchemaFor(
  doc: Record<string, unknown>,
  path: string,
  method: string,
): Record<string, unknown> | undefined {
  const op = (doc.paths as Record<string, Record<string, unknown>> | undefined)?.[path]?.[
    method.toLowerCase()
  ] as { requestBody?: { content?: Record<string, { schema?: unknown }> } } | undefined;
  const schema = op?.requestBody?.content?.['application/json']?.schema;
  if (!schema || typeof schema !== 'object') return undefined;
  const resolved = derefSchema(schema, doc);
  return resolved && typeof resolved === 'object'
    ? (resolved as Record<string, unknown>)
    : undefined;
}

/** Build the endpoint rows: OpenAPI x-payment-info when the seller serves a
 *  spec, else the single probed endpoint. Endpoints without a parseable
 *  fixed price are skipped (a dynamic price can't clear the cap gate). */
async function enumerateEndpoints(
  origin: string,
  probedPath: string,
  probe: SellerProbeResult,
  fetchSpec: typeof fetchOpenApi,
): Promise<{ endpoints: Endpoint[]; name?: string; description?: string }> {
  try {
    const doc = await fetchSpec(origin);
    const rows: Endpoint[] = [];
    for (const ep of extractEndpoints(doc)) {
      // Live specs (JMPR) nest the price as { mode, currency, amount } even
      // though discovery's PaymentInfo type declares `price?: string` —
      // accept both shapes, plus the flat `amount` fallback.
      const pi = ep.paymentInfo as { price?: unknown; amount?: unknown };
      const raw =
        typeof pi.price === 'string'
          ? pi.price
          : typeof pi.price === 'object' && pi.price !== null
            ? (pi.price as { amount?: unknown }).amount
            : pi.amount;
      if (typeof raw !== 'string' || !Number.isFinite(parseFloat(raw))) continue;
      rows.push({
        method: ep.method.toUpperCase(),
        path: ep.path,
        description: ep.summary ?? ep.operationId ?? '',
        price: parseFloat(raw).toString(),
        schema: requestSchemaFor(doc as unknown as Record<string, unknown>, ep.path, ep.method),
      });
    }
    if (rows.length > 0) {
      return {
        endpoints: rows,
        name: doc.info.title,
        description: doc.info.description,
      };
    }
  } catch {
    // No/invalid OpenAPI — single-endpoint fast path below.
  }
  return {
    endpoints: [
      {
        method: 'POST',
        path: probedPath,
        description: '',
        price: probe.priceUsdc ?? '0',
      },
    ],
  };
}

export async function ingestSeller(
  rawAddress: string,
  deps: Partial<IngestDeps> = {},
): Promise<IngestResult> {
  const { getRecord, probe, fetchSpec } = { ...DEFAULT_DEPS, ...deps };
  const gates: GateResult[] = [];

  if (!isValidSuiAddress(rawAddress)) {
    return {
      ok: false,
      gates: [{ gate: 'agent-id', ok: false, detail: 'not a valid Sui address' }],
    };
  }
  const address = normalizeSuiAddress(rawAddress).toLowerCase();

  // Admin delist is terminal until cleared — resubmission doesn't wash it.
  const priorEntry = await getEntry(address);
  if (priorEntry?.state === 'delisted') {
    return {
      ok: false,
      gates: [
        {
          gate: 'agent-id',
          ok: false,
          detail: 'this seller was delisted by the operator — contact us to appeal',
        },
      ],
    };
  }

  // Gate 1 — on-chain Agent ID with a declared endpoint.
  const record = await getRecord(address).catch(() => null);
  if (!record) {
    gates.push({
      gate: 'agent-id',
      ok: false,
      detail: 'no Agent ID registered for this address — run `t2 agent register` first',
    });
    return { ok: false, gates };
  }
  const endpoint = record.mcp_endpoint ?? undefined;
  if (!endpoint) {
    // On-chain endpoint cleared → the catalog entry (if any) goes with it.
    const existing = await getEntry(address);
    if (existing) {
      await removeEntry(address);
      gates.push({
        gate: 'agent-id',
        ok: true,
        detail: 'on-chain endpoint cleared — catalog entry removed',
      });
      return { ok: true, gates, removed: true };
    }
    gates.push({
      gate: 'agent-id',
      ok: false,
      detail: 'Agent ID has no x402 endpoint on-chain — run `t2 agent sell <url>` first',
    });
    return { ok: false, gates };
  }
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== 'https:') throw new Error('not https');
  } catch {
    gates.push({ gate: 'agent-id', ok: false, detail: 'on-chain endpoint is not a valid https URL' });
    return { ok: false, gates };
  }
  gates.push({ gate: 'agent-id', ok: true, detail: `Agent ID found, endpoint ${endpoint}` });

  // Gate 2 — live 402 probe (dual-dialect).
  const probed = await probe(endpoint);
  if (!probed.ok || !probed.payTo || !probed.priceUsdc) {
    gates.push({ gate: 'probe', ok: false, detail: probed.issues.join('; ') || 'probe failed' });
    return { ok: false, gates };
  }
  gates.push({
    gate: 'probe',
    ok: true,
    detail: `402 challenge OK (${probed.dialect}), ${probed.priceUsdc} USDC per call`,
  });

  // Gate 3 — the challenge pays the seller's own registered wallet.
  if (probed.payTo !== address) {
    gates.push({
      gate: 'payto',
      ok: false,
      detail: `challenge pays ${probed.payTo}, but the Agent ID wallet is ${address} — the listing must settle to the registered wallet`,
    });
    return { ok: false, gates };
  }
  gates.push({ gate: 'payto', ok: true, detail: 'challenge pays the registered Agent ID wallet' });

  // Endpoint enumeration (OpenAPI x-payment-info when served, else the probe).
  const origin = endpointUrl.origin;
  const enumerated = await enumerateEndpoints(origin, endpointUrl.pathname, probed, fetchSpec);

  // Gate 4 — price cap over everything we're about to list.
  const cap = priceCap();
  const over = enumerated.endpoints.filter((e) => parseFloat(e.price) > cap);
  if (over.length > 0) {
    gates.push({
      gate: 'price-cap',
      ok: false,
      detail: `${over.length} endpoint(s) above the $${cap} per-call listing cap (${over[0].path} at $${over[0].price})`,
    });
    return { ok: false, gates };
  }
  gates.push({ gate: 'price-cap', ok: true, detail: `all prices ≤ $${cap}` });

  // Build + store the entry. Resubmission revalidates and overwrites.
  const id = priorEntry?.service.id ?? slugForSeller(origin, address);
  const host = endpointUrl.hostname;
  const service: Service = {
    id,
    name: enumerated.name ?? host,
    serviceUrl: origin,
    description:
      enumerated.description ??
      `Self-listed x402 seller at ${host}. Payment settles directly to the seller.`,
    chain: 'sui',
    currency: 'USDC',
    categories: ['commerce'],
    logo: '/logos/direct-seller.svg',
    endpoints: enumerated.endpoints,
    direct: true,
    dialect: probed.dialect,
    payTo: address,
  };
  const now = new Date().toISOString();
  const entry: DynamicCatalogEntry = {
    service,
    agentAddress: address,
    probeUrl: endpoint,
    state: 'live',
    failCount: 0,
    submittedAt: priorEntry?.submittedAt ?? now,
    updatedAt: now,
    lastProbeAt: now,
  };
  await putEntry(entry);
  return { ok: true, gates, serviceId: id };
}

// ---------------------------------------------------------------------------
// Daily re-probe — keeps the permissionless catalog honest. A live entry
// whose endpoint stops answering a payable 402 (or stops paying the seller's
// wallet) accumulates consecutive failures and is suspended (hidden, kept)
// at the threshold; a passing probe recovers it. Delisted entries are
// admin-owned and skipped.
// ---------------------------------------------------------------------------

const SUSPEND_AFTER_FAILURES = 3;

export interface ReprobeSummary {
  checked: number;
  passed: number;
  failed: number;
  suspended: string[];
  recovered: string[];
}

export async function reprobeAll(
  probe: (url: string) => Promise<SellerProbeResult> = probeSellerEndpoint,
): Promise<ReprobeSummary> {
  const summary: ReprobeSummary = { checked: 0, passed: 0, failed: 0, suspended: [], recovered: [] };
  const entries = await listEntries();
  for (const entry of entries) {
    if (entry.state === 'delisted') continue;
    summary.checked += 1;
    const now = new Date().toISOString();
    const probed = await probe(entry.probeUrl);
    const pass = probed.ok && probed.payTo === entry.agentAddress;
    if (pass) {
      summary.passed += 1;
      if (entry.state === 'suspended') summary.recovered.push(entry.service.id);
      await putEntry({
        ...entry,
        // Keep the dialect stamp fresh — a seller that upgrades from
        // header-only to x402 becomes browser/zkLogin-payable on the next
        // probe without resubmitting.
        service: { ...entry.service, dialect: probed.dialect },
        state: 'live',
        failCount: 0,
        updatedAt: now,
        lastProbeAt: now,
        lastProbeIssues: undefined,
      });
    } else {
      summary.failed += 1;
      const failCount = entry.failCount + 1;
      const issues = probed.ok
        ? [`challenge pays ${probed.payTo}, expected ${entry.agentAddress}`]
        : probed.issues;
      const suspend = failCount >= SUSPEND_AFTER_FAILURES && entry.state === 'live';
      if (suspend) summary.suspended.push(entry.service.id);
      await putEntry({
        ...entry,
        state: suspend ? 'suspended' : entry.state,
        failCount,
        updatedAt: now,
        lastProbeAt: now,
        lastProbeIssues: issues,
      });
    }
  }
  return summary;
}
