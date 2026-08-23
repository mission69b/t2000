// x402 listing ("Sell your API") — `/v1/agent/endpoint/prepare` live-probes
// the origin (every paid route in its openapi.json must answer 402 with a
// Sui payment challenge) or one 402 URL, builds the registry `update` tx;
// the seller signs; `/submit` sponsor-co-signs. A failed probe surfaces its
// per-route findings in the error message (parity with `t2 agent sell`).

import { T2000Error } from '../errors.js';
import type { TransactionSigner } from '../signer.js';
import { runSponsoredTxGuard } from '../sponsored-guard.js';
import { apiErrorMessage, apiJson, apiRequest, invalidInput } from './http.js';
import { signPreparedTx } from './sponsored.js';
import type { EndpointIssue, EndpointListing, EndpointRoute } from './types.js';

type PrepareBody = {
  nonce?: string;
  txBytes?: string;
  probe?: EndpointListing['probe'];
  origin?: string | null;
  primary?: { path?: string; url?: string } | null;
  routes?: EndpointRoute[];
  issues?: EndpointIssue[];
};

/** The probe findings as the lines the CLI prints — origin expands carry
 *  per-route findings, single probes the flat issue list. */
export function endpointIssueLines(prep: PrepareBody): string[] {
  const lines: string[] = (prep.probe?.issues ?? []).map(
    (i) => `  ✗ ${i.message ?? i.code}`,
  );
  for (const r of prep.routes ?? []) {
    if (r.probeOk === false) {
      lines.push(`  ✗ ${r.method ?? 'POST'} ${r.path}`);
      for (const i of r.issues ?? []) {
        lines.push(`      ${i.message ?? i.code}`);
      }
    }
  }
  return lines;
}

async function setEndpoint(
  apiBase: string,
  signer: TransactionSigner,
  endpoint: string,
  primary?: string,
): Promise<EndpointListing> {
  const address = signer.getAddress();
  runSponsoredTxGuard({ base: apiBase, action: 'update' });
  const res = await apiRequest(`${apiBase}/agent/endpoint/prepare`, {
    method: 'POST',
    body: { address, endpoint, ...(primary ? { primary } : {}) },
  });
  const prep = res.json as PrepareBody & Record<string, unknown>;
  if (!res.ok) {
    const msg = apiErrorMessage(prep, res.status);
    const detail = endpointIssueLines(prep).join('\n');
    throw new T2000Error(
      'INVALID_INPUT',
      detail ? `${msg}\n${detail}` : msg,
      { status: res.status, probe: prep.probe ?? null, routes: prep.routes ?? [] },
    );
  }
  if (!(typeof prep.nonce === 'string' && typeof prep.txBytes === 'string')) {
    throw invalidInput('Failed to prepare the listing.');
  }
  const signature = await signPreparedTx(apiBase, 'update', signer, prep.txBytes);
  const sub = await apiJson(`${apiBase}/agent/endpoint/submit`, {
    method: 'POST',
    body: { nonce: prep.nonce, address, signature },
  });
  const listed = endpoint !== '';
  return {
    address,
    endpoint: listed ? (prep.primary?.url ?? endpoint) : null,
    listed,
    probe: prep.probe ?? null,
    origin: prep.origin ?? null,
    primary: prep.primary ?? null,
    routes: prep.routes ?? [],
    ...(typeof sub.digest === 'string' ? { digest: sub.digest } : {}),
  };
}

/** List an API origin (expands via {origin}/openapi.json) or one 402 URL. */
export function listEndpoint(
  apiBase: string,
  signer: TransactionSigner,
  endpoint: string,
  opts: { primary?: string } = {},
): Promise<EndpointListing> {
  const target = endpoint.trim();
  if (!target) {
    throw invalidInput('Provide your x402 endpoint URL.');
  }
  return setEndpoint(apiBase, signer, target, opts.primary);
}

/** Clear the listing (registry update with an empty endpoint). */
export function removeEndpoint(
  apiBase: string,
  signer: TransactionSigner,
): Promise<EndpointListing> {
  return setEndpoint(apiBase, signer, '');
}
