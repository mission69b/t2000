// [SPEC_T2_AGENTS_STORE] Seller ingest — zero-friction, account-free.
//
// The API is the account. Submission is a bare https URL (paste it on
// /sell, POST it from an agent) — no Agent ID, no sign-in, no signature.
// Everything derives from the seller's own API: `payTo` from their 402
// challenge (that wallet IS the seller's identity + entry key), endpoints /
// prices / name / description from their OpenAPI. Listing someone else's API
// harms nobody: it pays the wallet the API itself declares.
//
// Gates (fail closed, each failure names its gate):
//   1. url       — a valid https URL
//   2. probe     — the endpoint answers 402 with a payable Sui challenge
//   3. dialect   — the 402 carries an x402 accepts[] envelope (sui:mainnet
//                  exact). REQUIRED since 2026-07-17: header-only sellers
//                  verify the payer's personal-message signature themselves,
//                  which zkLogin (Passport/browser) signatures fail AFTER the
//                  on-chain payment settled — a listing only some buyers can
//                  pay breaks the catalog promise, so it isn't a listing.
//   4. price-cap — every listed price ≤ CATALOG_MAX_PRICE_USDC
//
// Job-class (escrow-intent) 402s (extra.escrow — SPEC_A2A_ESCROW slice 2)
// take two extra rules after the dialect gate: `claim` (the payTo wallet
// must carry a registered Agent ID — deliverable work needs an accountable
// counterparty) and the $50 job cap instead of the $5 call cap.
//
// (S.748's agent-id + payTo-cross-check gates are DROPPED — they defended
// against a non-attack and were the sign-up friction. Agent ID is now the
// OPTIONAL claim: registering one on the payTo wallet upgrades the store
// page; it never gates listing. The submit route's rate brake is the spam
// control.)
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
  gate: 'url' | 'agent-id' | 'probe' | 'dialect' | 'price-cap' | 'claim';
  ok: boolean;
  detail: string;
}

/** A non-blocking listing-quality finding. `prompt` is copy-paste text the
 *  seller can hand their own coding agent to fix it (the /sell page renders
 *  a copy button per warning). */
export interface SellerWarning {
  code: 'no-openapi' | 'no-description' | 'missing-schemas' | 'unpriced-endpoints';
  message: string;
  prompt: string;
}

export interface PreviewResult {
  ok: boolean;
  gates: GateResult[];
  /** The would-be catalog row (nothing written). Set when all gates pass. */
  service?: Service;
  /** The seller wallet the challenge pays — the listing identity. */
  payTo?: string;
  warnings: SellerWarning[];
}

export interface IngestResult {
  ok: boolean;
  gates: GateResult[];
  /** Set on success — the catalog row id (mpp.t2000.ai/services/<id>). */
  serviceId?: string;
  /** The seller wallet — the store page is agents.t2000.ai/<payTo>. */
  payTo?: string;
  warnings?: SellerWarning[];
  /** True when the call removed an existing entry (legacy address path,
   *  on-chain endpoint cleared). */
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

/** Job-class listing price cap — mirrors the SDK's `MAX_JOB_USDC` (the v1
 *  no-arbitration reject-split is only fair at small sizes,
 *  SPEC_A2A_ESCROW §2). Deliberately NOT the $5 instant-call cap: a job is
 *  one deliverable, not a per-call price. */
const JOB_MAX_PRICE_USDC = 50;

/** Deterministic catalog slug from the seller origin (agent.jmpr.world →
 *  "jmpr"); suffixed with the wallet head when a static row owns the slug. */
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

interface Enumerated {
  endpoints: Endpoint[];
  name?: string;
  description?: string;
  hadSpec: boolean;
  unpriced: number;
}

/** Build the endpoint rows: OpenAPI x-payment-info when the seller serves a
 *  spec, else the single probed endpoint. Endpoints without a parseable
 *  fixed price are skipped (a dynamic price can't clear the cap gate). */
async function enumerateEndpoints(
  origin: string,
  probedPath: string,
  probe: SellerProbeResult,
  fetchSpec: typeof fetchOpenApi,
): Promise<Enumerated> {
  try {
    const doc = await fetchSpec(origin);
    const rows: Endpoint[] = [];
    let unpriced = 0;
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
      if (typeof raw !== 'string' || !Number.isFinite(parseFloat(raw))) {
        unpriced += 1;
        continue;
      }
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
        hadSpec: true,
        unpriced,
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
    hadSpec: false,
    unpriced: 0,
  };
}

/** Listing-quality warnings — never blocking, each with a copy-paste prompt
 *  the seller hands their own coding agent. */
function gradeListing(origin: string, e: Enumerated): SellerWarning[] {
  const warnings: SellerWarning[] = [];
  if (!e.hadSpec) {
    warnings.push({
      code: 'no-openapi',
      message: `No OpenAPI spec found at ${origin}/openapi.json — only the probed endpoint is listed, with no name or docs.`,
      prompt:
        `My paid API at ${origin} is listed on agents.t2000.ai from its 402 challenge alone. ` +
        `Serve an OpenAPI 3.x document at ${origin}/openapi.json that describes every paid endpoint, ` +
        `with an "x-payment-info" extension on each operation carrying its fixed USDC price ` +
        `(e.g. "x-payment-info": { "price": "0.02", "currency": "USDC" }), plus a clear info.title ` +
        `and info.description. The catalog re-reads it on resubmission.`,
    });
    return warnings; // The remaining grades all read the spec.
  }
  if (!e.description) {
    warnings.push({
      code: 'no-description',
      message: 'The OpenAPI info block has no description — the listing gets a generic one.',
      prompt:
        `Add a one-paragraph info.description to the OpenAPI document at ${origin}/openapi.json ` +
        `describing what the API sells and who it's for. It becomes the listing description on agents.t2000.ai.`,
    });
  }
  const noSchema = e.endpoints.filter((ep) => !ep.schema);
  if (noSchema.length > 0) {
    warnings.push({
      code: 'missing-schemas',
      message: `${noSchema.length} endpoint(s) have no application/json request-body schema — buyers must guess field names, and a wrong guess on a direct seller is a paid error.`,
      prompt:
        `In the OpenAPI document at ${origin}/openapi.json, add a requestBody application/json schema ` +
        `(typed properties + required[] + per-field descriptions) to these operations: ` +
        `${noSchema.map((ep) => `${ep.method} ${ep.path}`).join(', ')}. ` +
        `Buyers' agents build request bodies from these schemas.`,
    });
  }
  if (e.unpriced > 0) {
    warnings.push({
      code: 'unpriced-endpoints',
      message: `${e.unpriced} endpoint(s) in the spec were skipped — their x-payment-info has no fixed parseable price.`,
      prompt:
        `In the OpenAPI document at ${origin}/openapi.json, give every paid operation an ` +
        `"x-payment-info" extension with a fixed decimal price (e.g. { "price": "0.02", "currency": "USDC" }). ` +
        `Operations without a parseable fixed price cannot be listed.`,
    });
  }
  return warnings;
}

/** Run every gate + enumeration against a seller URL. Pure read — writes
 *  nothing. The /sell page's preview endpoint and the ingest write path
 *  share this exactly (no preview/list drift by construction). */
export async function previewSeller(
  rawUrl: string,
  deps: Partial<IngestDeps> = {},
): Promise<PreviewResult> {
  const { probe, fetchSpec, getRecord } = { ...DEFAULT_DEPS, ...deps };
  const gates: GateResult[] = [];

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(rawUrl);
    if (endpointUrl.protocol !== 'https:') throw new Error('not https');
  } catch {
    return {
      ok: false,
      gates: [{ gate: 'url', ok: false, detail: 'not a valid https URL' }],
      warnings: [],
    };
  }
  // The gateway's own proxied endpoints answer a payable x402 402 too —
  // without this, anyone could re-list the whole proxied catalog as one
  // giant "direct seller" entry.
  if (endpointUrl.hostname === 'mpp.t2000.ai' || endpointUrl.hostname.endsWith('.vercel.app')) {
    return {
      ok: false,
      gates: [
        {
          gate: 'url',
          ok: false,
          detail: 'that is the gateway itself — its services are already in the catalog; submit your own origin',
        },
      ],
      warnings: [],
    };
  }
  gates.push({ gate: 'url', ok: true, detail: endpointUrl.href });

  // Gate 2 — live 402 probe (the challenge is the listing's source of truth).
  const probed = await probe(endpointUrl.href);
  if (!probed.ok || !probed.payTo || !probed.priceUsdc) {
    gates.push({ gate: 'probe', ok: false, detail: probed.issues.join('; ') || 'probe failed' });
    return { ok: false, gates, warnings: [] };
  }
  gates.push({
    gate: 'probe',
    ok: true,
    detail: `402 challenge OK (${probed.dialect}), ${probed.priceUsdc} USDC per call`,
  });

  // Gate 3 — x402 envelope required. Header-only sellers are payable by
  // keypair wallets but NOT by browser Passport (zkLogin) buyers — the seller
  // verifies the payer's personal-message signature itself, and zkLogin sigs
  // fail that check after the money already moved (JMPR, 2026-07-17). A
  // catalog entry only some buyers can pay isn't a catalog entry.
  if (probed.dialect !== 'x402') {
    gates.push({
      gate: 'dialect',
      ok: false,
      detail:
        'the 402 answers only the MPP header dialect — serve an x402 accepts[] envelope ' +
        '(scheme "exact", network "sui:mainnet") so every buyer, browser wallets included, ' +
        'can pay; see developers.t2000.ai/sell-your-api',
    });
    return { ok: false, gates, payTo: probed.payTo, warnings: [] };
  }
  gates.push({ gate: 'dialect', ok: true, detail: 'x402 accepts[] envelope served' });

  const origin = endpointUrl.origin;

  // Job-class (escrow-intent) listing — SPEC_A2A_ESCROW slice 2. The 402
  // advertises escrow terms instead of an instant challenge: settlement is
  // the buyer-funded on-chain Job object, never this rail. Two extra rules:
  //
  //   claim  — the payTo wallet MUST be claimed (Agent ID registered on it).
  //            Instant calls are settle-then-serve so an anonymous wallet
  //            risks nothing; a job commits the buyer's funds BEFORE
  //            delivery, so the counterparty must be accountable +
  //            reputation-bound. The one listing class where the optional
  //            claim is required.
  //   cap    — the $50 job cap (SDK MAX_JOB_USDC), not the $5 call cap.
  //
  // v1 job listings are single-endpoint (the probed job URL + its terms) —
  // OpenAPI enumeration can't tell which other operations are job-class,
  // and a wrong guess here misprices deliverable work.
  if (probed.escrow) {
    const record = await getRecord(probed.payTo).catch(() => null);
    if (!record) {
      gates.push({
        gate: 'claim',
        ok: false,
        detail:
          'escrow (job-class) listings require a claimed payTo wallet — register an Agent ID ' +
          'on it first (npx @t2000/cli agent register), then resubmit',
      });
      return { ok: false, gates, payTo: probed.payTo, warnings: [] };
    }
    gates.push({ gate: 'claim', ok: true, detail: 'payTo wallet has a registered Agent ID' });

    if (parseFloat(probed.priceUsdc) > JOB_MAX_PRICE_USDC) {
      gates.push({
        gate: 'price-cap',
        ok: false,
        detail: `job price $${probed.priceUsdc} is above the $${JOB_MAX_PRICE_USDC} job-value cap (v1 no-arbitration limit)`,
      });
      return { ok: false, gates, payTo: probed.payTo, warnings: [] };
    }
    gates.push({ gate: 'price-cap', ok: true, detail: `job price ≤ $${JOB_MAX_PRICE_USDC}` });

    const host = endpointUrl.hostname;
    const service: Service = {
      id: slugForSeller(origin, probed.payTo),
      name: host,
      serviceUrl: origin,
      description: `Job-class (escrow) seller at ${host}. USDC escrows in an on-chain Job object; released on delivery.`,
      chain: 'sui',
      currency: 'USDC',
      categories: ['jobs'],
      logo: '/logos/direct-seller.svg',
      endpoints: [
        {
          method: 'POST',
          path: endpointUrl.pathname,
          description: '',
          price: probed.priceUsdc,
        },
      ],
      direct: true,
      dialect: probed.dialect,
      payTo: probed.payTo,
      escrow: probed.escrow,
    };
    return { ok: true, gates, service, payTo: probed.payTo, warnings: [] };
  }

  // Endpoint enumeration (OpenAPI x-payment-info when served, else the probe).
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
    return { ok: false, gates, payTo: probed.payTo, warnings: [] };
  }
  gates.push({ gate: 'price-cap', ok: true, detail: `all prices ≤ $${cap}` });

  const payTo = probed.payTo;
  const host = endpointUrl.hostname;
  const service: Service = {
    id: slugForSeller(origin, payTo),
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
    payTo,
  };
  return { ok: true, gates, service, payTo, warnings: gradeListing(origin, enumerated) };
}

/** List (or relist) a seller from a bare URL. Account-free: the entry keys
 *  on the challenge's payTo wallet. Resubmission revalidates + overwrites
 *  (slug + submittedAt survive). */
export async function ingestSellerByUrl(
  rawUrl: string,
  deps: Partial<IngestDeps> = {},
): Promise<IngestResult> {
  const preview = await previewSeller(rawUrl, deps);

  // A previously live entry that no longer clears the dialect bar comes DOWN
  // now, not after the daily-reprobe failure window — the listing must never
  // outlive its payability. (payTo is parseable from header-only challenges.)
  if (!preview.ok) {
    const dialectFail = preview.gates.find((g) => g.gate === 'dialect' && !g.ok);
    if (dialectFail && preview.payTo) {
      const prior = await getEntry(preview.payTo);
      if (prior && prior.state === 'live') {
        const now = new Date().toISOString();
        await putEntry({
          ...prior,
          state: 'suspended',
          updatedAt: now,
          lastProbeAt: now,
          lastProbeIssues: ['x402 accepts[] envelope required for listing (header-only 402)'],
        });
      }
    }
    return { ok: false, gates: preview.gates, payTo: preview.payTo };
  }

  const payTo = preview.payTo!;
  const service = preview.service!;

  // Admin delist is terminal until cleared — resubmission doesn't wash it.
  const priorEntry = await getEntry(payTo);
  if (priorEntry?.state === 'delisted') {
    return {
      ok: false,
      gates: [
        {
          gate: 'url',
          ok: false,
          detail: 'this seller was delisted by the operator — contact us to appeal',
        },
      ],
      payTo,
    };
  }

  const id = priorEntry?.service.id ?? service.id;
  const now = new Date().toISOString();
  const entry: DynamicCatalogEntry = {
    service: { ...service, id },
    agentAddress: payTo,
    probeUrl: new URL(rawUrl).href,
    state: 'live',
    failCount: 0,
    submittedAt: priorEntry?.submittedAt ?? now,
    updatedAt: now,
    lastProbeAt: now,
  };
  await putEntry(entry);
  return { ok: true, gates: preview.gates, serviceId: id, payTo, warnings: preview.warnings };
}

/** Legacy address path (shipped CLI `t2 agent list-catalog` / MCP
 *  `t2000_agent_sell {catalog:true}` still POST an address): resolve the
 *  wallet's on-chain Agent ID endpoint, then run the URL ingest. Kept so
 *  released clients don't break; new clients submit the URL directly. */
export async function ingestSeller(
  rawAddress: string,
  deps: Partial<IngestDeps> = {},
): Promise<IngestResult> {
  const { getRecord } = { ...DEFAULT_DEPS, ...deps };

  if (!isValidSuiAddress(rawAddress)) {
    return {
      ok: false,
      gates: [{ gate: 'agent-id', ok: false, detail: 'not a valid Sui address' }],
    };
  }
  const address = normalizeSuiAddress(rawAddress).toLowerCase();

  const record = await getRecord(address).catch(() => null);
  if (!record) {
    return {
      ok: false,
      gates: [
        {
          gate: 'agent-id',
          ok: false,
          detail:
            'no Agent ID registered for this address — POST your API URL instead ({ "url": ... }), no registration needed',
        },
      ],
    };
  }
  const endpoint = record.mcp_endpoint ?? undefined;
  if (!endpoint) {
    // On-chain endpoint cleared → the catalog entry (if any) goes with it.
    // (Legacy entries key on the registered wallet, which the old gates
    // pinned equal to payTo.)
    const existing = await getEntry(address);
    if (existing) {
      await removeEntry(address);
      return {
        ok: true,
        gates: [
          { gate: 'agent-id', ok: true, detail: 'on-chain endpoint cleared — catalog entry removed' },
        ],
        removed: true,
      };
    }
    return {
      ok: false,
      gates: [
        {
          gate: 'agent-id',
          ok: false,
          detail:
            'Agent ID has no x402 endpoint on-chain — POST your API URL instead ({ "url": ... })',
        },
      ],
    };
  }
  return await ingestSellerByUrl(endpoint, deps);
}

// ---------------------------------------------------------------------------
// Daily re-probe — keeps the permissionless catalog honest. A live entry
// whose endpoint stops answering a payable x402 402 accumulates consecutive
// failures and is suspended (hidden, kept) at the threshold; a passing probe
// recovers it. A payTo CHANGE suspends immediately: the payout wallet is the
// seller's identity, and reputation must not silently transfer to a new
// wallet (resubmitting lists the new wallet as a fresh page). Delisted
// entries are admin-owned and skipped.
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
    // Same bar as ingest: payable 402 + x402 envelope, still paying the
    // wallet this listing belongs to. A seller that upgrades from
    // header-only to x402 recovers on the next probe without resubmitting;
    // one that drops x402 comes down.
    const payToDrift = probed.ok && !!probed.payTo && probed.payTo !== entry.agentAddress;
    // A listing must keep its class: a job-class (escrow) entry whose 402
    // stops advertising escrow terms — or an instant entry that starts —
    // is a different product than what buyers see. Terms VALUES may drift
    // (refreshed below); the class may not without a resubmission.
    const classDrift =
      probed.ok && Boolean(entry.service.escrow) !== Boolean(probed.escrow);
    const pass = probed.ok && !payToDrift && !classDrift && probed.dialect === 'x402';
    if (pass) {
      summary.passed += 1;
      if (entry.state === 'suspended') summary.recovered.push(entry.service.id);
      await putEntry({
        ...entry,
        service: { ...entry.service, dialect: probed.dialect, escrow: probed.escrow },
        state: 'live',
        failCount: 0,
        updatedAt: now,
        lastProbeAt: now,
        lastProbeIssues: undefined,
      });
    } else {
      summary.failed += 1;
      const failCount = entry.failCount + 1;
      const issues = !probed.ok
        ? probed.issues
        : payToDrift
          ? [
              `payout wallet changed (challenge now pays ${probed.payTo}) — resubmit the URL to relist under the new wallet`,
            ]
          : classDrift
            ? [
                entry.service.escrow
                  ? 'listing is job-class but the 402 no longer advertises escrow terms — resubmit to relist as an instant call'
                  : 'the 402 now advertises escrow terms but the listing is instant — resubmit to relist as a job',
              ]
            : ['x402 accepts[] envelope required for listing (header-only 402)'];
      // Identity change = immediate suspend; flakiness gets the 3-day window.
      const suspend =
        entry.state === 'live' && (payToDrift || failCount >= SUSPEND_AFTER_FAILURES);
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
