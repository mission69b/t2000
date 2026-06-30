import { SuiGrpcClient } from '@mysten/sui/grpc';
import { DEFAULT_API_BASE } from './inference.js';

// Confidential receipt verifier (SPEC_CONFIDENTIAL_API v3.0, Phase D).
//
// Lets anyone CHECK — not just trust — a t2000 confidential response, by
// receipt id. The Sui-anchor check is FULLY TRUSTLESS: it reads the on-chain
// `ReceiptAnchored` event straight from a public Sui fullnode and confirms the
// committed `wire_hash` + `workload_id` match the signed receipt — t2000 can't
// forge that (a wrong/missing anchor → fails closed). The confidential-upstream
// check reads the attestation evidence embedded in the signed receipt
// (`upstream.verified`).
//
// Honest scope (v3.0): the local DCAP-quote re-verification (`dcap-qvl`) and the
// receipt-signature recompute (RedPill `dstack-kms-receipt-v1` canonicalization)
// are the documented HARDENING follow-ups — surfaced as `roadmap` checks, never
// silently claimed. Per the spec: a wrong "verifiable" claim is worse than
// honest ZDR.

const RECEIPT_ANCHORED_SUFFIX = '::anchor::ReceiptAnchored';

export type CheckStatus = 'pass' | 'fail' | 'skip';
export type TrustMode = 'trustless' | 'receipt-asserted' | 'roadmap';

export interface VerifyCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  trust: TrustMode;
}

export interface VerifyAnchor {
  txDigest: string;
  anchoredAtMs?: string;
  anchoredBy?: string;
  explorer: string;
}

export interface VerifyResult {
  receiptId: string;
  /** True iff the receipt resolved AND its on-chain Sui anchor matches. */
  verified: boolean;
  /** The trustless core: an on-chain ReceiptAnchored event matches the receipt. */
  anchorVerified: boolean;
  checks: VerifyCheck[];
  wireHash?: string;
  workloadId?: string;
  upstream?: { provider?: string; result?: string; tcbStatus?: string };
  anchor?: VerifyAnchor;
}

export interface VerifyOptions {
  /** Override the API base (default `api.t2000.ai/v1`). */
  apiBase?: string;
  /** Sui network for the trustless anchor read (default `mainnet`). */
  network?: 'mainnet' | 'testnet';
}

interface AciReceipt {
  receipt_id?: string;
  workload_id?: string;
  served_at?: number;
  signature?: string;
  event_log?: {
    type?: string;
    wire_hash?: string;
    result?: string;
    provider?: string;
    upstream_name?: string;
    tcb_status?: string;
  }[];
}

function fullnodeUrl(network: 'mainnet' | 'testnet'): string {
  return network === 'testnet'
    ? 'https://fullnode.testnet.sui.io'
    : 'https://fullnode.mainnet.sui.io';
}

/**
 * Verify a confidential response by its receipt id. Reads the signed receipt
 * (public), its on-chain Sui anchor (trustless), and reports a per-check result
 * that FAILS CLOSED on any forgery or mismatch.
 */
export async function verifyReceipt(
  receiptId: string,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const base = opts.apiBase ?? DEFAULT_API_BASE;
  const network = opts.network ?? 'mainnet';
  const checks: VerifyCheck[] = [];

  // === 1. Receipt — fetch + structural soundness (public, no key) ===
  let receipt: AciReceipt | null = null;
  try {
    const res = await fetch(`${base}/aci/receipts/${encodeURIComponent(receiptId)}`);
    if (res.ok) {
      receipt = (await res.json()) as AciReceipt;
    }
  } catch {
    // network error → receipt stays null → fails closed below
  }
  if (!receipt?.event_log) {
    checks.push({
      name: 'Receipt',
      status: 'fail',
      detail: 'receipt not found or malformed',
      trust: 'receipt-asserted',
    });
    return { receiptId, verified: false, anchorVerified: false, checks };
  }
  const wireHash = receipt.event_log.find((e) => e.type === 'response.returned')
    ?.wire_hash;
  const workloadId = receipt.workload_id;
  checks.push({
    name: 'Receipt',
    status: wireHash && workloadId ? 'pass' : 'fail',
    detail: wireHash
      ? `well-formed (${receipt.event_log.length} log entries, workload ${workloadId})`
      : 'missing response wire_hash / workload_id',
    trust: 'receipt-asserted',
  });

  // === 2. Confidential upstream — attestation evidence in the signed receipt ===
  const upstreamEv = receipt.event_log.find((e) => e.type === 'upstream.verified');
  const upstreamOk = upstreamEv?.result === 'verified';
  checks.push({
    name: 'Confidential upstream',
    status: upstreamEv ? (upstreamOk ? 'pass' : 'fail') : 'skip',
    detail: upstreamEv
      ? `${upstreamEv.provider ?? upstreamEv.upstream_name ?? 'upstream'}: ${upstreamEv.result ?? 'unknown'}${upstreamEv.tcb_status ? ` (TCB ${upstreamEv.tcb_status})` : ''}`
      : 'no upstream.verified event (routed/non-confidential?)',
    trust: 'receipt-asserted',
  });

  // === 3. Sui anchor — TRUSTLESS: read the on-chain event from a fullnode ===
  let anchorVerified = false;
  let anchor: VerifyAnchor | undefined;
  let digest: string | undefined;
  try {
    const res = await fetch(`${base}/aci/anchor/${encodeURIComponent(receiptId)}`);
    if (res.ok) {
      const j = (await res.json()) as { txDigest?: string };
      digest = j.txDigest;
    }
  } catch {
    // no anchor lookup → fails the anchor check below
  }
  if (!digest) {
    checks.push({
      name: 'Sui anchor',
      status: 'fail',
      detail: `no anchor on record — POST ${base}/aci/anchor/${receiptId} to create one`,
      trust: 'trustless',
    });
  } else {
    try {
      const client = new SuiGrpcClient({ baseUrl: fullnodeUrl(network), network });
      const tx = await client.core.getTransaction({
        digest,
        include: { events: true },
      });
      const txn = tx.$kind === 'Transaction' ? tx.Transaction : tx.FailedTransaction;
      const ev = (txn.events ?? []).find((e) =>
        e.eventType.endsWith(RECEIPT_ANCHORED_SUFFIX),
      );
      const data = (ev?.json ?? {}) as Record<string, unknown>;
      const onChainReceipt = String(data.receipt_id ?? '');
      const onChainWire = String(data.wire_hash ?? '');
      const onChainWorkload = String(data.workload_id ?? '');
      const matches =
        onChainReceipt === receiptId &&
        onChainWire === wireHash &&
        onChainWorkload === workloadId;
      anchorVerified = matches;
      anchor = {
        txDigest: digest,
        anchoredAtMs: data.anchored_at_ms ? String(data.anchored_at_ms) : undefined,
        anchoredBy: data.anchored_by ? String(data.anchored_by) : undefined,
        explorer: `https://suiscan.xyz/${network}/tx/${digest}`,
      };
      checks.push({
        name: 'Sui anchor',
        status: matches ? 'pass' : 'fail',
        detail: matches
          ? `on-chain ReceiptAnchored matches (wire_hash + workload_id), tx ${digest}`
          : `on-chain event does NOT match the receipt (wire ${onChainWire || 'absent'})`,
        trust: 'trustless',
      });
    } catch (e) {
      checks.push({
        name: 'Sui anchor',
        status: 'fail',
        detail: `could not read anchor tx ${digest}: ${e instanceof Error ? e.message : 'error'}`,
        trust: 'trustless',
      });
    }
  }

  // === 4. Receipt signature recompute — documented hardening (roadmap) ===
  checks.push({
    name: 'Receipt signature',
    status: 'skip',
    detail: receipt.signature
      ? 'present (local recompute via RedPill keyset canonicalization = roadmap)'
      : 'no signature on receipt',
    trust: 'roadmap',
  });

  return {
    receiptId,
    verified: Boolean(wireHash && workloadId) && anchorVerified,
    anchorVerified,
    checks,
    wireHash,
    workloadId,
    upstream: upstreamEv
      ? {
          provider: upstreamEv.provider ?? upstreamEv.upstream_name,
          result: upstreamEv.result,
          tcbStatus: upstreamEv.tcb_status,
        }
      : undefined,
    anchor,
  };
}
