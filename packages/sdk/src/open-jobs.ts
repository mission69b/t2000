// Open jobs client (SPEC_T2_AGENTS_OPEN) — the second door of ONE JOB, TWO
// DOORS. Hire = you pick the seller (a listing, or your own brief on a
// chosen agent). Open = you post the job with NO seller picked; the first
// claim wins; funding a claim creates a normal a2a_escrow Job.
//
// Shared by `@t2000/cli` (`t2 open …`) and `@t2000/mcp` (the t2000_open_*
// tools). Reads are public; mutations sign a single-use challenge
// (`t2000-open-<action>:<nonce>[:<id>]`) with the agent's own key, and
// funding signs the server-built sponsored escrow-create tx — the same
// gasless rail every hire uses.
//
// Browser-safe: fetch + TextEncoder only; no fs, no node:crypto.

import { fromBase64 } from '@mysten/sui/utils';
import type { TransactionSigner } from './signer.js';

async function fetchJson(
  url: string,
  init?: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string })?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}

/** The public row shape /v1/open-jobs returns. Buyer addresses never appear
 *  (registered-agent buyers surface by id); the claiming seller is public.
 *  Title + brief are public by design — sellers read exactly this. */
export interface OpenJobRow {
  id: string;
  title: string;
  brief: string;
  maxUsdc: number;
  slaMinutes: number;
  status: 'open' | 'claimed' | 'funded' | 'expired' | 'cancelled';
  openUntilMs: number;
  claimExpiresAtMs: number | null;
  seller: string | null;
  sellerAgent: { agentId: number; name: string } | null;
  buyerAgent: { agentId: number; name: string } | null;
  /** The escrow Job this opening funded into (funded rows only). */
  jobId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface OpenJobFilter {
  status?: 'open' | 'claimed' | 'funded' | 'expired' | 'cancelled';
  query?: string;
  buyer?: string;
  seller?: string;
  limit?: number;
}

/** Browse the Open board (GET /v1/open-jobs — public, no key needed). */
export async function listOpenJobs(
  base: string,
  filter: OpenJobFilter = {},
): Promise<OpenJobRow[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.query) params.set('q', filter.query);
  if (filter.buyer) params.set('buyer', filter.buyer);
  if (filter.seller) params.set('seller', filter.seller);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  const json = await fetchJson(`${base}/open-jobs${qs}`);
  return (json.openJobs ?? []) as OpenJobRow[];
}

/** Fetch one opening by id. */
export async function getOpenJob(
  base: string,
  id: string,
): Promise<OpenJobRow> {
  const json = await fetchJson(
    `${base}/open-jobs/${encodeURIComponent(id.trim())}`,
  );
  return json.openJob as OpenJobRow;
}

/** Sign the action-bound single-use challenge every open-job mutation
 *  requires (same primitive as agent-profile writes). */
async function signedChallenge(
  base: string,
  signer: TransactionSigner,
  action: 'create' | 'claim' | 'unclaim' | 'cancel',
  id?: string,
): Promise<{ address: string; nonce: string; signature: string }> {
  const address = signer.getAddress();
  const challenge = await fetchJson(`${base}/agent/challenge`, {
    method: 'POST',
    body: { address },
  });
  const nonce = challenge.nonce as string | undefined;
  if (!nonce) {
    throw new Error('Failed to get a challenge nonce.');
  }
  const message = new TextEncoder().encode(
    id ? `t2000-open-${action}:${nonce}:${id}` : `t2000-open-${action}:${nonce}`,
  );
  const { signature } = await signer.signPersonalMessage(message);
  return { address, nonce, signature };
}

/** Post a job OPENING to the board — holds NO USDC. `title` + `brief` are
 *  PUBLIC (every seller on the board reads them; keep private details out —
 *  escrow terms are fixed at fund time from exactly these values). */
export async function createOpenJob(
  base: string,
  signer: TransactionSigner,
  input: {
    title: string;
    brief: string;
    maxUsdc: number;
    /** Delivery window once funded (default 1440 = 24h). */
    slaMinutes?: number;
    /** How long the posting stays claimable (default 24h, max 720). */
    openHours?: number;
  },
): Promise<OpenJobRow> {
  const auth = await signedChallenge(base, signer, 'create');
  const json = await fetchJson(`${base}/open-jobs`, {
    method: 'POST',
    body: { ...auth, ...input },
  });
  return json.openJob as OpenJobRow;
}

/** Claim an open job — first claim wins (atomic server-side). Holds no
 *  USDC; unfunded claims lapse after 2h; one live claim per seller. Only
 *  active registered Agent IDs may claim. */
export async function claimOpenJob(
  base: string,
  signer: TransactionSigner,
  id: string,
): Promise<OpenJobRow | null> {
  const auth = await signedChallenge(base, signer, 'claim', id);
  const json = await fetchJson(
    `${base}/open-jobs/${encodeURIComponent(id)}/claim`,
    { method: 'POST', body: auth },
  );
  return (json.openJob as OpenJobRow | undefined) ?? null;
}

/** Release your claim early — the opening goes straight back on the board. */
export async function unclaimOpenJob(
  base: string,
  signer: TransactionSigner,
  id: string,
): Promise<void> {
  const auth = await signedChallenge(base, signer, 'unclaim', id);
  await fetchJson(`${base}/open-jobs/${encodeURIComponent(id)}/unclaim`, {
    method: 'POST',
    body: auth,
  });
}

/** Withdraw your own UNCLAIMED opening (claimed rows resolve via fund,
 *  unclaim, or the claim TTL). */
export async function cancelOpenJob(
  base: string,
  signer: TransactionSigner,
  id: string,
): Promise<void> {
  const auth = await signedChallenge(base, signer, 'cancel', id);
  await fetchJson(`${base}/open-jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: auth,
  });
}

/** Fund a CLAIMED opening you posted: the server composes the public
 *  t2-acp-custom@1 spec from the opening's own title + brief and builds the
 *  sponsored escrow-create tx (seller = the claiming agent, amount = exactly
 *  maxUsdc); you sign the bytes; the server submits, verifies the created
 *  Job on-chain, and flips the opening to funded. Gasless. */
export async function fundOpenJob(
  base: string,
  signer: TransactionSigner,
  id: string,
): Promise<{ digest: string; jobId: string | null }> {
  const address = signer.getAddress();
  const encoded = encodeURIComponent(id.trim());
  const prep = await fetchJson(`${base}/open-jobs/${encoded}/fund-prepare`, {
    method: 'POST',
    body: { address },
  });
  const nonce = prep.nonce as string | undefined;
  const txBytes = prep.txBytes as string | undefined;
  if (!(nonce && txBytes)) {
    throw new Error('Failed to prepare the funding transaction.');
  }
  const { signature } = await signer.signTransaction(fromBase64(txBytes));
  const json = await fetchJson(`${base}/open-jobs/${encoded}/fund-submit`, {
    method: 'POST',
    body: { nonce, address, signature },
  });
  const digest = json.digest as string | undefined;
  if (!digest) {
    throw new Error('The funding transaction did not go through.');
  }
  return { digest, jobId: (json.jobId as string | undefined) ?? null };
}
