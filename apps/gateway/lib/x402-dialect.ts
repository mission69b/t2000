import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { Currency, PaymentReport } from '@suimpp/mpp/server';
import {
  createX402Requirements,
  encodeX402Response,
  parseX402Header,
  settleX402Payment,
  X402_PAYMENT_HEADER,
  X402_PAYMENT_RESPONSE_HEADER,
  X402_VERSION,
  type X402SettleResponse,
} from '@suimpp/mpp/x402';
import { Challenge } from 'mppx';
import { getX402DigestStore } from './upstash-digest-store';

/**
 * x402 dual-dialect for the gateway (SPEC_AGENT_PAYMENTS_X402 item 1.2,
 * gateway half; scheme = SUIMPP_X402_SCHEME.md v0.3 APPROVED).
 *
 * Two seams, both mounted inside the charge wrappers in `lib/gateway.ts`
 * (the chargeProxy chokepoint — one change propagates to all endpoints):
 *
 *  1. `withX402Accepts()` — when mppx returns its legacy 402 (challenge in
 *     `WWW-Authenticate`), append the x402 envelope (`accepts[]`) to the
 *     response body. Legacy clients keep reading the header; x402 clients
 *     read the body. Same challenge identity in both dialects (the
 *     `extra.suimpp.challengeId` IS the mppx challenge id, so the
 *     `ValidDuring.nonce` binding holds across dialects).
 *
 *  2. `settleX402Request()` — when a request carries `X-PAYMENT`, verify
 *     structurally + settle (submit the client-signed gasless bytes) BEFORE
 *     the upstream is called (settle-then-serve, locked S.404). Terms come
 *     from the gateway's own catalog price + treasury — never from the
 *     client. Replay: ValidDuring nonce challenge-binding + digest-once +
 *     challenge-once (both in the shared Upstash store).
 *
 * Chain reads (chain id, epoch, settle submission) are all gRPC
 * (`SuiGrpcClient.core`) — the S.400d coupling: this path never touches
 * JSON-RPC, so the ~Jul 2026 deactivation does not threaten it.
 */

const FULLNODE_URLS: Record<string, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
};

type SuiNetwork = 'mainnet' | 'testnet';

let _client: SuiGrpcClient | undefined;
let _clientNetwork: SuiNetwork | undefined;

function getGrpcClient(network: SuiNetwork): SuiGrpcClient {
  if (!_client || _clientNetwork !== network) {
    _client = new SuiGrpcClient({
      baseUrl: FULLNODE_URLS[network] ?? FULLNODE_URLS.mainnet,
      network,
    });
    _clientNetwork = network;
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Chain-info cache. The chain identifier (genesis digest) is immutable per
// network — cached forever. The epoch advances ~daily and requirements are
// valid for [epoch, epoch+1], so a 10-minute TTL is conservatively fresh.
// ---------------------------------------------------------------------------

const EPOCH_TTL_MS = 10 * 60 * 1000;

interface ChainInfo {
  chain: string;
  epoch: string;
}

let _chainId: string | undefined;
let _epoch: { value: string; fetchedAt: number } | undefined;

export async function getChainInfo(network: SuiNetwork): Promise<ChainInfo> {
  const client = getGrpcClient(network);
  if (!_chainId) {
    const res = await client.core.getChainIdentifier();
    _chainId = res.chainIdentifier;
  }
  if (!_epoch || Date.now() - _epoch.fetchedAt > EPOCH_TTL_MS) {
    const res = await client.core.getCurrentSystemState();
    _epoch = {
      value: String(res.systemState.epoch),
      fetchedAt: Date.now(),
    };
  }
  return { chain: _chainId, epoch: _epoch.value };
}

/** Test seam — reset module caches between cases. */
export function __resetX402Caches() {
  _client = undefined;
  _clientNetwork = undefined;
  _chainId = undefined;
  _epoch = undefined;
}

/** Test seam — pre-seed chain info so tests never hit the network. */
export function __seedChainInfo(chain: string, epoch: string) {
  _chainId = chain;
  _epoch = { value: epoch, fetchedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Seam 1 — dual-dialect 402: append the x402 envelope to mppx's challenge
// ---------------------------------------------------------------------------

export interface DialectTerms {
  amount: string;
  currency: Currency;
  recipient: string;
  network: SuiNetwork;
  /** Canonical resource URL for the accepts[] entry. */
  resource: string;
}

/**
 * Wrap a legacy mppx 402 with the x402 envelope. Non-402 responses pass
 * through untouched. If anything in the x402 enrichment fails (chain info
 * unreachable, unparsable challenge), the legacy 402 is returned as-is —
 * the legacy dialect must never break because the new one had a bad day.
 */
export async function withX402Accepts(
  response: Response,
  terms: DialectTerms,
): Promise<Response> {
  if (response.status !== 402) return response;

  try {
    const wwwAuth = response.headers.get('WWW-Authenticate');
    if (!wwwAuth) return response;
    const challenge = Challenge.deserialize(wwwAuth);

    const { chain, epoch } = await getChainInfo(terms.network);
    const requirements = createX402Requirements({
      challengeId: challenge.id,
      amount: terms.amount,
      currency: terms.currency,
      recipient: terms.recipient,
      resource: terms.resource,
      network: terms.network,
      chain,
      currentEpoch: epoch,
    });

    // Preserve the legacy problem-details body fields when present;
    // x402 clients only read `x402Version` + `accepts`.
    let legacyBody: Record<string, unknown> = {};
    try {
      const text = await response.clone().text();
      if (text) legacyBody = JSON.parse(text) as Record<string, unknown>;
    } catch {
      legacyBody = {};
    }

    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json');
    return new Response(
      JSON.stringify({
        ...legacyBody,
        x402Version: X402_VERSION,
        error: (legacyBody.detail as string) ?? 'Payment required',
        accepts: [requirements],
      }),
      { status: 402, headers },
    );
  } catch (err) {
    console.error(
      '[x402] accepts[] enrichment failed; serving legacy 402:',
      err instanceof Error ? err.message : err,
    );
    return response;
  }
}

// ---------------------------------------------------------------------------
// Seam 2 — X-PAYMENT: verify + settle before the upstream runs
// ---------------------------------------------------------------------------

export interface SettleOutcome {
  settle: X402SettleResponse;
  report: PaymentReport;
}

export function hasX402Payment(req: Request): boolean {
  return req.headers.get(X402_PAYMENT_HEADER) !== null;
}

/**
 * Settle an `X-PAYMENT` request. Throws when the payment is invalid or
 * settlement fails — the caller falls back to the dual-dialect 402.
 *
 * Challenge-once: the challengeId is consumed in the shared digest store
 * (`x402c:` keyspace) so a signed payment cannot be replayed against a
 * second challenge even within the epoch window. Digest-once is enforced
 * inside `settleX402Payment` (same store, raw digest keyspace).
 */
export async function settleX402Request(
  req: Request,
  terms: Omit<DialectTerms, 'resource'>,
): Promise<SettleOutcome> {
  const headerValue = req.headers.get(X402_PAYMENT_HEADER);
  if (!headerValue) throw new Error('[x402] Missing X-PAYMENT header');

  const payment = parseX402Header(headerValue);
  // 72h-TTL store — must outlive the payment's on-chain ValidDuring window
  // (see upstash-digest-store.ts S.413 note), unlike the legacy 24h store.
  const store = getX402DigestStore();

  const challengeKey = `x402c:${payment.payload.challengeId}`;
  if (await store.has(challengeKey)) {
    throw new Error('[x402] Challenge already used');
  }

  let report: PaymentReport | undefined;
  const settle = await settleX402Payment({
    payment,
    client: getGrpcClient(terms.network),
    store,
    expected: {
      challengeId: payment.payload.challengeId,
      amount: terms.amount,
      currency: terms.currency,
      recipient: terms.recipient,
      network: terms.network,
    },
    onPayment: (r) => {
      report = r;
    },
  });

  await store.set(challengeKey);

  return {
    settle,
    report: report ?? {
      digest: settle.transaction,
      sender: settle.payer,
      recipient: terms.recipient,
      amount: terms.amount,
      currency: terms.currency.type,
      network: terms.network,
    },
  };
}

/** Attach the x402 settle receipt header to the served response. */
export function withX402Receipt(
  response: Response,
  settle: X402SettleResponse,
): Response {
  const headers = new Headers(response.headers);
  headers.set(X402_PAYMENT_RESPONSE_HEADER, encodeX402Response(settle));
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
