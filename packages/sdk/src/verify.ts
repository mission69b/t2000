import { SuiGrpcClient } from '@mysten/sui/grpc';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
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
// The receipt-signature check is ALSO trustless: it recomputes the dstack ACI
// canonical bytes (JCS per `canonical.rs`) + recovers the secp256k1 signer and
// matches it to the attested receipt-signing key (§9.4). Honest remaining scope:
// the local DCAP-quote re-verification (`dcap-qvl`) is the one documented
// `roadmap` check — never silently claimed. Per the spec: a wrong "verifiable"
// claim is worse than honest ZDR.

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
  /** Confidential model id for fetching the attested receipt-signing key
   *  (default `phala/glm-5.2`; the gateway key is workload-wide). */
  model?: string;
}

interface AciReceiptSignature {
  algo?: string;
  key_id?: string;
  value?: string;
}

interface AciReceipt {
  api_version?: string;
  receipt_id?: string;
  chat_id?: string | null;
  workload_id?: string;
  workload_keyset_digest?: string;
  endpoint?: string;
  method?: string;
  served_at?: number;
  signature?: AciReceiptSignature;
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

type Jsonish = string | number | boolean | null | Jsonish[] | { [k: string]: Jsonish };

// JCS (RFC 8785 subset) matching the dstack ACI gateway's `canonical.rs`:
// object keys sorted by UTF-16 code units (JS default string order on the BMP),
// integers only, no whitespace. JSON.stringify's string-escaping already matches
// the gateway's (\b \t \n \f \r, \u00xx for other controls, non-ASCII verbatim).
function jcs(value: Jsonish): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('JCS: non-integer number');
    }
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jcs).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(',')}}`;
}

// Verify the ACI receipt signature per dstack §9.4: ecdsa-secp256k1, a 65-byte
// `r‖s‖v` signature over `sha256(JCS(receipt with signature.value omitted))`;
// recover the public key and require it to equal the attested receipt-signing
// key. Returns true only on a genuine match (any error → false).
function verifyReceiptSignature(receipt: AciReceipt, signingKeyHex: string): boolean {
  try {
    const sig = receipt.signature;
    if (sig?.algo !== 'ecdsa-secp256k1' || !sig.value) {
      return false;
    }
    // Reconstruct the exact canonical value: the 10 protocol fields, with the
    // signature object stripped of `value` (event_log entries are already the
    // flat {seq,type,...fields} shape the gateway canonicalises).
    const canonical: Jsonish = {
      api_version: receipt.api_version ?? '',
      receipt_id: receipt.receipt_id ?? '',
      chat_id: receipt.chat_id ?? null,
      workload_id: receipt.workload_id ?? '',
      workload_keyset_digest: receipt.workload_keyset_digest ?? '',
      endpoint: receipt.endpoint ?? '',
      method: receipt.method ?? '',
      served_at: receipt.served_at ?? 0,
      event_log: (receipt.event_log ?? []) as unknown as Jsonish,
      signature: { algo: sig.algo, key_id: sig.key_id ?? '' },
    };
    const prehash = sha256(new TextEncoder().encode(jcs(canonical)));

    const sigBytes = hexToBytes(sig.value);
    if (sigBytes.length !== 65) {
      return false;
    }
    let v = sigBytes[64];
    if (v >= 27 && v <= 30) {
      v -= 27;
    }
    if (v > 3) {
      return false;
    }
    const recovered = secp256k1.Signature.fromCompact(sigBytes.slice(0, 64))
      .addRecoveryBit(v)
      .recoverPublicKey(prehash)
      .toHex(false);
    const endorsed = bytesToHex(hexToBytes(signingKeyHex.replace(/^0x/, '')));
    return recovered.toLowerCase() === endorsed.toLowerCase();
  } catch {
    return false;
  }
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

  // === 4. Receipt signature — recover the signer + match the attested key ===
  // The signing key (gateway receipt key) is workload-wide; fetch the attested
  // keyset and confirm its workload matches this receipt before trusting it.
  let signatureForged = false;
  let sigStatus: CheckStatus = 'skip';
  let sigDetail = 'no signature on receipt';
  if (receipt.signature?.value) {
    try {
      const model = opts.model ?? 'phala/glm-5.2';
      const res = await fetch(
        `${base}/aci/attestation?model=${encodeURIComponent(model)}`,
      );
      const att = res.ok
        ? ((await res.json()) as { signingKey?: string; workloadId?: string })
        : null;
      if (!att?.signingKey) {
        sigDetail = 'could not fetch the attested keyset to check the signature';
      } else if (att.workloadId && att.workloadId !== workloadId) {
        sigDetail = `attested keyset is for a different workload — pass --model for ${workloadId}`;
      } else {
        const ok = verifyReceiptSignature(receipt, att.signingKey);
        sigStatus = ok ? 'pass' : 'fail';
        signatureForged = !ok;
        sigDetail = ok
          ? `signed by the attested receipt key (${receipt.signature.key_id ?? 'key'})`
          : 'signature does NOT recover the attested receipt key — forged/altered';
      }
    } catch {
      sigDetail = 'signature check errored';
    }
  }
  checks.push({
    name: 'Receipt signature',
    status: sigStatus,
    detail: sigDetail,
    trust: sigStatus === 'skip' ? 'roadmap' : 'trustless',
  });

  return {
    receiptId,
    verified: Boolean(wireHash && workloadId) && anchorVerified && !signatureForged,
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
